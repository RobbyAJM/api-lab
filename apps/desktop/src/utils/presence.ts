import type { PresenceUser } from '@api-lab/api-types';

export function sortPresenceUsers(
  users: PresenceUser[],
  currentUserId?: string
): PresenceUser[] {
  const dedupedMap = new Map<string, PresenceUser>();
  for (const u of users) {
    dedupedMap.set(u.user_id, u);
  }
  const list = Array.from(dedupedMap.values());

  return list.sort((a, b) => {
    if (currentUserId) {
      if (a.user_id === currentUserId) return -1;
      if (b.user_id === currentUserId) return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

// ponytail: basic user id filter, add role/channel filtering if workspace permissions expand
export function filterOtherPresenceUsers(
  users: PresenceUser[],
  currentUserId?: string
): PresenceUser[] {
  const dedupedMap = new Map<string, PresenceUser>();
  for (const u of users) {
    if (!currentUserId || u.user_id !== currentUserId) {
      dedupedMap.set(u.user_id, u);
    }
  }
  return Array.from(dedupedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function mergePresenceJoin(
  existing: PresenceUser[],
  user: PresenceUser
): PresenceUser[] {
  const filtered = existing.filter((u) => u.user_id !== user.user_id);
  return [...filtered, user];
}

export function mergePresenceLeave(
  existing: PresenceUser[],
  userId: string
): PresenceUser[] {
  return existing.filter((u) => u.user_id !== userId);
}

export function getAvatarStackPreview(
  users: PresenceUser[],
  max = 3
): { visible: PresenceUser[]; overflowCount: number } {
  const visible = users.slice(0, max);
  const overflowCount = Math.max(0, users.length - max);
  return { visible, overflowCount };
}
