use axum::extract::{Path, State};
use axum::Json;
use rust_core::dto::{SaveResponseDto, WsSyncEvent};
use rust_core::models::SavedResponse;
use serde_json::json;
use uuid::Uuid;

use crate::error::ApiError;
use crate::middleware::auth::{
    get_workspace_id_for_endpoint, get_workspace_role, AuthUser,
};
use crate::state::SharedState;

pub async fn get_saved_response(
    auth: AuthUser,
    Path(endpoint_id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<SavedResponse>, ApiError> {
    let ws_id = get_workspace_id_for_endpoint(&state.pool, endpoint_id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let row = sqlx::query_as!(
        SavedResponse,
        r#"
        SELECT id, endpoint_id, workspace_id, created_by, status_code, response_headers, response_body, response_time_ms, response_size_bytes, created_at, updated_at
        FROM saved_responses
        WHERE endpoint_id = $1
        "#,
        endpoint_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::NotFound("no saved response found for this endpoint".into()))?;

    Ok(Json(row))
}

pub async fn put_saved_response(
    auth: AuthUser,
    Path(endpoint_id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<SaveResponseDto>,
) -> Result<Json<SavedResponse>, ApiError> {
    let ws_id = get_workspace_id_for_endpoint(&state.pool, endpoint_id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let response_id = Uuid::new_v4();

    let row = sqlx::query_as!(
        SavedResponse,
        r#"
        INSERT INTO saved_responses (
            id, endpoint_id, workspace_id, created_by, status_code,
            response_headers, response_body, response_time_ms, response_size_bytes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (endpoint_id) DO UPDATE SET
            created_by = EXCLUDED.created_by,
            status_code = EXCLUDED.status_code,
            response_headers = EXCLUDED.response_headers,
            response_body = EXCLUDED.response_body,
            response_time_ms = EXCLUDED.response_time_ms,
            response_size_bytes = EXCLUDED.response_size_bytes,
            updated_at = NOW()
        RETURNING id, endpoint_id, workspace_id, created_by, status_code, response_headers, response_body, response_time_ms, response_size_bytes, created_at, updated_at
        "#,
        response_id,
        endpoint_id,
        ws_id,
        auth.user.id,
        dto.status_code,
        dto.response_headers,
        dto.response_body,
        dto.response_time_ms,
        dto.response_size_bytes
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "saved_response".into(),
        action: "update".into(),
        entity_id: endpoint_id,
    });

    Ok(Json(row))
}

pub async fn delete_saved_response(
    auth: AuthUser,
    Path(endpoint_id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let ws_id = get_workspace_id_for_endpoint(&state.pool, endpoint_id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    sqlx::query!("DELETE FROM saved_responses WHERE endpoint_id = $1", endpoint_id)
        .execute(&state.pool)
        .await
        .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "saved_response".into(),
        action: "delete".into(),
        entity_id: endpoint_id,
    });

    Ok(Json(json!({ "message": "saved response deleted" })))
}
