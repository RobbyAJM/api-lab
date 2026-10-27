import test from 'node:test';
import assert from 'node:assert/strict';
import { isConfigDirty } from './tabManager.ts';
import { interpolatePathVariables, syncPathVariablesWithKeys } from './pathVariables.ts';

// Helper simulating outgoing HTTP query params preparation
function filterOutgoingQueryParams(params: [string, string, string?, boolean?][]): [string, string][] {
  return params
    .filter(([k, _v, _d, enabled]) => k.trim() && enabled !== false)
    .map(([k, v]) => [k, v ?? ''] as [string, string]);
}

// Helper simulating outgoing HTTP headers preparation
function filterOutgoingHeaders(headers: [string, string, string?, boolean?][]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [k, v, _d, enabled] of headers) {
    if (k.trim() && enabled !== false) {
      map[k.trim()] = v ?? '';
    }
  }
  return map;
}

// Helper simulating outgoing multipart fields preparation
function filterOutgoingMultipart(
  fields: { name: string; value: string; enabled?: boolean; filename?: string }[]
): { name: string; value: string; filename?: string }[] {
  return fields.filter((f) => f.enabled !== false && f.name.trim());
}

// Helper simulating outgoing gRPC metadata preparation
function filterOutgoingMetadata(metadata: [string, string, string?, boolean?][]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [k, v, _d, enabled] of metadata) {
    if (k.trim() && enabled !== false) {
      map[k.trim()] = v ?? '';
    }
  }
  return map;
}

test('HTTP Query Params: excludes disabled items while retaining enabled items', () => {
  const input: [string, string, string, boolean][] = [
    ['page', '1', 'Current page', true],
    ['debug', 'true', 'Debug mode', false],
    ['limit', '25', '', true],
  ];

  const outgoing = filterOutgoingQueryParams(input);
  assert.deepEqual(outgoing, [
    ['page', '1'],
    ['limit', '25'],
  ]);

  // State array retains all 3 items
  assert.equal(input.length, 3);
  assert.equal(input[1][3], false);
});

test('HTTP Headers: excludes disabled headers while retaining enabled in outgoing map', () => {
  const input: [string, string, string, boolean][] = [
    ['Content-Type', 'application/json', '', true],
    ['X-Debug-Trace', 'verbose', 'Internal debug header', false],
    ['Authorization', 'Bearer token123', '', true],
  ];

  const outgoing = filterOutgoingHeaders(input);
  assert.deepEqual(outgoing, {
    'Content-Type': 'application/json',
    Authorization: 'Bearer token123',
  });
  assert.equal(outgoing['X-Debug-Trace'], undefined);
});

test('HTTP Body Multipart: excludes disabled fields in outgoing payload', () => {
  const fields = [
    { name: 'username', value: 'alice', enabled: true },
    { name: 'avatar', value: '', filename: 'photo.png', enabled: false },
    { name: 'role', value: 'admin', enabled: true },
  ];

  const outgoing = filterOutgoingMultipart(fields);
  assert.equal(outgoing.length, 2);
  assert.equal(outgoing[0].name, 'username');
  assert.equal(outgoing[1].name, 'role');
  // Original state array keeps disabled avatar
  assert.equal(fields.length, 3);
  assert.equal(fields[1].enabled, false);
});

test('gRPC Metadata: excludes disabled metadata while retaining enabled in outgoing map', () => {
  const metadata: [string, string, string, boolean][] = [
    ['x-request-id', 'req-123', '', true],
    ['x-internal-flag', 'beta-feature', 'Testing', false],
  ];

  const outgoing = filterOutgoingMetadata(metadata);
  assert.deepEqual(outgoing, {
    'x-request-id': 'req-123',
  });
  assert.equal(outgoing['x-internal-flag'], undefined);
});

test('HTTP Path Variables: skips disabled path variable substitution', () => {
  const url = 'https://api.example.com/v1/workspaces/:workspace_id/projects/:project_id';
  const pathVars: [string, string, string, boolean][] = [
    ['workspace_id', 'ws-999', '', true],
    ['project_id', 'proj-123', '', false],
  ];

  const interpolated = interpolatePathVariables(url, pathVars);
  assert.equal(
    interpolated,
    'https://api.example.com/v1/workspaces/ws-999/projects/:project_id'
  );
});

test('isConfigDirty: detects checkbox toggle for query params', () => {
  const base = {
    method: 'GET',
    url: 'https://httpbin.org/get',
    query_params: [['q', 'test', '', true]],
  };

  const draftToggled = {
    method: 'GET',
    url: 'https://httpbin.org/get',
    query_params: [['q', 'test', '', false]],
  };

  assert.equal(isConfigDirty(base, draftToggled), true);
});

test('isConfigDirty: detects checkbox toggle for headers', () => {
  const base = {
    method: 'GET',
    url: 'https://httpbin.org/get',
    headers: { 'X-Custom': 'value' },
    headers_list: [['X-Custom', 'value', '', true]],
  };

  const draftToggled = {
    method: 'GET',
    url: 'https://httpbin.org/get',
    headers: { 'X-Custom': 'value' },
    headers_list: [['X-Custom', 'value', '', false]],
  };

  assert.equal(isConfigDirty(base, draftToggled), true);
});

test('isConfigDirty: detects checkbox toggle for gRPC metadata', () => {
  const base = {
    server_address: 'localhost:50051',
    metadata: { 'x-env': 'prod' },
    metadata_list: [['x-env', 'prod', '', true]],
  };

  const draftToggled = {
    server_address: 'localhost:50051',
    metadata: { 'x-env': 'prod' },
    metadata_list: [['x-env', 'prod', '', false]],
  };

  assert.equal(isConfigDirty(base, draftToggled), true);
});
