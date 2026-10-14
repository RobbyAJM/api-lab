import type { Environment, VariableResponse } from '@api-lab/api-types';

export interface EnvironmentApi {
  post: <T = any>(path: string, body: any) => Promise<T>;
}

/**
 * Computes duplicate environment name given an original environment name.
 * e.g. "DEV" -> "DEV [Duplicate]"
 */
export function getDuplicateEnvironmentName(originalName: string): string {
  const trimmed = (originalName || '').trim();
  if (!trimmed) {
    return '[Duplicate]';
  }
  return `${trimmed} [Duplicate]`;
}

/**
 * Validates environment name before creation or renaming.
 */
export function validateEnvironmentName(name: string): { valid: boolean; error?: string } {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Environment name cannot be empty' };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: 'Environment name cannot exceed 100 characters' };
  }
  return { valid: true };
}

/**
 * Filters environment variables by search keyword across key and value.
 */
export function filterVariables(variables: VariableResponse[], query: string): VariableResponse[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    return variables;
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  return variables.filter((v) => {
    const haystack = `${v.key} ${v.value}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

export interface DuplicateResult {
  newEnvironment: Environment;
  copiedVariablesCount: number;
}

/**
 * Duplicates an existing environment and copies all its variables.
 * ponytail: clones variables directly. Version history snapshotting skipped, add when environment rollback requested.
 */
export async function duplicateEnvironment(
  sourceEnv: { id: string; name: string },
  sourceVariables: Array<{ key: string; value: string; is_sensitive: boolean }>,
  workspaceId: string,
  api: EnvironmentApi
): Promise<DuplicateResult> {
  const newName = getDuplicateEnvironmentName(sourceEnv.name);

  // 1. Create duplicate environment
  const newEnvironment = await api.post<Environment>(
    `/workspaces/${workspaceId}/environments`,
    { name: newName }
  );

  // 2. Clone variables sequentially or in parallel
  let copiedCount = 0;
  if (Array.isArray(sourceVariables) && sourceVariables.length > 0) {
    await Promise.all(
      sourceVariables.map(async (v) => {
        await api.post(`/environments/${newEnvironment.id}/variables`, {
          key: v.key,
          value: v.value,
          is_sensitive: v.is_sensitive,
        });
        copiedCount++;
      })
    );
  }

  return {
    newEnvironment,
    copiedVariablesCount: copiedCount,
  };
}
