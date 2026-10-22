use axum::extract::{Path, State};
use axum::Json;
use rust_core::dto::{
    CreateCollectionDto, CreateEndpointDto, CreateFolderDto, UpdateCollectionDto,
    UpdateEndpointDto, UpdateFolderDto, WsSyncEvent,
};
use rust_core::models::{Collection, CollectionFolder, Endpoint, Protocol};
use serde_json::json;
use uuid::Uuid;

use crate::error::ApiError;
use crate::middleware::auth::{
    get_workspace_id_for_collection, get_workspace_id_for_endpoint, get_workspace_role, AuthUser,
};
use crate::state::SharedState;

// === Collections ===

pub async fn list_collections(
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<Vec<Collection>>, ApiError> {
    let _ = get_workspace_role(&state.pool, workspace_id, auth.user.id).await?;

    let rows = sqlx::query_as!(
        Collection,
        r#"
        SELECT id, workspace_id, name, settings, sort_order, created_at, updated_at
        FROM collections
        WHERE workspace_id = $1
        ORDER BY sort_order ASC, name ASC
        "#,
        workspace_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    Ok(Json(rows))
}

pub async fn create_collection(
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<CreateCollectionDto>,
) -> Result<Json<Collection>, ApiError> {
    let _ = get_workspace_role(&state.pool, workspace_id, auth.user.id).await?;
    let name = dto.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("collection name cannot be empty".into()));
    }

    let coll_id = Uuid::new_v4();
    let settings = dto.settings.unwrap_or_else(|| json!({}));

    let row = sqlx::query_as!(
        Collection,
        r#"
        INSERT INTO collections (id, workspace_id, name, settings)
        VALUES ($1, $2, $3, $4)
        RETURNING id, workspace_id, name, settings, sort_order, created_at, updated_at
        "#,
        coll_id,
        workspace_id,
        name,
        settings
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id,
        entity: "collection".into(),
        action: "create".into(),
        entity_id: coll_id,
    });

    Ok(Json(row))
}

