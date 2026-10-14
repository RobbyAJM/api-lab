use std::collections::HashMap;
use std::time::{Duration, Instant};
use futures::StreamExt;
use prost::Message;
use prost_reflect::{DescriptorPool, DynamicMessage};
use prost_types::FileDescriptorProto;
use serde::de::DeserializeSeed;
use rust_core::dto::{
    GrpcExecutionRequest, GrpcExecutionResponse, GrpcMethodSummary, GrpcReflectionRequest,
    GrpcReflectionResponse, GrpcSamplePayloadRequest, GrpcSamplePayloadResponse, GrpcServiceSummary,
};
use tonic::transport::{Channel, ClientTlsConfig, Endpoint};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

async fn create_channel_direct(addr: &str, use_tls: bool) -> Result<Channel, String> {
    let mut clean = addr.trim().to_string();
    if clean.starts_with("http://") {
        clean = clean.trim_start_matches("http://").to_string();
    } else if clean.starts_with("https://") {
        clean = clean.trim_start_matches("https://").to_string();
    }

    let endpoint_str = if use_tls {
        if clean.ends_with(":80") {
            format!("https://{}", clean.trim_end_matches(":80"))
        } else {
            format!("https://{}", clean)
        }
    } else {
        if clean.ends_with(":443") {
            format!("http://{}", clean.trim_end_matches(":443"))
        } else {
            format!("http://{}", clean)
        }
    };

    let mut endpoint = Endpoint::from_shared(endpoint_str)
        .map_err(|e| format!("invalid server address URL: {e}"))?
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT);

    if use_tls {
        let tls = ClientTlsConfig::new().with_native_roots();
        endpoint = endpoint
            .tls_config(tls)
            .map_err(|e| format!("failed to configure TLS: {e}"))?;
    }

    tokio::time::timeout(CONNECT_TIMEOUT, endpoint.connect())
        .await
        .map_err(|_| format!("connection timed out after {}s", CONNECT_TIMEOUT.as_secs()))?
        .map_err(|e| {
            let mut err_str = format!("{e:?}");
            let mut cur: Option<&(dyn std::error::Error + 'static)> = std::error::Error::source(&e);
            while let Some(source) = cur {
                err_str.push_str(&format!(" -> {source}"));
                cur = source.source();
            }
            format!("failed to connect to gRPC server: {e} ({err_str})")
        })
}

pub async fn create_channel(addr: &str, use_tls: bool) -> Result<Channel, String> {
    create_channel_smart(addr, Some(use_tls)).await.map(|(c, _)| c)
}

pub async fn create_channel_smart(addr: &str, explicit_tls: Option<bool>) -> Result<(Channel, bool), String> {
    let clean = addr.trim();
    let has_https = clean.starts_with("https://") || clean.ends_with(":443");
    let has_http = clean.starts_with("http://");

    let initial_tls = if has_https {
        true
    } else if has_http {
        false
    } else {
        let host_part = clean.split(':').next().unwrap_or(clean);
        let is_local = host_part == "localhost"
            || host_part == "127.0.0.1"
            || host_part == "0.0.0.0"
            || host_part == "::1";

        if !is_local && host_part.contains('.') {
            explicit_tls.unwrap_or(true)
        } else {
            explicit_tls.unwrap_or(false)
        }
    };

    match create_channel_direct(clean, initial_tls).await {
        Ok(c) => Ok((c, initial_tls)),
        Err(e) => {
            if !has_https && !has_http {
                let fallback_tls = !initial_tls;
                if let Ok(c) = create_channel_direct(clean, fallback_tls).await {
                    return Ok((c, fallback_tls));
                }
            }
            Err(e)
        }
    }
}

async fn try_discover_all_versions(channel: Channel) -> Result<GrpcReflectionResponse, String> {
    // Try v1 first
    match try_discover_v1(channel.clone()).await {
        Ok(res) if !res.services.is_empty() => return Ok(res),
        _ => {}
    }

    // Fallback to v1alpha
    try_discover_v1alpha(channel).await
}

