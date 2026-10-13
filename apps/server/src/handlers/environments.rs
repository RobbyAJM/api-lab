use axum::extract::{Path, State};
use axum::Json;
use rust_core::crypto::{decrypt_aes_gcm, encrypt_aes_gcm};
use rust_core::dto::{
    CreateEnvironmentDto, CreateVariableDto, UpdateEnvironmentDto, UpdateVariableDto,
    VariableResponse, WsSyncEvent,
};
use rust_core::models::Environment;
use serde_json::json;
use uuid::Uuid;

use crate::error::ApiError;
use crate::middleware::auth::{
    get_workspace_id_for_environment, get_workspace_role, AuthUser,
};
use crate::state::SharedState;

pub async fn list_environments(
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<Vec<Environment>>, ApiError> {
    let _ = get_workspace_role(&state.pool, workspace_id, auth.user.id).await?;

    let rows = sqlx::query_as!(
        Environment,
        r#"
        SELECT id, workspace_id, name, is_default, created_at, updated_at
        FROM environments
        WHERE workspace_id = $1
        ORDER BY is_default DESC, name ASC
        "#,
        workspace_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    Ok(Json(rows))
}

pub async fn create_environment(
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<CreateEnvironmentDto>,
) -> Result<Json<Environment>, ApiError> {
    let _ = get_workspace_role(&state.pool, workspace_id, auth.user.id).await?;

    let name = dto.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("environment name cannot be empty".into()));
    }

    let is_default = dto.is_default.unwrap_or(false);
    let env_id = Uuid::new_v4();

    let row = sqlx::query_as!(
        Environment,
        r#"
        INSERT INTO environments (id, workspace_id, name, is_default)
        VALUES ($1, $2, $3, $4)
        RETURNING id, workspace_id, name, is_default, created_at, updated_at
        "#,
        env_id,
        workspace_id,
        name,
        is_default
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id,
        entity: "environment".into(),
        action: "create".into(),
        entity_id: env_id,
    });

    Ok(Json(row))
}

pub async fn update_environment(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<UpdateEnvironmentDto>,
) -> Result<Json<Environment>, ApiError> {
    let ws_id = get_workspace_id_for_environment(&state.pool, id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let current = sqlx::query_as!(
        Environment,
        "SELECT id, workspace_id, name, is_default, created_at, updated_at FROM environments WHERE id = $1",
        id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let new_name = dto.name.as_deref().unwrap_or(&current.name).trim().to_string();
    let new_default = dto.is_default.unwrap_or(current.is_default);

    let updated = sqlx::query_as!(
        Environment,
        r#"
        UPDATE environments
        SET name = $1, is_default = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id, workspace_id, name, is_default, created_at, updated_at
        "#,
        new_name,
        new_default,
        id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "environment".into(),
        action: "update".into(),
        entity_id: id,
    });

    Ok(Json(updated))
}

pub async fn delete_environment(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let ws_id = get_workspace_id_for_environment(&state.pool, id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    sqlx::query!("DELETE FROM environments WHERE id = $1", id)
        .execute(&state.pool)
        .await
        .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "environment".into(),
        action: "delete".into(),
        entity_id: id,
    });

    Ok(Json(json!({ "message": "environment deleted" })))
}

// === Variables ===

