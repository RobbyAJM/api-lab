import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeFolderSettings,
  resolveInheritedAuth,
  getInheritedAuthHeader,
} from './folderSettings.ts';
import type { CollectionFolder, CollectionSettings } from '@api-lab/api-types';

test('mergeFolderSettings applies nearest folder auth over collection auth', () => {
  const settings = mergeFolderSettings({ auth: { auth_type: 'bearer', token: 'collection' } }, [
    { id: 'root', collection_id: 'c', parent_folder_id: null, name: 'Root', settings: { auth: { auth_type: 'bearer', token: 'root' } } } as any,
    { id: 'child', collection_id: 'c', parent_folder_id: 'root', name: 'Child', settings: { auth: { auth_type: 'bearer', token: 'child' } } } as any,
  ], 'child');
  assert.equal(settings?.auth?.token, 'child');
});

test('mergeFolderSettings stops on cyclic folder parents', () => {
  const settings = mergeFolderSettings(undefined, [
    { id: 'a', collection_id: 'c', parent_folder_id: 'b', name: 'A', settings: undefined } as any,
    { id: 'b', collection_id: 'c', parent_folder_id: 'a', name: 'B', settings: undefined } as any,
  ], 'a');
  assert.equal(settings, undefined);
});

test('resolveInheritedAuth: Case 1 - Collection inherited authorization when folder has no auth', () => {
  const collection = {
    id: 'col-1',
    name: 'My API',
    settings: {
      auth: { auth_type: 'bearer' as const, token: 'coll-token-123' },
    },
  };
  const folders: CollectionFolder[] = [
    { id: 'f-1', collection_id: 'col-1', parent_folder_id: null, name: 'General', sort_order: 0, created_at: '', updated_at: '' },
  ];

  const resolved = resolveInheritedAuth(collection, folders, 'f-1');
  assert.ok(resolved);
  assert.equal(resolved.sourceType, 'collection');
  assert.equal(resolved.sourceId, 'col-1');
  assert.equal(resolved.sourceName, 'My API');
  assert.equal(resolved.auth.auth_type, 'bearer');
  assert.equal(resolved.auth.token, 'coll-token-123');
});

