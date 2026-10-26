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

    #[tauri::command]
    pub async fn execute_grpc_stream(
        req: GrpcExecutionRequest,
        variables: HashMap<String, String>,
        stream_id: String,
        channel: tauri::ipc::Channel<serde_json::Value>,
    ) -> GrpcExecutionResponse {
        grpc_runner::run_grpc_stream(req, variables, stream_id, move |msg| {
            let _ = channel.send(msg);
        })
        .await
    }

    #[tauri::command]
    pub fn cancel_grpc_stream(stream_id: String) -> bool {
        grpc_runner::cancel_stream(&stream_id)
    }

    #[tauri::command]
    pub async fn send_grpc_stream_message(
        stream_id: String,
        payload: serde_json::Value,
    ) -> Result<(), String> {
        grpc_runner::send_stream_message(&stream_id, payload).await
    }

    #[tauri::command]
    pub fn minimize_window(window: tauri::Window) {
        let _ = window.minimize();
    }

    #[tauri::command]
    pub fn toggle_maximize_window(window: tauri::Window) {
        if let Ok(is_max) = window.is_maximized() {
            if is_max {
                let _ = window.unmaximize();
            } else {
                let _ = window.maximize();
            }
        }
    }

    #[tauri::command]
    pub fn close_window(window: tauri::Window) {
        let _ = window.close();
    }

    #[tauri::command]
    pub fn is_window_maximized(window: tauri::Window) -> bool {
        window.is_maximized().unwrap_or(false)
    }

    #[tauri::command]
    pub fn start_dragging_window(
        window: tauri::Window,
        screen_x: Option<f64>,
        screen_y: Option<f64>,
    ) {
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
            if let (Some(sx), Some(sy)) = (screen_x, screen_y) {
                if let (Ok(size), Ok(scale)) = (window.outer_size(), window.scale_factor()) {
                    let logical_width = size.width as f64 / scale;
                    let target_x = (sx - logical_width / 2.0).max(0.0);
                    let target_y = (sy - 18.0).max(0.0);
                    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(
                        target_x, target_y,
                    )));
                }
            }
        }
        let _ = window.start_dragging();
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

    pub async fn execute_grpc_stream(
        req: GrpcExecutionRequest,
        variables: HashMap<String, String>,
        stream_id: String,
    ) -> GrpcExecutionResponse {
        grpc_runner::run_grpc_stream(req, variables, stream_id, |_| {}).await
    }

    pub fn cancel_grpc_stream(stream_id: String) -> bool {
        grpc_runner::cancel_stream(&stream_id)
    }

    pub async fn send_grpc_stream_message(
        stream_id: String,
        payload: serde_json::Value,
    ) -> Result<(), String> {
        grpc_runner::send_stream_message(&stream_id, payload).await
    }

    pub fn minimize_window() {}
    pub fn toggle_maximize_window() {}
    pub fn close_window() {}
    pub fn is_window_maximized() -> bool {
        false
    }
    pub fn start_dragging_window(
        _screen_x: Option<f64>,
        _screen_y: Option<f64>,
    ) {}
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
            generate_grpc_sample_payload,
            execute_grpc_stream,
            cancel_grpc_stream,
            send_grpc_stream_message,
            minimize_window,
            toggle_maximize_window,
            close_window,
            is_window_maximized,
            start_dragging_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(feature = "desktop"))]
pub fn run() {
    println!("API Lab Native Engine compiled without Tauri desktop window feature");
}
