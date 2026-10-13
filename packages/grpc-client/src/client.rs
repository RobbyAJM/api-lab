use std::collections::HashMap;
use std::time::{Duration, Instant};
use futures::StreamExt;
use prost::Message;
use prost_reflect::{DescriptorPool, DynamicMessage};
use prost_types::FileDescriptorProto;
use serde::de::DeserializeSeed;
use rust_core::dto::{
    GrpcExecutionRequest, GrpcExecutionResponse, GrpcMethodSummary, GrpcReflectionRequest,
    GrpcReflectionResponse, GrpcServiceSummary,
};
use tonic::transport::{Channel, ClientTlsConfig, Endpoint};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

async fn create_channel(addr: &str, use_tls: bool) -> Result<Channel, String> {
    let mut endpoint_str = addr.to_string();
    if !endpoint_str.starts_with("http://") && !endpoint_str.starts_with("https://") {
        if use_tls {
            endpoint_str = format!("https://{}", endpoint_str);
        } else {
            endpoint_str = format!("http://{}", endpoint_str);
        }
    }

    let mut endpoint = Endpoint::from_shared(endpoint_str)
        .map_err(|e| format!("invalid server address URL: {e}"))?
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT);

    if use_tls {
        let tls = ClientTlsConfig::new();
        endpoint = endpoint
            .tls_config(tls)
            .map_err(|e| format!("failed to configure TLS: {e}"))?;
    }

    tokio::time::timeout(CONNECT_TIMEOUT, endpoint.connect())
        .await
        .map_err(|_| format!("connection timed out after {}s", CONNECT_TIMEOUT.as_secs()))?
        .map_err(|e| format!("failed to connect to gRPC server: {e}"))
}

// Try v1 first, fallback to v1alpha
pub async fn discover_services(
    req: GrpcReflectionRequest,
) -> GrpcReflectionResponse {
    let use_tls = req.use_tls.unwrap_or(false);
    let channel = match create_channel(&req.server_address, use_tls).await {
        Ok(c) => c,
        Err(e) => {
            return GrpcReflectionResponse {
                services: Vec::new(),
                error: Some(format!(
                    "connection error: {e}. gRPC server reflection unavailable on target; reflection required."
                )),
            };
        }
    };

    // Try v1 first
    match try_discover_v1(channel.clone()).await {
        Ok(res) if !res.services.is_empty() => return res,
        _ => {}
    }

    // Fallback to v1alpha
    match try_discover_v1alpha(channel).await {
        Ok(res) => res,
        Err(err) => GrpcReflectionResponse {
            services: Vec::new(),
            error: Some(format!("Reflection discovery failed: {err}. gRPC server reflection unavailable on target; reflection required.")),
        },
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
                    GrpcMethodSummary {
                        name: m.name.clone().unwrap_or_default(),
                        input_type: in_type.to_string(),
                        output_type: out_type.to_string(),
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
        if let Ok(key) = tonic::metadata::MetadataKey::from_bytes(k.as_bytes()) {
            if let Ok(val) = tonic::metadata::MetadataValue::try_from(v.as_str()) {
                tonic_req.metadata_mut().insert(key, val);
            }
        }
    }

    let timeout_ms = req.timeout_ms.unwrap_or(30_000);
    let codec = DynamicRawCodec;

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
