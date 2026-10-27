import type { PresenceUser, PresenceUserLocation, Endpoint } from '@api-lab/api-types';

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

export interface ComputeLocationParams {
  activeEndpoint?: Endpoint | null;
  appSettingsOpen?: boolean;
  workspaceModalOpen?: boolean;
  membersModalOpen?: boolean;
  envModalOpen?: boolean;
  collectionSettingsModal?: { isOpen: boolean; collectionId: string } | null;
  folderSettingsModal?: { isOpen: boolean; folderId: string } | null;
}

export function computeCurrentLocation(params: ComputeLocationParams): PresenceUserLocation {
  if (params.appSettingsOpen) {
    return { location_type: 'settings', name: 'Settings' };
  }
  if (params.workspaceModalOpen) {
    return { location_type: 'workspace_settings', name: 'Workspace Settings' };
  }
  if (params.membersModalOpen) {
    return { location_type: 'members', name: 'Workspace Members' };
  }
  if (params.envModalOpen) {
    return { location_type: 'environments', name: 'Environments' };
  }
  if (params.collectionSettingsModal?.isOpen) {
    return { location_type: 'collection_settings', name: 'Collection Settings' };
  }
  if (params.folderSettingsModal?.isOpen) {
    return { location_type: 'folder_settings', name: 'Folder Settings' };
  }
  if (params.activeEndpoint) {
    const ep = params.activeEndpoint;
    const cfg = ep.config || {};
    if (ep.protocol === 'grpc') {
      const methodName = cfg.method_name || cfg.method || ep.name;
      return {
        location_type: 'grpc',
        endpoint_id: ep.id,
        name: methodName,
        method: 'gRPC',
      };
    }
    const httpMethod = (cfg.method || 'GET').toUpperCase();
    return {
      location_type: 'http',
      endpoint_id: ep.id,
      name: ep.name,
      method: httpMethod,
    };
  }
  return { location_type: 'idle', name: 'Idle' };
}

export interface FormattedUserLocation {
  label: string;
  badge: string;
  isEditingEndpoint: boolean;
  badgeClass: string;
  iconType: 'http' | 'grpc' | 'settings' | 'idle';
}

export function formatUserLocation(location?: PresenceUserLocation | null): FormattedUserLocation {
  if (!location || location.location_type === 'idle') {
    return {
      label: 'Idle',
      badge: '',
      isEditingEndpoint: false,
      badgeClass: 'text-zinc-500 bg-zinc-900/60 border-zinc-800/80',
      iconType: 'idle',
    };
  }

  if (location.location_type === 'http') {
    const method = (location.method || 'GET').toUpperCase();
    let methodBadgeClass = 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60';
    if (method === 'POST') {
      methodBadgeClass = 'text-sky-400 bg-sky-950/60 border-sky-800/60';
    } else if (method === 'PUT' || method === 'PATCH') {
      methodBadgeClass = 'text-amber-400 bg-amber-950/60 border-amber-800/60';
    } else if (method === 'DELETE') {
      methodBadgeClass = 'text-rose-400 bg-rose-950/60 border-rose-800/60';
    }

    return {
      label: location.name || 'HTTP Endpoint',
      badge: method,
      isEditingEndpoint: true,
      badgeClass: methodBadgeClass,
      iconType: 'http',
    };
  }

  if (location.location_type === 'grpc') {
    return {
      label: location.name || 'gRPC Method',
      badge: 'gRPC',
      isEditingEndpoint: true,
      badgeClass: 'text-indigo-400 bg-indigo-950/60 border-indigo-800/60',
      iconType: 'grpc',
    };
  }

  if (location.location_type === 'settings') {
    return {
      label: 'Settings',
      badge: 'App',
      isEditingEndpoint: false,
      badgeClass: 'text-zinc-300 bg-zinc-800/60 border-zinc-700/60',
      iconType: 'settings',
    };
  }

  if (location.location_type === 'workspace_settings') {
    return {
      label: 'Workspace Settings',
      badge: 'Workspace',
      isEditingEndpoint: false,
      badgeClass: 'text-zinc-300 bg-zinc-800/60 border-zinc-700/60',
      iconType: 'settings',
    };
  }

  if (location.location_type === 'members') {
    return {
      label: 'Workspace Members',
      badge: 'Members',
      isEditingEndpoint: false,
      badgeClass: 'text-purple-400 bg-purple-950/60 border-purple-800/60',
      iconType: 'settings',
    };
  }

  if (location.location_type === 'environments') {
    return {
      label: 'Environments',
      badge: 'Env',
      isEditingEndpoint: false,
      badgeClass: 'text-teal-400 bg-teal-950/60 border-teal-800/60',
      iconType: 'settings',
    };
  }

  if (location.location_type === 'collection_settings') {
    return {
      label: 'Collection Settings',
      badge: 'Collection',
      isEditingEndpoint: false,
      badgeClass: 'text-amber-400 bg-amber-950/60 border-amber-800/60',
      iconType: 'settings',
    };
  }

  if (location.location_type === 'folder_settings') {
    return {
      label: 'Folder Settings',
      badge: 'Folder',
      isEditingEndpoint: false,
      badgeClass: 'text-amber-400 bg-amber-950/60 border-amber-800/60',
      iconType: 'settings',
    };
  }

  return {
    label: location.name || location.location_type,
    badge: '',
    isEditingEndpoint: false,
    badgeClass: 'text-zinc-400 bg-zinc-800/40 border-zinc-700/40',
    iconType: 'settings',
  };
}

export function findConflictingUsers(
  onlineUsers: PresenceUser[],
  currentUserId?: string,
  currentEndpointId?: string
): PresenceUser[] {
  if (!currentEndpointId) return [];
  const dedupedMap = new Map<string, PresenceUser>();
  for (const user of onlineUsers) {
    if (currentUserId && user.user_id === currentUserId) continue;
    if (user.current_location?.endpoint_id === currentEndpointId) {
      dedupedMap.set(user.user_id, user);
    }
  }
  return Array.from(dedupedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function formatConflictWarning(conflictingUsers: PresenceUser[]): {
  shortLabel: string;
  fullMessage: string;
} {
  if (conflictingUsers.length === 0) {
    return { shortLabel: '', fullMessage: '' };
  }
  if (conflictingUsers.length === 1) {
    const name = conflictingUsers[0].name;
    return {
      shortLabel: `${name} viewing`,
      fullMessage: `${name} is currently viewing this endpoint. Unsaved changes may overwrite each other.`,
    };
  }
  const firstName = conflictingUsers[0].name;
  const others = conflictingUsers.length - 1;
  const namesList = conflictingUsers.map((u) => u.name).join(', ');
  return {
    shortLabel: `${firstName} +${others} viewing`,
    fullMessage: `${namesList} are currently viewing this endpoint. Unsaved changes may overwrite each other.`,
  };
}
