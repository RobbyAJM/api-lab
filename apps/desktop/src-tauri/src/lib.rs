pub mod grpc_runner;
pub mod http_runner;

use std::collections::HashMap;
use rust_core::dto::{
    GrpcExecutionRequest, GrpcExecutionResponse, GrpcReflectionRequest, GrpcReflectionResponse,
    GrpcSamplePayloadRequest, GrpcSamplePayloadResponse, HttpExecutionRequest,
    HttpExecutionResponse,
};

#[cfg(feature = "desktop")]
mod commands {
    use super::*;

    #[tauri::command]
    pub async fn execute_http_request(
        req: HttpExecutionRequest,
        variables: HashMap<String, String>,
    ) -> HttpExecutionResponse {
        http_runner::run_http(req, variables).await
    }

    #[tauri::command]
    pub async fn execute_grpc_request(
        req: GrpcExecutionRequest,
        variables: HashMap<String, String>,
    ) -> GrpcExecutionResponse {
        grpc_runner::run_grpc(req, variables).await
    }

    #[tauri::command]
    pub async fn discover_grpc_services(
        req: GrpcReflectionRequest,
        variables: HashMap<String, String>,
    ) -> GrpcReflectionResponse {
        grpc_runner::run_grpc_reflection(req, variables).await
    }

    #[tauri::command]
    pub async fn generate_grpc_sample_payload(
        req: GrpcSamplePayloadRequest,
        variables: HashMap<String, String>,
    ) -> GrpcSamplePayloadResponse {
        grpc_runner::run_grpc_sample_payload(req, variables).await
    }
}

#[cfg(not(feature = "desktop"))]
mod commands {
    use super::*;

    pub async fn execute_http_request(
        req: HttpExecutionRequest,
        variables: HashMap<String, String>,
    ) -> HttpExecutionResponse {
        http_runner::run_http(req, variables).await
    }

    pub async fn execute_grpc_request(
        req: GrpcExecutionRequest,
        variables: HashMap<String, String>,
    ) -> GrpcExecutionResponse {
        grpc_runner::run_grpc(req, variables).await
    }

    pub async fn discover_grpc_services(
        req: GrpcReflectionRequest,
        variables: HashMap<String, String>,
    ) -> GrpcReflectionResponse {
        grpc_runner::run_grpc_reflection(req, variables).await
    }

    pub async fn generate_grpc_sample_payload(
        req: GrpcSamplePayloadRequest,
        variables: HashMap<String, String>,
    ) -> GrpcSamplePayloadResponse {
        grpc_runner::run_grpc_sample_payload(req, variables).await
    }
}

pub use commands::*;

#[cfg(feature = "desktop")]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            execute_http_request,
            execute_grpc_request,
            discover_grpc_services,
            generate_grpc_sample_payload
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(feature = "desktop"))]
pub fn run() {
    println!("API Lab Native Engine compiled without Tauri desktop window feature");
}
