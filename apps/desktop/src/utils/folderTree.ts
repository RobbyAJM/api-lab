import type { CollectionFolder, Endpoint } from '@api-lab/api-types';
import {
  combineSwaggerUrl,
  splitSwaggerUrl,
  normalizeBaseUrlTemplate,
  extractUrlPathname,
} from './swaggerParser.ts';

export interface FolderTreeNode {
  folder: CollectionFolder;
  children: FolderTreeNode[];
  endpoints: Endpoint[];
}

export interface CollectionTree {
  rootEndpoints: Endpoint[];
  rootFolders: FolderTreeNode[];
}

/**
 * Builds a hierarchical tree from flat lists of collection folders and endpoints.
 * Accurately supports arbitrary levels of nested child folders.
 */
export function buildFolderTree(
  folders: CollectionFolder[],
  endpoints: Endpoint[]
): CollectionTree {
  // 1. Group endpoints by folder_id
  const endpointsByFolder = new Map<string, Endpoint[]>();
  const rootEndpoints: Endpoint[] = [];

  for (const ep of endpoints) {
    if (!ep.folder_id) {
      rootEndpoints.push(ep);
    } else {
      const list = endpointsByFolder.get(ep.folder_id) || [];
      list.push(ep);
      endpointsByFolder.set(ep.folder_id, list);
    }
  }

  // Sort endpoints: sort_order asc, then name asc
  const sortEndpoints = (a: Endpoint, b: Endpoint) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  };
  rootEndpoints.sort(sortEndpoints);
  for (const list of endpointsByFolder.values()) {
    list.sort(sortEndpoints);
  }

  // 2. Group folders by parent_folder_id
  const foldersByParent = new Map<string, CollectionFolder[]>();
  const rootFolderList: CollectionFolder[] = [];

  for (const folder of folders) {
    if (!folder.parent_folder_id) {
      rootFolderList.push(folder);
    } else {
      const list = foldersByParent.get(folder.parent_folder_id) || [];
      list.push(folder);
      foldersByParent.set(folder.parent_folder_id, list);
    }
  }

  const sortFolders = (a: CollectionFolder, b: CollectionFolder) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  };
  rootFolderList.sort(sortFolders);
  for (const list of foldersByParent.values()) {
    list.sort(sortFolders);
  }

  // 3. Build recursive nodes
  function buildNode(folder: CollectionFolder): FolderTreeNode {
    const rawChildren = foldersByParent.get(folder.id) || [];
    const children = rawChildren.map((child) => buildNode(child));
    const folderEps = endpointsByFolder.get(folder.id) || [];

    return {
      folder,
      children,
      endpoints: folderEps,
    };
  }

  const rootFolders = rootFolderList.map((f) => buildNode(f));

  return {
    rootEndpoints,
    rootFolders,
  };
}

/**
 * Searches and filters the tree by search query.
 * Matches collection name, folder name, endpoint name, or protocol/method.
 * Returns the filtered tree and the set of folder IDs that should be expanded.
 */
