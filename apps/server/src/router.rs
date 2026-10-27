use axum::routing::{delete, get, patch, post, put};
use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::handlers::{
    auth, collections, environments, notifications, saved_responses, workspaces, ws,
};
use crate::state::SharedState;

pub fn create_router(state: SharedState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_routes = Router::new()
        .route("/health", get(|| async { "ok" }))
        // Auth
        .route("/auth/register", post(auth::register))
        .route("/invitations/accept", post(auth::accept_invitation))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/forgot-password", post(auth::forgot_password))
        .route("/auth/reset-password", post(auth::reset_password))
        .route("/auth/me", get(auth::get_me))
        .route("/auth/theme", patch(auth::update_theme))
        .route("/auth/profile", put(auth::update_profile).patch(auth::update_profile))
        // Notifications
        .route("/notifications", get(notifications::list_notifications))
        .route("/notifications/{id}/read", patch(notifications::mark_notification_read))
        .route("/notifications/mark-all-read", post(notifications::mark_all_notifications_read))
        .route("/notifications/{id}", delete(notifications::delete_notification))
        // Workspaces
        .route("/workspaces", get(workspaces::list_workspaces).post(workspaces::create_workspace))
        .route("/workspaces/join", post(workspaces::join_workspace))
        .route(
            "/workspaces/{workspace_id}",
            patch(workspaces::update_workspace).delete(workspaces::delete_workspace),
        )
        .route(
            "/workspaces/{workspace_id}/members",
            get(workspaces::list_members),
        )
        .route(
            "/workspaces/{workspace_id}/members/{member_id}",
            patch(workspaces::update_member_role).delete(workspaces::remove_member),
        )
        .route(
            "/workspaces/{workspace_id}/invitations",
            get(workspaces::list_invitations).post(workspaces::create_invitation),
        )
        .route(
            "/workspaces/{workspace_id}/invitations/{id}",
            delete(workspaces::revoke_invitation),
        )
        // Collections & Folders
        .route(
            "/workspaces/{workspace_id}/collections",
            get(collections::list_collections).post(collections::create_collection),
        )
        .route(
            "/collections/{id}",
            get(collections::get_collection)
                .patch(collections::update_collection)
                .delete(collections::delete_collection),
        )
        .route(
            "/collections/{collection_id}/folders",
            get(collections::list_folders).post(collections::create_folder),
        )
        .route(
            "/folders/{id}",
            patch(collections::update_folder).delete(collections::delete_folder),
        )
        // Endpoints
        .route(
            "/collections/{collection_id}/endpoints",
            get(collections::list_endpoints).post(collections::create_endpoint),
        )
        .route(
            "/endpoints/{id}",
            get(collections::get_endpoint)
                .patch(collections::update_endpoint)
                .delete(collections::delete_endpoint),
        )
        // Environments & Variables
        .route(
            "/workspaces/{workspace_id}/environments",
            get(environments::list_environments).post(environments::create_environment),
        )
        .route(
            "/environments/{id}",
            patch(environments::update_environment).delete(environments::delete_environment),
        )
        .route(
            "/environments/{id}/variables",
            get(environments::list_variables).post(environments::create_variable),
        )
        .route(
            "/variables/{id}",
            patch(environments::update_variable).delete(environments::delete_variable),
        )
        // Saved Responses
        .route(
            "/endpoints/{id}/saved-response",
            get(saved_responses::get_saved_response)
                .put(saved_responses::put_saved_response)
                .delete(saved_responses::delete_saved_response),
        )
        // WebSocket sync
        .route("/workspaces/{workspace_id}/ws", get(ws::ws_handler));

    Router::new()
        .route("/health", get(|| async { "ok" }))
        .nest("/api/v1", api_routes)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