// Try v1 first, fallback to v1alpha, with auto TLS negotiation for remote domains
pub async fn discover_services(
    req: GrpcReflectionRequest,
) -> GrpcReflectionResponse {
    let clean = req.server_address.trim();
    let has_https = clean.starts_with("https://") || clean.ends_with(":443");
    let has_http = clean.starts_with("http://");

    let host_part = clean.split(':').next().unwrap_or(clean);
    let is_local = host_part == "localhost"
        || host_part == "127.0.0.1"
        || host_part == "0.0.0.0"
        || host_part == "::1";

    let initial_tls = if has_https {
        true
    } else if has_http {
        false
    } else if !is_local && host_part.contains('.') {
        req.use_tls.unwrap_or(true)
    } else {
        req.use_tls.unwrap_or(false)
    };

    // 1. Try initial connection & discovery
    let first_res = match create_channel_direct(clean, initial_tls).await {
        Ok(c) => try_discover_all_versions(c).await,
        Err(e) => Err(e),
    };

    if let Ok(res) = &first_res {
        if !res.services.is_empty() {
            return res.clone();
        }
    }

    // 2. If initial attempt failed and scheme wasn't locked, try fallback
    if !has_https && !has_http {
        let fallback_tls = !initial_tls;
        if let Ok(c) = create_channel_direct(clean, fallback_tls).await {
            if let Ok(res) = try_discover_all_versions(c).await {
                if !res.services.is_empty() {
                    return res;
                }
            }
        }
    }

    let err_msg = match first_res {
        Ok(res) => res.error.unwrap_or_else(|| "No services discovered".into()),
        Err(e) => e,
    };

    GrpcReflectionResponse {
        services: Vec::new(),
        error: Some(format!(
            "Reflection discovery failed: {err_msg}. gRPC server reflection unavailable on target; reflection required."
        )),
    }
}

async fn try_discover_v1(
    channel: Channel,
) -> Result<GrpcReflectionResponse, String> {
    use tonic_reflection::pb::v1::server_reflection_client::ServerReflectionClient;
    use tonic_reflection::pb::v1::server_reflection_request::MessageRequest;
    use tonic_reflection::pb::v1::server_reflection_response::MessageResponse;
    use tonic_reflection::pb::v1::ServerReflectionRequest;

    let mut client = ServerReflectionClient::new(channel);
    let (tx, rx) = tokio::sync::mpsc::channel(20);
    let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);

    let list_req = ServerReflectionRequest {
        host: String::new(),
        message_request: Some(MessageRequest::ListServices(String::new())),
    };

    tx.send(list_req).await.map_err(|e| e.to_string())?;

    let mut response_stream = tokio::time::timeout(REQUEST_TIMEOUT, client.server_reflection_info(outbound))
        .await
        .map_err(|_| "v1 reflection request timed out".to_string())?
        .map_err(|e| e.to_string())?
        .into_inner();

    let first_res = tokio::time::timeout(REQUEST_TIMEOUT, response_stream.next())
        .await
        .map_err(|_| "v1 stream response timed out".to_string())?
        .ok_or_else(|| "empty stream".to_string())?
        .map_err(|e| e.to_string())?;

    let service_names = match first_res.message_response {
        Some(MessageResponse::ListServicesResponse(ls)) => {
            ls.service.into_iter().map(|s| s.name).collect::<Vec<_>>()
        }
        _ => return Err("unexpected v1 response type".into()),
    };

    let target_services: Vec<String> = service_names
        .into_iter()
        .filter(|s| !s.starts_with("grpc.reflection"))
        .collect();

    let mut raw_protos: HashMap<String, FileDescriptorProto> = HashMap::new();

    for service_name in &target_services {
        let sym_req = ServerReflectionRequest {
            host: String::new(),
            message_request: Some(MessageRequest::FileContainingSymbol(service_name.clone())),
        };

        if tx.send(sym_req).await.is_ok() {
            if let Ok(Some(Ok(res))) = tokio::time::timeout(REQUEST_TIMEOUT, response_stream.next()).await {
                if let Some(MessageResponse::FileDescriptorResponse(fdr)) = res.message_response {
                    for fd_bytes in fdr.file_descriptor_proto {
                        if let Ok(proto) = FileDescriptorProto::decode(&fd_bytes[..]) {
                            if let Some(ref name) = proto.name {
                                raw_protos.insert(name.clone(), proto);
                            }
                        }
                    }
                }
            }
        }
    }

    let summaries = extract_summaries(&raw_protos);
    if summaries.is_empty() {
        return Err("No user services discovered via v1 reflection".into());
    }

    Ok(GrpcReflectionResponse {
        services: summaries,
        error: None,
    })
}

