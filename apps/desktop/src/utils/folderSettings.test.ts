import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeFolderSettings } from './folderSettings.ts';

test('mergeFolderSettings applies nearest folder auth over collection auth', () => {
  const settings = mergeFolderSettings({ auth: { auth_type: 'bearer', token: 'collection' } }, [
    { id: 'root', collection_id: 'c', parent_folder_id: null, name: 'Root', settings: { auth: { auth_type: 'bearer', token: 'root' } } } as any,
    { id: 'child', collection_id: 'c', parent_folder_id: 'root', name: 'Child', settings: { auth: { auth_type: 'bearer', token: 'child' } } } as any,
  ], 'child');
  assert.equal(settings?.auth?.token, 'child');
});

test('mergeFolderSettings stops on cyclic folder parents', () => {
  const settings = mergeFolderSettings(undefined, [
    { id: 'a', collection_id: 'c', parent_folder_id: 'b', name: 'A', settings: undefined } as any,
    { id: 'b', collection_id: 'c', parent_folder_id: 'a', name: 'B', settings: undefined } as any,
  ], 'a');
  assert.equal(settings, undefined);
});
