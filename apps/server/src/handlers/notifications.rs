use axum::extract::{Path, Query, State};
use axum::Json;
use rust_core::dto::NotificationItem;
use serde::Deserialize;
use uuid::Uuid;

use crate::error::ApiError;
use crate::middleware::auth::AuthUser;
use crate::state::SharedState;

#[derive(Debug, Deserialize)]
pub struct NotificationFilterQuery {
    pub workspace_id: Option<Uuid>,
    pub category: Option<String>,
    pub unread_only: Option<bool>,
}

pub async fn list_notifications(
    auth: AuthUser,
    State(state): State<SharedState>,
    Query(query): Query<NotificationFilterQuery>,
) -> Result<Json<Vec<NotificationItem>>, ApiError> {
    let unread_filter = query.unread_only.unwrap_or(false);
    let category_filter = query.category.as_deref().map(str::trim).filter(|s| !s.is_empty() && *s != "all");

    let rows = sqlx::query!(
        r#"
        SELECT id, user_id, workspace_id, title, message, category, read, created_at
        FROM notifications
        WHERE user_id = $1
          AND ($2::uuid IS NULL OR workspace_id = $2)
          AND ($3::text IS NULL OR category = $3)
          AND ($4::bool = false OR read = false)
        ORDER BY created_at DESC
        LIMIT 100
        "#,
        auth.user.id,
        query.workspace_id,
        category_filter,
        unread_filter
    )
    .fetch_all(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let items = rows
        .into_iter()
        .map(|r| NotificationItem {
            id: r.id,
            user_id: r.user_id,
            workspace_id: r.workspace_id,
            title: r.title,
            message: r.message,
            category: r.category,
            read: r.read,
            created_at: r.created_at,
        })
        .collect();

    Ok(Json(items))
}

pub async fn mark_notification_read(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<NotificationItem>, ApiError> {
    let row = sqlx::query!(
        r#"
        UPDATE notifications
        SET read = true
        WHERE id = $1 AND user_id = $2
        RETURNING id, user_id, workspace_id, title, message, category, read, created_at
        "#,
        id,
        auth.user.id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::NotFound("notification not found".into()))?;

    Ok(Json(NotificationItem {
        id: row.id,
        user_id: row.user_id,
        workspace_id: row.workspace_id,
        title: row.title,
        message: row.message,
        category: row.category,
        read: row.read,
        created_at: row.created_at,
    }))
}

pub async fn mark_all_notifications_read(
    auth: AuthUser,
    State(state): State<SharedState>,
    Query(query): Query<NotificationFilterQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    sqlx::query!(
        r#"
        UPDATE notifications
        SET read = true
        WHERE user_id = $1
          AND ($2::uuid IS NULL OR workspace_id = $2)
        "#,
        auth.user.id,
        query.workspace_id
    )
    .execute(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    Ok(Json(serde_json::json!({ "message": "all notifications marked as read" })))
}

pub async fn delete_notification(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let result = sqlx::query!(
        "DELETE FROM notifications WHERE id = $1 AND user_id = $2",
        id,
        auth.user.id
    )
    .execute(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("notification not found".into()));
    }

    Ok(Json(serde_json::json!({ "message": "notification deleted" })))
}

pub async fn create_system_notification(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    workspace_id: Option<Uuid>,
    title: &str,
    message: &str,
    category: &str,
) -> Result<NotificationItem, ApiError> {
    let row = sqlx::query!(
        r#"
        INSERT INTO notifications (user_id, workspace_id, title, message, category)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, workspace_id, title, message, category, read, created_at
        "#,
        user_id,
        workspace_id,
        title,
        message,
        category
    )
    .fetch_one(pool)
    .await
    .map_err(ApiError::Database)?;

    Ok(NotificationItem {
        id: row.id,
        user_id: row.user_id,
        workspace_id: row.workspace_id,
        title: row.title,
        message: row.message,
        category: row.category,
        read: row.read,
        created_at: row.created_at,
    })
}