pub async fn list_variables(
    auth: AuthUser,
    Path(environment_id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<Vec<VariableResponse>>, ApiError> {
    let ws_id = get_workspace_id_for_environment(&state.pool, environment_id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let rows = sqlx::query!(
        r#"
        SELECT id, environment_id, key, value_encrypted, is_sensitive, created_at, updated_at
        FROM environment_variables
        WHERE environment_id = $1
        ORDER BY key ASC
        "#,
        environment_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let mut result = Vec::with_capacity(rows.len());
    for r in rows {
        let value = if r.is_sensitive {
            decrypt_aes_gcm(&r.value_encrypted, &state.encryption_key)
                .unwrap_or_else(|_| "[DECRYPTION FAILED]".into())
        } else {
            r.value_encrypted
        };

        result.push(VariableResponse {
            id: r.id,
            environment_id: r.environment_id,
            key: r.key,
            value,
            is_sensitive: r.is_sensitive,
            created_at: r.created_at,
            updated_at: r.updated_at,
        });
    }

    Ok(Json(result))
}

pub async fn create_variable(
    auth: AuthUser,
    Path(environment_id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<CreateVariableDto>,
) -> Result<Json<VariableResponse>, ApiError> {
    let ws_id = get_workspace_id_for_environment(&state.pool, environment_id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let key = dto.key.trim();
    if key.is_empty() {
        return Err(ApiError::BadRequest("variable key cannot be empty".into()));
    }

    let stored_val = if dto.is_sensitive {
        encrypt_aes_gcm(&dto.value, &state.encryption_key)?
    } else {
        dto.value.clone()
    };

    let var_id = Uuid::new_v4();
    let row = sqlx::query!(
        r#"
        INSERT INTO environment_variables (id, environment_id, key, value_encrypted, is_sensitive)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, environment_id, key, value_encrypted, is_sensitive, created_at, updated_at
        "#,
        var_id,
        environment_id,
        key,
        stored_val,
        dto.is_sensitive
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "variable".into(),
        action: "create".into(),
        entity_id: var_id,
    });

    Ok(Json(VariableResponse {
        id: row.id,
        environment_id: row.environment_id,
        key: row.key,
        value: dto.value,
        is_sensitive: row.is_sensitive,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

pub async fn update_variable(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<UpdateVariableDto>,
) -> Result<Json<VariableResponse>, ApiError> {
    let var = sqlx::query!(
        r#"
        SELECT ev.id, ev.environment_id, ev.key, ev.value_encrypted, ev.is_sensitive, e.workspace_id
        FROM environment_variables ev
        JOIN environments e ON ev.environment_id = e.id
        WHERE ev.id = $1
        "#,
        id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::NotFound("variable not found".into()))?;

    let _ = get_workspace_role(&state.pool, var.workspace_id, auth.user.id).await?;

    let is_sensitive = dto.is_sensitive.unwrap_or(var.is_sensitive);
    let key = dto.key.as_deref().unwrap_or(&var.key).trim().to_string();

    let plain_val = if let Some(v) = dto.value {
        v
    } else if var.is_sensitive {
        decrypt_aes_gcm(&var.value_encrypted, &state.encryption_key)?
    } else {
        var.value_encrypted.clone()
    };

    let stored_val = if is_sensitive {
        encrypt_aes_gcm(&plain_val, &state.encryption_key)?
    } else {
        plain_val.clone()
    };

    let updated = sqlx::query!(
        r#"
        UPDATE environment_variables
        SET key = $1, value_encrypted = $2, is_sensitive = $3, updated_at = NOW()
        WHERE id = $4
        RETURNING id, environment_id, key, is_sensitive, created_at, updated_at
        "#,
        key,
        stored_val,
        is_sensitive,
        id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: var.workspace_id,
        entity: "variable".into(),
        action: "update".into(),
        entity_id: id,
    });

    Ok(Json(VariableResponse {
        id: updated.id,
        environment_id: updated.environment_id,
        key: updated.key,
        value: plain_val,
        is_sensitive: updated.is_sensitive,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
    }))
}

pub async fn delete_variable(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let var = sqlx::query!(
        r#"
        SELECT e.workspace_id
        FROM environment_variables ev
        JOIN environments e ON ev.environment_id = e.id
        WHERE ev.id = $1
        "#,
        id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::NotFound("variable not found".into()))?;

    let _ = get_workspace_role(&state.pool, var.workspace_id, auth.user.id).await?;

    sqlx::query!("DELETE FROM environment_variables WHERE id = $1", id)
        .execute(&state.pool)
        .await
        .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: var.workspace_id,
        entity: "variable".into(),
        action: "delete".into(),
        entity_id: id,
    });

    Ok(Json(json!({ "message": "variable deleted" })))
}
