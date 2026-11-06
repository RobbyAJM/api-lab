import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileHttpPayload,
  planSwaggerSync,
  executeSwaggerSync,
} from './swaggerSync.ts';
import type { CollectionFolder, Endpoint } from '@api-lab/api-types';
import type { ParsedSwaggerSpec } from './swaggerParser.ts';

test('reconcileHttpPayload: preserves user edits, adds new schema fields, drops removed fields', () => {
  const current = {
    login: 'user_edited_value',
    password: 'my_secret_password',
    obsoleteField: 'to_be_dropped',
  };

  const fresh = {
    login: 'schema_default',
    password: 'schema_default',
    newField: 'new_value',
  };

  const { updatedPayload, changed } = reconcileHttpPayload(current, fresh);

  assert.equal(changed, true);
  assert.deepEqual(updatedPayload, {
    login: 'user_edited_value', // Preserved!
    password: 'my_secret_password', // Preserved!
    newField: 'new_value', // Added!
  });
});

test('planSwaggerSync: identifies additions, deletions, and updates', () => {
  const rootFolderId = 'root-swagger';

  const existingFolders: CollectionFolder[] = [
    {
      id: 'root-swagger',
      collection_id: 'coll-1',
      name: 'NuTrade APIs',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'folder-auth',
      collection_id: 'coll-1',
      parent_folder_id: 'root-swagger',
      name: 'AuthAPI',
      sort_order: 1,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'folder-deprecated',
      collection_id: 'coll-1',
      parent_folder_id: 'root-swagger',
      name: 'DeprecatedAPI',
      sort_order: 2,
      created_at: '',
      updated_at: '',
    },
  ];

  const existingEndpoints: Endpoint[] = [
    {
      id: 'ep-login',
      collection_id: 'coll-1',
      folder_id: 'folder-auth',
      name: 'Login',
      protocol: 'http',
      config: {
        method: 'POST',
        url: 'http://localhost:9090/api/v1/auth/login',
        body: JSON.stringify({ email: 'old@nutrade.com' }),
      },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'ep-obsolete',
      collection_id: 'coll-1',
      folder_id: 'folder-auth',
      name: 'ObsoleteEndpoint',
      protocol: 'http',
      config: {
        method: 'GET',
        url: 'http://localhost:9090/api/v1/auth/obsolete',
      },
      sort_order: 1,
      version: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  // Fresh spec:
  // - DeprecatedAPI removed
  // - TradeAPI added
  // - AuthAPI has Login (updated schema with new field) and Register (new endpoint), ObsoleteEndpoint removed
  const freshSpec: ParsedSwaggerSpec = {
    title: 'NuTrade Spec',
    version: 'v2',
    baseUrl: 'http://localhost:9090',
    totalEndpoints: 3,
    services: [
      {
        name: 'AuthAPI',
        endpoints: [
          {
            name: 'Login',
            method: 'POST',
            path: '/api/v1/auth/login',
            fullUrl: 'http://localhost:9090/api/v1/auth/login',
            serviceTag: 'AuthAPI',
            queryParams: [],
            headers: {},
            bodyType: 'json',
            body: JSON.stringify({ email: '', rememberMe: true }),
          },
          {
            name: 'Register',
            method: 'POST',
            path: '/api/v1/auth/register',
            fullUrl: 'http://localhost:9090/api/v1/auth/register',
            serviceTag: 'AuthAPI',
            queryParams: [],
            headers: {},
            bodyType: 'json',
            body: JSON.stringify({ email: '', password: '' }),
          },
        ],
      },
      {
        name: 'TradeAPI',
        endpoints: [
          {
            name: 'TradeSpot',
            method: 'POST',
            path: '/api/v1/trade/spot',
            fullUrl: 'http://localhost:9090/api/v1/trade/spot',
            serviceTag: 'TradeAPI',
            queryParams: [],
            headers: {},
            bodyType: 'none',
            body: '',
          },
        ],
      },
    ],
  };

  const plan = planSwaggerSync(rootFolderId, existingFolders, existingEndpoints, freshSpec);

  // 1. Service deletion: DeprecatedAPI
  assert.equal(plan.servicesToDelete.length, 1);
  assert.equal(plan.servicesToDelete[0].serviceName, 'DeprecatedAPI');

  // 2. Service creation: TradeAPI
  assert.equal(plan.servicesToCreate.length, 1);
  assert.equal(plan.servicesToCreate[0].name, 'TradeAPI');

  // 3. Endpoint deletion: ObsoleteEndpoint
  assert.equal(plan.endpointsToDelete.length, 1);
  assert.equal(plan.endpointsToDelete[0].endpointName, 'ObsoleteEndpoint');

  // 4. Endpoint creation: Register
  assert.equal(plan.endpointsToCreate.length, 1);
  assert.equal(plan.endpointsToCreate[0].endpoint.name, 'Register');

  // 5. Endpoint update: Login (reconciled body with rememberMe added and old email preserved)
  assert.equal(plan.endpointsToUpdate.length, 1);
  assert.equal(plan.endpointsToUpdate[0].endpoint.name, 'Login');
  const parsedBody = JSON.parse(plan.endpointsToUpdate[0].newConfig.body);
  assert.equal(parsedBody.email, 'old@nutrade.com');
  assert.equal(parsedBody.rememberMe, true);
});

test('executeSwaggerSync: executes deletes, creations, and patches', async () => {
  const deletes: string[] = [];
  const posts: { path: string; body: any }[] = [];
  const patches: { path: string; body: any }[] = [];

  const mockApi = {
    delete: async (path: string) => deletes.push(path),
    post: async (path: string, body: any) => {
      posts.push({ path, body });
      return { id: 'new-id', ...body };
    },
    patch: async (path: string, body: any) => {
      patches.push({ path, body });
      return { id: 'patched-id', ...body };
    },
  };

  const plan = {
    servicesToDelete: [{ folderId: 'folder-del', serviceName: 'OldService' }],
    servicesToCreate: [
      {
        name: 'NewService',
        endpoints: [
          {
            name: 'NewEndpoint',
            method: 'GET',
            path: '/test',
            fullUrl: 'http://localhost/test',
            serviceTag: 'NewService',
            queryParams: [] as [string, string][],
            headers: {},
            bodyType: 'none' as const,
            body: '',
          },
        ],
      },
    ],
    endpointsToCreate: [
      {
        folderId: 'existing-folder',
        serviceName: 'AuthAPI',
        endpoint: {
          name: 'ExtraEndpoint',
          method: 'GET',
          path: '/extra',
          fullUrl: 'http://localhost/extra',
          serviceTag: 'AuthAPI',
          queryParams: [] as [string, string][],
          headers: {},
          bodyType: 'none' as const,
          body: '',
        },
      },
    ],
    endpointsToDelete: [{ endpointId: 'ep-del', endpointName: 'OldEndpoint' }],
    endpointsToUpdate: [
      {
        endpoint: { id: 'ep-up', name: 'UpdateMe' } as any,
        newConfig: { method: 'POST' },
      },
    ],
  };

  const result = await executeSwaggerSync('coll-1', 'root-1', plan, mockApi);

  assert.equal(result.deletedEndpointsCount, 1);
  assert.equal(result.deletedServicesCount, 1);
  assert.equal(result.createdServicesCount, 1);
  assert.equal(result.createdEndpointsCount, 2); // 1 from NewService, 1 from endpointsToCreate
  assert.equal(result.updatedEndpointsCount, 1);

  assert.ok(deletes.includes('/endpoints/ep-del'));
  assert.ok(deletes.includes('/folders/folder-del'));
  assert.ok(patches.some((p) => p.path === '/endpoints/ep-up'));
  assert.ok(posts.some((p) => p.path === '/collections/coll-1/endpoints/batch'));
});

test('planSwaggerSync & executeSwaggerSync: updates endpoint name when name was legacy summary', async () => {
  const rootFolderId = 'root-swagger';
  const existingFolders: CollectionFolder[] = [
    {
      id: 'f-auth',
      collection_id: 'coll-1',
      parent_folder_id: rootFolderId,
      name: 'AuthAPI',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
  ];

  const existingEndpoints: Endpoint[] = [
    {
      id: 'ep-login',
      collection_id: 'coll-1',
      folder_id: 'f-auth',
      name: 'Logs user into system', // Legacy summary as name
      protocol: 'http',
      config: {
        method: 'POST',
        url: 'https://api.example.com/auth/login',
        summary: 'Logs user into system',
      },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  const freshSpec: ParsedSwaggerSpec = {
    title: 'Auth',
    version: '1.0.0',
    baseUrl: 'https://api.example.com',
    services: [
      {
        name: 'AuthAPI',
        endpoints: [
          {
            name: 'loginUser', // operationId
            method: 'POST',
            path: '/auth/login',
            fullUrl: 'https://api.example.com/auth/login',
            serviceTag: 'AuthAPI',
            summary: 'Logs user into system',
            queryParams: [],
            headers: {},
            bodyType: 'none',
            body: '',
          },
        ],
      },
    ],
  };

  const plan = planSwaggerSync(rootFolderId, existingFolders, existingEndpoints, freshSpec);
  assert.equal(plan.endpointsToUpdate.length, 1);
  assert.equal(plan.endpointsToUpdate[0].newName, 'loginUser');

  const patches: { path: string; body: any }[] = [];
  const mockApi = {
    delete: async () => {},
    post: async () => ({ id: 'new' }),
    patch: async (path: string, body: any) => {
      patches.push({ path, body });
      return body;
    },
  };

  await executeSwaggerSync('coll-1', rootFolderId, plan, mockApi);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].path, '/endpoints/ep-login');
  assert.equal(patches[0].body.name, 'loginUser');
});

test('planSwaggerSync: matches endpoints when existing URL has query parameters and preserves them', () => {
  const rootFolderId = 'folder-root';
  const existingFolders: CollectionFolder[] = [
    {
      id: rootFolderId,
      collection_id: 'coll-1',
      name: 'Swagger APIs',
      parent_folder_id: null,
      created_at: '',
      updated_at: '',
      swagger_url: 'https://api.example.com/openapi.json',
    },
    {
      id: 'folder-user',
      collection_id: 'coll-1',
      name: 'UserAPI',
      parent_folder_id: rootFolderId,
      created_at: '',
      updated_at: '',
    },
  ];

  const existingEndpoints: Endpoint[] = [
    {
      id: 'ep-get-user',
      collection_id: 'coll-1',
      folder_id: 'folder-user',
      name: 'getUser',
      protocol: 'http',
      config: {
        method: 'GET',
        // User edited URL to append query params
        url: 'https://api.example.com/users/123?detailed=true&view=full',
        query_params: [
          ['detailed', 'true'],
          ['view', 'full'],
        ],
        body: '',
      },
      created_at: '',
      updated_at: '',
    },
  ];

  const freshSpec: ParsedSwaggerSpec = {
    title: 'API Spec',
    version: '1.0',
    baseUrl: 'https://api.example.com',
    totalEndpoints: 1,
    services: [
      {
        name: 'UserAPI',
        endpoints: [
          {
            name: 'getUser',
            method: 'GET',
            path: '/users/123',
            fullUrl: 'https://api.example.com/users/123',
            serviceTag: 'UserAPI',
            summary: 'Updated summary from spec',
            queryParams: [],
            headers: {},
            bodyType: 'none',
            body: '',
          },
        ],
      },
    ],
  };

  const plan = planSwaggerSync(rootFolderId, existingFolders, existingEndpoints, freshSpec);
  // Must NOT treat as delete + create!
  assert.equal(plan.endpointsToDelete.length, 0);
  assert.equal(plan.endpointsToCreate.length, 0);
  assert.equal(plan.endpointsToUpdate.length, 1);
  // Preserves existing query params in target url
  assert.equal(
    plan.endpointsToUpdate[0].newConfig.url,
    'https://api.example.com/users/123?detailed=true&view=full'
  );
  assert.equal(plan.endpointsToUpdate[0].newConfig.query_params.length, 2);
});

test('executeSwaggerSync: batches endpoints in chunks of 50 and reports progress', async () => {
  const batchCalls: any[] = [];
  const mockApi = {
    post: async (path: string, body: any) => {
      if (path.includes('/endpoints/batch')) {
        batchCalls.push(body.endpoints);
      }
      return { id: 'mock-id' };
    },
    patch: async () => ({}),
    delete: async () => ({}),
  };

  const endpointsToCreate: any[] = [];
  for (let i = 0; i < 115; i++) {
    endpointsToCreate.push({
      folderId: 'f-exist',
      serviceName: 'BigService',
      endpoint: {
        name: `Endpoint${i}`,
        method: 'GET',
        path: `/path/${i}`,
        fullUrl: `http://localhost/path/${i}`,
        serviceTag: 'BigService',
        queryParams: [],
        headers: {},
        bodyType: 'none',
        body: '',
      },
    });
  }

  const plan = {
    servicesToDelete: [],
    servicesToCreate: [],
    endpointsToCreate,
    endpointsToDelete: [],
    endpointsToUpdate: [],
  };

  const progressUpdates: any[] = [];
  const result = await executeSwaggerSync(
    'col-1',
    'root-1',
    plan,
    mockApi,
    (info) => progressUpdates.push(info)
  );

  assert.equal(result.createdEndpointsCount, 115);
  // 115 endpoints in chunks of 50 = 3 chunks (50, 50, 15)
  assert.equal(batchCalls.length, 3);
  assert.equal(batchCalls[0].length, 50);
  assert.equal(batchCalls[1].length, 50);
  assert.equal(batchCalls[2].length, 15);
  assert.ok(progressUpdates.length >= 3);
  assert.ok(progressUpdates.some((p) => typeof p === 'object' && p.percent === 100));
});

test('executeSwaggerSync: respects abort signal and halts execution cleanly', async () => {
  const calls: string[] = [];
  const mockApi = {
    post: async (path: string) => {
      calls.push(path);
      return { id: 'mock' };
    },
    patch: async (path: string) => {
      calls.push(path);
      return {};
    },
    delete: async (path: string) => {
      calls.push(path);
      return {};
    },
  };

  const plan = {
    servicesToDelete: [{ folderId: 'f-1', serviceName: 'Svc1' }],
    servicesToCreate: [],
    endpointsToCreate: [{ folderId: 'f-1', serviceName: 'Svc1', endpoint: { name: 'E1', method: 'GET', path: '/e1', fullUrl: 'http://localhost/e1', serviceTag: 'Svc1', queryParams: [], headers: {}, bodyType: 'none' as const, body: '' } }],
    endpointsToDelete: [],
    endpointsToUpdate: [],
  };

  const abortSignal = { aborted: true };
  const result = await executeSwaggerSync(
    'col-1',
    'root-1',
    plan,
    mockApi,
    undefined,
    abortSignal
  );

  assert.equal(result.deletedServicesCount, 0);
  assert.equal(result.createdEndpointsCount, 0);
  assert.equal(calls.length, 0);
});

test('planSwaggerSync: populates interactive diff details for endpointsToUpdate and endpointsToCreate', () => {
  const rootFolderId = 'root-swagger';

  const existingFolders: CollectionFolder[] = [
    {
      id: 'root-swagger',
      collection_id: 'coll-1',
      name: 'APIs',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'folder-user',
      collection_id: 'coll-1',
      parent_folder_id: 'root-swagger',
      name: 'UserAPI',
      sort_order: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  const existingEndpoints: Endpoint[] = [
    {
      id: 'ep-user-profile',
      collection_id: 'coll-1',
      folder_id: 'folder-user',
      name: 'UserProfile',
      protocol: 'http',
      config: {
        method: 'GET',
        url: 'http://api.local/v1/users/profile',
        headers: { 'X-Old-Header': 'val' },
        query_params: [['legacy_page', '1']],
        body: JSON.stringify({ bio: 'developer', deprecatedField: 'remove_me' }),
      },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'ep-user-status',
      collection_id: 'coll-1',
      folder_id: 'folder-user',
      name: 'LegacyStatusName',
      protocol: 'http',
      config: {
        method: 'GET',
        url: 'http://api.local/v1/users/status',
        headers: {},
        query_params: [],
        body: '',
      },
      sort_order: 1,
      version: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  const freshSpec: ParsedSwaggerSpec = {
    title: 'User API Spec',
    version: '2.0',
    baseUrl: 'http://api.local',
    totalEndpoints: 3,
    services: [
      {
        name: 'UserAPI',
        endpoints: [
          {
            name: 'UserProfile',
            method: 'PATCH',
            path: '/v2/users/profile',
            fullUrl: 'http://api.local/v2/users/profile',
            serviceTag: 'UserAPI',
            summary: 'Updated profile endpoint',
            queryParams: [['filter', 'active']],
            headers: { 'X-New-Header': 'val' },
            bodyType: 'json',
            body: JSON.stringify({ bio: 'default bio', newRole: 'admin' }),
          },
          {
            name: 'UserStatus',
            method: 'GET',
            path: '/v1/users/status',
            fullUrl: 'http://api.local/v1/users/status',
            serviceTag: 'UserAPI',
            queryParams: [],
            headers: {},
            bodyType: 'none',
            body: '',
          },
          {
            name: 'CreateUser',
            method: 'POST',
            path: '/v2/users',
            fullUrl: 'http://api.local/v2/users',
            serviceTag: 'UserAPI',
            queryParams: [],
            headers: { 'Content-Type': 'application/json' },
            bodyType: 'json',
            body: JSON.stringify({ username: 'guest' }),
          },
        ],
      },
    ],
  };

  const plan = planSwaggerSync(rootFolderId, existingFolders, existingEndpoints, freshSpec);

  // Verify endpointsToCreate passes sample payload and headers
  assert.equal(plan.endpointsToCreate.length, 1);
  assert.equal(plan.endpointsToCreate[0].endpoint.name, 'CreateUser');
  assert.deepEqual(plan.endpointsToCreate[0].payload, { username: 'guest' });
  assert.deepEqual(plan.endpointsToCreate[0].headers, { 'Content-Type': 'application/json' });

  // Verify endpointsToUpdate diffSummary
  assert.equal(plan.endpointsToUpdate.length, 2);
  const uProfile = plan.endpointsToUpdate.find((x) => x.endpoint.id === 'ep-user-profile')!;
  assert.ok(uProfile);
  assert.equal(uProfile.oldEndpoint?.id, 'ep-user-profile');

  assert.ok(uProfile.diffSummary);
  assert.deepEqual(uProfile.diffSummary.methodChange, { old: 'GET', new: 'PATCH' });
  assert.deepEqual(uProfile.diffSummary.urlChange, {
    old: 'http://api.local/v1/users/profile',
    new: 'http://api.local/v2/users/profile',
  });
  assert.deepEqual(uProfile.diffSummary.queryParamsDiff, {
    added: ['filter'],
    removed: ['legacy_page'],
  });
  assert.deepEqual(uProfile.diffSummary.headersDiff, {
    added: ['X-New-Header'],
    removed: ['X-Old-Header'],
  });
  assert.ok(uProfile.diffSummary.bodyDiff);
  assert.deepEqual(uProfile.diffSummary.bodyDiff.added, ['newRole']);
  assert.deepEqual(uProfile.diffSummary.bodyDiff.removed, ['deprecatedField']);
  assert.deepEqual(uProfile.diffSummary.oldBody, { bio: 'developer', deprecatedField: 'remove_me' });
  assert.deepEqual(uProfile.diffSummary.newBody, { bio: 'developer', newRole: 'admin' });

  const uStatus = plan.endpointsToUpdate.find((x) => x.endpoint.id === 'ep-user-status')!;
  assert.ok(uStatus);
  assert.equal(uStatus.newName, 'UserStatus');
  assert.deepEqual(uStatus.diffSummary?.nameChange, { old: 'LegacyStatusName', new: 'UserStatus' });
});

test('planSwaggerSync: does not report false diff when GET/no-body endpoint has missing summary or edited values', () => {
  const rootFolderId = 'root-swagger';
  const existingFolders: CollectionFolder[] = [
    {
      id: 'root-swagger',
      collection_id: 'coll-1',
      name: 'Swagger APIs',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'folder-anything',
      collection_id: 'coll-1',
      parent_folder_id: 'root-swagger',
      name: 'Anything',
      sort_order: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  const existingEndpoints: Endpoint[] = [
    {
      id: 'ep-anything-get',
      collection_id: 'coll-1',
      folder_id: 'folder-anything',
      name: 'get_anything_get',
      protocol: 'http',
      config: {
        method: 'GET',
        url: 'https://httpbin.dmuth.org/anything',
        // Summary was omitted or dropped by editor save
        headers: {},
        query_params: [],
        body: '',
      },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  const freshSpec: ParsedSwaggerSpec = {
    title: 'Httpbin',
    version: '1.0',
    baseUrl: 'https://httpbin.dmuth.org',
    totalEndpoints: 1,
    services: [
      {
        name: 'Anything',
        endpoints: [
          {
            name: 'get_anything_get',
            method: 'GET',
            path: '/anything',
            fullUrl: 'https://httpbin.dmuth.org/anything',
            serviceTag: 'Anything',
            summary: 'Returns anything that is passed into the request.',
            queryParams: [],
            headers: {},
            bodyType: 'none',
            body: '',
          },
        ],
      },
    ],
  };

  const plan = planSwaggerSync(rootFolderId, existingFolders, existingEndpoints, freshSpec);
  assert.equal(plan.endpointsToUpdate.length, 0, 'Must NOT flag get_anything_get as an update');
  assert.equal(plan.endpointsToCreate.length, 0);
  assert.equal(plan.endpointsToDelete.length, 0);
});

test('planSwaggerSync: does not report false diff when user customizes payload values without schema structural changes', () => {
  const rootFolderId = 'root-swagger';
  const existingFolders: CollectionFolder[] = [
    {
      id: 'root-swagger',
      collection_id: 'coll-1',
      name: 'Swagger APIs',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'folder-auth',
      collection_id: 'coll-1',
      parent_folder_id: 'root-swagger',
      name: 'Auth',
      sort_order: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  const existingEndpoints: Endpoint[] = [
    {
      id: 'ep-login',
      collection_id: 'coll-1',
      folder_id: 'folder-auth',
      name: 'Login',
      protocol: 'http',
      config: {
        method: 'POST',
        url: 'https://api.example.com/login',
        summary: 'Login endpoint',
        headers: { 'Content-Type': 'application/json' },
        query_params: [],
        body: JSON.stringify({ email: 'user@example.com', password: 'secretpassword123' }),
      },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  const freshSpec: ParsedSwaggerSpec = {
    title: 'Auth API',
    version: '1.0',
    baseUrl: 'https://api.example.com',
    totalEndpoints: 1,
    services: [
      {
        name: 'Auth',
        endpoints: [
          {
            name: 'Login',
            method: 'POST',
            path: '/login',
            fullUrl: 'https://api.example.com/login',
            serviceTag: 'Auth',
            summary: 'Login endpoint',
            queryParams: [],
            headers: { 'Content-Type': 'application/json' },
            bodyType: 'json',
            body: JSON.stringify({ email: '', password: '' }),
          },
        ],
      },
    ],
  };

  const plan = planSwaggerSync(rootFolderId, existingFolders, existingEndpoints, freshSpec);
  assert.equal(plan.endpointsToUpdate.length, 0, 'Editing payload values must not trigger false diff');
});
