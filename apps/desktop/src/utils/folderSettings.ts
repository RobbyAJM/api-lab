import type {
  CollectionSettings,
  CollectionFolder,
  CollectionAuthSettings,
} from '@api-lab/api-types';

export interface ResolvedInheritedAuth {
  auth: CollectionAuthSettings;
  sourceType: 'folder' | 'collection';
  sourceId: string;
  sourceName: string;
}

export interface InheritedAuthHeader {
  key: string;
  value: string;
  description: string;
  sourceType: 'folder' | 'collection';
  sourceId: string;
  sourceName: string;
}

function substitute(val: string, vars?: Record<string, string>): string {
  if (!val || !vars) return val;
  return val.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/**
 * Resolves inherited authorization from the hierarchy:
 * Folder (deepest subfolder -> parent folders -> root folder) -> Collection.
 * Deeper folders have higher priority over parent folders and collection.
 * If a folder specifies 'none', inherited auth is disabled.
 * If a folder specifies 'inherit', it defers to its parent or collection.
 */
export function resolveInheritedAuth(
  collection: { id: string; name: string; settings?: CollectionSettings } | undefined,
  folders: CollectionFolder[],
  folderId: string | null | undefined
): ResolvedInheritedAuth | null {
  if (folderId) {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const visited = new Set<string>();
    let current = byId.get(folderId);

    // Check chain from leaf folder up to root ancestor
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const folderAuth = (current.settings as CollectionSettings | undefined)?.auth;
      if (folderAuth) {
        if (folderAuth.auth_type === 'none') {
          return null; // Explicit 'none' breaks inheritance
        }
        if (folderAuth.auth_type && folderAuth.auth_type !== 'inherit') {
          return {
            auth: folderAuth,
            sourceType: 'folder',
            sourceId: current.id,
            sourceName: current.name,
          };
        }
      }
      current = current.parent_folder_id ? byId.get(current.parent_folder_id) : undefined;
    }
  }

  // Fallback to collection auth
  const colAuth = collection?.settings?.auth;
  if (colAuth && colAuth.auth_type && colAuth.auth_type !== 'none' && colAuth.auth_type !== 'inherit') {
    return {
      auth: colAuth,
      sourceType: 'collection',
      sourceId: collection?.id || '',
      sourceName: collection?.name || 'Collection',
    };
  }

  return null;
}

/**
 * Generates the uneditable inherited authorization header row for HTTP or gRPC.
 * Case-sensitive: preserves exact casing of header_name.
 */
export function getInheritedAuthHeader(
  resolved: ResolvedInheritedAuth | null,
  protocol: 'http' | 'grpc',
  variables?: Record<string, string>
): InheritedAuthHeader | null {
  if (!resolved || !resolved.auth || resolved.auth.auth_type === 'none') {
    return null;
  }

  const { auth, sourceType, sourceId, sourceName } = resolved;
  const desc = `Inherited from ${sourceType}: ${sourceName}`;

  if (auth.auth_type === 'bearer' && auth.token) {
    const rawToken = substitute(auth.token.trim(), variables).trim();
    const val = rawToken.toLowerCase().startsWith('bearer ') ? rawToken : `Bearer ${rawToken}`;
    return {
      key: protocol === 'grpc' ? 'authorization' : 'Authorization',
      value: val,
      description: desc,
      sourceType,
      sourceId,
      sourceName,
    };
  }

  if (auth.auth_type === 'basic') {
    const user = substitute(auth.username || '', variables);
    const pass = substitute(auth.password || '', variables);
    const b64 =
      typeof btoa === 'function'
        ? btoa(`${user}:${pass}`)
        : (globalThis as any).Buffer?.from(`${user}:${pass}`).toString('base64') || '';
    return {
      key: protocol === 'grpc' ? 'authorization' : 'Authorization',
      value: `Basic ${b64}`,
      description: desc,
      sourceType,
      sourceId,
      sourceName,
    };
  }

  if (auth.auth_type === 'custom' && auth.header_name && auth.header_value) {
    // Preserve exact case
    const key = substitute(auth.header_name.trim(), variables).trim();
    const value = substitute(auth.header_value.trim(), variables).trim();
    return {
      key,
      value,
      description: desc,
      sourceType,
      sourceId,
      sourceName,
    };
  }

  return null;
}

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
    chain.unshift(current); // root to leaf
    current = current.parent_folder_id ? byId.get(current.parent_folder_id) : undefined;
  }

  // Use resolveInheritedAuth logic to resolve auth
  const resolved = resolveInheritedAuth(
    collectionSettings ? { id: '', name: '', settings: collectionSettings } : undefined,
    folders,
    folderId
  );

  let result = collectionSettings ? { ...collectionSettings } : undefined;
  for (const folder of chain) {
    const settings = folder.settings as CollectionSettings | undefined;
    if (!settings) continue;
    result = {
      ...(result || {}),
      ...settings,
      headers: settings.headers || result?.headers,
      timeout_ms: settings.timeout_ms || result?.timeout_ms,
    };
  }

  if (result || resolved) {
    return {
      ...(result || {}),
      auth: resolved ? resolved.auth : (result?.auth?.auth_type === 'none' ? { auth_type: 'none' } : undefined),
    };
  }
  return undefined;
}