export function filterCollectionTree(
  tree: CollectionTree,
  query: string
): {
  filteredTree: CollectionTree;
  matchedFolderIds: Set<string>;
  totalMatches: number;
} {
  const q = query.trim().toLowerCase();
  if (!q) {
    return {
      filteredTree: tree,
      matchedFolderIds: new Set<string>(),
      totalMatches: 0,
    };
  }

  const matchedFolderIds = new Set<string>();
  let totalMatches = 0;

  function matchesEndpoint(ep: Endpoint): boolean {
    if (ep.name.toLowerCase().includes(q)) return true;
    if (ep.protocol.toLowerCase().includes(q)) return true;
    if (ep.protocol === 'fix') {
      const fixTarget = [
        ep.config?.begin_string,
        ep.config?.host,
        ep.config?.port,
        ep.config?.sender_comp_id,
        ep.config?.target_comp_id,
      ]
        .filter((value) => typeof value === 'string')
        .join(' ')
        .toLowerCase();
      if (fixTarget.includes(q)) return true;
    }
    const method = ep.protocol === 'http' ? ep.config?.method : ep.config?.method;
    if (typeof method === 'string' && method.toLowerCase().includes(q)) return true;
    return false;
  }

  // Filter root endpoints
  const filteredRootEndpoints = tree.rootEndpoints.filter((ep) => {
    const match = matchesEndpoint(ep);
    if (match) totalMatches++;
    return match;
  });

  // Recursively filter folder nodes
  function filterNode(node: FolderTreeNode): FolderTreeNode | null {
    const folderMatches = node.folder.name.toLowerCase().includes(q);
    if (folderMatches) {
      totalMatches++;
      matchedFolderIds.add(node.folder.id);
    }

    const filteredEndpoints = (folderMatches ? node.endpoints : node.endpoints.filter((ep) => {
      const match = matchesEndpoint(ep);
      if (match) totalMatches++;
      return match;
    }));

    const filteredChildren: FolderTreeNode[] = [];
    for (const child of node.children) {
      const filteredChild = folderMatches ? child : filterNode(child);
      if (filteredChild) {
        filteredChildren.push(filteredChild);
      }
    }

    if (
      folderMatches ||
      filteredEndpoints.length > 0 ||
      filteredChildren.length > 0
    ) {
      matchedFolderIds.add(node.folder.id);
      return {
        folder: node.folder,
        children: filteredChildren,
        endpoints: filteredEndpoints,
      };
    }

    return null;
  }

  const filteredRootFolders: FolderTreeNode[] = [];
  for (const rf of tree.rootFolders) {
    const fn = filterNode(rf);
    if (fn) {
      filteredRootFolders.push(fn);
    }
  }

  return {
    filteredTree: {
      rootEndpoints: filteredRootEndpoints,
      rootFolders: filteredRootFolders,
    },
    matchedFolderIds,
    totalMatches,
  };
}

/**
 * Returns a Set containing the target folder ID and all its recursive descendant folder IDs.
 */
export function getDescendantFolderIds(
  folders: CollectionFolder[],
  targetFolderId: string
): Set<string> {
  const result = new Set<string>([targetFolderId]);
  let added = true;

  while (added) {
    added = false;
    for (const folder of folders) {
      if (folder.parent_folder_id && result.has(folder.parent_folder_id) && !result.has(folder.id)) {
        result.add(folder.id);
        added = true;
      }
    }
  }

  return result;
}

/**
 * Simulates cascade deletion of a folder, removing the folder, its subfolders,
 * and all endpoints contained anywhere within the deleted subtree.
 */
export function cascadeDeleteFolder(
  folders: CollectionFolder[],
  endpoints: Endpoint[],
  targetFolderId: string
): {
  remainingFolders: CollectionFolder[];
  remainingEndpoints: Endpoint[];
} {
  const targetIds = getDescendantFolderIds(folders, targetFolderId);

  return {
    remainingFolders: folders.filter((f) => !targetIds.has(f.id)),
    remainingEndpoints: endpoints.filter((ep) => !ep.folder_id || !targetIds.has(ep.folder_id)),
  };
}

/**
 * Checks whether a folder is a gRPC Reflection Folder.
 * Checks folder.grpc_url first, then falls back to collection.settings.grpc_sources.
 */
export function isReflectionFolder(
  folder: CollectionFolder,
  collectionSettings?: Record<string, any>
): boolean {
  if (folder.grpc_url && folder.grpc_url.trim().length > 0) {
    return true;
  }
  const sources = collectionSettings?.grpc_sources;
  if (sources && typeof sources === 'object' && sources[folder.id]?.server_address) {
    const addr = sources[folder.id].server_address;
    return typeof addr === 'string' && addr.trim().length > 0;
  }
  return false;
}

/**
 * Returns the gRPC URL associated with a folder, or null if none.
 */
export function getFolderGrpcUrl(
  folder: CollectionFolder,
  collectionSettings?: Record<string, any>
): string | null {
  if (folder.grpc_url && folder.grpc_url.trim().length > 0) {
    return folder.grpc_url.trim();
  }
  const sources = collectionSettings?.grpc_sources;
  if (sources && typeof sources === 'object' && sources[folder.id]?.server_address) {
    const addr = sources[folder.id].server_address;
    if (typeof addr === 'string' && addr.trim().length > 0) {
      return addr.trim();
    }
  }
  return null;
}

export interface SwaggerFolderConfig {
  baseUrl: string;
  swaggerPath: string;
  swaggerUrl: string;
}

/**
 * Checks whether a folder is an HTTP Swagger Folder.
 * Checks folder.swagger_url, folder.settings.swagger_base_url, and collection.settings.swagger_sources.
 */
