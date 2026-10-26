import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planGrpcHierarchy,
  executeGrpcHierarchyCreation,
  splitServiceName,
  shouldAutoDetectTls,
  generateSamplePayloadsBatch,
  generateGrpcCollection,
  GrpcGenerationError,
  DEFAULT_GRPC_SERVER_ADDRESS,
  DEFAULT_GRPC_FOLDER_NAME,
  DEFAULT_GRPC_USE_TLS,
  getDefaultGrpcConfig,
  type PlannedHierarchy,
  type PlannedFolderNode,
} from './grpcReflectionGenerator.ts';
import type { GrpcServiceSummary } from '@api-lab/api-types';

const mockServices: GrpcServiceSummary[] = [
  {
    name: 'nutrade.manager.AuthAPI',
    methods: [
      { name: 'Login', input_type: 'LoginRequest', output_type: 'LoginResponse' },
      { name: 'Profile', input_type: 'Empty', output_type: 'UserProfileResponse' },
    ],
  },
  {
    name: 'nuconnector.PriceStreamAPI',
    methods: [
      {
        name: 'SubscribePrice',
        input_type: 'SubscribePriceRequest',
        output_type: 'SubscribePriceResponse',
      },
    ],
  },
];

test('splitServiceName: splits by dots case-sensitively and trims whitespace', () => {
  assert.deepEqual(splitServiceName('grpc.Health.v1.Health'), ['grpc', 'Health', 'v1', 'Health']);
  assert.deepEqual(splitServiceName('nutrade.Client.ClientAccountAPI'), ['nutrade', 'Client', 'ClientAccountAPI']);
  assert.deepEqual(splitServiceName('Greeter'), ['Greeter']);
  assert.deepEqual(splitServiceName('  foo.Bar  '), ['foo', 'Bar']);
  assert.deepEqual(splitServiceName(''), []);
});

test('planGrpcHierarchy: correctly builds nested folder structure case-sensitively (user case)', () => {
  const userServices: GrpcServiceSummary[] = [
    {
      name: 'grpc.Health.v1.Health',
      methods: [
        { name: 'Check', input_type: 'HealthCheckRequest', output_type: 'HealthCheckResponse' },
        { name: 'Watch', input_type: 'HealthCheckRequest', output_type: 'HealthCheckResponse' },
      ],
    },
    {
      name: 'nutrade.Client.ClientAccountAPI',
      methods: [
        { name: 'GetAccount', input_type: 'GetAccountRequest', output_type: 'GetAccountResponse' },
      ],
    },
    {
      name: 'nutrade.Client.ClientAuthAPI',
      methods: [
        { name: 'Login', input_type: 'LoginRequest', output_type: 'LoginResponse' },
      ],
    },
  ];

  const planned = planGrpcHierarchy({
    folderName: 'NuTrade',
    serverAddress: 'grpcb.in:9001',
    services: userServices,
  });

  assert.equal(planned.rootFolderName, 'NuTrade');
  assert.equal(planned.totalEndpoints, 4);

  // Top level folders under root: 'grpc' and 'nutrade'
  assert.equal(planned.serviceFolders.length, 2);
  const grpcFolder = planned.serviceFolders.find((f) => f.name === 'grpc')!;
  const nutradeFolder = planned.serviceFolders.find((f) => f.name === 'nutrade')!;
  assert.ok(grpcFolder);
  assert.ok(nutradeFolder);

  // grpc -> Health -> v1 -> Health
  assert.equal(grpcFolder.children.length, 1);
  const healthFolder = grpcFolder.children[0];
  assert.equal(healthFolder.name, 'Health');
  assert.equal(healthFolder.children.length, 1);
  const v1Folder = healthFolder.children[0];
  assert.equal(v1Folder.name, 'v1');
  assert.equal(v1Folder.children.length, 1);
  const leafHealth = v1Folder.children[0];
  assert.equal(leafHealth.name, 'Health');
  assert.equal(leafHealth.endpoints.length, 2);
  assert.equal(leafHealth.endpoints[0].name, 'Check');
  assert.equal(leafHealth.endpoints[0].config.service, 'grpc.Health.v1.Health');
  assert.equal(leafHealth.endpoints[1].name, 'Watch');

  // nutrade -> Client (shared by ClientAccountAPI and ClientAuthAPI)
  assert.equal(nutradeFolder.children.length, 1);
  const clientFolder = nutradeFolder.children[0];
  assert.equal(clientFolder.name, 'Client'); // Exact case preserved
  assert.equal(clientFolder.children.length, 2);

  const accountApiFolder = clientFolder.children.find((f) => f.name === 'ClientAccountAPI')!;
  assert.ok(accountApiFolder);
  assert.equal(accountApiFolder.endpoints.length, 1);
  assert.equal(accountApiFolder.endpoints[0].name, 'GetAccount');
  assert.equal(accountApiFolder.endpoints[0].config.service, 'nutrade.Client.ClientAccountAPI');

  const authApiFolder = clientFolder.children.find((f) => f.name === 'ClientAuthAPI')!;
  assert.ok(authApiFolder);
  assert.equal(authApiFolder.endpoints.length, 1);
  assert.equal(authApiFolder.endpoints[0].name, 'Login');
  assert.equal(authApiFolder.endpoints[0].config.service, 'nutrade.Client.ClientAuthAPI');
});

