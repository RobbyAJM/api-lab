import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFolderTree,
  filterCollectionTree,
  getDescendantFolderIds,
  cascadeDeleteFolder,
  isReflectionFolder,
  getFolderGrpcUrl,
  isSwaggerFolder,
  getFolderSwaggerUrl,
  findSwaggerFolderForEndpoint,
  getSidebarItemType,
  resolveRootFolderId,
  resolveInheritedGrpcAddress,
  getAncestorFolderIds,
  getFolderPath,
  isCollectionHighlighted,
  cascadeUpdateFolderGrpcAddress,
} from './folderTree.ts';
import type { CollectionFolder, Endpoint } from '@api-lab/api-types';

const mockFolders: CollectionFolder[] = [
  {
    id: 'f-root-1',
    collection_id: 'col-1',
    parent_folder_id: null,
    name: 'NuTrade Services',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'f-child-auth',
    collection_id: 'col-1',
    parent_folder_id: 'f-root-1',
    name: 'nutrade.manager.AuthAPI',
    sort_order: 1,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'f-grandchild-sub',
    collection_id: 'col-1',
    parent_folder_id: 'f-child-auth',
    name: 'SubGroup',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'f-root-2',
    collection_id: 'col-1',
    parent_folder_id: null,
    name: 'Public APIs',
    sort_order: 1,
    created_at: '',
    updated_at: '',
  },
];

const mockEndpoints: Endpoint[] = [
  {
    id: 'ep-root',
    collection_id: 'col-1',
    folder_id: null,
    name: 'Root Health Check',
    protocol: 'http',
    config: { method: 'GET', url: '/health' },
    sort_order: 0,
    version: 1,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'ep-login',
    collection_id: 'col-1',
    folder_id: 'f-child-auth',
    name: 'Login',
    protocol: 'grpc',
    config: { service: 'nutrade.manager.AuthAPI', method: 'Login' },
    sort_order: 0,
    version: 1,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'ep-profile',
    collection_id: 'col-1',
    folder_id: 'f-child-auth',
    name: 'Profile',
    protocol: 'grpc',
    config: { service: 'nutrade.manager.AuthAPI', method: 'Profile' },
    sort_order: 1,
    version: 1,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'ep-deep',
    collection_id: 'col-1',
    folder_id: 'f-grandchild-sub',
    name: 'Deep Nested Action',
    protocol: 'http',
    config: { method: 'POST', url: '/deep' },
    sort_order: 0,
    version: 1,
    created_at: '',
    updated_at: '',
  },
];

test('buildFolderTree: constructs multi-level nested tree accurately', () => {
  const tree = buildFolderTree(mockFolders, mockEndpoints);

  // Root endpoints
  assert.equal(tree.rootEndpoints.length, 1);
  assert.equal(tree.rootEndpoints[0].id, 'ep-root');

  // Root folders
  assert.equal(tree.rootFolders.length, 2);
  const root1 = tree.rootFolders[0];
  assert.equal(root1.folder.id, 'f-root-1');
  assert.equal(root1.endpoints.length, 0);
  assert.equal(root1.children.length, 1);

  // Child: f-child-auth
  const childAuth = root1.children[0];
  assert.equal(childAuth.folder.id, 'f-child-auth');
  assert.equal(childAuth.endpoints.length, 2);
  assert.equal(childAuth.endpoints[0].name, 'Login');
  assert.equal(childAuth.endpoints[1].name, 'Profile');

  // Grandchild: f-grandchild-sub
  assert.equal(childAuth.children.length, 1);
  const grandchild = childAuth.children[0];
  assert.equal(grandchild.folder.id, 'f-grandchild-sub');
  assert.equal(grandchild.endpoints.length, 1);
  assert.equal(grandchild.endpoints[0].name, 'Deep Nested Action');
});

test('filterCollectionTree: searches endpoints and marks ancestor folders for expansion', () => {
  const tree = buildFolderTree(mockFolders, mockEndpoints);

  // Search for "Login"
  const { filteredTree, matchedFolderIds, totalMatches } = filterCollectionTree(tree, 'login');

  assert.ok(totalMatches >= 1);
  // Root endpoint should be excluded
  assert.equal(filteredTree.rootEndpoints.length, 0);

  // Only root-1 should remain because it contains Login
  assert.equal(filteredTree.rootFolders.length, 1);
  assert.equal(filteredTree.rootFolders[0].folder.id, 'f-root-1');

  // Ancestor folders must be flagged for auto-expansion
  assert.ok(matchedFolderIds.has('f-root-1'));
  assert.ok(matchedFolderIds.has('f-child-auth'));

  // Child endpoints should only contain Login
  const child = filteredTree.rootFolders[0].children[0];
  assert.equal(child.endpoints.length, 1);
  assert.equal(child.endpoints[0].name, 'Login');
});

