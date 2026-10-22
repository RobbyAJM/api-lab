import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcilePayload,
  planReflectionSync,
  getFolderDotPath,
  findServiceFolder,
  ensureFolderPath,
  executeReflectionSync,
} from './grpcReflectionSync.ts';
import type { CollectionFolder, Endpoint, GrpcServiceSummary } from '@api-lab/api-types';

test('reconcilePayload: keeps existing values, appends new fields, removes dropped fields', () => {
  const existingPayload = {
    login: '200010',
    old_deprecated_field: 'delete_me',
    profile: {
      bio: 'Developer',
      legacy_age: 30,
    },
  };

  const freshSamplePayload = {
    login: 'random_user_99',
    new_auth_code: 'code_generated_123',
    profile: {
      bio: 'Sample bio',
      avatar_url: 'https://example.com/avatar.png',
    },
  };

  const { updatedPayload, changed } = reconcilePayload(
    existingPayload,
    freshSamplePayload
  );

  assert.equal(changed, true);

  // login: kept existing user value '200010'
  assert.equal(updatedPayload.login, '200010');

  // old_deprecated_field: removed!
  assert.equal('old_deprecated_field' in updatedPayload, false);

  // new_auth_code: appended with generated value
  assert.equal(updatedPayload.new_auth_code, 'code_generated_123');

  // profile.bio: kept 'Developer'
  assert.equal(updatedPayload.profile.bio, 'Developer');

  // profile.legacy_age: removed!
  assert.equal('legacy_age' in updatedPayload.profile, false);

  // profile.avatar_url: appended!
  assert.equal(updatedPayload.profile.avatar_url, 'https://example.com/avatar.png');
});