async fn try_discover_v1alpha(
    channel: Channel,
) -> Result<GrpcReflectionResponse, String> {
    use tonic_reflection::pb::v1alpha::server_reflection_client::ServerReflectionClient;
    use tonic_reflection::pb::v1alpha::server_reflection_request::MessageRequest;
    use tonic_reflection::pb::v1alpha::server_reflection_response::MessageResponse;
    use tonic_reflection::pb::v1alpha::ServerReflectionRequest;

    let mut client = ServerReflectionClient::new(channel);
    let (tx, rx) = tokio::sync::mpsc::channel(20);
    let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);

    let list_req = ServerReflectionRequest {
        host: String::new(),
        message_request: Some(MessageRequest::ListServices(String::new())),
    };

    tx.send(list_req).await.map_err(|e| e.to_string())?;

    let mut response_stream = tokio::time::timeout(REQUEST_TIMEOUT, client.server_reflection_info(outbound))
        .await
        .map_err(|_| "v1alpha reflection request timed out".to_string())?
        .map_err(|e| e.to_string())?
        .into_inner();

    let first_res = tokio::time::timeout(REQUEST_TIMEOUT, response_stream.next())
        .await
        .map_err(|_| "v1alpha stream response timed out".to_string())?
        .ok_or_else(|| "empty stream".to_string())?
        .map_err(|e| e.to_string())?;

    let service_names = match first_res.message_response {
        Some(MessageResponse::ListServicesResponse(ls)) => {
            ls.service.into_iter().map(|s| s.name).collect::<Vec<_>>()
        }
        _ => return Err("unexpected v1alpha response type".into()),
    };

    let target_services: Vec<String> = service_names
        .into_iter()
        .filter(|s| !s.starts_with("grpc.reflection"))
        .collect();

    let mut raw_protos: HashMap<String, FileDescriptorProto> = HashMap::new();

    for service_name in &target_services {
        let sym_req = ServerReflectionRequest {
            host: String::new(),
            message_request: Some(MessageRequest::FileContainingSymbol(service_name.clone())),
        };

        if tx.send(sym_req).await.is_ok() {
            if let Ok(Some(Ok(res))) = tokio::time::timeout(REQUEST_TIMEOUT, response_stream.next()).await {
                if let Some(MessageResponse::FileDescriptorResponse(fdr)) = res.message_response {
                    for fd_bytes in fdr.file_descriptor_proto {
                        if let Ok(proto) = FileDescriptorProto::decode(&fd_bytes[..]) {
                            if let Some(ref name) = proto.name {
                                raw_protos.insert(name.clone(), proto);
                            }
                        }
                    }
                }
            }
        }
    }

    let summaries = extract_summaries(&raw_protos);
    if summaries.is_empty() {
        return Ok(GrpcReflectionResponse {
            services: Vec::new(),
            error: Some("No user services discovered via reflection. gRPC server reflection unavailable on target; reflection required.".into()),
        });
    }

    Ok(GrpcReflectionResponse {
        services: summaries,
        error: None,
    })
}

