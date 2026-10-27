import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sortPresenceUsers,
  filterOtherPresenceUsers,
  mergePresenceJoin,
  mergePresenceLeave,
  getAvatarStackPreview,
  computeCurrentLocation,
  formatUserLocation,
  findConflictingUsers,
  formatConflictWarning,
} from './presence.ts';
import type { PresenceUser, Endpoint } from '@api-lab/api-types';

const u1: PresenceUser = {
  user_id: 'u1',
  name: 'Charlie',
  email: 'c@example.com',
  avatar: 'bottts:c',
};
const u2: PresenceUser = {
  user_id: 'u2',
  name: 'Alice',
  email: 'a@example.com',
  avatar: 'bottts:a',
};
const u3: PresenceUser = {
  user_id: 'u3',
  name: 'Bob',
  email: 'b@example.com',
  avatar: 'bottts:b',
};

test('sortPresenceUsers: sorts current user to top, then alphabetical', () => {
  const sorted = sortPresenceUsers([u1, u2, u3], 'u3');
  assert.equal(sorted[0].user_id, 'u3'); // Bob (current user) first
  assert.equal(sorted[1].user_id, 'u2'); // Alice next
  assert.equal(sorted[2].user_id, 'u1'); // Charlie last
});

test('mergePresenceJoin: adds new user or updates existing without duplicates', () => {
  const step1 = mergePresenceJoin([u1], u2);
  assert.equal(step1.length, 2);

  const u2Updated: PresenceUser = { ...u2, name: 'Alice Updated' };
  const step2 = mergePresenceJoin(step1, u2Updated);
  assert.equal(step2.length, 2);
  assert.equal(step2.find((u) => u.user_id === 'u2')?.name, 'Alice Updated');
});

test('mergePresenceLeave: removes disconnected user', () => {
  const remaining = mergePresenceLeave([u1, u2, u3], 'u2');
  assert.equal(remaining.length, 2);
  assert.ok(!remaining.some((u) => u.user_id === 'u2'));
});

test('getAvatarStackPreview: slices max items and computes overflow', () => {
  const p1 = getAvatarStackPreview([u1, u2], 3);
  assert.equal(p1.visible.length, 2);
  assert.equal(p1.overflowCount, 0);

  const p2 = getAvatarStackPreview([u1, u2, u3, { ...u1, user_id: 'u4' }], 3);
  assert.equal(p2.visible.length, 3);
  assert.equal(p2.overflowCount, 1);
});

test('filterOtherPresenceUsers: returns empty list when only current user is online', () => {
  const others = filterOtherPresenceUsers([u1], 'u1');
  assert.equal(others.length, 0);
});

test('filterOtherPresenceUsers: excludes current user and sorts others alphabetically', () => {
  const others = filterOtherPresenceUsers([u1, u2, u3], 'u3');
  assert.equal(others.length, 2);
  assert.equal(others[0].user_id, 'u2'); // Alice
  assert.equal(others[1].user_id, 'u1'); // Charlie
  assert.ok(!others.some((u) => u.user_id === 'u3'));
});

test('filterOtherPresenceUsers: returns all users deduplicated when currentUserId is omitted', () => {
  const others = filterOtherPresenceUsers([u1, u2, u1]);
  assert.equal(others.length, 2);
});