test('planReflectionSync: plans service additions, service deletions, and method updates', () => {
  const rootFolderId = 'root-grp';

  const existingFolders: CollectionFolder[] = [
    {
      id: rootFolderId,
      collection_id: 'col-1',
      parent_folder_id: null,
      name: 'Services',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'f-auth',
      collection_id: 'col-1',
      parent_folder_id: rootFolderId,
      name: 'nutrade.AuthAPI',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'f-deprecated',
      collection_id: 'col-1',
      parent_folder_id: rootFolderId,
      name: 'nutrade.DeprecatedService',
      sort_order: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  const existingEndpoints: Endpoint[] = [
    {
      id: 'ep-login',
      collection_id: 'col-1',
      folder_id: 'f-auth',
      name: 'Login',
      protocol: 'grpc',
      config: {
        server_address: 'localhost:9091',
        service: 'nutrade.AuthAPI',
        method: 'Login',
        payload: { login: '200010', old_field: 'old' },
      },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'ep-old-method',
      collection_id: 'col-1',
      folder_id: 'f-auth',
      name: 'RemovedMethod',
      protocol: 'grpc',
      config: {
        server_address: 'localhost:9091',
        service: 'nutrade.AuthAPI',
        method: 'RemovedMethod',
        payload: {},
      },
      sort_order: 1,
      version: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  // Fresh reflection:
  // 1. nutrade.DeprecatedService is DELETED
  // 2. nutrade.TradeAPI is ADDED
  // 3. nutrade.AuthAPI has Login (updated payload) and Register (new method), RemovedMethod is GONE
  const freshServices: GrpcServiceSummary[] = [
    {
      name: 'nutrade.AuthAPI',
      methods: [
        {
          name: 'Login',
          input_type: 'LoginReq',
          output_type: 'LoginRes',
          stream_type: 'unary',
        },
        {
          name: 'Register',
          input_type: 'RegisterReq',
          output_type: 'RegisterRes',
          stream_type: 'unary',
        },
      ],
    },
    {
      name: 'nutrade.TradeAPI',
      methods: [
        {
          name: 'TradeSpot',
          input_type: 'TradeReq',
          output_type: 'TradeRes',
          stream_type: 'unary',
        },
      ],
    },
  ];

  const freshPayloads = {
    'nutrade.AuthAPI/Login': { login: 'sample', password: 'new_password' },
    'nutrade.AuthAPI/Register': { email: 'new@example.com' },
    'nutrade.TradeAPI/TradeSpot': { symbol: 'XAUIDR' },
  };

  const plan = planReflectionSync(
    rootFolderId,
    existingFolders,
    existingEndpoints,
    freshServices,
    freshPayloads
  );

  // 1. Service deletion: nutrade.DeprecatedService
  assert.equal(plan.servicesToDelete.length, 1);
  assert.equal(plan.servicesToDelete[0].serviceName, 'nutrade.DeprecatedService');

  // 2. Service creation: nutrade.TradeAPI
  assert.equal(plan.servicesToCreate.length, 1);
  assert.equal(plan.servicesToCreate[0].name, 'nutrade.TradeAPI');

  // 3. Method creation: nutrade.AuthAPI/Register
  assert.equal(plan.methodsToCreate.length, 1);
  assert.equal(plan.methodsToCreate[0].methodName, 'Register');

  // 4. Method deletion: nutrade.AuthAPI/RemovedMethod
  assert.equal(plan.methodsToDelete.length, 1);
  assert.equal(plan.methodsToDelete[0].methodName, 'RemovedMethod');

  // 5. Method update: nutrade.AuthAPI/Login
  assert.equal(plan.methodsToUpdate.length, 1);
  assert.equal(plan.methodsToUpdate[0].endpoint.id, 'ep-login');
  assert.equal(plan.methodsToUpdate[0].newPayload.login, '200010');
  assert.equal(plan.methodsToUpdate[0].newPayload.password, 'new_password');
  assert.equal('old_field' in plan.methodsToUpdate[0].newPayload, false);
});

test('executeReflectionSync: makes appropriate delete, post, and patch calls', async () => {
  const calls: { method: string; path: string; body?: any }[] = [];
  const mockApi = {
    post: async (path: string, body: any) => {
      calls.push({ method: 'POST', path, body });
      return { id: 'new-id-' + Math.random().toString(36).slice(2, 6) };
    },
    patch: async (path: string, body: any) => {
      calls.push({ method: 'PATCH', path, body });
      return { id: 'patched' };
    },
    delete: async (path: string) => {
      calls.push({ method: 'DELETE', path });
      return { ok: true };
    },
  };

  const plan = {
    servicesToDelete: [{ folderId: 'f-old', serviceName: 'OldService' }],
    servicesToCreate: [
      {
        name: 'NewService',
        methods: [
          { name: 'NewMethod', input_type: 'Req', output_type: 'Res', stream_type: 'unary' },
        ],
      },
    ],
    methodsToCreate: [
      { folderId: 'f-existing', serviceName: 'Existing', methodName: 'AddedMethod', streamType: 'unary' },
    ],
    methodsToDelete: [{ endpointId: 'ep-delete', methodName: 'OldMethod' }],
    methodsToUpdate: [
      {
        endpoint: {
          id: 'ep-update',
          collection_id: 'col-1',
          folder_id: 'f-existing',
          name: 'UpdatedMethod',
          protocol: 'grpc' as const,
          config: { payload: { a: 1 } },
          sort_order: 0,
          version: 1,
          created_at: '',
          updated_at: '',
        },
        newPayload: { a: 1, b: 2 },
        newStreamType: 'unary',
      },
    ],
  };

  const res = await (await import('./grpcReflectionSync.ts')).executeReflectionSync(
    'col-1',
    'root-folder',
    'localhost:9091',
    plan,
    {
      'NewService/NewMethod': { foo: 'bar' },
      'Existing/AddedMethod': { val: 42 },
    },
    mockApi
  );

  assert.equal(res.servicesDeleted, 1);
  assert.equal(res.servicesCreated, 1);
  assert.equal(res.methodsDeleted, 1);
  assert.equal(res.methodsCreated, 2);
  assert.equal(res.methodsUpdated, 1);

  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === '/folders/f-old'));
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === '/endpoints/ep-delete'));
  assert.ok(calls.some((c) => c.method === 'PATCH' && c.path === '/endpoints/ep-update'));
});

