import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFolderTree,
  filterCollectionTree,
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
