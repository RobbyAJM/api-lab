import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planSwaggerHierarchy,
  executeSwaggerHierarchyCreation,
  generateSwaggerCollection,
  substituteUrlVariables,
  DEFAULT_SWAGGER_URL,
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

  // Check Call 3: Endpoint 1
  assert.equal(calls[2].path, '/collections/coll-123/endpoints');
  assert.equal(calls[2].body.folder_id, 'folder-2');
  assert.equal(calls[2].body.protocol, 'http');
  assert.equal(calls[2].body.config.method, 'POST');
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
  assert.equal(cfg.swaggerUrl, 'https://httpbin.dmuth.org/openapi.json');
  assert.equal(cfg.folderName, 'Swagger APIs');
  assert.equal(DEFAULT_SWAGGER_URL, 'https://httpbin.dmuth.org/openapi.json');
  assert.equal(DEFAULT_SWAGGER_FOLDER_NAME, 'Swagger APIs');
});

