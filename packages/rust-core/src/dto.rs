use std::collections::HashMap;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::{InvitationStatus, Protocol, Role};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterDto {
    pub email: String,
    pub name: String,
    pub password: String,
    pub invitation_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginDto {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgotPasswordDto {
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResetPasswordDto {
    pub token: String,
    pub new_password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSummary {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSummary {
    pub id: Uuid,
    pub name: String,
    pub role: Role,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserSummary,
    pub workspace: Option<WorkspaceSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkspaceDto {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub email: String,
    pub name: String,
    pub role: Role,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMemberRoleDto {
    pub role: Role,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateInvitationDto {
    pub role: Role,
    pub expires_in_days: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvitationResponse {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub token: Option<String>,
    pub role: Role,
    pub inviter_id: Uuid,
    pub expires_at: DateTime<Utc>,
    pub status: InvitationStatus,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCollectionDto {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCollectionDto {
    pub name: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateFolderDto {
    pub name: String,
    pub parent_folder_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateFolderDto {
    pub name: Option<String>,
    pub parent_folder_id: Option<Option<Uuid>>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEndpointDto {
    pub name: String,
    pub protocol: Protocol,
    pub folder_id: Option<Uuid>,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateEndpointDto {
    pub name: Option<String>,
    pub folder_id: Option<Option<Uuid>>,
    pub config: Option<serde_json::Value>,
    pub sort_order: Option<i32>,
    pub version: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEnvironmentDto {
    pub name: String,
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateEnvironmentDto {
    pub name: Option<String>,
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateVariableDto {
    pub key: String,
    pub value: String,
    pub is_sensitive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateVariableDto {
    pub key: Option<String>,
    pub value: Option<String>,
    pub is_sensitive: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableResponse {
    pub id: Uuid,
    pub environment_id: Uuid,
    pub key: String,
    pub value: String,
    pub is_sensitive: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveResponseDto {
    pub status_code: i32,
    pub response_headers: serde_json::Value,
    pub response_body: String,
    pub response_time_ms: i32,
    pub response_size_bytes: i64,
}

// Request execution DTOs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpAuth {
    pub auth_type: String, // "none", "bearer", "basic", "custom"
    pub token: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub header_name: Option<String>,
    pub header_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpExecutionRequest {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub query_params: Vec<(String, String)>,
    pub body: Option<String>,
    pub body_type: Option<String>, // "none", "json", "text", "form", "multipart"
    pub auth: Option<HttpAuth>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpExecutionResponse {
    pub status_code: u16,
    pub status_text: String,
    pub response_time_ms: u64,
    pub response_size_bytes: usize,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcExecutionRequest {
    pub server_address: String,
    pub service: String,
    pub method: String,
    pub metadata: HashMap<String, String>,
    pub payload: serde_json::Value,
    pub timeout_ms: Option<u64>,
    pub use_tls: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcExecutionResponse {
    pub status_code: i32,
    pub status_message: String,
    pub response_time_ms: u64,
    pub response_size_bytes: usize,
    pub metadata: HashMap<String, String>,
    pub body: serde_json::Value,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcReflectionRequest {
    pub server_address: String,
    pub use_tls: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcMethodSummary {
    pub name: String,
    pub input_type: String,
    pub output_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcServiceSummary {
    pub name: String,
    pub methods: Vec<GrpcMethodSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcReflectionResponse {
    pub services: Vec<GrpcServiceSummary>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcSamplePayloadRequest {
    pub server_address: String,
    pub service: String,
    pub method: String,
    pub use_tls: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcSamplePayloadResponse {
    pub payload: serde_json::Value,
    pub error: Option<String>,
}

// WebSocket Event DTO
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsSyncEvent {
    pub workspace_id: Uuid,
    pub entity: String, // "collection", "folder", "endpoint", "environment", "variable", "member", "saved_response"
    pub action: String, // "create", "update", "delete"
    pub entity_id: Uuid,
}
