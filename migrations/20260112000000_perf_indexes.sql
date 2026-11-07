-- Performance indexes for collections, environments, workspaces and saved_responses

-- 1. Collections: replace single-column workspace_id index with sort-covering composite index
DROP INDEX IF EXISTS idx_collections_workspace;
CREATE INDEX IF NOT EXISTS idx_collections_workspace_sort ON collections(workspace_id, sort_order ASC, name ASC);

-- 2. Environments: replace single-column workspace_id index with sort-covering composite index
DROP INDEX IF EXISTS idx_environments_workspace;
CREATE INDEX IF NOT EXISTS idx_environments_workspace_sort ON environments(workspace_id, is_default DESC, name ASC);

-- 3. Saved responses: drop duplicate index redundant with saved_responses_endpoint_id_key
DROP INDEX IF EXISTS idx_saved_responses_endpoint;

-- 4. Workspace members: covering index for user workspaces lookup
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_ws ON workspace_members(user_id, workspace_id, role);
