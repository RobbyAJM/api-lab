export interface EnvSyncApi {
  get: <T = any>(path: string) => Promise<T>;
  post: <T = any>(path: string, body: any) => Promise<T>;
  patch: <T = any>(path: string, body: any) => Promise<T>;
}

export interface EnvSyncResult {
  syncedCount: number;
  syncedKeys: string[];
}

/**
 * Syncs added or modified environment variables from hook scripts (e.g. pm.environment.set)
 * to the active environment on the server.
 */
export async function syncEnvironmentVariables(
  originalVars: Record<string, string>,
  updatedVars: Record<string, string>,
  activeEnvironmentId: string | null | undefined,
  api: EnvSyncApi
): Promise<EnvSyncResult> {
  if (!activeEnvironmentId) {
    return { syncedCount: 0, syncedKeys: [] };
  }

  // 1. Identify changed keys
  const changedKeys: [string, string][] = [];
  for (const [key, val] of Object.entries(updatedVars)) {
    if (originalVars[key] !== val) {
      changedKeys.push([key, val]);
    }
  }

  if (changedKeys.length === 0) {
    return { syncedCount: 0, syncedKeys: [] };
  }

  // 2. Fetch existing variables for this environment
  const existingVars = await api.get<Array<{ id: string; key: string; value: string }>>(
    `/environments/${activeEnvironmentId}/variables`
  );

  const existingMap = new Map<string, { id: string; value: string }>();
  if (Array.isArray(existingVars)) {
    for (const v of existingVars) {
      existingMap.set(v.key, { id: v.id, value: v.value });
    }
  }

  const syncedKeys: string[] = [];

  // 3. Persist each changed variable
  for (const [key, val] of changedKeys) {
    const existing = existingMap.get(key);
    const valStr = String(val);

    if (existing) {
      if (existing.value !== valStr) {
        await api.patch(`/variables/${existing.id}`, {
          value: valStr,
        });
        syncedKeys.push(key);
      }
    } else {
      await api.post(`/environments/${activeEnvironmentId}/variables`, {
        key,
        value: valStr,
        is_sensitive: false,
      });
      syncedKeys.push(key);
    }
  }

  return {
    syncedCount: syncedKeys.length,
    syncedKeys,
  };
}