fn extract_summaries(raw_protos: &HashMap<String, FileDescriptorProto>) -> Vec<GrpcServiceSummary> {
    let mut summaries = Vec::new();
    for proto in raw_protos.values() {
        let pkg = proto.package.as_deref().unwrap_or("");
        for svc in &proto.service {
            let svc_name = if pkg.is_empty() {
                svc.name.clone().unwrap_or_default()
            } else {
                format!("{}.{}", pkg, svc.name.as_deref().unwrap_or_default())
            };

            let methods = svc
                .method
                .iter()
                .map(|m| {
                    let in_type = m.input_type.as_deref().unwrap_or("").trim_start_matches('.');
                    let out_type = m.output_type.as_deref().unwrap_or("").trim_start_matches('.');
                    let client_streaming = m.client_streaming.unwrap_or(false);
                    let server_streaming = m.server_streaming.unwrap_or(false);
                    let stream_type = if client_streaming && server_streaming {
                        "bidi_stream".to_string()
                    } else if client_streaming || server_streaming {
                        "omni_stream".to_string()
                    } else {
                        "unary".to_string()
                    };

                    GrpcMethodSummary {
                        name: m.name.clone().unwrap_or_default(),
                        input_type: in_type.to_string(),
                        output_type: out_type.to_string(),
                        is_client_streaming: client_streaming,
                        is_server_streaming: server_streaming,
                        stream_type,
                    }
                })
                .collect();

            summaries.push(GrpcServiceSummary {
                name: svc_name,
                methods,
            });
        }
    }
    summaries.sort_by(|a, b| a.name.cmp(&b.name));
    summaries
}

pub async fn execute_unary(req: GrpcExecutionRequest) -> GrpcExecutionResponse {
    let start = Instant::now();
    let use_tls = req.use_tls.unwrap_or(false);

    let channel = match create_channel(&req.server_address, use_tls).await {
        Ok(c) => c,
        Err(e) => {
            return GrpcExecutionResponse {
                status_code: 14, // UNAVAILABLE
                status_message: format!("Connection failed: {e}"),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Connection error: {e}. gRPC server reflection unavailable on target; reflection required.")),
            };
        }
    };

    // Query reflection to obtain schema
    let pool = match fetch_pool_for_symbol(channel.clone(), &req.service).await {
        Ok(p) => p,
        Err(e) => {
            return GrpcExecutionResponse {
                status_code: 14,
                status_message: "Reflection error".into(),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Failed to retrieve service reflection: {e}")),
            };
        }
    };

    let service_desc = match pool.get_service_by_name(&req.service) {
        Some(s) => s,
        None => {
            return GrpcExecutionResponse {
                status_code: 12, // UNIMPLEMENTED
                status_message: format!("Service '{}' not found in server reflection", req.service),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Service '{}' not found. gRPC server reflection unavailable on target; reflection required.", req.service)),
            };
        }
    };

    let method_desc = match service_desc.methods().find(|m| m.name() == req.method) {
        Some(m) => m,
        None => {
            return GrpcExecutionResponse {
                status_code: 12,
                status_message: format!("Method '{}' not found on service '{}'", req.method, req.service),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Method '{}' not found", req.method)),
            };
        }
    };

    let input_desc = method_desc.input();
    let dynamic_input: DynamicMessage = match input_desc.deserialize(req.payload) {
        Ok(msg) => msg,
        Err(e) => {
            return GrpcExecutionResponse {
                status_code: 3,
                status_message: format!("Invalid JSON: {e}"),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Failed to parse payload: {e}")),
            };
        }
    };

    let mut buf = Vec::new();
    if let Err(e) = prost::Message::encode(&dynamic_input, &mut buf) {
        return GrpcExecutionResponse {
            status_code: 3,
            status_message: format!("Encoding error: {e}"),
            response_time_ms: start.elapsed().as_millis() as u64,
            response_size_bytes: 0,
            metadata: HashMap::new(),
            body: serde_json::Value::Null,
            error: Some(format!("Failed to encode dynamic protobuf message: {e}")),
        };
    }

    // Call unary RPC via tonic Grpc client
    let mut grpc_client = tonic::client::Grpc::new(channel);
    let path = format!("/{}/{}", req.service, req.method);
    let http_path = match http::uri::PathAndQuery::from_maybe_shared(path.clone()) {
        Ok(p) => p,
        Err(e) => {
            return GrpcExecutionResponse {
                status_code: 3,
                status_message: format!("Invalid RPC path: {e}"),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Invalid path: {e}")),
            };
        }
    };

    let mut tonic_req = tonic::Request::new(buf);
    for (k, v) in req.metadata {
        let key_lower = k.to_lowercase();
        if let Ok(key) = tonic::metadata::MetadataKey::from_bytes(key_lower.as_bytes()) {
            if let Ok(val) = tonic::metadata::MetadataValue::try_from(v.trim()) {
                tonic_req.metadata_mut().insert(key, val);
            }
        }
    }

    let timeout_ms = req.timeout_ms.unwrap_or(30_000);
    let codec = DynamicRawCodec;

    if let Err(e) = grpc_client.ready().await {
        return GrpcExecutionResponse {
            status_code: 14,
            status_message: format!("Channel not ready: {e}"),
            response_time_ms: start.elapsed().as_millis() as u64,
            response_size_bytes: 0,
            metadata: HashMap::new(),
            body: serde_json::Value::Null,
            error: Some(format!("Failed to prepare gRPC channel: {e}")),
        };
    }

    let res = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        grpc_client.unary(tonic_req, http_path, codec),
    )
    .await;

    let elapsed = start.elapsed().as_millis() as u64;

    match res {
        Ok(Ok(response)) => {
            let mut meta_map = HashMap::new();
            for kv in response.metadata().iter() {
                if let tonic::metadata::KeyAndValueRef::Ascii(k, v) = kv {
                    if let Ok(str_val) = v.to_str() {
                        meta_map.insert(k.as_str().to_string(), str_val.to_string());
                    }
                }
            }

            let resp_bytes = response.into_inner();
            let size = resp_bytes.len();
            let output_desc = method_desc.output();

            let dynamic_output = match DynamicMessage::decode(output_desc, &resp_bytes[..]) {
                Ok(msg) => msg,
                Err(e) => {
                    return GrpcExecutionResponse {
                        status_code: 2, // UNKNOWN
                        status_message: format!("Failed to decode output message: {e}"),
                        response_time_ms: elapsed,
                        response_size_bytes: size,
                        metadata: meta_map,
                        body: serde_json::Value::Null,
                        error: Some(format!("Failed to decode response: {e}")),
                    };
                }
            };

            let body_val = match serde_json::to_value(&dynamic_output) {
                Ok(v) => v,
                Err(e) => serde_json::json!({ "error": format!("Serialization error: {e}") }),
            };

            GrpcExecutionResponse {
                status_code: 0, // OK
                status_message: "OK".into(),
                response_time_ms: elapsed,
                response_size_bytes: size,
                metadata: meta_map,
                body: body_val,
                error: None,
            }
        }
        Ok(Err(status)) => {
            let mut meta_map = HashMap::new();
            for kv in status.metadata().iter() {
                if let tonic::metadata::KeyAndValueRef::Ascii(k, v) = kv {
                    if let Ok(str_val) = v.to_str() {
                        meta_map.insert(k.as_str().to_string(), str_val.to_string());
                    }
                }
            }

            GrpcExecutionResponse {
                status_code: status.code() as i32,
                status_message: status.message().to_string(),
                response_time_ms: elapsed,
                response_size_bytes: 0,
                metadata: meta_map,
                body: serde_json::Value::Null,
                error: Some(format!("gRPC status [{}]: {}", status.code(), status.message())),
            }
        }
        Err(_) => GrpcExecutionResponse {
            status_code: 4, // DEADLINE_EXCEEDED
            status_message: "Request deadline exceeded".into(),
            response_time_ms: elapsed,
            response_size_bytes: 0,
            metadata: HashMap::new(),
            body: serde_json::Value::Null,
            error: Some("gRPC request timed out".into()),
        },
    }
}

