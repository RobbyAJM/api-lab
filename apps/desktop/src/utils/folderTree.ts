import type { CollectionFolder, Endpoint } from '@api-lab/api-types';

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

    const filteredEndpoints = node.endpoints.filter((ep) => {
      const match = matchesEndpoint(ep);
      if (match) totalMatches++;
      return match;
    });

    const filteredChildren: FolderTreeNode[] = [];
    for (const child of node.children) {
      const filteredChild = filterNode(child);
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

export type SidebarItemType = 'collection' | 'reflection_folder' | 'folder' | 'endpoint';

/**
 * Identifies the exact sidebar type among the 4 canonical types:
 * 1. Collection
 * 2. Reflection Folder
 * 3. Folder
 * 4. Endpoint
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
  return 'folder';
}


