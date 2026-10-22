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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetAddressInfo {
    pub host_port: String,
    pub use_tls: bool,
    pub scheme_locked: bool,
}

pub fn parse_target_address(addr: &str, explicit_tls: Option<bool>) -> TargetAddressInfo {
    let raw = addr.trim();
    let (clean, scheme_locked, scheme_tls) = if let Some(rest) = raw.strip_prefix("grpcs://") {
        (rest, true, Some(true))
    } else if let Some(rest) = raw.strip_prefix("https://") {
        (rest, true, Some(true))
    } else if let Some(rest) = raw.strip_prefix("grpc://") {
        (rest, false, None)
    } else if let Some(rest) = raw.strip_prefix("http://") {
        (rest, true, Some(false))
    } else {
        (raw, false, None)
    };

    let host_port = clean.trim_end_matches('/').to_string();
    let host_part = host_port.split(':').next().unwrap_or(&host_port);
    let is_local = host_part == "localhost"
        || host_part == "127.0.0.1"
        || host_part == "0.0.0.0"
        || host_part == "::1";

    let use_tls = if let Some(tls) = explicit_tls {
        tls
    } else if let Some(tls) = scheme_tls {
        tls
    } else if host_port.ends_with(":443") {
        true
    } else if !is_local && host_part.contains('.') {
        true
    } else {
        false
    };

    TargetAddressInfo {
        host_port,
        use_tls,
        scheme_locked,
    }
}

