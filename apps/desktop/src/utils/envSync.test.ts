import test from 'node:test';
import assert from 'node:assert/strict';
import { syncEnvironmentVariables, type EnvSyncApi } from './envSync.ts';

test('syncEnvironmentVariables: creates new variable when key did not exist', async () => {
  const calls: { method: string; path: string; body?: any }[] = [];

  const mockApi: EnvSyncApi = {
    get: async (path: string) => {
      calls.push({ method: 'GET', path });
      return [{ id: 'var-1', key: 'EXISTING', value: 'old_val' }];
    },
    post: async (path: string, body: any) => {
      calls.push({ method: 'POST', path, body });
      return { id: 'var-2', ...body };
    },
    patch: async (path: string, body: any) => {
      calls.push({ method: 'PATCH', path, body });
      return { id: 'patched', ...body };
    },
  };

  const originalVars = { EXISTING: 'old_val' };
  const updatedVars = {
    EXISTING: 'old_val',
    nutrade_token: 'jwt_secret_token_123',
  };

  const res = await syncEnvironmentVariables(
    originalVars,
    updatedVars,
    'env-100',
    mockApi
  );

  assert.equal(res.syncedCount, 1);
  assert.deepEqual(res.syncedKeys, ['nutrade_token']);

  // Check POST call
  const postCall = calls.find((c) => c.method === 'POST');
  assert.ok(postCall);
  assert.equal(postCall.path, '/environments/env-100/variables');
  assert.deepEqual(postCall.body, {
    key: 'nutrade_token',
    value: 'jwt_secret_token_123',
    is_sensitive: false,
  });
});

test('syncEnvironmentVariables: updates existing variable when value changed', async () => {
  const calls: { method: string; path: string; body?: any }[] = [];

  const mockApi: EnvSyncApi = {
    get: async (path: string) => {
      calls.push({ method: 'GET', path });
      return [{ id: 'var-jwt', key: 'nutrade_token', value: 'old_expired_jwt' }];
    },
    post: async (path: string, body: any) => {
      calls.push({ method: 'POST', path, body });
      return body;
    },
    patch: async (path: string, body: any) => {
      calls.push({ method: 'PATCH', path, body });
      return body;
    },
  };

  const originalVars = { nutrade_token: 'old_expired_jwt' };
  const updatedVars = { nutrade_token: 'new_refreshed_jwt' };

  const res = await syncEnvironmentVariables(
    originalVars,
    updatedVars,
    'env-100',
    mockApi
  );

  assert.equal(res.syncedCount, 1);
  assert.deepEqual(res.syncedKeys, ['nutrade_token']);

  const patchCall = calls.find((c) => c.method === 'PATCH');
  assert.ok(patchCall);
  assert.equal(patchCall.path, '/variables/var-jwt');
  assert.deepEqual(patchCall.body, { value: 'new_refreshed_jwt' });
});

test('syncEnvironmentVariables: returns 0 when no variables changed or environment is null', async () => {
  const mockApi: EnvSyncApi = {
    get: async () => [],
    post: async () => {},
    patch: async () => {},
  };

  const res1 = await syncEnvironmentVariables({ A: '1' }, { A: '1' }, 'env-1', mockApi);
  assert.equal(res1.syncedCount, 0);

  const res2 = await syncEnvironmentVariables({ A: '1' }, { A: '2' }, null, mockApi);
  assert.equal(res2.syncedCount, 0);
});