test('filterCollectionTree: filters by protocol or method', () => {
  const tree = buildFolderTree(mockFolders, mockEndpoints);

  const res = filterCollectionTree(tree, 'POST');
  assert.ok(res.totalMatches >= 1);
  // Deep Nested Action has POST
  assert.ok(res.matchedFolderIds.has('f-grandchild-sub'));
});

test('filterCollectionTree: folder match keeps all files in matched folder', () => {
  const tree = buildFolderTree(mockFolders, mockEndpoints);
  const { filteredTree } = filterCollectionTree(tree, 'auth');
  const folder = filteredTree.rootFolders[0].children[0];
  assert.equal(folder.endpoints.length, 2);
});

test('getDescendantFolderIds: finds folder and all recursive subfolders', () => {
  // f-root-1 contains f-child-auth, which contains f-grandchild-sub
  const descendants = getDescendantFolderIds(mockFolders, 'f-root-1');
  assert.equal(descendants.size, 3);
  assert.ok(descendants.has('f-root-1'));
  assert.ok(descendants.has('f-child-auth'));
  assert.ok(descendants.has('f-grandchild-sub'));
  assert.ok(!descendants.has('f-root-2'));
});

test('cascadeDeleteFolder: deletes folder, subfolders, and endpoints without dumping endpoints to root', () => {
  const { remainingFolders, remainingEndpoints } = cascadeDeleteFolder(
    mockFolders,
    mockEndpoints,
    'f-root-1'
  );

  // Folders inside root-1 deleted, root-2 remains
  assert.equal(remainingFolders.length, 1);
  assert.equal(remainingFolders[0].id, 'f-root-2');

  // Endpoints: ep-login, ep-profile, ep-deep deleted. Only ep-root remains
  assert.equal(remainingEndpoints.length, 1);
  assert.equal(remainingEndpoints[0].id, 'ep-root');

  // Verify resulting tree has no orphaned endpoints at root
  const tree = buildFolderTree(remainingFolders, remainingEndpoints);
  assert.equal(tree.rootEndpoints.length, 1);
  assert.equal(tree.rootEndpoints[0].name, 'Root Health Check');
  assert.equal(tree.rootFolders.length, 1);
  assert.equal(tree.rootFolders[0].endpoints.length, 0);
});

test('isReflectionFolder and getFolderGrpcUrl: identifies reflection folder with direct grpc_url', () => {
  const reflectionFolder: CollectionFolder = {
    id: 'f-grpc-1',
    collection_id: 'c1',
    name: 'NuTrade gRPC Services',
    grpc_url: '{{GRPC_URL}}',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  };

  assert.equal(isReflectionFolder(reflectionFolder), true);
  assert.equal(getFolderGrpcUrl(reflectionFolder), '{{GRPC_URL}}');
  assert.equal(getSidebarItemType('folder', reflectionFolder), 'reflection_folder');
});

test('isReflectionFolder and getFolderGrpcUrl: identifies reflection folder with collection.settings fallback', () => {
  const legacyFolder: CollectionFolder = {
    id: 'f-legacy-1',
    collection_id: 'c1',
    name: 'Order API',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  };

  const settings = {
    grpc_sources: {
      'f-legacy-1': {
        server_address: 'grpc.internal:50051',
      },
    },
  };

  assert.equal(isReflectionFolder(legacyFolder, settings), true);
  assert.equal(getFolderGrpcUrl(legacyFolder, settings), 'grpc.internal:50051');
  assert.equal(getSidebarItemType('folder', legacyFolder, settings), 'reflection_folder');
});

test('isReflectionFolder: returns false for normal folders', () => {
  const normalFolder: CollectionFolder = {
    id: 'f-norm-1',
    collection_id: 'c1',
    name: 'Standard Subfolder',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  };

  assert.equal(isReflectionFolder(normalFolder), false);
  assert.equal(getFolderGrpcUrl(normalFolder), null);
  assert.equal(getSidebarItemType('folder', normalFolder), 'folder');
  assert.equal(getSidebarItemType('collection'), 'collection');
  assert.equal(getSidebarItemType('endpoint'), 'endpoint');
});