pub async fn get_collection(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<Collection>, ApiError> {
    let ws_id = get_workspace_id_for_collection(&state.pool, id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let row = sqlx::query_as!(
        Collection,
        r#"
        SELECT id, workspace_id, name, settings, sort_order, created_at, updated_at
        FROM collections
        WHERE id = $1
        "#,
        id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    Ok(Json(row))
}

pub async fn update_collection(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<UpdateCollectionDto>,
) -> Result<Json<Collection>, ApiError> {
    let ws_id = get_workspace_id_for_collection(&state.pool, id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let mut current = sqlx::query_as!(
        Collection,
        "SELECT id, workspace_id, name, settings, sort_order, created_at, updated_at FROM collections WHERE id = $1",
        id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    if let Some(n) = dto.name {
        let trimmed = n.trim();
        if !trimmed.is_empty() {
            current.name = trimmed.to_string();
        }
    }
    if let Some(s) = dto.settings {
        current.settings = s;
    }
    if let Some(so) = dto.sort_order {
        current.sort_order = so;
    }

    let updated = sqlx::query_as!(
        Collection,
        r#"
        UPDATE collections
        SET name = $1, settings = $2, sort_order = $3, updated_at = NOW()
        WHERE id = $4
        RETURNING id, workspace_id, name, settings, sort_order, created_at, updated_at
        "#,
        current.name,
        current.settings,
        current.sort_order,
        id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "collection".into(),
        action: "update".into(),
        entity_id: id,
    });

    Ok(Json(updated))
}

pub async fn delete_collection(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let ws_id = get_workspace_id_for_collection(&state.pool, id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    sqlx::query!("DELETE FROM collections WHERE id = $1", id)
        .execute(&state.pool)
        .await
        .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "collection".into(),
        action: "delete".into(),
        entity_id: id,
    });

    Ok(Json(json!({ "message": "collection deleted" })))
}

// === Folders ===

pub async fn list_folders(
    auth: AuthUser,
    Path(collection_id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<Vec<CollectionFolder>>, ApiError> {
    let ws_id = get_workspace_id_for_collection(&state.pool, collection_id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let rows = sqlx::query_as!(
        CollectionFolder,
        r#"
        SELECT id, collection_id, parent_folder_id, name, grpc_url, swagger_url, settings, sort_order, created_at, updated_at
        FROM collection_folders
        WHERE collection_id = $1
        ORDER BY sort_order ASC, name ASC
        "#,
        collection_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    Ok(Json(rows))
}

pub async fn create_folder(
    auth: AuthUser,
    Path(collection_id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<CreateFolderDto>,
) -> Result<Json<CollectionFolder>, ApiError> {
    let ws_id = get_workspace_id_for_collection(&state.pool, collection_id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let name = dto.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("folder name cannot be empty".into()));
    }

    let grpc_url = dto
        .grpc_url
        .map(|u| u.trim().to_string())
        .filter(|u| !u.is_empty());
    let swagger_url = dto
        .swagger_url
        .map(|u| u.trim().to_string())
        .filter(|u| !u.is_empty());

    let folder_id = Uuid::new_v4();
    let row = sqlx::query_as!(
        CollectionFolder,
        r#"
        INSERT INTO collection_folders (id, collection_id, parent_folder_id, name, grpc_url, swagger_url, settings)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, collection_id, parent_folder_id, name, grpc_url, swagger_url, settings, sort_order, created_at, updated_at
        "#,
        folder_id,
        collection_id,
        dto.parent_folder_id,
        name,
        grpc_url,
        swagger_url,
        dto.settings.unwrap_or_else(|| json!({}))
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "folder".into(),
        action: "create".into(),
        entity_id: folder_id,
    });

    Ok(Json(row))
}

pub async fn update_folder(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<UpdateFolderDto>,
) -> Result<Json<CollectionFolder>, ApiError> {
    let folder = sqlx::query!(
        "SELECT collection_id, parent_folder_id, name, grpc_url, swagger_url, settings, sort_order FROM collection_folders WHERE id = $1",
        id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::NotFound("folder not found".into()))?;

    let ws_id = get_workspace_id_for_collection(&state.pool, folder.collection_id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let new_name = dto.name.as_deref().unwrap_or(&folder.name).trim().to_string();
    let new_parent = match dto.parent_folder_id {
        Some(p) => p,
        None => folder.parent_folder_id,
    };
    let new_sort = dto.sort_order.unwrap_or(folder.sort_order);
    let new_grpc_url = match dto.grpc_url {
        Some(opt) => opt.map(|u| u.trim().to_string()).filter(|u| !u.is_empty()),
        None => folder.grpc_url,
    };
    let new_swagger_url = match dto.swagger_url {
        Some(opt) => opt.map(|u| u.trim().to_string()).filter(|u| !u.is_empty()),
        None => folder.swagger_url,
    };
    let new_settings = dto.settings.unwrap_or(folder.settings);

    let updated = sqlx::query_as!(
        CollectionFolder,
        r#"
        UPDATE collection_folders
        SET name = $1, parent_folder_id = $2, sort_order = $3, grpc_url = $4, swagger_url = $5, settings = $6, updated_at = NOW()
        WHERE id = $7
        RETURNING id, collection_id, parent_folder_id, name, grpc_url, swagger_url, settings, sort_order, created_at, updated_at
        "#,
        new_name,
        new_parent,
        new_sort,
        new_grpc_url,
        new_swagger_url,
        new_settings,
        id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "folder".into(),
        action: "update".into(),
        entity_id: id,
    });

    Ok(Json(updated))
}

pub async fn delete_folder(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let folder = sqlx::query!("SELECT collection_id FROM collection_folders WHERE id = $1", id)
        .fetch_optional(&state.pool)
        .await
        .map_err(ApiError::Database)?
        .ok_or_else(|| ApiError::NotFound("folder not found".into()))?;

    let ws_id = get_workspace_id_for_collection(&state.pool, folder.collection_id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let mut tx = state.pool.begin().await.map_err(ApiError::Database)?;

    // Recursively delete all endpoints in this folder and its descendant subfolders
    sqlx::query!(
        r#"
        WITH RECURSIVE subfolders AS (
            SELECT id FROM collection_folders WHERE id = $1
            UNION ALL
            SELECT cf.id FROM collection_folders cf
            INNER JOIN subfolders s ON cf.parent_folder_id = s.id
        )
        DELETE FROM endpoints WHERE folder_id IN (SELECT id FROM subfolders)
        "#,
        id
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    sqlx::query!("DELETE FROM collection_folders WHERE id = $1", id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::Database)?;

    tx.commit().await.map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "folder".into(),
        action: "delete".into(),
        entity_id: id,
    });

    Ok(Json(json!({ "message": "folder deleted" })))
}

// === Endpoints ===

pub async fn list_endpoints(
    auth: AuthUser,
    Path(collection_id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<Vec<Endpoint>>, ApiError> {
    let ws_id = get_workspace_id_for_collection(&state.pool, collection_id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let rows = sqlx::query!(
        r#"
        SELECT id, collection_id, folder_id, name, protocol, config, sort_order, version, created_at, updated_at
        FROM endpoints
        WHERE collection_id = $1
        ORDER BY sort_order ASC, name ASC
        "#,
        collection_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let endpoints = rows
        .into_iter()
        .filter_map(|r| {
            let protocol = Protocol::from_str_opt(&r.protocol)?;
            Some(Endpoint {
                id: r.id,
                collection_id: r.collection_id,
                folder_id: r.folder_id,
                name: r.name,
                protocol,
                config: r.config,
                sort_order: r.sort_order,
                version: r.version,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
        })
        .collect();

    Ok(Json(endpoints))
}

pub async fn create_endpoint(
    auth: AuthUser,
    Path(collection_id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<CreateEndpointDto>,
) -> Result<Json<Endpoint>, ApiError> {
    let ws_id = get_workspace_id_for_collection(&state.pool, collection_id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let name = dto.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("endpoint name cannot be empty".into()));
    }

    let endpoint_id = Uuid::new_v4();
    let row = sqlx::query!(
        r#"
        INSERT INTO endpoints (id, collection_id, folder_id, name, protocol, config, version)
        VALUES ($1, $2, $3, $4, $5, $6, 1)
        RETURNING id, collection_id, folder_id, name, protocol, config, sort_order, version, created_at, updated_at
        "#,
        endpoint_id,
        collection_id,
        dto.folder_id,
        name,
        dto.protocol.as_str(),
        dto.config
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "endpoint".into(),
        action: "create".into(),
        entity_id: endpoint_id,
    });

    Ok(Json(Endpoint {
        id: row.id,
        collection_id: row.collection_id,
        folder_id: row.folder_id,
        name: row.name,
        protocol: dto.protocol,
        config: row.config,
        sort_order: row.sort_order,
        version: row.version,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

pub async fn get_endpoint(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<Endpoint>, ApiError> {
    let ws_id = get_workspace_id_for_endpoint(&state.pool, id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let row = sqlx::query!(
        r#"
        SELECT id, collection_id, folder_id, name, protocol, config, sort_order, version, created_at, updated_at
        FROM endpoints
        WHERE id = $1
        "#,
        id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let protocol = Protocol::from_str_opt(&row.protocol)
        .ok_or_else(|| ApiError::Internal("corrupted endpoint protocol".into()))?;

    Ok(Json(Endpoint {
        id: row.id,
        collection_id: row.collection_id,
        folder_id: row.folder_id,
        name: row.name,
        protocol,
        config: row.config,
        sort_order: row.sort_order,
        version: row.version,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

pub async fn update_endpoint(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<UpdateEndpointDto>,
) -> Result<Json<Endpoint>, ApiError> {
    let ws_id = get_workspace_id_for_endpoint(&state.pool, id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    let current = sqlx::query!(
        r#"
        SELECT id, collection_id, folder_id, name, protocol, config, sort_order, version
        FROM endpoints
        WHERE id = $1
        "#,
        id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::NotFound("endpoint not found".into()))?;

    // Optimistic concurrency control
    if let Some(expected_ver) = dto.version {
        if expected_ver != current.version {
            return Err(ApiError::Conflict(format!(
                "endpoint version mismatch: expected {}, but server has {}",
                expected_ver, current.version
            )));
        }
    }

    let new_name = dto.name.as_deref().unwrap_or(&current.name).trim().to_string();
    let new_folder = match dto.folder_id {
        Some(f) => f,
        None => current.folder_id,
    };
    let new_config = dto.config.unwrap_or(current.config);
    let new_sort = dto.sort_order.unwrap_or(current.sort_order);
    let next_version = current.version + 1;

    let row = sqlx::query!(
        r#"
        UPDATE endpoints
        SET name = $1, folder_id = $2, config = $3, sort_order = $4, version = $5, updated_at = NOW()
        WHERE id = $6
        RETURNING id, collection_id, folder_id, name, protocol, config, sort_order, version, created_at, updated_at
        "#,
        new_name,
        new_folder,
        new_config,
        new_sort,
        next_version,
        id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let protocol = Protocol::from_str_opt(&row.protocol)
        .ok_or_else(|| ApiError::Internal("corrupted endpoint protocol".into()))?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "endpoint".into(),
        action: "update".into(),
        entity_id: id,
    });

    Ok(Json(Endpoint {
        id: row.id,
        collection_id: row.collection_id,
        folder_id: row.folder_id,
        name: row.name,
        protocol,
        config: row.config,
        sort_order: row.sort_order,
        version: row.version,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

pub async fn delete_endpoint(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let ws_id = get_workspace_id_for_endpoint(&state.pool, id).await?;
    let _ = get_workspace_role(&state.pool, ws_id, auth.user.id).await?;

    sqlx::query!("DELETE FROM endpoints WHERE id = $1", id)
        .execute(&state.pool)
        .await
        .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id: ws_id,
        entity: "endpoint".into(),
        action: "delete".into(),
        entity_id: id,
    });

    Ok(Json(json!({ "message": "endpoint deleted" })))
}
