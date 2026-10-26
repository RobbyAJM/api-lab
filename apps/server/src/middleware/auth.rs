use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::header::AUTHORIZATION;
use rust_core::crypto::hash_token_sha256;
use rust_core::models::{Role, User};
use uuid::Uuid;

use crate::error::ApiError;
use crate::state::SharedState;

pub struct AuthUser {
    pub user: User,
    pub session_token_hash: String,
}

impl FromRequestParts<SharedState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .ok_or_else(|| ApiError::Unauthorized("missing authorization header".into()))?;

        if !auth_header.starts_with("Bearer ") {
            return Err(ApiError::Unauthorized("invalid authorization scheme".into()));
        }

        let token = &auth_header["Bearer ".len()..];
        let token_hash = hash_token_sha256(token);

        let row = sqlx::query!(
            r#"
            SELECT u.id, u.email, u.name, u.password_hash, u.role, u.theme, u.avatar, u.created_at, u.updated_at
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token_hash = $1 AND s.expires_at > NOW()
            "#,
            token_hash
        )
        .fetch_optional(&state.pool)
        .await
        .map_err(ApiError::Database)?
        .ok_or_else(|| ApiError::Unauthorized("invalid or expired session".into()))?;

        let user = User {
            id: row.id,
            email: row.email,
            name: row.name,
            password_hash: row.password_hash,
            role: row.role,
            theme: row.theme,
            avatar: row.avatar,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };

        Ok(AuthUser {
            user,
            session_token_hash: token_hash,
        })
    }
}

pub async fn get_workspace_role(
    pool: &sqlx::PgPool,
    workspace_id: Uuid,
    user_id: Uuid,
) -> Result<Role, ApiError> {
    let row = sqlx::query!(
        r#"
        SELECT role FROM workspace_members
        WHERE workspace_id = $1 AND user_id = $2
        "#,
        workspace_id,
        user_id
    )
    .fetch_optional(pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::Forbidden("access to workspace denied".into()))?;

    Role::from_str_opt(&row.role)
        .ok_or_else(|| ApiError::Internal("corrupted role in database".into()))
}

pub async fn require_workspace_role(
    pool: &sqlx::PgPool,
    workspace_id: Uuid,
    user_id: Uuid,
    minimum_role: Role,
) -> Result<Role, ApiError> {
    let role = get_workspace_role(pool, workspace_id, user_id).await?;
    match (minimum_role, role) {
        (Role::Admin, Role::Developer) => {
            Err(ApiError::Forbidden("admin privileges required".into()))
        }
        _ => Ok(role),
    }
}

pub async fn get_workspace_id_for_collection(
    pool: &sqlx::PgPool,
    collection_id: Uuid,
) -> Result<Uuid, ApiError> {
    let row = sqlx::query!(
        "SELECT workspace_id FROM collections WHERE id = $1",
        collection_id
    )
    .fetch_optional(pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::NotFound("collection not found".into()))?;

    Ok(row.workspace_id)
}

pub async fn get_workspace_id_for_endpoint(
    pool: &sqlx::PgPool,
    endpoint_id: Uuid,
) -> Result<Uuid, ApiError> {
    let row = sqlx::query!(
        r#"
        SELECT c.workspace_id 
        FROM endpoints e
        JOIN collections c ON e.collection_id = c.id
        WHERE e.id = $1
        "#,
        endpoint_id
    )
    .fetch_optional(pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::NotFound("endpoint not found".into()))?;

    Ok(row.workspace_id)
}

pub async fn get_workspace_id_for_environment(
    pool: &sqlx::PgPool,
    environment_id: Uuid,
) -> Result<Uuid, ApiError> {
    let row = sqlx::query!(
        "SELECT workspace_id FROM environments WHERE id = $1",
        environment_id
    )
    .fetch_optional(pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::NotFound("environment not found".into()))?;

    Ok(row.workspace_id)
}
