// ponytail: custom icon mapping skipped; add when environments support icons/tags.

export const WORKSPACE_ENV_STORAGE_PREFIX = 'api_lab_workspace_env_';
export const NO_ENVIRONMENT_VALUE = '__none__';

/**
 * Returns Tailwind size classes for the environment dropdown button.
 */
export function getEnvironmentDropdownSizeClass(size: 'xs' | 'sm' | 'md' = 'sm'): string {
  switch (size) {
    case 'xs':
      return 'px-2 py-0.5 text-[11px]';
    case 'md':
      return 'px-3 py-1.5 text-xs';
    case 'sm':
    default:
      return 'px-2.5 py-1 text-xs';
  }
}

/**
 * Returns display label for the active environment.
 */
export function getEnvironmentDropdownLabel(activeEnv?: { name: string } | null): string {
  return activeEnv?.name?.trim() || 'No Environment';
}

/**
 * Returns tooltip description for the environment dropdown button.
 */
export function getEnvironmentDropdownTitle(activeEnv?: { name: string } | null): string {
  const name = activeEnv?.name?.trim();
  return name ? `Active Environment: ${name}` : 'No Environment active';
}

/**
 * Resolves active environment from environments list.
 */
export function findActiveEnvironment<T extends { id: string }>(
  environments: T[],
  activeId?: string | null
): T | undefined {
  if (!activeId || !environments || environments.length === 0) {
    return undefined;
  }
  return environments.find((env) => env.id === activeId);
}

/**
 * Returns localStorage key for a workspace's active environment.
 */
export function getWorkspaceEnvStorageKey(workspaceId: string): string {
  return `${WORKSPACE_ENV_STORAGE_PREFIX}${workspaceId}`;
}

/**
 * Reads stored environment ID (or '__none__') for a workspace.
 */
export function getStoredWorkspaceEnvironment(
  workspaceId: string,
  storage?: Storage | null
): string | null {
  if (!workspaceId) return null;
  const store = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return null;
  return store.getItem(getWorkspaceEnvStorageKey(workspaceId));
}

/**
 * Persists selected environment ID (or '__none__' for null) for a workspace.
 */
export function setStoredWorkspaceEnvironment(
  workspaceId: string,
  envId: string | null,
  storage?: Storage | null
): void {
  if (!workspaceId) return;
  const store = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return;
  const key = getWorkspaceEnvStorageKey(workspaceId);
  if (envId === null) {
    store.setItem(key, NO_ENVIRONMENT_VALUE);
  } else {
    store.setItem(key, envId);
  }
}

/**
 * Removes stored workspace environment when a workspace is deleted.
 */
export function removeStoredWorkspaceEnvironment(
  workspaceId: string,
  storage?: Storage | null
): void {
  if (!workspaceId) return;
  const store = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return;
  store.removeItem(getWorkspaceEnvStorageKey(workspaceId));
}

/**
 * Resolves active environment ID from environments list and stored preference.
 * - If stored is '__none__', returns null (explicit No Environment).
 * - If stored ID exists in environments list, returns stored ID.
 * - Otherwise falls back to default environment (is_default) or first environment.
 */
export function resolveWorkspaceEnvironment<T extends { id: string; is_default?: boolean }>(
  environments: T[],
  storedEnvId: string | null
): string | null {
  if (!environments || environments.length === 0) {
    return null;
  }
  if (storedEnvId === NO_ENVIRONMENT_VALUE) {
    return null;
  }
  if (storedEnvId && environments.some((env) => env.id === storedEnvId)) {
    return storedEnvId;
  }
  const defaultEnv = environments.find((env) => env.is_default) || environments[0];
  return defaultEnv ? defaultEnv.id : null;
}

