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