test('isSwaggerFolder and getFolderSwaggerUrl: identifies swagger folder with direct swagger_url', () => {
  const swaggerFolder: CollectionFolder = {
    id: 'f-swag-1',
    collection_id: 'c1',
    name: 'NuTrade HTTP Services',
    swagger_url: 'http://localhost:9090/swagger/combined/nutrade.swagger.json',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  };

  assert.equal(isSwaggerFolder(swaggerFolder), true);
  assert.equal(getFolderSwaggerUrl(swaggerFolder), 'http://localhost:9090/swagger/combined/nutrade.swagger.json');
  assert.equal(getSidebarItemType('folder', swaggerFolder), 'swagger_folder');
});

test('isSwaggerFolder and getFolderSwaggerUrl: identifies swagger folder with collection.settings fallback', () => {
  const legacySwaggerFolder: CollectionFolder = {
    id: 'f-legacy-swag',
    collection_id: 'c1',
    name: 'Connector APIs',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  };

  const settings = {
    swagger_sources: {
      'f-legacy-swag': {
        swagger_url: 'http://localhost:9090/swagger/combined/nuconnector.swagger.json',
      },
    },
  };

  assert.equal(isSwaggerFolder(legacySwaggerFolder, settings), true);
  assert.equal(getFolderSwaggerUrl(legacySwaggerFolder, settings), 'http://localhost:9090/swagger/combined/nuconnector.swagger.json');
  assert.equal(getSidebarItemType('folder', legacySwaggerFolder, settings), 'swagger_folder');
});

