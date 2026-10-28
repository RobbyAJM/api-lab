use std::collections::HashMap;
use rust_core::dto::{
    GrpcExecutionRequest, GrpcExecutionResponse, GrpcReflectionRequest, GrpcReflectionResponse,
    GrpcSamplePayloadRequest, GrpcSamplePayloadResponse,
};
use rust_core::variable::{substitute_json, substitute_variables};

pub async fn run_grpc(
    mut req: GrpcExecutionRequest,
    variables: HashMap<String, String>,
) -> GrpcExecutionResponse {
    let server_address = match substitute_variables(&req.server_address, &variables) {
        Ok(addr) => addr,
        Err(e) => {
            return GrpcExecutionResponse {
                status_code: 3,
                status_message: "Variable error".into(),
                response_time_ms: 0,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(e.to_string()),
            };
        }
    };
    req.server_address = server_address;

    let mut interpolated_metadata = HashMap::new();
    for (k, v) in req.metadata {
        let key = match substitute_variables(&k, &variables) {
            Ok(k) => k,
            Err(e) => {
                return GrpcExecutionResponse {
                    status_code: 3,
                    status_message: "Variable error".into(),
                    response_time_ms: 0,
                    response_size_bytes: 0,
                    metadata: HashMap::new(),
                    body: serde_json::Value::Null,
                    error: Some(e.to_string()),
                };
            }
        };
        let val = match substitute_variables(&v, &variables) {
            Ok(v) => v,
            Err(e) => {
                return GrpcExecutionResponse {
                    status_code: 3,
                    status_message: "Variable error".into(),
                    response_time_ms: 0,
                    response_size_bytes: 0,
                    metadata: HashMap::new(),
                    body: serde_json::Value::Null,
                    error: Some(e.to_string()),
                };
            }
        };
        interpolated_metadata.insert(key, val);
    }
    req.metadata = interpolated_metadata;

    let interpolated_payload = match substitute_json(&req.payload, &variables) {
        Ok(p) => p,
        Err(e) => {
            return GrpcExecutionResponse {
                status_code: 3,
                status_message: "Variable error".into(),
                response_time_ms: 0,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(e.to_string()),
            };
        }
    };
    req.payload = interpolated_payload;

    grpc_client::execute_unary(req).await
}

pub async fn run_grpc_reflection(
    mut req: GrpcReflectionRequest,
    variables: HashMap<String, String>,
) -> GrpcReflectionResponse {
    let server_address = match substitute_variables(&req.server_address, &variables) {
        Ok(addr) => addr,
        Err(e) => {
            return GrpcReflectionResponse {
                services: Vec::new(),
                schemas: HashMap::new(),
                error: Some(e.to_string()),
            };
        }
    };
    req.server_address = server_address;

    grpc_client::discover_services(req).await
}

pub async fn run_grpc_sample_payload(
    mut req: GrpcSamplePayloadRequest,
    variables: HashMap<String, String>,
) -> GrpcSamplePayloadResponse {
    let server_address = match substitute_variables(&req.server_address, &variables) {
        Ok(addr) => addr,
        Err(e) => {
            return GrpcSamplePayloadResponse {
                payload: serde_json::Value::Null,
                error: Some(e.to_string()),
            };
        }
    };
    req.server_address = server_address;

    grpc_client::generate_sample_for_method(req).await
}

use std::sync::Mutex;

static CANCEL_MAP: Mutex<Option<HashMap<String, tokio::sync::oneshot::Sender<()>>>> = Mutex::new(None);
static SEND_MAP: Mutex<Option<HashMap<String, tokio::sync::mpsc::Sender<serde_json::Value>>>> = Mutex::new(None);

