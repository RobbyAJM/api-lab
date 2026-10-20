import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEndpointUrl,
  applyInheritedHeaders,
  applyCollectionSettingsToHttp,
  applyCollectionSettingsToGrpc,
} from './collectionSettings.ts';
import type {
  CollectionSettings,
  HttpExecutionRequest,
  GrpcExecutionRequest,
} from '@api-lab/api-types';

test('resolveEndpointUrl: prepends baseUrl to relative paths with proper slash handling', () => {
  // Case 1: base has no slash, path has slash
  assert.equal(
    resolveEndpointUrl('/users', 'https://api.example.com'),
    'https://api.example.com/users'
  );

  // Case 2: base has slash, path has slash (deduplication)
  assert.equal(
    resolveEndpointUrl('/users', 'https://api.example.com/'),
    'https://api.example.com/users'
  );

  // Case 3: base has slash, path has no slash
  assert.equal(
    resolveEndpointUrl('users', 'https://api.example.com/'),
    'https://api.example.com/users'
  );

  // Case 4: base has no slash, path has no slash
  assert.equal(
    resolveEndpointUrl('users', 'https://api.example.com'),
    'https://api.example.com/users'
  );
});

test('resolveEndpointUrl: leaves absolute URLs untouched', () => {
  assert.equal(
    resolveEndpointUrl('https://other.com/test', 'https://api.example.com'),
    'https://other.com/test'
  );
  assert.equal(
    resolveEndpointUrl('http://localhost:3000/api', 'https://api.example.com'),
    'http://localhost:3000/api'
  );
});

test('resolveEndpointUrl: substitutes variables in baseUrl and url', () => {
  const vars = { HOST: 'api.nutrade.com', VERSION: 'v2' };
  assert.equal(
    resolveEndpointUrl('/{{VERSION}}/orders', 'https://{{HOST}}', vars),
    'https://api.nutrade.com/v2/orders'
  );
});

test('resolveEndpointUrl: returns original URL when baseUrl is empty', () => {
  assert.equal(resolveEndpointUrl('/orders', ''), '/orders');
  assert.equal(resolveEndpointUrl('/orders', undefined), '/orders');
});

test('applyInheritedHeaders: merges collection headers if not present in request', () => {
  const headers = { 'Content-Type': 'application/json' };
  const collectionHeaders = [
    { key: 'Accept', value: 'application/json', enabled: true },
    { key: 'X-App-Tenant', value: '{{TENANT}}', enabled: true },
    { key: 'X-Disabled', value: 'ignore', enabled: false },
  ];
  const vars = { TENANT: 'tenant-42' };

  const result = applyInheritedHeaders(headers, collectionHeaders, vars);

  assert.equal(result['Content-Type'], 'application/json');
  assert.equal(result['Accept'], 'application/json');
  assert.equal(result['X-App-Tenant'], 'tenant-42');
  assert.equal(result['X-Disabled'], undefined);
});

test('applyInheritedHeaders: endpoint headers override collection headers case-insensitively', () => {
  const headers = { 'x-client-id': 'endpoint-custom-id' };
  const collectionHeaders = [
    { key: 'X-Client-ID', value: 'collection-default-id', enabled: true },
  ];

  const result = applyInheritedHeaders(headers, collectionHeaders);
  // Does not overwrite existing key
  assert.equal(result['x-client-id'], 'endpoint-custom-id');
  assert.equal(result['X-Client-ID'], undefined);
});

test('applyCollectionSettingsToHttp: full pipeline (baseUrl, headers, auth, timeout)', () => {
  const req: HttpExecutionRequest = {
    url: '/v1/items',
    method: 'GET',
    headers: { 'X-Custom': 'original' },
    query_params: [],
    auth: { auth_type: 'inherit' },
  };

  const settings: CollectionSettings = {
    base_url: 'https://api.example.com',
    timeout_ms: 15000,
    headers: [
      { key: 'Accept', value: 'application/json', enabled: true },
    ],
    auth: {
      auth_type: 'bearer',
      token: 'jwt-12345',
    },
  };

  const result = applyCollectionSettingsToHttp(req, settings);

  assert.equal(result.url, 'https://api.example.com/v1/items');
  assert.equal(result.headers['X-Custom'], 'original');
  assert.equal(result.headers['Accept'], 'application/json');
  assert.equal(result.headers['Authorization'], 'Bearer jwt-12345');
  assert.equal(result.timeout_ms, 15000);
});

test('applyCollectionSettingsToHttp: endpoint overrides timeout when explicitly set', () => {
  const req: HttpExecutionRequest = {
    url: 'https://example.com',
    method: 'GET',
    headers: {},
    query_params: [],
    timeout_ms: 5000,
  };

  const settings: CollectionSettings = {
    timeout_ms: 20000,
  };

  const result = applyCollectionSettingsToHttp(req, settings);
  assert.equal(result.timeout_ms, 5000);
});

test('applyCollectionSettingsToGrpc: falls back to collection baseUrl for server_address and merges metadata', () => {
  const req: GrpcExecutionRequest = {
    server_address: '',
    service: 'item.ItemService',
    method: 'GetItem',
    metadata: {},
    payload: {},
  };

  const settings: CollectionSettings = {
    base_url: 'localhost:50051',
    timeout_ms: 8000,
    headers: [
      { key: 'x-request-id', value: 'req-999', enabled: true },
    ],
    auth: {
      auth_type: 'bearer',
      token: 'secret-token',
    },
  };

  const result = applyCollectionSettingsToGrpc(req, settings);

  assert.equal(result.server_address, 'localhost:50051');
  assert.equal(result.metadata['x-request-id'], 'req-999');
  assert.equal(result.metadata['authorization'], 'Bearer secret-token');
  assert.equal(result.timeout_ms, 8000);
});