test('getFolderDotPath: reconstructs dot-path from nested folder hierarchy case-sensitively', () => {
  const folders: CollectionFolder[] = [
    { id: 'root', collection_id: 'c', parent_folder_id: null, name: 'Root', sort_order: 0, created_at: '', updated_at: '' },
    { id: 'f-grpc', collection_id: 'c', parent_folder_id: 'root', name: 'grpc', sort_order: 0, created_at: '', updated_at: '' },
    { id: 'f-health', collection_id: 'c', parent_folder_id: 'f-grpc', name: 'Health', sort_order: 0, created_at: '', updated_at: '' },
    { id: 'f-v1', collection_id: 'c', parent_folder_id: 'f-health', name: 'v1', sort_order: 0, created_at: '', updated_at: '' },
    { id: 'f-leaf', collection_id: 'c', parent_folder_id: 'f-v1', name: 'Health', sort_order: 0, created_at: '', updated_at: '' },
  ];
  const map = new Map(folders.map((f) => [f.id, f]));

  assert.equal(getFolderDotPath('f-leaf', 'root', map), 'grpc.Health.v1.Health');
  assert.equal(getFolderDotPath('f-v1', 'root', map), 'grpc.Health.v1');
  assert.equal(getFolderDotPath('f-grpc', 'root', map), 'grpc');
  assert.equal(getFolderDotPath('root', 'root', map), '');
});

