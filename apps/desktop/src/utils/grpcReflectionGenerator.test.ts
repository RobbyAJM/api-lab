import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planGrpcHierarchy,
  executeGrpcHierarchyCreation,
  shouldAutoDetectTls,
  generateSamplePayloadsBatch,
  generateGrpcCollection,
  GrpcGenerationError,
  type PlannedHierarchy,
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

test('planGrpcHierarchy: correctly builds {folderName} -> {service} -> {method} tree', () => {
  const planned = planGrpcHierarchy({
    folderName: 'NuTradeServices',
    serverAddress: 'localhost:9091',
    services: mockServices,
    samplePayloads: {
      'nutrade.manager.AuthAPI/Login': { login: '200010', password: 'secret_password' },
    },
  });

  assert.equal(planned.rootFolderName, 'NuTradeServices');
  assert.equal(planned.serviceFolders.length, 2);
  assert.equal(planned.totalEndpoints, 3);

  // Folder 1: nutrade.manager.AuthAPI
  const authFolder = planned.serviceFolders[0];
  assert.equal(authFolder.name, 'nutrade.manager.AuthAPI');
  assert.equal(authFolder.endpoints.length, 2);

  // Method: Login
  const loginEp = authFolder.endpoints[0];
  assert.equal(loginEp.name, 'Login');
  assert.equal(loginEp.protocol, 'grpc');
  assert.equal(loginEp.config.server_address, 'localhost:9091');
  assert.equal(loginEp.config.service, 'nutrade.manager.AuthAPI');
  assert.equal(loginEp.config.method, 'Login');
  assert.deepEqual(loginEp.config.payload, {
    login: '200010',
    password: 'secret_password',
  });

  // Method: Profile
  const profileEp = authFolder.endpoints[1];
  assert.equal(profileEp.name, 'Profile');
  assert.deepEqual(profileEp.config.payload, {});

  // Folder 2: nuconnector.PriceStreamAPI
  const streamFolder = planned.serviceFolders[1];
  assert.equal(streamFolder.name, 'nuconnector.PriceStreamAPI');
  assert.equal(streamFolder.endpoints.length, 1);
  assert.equal(streamFolder.endpoints[0].name, 'SubscribePrice');
});

test('executeGrpcHierarchyCreation: creates root folder, service subfolders, and child endpoints', async () => {
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
  assert.equal(res.createdServiceFoldersCount, 2);
  assert.equal(res.createdEndpointsCount, 3);

  // Check call 1: Root folder created with grpc_url
  assert.equal(calls[0].path, '/collections/coll-123/folders');
  assert.deepEqual(calls[0].body, {
    name: 'TestFolder',
    parent_folder_id: null,
    grpc_url: 'localhost:9091',
  });

  // Check call 2: First service folder created with parent_folder_id = folder-1
  assert.equal(calls[1].path, '/collections/coll-123/folders');
  assert.deepEqual(calls[1].body, {
    name: 'nutrade.manager.AuthAPI',
    parent_folder_id: 'folder-1',
  });

  // Check call 3 & 4: Endpoints under folder-2
  assert.equal(calls[2].path, '/collections/coll-123/endpoints');
  assert.equal(calls[2].body.folder_id, 'folder-2');
  assert.equal(calls[2].body.name, 'Login');

  assert.equal(calls[3].path, '/collections/coll-123/endpoints');
  assert.equal(calls[3].body.folder_id, 'folder-2');
  assert.equal(calls[3].body.name, 'Profile');

  // Check call 5: Second service folder created with parent_folder_id = folder-1
  assert.equal(calls[4].path, '/collections/coll-123/folders');
  assert.deepEqual(calls[4].body, {
    name: 'nuconnector.PriceStreamAPI',
    parent_folder_id: 'folder-1',
  });

  // Check call 6: Endpoint under folder-3
  assert.equal(calls[5].path, '/collections/coll-123/endpoints');
  assert.equal(calls[5].body.folder_id, 'folder-3');
  assert.equal(calls[5].body.name, 'SubscribePrice');
});

test('shouldAutoDetectTls: accurately detects remote domains vs local', () => {
  assert.equal(shouldAutoDetectTls('nu-trade.dev.dxtr.asia'), true);
  assert.equal(shouldAutoDetectTls('nu-trade.dev.dxtr.asia:443'), true);
  assert.equal(shouldAutoDetectTls('https://my-service.com'), true);
  assert.equal(shouldAutoDetectTls('http://my-service.com'), false);
  assert.equal(shouldAutoDetectTls('grpc://localhost:50051'), false);
  assert.equal(shouldAutoDetectTls('grpc://nu-trade.dev.dxtr.asia:443'), true);
  assert.equal(shouldAutoDetectTls('grpc://nu-trade.dev.dxtr.asia'), true);
  assert.equal(shouldAutoDetectTls('grpcs://localhost:50051'), true);
  assert.equal(shouldAutoDetectTls('localhost:50051'), false);
  assert.equal(shouldAutoDetectTls('127.0.0.1:3100'), false);
  // Variables resolution support
  assert.equal(shouldAutoDetectTls('{{NUTRADE_GRPC_URL}}', { NUTRADE_GRPC_URL: 'grpc://nu-trade.dev.dxtr.asia' }), true);
  assert.equal(shouldAutoDetectTls('{{NUTRADE_GRPC_URL}}', { NUTRADE_GRPC_URL: 'grpc://localhost:9091' }), false);
  assert.equal(shouldAutoDetectTls('{{URL}}', { url: 'https://custom.rpc.io' }), true);
});

test('planGrpcHierarchy: preserves useTls setting for remote endpoints', () => {
  const planned = planGrpcHierarchy({
    folderName: 'Remote gRPC',
    serverAddress: 'nu-trade.dev.dxtr.asia',
    services: mockServices,
  });

  assert.equal(planned.serviceFolders[0].endpoints[0].config.use_tls, true);
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
    serverAddress: 'nu-trade.dev.dxtr.asia:443',
    timeoutMs: 5000,
    discoverServices: async () => ({ services: mockServices }),
    generateSamplePayload: async (req) => ({ payload: { method: req.method } }),
    apiCaller: mockApi,
    onProgress: (status) => progressUpdates.push(status),
  });

  assert.equal(res.rootFolderId, 'id-1');
  assert.equal(res.createdServiceFoldersCount, 2);
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
