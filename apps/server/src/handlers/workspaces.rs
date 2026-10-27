use axum::extract::{Path, State};
use axum::Json;
use chrono::{Duration, Utc};
use rust_core::crypto::{generate_token_hex, hash_token_sha256};
use rust_core::dto::{
    CreateInvitationDto, CreateWorkspaceDto, InvitationResponse, JoinWorkspaceDto, MemberResponse,
    UpdateMemberRoleDto, WorkspaceSummary, WsSyncEvent,
};
use rust_core::models::{InvitationStatus, Role};
use serde_json::json;
use uuid::Uuid;

use crate::error::ApiError;
use crate::middleware::auth::{get_workspace_role, require_workspace_role, AuthUser};
use crate::state::SharedState;

pub async fn list_workspaces(
    auth: AuthUser,
    State(state): State<SharedState>,
) -> Result<Json<Vec<WorkspaceSummary>>, ApiError> {
    let rows = sqlx::query!(
        r#"
        SELECT w.id, w.name, wm.role
        FROM workspace_members wm
        JOIN workspaces w ON wm.workspace_id = w.id
        WHERE wm.user_id = $1
        ORDER BY w.name ASC
        "#,
        auth.user.id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let summaries = rows
        .into_iter()
        .filter_map(|r| {
            Role::from_str_opt(&r.role).map(|role| WorkspaceSummary {
                id: r.id,
                name: r.name,
                role,
            })
        })
        .collect();

    Ok(Json(summaries))
}

pub async fn create_workspace(
    auth: AuthUser,
    State(state): State<SharedState>,
    Json(dto): Json<CreateWorkspaceDto>,
) -> Result<Json<WorkspaceSummary>, ApiError> {
    let name = dto.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("workspace name cannot be empty".into()));
    }

    let mut tx = state.pool.begin().await.map_err(ApiError::Database)?;
    let ws_id = Uuid::new_v4();

    sqlx::query!(
        "INSERT INTO workspaces (id, name) VALUES ($1, $2)",
        ws_id,
        name
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    sqlx::query!(
        "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'admin')",
        ws_id,
        auth.user.id
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    tx.commit().await.map_err(ApiError::Database)?;

    Ok(Json(WorkspaceSummary {
        id: ws_id,
        name: name.to_string(),
        role: Role::Admin,
    }))
}

pub async fn join_workspace(
    auth: AuthUser,
    State(state): State<SharedState>,
    Json(dto): Json<JoinWorkspaceDto>,
) -> Result<Json<WorkspaceSummary>, ApiError> {
    let token = dto.token.trim();
    if token.len() != 64 || !token.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(ApiError::BadRequest("invalid invitation token format".into()));
    }

    let token_hash = hash_token_sha256(token);

    let mut tx = state.pool.begin().await.map_err(ApiError::Database)?;

    let invite = sqlx::query!(
        r#"
        SELECT id, workspace_id, inviter_id, role, expires_at, status
        FROM invitations
        WHERE token_hash = $1
        FOR UPDATE
        "#,
        token_hash
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::BadRequest("invalid or expired invitation".into()))?;

    if invite.status != "pending" || invite.expires_at <= Utc::now() {
        return Err(ApiError::BadRequest("invitation has expired or is no longer valid".into()));
    }

    let assigned_role = Role::from_str_opt(&invite.role)
        .ok_or_else(|| ApiError::Internal("corrupted invitation role".into()))?;

    let existing_member = sqlx::query!(
        "SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        invite.workspace_id,
        auth.user.id
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    if existing_member.is_some() {
        return Err(ApiError::BadRequest("user is already a member of this workspace".into()));
    }

    sqlx::query!(
        r#"
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES ($1, $2, $3)
        "#,
        invite.workspace_id,
        auth.user.id,
        assigned_role.as_str()
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    sqlx::query!(
        "UPDATE invitations SET status = 'accepted' WHERE id = $1",
        invite.id
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    let ws = sqlx::query!("SELECT name FROM workspaces WHERE id = $1", invite.workspace_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(ApiError::Database)?;

    let notif_title = "Team member joined";
    let notif_message = format!("{} accepted your invitation to join {}", auth.user.name.trim(), ws.name);
    let _ = sqlx::query!(
        r#"
        INSERT INTO notifications (user_id, workspace_id, title, message, category)
        VALUES ($1, $2, $3, $4, 'direct')
        "#,
        invite.inviter_id,
        invite.workspace_id,
        notif_title,
        notif_message
    )
    .execute(&mut *tx)
    .await;

    tx.commit().await.map_err(ApiError::Database)?;

    Ok(Json(WorkspaceSummary {
        id: invite.workspace_id,
        name: ws.name,
        role: assigned_role,
    }))
}

pub async fn list_members(
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<Vec<MemberResponse>>, ApiError> {
    // Requires being a member
    let _ = get_workspace_role(&state.pool, workspace_id, auth.user.id).await?;

    let rows = sqlx::query!(
        r#"
        SELECT wm.id, wm.user_id, u.email, u.name, wm.role, wm.created_at
        FROM workspace_members wm
        JOIN users u ON wm.user_id = u.id
        WHERE wm.workspace_id = $1
        ORDER BY wm.created_at ASC
        "#,
        workspace_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let members = rows
        .into_iter()
        .filter_map(|r| {
            Role::from_str_opt(&r.role).map(|role| MemberResponse {
                id: r.id,
                user_id: r.user_id,
                email: r.email,
                name: r.name,
                role,
                created_at: r.created_at,
            })
        })
        .collect();

    Ok(Json(members))
}

pub async fn update_member_role(
    auth: AuthUser,
    Path((workspace_id, member_id)): Path<(Uuid, Uuid)>,
    State(state): State<SharedState>,
    Json(dto): Json<UpdateMemberRoleDto>,
) -> Result<Json<serde_json::Value>, ApiError> {
    require_workspace_role(&state.pool, workspace_id, auth.user.id, Role::Admin).await?;

    let rows_affected = sqlx::query!(
        r#"
        UPDATE workspace_members
        SET role = $1, updated_at = NOW()
        WHERE id = $2 AND workspace_id = $3
        "#,
        dto.role.as_str(),
        member_id,
        workspace_id
    )
    .execute(&state.pool)
    .await
    .map_err(ApiError::Database)?
    .rows_affected();

    if rows_affected == 0 {
        return Err(ApiError::NotFound("workspace member not found".into()));
    }

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id,
        entity: "member".into(),
        action: "update".into(),
        entity_id: member_id,
    });

    Ok(Json(json!({ "message": "member role updated successfully" })))
}

pub async fn remove_member(
    auth: AuthUser,
    Path((workspace_id, member_id)): Path<(Uuid, Uuid)>,
    State(state): State<SharedState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    require_workspace_role(&state.pool, workspace_id, auth.user.id, Role::Admin).await?;

    let target = sqlx::query!(
        "SELECT user_id, role FROM workspace_members WHERE id = $1 AND workspace_id = $2",
        member_id,
        workspace_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::NotFound("member not found".into()))?;

    // If target is admin, make sure there is at least one other admin
    if target.role == "admin" {
        let admin_count = sqlx::query!(
            "SELECT COUNT(*) as count FROM workspace_members WHERE workspace_id = $1 AND role = 'admin'",
            workspace_id
        )
        .fetch_one(&state.pool)
        .await
        .map_err(ApiError::Database)?
        .count
        .unwrap_or(0);

        if admin_count <= 1 {
            return Err(ApiError::BadRequest("cannot remove the last admin of the workspace".into()));
        }
    }

    sqlx::query!(
        "DELETE FROM workspace_members WHERE id = $1 AND workspace_id = $2",
        member_id,
        workspace_id
    )
    .execute(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id,
        entity: "member".into(),
        action: "delete".into(),
        entity_id: member_id,
    });

    Ok(Json(json!({ "message": "member removed successfully" })))
}

pub async fn create_invitation(
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<CreateInvitationDto>,
) -> Result<Json<InvitationResponse>, ApiError> {
    require_workspace_role(&state.pool, workspace_id, auth.user.id, Role::Admin).await?;

    let token = generate_token_hex();
    let token_hash = hash_token_sha256(&token);
    let days = dto.expires_in_days.unwrap_or(7).clamp(1, 30);
    let expires_at = Utc::now() + Duration::days(days);
    let inv_id = Uuid::new_v4();

    sqlx::query!(
        r#"
        INSERT INTO invitations (id, workspace_id, token_hash, role, inviter_id, expires_at, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        "#,
        inv_id,
        workspace_id,
        token_hash,
        dto.role.as_str(),
        auth.user.id,
        expires_at
    )
    .execute(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    Ok(Json(InvitationResponse {
        id: inv_id,
        workspace_id,
        token: Some(token),
        role: dto.role,
        inviter_id: auth.user.id,
        expires_at,
        status: InvitationStatus::Pending,
        created_at: Utc::now(),
    }))
}

pub async fn list_invitations(
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<Vec<InvitationResponse>>, ApiError> {
    require_workspace_role(&state.pool, workspace_id, auth.user.id, Role::Admin).await?;

    let rows = sqlx::query!(
        r#"
        SELECT id, workspace_id, role, inviter_id, expires_at, status, created_at
        FROM invitations
        WHERE workspace_id = $1 AND status = 'pending' AND expires_at > NOW()
        ORDER BY created_at DESC
        "#,
        workspace_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let invitations = rows
        .into_iter()
        .filter_map(|r| {
            let role = Role::from_str_opt(&r.role)?;
            Some(InvitationResponse {
                id: r.id,
                workspace_id: r.workspace_id,
                token: None, // Do not expose token hash or token
                role,
                inviter_id: r.inviter_id,
                expires_at: r.expires_at,
                status: InvitationStatus::Pending,
                created_at: r.created_at,
            })
        })
        .collect();

    Ok(Json(invitations))
}

pub async fn revoke_invitation(
    auth: AuthUser,
    Path((workspace_id, id)): Path<(Uuid, Uuid)>,
    State(state): State<SharedState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    require_workspace_role(&state.pool, workspace_id, auth.user.id, Role::Admin).await?;

    let rows_affected = sqlx::query!(
        "UPDATE invitations SET status = 'revoked' WHERE id = $1 AND workspace_id = $2 AND status = 'pending'",
        id,
        workspace_id
    )
    .execute(&state.pool)
    .await
    .map_err(ApiError::Database)?
    .rows_affected();

    if rows_affected == 0 {
        return Err(ApiError::NotFound("invitation not found or already closed".into()));
    }

    Ok(Json(json!({ "message": "invitation revoked" })))
}

pub async fn update_workspace(
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    State(state): State<SharedState>,
    Json(dto): Json<CreateWorkspaceDto>,
) -> Result<Json<WorkspaceSummary>, ApiError> {
    let role = require_workspace_role(&state.pool, workspace_id, auth.user.id, Role::Admin).await?;
    let name = dto.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("workspace name cannot be empty".into()));
    }

    sqlx::query!(
        "UPDATE workspaces SET name = $1, updated_at = NOW() WHERE id = $2",
        name,
        workspace_id
    )
    .execute(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id,
        entity: "workspace".into(),
        action: "update".into(),
        entity_id: workspace_id,
    });

    Ok(Json(WorkspaceSummary {
        id: workspace_id,
        name: name.to_string(),
        role,
    }))
}

pub async fn delete_workspace(
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    State(state): State<SharedState>,
) -> Result<axum::http::StatusCode, ApiError> {
    require_workspace_role(&state.pool, workspace_id, auth.user.id, Role::Admin).await?;

    sqlx::query!("DELETE FROM workspaces WHERE id = $1", workspace_id)
        .execute(&state.pool)
        .await
        .map_err(ApiError::Database)?;

    let _ = state.tx_ws.send(WsSyncEvent {
        workspace_id,
        entity: "workspace".into(),
        action: "delete".into(),
        entity_id: workspace_id,
    });

    Ok(axum::http::StatusCode::NO_CONTENT)
}
