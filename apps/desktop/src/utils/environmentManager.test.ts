import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDuplicateEnvironmentName,
  validateEnvironmentName,
  filterVariables,
  duplicateEnvironment,
} from './environmentManager.ts';
import type { VariableResponse } from '@api-lab/api-types';

test('getDuplicateEnvironmentName: generates standard duplicate name', () => {
  assert.equal(getDuplicateEnvironmentName('DEV'), 'DEV [Duplicate]');
  assert.equal(getDuplicateEnvironmentName('LOCAL'), 'LOCAL [Duplicate]');
  assert.equal(getDuplicateEnvironmentName('DEV [Duplicate]'), 'DEV [Duplicate] [Duplicate]');
  assert.equal(getDuplicateEnvironmentName('  Production  '), 'Production [Duplicate]');
  assert.equal(getDuplicateEnvironmentName(''), '[Duplicate]');
});

test('validateEnvironmentName: rejects empty names and enforces length limit', () => {
  assert.equal(validateEnvironmentName('').valid, false);
  assert.equal(validateEnvironmentName('   ').valid, false);
  assert.equal(validateEnvironmentName('DEV').valid, true);
  assert.equal(validateEnvironmentName('LOCAL').valid, true);
  assert.equal(validateEnvironmentName('a'.repeat(100)).valid, true);
  assert.equal(validateEnvironmentName('a'.repeat(101)).valid, false);
});

test('filterVariables: filters variables by key and value with multi-keyword support', () => {
  const vars: VariableResponse[] = [
    { id: '1', environment_id: 'e1', key: 'BASE_URL', value: 'https://api.dev.com', is_sensitive: false, created_at: '', updated_at: '' },
    { id: '2', environment_id: 'e1', key: 'API_KEY', value: 'secret_abc_123', is_sensitive: true, created_at: '', updated_at: '' },
    { id: '3', environment_id: 'e1', key: 'TIMEOUT', value: '5000', is_sensitive: false, created_at: '', updated_at: '' },
  ];

  // Empty query returns all
  assert.equal(filterVariables(vars, '').length, 3);
  assert.equal(filterVariables(vars, '   ').length, 3);

  // Match by key
  const matchKey = filterVariables(vars, 'BASE');
  assert.equal(matchKey.length, 1);
  assert.equal(matchKey[0].key, 'BASE_URL');

  // Match by value
  const matchVal = filterVariables(vars, 'dev.com');
  assert.equal(matchVal.length, 1);
  assert.equal(matchVal[0].key, 'BASE_URL');

  // Multi-keyword query
  const multiMatch = filterVariables(vars, 'api secret');
  assert.equal(multiMatch.length, 1);
  assert.equal(multiMatch[0].key, 'API_KEY');

  // No match
  assert.equal(filterVariables(vars, 'nonexistent').length, 0);
});

test('duplicateEnvironment: clones environment and all variables via API', async () => {
  const calls: Array<{ path: string; body: any }> = [];

  const mockApi = {
    post: async <T = any>(path: string, body: any): Promise<T> => {
      calls.push({ path, body });
      if (path.includes('/environments') && !path.includes('/variables')) {
        return {
          id: 'new_env_id',
          workspace_id: 'w1',
          name: body.name,
          is_default: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as T;
      }
      return { id: `var_${calls.length}`, ...body } as T;
    },
  };

  const sourceEnv = { id: 'source_env_id', name: 'DEV' };
  const sourceVars = [
    { key: 'API_HOST', value: 'localhost:8080', is_sensitive: false },
    { key: 'TOKEN', value: 'secret_token', is_sensitive: true },
  ];

  const result = await duplicateEnvironment(sourceEnv, sourceVars, 'w1', mockApi);

  assert.equal(result.newEnvironment.name, 'DEV [Duplicate]');
  assert.equal(result.newEnvironment.id, 'new_env_id');
  assert.equal(result.copiedVariablesCount, 2);

  // Check API calls: 1 create env, 2 create variables
  assert.equal(calls.length, 3);
  assert.equal(calls[0].path, '/workspaces/w1/environments');
  assert.equal(calls[0].body.name, 'DEV [Duplicate]');
  assert.equal(calls[1].path, '/environments/new_env_id/variables');
  assert.equal(calls[1].body.key, 'API_HOST');
  assert.equal(calls[2].path, '/environments/new_env_id/variables');
  assert.equal(calls[2].body.key, 'TOKEN');
  assert.equal(calls[2].body.is_sensitive, true);
});

test('duplicateEnvironment: works when source environment has zero variables', async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const mockApi = {
    post: async <T = any>(path: string, body: any): Promise<T> => {
      calls.push({ path, body });
      return {
        id: 'empty_new_id',
        workspace_id: 'w1',
        name: body.name,
        is_default: false,
        created_at: '',
        updated_at: '',
      } as T;
    },
  };

  const result = await duplicateEnvironment({ id: 's1', name: 'STAGING' }, [], 'w1', mockApi);
  assert.equal(result.newEnvironment.name, 'STAGING [Duplicate]');
  assert.equal(result.copiedVariablesCount, 0);
  assert.equal(calls.length, 1);
});
