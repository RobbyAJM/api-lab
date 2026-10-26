import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEnvironmentDropdownSizeClass,
  getEnvironmentDropdownLabel,
  getEnvironmentDropdownTitle,
  findActiveEnvironment,
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
