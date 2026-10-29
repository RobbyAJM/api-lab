import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEnvironmentDropdownSizeClass,
  getEnvironmentDropdownLabel,
  getEnvironmentDropdownTitle,
  findActiveEnvironment,
  getWorkspaceEnvStorageKey,
  getStoredWorkspaceEnvironment,
  setStoredWorkspaceEnvironment,
  removeStoredWorkspaceEnvironment,
  resolveWorkspaceEnvironment,
  NO_ENVIRONMENT_VALUE,
} from './environmentDropdown.ts';

test('getEnvironmentDropdownSizeClass: resolves correct sizing tokens', () => {
  assert.equal(getEnvironmentDropdownSizeClass('xs'), 'px-2 py-0.5 text-[11px]');
  assert.equal(getEnvironmentDropdownSizeClass('sm'), 'px-2.5 py-1 text-xs');
  assert.equal(getEnvironmentDropdownSizeClass('md'), 'px-3 py-1.5 text-xs');
  assert.equal(getEnvironmentDropdownSizeClass(undefined), 'px-2.5 py-1 text-xs');
});

test('getEnvironmentDropdownLabel: returns environment name or fallback', () => {
  assert.equal(getEnvironmentDropdownLabel({ name: 'Production' }), 'Production');
  assert.equal(getEnvironmentDropdownLabel({ name: '  Staging  ' }), 'Staging');
  assert.equal(getEnvironmentDropdownLabel({ name: '' }), 'No Environment');
  assert.equal(getEnvironmentDropdownLabel(null), 'No Environment');
  assert.equal(getEnvironmentDropdownLabel(undefined), 'No Environment');
});

test('getEnvironmentDropdownTitle: formats tooltip description', () => {
  assert.equal(getEnvironmentDropdownTitle({ name: 'Production' }), 'Active Environment: Production');
  assert.equal(getEnvironmentDropdownTitle({ name: '  Dev  ' }), 'Active Environment: Dev');
  assert.equal(getEnvironmentDropdownTitle({ name: '' }), 'No Environment active');
  assert.equal(getEnvironmentDropdownTitle(null), 'No Environment active');
  assert.equal(getEnvironmentDropdownTitle(undefined), 'No Environment active');
});

test('findActiveEnvironment: finds matching item or returns undefined safely', () => {
  const envs = [
    { id: 'env-1', name: 'Dev' },
    { id: 'env-2', name: 'Prod' },
  ];

  assert.deepEqual(findActiveEnvironment(envs, 'env-1'), { id: 'env-1', name: 'Dev' });
  assert.deepEqual(findActiveEnvironment(envs, 'env-2'), { id: 'env-2', name: 'Prod' });
  assert.equal(findActiveEnvironment(envs, 'missing'), undefined);
  assert.equal(findActiveEnvironment(envs, null), undefined);
  assert.equal(findActiveEnvironment(envs, undefined), undefined);
  assert.equal(findActiveEnvironment([], 'env-1'), undefined);
});

test('getWorkspaceEnvStorageKey: formats workspace storage key correctly', () => {
  assert.equal(getWorkspaceEnvStorageKey('ws-123'), 'api_lab_workspace_env_ws-123');
  assert.equal(getWorkspaceEnvStorageKey(''), 'api_lab_workspace_env_');
});

test('workspace environment persistence: stores, retrieves, and removes environment ID', () => {
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    length: 0,
    key: () => null,
  } as unknown as Storage;

  // Initial read when empty
  assert.equal(getStoredWorkspaceEnvironment('ws-1', mockStorage), null);

  // Set environment ID
  setStoredWorkspaceEnvironment('ws-1', 'env-dev', mockStorage);
  assert.equal(getStoredWorkspaceEnvironment('ws-1', mockStorage), 'env-dev');
  assert.equal(store['api_lab_workspace_env_ws-1'], 'env-dev');

  // Different workspace is isolated
  assert.equal(getStoredWorkspaceEnvironment('ws-2', mockStorage), null);
  setStoredWorkspaceEnvironment('ws-2', 'env-staging', mockStorage);
  assert.equal(getStoredWorkspaceEnvironment('ws-2', mockStorage), 'env-staging');
  assert.equal(getStoredWorkspaceEnvironment('ws-1', mockStorage), 'env-dev');

  // Explicit null persists NO_ENVIRONMENT_VALUE (__none__)
  setStoredWorkspaceEnvironment('ws-1', null, mockStorage);
  assert.equal(getStoredWorkspaceEnvironment('ws-1', mockStorage), NO_ENVIRONMENT_VALUE);

  // Remove workspace environment
  removeStoredWorkspaceEnvironment('ws-1', mockStorage);
  assert.equal(getStoredWorkspaceEnvironment('ws-1', mockStorage), null);
  assert.equal(store['api_lab_workspace_env_ws-1'], undefined);

  // Guard against empty workspaceId
  assert.equal(getStoredWorkspaceEnvironment('', mockStorage), null);
  setStoredWorkspaceEnvironment('', 'env-xyz', mockStorage);
  assert.equal(store['api_lab_workspace_env_'], undefined);
});

test('resolveWorkspaceEnvironment: resolves matching, default, and explicit none', () => {
  const envs = [
    { id: 'env-1', name: 'Dev', is_default: false },
    { id: 'env-2', name: 'Staging', is_default: true },
    { id: 'env-3', name: 'Prod', is_default: false },
  ];

  // 1. Matches stored ID
  assert.equal(resolveWorkspaceEnvironment(envs, 'env-3'), 'env-3');

  // 2. Explicit NO_ENVIRONMENT_VALUE returns null
  assert.equal(resolveWorkspaceEnvironment(envs, NO_ENVIRONMENT_VALUE), null);

  // 3. Stored ID not found (deleted) falls back to default
  assert.equal(resolveWorkspaceEnvironment(envs, 'deleted-env-id'), 'env-2');

  // 4. Stored is null (first visit) falls back to default
  assert.equal(resolveWorkspaceEnvironment(envs, null), 'env-2');

  // 5. When no default flagged, falls back to first environment
  const noDefaultEnvs = [
    { id: 'env-a', name: 'A' },
    { id: 'env-b', name: 'B' },
  ];
  assert.equal(resolveWorkspaceEnvironment(noDefaultEnvs, null), 'env-a');
  assert.equal(resolveWorkspaceEnvironment(noDefaultEnvs, 'stale'), 'env-a');

  // 6. Empty environment list returns null
  assert.equal(resolveWorkspaceEnvironment([], 'env-1'), null);
  assert.equal(resolveWorkspaceEnvironment([], null), null);
  assert.equal(resolveWorkspaceEnvironment([], NO_ENVIRONMENT_VALUE), null);
});

