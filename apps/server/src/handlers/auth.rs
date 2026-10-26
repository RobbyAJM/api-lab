use axum::extract::State;
use axum::Json;
use chrono::{Duration, Utc};
use rust_core::crypto::{
    generate_token_hex, hash_password, hash_token_sha256, verify_password,
};
use rust_core::dto::{
    AuthResponse, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, UpdateProfileDto,
    UpdateThemeDto, UserSummary, WorkspaceSummary,
};
use rust_core::models::{Role, User};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::error::ApiError;
use crate::middleware::auth::AuthUser;
use crate::state::SharedState;

#[derive(Debug, Deserialize)]
pub struct BootstrapRegisterDto {
    pub email: String,
    pub name: String,
    pub password: String,
    pub workspace_name: Option<String>,
}

pub async fn register(
    State(state): State<SharedState>,
    Json(dto): Json<BootstrapRegisterDto>,
) -> Result<Json<AuthResponse>, ApiError> {
    let email = dto.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err(ApiError::BadRequest("invalid email address".into()));
    }
    if dto.name.trim().is_empty() {
        return Err(ApiError::BadRequest("name cannot be empty".into()));
    }
    if dto.password.len() < 8 {
        return Err(ApiError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }

    // Check if user exists
    let existing = sqlx::query!("SELECT id FROM users WHERE email = $1", email)
        .fetch_optional(&state.pool)
        .await
        .map_err(ApiError::Database)?;
    if existing.is_some() {
        return Err(ApiError::Conflict("user with this email already exists".into()));
    }

    let password_hash = hash_password(&dto.password)?;
    let user_id = Uuid::new_v4();

    let mut tx = state.pool.begin().await.map_err(ApiError::Database)?;

    // Create user
    sqlx::query!(
        r#"
        INSERT INTO users (id, email, name, password_hash, role)
        VALUES ($1, $2, $3, $4, 'admin')
        "#,
        user_id,
        email,
        dto.name.trim(),
        password_hash
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    // Create default workspace for new user
    let workspace_id = Uuid::new_v4();
    let ws_name = dto
        .workspace_name
        .unwrap_or_else(|| format!("{}'s Workspace", dto.name.trim()));

    sqlx::query!(
        r#"
        INSERT INTO workspaces (id, name)
        VALUES ($1, $2)
        "#,
        workspace_id,
        ws_name
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    // Add user as admin to workspace
    sqlx::query!(
        r#"
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES ($1, $2, 'admin')
        "#,
        workspace_id,
        user_id
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    // Create session
    let session_token = generate_token_hex();
    let token_hash = hash_token_sha256(&session_token);
    let expires_at = Utc::now() + Duration::days(30);

    sqlx::query!(
        r#"
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        "#,
        user_id,
        token_hash,
        expires_at
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    tx.commit().await.map_err(ApiError::Database)?;

    Ok(Json(AuthResponse {
        token: session_token,
        user: UserSummary {
            id: user_id,
            email,
            name: dto.name.trim().to_string(),
            role: "admin".into(),
            theme: "api-lab".into(),
            avatar: "bottts:api-lab".into(),
        },
        workspace: Some(WorkspaceSummary {
            id: workspace_id,
            name: ws_name,
            role: Role::Admin,
        }),
    }))
}

pub async fn accept_invitation(
    State(state): State<SharedState>,
    Json(dto): Json<RegisterDto>,
) -> Result<Json<AuthResponse>, ApiError> {
    let email = dto.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err(ApiError::BadRequest("invalid email address".into()));
    }
    if dto.name.trim().is_empty() {
        return Err(ApiError::BadRequest("name cannot be empty".into()));
    }
    if dto.password.len() < 8 {
        return Err(ApiError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }

    let token_hash = hash_token_sha256(&dto.invitation_token);

    let mut tx = state.pool.begin().await.map_err(ApiError::Database)?;

    // Validate invitation
    let invite = sqlx::query!(
        r#"
        SELECT id, workspace_id, role, expires_at, status
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

    // Create or find user
    let existing_user = sqlx::query!("SELECT id, name, role FROM users WHERE email = $1", email)
        .fetch_optional(&mut *tx)
        .await
        .map_err(ApiError::Database)?;

    let user_id = if let Some(u) = existing_user {
        u.id
    } else {
        let new_user_id = Uuid::new_v4();
        let password_hash = hash_password(&dto.password)?;
        sqlx::query!(
            r#"
            INSERT INTO users (id, email, name, password_hash, role)
            VALUES ($1, $2, $3, $4, $5)
            "#,
            new_user_id,
            email,
            dto.name.trim(),
            password_hash,
            assigned_role.as_str()
        )
        .execute(&mut *tx)
        .await
        .map_err(ApiError::Database)?;
        new_user_id
    };

    // Add user to workspace
    sqlx::query!(
        r#"
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
        "#,
        invite.workspace_id,
        user_id,
        assigned_role.as_str()
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    // Mark invitation accepted
    sqlx::query!(
        "UPDATE invitations SET status = 'accepted' WHERE id = $1",
        invite.id
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    // Fetch workspace name
    let ws = sqlx::query!("SELECT name FROM workspaces WHERE id = $1", invite.workspace_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(ApiError::Database)?;

    // Create session
    let session_token = generate_token_hex();
    let sess_token_hash = hash_token_sha256(&session_token);
    let expires_at = Utc::now() + Duration::days(30);

    sqlx::query!(
        r#"
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        "#,
        user_id,
        sess_token_hash,
        expires_at
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    tx.commit().await.map_err(ApiError::Database)?;

    Ok(Json(AuthResponse {
        token: session_token,
        user: UserSummary {
            id: user_id,
            email,
            name: dto.name.trim().to_string(),
            role: assigned_role.as_str().into(),
            theme: "api-lab".into(),
            avatar: "bottts:api-lab".into(),
        },
        workspace: Some(WorkspaceSummary {
            id: invite.workspace_id,
            name: ws.name,
            role: assigned_role,
        }),
    }))
}

pub async fn login(
    State(state): State<SharedState>,
    Json(dto): Json<LoginDto>,
) -> Result<Json<AuthResponse>, ApiError> {
    let email = dto.email.trim().to_lowercase();
    let user = sqlx::query_as!(
        User,
        r#"
        SELECT id, email, name, password_hash, role, theme, avatar, created_at, updated_at
        FROM users
        WHERE email = $1
        "#,
        email
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::Unauthorized("invalid email or password".into()))?;

    let valid = verify_password(&dto.password, &user.password_hash)?;
    if !valid {
        return Err(ApiError::Unauthorized("invalid email or password".into()));
    }

    // Get primary workspace
    let ws = sqlx::query!(
        r#"
        SELECT w.id, w.name, wm.role
        FROM workspace_members wm
        JOIN workspaces w ON wm.workspace_id = w.id
        WHERE wm.user_id = $1
        ORDER BY wm.created_at ASC
        LIMIT 1
        "#,
        user.id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    let workspace_summary = ws.and_then(|w| {
        Role::from_str_opt(&w.role).map(|role| WorkspaceSummary {
            id: w.id,
            name: w.name,
            role,
        })
    });

    let session_token = generate_token_hex();
    let token_hash = hash_token_sha256(&session_token);
    let expires_at = Utc::now() + Duration::days(30);

    sqlx::query!(
        r#"
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        "#,
        user.id,
        token_hash,
        expires_at
    )
    .execute(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    Ok(Json(AuthResponse {
        token: session_token,
        user: UserSummary {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            theme: user.theme,
            avatar: user.avatar,
        },
        workspace: workspace_summary,
    }))
}

pub async fn logout(
    auth: AuthUser,
    State(state): State<SharedState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    sqlx::query!(
        "DELETE FROM sessions WHERE token_hash = $1",
        auth.session_token_hash
    )
    .execute(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    Ok(Json(json!({ "message": "logged out successfully" })))
}

pub async fn forgot_password(
    State(state): State<SharedState>,
    Json(dto): Json<ForgotPasswordDto>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let email = dto.email.trim().to_lowercase();
    let user_opt = sqlx::query!("SELECT id FROM users WHERE email = $1", email)
        .fetch_optional(&state.pool)
        .await
        .map_err(ApiError::Database)?;

    if let Some(user) = user_opt {
        let token = generate_token_hex();
        let token_hash = hash_token_sha256(&token);
        let expires_at = Utc::now() + Duration::hours(1);

        sqlx::query!(
            r#"
            INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
            VALUES ($1, $2, $3)
            "#,
            user.id,
            token_hash,
            expires_at
        )
        .execute(&state.pool)
        .await
        .map_err(ApiError::Database)?;

        // Dev mode inspection method: log to stdout
        tracing::info!(
            "[DEV-MAILER] Password reset link for {}: http://localhost:5173/reset-password?token={}",
            email,
            token
        );
        println!(
            "======================================================================\n\
            [DEV PASSWORD RESET]\n\
            Email: {}\n\
            Reset Token: {}\n\
            Reset Link: http://localhost:5173/reset-password?token={}\n\
            ======================================================================",
            email, token, token
        );
    }

    // Always return generic success to avoid email enumeration
    Ok(Json(json!({
        "message": "if the email is registered, a password reset link has been generated"
    })))
}

pub async fn reset_password(
    State(state): State<SharedState>,
    Json(dto): Json<ResetPasswordDto>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if dto.new_password.len() < 8 {
        return Err(ApiError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }

    let token_hash = hash_token_sha256(&dto.token);

    let mut tx = state.pool.begin().await.map_err(ApiError::Database)?;

    let record = sqlx::query!(
        r#"
        SELECT id, user_id, expires_at, used_at
        FROM password_reset_tokens
        WHERE token_hash = $1
        FOR UPDATE
        "#,
        token_hash
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::BadRequest("invalid or expired reset token".into()))?;

    if record.used_at.is_some() || record.expires_at <= Utc::now() {
        return Err(ApiError::BadRequest("token has expired or already been used".into()));
    }

    let new_hash = hash_password(&dto.new_password)?;

    sqlx::query!(
        "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
        new_hash,
        record.user_id
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    sqlx::query!(
        "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1",
        record.id
    )
    .execute(&mut *tx)
    .await
    .map_err(ApiError::Database)?;

    // Invalidate all existing sessions
    sqlx::query!("DELETE FROM sessions WHERE user_id = $1", record.user_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::Database)?;

    tx.commit().await.map_err(ApiError::Database)?;

    Ok(Json(json!({ "message": "password reset successfully" })))
}

#[derive(Serialize)]
pub struct MeResponse {
    pub user: UserSummary,
    pub workspaces: Vec<WorkspaceSummary>,
}

pub async fn get_me(
    auth: AuthUser,
    State(state): State<SharedState>,
) -> Result<Json<MeResponse>, ApiError> {
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

    let workspaces = rows
        .into_iter()
        .filter_map(|r| {
            Role::from_str_opt(&r.role).map(|role| WorkspaceSummary {
                id: r.id,
                name: r.name,
                role,
            })
        })
        .collect();

    Ok(Json(MeResponse {
        user: UserSummary {
            id: auth.user.id,
            email: auth.user.email,
            name: auth.user.name,
            role: auth.user.role,
            theme: auth.user.theme,
            avatar: auth.user.avatar,
        },
        workspaces,
    }))
}

pub async fn update_theme(
    auth: AuthUser,
    State(state): State<SharedState>,
    Json(dto): Json<UpdateThemeDto>,
) -> Result<Json<UserSummary>, ApiError> {
    let theme = dto.theme.trim();
    if theme.is_empty() || theme.len() > 64 {
        return Err(ApiError::BadRequest("invalid theme identifier".into()));
    }

    let updated = sqlx::query!(
        r#"
        UPDATE users
        SET theme = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, email, name, role, theme, avatar
        "#,
        theme,
        auth.user.id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    Ok(Json(UserSummary {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        theme: updated.theme,
        avatar: updated.avatar,
    }))
}

pub async fn update_profile(
    auth: AuthUser,
    State(state): State<SharedState>,
    Json(dto): Json<UpdateProfileDto>,
) -> Result<Json<UserSummary>, ApiError> {
    let new_name = dto
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&auth.user.name);
    let new_avatar = dto
        .avatar
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&auth.user.avatar);

    let updated = sqlx::query!(
        r#"
        UPDATE users
        SET name = $1, avatar = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id, email, name, role, theme, avatar
        "#,
        new_name,
        new_avatar,
        auth.user.id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(ApiError::Database)?;

    Ok(Json(UserSummary {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        theme: updated.theme,
        avatar: updated.avatar,
    }))
}