async fn create_channel_direct(addr: &str, use_tls: bool) -> Result<Channel, String> {
    let mut clean = addr.trim().to_string();
    if let Some(rest) = clean.strip_prefix("grpcs://") {
        clean = rest.to_string();
    } else if let Some(rest) = clean.strip_prefix("https://") {
        clean = rest.to_string();
    } else if let Some(rest) = clean.strip_prefix("grpc://") {
        clean = rest.to_string();
    } else if let Some(rest) = clean.strip_prefix("http://") {
        clean = rest.to_string();
    }
    clean = clean.trim_end_matches('/').to_string();

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
    let target = parse_target_address(addr, explicit_tls);

    match create_channel_direct(&target.host_port, target.use_tls).await {
        Ok(c) => Ok((c, target.use_tls)),
        Err(e) => {
            if !target.scheme_locked {
                let fallback_tls = !target.use_tls;
                if let Ok(c) = create_channel_direct(&target.host_port, fallback_tls).await {
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
    let target = parse_target_address(&req.server_address, req.use_tls);

    // 1. Try initial connection & discovery
    let first_res = match create_channel_direct(&target.host_port, target.use_tls).await {
        Ok(c) => try_discover_all_versions(c).await,
        Err(e) => Err(e),
    };

    if let Ok(res) = &first_res {
        if !res.services.is_empty() {
            return res.clone();
        }
    }

    // 2. If initial attempt failed and scheme wasn't locked, try fallback
    if !target.scheme_locked {
        let fallback_tls = !target.use_tls;
        if let Ok(c) = create_channel_direct(&target.host_port, fallback_tls).await {
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

async fn connect_and_fetch_pool(
    addr: &str,
    service: &str,
    explicit_tls: Option<bool>,
) -> Result<(Channel, DescriptorPool), String> {
    let target = parse_target_address(addr, explicit_tls);

    let first_res = match create_channel_direct(&target.host_port, target.use_tls).await {
        Ok(c) => match fetch_pool_for_symbol(c.clone(), service).await {
            Ok(pool) => return Ok((c, pool)),
            Err(e) => Err(e),
        },
        Err(e) => Err(e),
    };

    if !target.scheme_locked {
        let fallback_tls = !target.use_tls;
        if let Ok(c) = create_channel_direct(&target.host_port, fallback_tls).await {
            if let Ok(pool) = fetch_pool_for_symbol(c.clone(), service).await {
                return Ok((c, pool));
            }
        }
    }

    first_res
}

pub async fn execute_unary(req: GrpcExecutionRequest) -> GrpcExecutionResponse {
    let start = Instant::now();

    // ponytail: fallback handles mixed env ports; full URL parser planned if per-service config needed
    let (channel, pool) = match connect_and_fetch_pool(&req.server_address, &req.service, req.use_tls).await {
        Ok(cp) => cp,
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
        None => match pool.services().find(|s| s.full_name() == req.service || s.name() == req.service || s.full_name().ends_with(&format!(".{}", req.service))) {
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
        },
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
    let path = format!("/{}/{}", service_desc.full_name(), req.method);
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
    on_message: F,
    cancel_rx: tokio::sync::oneshot::Receiver<()>,
) -> GrpcExecutionResponse
where
    F: FnMut(serde_json::Value) + Send + 'static,
{
    execute_streaming_with_outbound(req, on_message, cancel_rx, None).await
}

pub async fn execute_streaming_with_outbound<F>(
    req: GrpcExecutionRequest,
    mut on_message: F,
    mut cancel_rx: tokio::sync::oneshot::Receiver<()>,
    outbound_rx: Option<tokio::sync::mpsc::Receiver<serde_json::Value>>,
) -> GrpcExecutionResponse
where
    F: FnMut(serde_json::Value) + Send + 'static,
{
    let start = Instant::now();

    // ponytail: fallback handles mixed env ports; full URL parser planned if per-service config needed
    let (channel, pool) = match connect_and_fetch_pool(&req.server_address, &req.service, req.use_tls).await {
        Ok(cp) => cp,
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
        None => match pool.services().find(|s| s.name() == req.service || s.name().ends_with(&format!(".{}", req.service))) {
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
        },
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
    let dynamic_input: DynamicMessage = match input_desc.clone().deserialize(req.payload) {
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
    let path = format!("/{}/{}", service_desc.full_name(), req.method);
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
        let (tx, rx) = tokio::sync::mpsc::channel(32);
        let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);
        let _ = tx.send(buf).await;

        if let Some(mut rx_in) = outbound_rx {
            let tx_clone = tx.clone();
            let in_desc = input_desc.clone();
            tokio::spawn(async move {
                while let Some(json_val) = rx_in.recv().await {
                    if let Ok(dyn_msg) = in_desc.clone().deserialize(json_val) {
                        let mut b = Vec::new();
                        if prost::Message::encode(&dyn_msg, &mut b).is_ok() {
                            if tx_clone.send(b).await.is_err() {
                                break;
                            }
                        }
                    }
                }
            });
        }

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
            let mut stream_err: Option<tonic::Status> = None;

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
                            Some(Err(status)) => {
                                stream_err = Some(status);
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
            if let Some(err) = stream_err {
                GrpcExecutionResponse {
                    status_code: err.code() as i32,
                    status_message: err.message().to_string(),
                    response_time_ms: elapsed,
                    response_size_bytes: total_bytes,
                    metadata: meta_map,
                    body: serde_json::Value::Array(received_messages),
                    error: Some(format!("Streaming RPC error: {}", err.message())),
                }
            } else {
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
        if pool.services().count() > 0 {
            return Ok(pool);
        }
    }
    // Fallback v1alpha
    fetch_pool_v1alpha(channel, symbol).await
}

const REFL_STEP_TIMEOUT: Duration = Duration::from_millis(2500);

async fn fetch_pool_v1(channel: Channel, symbol: &str) -> Result<DescriptorPool, String> {
    use tonic_reflection::pb::v1::server_reflection_client::ServerReflectionClient;
    use tonic_reflection::pb::v1::server_reflection_request::MessageRequest;
    use tonic_reflection::pb::v1::server_reflection_response::MessageResponse;
    use tonic_reflection::pb::v1::ServerReflectionRequest;

    let mut client = ServerReflectionClient::new(channel);
    let (tx, rx) = tokio::sync::mpsc::channel(20);
    let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);

    // Send first request BEFORE awaiting server_reflection_info so server receives headers
    let sym_req = ServerReflectionRequest {
        host: String::new(),
        message_request: Some(MessageRequest::FileContainingSymbol(symbol.to_string())),
    };
    tx.send(sym_req).await.map_err(|e| e.to_string())?;

    let mut response_stream = tokio::time::timeout(REFL_STEP_TIMEOUT, client.server_reflection_info(outbound))
        .await
        .map_err(|_| "v1 timeout".to_string())?
        .map_err(|e| e.to_string())?
        .into_inner();

    let mut raw_protos: HashMap<String, FileDescriptorProto> = HashMap::new();

    if let Ok(Some(Ok(res))) = tokio::time::timeout(REFL_STEP_TIMEOUT, response_stream.next()).await {
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

    // If symbol lookup returned empty, list services to find matching qualified service name
    if raw_protos.is_empty() {
        let list_req = ServerReflectionRequest {
            host: String::new(),
            message_request: Some(MessageRequest::ListServices(String::new())),
        };
        if tx.send(list_req).await.is_ok() {
            if let Ok(Some(Ok(res))) = tokio::time::timeout(REFL_STEP_TIMEOUT, response_stream.next()).await {
                if let Some(MessageResponse::ListServicesResponse(ls)) = res.message_response {
                    let matching_svc = ls.service.into_iter().find(|s| {
                        s.name == symbol || s.name.ends_with(&format!(".{}", symbol))
                    });
                    if let Some(svc) = matching_svc {
                        let retry_req = ServerReflectionRequest {
                            host: String::new(),
                            message_request: Some(MessageRequest::FileContainingSymbol(svc.name)),
                        };
                        if tx.send(retry_req).await.is_ok() {
                            if let Ok(Some(Ok(retry_res))) = tokio::time::timeout(REFL_STEP_TIMEOUT, response_stream.next()).await {
                                if let Some(MessageResponse::FileDescriptorResponse(fdr)) = retry_res.message_response {
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
                }
            }
        }
    }

    if raw_protos.is_empty() {
        return Err(format!("Symbol '{}' not found via v1 reflection", symbol));
    }

    // Transitive dependency resolution via FileByFilename
    let mut resolved_filenames: std::collections::HashSet<String> = raw_protos.keys().cloned().collect();
    let mut pending_deps: Vec<String> = Vec::new();
    for proto in raw_protos.values() {
        for dep in &proto.dependency {
            if !resolved_filenames.contains(dep) {
                pending_deps.push(dep.clone());
            }
        }
    }

    while let Some(dep_filename) = pending_deps.pop() {
        if resolved_filenames.contains(&dep_filename) {
            continue;
        }
        resolved_filenames.insert(dep_filename.clone());

        let dep_req = ServerReflectionRequest {
            host: String::new(),
            message_request: Some(MessageRequest::FileByFilename(dep_filename)),
        };
        if tx.send(dep_req).await.is_ok() {
            if let Ok(Some(Ok(dep_res))) = tokio::time::timeout(REFL_STEP_TIMEOUT, response_stream.next()).await {
                if let Some(MessageResponse::FileDescriptorResponse(fdr)) = dep_res.message_response {
                    for fd_bytes in fdr.file_descriptor_proto {
                        if let Ok(proto) = FileDescriptorProto::decode(&fd_bytes[..]) {
                            if let Some(ref name) = proto.name {
                                for sub_dep in &proto.dependency {
                                    if !resolved_filenames.contains(sub_dep) {
                                        pending_deps.push(sub_dep.clone());
                                    }
                                }
                                raw_protos.insert(name.clone(), proto);
                            }
                        }
                    }
                }
            }
        }
    }

    let mut pool = DescriptorPool::new();
    pool.add_file_descriptor_protos(raw_protos.into_values())
        .map_err(|e| format!("v1 pool build error: {e}"))?;

    if pool.services().count() == 0 {
        return Err("No services found in v1 pool".into());
    }

    Ok(pool)
}

async fn fetch_pool_v1alpha(channel: Channel, symbol: &str) -> Result<DescriptorPool, String> {
    use tonic_reflection::pb::v1alpha::server_reflection_client::ServerReflectionClient;
    use tonic_reflection::pb::v1alpha::server_reflection_request::MessageRequest;
    use tonic_reflection::pb::v1alpha::server_reflection_response::MessageResponse;
    use tonic_reflection::pb::v1alpha::ServerReflectionRequest;

    let mut client = ServerReflectionClient::new(channel);
    let (tx, rx) = tokio::sync::mpsc::channel(20);
    let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);

    // Send first request BEFORE awaiting server_reflection_info so server receives headers
    let sym_req = ServerReflectionRequest {
        host: String::new(),
        message_request: Some(MessageRequest::FileContainingSymbol(symbol.to_string())),
    };
    tx.send(sym_req).await.map_err(|e| e.to_string())?;

    let mut response_stream = tokio::time::timeout(REFL_STEP_TIMEOUT, client.server_reflection_info(outbound))
        .await
        .map_err(|_| "v1alpha timeout".to_string())?
        .map_err(|e| e.to_string())?
        .into_inner();

    let mut raw_protos: HashMap<String, FileDescriptorProto> = HashMap::new();

    if let Ok(Some(Ok(res))) = tokio::time::timeout(REFL_STEP_TIMEOUT, response_stream.next()).await {
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

    // If symbol lookup returned empty, list services to find matching qualified service name
    if raw_protos.is_empty() {
        let list_req = ServerReflectionRequest {
            host: String::new(),
            message_request: Some(MessageRequest::ListServices(String::new())),
        };
        if tx.send(list_req).await.is_ok() {
            if let Ok(Some(Ok(res))) = tokio::time::timeout(REFL_STEP_TIMEOUT, response_stream.next()).await {
                if let Some(MessageResponse::ListServicesResponse(ls)) = res.message_response {
                    let matching_svc = ls.service.into_iter().find(|s| {
                        s.name == symbol || s.name.ends_with(&format!(".{}", symbol))
                    });
                    if let Some(svc) = matching_svc {
                        let retry_req = ServerReflectionRequest {
                            host: String::new(),
                            message_request: Some(MessageRequest::FileContainingSymbol(svc.name)),
                        };
                        if tx.send(retry_req).await.is_ok() {
                            if let Ok(Some(Ok(retry_res))) = tokio::time::timeout(REFL_STEP_TIMEOUT, response_stream.next()).await {
                                if let Some(MessageResponse::FileDescriptorResponse(fdr)) = retry_res.message_response {
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
                }
            }
        }
    }

    if raw_protos.is_empty() {
        return Err(format!("Symbol '{}' not found via v1alpha reflection", symbol));
    }

    // Transitive dependency resolution via FileByFilename
    let mut resolved_filenames: std::collections::HashSet<String> = raw_protos.keys().cloned().collect();
    let mut pending_deps: Vec<String> = Vec::new();
    for proto in raw_protos.values() {
        for dep in &proto.dependency {
            if !resolved_filenames.contains(dep) {
                pending_deps.push(dep.clone());
            }
        }
    }

    while let Some(dep_filename) = pending_deps.pop() {
        if resolved_filenames.contains(&dep_filename) {
            continue;
        }
        resolved_filenames.insert(dep_filename.clone());

        let dep_req = ServerReflectionRequest {
            host: String::new(),
            message_request: Some(MessageRequest::FileByFilename(dep_filename)),
        };
        if tx.send(dep_req).await.is_ok() {
            if let Ok(Some(Ok(dep_res))) = tokio::time::timeout(REFL_STEP_TIMEOUT, response_stream.next()).await {
                if let Some(MessageResponse::FileDescriptorResponse(fdr)) = dep_res.message_response {
                    for fd_bytes in fdr.file_descriptor_proto {
                        if let Ok(proto) = FileDescriptorProto::decode(&fd_bytes[..]) {
                            if let Some(ref name) = proto.name {
                                for sub_dep in &proto.dependency {
                                    if !resolved_filenames.contains(sub_dep) {
                                        pending_deps.push(sub_dep.clone());
                                    }
                                }
                                raw_protos.insert(name.clone(), proto);
                            }
                        }
                    }
                }
            }
        }
    }

    let mut pool = DescriptorPool::new();
    pool.add_file_descriptor_protos(raw_protos.into_values())
        .map_err(|e| format!("v1alpha pool build error: {e}"))?;

    if pool.services().count() == 0 {
        return Err("No services found in v1alpha pool".into());
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
    // ponytail: fallback handles mixed env ports; full URL parser planned if per-service config needed
    let (_channel, pool) = match connect_and_fetch_pool(&req.server_address, &req.service, req.use_tls).await {
        Ok(cp) => cp,
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