export function isSwaggerFolder(
  folder: CollectionFolder,
  collectionSettings?: Record<string, any>
): boolean {
  if (folder.swagger_url && folder.swagger_url.trim().length > 0) {
    return true;
  }
  const folderBase = (folder.settings as Record<string, any> | undefined)?.swagger_base_url;
  if (typeof folderBase === 'string' && folderBase.trim().length > 0) {
    return true;
  }
  const sources = collectionSettings?.swagger_sources;
  if (sources && typeof sources === 'object') {
    const src = sources[folder.id];
    if (typeof src?.swagger_url === 'string' && src.swagger_url.trim().length > 0) {
      return true;
    }
    if (typeof src?.base_url === 'string' && src.base_url.trim().length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Returns the Swagger URL associated with a folder, or null if none.
 */
export function getFolderSwaggerUrl(
  folder: CollectionFolder,
  collectionSettings?: Record<string, any>
): string | null {
  if (folder.swagger_url && folder.swagger_url.trim().length > 0) {
    return folder.swagger_url.trim();
  }
  const folderSettings = (folder.settings as Record<string, any> | undefined) || {};
  if (typeof folderSettings.swagger_base_url === 'string' && folderSettings.swagger_base_url.trim().length > 0) {
    return combineSwaggerUrl(folderSettings.swagger_base_url, String(folderSettings.swagger_path || ''));
  }
  const sources = collectionSettings?.swagger_sources;
  if (sources && typeof sources === 'object' && sources[folder.id]) {
    const src = sources[folder.id];
    if (typeof src.swagger_url === 'string' && src.swagger_url.trim().length > 0) {
      return src.swagger_url.trim();
    }
    if (typeof src.base_url === 'string' && src.base_url.trim().length > 0) {
      return combineSwaggerUrl(src.base_url, String(src.swagger_path || ''));
    }
  }
  return null;
}

/**
 * Returns the separated Base URL, Swagger JSON Path, and combined Swagger URL for a Swagger folder.
 * Prefers explicit folder.settings.swagger_base_url / swagger_path, then collection.settings.swagger_sources,
 * and falls back to splitting legacy folder.swagger_url.
 */
export function getFolderSwaggerConfig(
  folder: CollectionFolder,
  collectionSettings?: Record<string, any>
): SwaggerFolderConfig | null {
  const folderSettings = (folder.settings as Record<string, any> | undefined) || {};
  const legacySource = collectionSettings?.swagger_sources?.[folder.id];
  const directSwaggerUrl = getFolderSwaggerUrl(folder, collectionSettings) || '';

  const explicitBase =
    (typeof folderSettings.swagger_base_url === 'string' && folderSettings.swagger_base_url.trim()) ||
    (typeof legacySource?.base_url === 'string' && legacySource.base_url.trim()) ||
    '';

  const hasExplicitPath =
    typeof folderSettings.swagger_path === 'string' ||
    typeof legacySource?.swagger_path === 'string';
  const explicitPath =
    typeof folderSettings.swagger_path === 'string'
      ? folderSettings.swagger_path.trim()
      : typeof legacySource?.swagger_path === 'string'
      ? legacySource.swagger_path.trim()
      : '';

  if (explicitBase) {
    const pathVal = hasExplicitPath
      ? explicitPath
      : directSwaggerUrl
      ? splitSwaggerUrl(directSwaggerUrl).swaggerPath
      : '';
    const swaggerUrl = combineSwaggerUrl(explicitBase, pathVal) || directSwaggerUrl;
    return {
      baseUrl: explicitBase,
      swaggerPath: pathVal,
      swaggerUrl,
    };
  }

  if (directSwaggerUrl) {
    const split = splitSwaggerUrl(directSwaggerUrl);
    const pathVal = hasExplicitPath ? explicitPath : split.swaggerPath;
    return {
      baseUrl: split.baseUrl,
      swaggerPath: pathVal,
      swaggerUrl: directSwaggerUrl,
    };
  }

  return null;
}

/**
 * Checks if endpoints can be manually added to a folder.
 * Swagger and gRPC Reflection folders (and their child folders) are spec-managed and disallow manual endpoint addition.
 */
export function canAddEndpointToFolder(
  folder: CollectionFolder,
  collectionSettings?: Record<string, any>,
  folders?: CollectionFolder[]
): boolean {
  if (isReflectionFolder(folder, collectionSettings) || isSwaggerFolder(folder, collectionSettings)) {
    return false;
  }
  if (!folders || !folder.parent_folder_id) {
    return true;
  }
  const folderMap = new Map<string, CollectionFolder>(folders.map((f) => [f.id, f]));
  let currentId: string | null = folder.parent_folder_id;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const parent = folderMap.get(currentId);
    if (!parent) break;
    if (isReflectionFolder(parent, collectionSettings) || isSwaggerFolder(parent, collectionSettings)) {
      return false;
    }
    currentId = parent.parent_folder_id ?? null;
  }
  return true;
}

export interface InheritedSwaggerInfo {
  isInherited: boolean;
  baseUrl: string | null;
  swaggerPath: string | null;
  swaggerUrl: string | null;
  folderId: string | null;
  folderName: string | null;
  folder: CollectionFolder | null;
}

/**
 * Traverses folder ancestry to find if an endpoint belongs to a Swagger folder
 * and resolves its live inherited Base URL, Swagger JSON Path, and combined Swagger URL.
 */
export function resolveInheritedSwaggerConfig(
  endpoint: { folder_id?: string | null },
  folders: CollectionFolder[],
  collectionSettings?: Record<string, any>
): InheritedSwaggerInfo {
  if (!endpoint.folder_id || !folders || folders.length === 0) {
    return {
      isInherited: false,
      baseUrl: null,
      swaggerPath: null,
      swaggerUrl: null,
      folderId: null,
      folderName: null,
      folder: null,
    };
  }

  const folderMap = new Map<string, CollectionFolder>(folders.map((f) => [f.id, f]));
  let currentId: string | null = endpoint.folder_id;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = folderMap.get(currentId);
    if (!folder) break;
    const cfg = getFolderSwaggerConfig(folder, collectionSettings);
    if (cfg) {
      return {
        isInherited: true,
        baseUrl: cfg.baseUrl || null,
        swaggerPath: cfg.swaggerPath,
        swaggerUrl: cfg.swaggerUrl || null,
        folderId: folder.id,
        folderName: folder.name,
        folder,
      };
    }
    currentId = folder.parent_folder_id ?? null;
  }

  return {
    isInherited: false,
    baseUrl: null,
    swaggerPath: null,
    swaggerUrl: null,
    folderId: null,
    folderName: null,
    folder: null,
  };
}

/**
 * Combines a Swagger folder's live Base URL template (e.g. "{{BASE_URL}}" or "localhost:8080")
 * with an endpoint's route path while preserving query strings and hashes.
 * Never resolves {{VAR}} templates so environment switching works on-the-fly.
 */
export function buildEffectiveSwaggerEndpointUrl(
  storedUrl: string,
  inheritedBaseUrl: string | null | undefined,
  storedSwaggerPath?: string | null
): string {
  const rawUrl = (storedUrl || '').trim();
  const cleanBase = inheritedBaseUrl ? normalizeBaseUrlTemplate(inheritedBaseUrl) : '';
  if (!cleanBase) return rawUrl;

  const qhIdx = rawUrl.search(/[?#]/);
  const baseAndPath = qhIdx === -1 ? rawUrl : rawUrl.slice(0, qhIdx);
  const suffix = qhIdx === -1 ? '' : rawUrl.slice(qhIdx);

  if (storedSwaggerPath && storedSwaggerPath.trim()) {
    const trimmedPath = storedSwaggerPath.trim();
    const normPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
    return `${cleanBase}${normPath}${suffix}`;
  }

  if (baseAndPath === cleanBase || baseAndPath.startsWith(`${cleanBase}/`)) {
    return `${baseAndPath}${suffix}`;
  }

  const extractedPath = extractUrlPathname(baseAndPath);
  const basePathPrefix = extractUrlPathname(cleanBase);
  if (
    basePathPrefix !== '/' &&
    (extractedPath === basePathPrefix || extractedPath.startsWith(`${basePathPrefix}/`))
  ) {
    const remainder = extractedPath.slice(basePathPrefix.length);
    return `${cleanBase}${remainder}${suffix}`;
  }

  const normPath = extractedPath.startsWith('/') ? extractedPath : `/${extractedPath}`;
  return `${cleanBase}${normPath}${suffix}`;
}

/**
 * Cascades an updated Swagger Base URL template to all descendant HTTP endpoints under a Swagger folder.
 * Preserves each endpoint's route path and query string, and returns the count and updated endpoint records.
 */
export async function cascadeUpdateFolderSwaggerBaseUrl(
  folderId: string,
  newBaseUrl: string,
  folders: CollectionFolder[],
  endpoints: Endpoint[],
  api: EndpointPatchCaller
): Promise<{ updatedCount: number; updatedEndpoints: Endpoint[] }> {
  const cleanBase = normalizeBaseUrlTemplate(newBaseUrl);
  if (!cleanBase) return { updatedCount: 0, updatedEndpoints: [] };

  const targetFolderIds = getDescendantFolderIds(folders, folderId);
  const matchingEndpoints = endpoints.filter(
    (ep) =>
      ep.protocol === 'http' &&
      ep.folder_id &&
      targetFolderIds.has(ep.folder_id)
  );

  let updatedCount = 0;
  const updatedEndpoints: Endpoint[] = [];

  for (const ep of matchingEndpoints) {
    const currentUrl = ep.config?.url || '';
    const nextUrl = buildEffectiveSwaggerEndpointUrl(
      currentUrl,
      cleanBase,
      ep.config?.swagger_path
    );
    if (nextUrl === currentUrl) continue;

    const updated = await api.patch(`/endpoints/${ep.id}`, {
      version: ep.version,
      config: {
        ...ep.config,
        url: nextUrl,
      },
    });
    if (updated && typeof updated === 'object' && updated.id) {
      updatedEndpoints.push(updated as Endpoint);
    }
    updatedCount++;
  }

  return { updatedCount, updatedEndpoints };
}

/**
 * Traverses folder ancestry to find if the endpoint belongs to a Swagger folder.
 */
export function findSwaggerFolderForEndpoint(
  endpointFolderId: string | undefined | null,
  folders: CollectionFolder[],
  collectionSettings?: Record<string, any>
): { folder: CollectionFolder; swaggerUrl: string; baseUrl?: string; swaggerPath?: string } | null {
  const inherited = resolveInheritedSwaggerConfig(
    { folder_id: endpointFolderId },
    folders,
    collectionSettings
  );
  if (!inherited.isInherited || !inherited.folder || !inherited.swaggerUrl) {
    return null;
  }
  return {
    folder: inherited.folder,
    swaggerUrl: inherited.swaggerUrl,
    baseUrl: inherited.baseUrl ?? undefined,
    swaggerPath: inherited.swaggerPath ?? undefined,
  };
}

export type SidebarItemType =
  | 'collection'
  | 'reflection_folder'
  | 'swagger_folder'
  | 'folder'
  | 'endpoint';

/**
 * Identifies the exact sidebar type among the 5 canonical types:
 * 1. Collection
 * 2. Reflection Folder
 * 3. Swagger Folder
 * 4. Folder
 * 5. Endpoint
 */
export function getSidebarItemType(
  kind: 'collection' | 'folder' | 'endpoint',
  folder?: CollectionFolder,
  collectionSettings?: Record<string, any>
): SidebarItemType {
  if (kind === 'collection') return 'collection';
  if (kind === 'endpoint') return 'endpoint';
  if (folder && isReflectionFolder(folder, collectionSettings)) {
    return 'reflection_folder';
  }
  if (folder && isSwaggerFolder(folder, collectionSettings)) {
    return 'swagger_folder';
  }
  return 'folder';
}

/**
 * Resolves the top-level root folder ID from an arbitrary folder ID
 * by traversing up the parent_folder_id ancestor chain.
 */
export function resolveRootFolderId(
  folders: CollectionFolder[],
  targetFolderId?: string | null
): string | null {
  if (!targetFolderId) return null;
  let current = folders.find((f) => f.id === targetFolderId);
  if (!current) return null;

  while (current.parent_folder_id) {
    const parent = folders.find((f) => f.id === current!.parent_folder_id);
    if (!parent) break;
    current = parent;
  }

  return current.id;
}

export interface InheritedGrpcAddressInfo {
  isInherited: boolean;
  inheritedAddress: string | null;
  folderId: string | null;
  folderName: string | null;
}

/**
 * Determines if an endpoint is inside a Reflection Folder (directly or via ancestor subfolder)
 * and resolves the inherited gRPC server address and source folder info.
 */
export function resolveInheritedGrpcAddress(
  endpoint: { folder_id?: string | null },
  folders: CollectionFolder[],
  collectionSettings?: Record<string, any>
): InheritedGrpcAddressInfo {
  if (!endpoint.folder_id || !folders || folders.length === 0) {
    return {
      isInherited: false,
      inheritedAddress: null,
      folderId: null,
      folderName: null,
    };
  }

  // 1. Traverse up to find root ancestor folder
  const rootId = resolveRootFolderId(folders, endpoint.folder_id);
  const targetFolder = folders.find((f) => f.id === (rootId || endpoint.folder_id));

  if (targetFolder && isReflectionFolder(targetFolder, collectionSettings)) {
    const addr = getFolderGrpcUrl(targetFolder, collectionSettings);
    if (addr && addr.trim().length > 0) {
      return {
        isInherited: true,
        inheritedAddress: addr.trim(),
        folderId: targetFolder.id,
        folderName: targetFolder.name,
      };
    }
  }

  // 2. Check immediate or intermediate ancestors if root was not reflection
  let curr = folders.find((f) => f.id === endpoint.folder_id);
  while (curr) {
    if (isReflectionFolder(curr, collectionSettings)) {
      const addr = getFolderGrpcUrl(curr, collectionSettings);
      if (addr && addr.trim().length > 0) {
        return {
          isInherited: true,
          inheritedAddress: addr.trim(),
          folderId: curr.id,
          folderName: curr.name,
        };
      }
    }
    if (!curr.parent_folder_id) break;
    curr = folders.find((f) => f.id === curr!.parent_folder_id);
  }

  return {
    isInherited: false,
    inheritedAddress: null,
    folderId: null,
    folderName: null,
  };
}

export interface EndpointPatchCaller {
  patch: (path: string, body: any) => Promise<any>;
}

/**
 * Cascades updated gRPC address to all descendant gRPC endpoints under a folder hierarchy.
 * Returns count of endpoints updated.
 */
export async function cascadeUpdateFolderGrpcAddress(
  folderId: string,
  newAddress: string,
  folders: CollectionFolder[],
  endpoints: Endpoint[],
  api: EndpointPatchCaller
): Promise<number> {
  const cleanAddr = newAddress.trim();
  if (!cleanAddr) return 0;

  const targetFolderIds = getDescendantFolderIds(folders, folderId);
  const matchingEndpoints = endpoints.filter(
    (ep) =>
      ep.protocol === 'grpc' &&
      ep.folder_id &&
      targetFolderIds.has(ep.folder_id) &&
      ep.config?.server_address !== cleanAddr
  );

  let updatedCount = 0;
  for (const ep of matchingEndpoints) {
    await api.patch(`/endpoints/${ep.id}`, {
      version: ep.version,
      config: {
        ...ep.config,
        server_address: cleanAddr,
      },
    });
    updatedCount++;
  }

  return updatedCount;
}

/**
 * Resolves full ordered path of folders leading to folderId,
 * ordered from root ancestor down to current folder [root, ..., current].
 */
export function getFolderPath(
  folders: CollectionFolder[],
  folderId?: string | null
): CollectionFolder[] {
  if (!folderId) return [];
  const folderMap = new Map<string, CollectionFolder>();
  for (const f of folders) {
    folderMap.set(f.id, f);
  }

  const path: CollectionFolder[] = [];
  let currId: string | null | undefined = folderId;
  const visited = new Set<string>();

  while (currId && !visited.has(currId)) {
    visited.add(currId);
    const f = folderMap.get(currId);
    if (!f) break;
    path.push(f);
    currId = f.parent_folder_id;
  }

  return path.reverse();
}

/**
 * Resolves all ancestor folder IDs containing the given folderId,
 * walking up the parent_folder_id chain to the root folder.
 */
export function getAncestorFolderIds(
  folders: CollectionFolder[],
  folderId?: string | null
): Set<string> {
  const result = new Set<string>();
  if (!folderId) return result;

  const folderMap = new Map<string, CollectionFolder>();
  for (const f of folders) {
    folderMap.set(f.id, f);
  }

  let currId: string | null | undefined = folderId;
  const visited = new Set<string>();

  while (currId && !visited.has(currId)) {
    visited.add(currId);
    result.add(currId);
    const f = folderMap.get(currId);
    currId = f ? f.parent_folder_id : null;
  }

  return result;
}

/**
 * Checks if a collection contains the active endpoint.
 */
export function isCollectionHighlighted(
  collectionId: string,
  activeEndpoint?: { collection_id?: string | null } | null
): boolean {
  return Boolean(activeEndpoint && activeEndpoint.collection_id === collectionId);
}