test('computeCurrentLocation: prioritizes modals over active endpoint and idle', () => {
  const mockHttpEndpoint: Endpoint = {
    id: 'ep-1',
    collection_id: 'col-1',
    name: 'Get Users',
    protocol: 'http',
    config: {
      method: 'GET',
      url: 'https://api.example.com/users',
    },
    version: 1,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  // App settings modal takes precedence
  const locSettings = computeCurrentLocation({
    appSettingsOpen: true,
    activeEndpoint: mockHttpEndpoint,
  });
  assert.equal(locSettings.location_type, 'settings');

  // Workspace settings modal takes precedence
  const locWs = computeCurrentLocation({
    workspaceModalOpen: true,
    activeEndpoint: mockHttpEndpoint,
  });
  assert.equal(locWs.location_type, 'workspace_settings');

  // Members modal
  const locMembers = computeCurrentLocation({
    membersModalOpen: true,
  });
  assert.equal(locMembers.location_type, 'members');

  // Environments modal
  const locEnv = computeCurrentLocation({
    envModalOpen: true,
  });
  assert.equal(locEnv.location_type, 'environments');

  // Collection settings modal
  const locCol = computeCurrentLocation({
    collectionSettingsModal: { isOpen: true, collectionId: 'c1' },
  });
  assert.equal(locCol.location_type, 'collection_settings');

  // Folder settings modal
  const locFolder = computeCurrentLocation({
    folderSettingsModal: { isOpen: true, folderId: 'f1' },
  });
  assert.equal(locFolder.location_type, 'folder_settings');

  // Active HTTP endpoint
  const locHttp = computeCurrentLocation({
    activeEndpoint: mockHttpEndpoint,
  });
  assert.equal(locHttp.location_type, 'http');
  assert.equal(locHttp.endpoint_id, 'ep-1');
  assert.equal(locHttp.name, 'Get Users');
  assert.equal(locHttp.method, 'GET');

  // Active gRPC endpoint
  const mockGrpcEndpoint: Endpoint = {
    ...mockHttpEndpoint,
    id: 'ep-2',
    name: 'SayHello',
    protocol: 'grpc',
  };
  const locGrpc = computeCurrentLocation({
    activeEndpoint: mockGrpcEndpoint,
  });
  assert.equal(locGrpc.location_type, 'grpc');
  assert.equal(locGrpc.endpoint_id, 'ep-2');
  assert.equal(locGrpc.method, 'gRPC');

  // Idle when nothing open
  const locIdle = computeCurrentLocation({});
  assert.equal(locIdle.location_type, 'idle');
});

test('formatUserLocation: formats HTTP, gRPC, settings, and idle states', () => {
  const fIdle = formatUserLocation(null);
  assert.equal(fIdle.label, 'Idle');
  assert.equal(fIdle.isEditingEndpoint, false);

  const fHttp = formatUserLocation({
    location_type: 'http',
    endpoint_id: 'e1',
    name: 'Create User',
    method: 'POST',
  });
  assert.equal(fHttp.label, 'Create User');
  assert.equal(fHttp.badge, 'POST');
  assert.equal(fHttp.isEditingEndpoint, true);
  assert.ok(fHttp.badgeClass.includes('text-sky-400'));

  const fGrpc = formatUserLocation({
    location_type: 'grpc',
    endpoint_id: 'e2',
    name: 'GetUserStream',
  });
  assert.equal(fGrpc.label, 'GetUserStream');
  assert.equal(fGrpc.badge, 'gRPC');
  assert.equal(fGrpc.isEditingEndpoint, true);

  const fSettings = formatUserLocation({ location_type: 'settings' });
  assert.equal(fSettings.label, 'Settings');
  assert.equal(fSettings.isEditingEndpoint, false);
});

test('findConflictingUsers: detects other users on the same endpoint', () => {
  const usersWithLoc: PresenceUser[] = [
    {
      user_id: 'u1',
      name: 'Alice',
      email: 'alice@example.com',
      avatar: 'a',
      current_location: { location_type: 'http', endpoint_id: 'ep-common' },
    },
    {
      user_id: 'u2',
      name: 'Bob',
      email: 'bob@example.com',
      avatar: 'b',
      current_location: { location_type: 'http', endpoint_id: 'ep-common' },
    },
    {
      user_id: 'u3',
      name: 'Charlie',
      email: 'charlie@example.com',
      avatar: 'c',
      current_location: { location_type: 'http', endpoint_id: 'ep-other' },
    },
  ];

  // Current user is Alice ('u1') opening 'ep-common' -> conflicting should be Bob ('u2')
  const conflicts = findConflictingUsers(usersWithLoc, 'u1', 'ep-common');
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].user_id, 'u2');

  // No conflict for Charlie ('u3') on 'ep-other'
  const conflictsCharlie = findConflictingUsers(usersWithLoc, 'u3', 'ep-other');
  assert.equal(conflictsCharlie.length, 0);

  // Missing endpointId returns empty
  assert.equal(findConflictingUsers(usersWithLoc, 'u1', undefined).length, 0);
});

test('formatConflictWarning: produces concise labels and tooltip strings', () => {
  const empty = formatConflictWarning([]);
  assert.equal(empty.shortLabel, '');

  const single = formatConflictWarning([u2]);
  assert.equal(single.shortLabel, 'Alice viewing');
  assert.ok(single.fullMessage.includes('Alice is currently viewing this endpoint'));

  const multi = formatConflictWarning([u2, u3]);
  assert.equal(multi.shortLabel, 'Alice +1 viewing');
  assert.ok(multi.fullMessage.includes('Alice, Bob are currently viewing'));
});
