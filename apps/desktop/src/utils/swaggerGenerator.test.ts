import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planSwaggerHierarchy,
  executeSwaggerHierarchyCreation,
  generateSwaggerCollection,
  substituteUrlVariables,
  combineSwaggerUrl,
  DEFAULT_SWAGGER_URL,
  DEFAULT_SWAGGER_BASE_URL,
  DEFAULT_SWAGGER_PATH,
  DEFAULT_SWAGGER_FOLDER_NAME,
  getDefaultSwaggerConfig,
} from './swaggerGenerator.ts';
import type { ParsedSwaggerSpec } from './swaggerParser.ts';

const mockSpec: ParsedSwaggerSpec = {
  title: 'NuTrade APIs',
  version: '1.0',
  baseUrl: 'http://localhost:9090',
  totalEndpoints: 2,
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
          headers: { 'Content-Type': 'application/json' },
          bodyType: 'json',
          body: JSON.stringify({ login: '1001', password: 'secret' }),
        },
      ],
    },
    {
      name: 'UserAPI',
      endpoints: [
        {
          name: 'ListUsers',
          method: 'GET',
          path: '/api/v1/users',
          fullUrl: 'http://localhost:9090/api/v1/users',
          serviceTag: 'UserAPI',
          queryParams: [['page', '1']],
          headers: {},
          bodyType: 'none',
          body: '',
        },
      ],
    },
  ],
};

test('substituteUrlVariables: substitutes {{VAR}} properly', () => {
  const url = '{{BASE_URL}}/swagger/combined/{{APP}}.swagger.json';
  const vars = { BASE_URL: 'http://localhost:9090', APP: 'nutrade' };
  assert.equal(
    substituteUrlVariables(url, vars),
    'http://localhost:9090/swagger/combined/nutrade.swagger.json'
  );
});

test('planSwaggerHierarchy: correctly constructs root, service folders, and endpoint configs', () => {
  const planned = planSwaggerHierarchy({
    folderName: 'Custom NuTrade Folder',
    swaggerUrl: 'http://localhost:9090/swagger/combined/nutrade.swagger.json',
    spec: mockSpec,
  });

  assert.equal(planned.rootFolderName, 'Custom NuTrade Folder');
  assert.equal(planned.swaggerUrl, 'http://localhost:9090/swagger/combined/nutrade.swagger.json');
  assert.equal(planned.serviceFolders.length, 2);
  assert.equal(planned.totalEndpoints, 2);

  const authFolder = planned.serviceFolders.find((f) => f.name === 'AuthAPI');
  assert.ok(authFolder);
  assert.equal(authFolder.endpoints[0].config.method, 'POST');
  assert.equal(authFolder.endpoints[0].config.url, 'http://localhost:9090/api/v1/auth/login');
  assert.equal(authFolder.endpoints[0].protocol, 'http');
});

test('executeSwaggerHierarchyCreation: creates root folder, service folders, and endpoints via API', async () => {
  const calls: { path: string; body: any }[] = [];
  const mockApi = {
    post: async (path: string, body: any) => {
      calls.push({ path, body });
      if (path.includes('/folders')) {
        return { id: `folder-${calls.length}`, ...body };
      }
      return { id: `ep-${calls.length}`, ...body };
    },
  };

  const planned = planSwaggerHierarchy({
    folderName: 'NuTrade Root',
    swaggerUrl: 'http://localhost:9090/swagger/nutrade.json',
    spec: mockSpec,
  });

  const result = await executeSwaggerHierarchyCreation('coll-123', planned, mockApi);

  assert.equal(result.rootFolderId, 'folder-1');
  assert.equal(result.createdServiceFoldersCount, 2);
  assert.equal(result.createdEndpointsCount, 2);

  // Check Call 1: Root folder created with swagger_url
  assert.equal(calls[0].path, '/collections/coll-123/folders');
  assert.equal(calls[0].body.name, 'NuTrade Root');
  assert.equal(calls[0].body.parent_folder_id, null);
  assert.equal(calls[0].body.swagger_url, 'http://localhost:9090/swagger/nutrade.json');

  // Check Call 2: Child folder 1
  assert.equal(calls[1].path, '/collections/coll-123/folders');
  assert.equal(calls[1].body.parent_folder_id, 'folder-1');
  assert.equal(calls[1].body.name, 'AuthAPI');

  // Check Call 3: Child folder 2
  assert.equal(calls[2].path, '/collections/coll-123/folders');
  assert.equal(calls[2].body.parent_folder_id, 'folder-1');
  assert.equal(calls[2].body.name, 'UserAPI');

  // Check Call 4: Batch endpoint creation in chunk
  assert.equal(calls[3].path, '/collections/coll-123/endpoints/batch');
  assert.equal(calls[3].body.endpoints.length, 2);
  assert.equal(calls[3].body.endpoints[0].folder_id, 'folder-2');
  assert.equal(calls[3].body.endpoints[0].protocol, 'http');
  assert.equal(calls[3].body.endpoints[0].config.method, 'POST');
});