test('findSwaggerFolderForEndpoint: finds swagger folder for direct and nested subfolder endpoints', () => {
  const folders: CollectionFolder[] = [
    {
      id: 'f-swag-root',
      collection_id: 'c1',
      parent_folder_id: null,
      name: 'Swagger APIs',
      swagger_url: 'http://localhost:9090/swagger.json',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'f-swag-sub',
      collection_id: 'c1',
      parent_folder_id: 'f-swag-root',
      name: 'TradeAPI',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'f-other',
      collection_id: 'c1',
      parent_folder_id: null,
      name: 'Other',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
  ];

  // Direct child of swagger root
  const resDirect = findSwaggerFolderForEndpoint('f-swag-root', folders);
  assert.ok(resDirect);
  assert.equal(resDirect.swaggerUrl, 'http://localhost:9090/swagger.json');

  // Subfolder under swagger root
  const resSub = findSwaggerFolderForEndpoint('f-swag-sub', folders);
  assert.ok(resSub);
  assert.equal(resSub.swaggerUrl, 'http://localhost:9090/swagger.json');

  // Non-swagger folder
  const resOther = findSwaggerFolderForEndpoint('f-other', folders);
  assert.equal(resOther, null);

  // Null endpointFolderId
  assert.equal(findSwaggerFolderForEndpoint(null, folders), null);
});

test('resolveRootFolderId: resolves root folder for root, child, and grandchild', () => {
  // mockFolders has:
  // f-root-1 (root) -> f-child-auth -> f-grandchild-sub
  // f-root-2 (root)

  // Target is root folder
  assert.equal(resolveRootFolderId(mockFolders, 'f-root-1'), 'f-root-1');
  assert.equal(resolveRootFolderId(mockFolders, 'f-root-2'), 'f-root-2');

  // Target is child folder
  assert.equal(resolveRootFolderId(mockFolders, 'f-child-auth'), 'f-root-1');

  // Target is grandchild folder
  assert.equal(resolveRootFolderId(mockFolders, 'f-grandchild-sub'), 'f-root-1');

  // Unknown or null
  assert.equal(resolveRootFolderId(mockFolders, 'non-existent'), null);
  assert.equal(resolveRootFolderId(mockFolders, null), null);
  assert.equal(resolveRootFolderId(mockFolders, undefined), null);
});

test('resolveInheritedGrpcAddress: inherits gRPC address for direct child and descendant endpoints', () => {
  const foldersWithReflection: CollectionFolder[] = [
    {
      id: 'f-refl-root',
      collection_id: 'c1',
      parent_folder_id: null,
      name: 'NuTrade Reflection',
      grpc_url: '{{GRPC_HOST}}',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'f-sub-auth',
      collection_id: 'c1',
      parent_folder_id: 'f-refl-root',
      name: 'AuthService',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'f-normal-root',
      collection_id: 'c1',
      parent_folder_id: null,
      name: 'Standard HTTP Folder',
      sort_order: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  // 1. Direct child of reflection folder
  const epDirect = { folder_id: 'f-refl-root' };
  const resDirect = resolveInheritedGrpcAddress(epDirect, foldersWithReflection);
  assert.equal(resDirect.isInherited, true);
  assert.equal(resDirect.inheritedAddress, '{{GRPC_HOST}}');
  assert.equal(resDirect.folderId, 'f-refl-root');
  assert.equal(resDirect.folderName, 'NuTrade Reflection');

  // 2. Descendant subfolder of reflection folder
  const epDescendant = { folder_id: 'f-sub-auth' };
  const resDescendant = resolveInheritedGrpcAddress(epDescendant, foldersWithReflection);
  assert.equal(resDescendant.isInherited, true);
  assert.equal(resDescendant.inheritedAddress, '{{GRPC_HOST}}');
  assert.equal(resDescendant.folderId, 'f-refl-root');
  assert.equal(resDescendant.folderName, 'NuTrade Reflection');

  // 3. Regular folder
  const epNormal = { folder_id: 'f-normal-root' };
  const resNormal = resolveInheritedGrpcAddress(epNormal, foldersWithReflection);
  assert.equal(resNormal.isInherited, false);
  assert.equal(resNormal.inheritedAddress, null);

  // 4. No folder
  const epNoFolder = { folder_id: null };
  const resNoFolder = resolveInheritedGrpcAddress(epNoFolder, foldersWithReflection);
  assert.equal(resNoFolder.isInherited, false);

  // 5. Legacy collection settings fallback
  const legacyFolder: CollectionFolder = {
    id: 'f-legacy-root',
    collection_id: 'c1',
    parent_folder_id: null,
    name: 'Legacy Reflection',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  };
  const settings = {
    grpc_sources: {
      'f-legacy-root': { server_address: 'grpc.internal:50051' },
    },
  };
  const resLegacy = resolveInheritedGrpcAddress(
    { folder_id: 'f-legacy-root' },
    [legacyFolder],
    settings
  );
  assert.equal(resLegacy.isInherited, true);
  assert.equal(resLegacy.inheritedAddress, 'grpc.internal:50051');
  assert.equal(resLegacy.folderId, 'f-legacy-root');
});

test('getFolderPath: resolves ordered folder path from root down to current folder', () => {
  // f-root-1 -> f-child-auth -> f-grandchild-sub
  const path = getFolderPath(mockFolders, 'f-grandchild-sub');
  assert.equal(path.length, 3);
  assert.equal(path[0].id, 'f-root-1');
  assert.equal(path[1].id, 'f-child-auth');
  assert.equal(path[2].id, 'f-grandchild-sub');

  const rootPath = getFolderPath(mockFolders, 'f-root-1');
  assert.equal(rootPath.length, 1);
  assert.equal(rootPath[0].id, 'f-root-1');

  assert.deepEqual(getFolderPath(mockFolders, null), []);
  assert.deepEqual(getFolderPath(mockFolders, undefined), []);
  assert.deepEqual(getFolderPath(mockFolders, 'non-existent'), []);
});

test('getAncestorFolderIds: collects full ancestor folder path up to root', () => {
  // mockFolders has:
  // f-root-1 (root) -> f-child-auth -> f-grandchild-sub
  // f-root-2 (root)

  // 1. Grandchild folder has grandchild, child, and root in ancestor set
  const grandchildAncestors = getAncestorFolderIds(mockFolders, 'f-grandchild-sub');
  assert.equal(grandchildAncestors.size, 3);
  assert.ok(grandchildAncestors.has('f-grandchild-sub'));
  assert.ok(grandchildAncestors.has('f-child-auth'));
  assert.ok(grandchildAncestors.has('f-root-1'));
  assert.ok(!grandchildAncestors.has('f-root-2'));

  // 2. Child folder has child and root
  const childAncestors = getAncestorFolderIds(mockFolders, 'f-child-auth');
  assert.equal(childAncestors.size, 2);
  assert.ok(childAncestors.has('f-child-auth'));
  assert.ok(childAncestors.has('f-root-1'));

  // 3. Root folder has only itself
  const rootAncestors = getAncestorFolderIds(mockFolders, 'f-root-1');
  assert.equal(rootAncestors.size, 1);
  assert.ok(rootAncestors.has('f-root-1'));

  // 4. Null or undefined or unknown folder
  assert.equal(getAncestorFolderIds(mockFolders, null).size, 0);
  assert.equal(getAncestorFolderIds(mockFolders, undefined).size, 0);
  assert.equal(getAncestorFolderIds(mockFolders, 'unknown-id').size, 1); // just itself, safely stops
});

test('isCollectionHighlighted: matches collection containing active endpoint', () => {
  const activeEp = { id: 'ep-1', collection_id: 'col-1', folder_id: 'f-child-auth' };

  assert.equal(isCollectionHighlighted('col-1', activeEp), true);
  assert.equal(isCollectionHighlighted('col-2', activeEp), false);
  assert.equal(isCollectionHighlighted('col-1', null), false);
  assert.equal(isCollectionHighlighted('col-1', undefined), false);
});

test('cascadeUpdateFolderGrpcAddress: cascades new gRPC URL to descendant gRPC endpoints only', async () => {
  const folders: CollectionFolder[] = [
    { id: 'f-root', collection_id: 'c', parent_folder_id: null, name: 'Root gRPC', sort_order: 0, created_at: '', updated_at: '' },
    { id: 'f-sub1', collection_id: 'c', parent_folder_id: 'f-root', name: 'Service1', sort_order: 0, created_at: '', updated_at: '' },
    { id: 'f-sub2', collection_id: 'c', parent_folder_id: 'f-sub1', name: 'SubService', sort_order: 0, created_at: '', updated_at: '' },
    { id: 'f-other', collection_id: 'c', parent_folder_id: null, name: 'Other Folder', sort_order: 1, created_at: '', updated_at: '' },
  ];

  const endpoints: Endpoint[] = [
    {
      id: 'ep-1',
      collection_id: 'c',
      folder_id: 'f-sub1',
      name: 'Method1',
      protocol: 'grpc',
      config: { server_address: 'dev.domain.com:50051' },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'ep-2',
      collection_id: 'c',
      folder_id: 'f-sub2',
      name: 'Method2',
      protocol: 'grpc',
      config: { server_address: 'dev.domain.com:50051' },
      sort_order: 0,
      version: 2,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'ep-http',
      collection_id: 'c',
      folder_id: 'f-sub1',
      name: 'HTTP Endpoint',
      protocol: 'http',
      config: { url: 'https://dev.domain.com' },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'ep-other',
      collection_id: 'c',
      folder_id: 'f-other',
      name: 'Other Method',
      protocol: 'grpc',
      config: { server_address: 'dev.domain.com:50051' },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  const patchCalls: { path: string; body: any }[] = [];
  const mockApi = {
    patch: async (path: string, body: any) => {
      patchCalls.push({ path, body });
      return body;
    },
  };

  const updatedCount = await cascadeUpdateFolderGrpcAddress(
    'f-root',
    '{{LOCAL_URL}}',
    folders,
    endpoints,
    mockApi
  );

  // Exactly 2 gRPC endpoints inside f-root hierarchy updated (ep-1, ep-2)
  // HTTP endpoint ignored, other folder endpoint ignored
  assert.equal(updatedCount, 2);
  assert.equal(patchCalls.length, 2);
  assert.equal(patchCalls[0].path, '/endpoints/ep-1');
  assert.equal(patchCalls[0].body.config.server_address, '{{LOCAL_URL}}');
  assert.equal(patchCalls[1].path, '/endpoints/ep-2');
  assert.equal(patchCalls[1].body.config.server_address, '{{LOCAL_URL}}');
});

test('resolveInheritedGrpcAddress: updates address when folder reflection grpc_url is changed to variable', () => {
  const folders: CollectionFolder[] = [
    {
      id: 'f-refl',
      collection_id: 'c',
      parent_folder_id: null,
      name: 'Reflection Root',
      grpc_url: '{{LOCAL_GRPC_PORT}}',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'f-child',
      collection_id: 'c',
      parent_folder_id: 'f-refl',
      name: 'ChildService',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
  ];

  const ep = { folder_id: 'f-child' };
  const res = resolveInheritedGrpcAddress(ep, folders);
  assert.equal(res.isInherited, true);
  assert.equal(res.inheritedAddress, '{{LOCAL_GRPC_PORT}}');
  assert.equal(res.folderId, 'f-refl');
});


