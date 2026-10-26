import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterNotifications,
  countUnreadNotifications,
  formatNotificationTime,
} from './notifications.ts';
import type { NotificationItem } from '@api-lab/api-types';

const notif1: NotificationItem = {
  id: '1',
  user_id: 'u1',
  title: 'Direct Msg',
  message: 'Hello direct',
  category: 'direct',
  read: false,
  created_at: new Date().toISOString(),
};

const notif2: NotificationItem = {
  id: '2',
  user_id: 'u1',
  title: 'Watching Change',
  message: 'Endpoint updated',
  category: 'watching',
  read: false,
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
};

const notif3: NotificationItem = {
  id: '3',
  user_id: 'u1',
  title: 'Old Read',
  message: 'Already seen',
  category: 'direct',
  read: true,
  created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
};

test('filterNotifications: filters by category or all', () => {
  const direct = filterNotifications([notif1, notif2, notif3], 'direct');
  assert.equal(direct.length, 2);

  const watching = filterNotifications([notif1, notif2, notif3], 'watching');
  assert.equal(watching.length, 1);

  const all = filterNotifications([notif1, notif2, notif3], 'all');
  assert.equal(all.length, 3);
});

test('countUnreadNotifications: calculates unread per tab accurately', () => {
  const counts = countUnreadNotifications([notif1, notif2, notif3]);
  assert.equal(counts.direct, 1);
  assert.equal(counts.watching, 1);
  assert.equal(counts.all, 2);
});

test('formatNotificationTime: formats relative times correctly', () => {
  assert.equal(formatNotificationTime(new Date().toISOString()), 'Just now');
  assert.equal(
    formatNotificationTime(new Date(Date.now() - 10 * 60 * 1000).toISOString()),
    '10m ago'
  );
  assert.equal(
    formatNotificationTime(new Date(Date.now() - 3 * 3600 * 1000).toISOString()),
    '3h ago'
  );
});