test('planReflectionSync: reconciles nested multi-level gRPC folder structures (user scenario)', () => {
  const rootId = 'root-nutrade';

  const existingFolders: CollectionFolder[] = [
    { id: rootId, collection_id: 'c', parent_folder_id: null, name: 'NuTrade', sort_order: 0, created_at: '', updated_at: '' },
    // nutrade
    { id: 'f-nutrade', collection_id: 'c', parent_folder_id: rootId, name: 'nutrade', sort_order: 0, created_at: '', updated_at: '' },
    // nutrade.Client
    { id: 'f-client', collection_id: 'c', parent_folder_id: 'f-nutrade', name: 'Client', sort_order: 0, created_at: '', updated_at: '' },
    // nutrade.Client.ClientAccountAPI
    { id: 'f-account', collection_id: 'c', parent_folder_id: 'f-client', name: 'ClientAccountAPI', sort_order: 0, created_at: '', updated_at: '' },
    // nutrade.Client.ClientAuthAPI (to be deleted)
    { id: 'f-auth', collection_id: 'c', parent_folder_id: 'f-client', name: 'ClientAuthAPI', sort_order: 1, created_at: '', updated_at: '' },
  ];

  const existingEndpoints: Endpoint[] = [
    {
      id: 'ep-get-account',
      collection_id: 'c',
      folder_id: 'f-account',
      name: 'GetAccount',
      protocol: 'grpc',
      config: {
        server_address: 'localhost:9091',
        service: 'nutrade.Client.ClientAccountAPI',
        method: 'GetAccount',
        payload: { id: '123' },
      },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'ep-login',
      collection_id: 'c',
      folder_id: 'f-auth',
      name: 'Login',
      protocol: 'grpc',
      config: {
        server_address: 'localhost:9091',
        service: 'nutrade.Client.ClientAuthAPI',
        method: 'Login',
        payload: {},
      },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  // Fresh reflection:
  // 1. ClientAuthAPI is DELETED
  // 2. ClientAccountAPI has new method 'UpdateAccount'
  // 3. grpc.Health.v1.Health is ADDED (new service)
  const freshServices: GrpcServiceSummary[] = [
    {
      name: 'nutrade.Client.ClientAccountAPI',
      methods: [
        { name: 'GetAccount', input_type: 'GetAccountRequest', output_type: 'GetAccountResponse' },
        { name: 'UpdateAccount', input_type: 'UpdateAccountRequest', output_type: 'UpdateAccountResponse' },
      ],
    },
    {
      name: 'grpc.Health.v1.Health',
      methods: [
        { name: 'Check', input_type: 'HealthCheckRequest', output_type: 'HealthCheckResponse' },
      ],
    },
  ];

  const plan = planReflectionSync(
    rootId,
    existingFolders,
    existingEndpoints,
    freshServices,
    {
      'nutrade.Client.ClientAccountAPI/GetAccount': { id: '123' },
      'nutrade.Client.ClientAccountAPI/UpdateAccount': { name: 'New Name' },
      'grpc.Health.v1.Health/Check': {},
    }
  );

  // 1. Services to delete: ClientAuthAPI only
  assert.equal(plan.servicesToDelete.length, 1);
  assert.equal(plan.servicesToDelete[0].serviceName, 'nutrade.Client.ClientAuthAPI');
  assert.equal(plan.servicesToDelete[0].folderId, 'f-auth');

  // 2. Services to create: grpc.Health.v1.Health
  assert.equal(plan.servicesToCreate.length, 1);
  assert.equal(plan.servicesToCreate[0].name, 'grpc.Health.v1.Health');

  // 3. Methods to create: UpdateAccount inside f-account
  assert.equal(plan.methodsToCreate.length, 1);
  assert.equal(plan.methodsToCreate[0].folderId, 'f-account');
  assert.equal(plan.methodsToCreate[0].methodName, 'UpdateAccount');

  // 4. Methods to delete in existing retained services: none
  assert.equal(plan.methodsToDelete.length, 0);
});

test('executeReflectionSync: reuses shared parent folder and prunes empty intermediate folders', async () => {
  const calls: { method: string; path: string; body?: any }[] = [];
  let folderIdCounter = 100;
  let endpointIdCounter = 100;

  const mockApi = {
    post: async (path: string, body: any) => {
      calls.push({ method: 'POST', path, body });
      if (path.includes('/folders')) {
        return { id: `folder-${folderIdCounter++}`, name: body.name };
      }
      return { id: `endpoint-${endpointIdCounter++}`, name: body.name };
    },
    patch: async (path: string, body: any) => {
      calls.push({ method: 'PATCH', path, body });
      return { id: 'patched' };
    },
    delete: async (path: string) => {
      calls.push({ method: 'DELETE', path });
      return { ok: true };
    },
  };

  const rootId = 'root-nutrade';
  const existingFolders: CollectionFolder[] = [
    { id: rootId, collection_id: 'c', parent_folder_id: null, name: 'NuTrade', sort_order: 0, created_at: '', updated_at: '' },
    { id: 'f-nutrade', collection_id: 'c', parent_folder_id: rootId, name: 'nutrade', sort_order: 0, created_at: '', updated_at: '' },
    { id: 'f-client', collection_id: 'c', parent_folder_id: 'f-nutrade', name: 'Client', sort_order: 0, created_at: '', updated_at: '' },
    { id: 'f-account', collection_id: 'c', parent_folder_id: 'f-client', name: 'ClientAccountAPI', sort_order: 0, created_at: '', updated_at: '' },
  ];

  // Plan:
  // 1. Add new service under existing nutrade.Client: "nutrade.Client.ClientBillingAPI"
  // It should NOT create duplicate 'nutrade' or 'Client', but reuse them!
  const plan = {
    servicesToDelete: [],
    servicesToCreate: [
      {
        name: 'nutrade.Client.ClientBillingAPI',
        methods: [
          { name: 'Pay', input_type: 'PayReq', output_type: 'PayRes', stream_type: 'unary' },
        ],
      },
    ],
    methodsToCreate: [],
    methodsToDelete: [],
    methodsToUpdate: [],
  };

  const res = await executeReflectionSync(
    'c',
    rootId,
    'localhost:9091',
    plan,
    { 'nutrade.Client.ClientBillingAPI/Pay': { amount: 100 } },
    mockApi,
    existingFolders
  );

  assert.equal(res.servicesCreated, 1);
  assert.equal(res.methodsCreated, 1);

  // Check POST calls: only ONE folder created ('ClientBillingAPI' under 'f-client')!
  const folderPosts = calls.filter((c) => c.method === 'POST' && c.path.includes('/folders'));
  assert.equal(folderPosts.length, 1);
  assert.equal(folderPosts[0].body.name, 'ClientBillingAPI');
  assert.equal(folderPosts[0].body.parent_folder_id, 'f-client');

  // Check endpoint created inside the newly created folder
  const endpointPosts = calls.filter((c) => c.method === 'POST' && c.path.includes('/endpoints'));
  assert.equal(endpointPosts.length, 1);
  assert.equal(endpointPosts[0].body.name, 'Pay');
  assert.equal(endpointPosts[0].body.folder_id, 'folder-100');
});