test('generateSwaggerCollection: complete flow with mock fetch and api', async () => {
  const mockDoc = {
    swagger: '2.0',
    info: { title: 'Mock Service' },
    paths: {
      '/ping': {
        get: {
          operationId: 'Ping',
          tags: ['HealthAPI'],
        },
      },
    },
  };

  const mockFetch: any = async () => ({
    ok: true,
    json: async () => mockDoc,
  });

  const apiCalls: string[] = [];
  const mockApi = {
    post: async (path: string, body: any) => {
      apiCalls.push(path);
      return { id: 'test-id', ...body };
    },
  };

  const progressUpdates: string[] = [];
  const result = await generateSwaggerCollection({
    collectionId: 'coll-abc',
    folderName: 'Health Group',
    swaggerUrl: 'http://localhost:9090/swagger.json',
    onProgress: (status) => progressUpdates.push(status),
    apiCaller: mockApi,
    fetchFn: mockFetch,
  });

  assert.equal(result.totalEndpoints, 1);
  assert.equal(result.createdServiceFoldersCount, 1);
  assert.equal(result.createdEndpointsCount, 1);
  assert.ok(progressUpdates.length >= 3);
});

test('getDefaultSwaggerConfig: returns public httpbin test url default', () => {
  const cfg = getDefaultSwaggerConfig();
  assert.equal(cfg.baseUrl, 'https://httpbin.dmuth.org');
  assert.equal(cfg.path, 'openapi.json');
  assert.equal(cfg.swaggerUrl, 'https://httpbin.dmuth.org/openapi.json');
  assert.equal(cfg.folderName, 'Swagger APIs');
  assert.equal(DEFAULT_SWAGGER_BASE_URL, 'https://httpbin.dmuth.org');
  assert.equal(DEFAULT_SWAGGER_PATH, 'openapi.json');
  assert.equal(DEFAULT_SWAGGER_URL, 'https://httpbin.dmuth.org/openapi.json');
  assert.equal(DEFAULT_SWAGGER_FOLDER_NAME, 'Swagger APIs');
});

test('combineSwaggerUrl: combines base url and path with port and variable support', () => {
  // Bare host with port defaults to http://
  assert.equal(
    combineSwaggerUrl('localhost:9091', 'openapi.json'),
    'http://localhost:9091/openapi.json'
  );
  // Preserves https scheme and cleans slashes
  assert.equal(
    combineSwaggerUrl('https://httpbin.dmuth.org/', '/openapi.json'),
    'https://httpbin.dmuth.org/openapi.json'
  );
  // Preserves variable template
  assert.equal(
    combineSwaggerUrl('{{API_HOST}}', 'v2/swagger.json'),
    '{{API_HOST}}/v2/swagger.json'
  );
  // Empty path returns clean base
  assert.equal(
    combineSwaggerUrl('localhost:9091/', ''),
    'http://localhost:9091'
  );
});