pub async fn execute_streaming<F>(
    req: GrpcExecutionRequest,
    mut on_message: F,
    mut cancel_rx: tokio::sync::oneshot::Receiver<()>,
) -> GrpcExecutionResponse
where
    F: FnMut(serde_json::Value) + Send + 'static,
{
    let start = Instant::now();
    let use_tls = req.use_tls.unwrap_or(false);

    let channel = match create_channel(&req.server_address, use_tls).await {
        Ok(c) => c,
        Err(e) => {
            return GrpcExecutionResponse {
                status_code: 14,
                status_message: format!("Connection failed: {e}"),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Connection error: {e}")),
            };
        }
    };

    let pool = match fetch_pool_for_symbol(channel.clone(), &req.service).await {
        Ok(p) => p,
        Err(e) => {
            return GrpcExecutionResponse {
                status_code: 14,
                status_message: "Reflection error".into(),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Failed to retrieve service reflection: {e}")),
            };
        }
    };

    let service_desc = match pool.get_service_by_name(&req.service) {
        Some(s) => s,
        None => {
            return GrpcExecutionResponse {
                status_code: 12,
                status_message: format!("Service '{}' not found", req.service),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Service '{}' not found in server reflection", req.service)),
            };
        }
    };

    let method_desc = match service_desc.methods().find(|m| m.name() == req.method) {
        Some(m) => m,
        None => {
            return GrpcExecutionResponse {
                status_code: 12,
                status_message: format!("Method '{}' not found", req.method),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Method '{}' not found", req.method)),
            };
        }
    };

    let input_desc = method_desc.input();
    let dynamic_input: DynamicMessage = match input_desc.deserialize(req.payload) {
        Ok(msg) => msg,
        Err(e) => {
            return GrpcExecutionResponse {
                status_code: 3,
                status_message: format!("Invalid JSON: {e}"),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Failed to parse payload: {e}")),
            };
        }
    };

    let mut buf = Vec::new();
    if let Err(e) = prost::Message::encode(&dynamic_input, &mut buf) {
        return GrpcExecutionResponse {
            status_code: 3,
            status_message: format!("Encoding error: {e}"),
            response_time_ms: start.elapsed().as_millis() as u64,
            response_size_bytes: 0,
            metadata: HashMap::new(),
            body: serde_json::Value::Null,
            error: Some(format!("Failed to encode dynamic protobuf message: {e}")),
        };
    }

    let mut grpc_client = tonic::client::Grpc::new(channel);
    let path = format!("/{}/{}", req.service, req.method);
    let http_path = match http::uri::PathAndQuery::from_maybe_shared(path.clone()) {
        Ok(p) => p,
        Err(e) => {
            return GrpcExecutionResponse {
                status_code: 3,
                status_message: format!("Invalid RPC path: {e}"),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Invalid path: {e}")),
            };
        }
    };

    let codec = DynamicRawCodec;
    if let Err(e) = grpc_client.ready().await {
        return GrpcExecutionResponse {
            status_code: 14,
            status_message: format!("Channel not ready: {e}"),
            response_time_ms: start.elapsed().as_millis() as u64,
            response_size_bytes: 0,
            metadata: HashMap::new(),
            body: serde_json::Value::Null,
            error: Some(format!("Failed to prepare gRPC channel: {e}")),
        };
    }

    let output_desc = method_desc.output();

    // Call streaming based on whether method is client-streaming (bidi) or server-streaming (omni)
    let is_client_streaming = method_desc.is_client_streaming();

    let (keepalive_tx, stream_res) = if is_client_streaming {
        let (tx, rx) = tokio::sync::mpsc::channel(10);
        let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);
        let _ = tx.send(buf).await;
        let mut tonic_req = tonic::Request::new(outbound);
        for (k, v) in req.metadata {
            let key_lower = k.to_lowercase();
            if let Ok(key) = tonic::metadata::MetadataKey::from_bytes(key_lower.as_bytes()) {
                if let Ok(val) = tonic::metadata::MetadataValue::try_from(v.trim()) {
                    tonic_req.metadata_mut().insert(key, val);
                }
            }
        }
        let res = grpc_client.streaming(tonic_req, http_path, codec).await;
        (Some(tx), res)
    } else {
        let mut tonic_req = tonic::Request::new(buf);
        for (k, v) in req.metadata {
            let key_lower = k.to_lowercase();
            if let Ok(key) = tonic::metadata::MetadataKey::from_bytes(key_lower.as_bytes()) {
                if let Ok(val) = tonic::metadata::MetadataValue::try_from(v.trim()) {
                    tonic_req.metadata_mut().insert(key, val);
                }
            }
        }
        let res = grpc_client.server_streaming(tonic_req, http_path, codec).await;
        (None, res)
    };

    match stream_res {
        Ok(response) => {
            let _keepalive = keepalive_tx;
            let mut meta_map = HashMap::new();
            for kv in response.metadata().iter() {
                if let tonic::metadata::KeyAndValueRef::Ascii(k, v) = kv {
                    if let Ok(str_val) = v.to_str() {
                        meta_map.insert(k.as_str().to_string(), str_val.to_string());
                    }
                }
            }

            let mut inbound_stream = response.into_inner();
            let mut received_messages = Vec::new();
            let mut total_bytes = 0;

            loop {
                tokio::select! {
                    _ = &mut cancel_rx => {
                        break;
                    }
                    next_item = inbound_stream.next() => {
                        match next_item {
                            Some(Ok(bytes)) => {
                                total_bytes += bytes.len();
                                if let Ok(dynamic_output) = DynamicMessage::decode(output_desc.clone(), &bytes[..]) {
                                    if let Ok(json_val) = serde_json::to_value(&dynamic_output) {
                                        on_message(json_val.clone());
                                        received_messages.push(json_val);
                                    }
                                }
                            }
                            Some(Err(_)) => {
                                break;
                            }
                            None => {
                                break;
                            }
                        }
                    }
                }
            }

            let elapsed = start.elapsed().as_millis() as u64;
            GrpcExecutionResponse {
                status_code: 0,
                status_message: "Stream completed".into(),
                response_time_ms: elapsed,
                response_size_bytes: total_bytes,
                metadata: meta_map,
                body: serde_json::Value::Array(received_messages),
                error: None,
            }
        }
        Err(status) => {
            let elapsed = start.elapsed().as_millis() as u64;
            GrpcExecutionResponse {
                status_code: status.code() as i32,
                status_message: status.message().to_string(),
                response_time_ms: elapsed,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(format!("Streaming RPC error: {}", status.message())),
            }
        }
    }
}

