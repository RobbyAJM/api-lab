import type { CollectionSettings, CollectionFolder } from '@api-lab/api-types';

export function mergeFolderSettings(
  collectionSettings: CollectionSettings | undefined,
  folders: CollectionFolder[],
  folderId: string | null | undefined
): CollectionSettings | undefined {
  if (!folderId) return collectionSettings;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const chain: CollectionFolder[] = [];
  const visited = new Set<string>();
  let current = byId.get(folderId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parent_folder_id ? byId.get(current.parent_folder_id) : undefined;
  }
  let result = collectionSettings ? { ...collectionSettings } : undefined;
  for (const folder of chain) {
    const settings = folder.settings as CollectionSettings | undefined;
    if (!settings) continue;
    result = {
      ...(result || {}),
      ...settings,
      auth: settings.auth || result?.auth,
      headers: settings.headers || result?.headers,
      timeout_ms: settings.timeout_ms || result?.timeout_ms,
    };
  }
  return result;
}
