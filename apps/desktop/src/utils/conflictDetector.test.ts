import test from 'node:test';
import assert from 'node:assert/strict';
import type { Endpoint } from '@api-lab/api-types';
import { computeConflictDiffs, isTabConflicted } from './conflictDetector.ts';

const baseHttpEndpoint: Endpoint = {
  id: 'ep-1',
  collection_id: 'col-1',
  folder_id: null,
  name: 'Get User',
  protocol: 'http',
  version: 1,
  sort_order: 0,
  created_at: '',
  updated_at: '',
  config: {
    method: 'GET',
    url: 'https://api.example.com/users/1',
    body: '{"role":"user"}',
    pre_request_script: 'pm.environment.set("REQ_ID", "1");',
  },
};

const baseGrpcEndpoint: Endpoint = {
  id: 'ep-2',
  collection_id: 'col-1',
  folder_id: null,
  name: 'GetUser',
  protocol: 'grpc',
  version: 2,
  sort_order: 1,
  created_at: '',
  updated_at: '',
  config: {
    server_address: 'localhost:50051',
    service: 'user.UserService',
    method: 'GetUser',
    payload: { id: 1 },
  },
};

test('computeConflictDiffs: detects HTTP method, url, body and script differences', () => {
  const remoteEndpoint: Endpoint = {
    ...baseHttpEndpoint,
    version: 2,
    config: {
      method: 'POST',
      url: 'https://api.example.com/users/2',
      body: '{"role":"admin"}',
      pre_request_script: 'pm.environment.set("REQ_ID", "2");',
    },
  };

  const localConfig = {
    method: 'GET',
    url: 'https://api.example.com/users/1',
    body: '{"role":"user"}',
    pre_request_script: 'pm.environment.set("REQ_ID", "1");',
  };

  const diffs = computeConflictDiffs(baseHttpEndpoint, remoteEndpoint, localConfig);
  assert.equal(diffs.length, 4);
  assert.equal(diffs[0].field, 'Method');
  assert.equal(diffs[0].localVal, 'GET');
  assert.equal(diffs[0].remoteVal, 'POST');

  assert.equal(diffs[1].field, 'URL');
  assert.equal(diffs[2].field, 'Body');
  assert.equal(diffs[3].field, 'Pre-request Script');
});

test('computeConflictDiffs: returns empty list when configurations match', () => {
  const remoteEndpoint: Endpoint = { ...baseHttpEndpoint, version: 2 };
  const diffs = computeConflictDiffs(baseHttpEndpoint, remoteEndpoint, baseHttpEndpoint.config);
  assert.equal(diffs.length, 0);
});

test('computeConflictDiffs: detects gRPC address, service and payload differences', () => {
  const remoteEndpoint: Endpoint = {
    ...baseGrpcEndpoint,
    version: 3,
    config: {
      server_address: 'grpc.internal:9090',
      service: 'user.UserService',
      method: 'GetUser',
      payload: { id: 2 },
    },
  };

  const localConfig = {
    server_address: 'localhost:50051',
    service: 'user.UserService',
    method: 'GetUser',
    payload: { id: 1 },
  };

  const diffs = computeConflictDiffs(baseGrpcEndpoint, remoteEndpoint, localConfig);
  assert.equal(diffs.length, 2);
  assert.equal(diffs[0].field, 'Server Address');
  assert.equal(diffs[1].field, 'Payload');
});

test('isTabConflicted: true when server version exceeds tab version', () => {
  const tabEp: Endpoint = { ...baseHttpEndpoint, version: 1 };
  const serverEndpoints: Endpoint[] = [{ ...baseHttpEndpoint, version: 2 }];

  assert.equal(isTabConflicted(tabEp, serverEndpoints), true);
  assert.equal(isTabConflicted(tabEp, [{ ...baseHttpEndpoint, version: 1 }]), false);
  assert.equal(isTabConflicted(tabEp, []), false);
  assert.equal(isTabConflicted(tabEp, undefined), false);
});