test('executeGrpcHierarchyCreation: recursively creates nested folders and child endpoints', async () => {
  const calls: { path: string; body: any }[] = [];
  let folderIdCounter = 1;
  let endpointIdCounter = 1;

  const mockApi = {
    post: async (path: string, body: any) => {
      calls.push({ path, body });
      if (path.includes('/folders')) {
        return { id: `folder-${folderIdCounter++}`, name: body.name };
      }
      if (path.includes('/endpoints')) {
        return { id: `endpoint-${endpointIdCounter++}`, name: body.name };
      }
      return { id: 'other' };
    },
  };

  const planned = planGrpcHierarchy({
    folderName: 'TestFolder',
    serverAddress: 'localhost:9091',
    services: mockServices,
  });

  const res = await executeGrpcHierarchyCreation('coll-123', planned, mockApi);

  assert.equal(res.rootFolderId, 'folder-1');
  // mockServices: nutrade.manager.AuthAPI (3 folders) + nuconnector.PriceStreamAPI (2 folders) = 5
  assert.equal(res.createdServiceFoldersCount, 5);
  assert.equal(res.createdEndpointsCount, 3);

  // Call 1: Root folder created with grpc_url
  assert.equal(calls[0].path, '/collections/coll-123/folders');
  assert.deepEqual(calls[0].body, {
    name: 'TestFolder',
    parent_folder_id: null,
    grpc_url: 'localhost:9091',
  });

  // Call 2: Folder 'nutrade' under root 'folder-1'
  assert.equal(calls[1].path, '/collections/coll-123/folders');
  assert.deepEqual(calls[1].body, {
    name: 'nutrade',
    parent_folder_id: 'folder-1',
  });

  // Call 3: Folder 'manager' under 'folder-2' ('nutrade')
  assert.equal(calls[2].path, '/collections/coll-123/folders');
  assert.deepEqual(calls[2].body, {
    name: 'manager',
    parent_folder_id: 'folder-2',
  });

  // Call 4: Folder 'AuthAPI' under 'folder-3' ('manager')
  assert.equal(calls[3].path, '/collections/coll-123/folders');
  assert.deepEqual(calls[3].body, {
    name: 'AuthAPI',
    parent_folder_id: 'folder-3',
  });

  // Call 5 & 6: Endpoints under 'folder-4' ('AuthAPI')
  assert.equal(calls[4].path, '/collections/coll-123/endpoints');
  assert.equal(calls[4].body.folder_id, 'folder-4');
  assert.equal(calls[4].body.name, 'Login');

  assert.equal(calls[5].path, '/collections/coll-123/endpoints');
  assert.equal(calls[5].body.folder_id, 'folder-4');
  assert.equal(calls[5].body.name, 'Profile');

  // Call 7: Folder 'nuconnector' under root 'folder-1'
  assert.equal(calls[6].path, '/collections/coll-123/folders');
  assert.deepEqual(calls[6].body, {
    name: 'nuconnector',
    parent_folder_id: 'folder-1',
  });

  // Call 8: Folder 'PriceStreamAPI' under 'folder-5' ('nuconnector')
  assert.equal(calls[7].path, '/collections/coll-123/folders');
  assert.deepEqual(calls[7].body, {
    name: 'PriceStreamAPI',
    parent_folder_id: 'folder-5',
  });

  // Call 9: Endpoint under 'folder-6' ('PriceStreamAPI')
  assert.equal(calls[8].path, '/collections/coll-123/endpoints');
  assert.equal(calls[8].body.folder_id, 'folder-6');
  assert.equal(calls[8].body.name, 'SubscribePrice');
});