async fn fetch_pool_for_symbol(channel: Channel, symbol: &str) -> Result<DescriptorPool, String> {
    // Try v1 first
    if let Ok(pool) = fetch_pool_v1(channel.clone(), symbol).await {
        return Ok(pool);
    }
    // Fallback v1alpha
    fetch_pool_v1alpha(channel, symbol).await
}

async fn fetch_pool_v1(channel: Channel, symbol: &str) -> Result<DescriptorPool, String> {
    use tonic_reflection::pb::v1::server_reflection_client::ServerReflectionClient;
    use tonic_reflection::pb::v1::server_reflection_request::MessageRequest;
    use tonic_reflection::pb::v1::server_reflection_response::MessageResponse;
    use tonic_reflection::pb::v1::ServerReflectionRequest;

    let mut client = ServerReflectionClient::new(channel);
    let (tx, rx) = tokio::sync::mpsc::channel(10);
    let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);

    let sym_req = ServerReflectionRequest {
        host: String::new(),
        message_request: Some(MessageRequest::FileContainingSymbol(symbol.to_string())),
    };

    tx.send(sym_req).await.map_err(|e| e.to_string())?;

    let mut response_stream = tokio::time::timeout(REQUEST_TIMEOUT, client.server_reflection_info(outbound))
        .await
        .map_err(|_| "v1 timeout".to_string())?
        .map_err(|e| e.to_string())?
        .into_inner();

    let mut pool = DescriptorPool::new();
    if let Ok(Some(Ok(res))) = tokio::time::timeout(REQUEST_TIMEOUT, response_stream.next()).await {
        if let Some(MessageResponse::FileDescriptorResponse(fdr)) = res.message_response {
            let mut protos = Vec::new();
            for fd_bytes in fdr.file_descriptor_proto {
                if let Ok(proto) = FileDescriptorProto::decode(&fd_bytes[..]) {
                    protos.push(proto);
                }
            }
            let _ = pool.add_file_descriptor_protos(protos);
        }
    }
    Ok(pool)
}

