import test from 'node:test';
import assert from 'node:assert/strict';
import { filterWorkspaces, sortWorkspaces, getWorkspaceInitials } from './workspacePicker.ts';
import type { WorkspaceSummary } from '@api-lab/api-types';

const ws1: WorkspaceSummary = { id: 'w1', name: 'RND', role: 'admin' };
const ws2: WorkspaceSummary = { id: 'w2', name: 'Personal Workspace', role: 'developer' };
const ws3: WorkspaceSummary = { id: 'w3', name: 'My Workspace', role: 'admin' };

test('filterWorkspaces: filters by case-insensitive name match', () => {
  assert.equal(filterWorkspaces([ws1, ws2, ws3], 'rnd').length, 1);
  assert.equal(filterWorkspaces([ws1, ws2, ws3], 'workspace').length, 2);
  assert.equal(filterWorkspaces([ws1, ws2, ws3], '').length, 3);
});

test('sortWorkspaces: prioritizes active workspace, then favorites, then alphabetical', () => {
  const sorted = sortWorkspaces([ws1, ws2, ws3], 'w2', ['w3']);
  assert.equal(sorted[0].id, 'w2'); // active
  assert.equal(sorted[1].id, 'w3'); // favorite
  assert.equal(sorted[2].id, 'w1'); // alphabetical
});

test('getWorkspaceInitials: extracts max 2 uppercase letters from workspace name', () => {
  // Spec example
  assert.equal(getWorkspaceInitials('Dev Team Only'), 'DT');
  // Two words
  assert.equal(getWorkspaceInitials('Personal Workspace'), 'PW');
  // Single word
  assert.equal(getWorkspaceInitials('Engineering'), 'EN');
  // Single letter
  assert.equal(getWorkspaceInitials('X'), 'X');
  // Extra whitespace
  assert.equal(getWorkspaceInitials('  frontend  core  '), 'FC');
  // Empty or missing
  assert.equal(getWorkspaceInitials(''), 'WS');
});
