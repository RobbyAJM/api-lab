import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInheritedHttpAuth,
  applyInheritedGrpcAuth,
} from './authInheritance.ts';
import type {
  CollectionSettings,
  HttpExecutionRequest,
  GrpcExecutionRequest,
} from '@api-lab/api-types';

test('applyInheritedHttpAuth: inherits Bearer token and substitutes variables', () => {
  const req: HttpExecutionRequest = {
    url: 'https://api.example.com/items',
    method: 'GET',
    headers: {},
    query_params: [],
    auth: { auth_type: 'inherit' },
  };

  const settings: CollectionSettings = {
    auth: {
      auth_type: 'bearer',
      token: '{{MY_TOKEN}}',
    },
  };

  const vars = { MY_TOKEN: 'secret-bearer-999' };

  const result = applyInheritedHttpAuth(req, settings, vars);
  assert.equal(result.headers['Authorization'], 'Bearer secret-bearer-999');
});

test('applyInheritedHttpAuth: inherits custom header', () => {
  const req: HttpExecutionRequest = {
    url: 'https://api.example.com/items',
    method: 'GET',
    headers: {},
    query_params: [],
    auth: { auth_type: 'inherit' },
  };

  const settings: CollectionSettings = {
    auth: {
      auth_type: 'custom',
      header_name: 'X-Workspace-Token',
      header_value: 'val-12345',
    },
  };

  const result = applyInheritedHttpAuth(req, settings, {});
  assert.equal(result.headers['X-Workspace-Token'], 'val-12345');
});

test('applyInheritedHttpAuth: endpoint explicit auth overrides collection settings', () => {
  const req: HttpExecutionRequest = {
    url: 'https://api.example.com/items',
    method: 'GET',
    headers: { Authorization: 'Bearer custom-token' },
    query_params: [],
    auth: { auth_type: 'bearer', token: 'custom-token' },
  };

  const settings: CollectionSettings = {
    auth: {
      auth_type: 'bearer',
      token: 'collection-token',
    },
  };

  const result = applyInheritedHttpAuth(req, settings, {});
  assert.equal(result.headers['Authorization'], 'Bearer custom-token');
});

test('applyInheritedGrpcAuth: injects collection bearer token into metadata', () => {
  const req: GrpcExecutionRequest = {
    server_address: 'localhost:9091',
    service: 'nutrade.manager.AuthAPI',
    method: 'Profile',
    metadata: {},
    payload: {},
  };

  const settings: CollectionSettings = {
    auth: {
      auth_type: 'bearer',
      token: 'jwt-grpc-token',
    },
  };

  const result = applyInheritedGrpcAuth(req, settings, {});
  assert.equal(result.metadata['authorization'], 'Bearer jwt-grpc-token');
});

test('applyInheritedGrpcAuth: does not overwrite existing metadata authorization', () => {
  const req: GrpcExecutionRequest = {
    server_address: 'localhost:9091',
    service: 'nutrade.manager.AuthAPI',
    method: 'Profile',
    metadata: { authorization: 'Bearer existing-manual-token' },
    payload: {},
  };

  const settings: CollectionSettings = {
    auth: {
      auth_type: 'bearer',
      token: 'collection-token',
    },
  };

  const result = applyInheritedGrpcAuth(req, settings, {});
  assert.equal(result.metadata['authorization'], 'Bearer existing-manual-token');
});

test('applyInheritedGrpcAuth: request No Auth disables collection auth', () => {
  const req: GrpcExecutionRequest = {
    server_address: 'localhost:9091',
    service: 'example.Service',
    method: 'Get',
    metadata: {},
    payload: {},
    auth: { auth_type: 'none' },
  };
  const result = applyInheritedGrpcAuth(req, {
    auth: { auth_type: 'bearer', token: 'collection-token' },
  });
  assert.deepEqual(result.metadata, {});
});

test('applyInheritedGrpcAuth: request explicit auth remains separate from collection auth', () => {
  const req: GrpcExecutionRequest = {
    server_address: 'localhost:9091',
    service: 'example.Service',
    method: 'Get',
    metadata: { authorization: 'Bearer request-token' },
    payload: {},
    auth: { auth_type: 'bearer', token: 'request-token' },
  };
  const result = applyInheritedGrpcAuth(req, {
    auth: { auth_type: 'bearer', token: 'collection-token' },
  });
  assert.equal(result.metadata.authorization, 'Bearer request-token');
});