async fn fetch_pool_v1alpha(channel: Channel, symbol: &str) -> Result<DescriptorPool, String> {
    use tonic_reflection::pb::v1alpha::server_reflection_client::ServerReflectionClient;
    use tonic_reflection::pb::v1alpha::server_reflection_request::MessageRequest;
    use tonic_reflection::pb::v1alpha::server_reflection_response::MessageResponse;
    use tonic_reflection::pb::v1alpha::ServerReflectionRequest;

    let mut client = ServerReflectionClient::new(channel);
    let (tx, rx) = tokio::sync::mpsc::channel(10);
    let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);

    let sym_req = ServerReflectionRequest {
        host: String::new(),
        message_request: Some(MessageRequest::FileContainingSymbol(symbol.to_string())),
    };

    tx.send(sym_req).await.map_err(|e| e.to_string())?;

    let mut response_stream = tokio::time::timeout(REQUEST_TIMEOUT, client.server_reflection_info(outbound))
        .await
        .map_err(|_| "v1alpha timeout".to_string())?
        .map_err(|e| e.to_string())?
        .into_inner();

    let mut pool = DescriptorPool::new();
    if let Ok(Some(Ok(res))) = tokio::time::timeout(REQUEST_TIMEOUT, response_stream.next()).await {
        if let Some(MessageResponse::FileDescriptorResponse(fdr)) = res.message_response {
            let mut protos = Vec::new();
            for fd_bytes in fdr.file_descriptor_proto {
                if let Ok(proto) = FileDescriptorProto::decode(&fd_bytes[..]) {
                    protos.push(proto);
                }
            }
            let _ = pool.add_file_descriptor_protos(protos);
        }
    }
    Ok(pool)
}