test('generateSwaggerCollection: uses custom baseUrl for endpoint routes and reports granular progress', async () => {
  const mockDoc = {
    swagger: '2.0',
    info: { title: 'Custom Host API', version: '1.0' },
    paths: {
      '/status': {
        get: {
          operationId: 'GetStatus',
          tags: ['StatusService'],
        },
      },
    },
  };

  const mockFetch: any = async () => ({
    ok: true,
    json: async () => mockDoc,
  });

  const createdEndpoints: any[] = [];
  const mockApi = {
    post: async (path: string, body: any) => {
      if (path.includes('/endpoints/batch')) {
        createdEndpoints.push(...body.endpoints);
      } else if (path.includes('/endpoints')) {
        createdEndpoints.push(body);
      }
      return { id: 'created-id', ...body };
    },
  };

  const progressUpdates: any[] = [];
  const result = await generateSwaggerCollection({
    collectionId: 'coll-xyz',
    folderName: 'Status Folder',
    swaggerUrl: 'http://localhost:9091/openapi.json',
    baseUrl: 'localhost:9091',
    onProgress: (info) => progressUpdates.push(info),
    apiCaller: mockApi,
    fetchFn: mockFetch,
  });

  assert.equal(result.totalEndpoints, 1);
  assert.equal(createdEndpoints.length, 1);
  assert.equal(createdEndpoints[0].config.url, 'http://localhost:9091/status');
  assert.ok(progressUpdates.some((p) => typeof p === 'object' && p.percent === 10));
  assert.ok(progressUpdates.some((p) => typeof p === 'object' && p.percent === 100));
});

test('executeSwaggerHierarchyCreation: batches endpoints in chunks of 50', async () => {
  const batchCalls: any[] = [];
  const mockApi = {
    post: async (path: string, body: any) => {
      if (path.includes('/endpoints/batch')) {
        batchCalls.push(body.endpoints);
      }
      return { id: `res-${batchCalls.length}`, ...body };
    },
  };

  const endpoints: any[] = [];
  for (let i = 0; i < 125; i++) {
    endpoints.push({
      name: `Endpoint ${i}`,
      method: 'GET',
      path: `/test/${i}`,
      fullUrl: `http://localhost:9090/test/${i}`,
      serviceTag: 'BigService',
      queryParams: [],
      headers: {},
      bodyType: 'none',
      body: '',
    });
  }

  const bigSpec: ParsedSwaggerSpec = {
    title: 'Big API',
    version: '1.0',
    baseUrl: 'http://localhost:9090',
    totalEndpoints: 125,
    services: [{ name: 'BigService', endpoints }],
  };

  const planned = planSwaggerHierarchy({
    folderName: 'Big Folder',
    swaggerUrl: 'http://localhost:9090/spec.json',
    spec: bigSpec,
  });

  const result = await executeSwaggerHierarchyCreation('coll-big', planned, mockApi);
  assert.equal(result.createdEndpointsCount, 125);
  // 125 endpoints chunked into chunks of 50 -> 3 batches: 50, 50, 25
  assert.equal(batchCalls.length, 3);
  assert.equal(batchCalls[0].length, 50);
  assert.equal(batchCalls[1].length, 50);
  assert.equal(batchCalls[2].length, 25);
});

test('executeSwaggerHierarchyCreation: respects abort signal and halts endpoint creation', async () => {
  const calls: { path: string; body: any }[] = [];
  const mockApi = {
    post: async (path: string, body: any) => {
      calls.push({ path, body });
      return { id: `id-${calls.length}`, ...body };
    },
  };

  const planned = planSwaggerHierarchy({
    folderName: 'Cancel Test',
    swaggerUrl: 'http://localhost:9090/spec.json',
    spec: mockSpec,
  });

  const abortSignal = { aborted: true };
  const result = await executeSwaggerHierarchyCreation(
    'coll-abort',
    planned,
    mockApi,
    undefined,
    abortSignal
  );

  assert.equal(result.createdEndpointsCount, 0);
  assert.equal(calls.length, 0);
});

