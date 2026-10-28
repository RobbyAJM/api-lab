use std::collections::HashMap;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use uuid::Uuid;

use crate::models::{InvitationStatus, Protocol, Role};

fn deserialize_double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

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
    pub theme: String,
    pub avatar: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProfileDto {
    pub name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationItem {
    pub id: Uuid,
    pub user_id: Uuid,
    pub workspace_id: Option<Uuid>,
    pub title: String,
    pub message: String,
    pub category: String,
    pub read: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateNotificationDto {
    pub user_id: Uuid,
    pub workspace_id: Option<Uuid>,
    pub title: String,
    pub message: String,
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateThemeDto {
    pub theme: String,
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
pub struct JoinWorkspaceDto {
    #[serde(alias = "invitation_token")]
    pub token: String,
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
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub expires_at: Option<Option<DateTime<Utc>>>,
    pub never_expires: Option<bool>,
}

impl CreateInvitationDto {
    pub fn resolve_expiry(&self, now: DateTime<Utc>) -> Result<Option<DateTime<Utc>>, &'static str> {
        if self.never_expires.unwrap_or(false) || self.expires_at == Some(None) {
            return Ok(None);
        }

        if let Some(Some(exp)) = self.expires_at {
            if exp <= now {
                return Err("expiration date must be in the future");
            }
            return Ok(Some(exp));
        }

        if let Some(days) = self.expires_in_days {
            let clamped = days.clamp(1, 30);
            return Ok(Some(now + Duration::days(clamped)));
        }

        Ok(Some(now + Duration::days(7)))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvitationResponse {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub token: Option<String>,
    pub role: Role,
    pub inviter_id: Uuid,
    pub expires_at: Option<DateTime<Utc>>,
    pub status: InvitationStatus,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCollectionDto {
    pub name: String,
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCollectionDto {
    pub name: Option<String>,
    pub settings: Option<serde_json::Value>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateFolderDto {
    pub name: String,
    pub parent_folder_id: Option<Uuid>,
    pub grpc_url: Option<String>,
    pub swagger_url: Option<String>,
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateFolderDto {
    pub name: Option<String>,
    pub parent_folder_id: Option<Option<Uuid>>,
    pub sort_order: Option<i32>,
    pub grpc_url: Option<Option<String>>,
    pub swagger_url: Option<Option<String>>,
    pub settings: Option<serde_json::Value>,
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
    pub body_type: Option<String>, // "none", "json", "text", "form", "multipart", "binary"
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
    pub auth: Option<GrpcAuth>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcAuth {
    pub auth_type: String,
    pub token: Option<String>,
    pub header_name: Option<String>,
    pub header_value: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct GrpcFieldSummary {
    pub name: String,
    pub field_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcMethodSummary {
    pub name: String,
    pub input_type: String,
    pub output_type: String,
    pub is_client_streaming: bool,
    pub is_server_streaming: bool,
    pub stream_type: String,
    #[serde(default)]
    pub request_fields: Vec<GrpcFieldSummary>,
    #[serde(default)]
    pub response_fields: Vec<GrpcFieldSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcServiceSummary {
    pub name: String,
    pub methods: Vec<GrpcMethodSummary>,
    #[serde(default)]
    pub schemas: HashMap<String, Vec<GrpcFieldSummary>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcReflectionResponse {
    pub services: Vec<GrpcServiceSummary>,
    #[serde(default)]
    pub schemas: HashMap<String, Vec<GrpcFieldSummary>>,
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
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct PresenceUserLocation {
    pub location_type: String, // "http", "grpc", "settings", "workspace_settings", "members", "environments", "collection_settings", "folder_settings", "idle"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PresenceUser {
    pub user_id: Uuid,
    pub name: String,
    pub email: String,
    pub avatar: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_location: Option<PresenceUserLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PresenceEvent {
    Join {
        workspace_id: Uuid,
        user: PresenceUser,
    },
    Leave {
        workspace_id: Uuid,
        user_id: Uuid,
    },
    Update {
        workspace_id: Uuid,
        user: PresenceUser,
    },
    Notification {
        workspace_id: Uuid,
        notification: serde_json::Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsSyncEvent {
    pub workspace_id: Uuid,
    pub entity: String, // "collection", "folder", "endpoint", "environment", "variable", "member", "saved_response"
    pub action: String, // "create", "update", "delete"
    pub entity_id: Uuid,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_invitation_expiry_resolution() {
        let now = Utc.with_ymd_and_hms(2026, 10, 27, 12, 0, 0).unwrap();

        // 1. Default (omitted) -> 7 days
        let dto: CreateInvitationDto = serde_json::from_str(r#"{"role":"developer"}"#).unwrap();
        assert_eq!(dto.resolve_expiry(now).unwrap(), Some(now + Duration::days(7)));

        // 2. Explicit null -> indefinite
        let dto: CreateInvitationDto = serde_json::from_str(r#"{"role":"developer","expires_at":null}"#).unwrap();
        assert_eq!(dto.resolve_expiry(now).unwrap(), None);

        // 3. never_expires: true -> indefinite
        let dto: CreateInvitationDto = serde_json::from_str(r#"{"role":"developer","never_expires":true}"#).unwrap();
        assert_eq!(dto.resolve_expiry(now).unwrap(), None);

        // 4. Specific future date
        let future = Utc.with_ymd_and_hms(2026, 11, 15, 0, 0, 0).unwrap();
        let dto: CreateInvitationDto = serde_json::from_str(
            r#"{"role":"developer","expires_at":"2026-11-15T00:00:00Z"}"#
        ).unwrap();
        assert_eq!(dto.resolve_expiry(now).unwrap(), Some(future));

        // 5. Past date -> Err
        let past = r#"{"role":"developer","expires_at":"2026-10-20T00:00:00Z"}"#;
        let dto: CreateInvitationDto = serde_json::from_str(past).unwrap();
        assert!(dto.resolve_expiry(now).is_err());

        // 6. expires_in_days
        let dto: CreateInvitationDto = serde_json::from_str(r#"{"role":"developer","expires_in_days":14}"#).unwrap();
        assert_eq!(dto.resolve_expiry(now).unwrap(), Some(now + Duration::days(14)));
    }

    #[test]
    fn test_presence_user_location_serialization() {
        let user_id = Uuid::new_v4();
        let endpoint_id = Uuid::new_v4();

        // 1. Without current location (backward compat)
        let json_without = format!(
            r#"{{"user_id":"{}","name":"Alice","email":"alice@example.com","avatar":"bottts:alice"}}"#,
            user_id
        );
        let user: PresenceUser = serde_json::from_str(&json_without).unwrap();
        assert_eq!(user.current_location, None);

        // 2. With HTTP location
        let user_with_loc = PresenceUser {
            user_id,
            name: "Alice".into(),
            email: "alice@example.com".into(),
            avatar: "bottts:alice".into(),
            current_location: Some(PresenceUserLocation {
                location_type: "http".into(),
                endpoint_id: Some(endpoint_id),
                name: Some("List Users".into()),
                method: Some("GET".into()),
            }),
        };
        let serialized = serde_json::to_string(&user_with_loc).unwrap();
        assert!(serialized.contains("location_type"));
        assert!(serialized.contains("List Users"));

        let deserialized: PresenceUser = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized, user_with_loc);
    }
}