fn register_stream(id: String, cancel_tx: tokio::sync::oneshot::Sender<()>, send_tx: tokio::sync::mpsc::Sender<serde_json::Value>) {
    let mut lock = CANCEL_MAP.lock().unwrap();
    if lock.is_none() {
        *lock = Some(HashMap::new());
    }
    if let Some(ref mut map) = *lock {
        map.insert(id.clone(), cancel_tx);
    }
    drop(lock);

    let mut send_lock = SEND_MAP.lock().unwrap();
    if send_lock.is_none() {
        *send_lock = Some(HashMap::new());
    }
    if let Some(ref mut map) = *send_lock {
        map.insert(id, send_tx);
    }
}

fn unregister_stream(id: &str) {
    let mut lock = CANCEL_MAP.lock().unwrap();
    if let Some(ref mut map) = *lock {
        map.remove(id);
    }
    drop(lock);

    let mut send_lock = SEND_MAP.lock().unwrap();
    if let Some(ref mut map) = *send_lock {
        map.remove(id);
    }
}

pub fn cancel_stream(id: &str) -> bool {
    let mut lock = CANCEL_MAP.lock().unwrap();
    if let Some(ref mut map) = *lock {
        if let Some(tx) = map.remove(id) {
            let _ = tx.send(());
            return true;
        }
    }
    false
}

pub async fn send_stream_message(id: &str, payload: serde_json::Value) -> Result<(), String> {
    let tx = {
        let lock = SEND_MAP.lock().unwrap();
        lock.as_ref()
            .and_then(|map| map.get(id).cloned())
            .ok_or_else(|| format!("Active stream '{}' not found or closed", id))?
    };
    tx.send(payload)
        .await
        .map_err(|e| format!("Failed to send stream message: {e}"))
}

pub async fn run_grpc_stream<F>(
    mut req: GrpcExecutionRequest,
    variables: HashMap<String, String>,
    stream_id: String,
    on_message: F,
) -> GrpcExecutionResponse
where
    F: FnMut(serde_json::Value) + Send + 'static,
{
    let server_address = match substitute_variables(&req.server_address, &variables) {
        Ok(addr) => addr,
        Err(e) => {
            return GrpcExecutionResponse {
                status_code: 3,
                status_message: "Variable error".into(),
                response_time_ms: 0,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(e.to_string()),
            };
        }
    };
    req.server_address = server_address;

    let mut interpolated_metadata = HashMap::new();
    for (k, v) in req.metadata {
        let key = match substitute_variables(&k, &variables) {
            Ok(k) => k,
            Err(e) => {
                return GrpcExecutionResponse {
                    status_code: 3,
                    status_message: "Variable error".into(),
                    response_time_ms: 0,
                    response_size_bytes: 0,
                    metadata: HashMap::new(),
                    body: serde_json::Value::Null,
                    error: Some(e.to_string()),
                };
            }
        };
        let val = match substitute_variables(&v, &variables) {
            Ok(v) => v,
            Err(e) => {
                return GrpcExecutionResponse {
                    status_code: 3,
                    status_message: "Variable error".into(),
                    response_time_ms: 0,
                    response_size_bytes: 0,
                    metadata: HashMap::new(),
                    body: serde_json::Value::Null,
                    error: Some(e.to_string()),
                };
            }
        };
        interpolated_metadata.insert(key, val);
    }
    req.metadata = interpolated_metadata;

    let interpolated_payload = match substitute_json(&req.payload, &variables) {
        Ok(p) => p,
        Err(e) => {
            return GrpcExecutionResponse {
                status_code: 3,
                status_message: "Variable error".into(),
                response_time_ms: 0,
                response_size_bytes: 0,
                metadata: HashMap::new(),
                body: serde_json::Value::Null,
                error: Some(e.to_string()),
            };
        }
    };
    req.payload = interpolated_payload;

    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();
    let (outbound_tx, outbound_rx) = tokio::sync::mpsc::channel(32);
    register_stream(stream_id.clone(), cancel_tx, outbound_tx);

    let res = grpc_client::execute_streaming_with_outbound(req, on_message, cancel_rx, Some(outbound_rx)).await;
    unregister_stream(&stream_id);
    res
}
