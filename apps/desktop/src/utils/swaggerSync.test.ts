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
});
