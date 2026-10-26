import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sortPresenceUsers,
  filterOtherPresenceUsers,
  mergePresenceJoin,
  mergePresenceLeave,
  getAvatarStackPreview,
} from './presence.ts';
import type { PresenceUser } from '@api-lab/api-types';

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
