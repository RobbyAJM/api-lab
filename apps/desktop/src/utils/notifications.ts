import type { NotificationItem, NotificationCategory } from '@api-lab/api-types';

export function filterNotifications(
  notifications: NotificationItem[],
  tab: 'direct' | 'watching' | 'all'
): NotificationItem[] {
  if (tab === 'all') return notifications;
  return notifications.filter((n) => n.category === tab);
}

export function countUnreadNotifications(notifications: NotificationItem[]): {
  direct: number;
  watching: number;
  all: number;
} {
  let direct = 0;
  let watching = 0;
  let all = 0;

  for (const n of notifications) {
    if (!n.read) {
      all++;
      if (n.category === 'direct') direct++;
      if (n.category === 'watching') watching++;
    }
  }

  return { direct, watching, all };
}

export function formatNotificationTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDays = Math.floor(diffHour / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