test('shouldAutoDetectTls: accurately detects remote domains vs local', () => {
  assert.equal(shouldAutoDetectTls('grpcb.in'), true);
  assert.equal(shouldAutoDetectTls('grpcb.in:9001'), true);
  assert.equal(shouldAutoDetectTls('https://my-service.com'), true);
  assert.equal(shouldAutoDetectTls('http://my-service.com'), false);
  assert.equal(shouldAutoDetectTls('grpc://localhost:50051'), false);
  assert.equal(shouldAutoDetectTls('grpc://grpcb.in:9001'), true);
  assert.equal(shouldAutoDetectTls('grpc://grpcb.in'), true);
  assert.equal(shouldAutoDetectTls('grpcs://localhost:50051'), true);
  assert.equal(shouldAutoDetectTls('localhost:50051'), false);
  assert.equal(shouldAutoDetectTls('127.0.0.1:3100'), false);
  // Variables resolution support
  assert.equal(shouldAutoDetectTls('{{GRPC_URL}}', { GRPC_URL: 'grpc://grpcb.in:9001' }), true);
  assert.equal(shouldAutoDetectTls('{{LOCAL_GRPC_URL}}', { LOCAL_GRPC_URL: 'grpc://localhost:9091' }), false);
  assert.equal(shouldAutoDetectTls('{{URL}}', { url: 'https://custom.rpc.io' }), true);
});

test('planGrpcHierarchy: preserves useTls setting for remote endpoints', () => {
  const planned = planGrpcHierarchy({
    folderName: 'Remote gRPC',
    serverAddress: 'grpcb.in:9001',
    services: mockServices,
  });

  const authApiFolder = planned.serviceFolders[0].children[0].children[0];
  assert.equal(authApiFolder.endpoints[0].config.use_tls, true);
});

test('generateSamplePayloadsBatch: concurrent execution with fallback on individual failure', async () => {
  const progressCalls: number[] = [];
  const payloads = await generateSamplePayloadsBatch({
    services: mockServices,
    serverAddress: 'localhost:9091',
    useTls: false,
    generateSamplePayload: async (req) => {
      if (req.method === 'Login') {
        return { payload: { token: 'mock-token' } };
      }
      if (req.method === 'Profile') {
        throw new Error('RPC error');
      }
      return { payload: { price: 100 } };
    },
    concurrency: 2,
    onProgress: (comp) => progressCalls.push(comp),
  });

  assert.deepEqual(payloads['nutrade.manager.AuthAPI/Login'], { token: 'mock-token' });
  assert.equal(payloads['nutrade.manager.AuthAPI/Profile'], undefined);
  assert.deepEqual(payloads['nuconnector.PriceStreamAPI/SubscribePrice'], { price: 100 });
  assert.equal(progressCalls.length, 3);
  assert.equal(progressCalls[progressCalls.length - 1], 3);
});

test('generateGrpcCollection: complete end-to-end success with mock reflection and endpoints', async () => {
  const createdCalls: any[] = [];
  const mockApi = {
    post: async (path: string, body: any) => {
      createdCalls.push({ path, body });
      return { id: `id-${createdCalls.length}` };
    },
  };

  const progressUpdates: string[] = [];

  const res = await generateGrpcCollection({
    collectionId: 'coll-999',
    folderName: 'NuTrade Root',
    serverAddress: 'grpcb.in:9001',
    timeoutMs: 5000,
    discoverServices: async () => ({ services: mockServices }),
    generateSamplePayload: async (req) => ({ payload: { method: req.method } }),
    apiCaller: mockApi,
    onProgress: (status) => progressUpdates.push(status),
  });

  assert.equal(res.rootFolderId, 'id-1');
  assert.equal(res.createdServiceFoldersCount, 5);
  assert.equal(res.createdEndpointsCount, 3);
  assert.equal(res.samplePayloadsCount, 3);
  assert.equal(res.effectiveTls, true);
  assert.ok(progressUpdates.some((s) => s.includes('Discovering services')));
  assert.ok(progressUpdates.some((s) => s.includes('Generating sample payloads')));
});

