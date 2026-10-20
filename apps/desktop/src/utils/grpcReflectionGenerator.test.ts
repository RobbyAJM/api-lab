import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planGrpcHierarchy,
  executeGrpcHierarchyCreation,
  shouldAutoDetectTls,
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
  assert.equal(shouldAutoDetectTls('grpcb.in:9001'), true);
  assert.equal(shouldAutoDetectTls('grpcb.in:9001'), true);
  assert.equal(shouldAutoDetectTls('https://my-service.com'), true);
  assert.equal(shouldAutoDetectTls('http://my-service.com'), false);
  assert.equal(shouldAutoDetectTls('localhost:50051'), false);
  assert.equal(shouldAutoDetectTls('127.0.0.1:3100'), false);
  // Variables resolution support
  assert.equal(shouldAutoDetectTls('{{NUTRADE_GRPC_URL}}', { NUTRADE_GRPC_URL: 'grpcb.in:9001' }), true);
  assert.equal(shouldAutoDetectTls('{{NUTRADE_GRPC_URL}}', { NUTRADE_GRPC_URL: 'localhost:9091' }), false);
  assert.equal(shouldAutoDetectTls('{{URL}}', { url: 'https://custom.rpc.io' }), true);
});

test('planGrpcHierarchy: preserves useTls setting for remote endpoints', () => {
  const planned = planGrpcHierarchy({
    folderName: 'Remote gRPC',
    serverAddress: 'grpcb.in:9001',
    services: mockServices,
  });

  assert.equal(planned.serviceFolders[0].endpoints[0].config.use_tls, true);
});
