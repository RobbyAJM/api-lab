import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDeleteConfirmationConfig,
  canExecuteDelete,
  type DeleteTargetType,
} from './confirmDelete.ts';

test('getDeleteConfirmationConfig: collection requires confirmation checkbox', () => {
  const config = getDeleteConfirmationConfig('collection', 'Production APIs');
  assert.equal(config.title, 'Delete Collection');
  assert.equal(config.requireCheckbox, true);
  assert.ok(config.checkboxLabel?.includes('cannot be undone'));
  assert.ok(config.message.includes('"Production APIs"'));
});

test('getDeleteConfirmationConfig: folder and endpoint do not require checkbox', () => {
  const folderConfig = getDeleteConfirmationConfig('folder', 'Auth');
  assert.equal(folderConfig.title, 'Delete Folder');
  assert.equal(folderConfig.requireCheckbox, false);
  assert.ok(folderConfig.message.includes('"Auth"'));

  const epConfig = getDeleteConfirmationConfig('endpoint', 'Login');
  assert.equal(epConfig.title, 'Delete Endpoint');
  assert.equal(epConfig.requireCheckbox, false);
  assert.ok(epConfig.message.includes('"Login"'));
});

test('getDeleteConfirmationConfig: fallback item name when name omitted', () => {
  const config = getDeleteConfirmationConfig('folder');
  assert.ok(config.message.includes('this item'));
});

test('canExecuteDelete: collection delete disabled until checkbox is checked', () => {
  // Requires checkbox and not checked: cannot execute
  assert.equal(canExecuteDelete(true, false, false), false);

  // Requires checkbox and checked: can execute
  assert.equal(canExecuteDelete(true, true, false), true);

  // Does not require checkbox: can execute regardless of checked state
  assert.equal(canExecuteDelete(false, false, false), true);
  assert.equal(canExecuteDelete(false, true, false), true);

  // While pending: cannot execute even if checked
  assert.equal(canExecuteDelete(true, true, true), false);
  assert.equal(canExecuteDelete(false, false, true), false);
});