// Minimal dynamic byte codec for raw bytes over tonic
#[derive(Clone, Default)]
struct DynamicRawCodec;

impl tonic::codec::Codec for DynamicRawCodec {
    type Encode = Vec<u8>;
    type Decode = Vec<u8>;
    type Encoder = DynamicRawEncoder;
    type Decoder = DynamicRawDecoder;

    fn encoder(&mut self) -> Self::Encoder {
        DynamicRawEncoder
    }

    fn decoder(&mut self) -> Self::Decoder {
        DynamicRawDecoder
    }
}

struct DynamicRawEncoder;

impl tonic::codec::Encoder for DynamicRawEncoder {
    type Item = Vec<u8>;
    type Error = tonic::Status;

    fn encode(&mut self, item: Self::Item, dst: &mut tonic::codec::EncodeBuf<'_>) -> Result<(), Self::Error> {
        use prost::bytes::BufMut;
        dst.put_slice(&item);
        Ok(())
    }
}

struct DynamicRawDecoder;

impl tonic::codec::Decoder for DynamicRawDecoder {
    type Item = Vec<u8>;
    type Error = tonic::Status;

    fn decode(&mut self, src: &mut tonic::codec::DecodeBuf<'_>) -> Result<Option<Self::Item>, Self::Error> {
        use prost::bytes::Buf;
        if !src.has_remaining() {
            return Ok(None);
        }
        let len = src.remaining();
        let mut bytes = vec![0u8; len];
        src.copy_to_slice(&mut bytes);
        Ok(Some(bytes))
    }
}

pub async fn generate_sample_for_method(
    req: GrpcSamplePayloadRequest,
) -> GrpcSamplePayloadResponse {
    let use_tls = req.use_tls.unwrap_or(false);
    let channel = match create_channel(&req.server_address, use_tls).await {
        Ok(c) => c,
        Err(e) => {
            return GrpcSamplePayloadResponse {
                payload: serde_json::Value::Null,
                error: Some(format!("Connection error: {e}")),
            };
        }
    };

    let pool = match fetch_pool_for_symbol(channel, &req.service).await {
        Ok(p) => p,
        Err(e) => {
            return GrpcSamplePayloadResponse {
                payload: serde_json::Value::Null,
                error: Some(format!("Reflection error: {e}")),
            };
        }
    };

    let service_desc = match pool.get_service_by_name(&req.service) {
        Some(s) => s,
        None => {
            return GrpcSamplePayloadResponse {
                payload: serde_json::Value::Null,
                error: Some(format!("Service '{}' not found in server reflection", req.service)),
            };
        }
    };

    let method_desc = match service_desc.methods().find(|m| m.name() == req.method) {
        Some(m) => m,
        None => {
            return GrpcSamplePayloadResponse {
                payload: serde_json::Value::Null,
                error: Some(format!("Method '{}' not found on service '{}'", req.method, req.service)),
            };
        }
    };

    let input_desc = method_desc.input();
    let payload = crate::payload_generator::generate_sample_payload(&input_desc);

    GrpcSamplePayloadResponse {
        payload,
        error: None,
    }
}