test('resolveInheritedAuth: Case 2 - Swagger/Reflection folder can have inherited authorization', () => {
  const collection = {
    id: 'col-1',
    name: 'My API',
    settings: {
      auth: { auth_type: 'bearer' as const, token: 'coll-token-123' },
    },
  };
  const folders: CollectionFolder[] = [
    {
      id: 'reflection-root',
      collection_id: 'col-1',
      parent_folder_id: null,
      name: 'gRPC Reflection',
      grpc_url: 'localhost:50051',
      settings: {
        auth: { auth_type: 'bearer' as const, token: 'reflection-token-456' },
      },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
  ];

  const resolved = resolveInheritedAuth(collection, folders, 'reflection-root');
  assert.ok(resolved);
  assert.equal(resolved.sourceType, 'folder');
  assert.equal(resolved.sourceId, 'reflection-root');
  assert.equal(resolved.sourceName, 'gRPC Reflection');
  assert.equal(resolved.auth.token, 'reflection-token-456');
});

test('resolveInheritedAuth: Case 3 - Normal folder can have inherited authorization', () => {
  const collection = {
    id: 'col-1',
    name: 'My API',
    settings: {
      auth: { auth_type: 'bearer' as const, token: 'coll-token-123' },
    },
  };
  const folders: CollectionFolder[] = [
    {
      id: 'normal-folder',
      collection_id: 'col-1',
      parent_folder_id: null,
      name: 'Auth Endpoints',
      settings: {
        auth: { auth_type: 'custom' as const, header_name: 'X-API-KEY', header_value: 'secret-key-1' },
      },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
  ];

  const resolved = resolveInheritedAuth(collection, folders, 'normal-folder');
  assert.ok(resolved);
  assert.equal(resolved.sourceType, 'folder');
  assert.equal(resolved.sourceId, 'normal-folder');
  assert.equal(resolved.sourceName, 'Auth Endpoints');
  assert.equal(resolved.auth.auth_type, 'custom');
  assert.equal(resolved.auth.header_name, 'X-API-KEY');
  assert.equal(resolved.auth.header_value, 'secret-key-1');
});

test('resolveInheritedAuth: Case 4 - Subfolder has highest priority; deeper folder overrides ancestors', () => {
  const collection = {
    id: 'col-1',
    name: 'My API',
    settings: {
      auth: { auth_type: 'bearer' as const, token: 'col-tok' },
    },
  };
  const folders: CollectionFolder[] = [
    {
      id: 'root-f',
      collection_id: 'col-1',
      parent_folder_id: null,
      name: 'Root Level',
      settings: { auth: { auth_type: 'bearer' as const, token: 'root-tok' } },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'sub-1',
      collection_id: 'col-1',
      parent_folder_id: 'root-f',
      name: 'Sub Level 1',
      settings: { auth: { auth_type: 'bearer' as const, token: 'sub1-tok' } },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'sub-2',
      collection_id: 'col-1',
      parent_folder_id: 'sub-1',
      name: 'Deep Sub Level 2',
      settings: { auth: { auth_type: 'bearer' as const, token: 'sub2-tok' } },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
  ];

  // Deepest sub-2 should resolve to sub-2 token
  const res2 = resolveInheritedAuth(collection, folders, 'sub-2');
  assert.equal(res2?.sourceId, 'sub-2');
  assert.equal(res2?.auth.token, 'sub2-tok');

  // Sub-1 resolves to sub-1 token
  const res1 = resolveInheritedAuth(collection, folders, 'sub-1');
  assert.equal(res1?.sourceId, 'sub-1');
  assert.equal(res1?.auth.token, 'sub1-tok');

  // Root resolves to root token
  const resRoot = resolveInheritedAuth(collection, folders, 'root-f');
  assert.equal(resRoot?.sourceId, 'root-f');
  assert.equal(resRoot?.auth.token, 'root-tok');
});

test('resolveInheritedAuth: Subfolder with inherit defers to nearest configured ancestor', () => {
  const collection = {
    id: 'col-1',
    name: 'My API',
    settings: {
      auth: { auth_type: 'bearer' as const, token: 'col-tok' },
    },
  };
  const folders: CollectionFolder[] = [
    {
      id: 'root-f',
      collection_id: 'col-1',
      parent_folder_id: null,
      name: 'Root Level',
      settings: { auth: { auth_type: 'bearer' as const, token: 'root-tok' } },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'sub-1',
      collection_id: 'col-1',
      parent_folder_id: 'root-f',
      name: 'Sub Level 1',
      settings: { auth: { auth_type: 'inherit' as const } },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'sub-2',
      collection_id: 'col-1',
      parent_folder_id: 'sub-1',
      name: 'Deep Sub Level 2',
      settings: { auth: { auth_type: 'inherit' as const } },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
  ];

  // sub-2 has inherit -> sub-1 has inherit -> root has root-tok
  const res2 = resolveInheritedAuth(collection, folders, 'sub-2');
  assert.equal(res2?.sourceId, 'root-f');
  assert.equal(res2?.sourceName, 'Root Level');
  assert.equal(res2?.auth.token, 'root-tok');
});

test('resolveInheritedAuth: Folder explicit none disables inheritance', () => {
  const collection = {
    id: 'col-1',
    name: 'My API',
    settings: {
      auth: { auth_type: 'bearer' as const, token: 'col-tok' },
    },
  };
  const folders: CollectionFolder[] = [
    {
      id: 'root-f',
      collection_id: 'col-1',
      parent_folder_id: null,
      name: 'Root Level',
      settings: { auth: { auth_type: 'bearer' as const, token: 'root-tok' } },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'sub-1',
      collection_id: 'col-1',
      parent_folder_id: 'root-f',
      name: 'Sub Level 1 (No Auth)',
      settings: { auth: { auth_type: 'none' as const } },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'sub-2',
      collection_id: 'col-1',
      parent_folder_id: 'sub-1',
      name: 'Child of No Auth',
      settings: { auth: { auth_type: 'inherit' as const } },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
  ];

  // sub-1 explicitly disables auth -> returns null
  assert.equal(resolveInheritedAuth(collection, folders, 'sub-1'), null);

  // sub-2 inherits from sub-1 which disabled auth -> returns null
  assert.equal(resolveInheritedAuth(collection, folders, 'sub-2'), null);
});

test('getInheritedAuthHeader: creates correct HTTP and gRPC header with case-sensitive keys', () => {
  const resolvedBearer = {
    auth: { auth_type: 'bearer' as const, token: 'my-jwt-token' },
    sourceType: 'folder' as const,
    sourceId: 'f-1',
    sourceName: 'Auth Service',
  };

  const httpBearer = getInheritedAuthHeader(resolvedBearer, 'http');
  assert.equal(httpBearer?.key, 'Authorization');
  assert.equal(httpBearer?.value, 'Bearer my-jwt-token');
  assert.equal(httpBearer?.description, 'Inherited from folder: Auth Service');

  const grpcBearer = getInheritedAuthHeader(resolvedBearer, 'grpc');
  assert.equal(grpcBearer?.key, 'authorization');
  assert.equal(grpcBearer?.value, 'Bearer my-jwt-token');

  // Case-sensitive custom header
  const resolvedCustom = {
    auth: { auth_type: 'custom' as const, header_name: 'X-Custom-Auth-Token', header_value: 'val-123' },
    sourceType: 'collection' as const,
    sourceId: 'c-1',
    sourceName: 'Main API',
  };

  const customHeader = getInheritedAuthHeader(resolvedCustom, 'http');
  assert.equal(customHeader?.key, 'X-Custom-Auth-Token'); // exact case preserved
  assert.equal(customHeader?.value, 'val-123');
  assert.equal(customHeader?.description, 'Inherited from collection: Main API');

  // Variable substitution
  const vars = { TOKEN: 'interpolated-token', KEY_NAME: 'X-API-KEY' };
  const resolvedVars = {
    auth: { auth_type: 'custom' as const, header_name: '{{KEY_NAME}}', header_value: '{{TOKEN}}' },
    sourceType: 'folder' as const,
    sourceId: 'f-2',
    sourceName: 'Folder With Vars',
  };

  const withVars = getInheritedAuthHeader(resolvedVars, 'http', vars);
  assert.equal(withVars?.key, 'X-API-KEY');
  assert.equal(withVars?.value, 'interpolated-token');
});