test('generateGrpcCollection: skip payload generation when generatePayloads is false', async () => {
  let samplePayloadCalled = false;
  const mockApi = {
    post: async () => ({ id: 'f-1' }),
  };

  const res = await generateGrpcCollection({
    collectionId: 'coll-999',
    folderName: 'NuTrade Root',
    serverAddress: 'localhost:9091',
    generatePayloads: false,
    discoverServices: async () => ({ services: mockServices }),
    generateSamplePayload: async () => {
      samplePayloadCalled = true;
      return { payload: {} };
    },
    apiCaller: mockApi,
  });

  assert.equal(samplePayloadCalled, false);
  assert.equal(res.samplePayloadsCount, 0);
  assert.equal(res.createdEndpointsCount, 3);
});

test('generateGrpcCollection: fails with timeout error when discovery takes longer than timeoutMs', async () => {
  const mockApi = { post: async () => ({ id: '1' }) };

  await assert.rejects(
    async () => {
      await generateGrpcCollection({
        collectionId: 'coll-1',
        folderName: 'Hanging Service',
        serverAddress: 'slow.service.io',
        timeoutMs: 50,
        discoverServices: async () => {
          await new Promise((r) => setTimeout(r, 200));
          return { services: mockServices };
        },
        apiCaller: mockApi,
      });
    },
    (err: any) => {
      assert.ok(err instanceof GrpcGenerationError);
      assert.equal(err.phase, 'discovery');
      assert.equal(err.isTimeout, true);
      assert.ok(err.message.includes('timed out'));
      assert.ok(err.message.includes('discovery'));
      return true;
    }
  );
});

test('generateGrpcCollection: fails with timeout error during sample payload generation reporting progress', async () => {
  const mockApi = { post: async () => ({ id: '1' }) };

  await assert.rejects(
    async () => {
      await generateGrpcCollection({
        collectionId: 'coll-1',
        folderName: 'Hanging Payload',
        serverAddress: 'slow.service.io',
        timeoutMs: 60,
        concurrency: 1,
        discoverServices: async () => ({ services: mockServices }),
        generateSamplePayload: async () => {
          await new Promise((r) => setTimeout(r, 200));
          return { payload: {} };
        },
        apiCaller: mockApi,
      });
    },
    (err: any) => {
      assert.ok(err instanceof GrpcGenerationError);
      assert.equal(err.phase, 'payload_generation');
      assert.equal(err.isTimeout, true);
      assert.ok(err.message.includes('timed out'));
      assert.ok(err.message.includes('generating sample payloads'));
      assert.ok(err.message.includes('Pre-generate sample JSON payloads'));
      return true;
    }
  );
});

test('getDefaultGrpcConfig: returns public grpcb.in test url default with TLS enabled', () => {
  const cfg = getDefaultGrpcConfig();
  assert.equal(cfg.serverAddress, 'https://grpcb.in:9001/');
  assert.equal(cfg.folderName, 'gRPC Services');
  assert.equal(cfg.useTls, true);
  assert.equal(DEFAULT_GRPC_SERVER_ADDRESS, 'https://grpcb.in:9001/');
  assert.equal(DEFAULT_GRPC_FOLDER_NAME, 'gRPC Services');
  assert.equal(DEFAULT_GRPC_USE_TLS, true);

  assert.equal(shouldAutoDetectTls(DEFAULT_GRPC_SERVER_ADDRESS), true);

  const planned = planGrpcHierarchy({
    ...cfg,
    services: mockServices,
  });
  assert.equal(planned.serverAddress, 'https://grpcb.in:9001/');
  const endpoint = planned.serviceFolders[0].children[0].children[0].endpoints[0];
  assert.equal(endpoint.config.use_tls, true);
});

