import type { Endpoint, Collection } from '@api-lab/api-types';

export interface ShortcutDefinition {
  id: string;
  keyLabel: string;
  macKeyLabel: string;
  description: string;
  category: 'Request' | 'Navigation' | 'General';
}

export const SHORTCUTS: ShortcutDefinition[] = [
  {
    id: 'send_request',
    keyLabel: 'Ctrl + Enter',
    macKeyLabel: '⌘ + Enter',
    description: 'Send HTTP request / Invoke gRPC method',
    category: 'Request',
  },
  {
    id: 'save_endpoint',
    keyLabel: 'Ctrl + S',
    macKeyLabel: '⌘ + S',
    description: 'Save endpoint changes to database',
    category: 'Request',
  },
  {
    id: 'open_command',
    keyLabel: 'Ctrl + K',
    macKeyLabel: '⌘ + K',
    description: 'Open Command Palette (Search & navigate to any endpoint)',
    category: 'Navigation',
  },
  {
    id: 'open_shortcuts',
    keyLabel: 'Ctrl + /',
    macKeyLabel: '⌘ + /',
    description: 'Open keyboard shortcuts reference',
    category: 'General',
  },
  {
    id: 'open_environment',
    keyLabel: 'Ctrl + E',
    macKeyLabel: '⌘ + E',
    description: 'Open environment variables modal',
    category: 'General',
  },
  {
    id: 'escape',
    keyLabel: 'Esc',
    macKeyLabel: 'Esc',
    description: 'Close active modal / command palette',
    category: 'General',
  },
];

export function getAllShortcuts(): ShortcutDefinition[] {
  return SHORTCUTS;
}

export interface KeyboardEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * Checks if a keyboard event matches a registered shortcut ID.
 * Works seamlessly across both Windows/Linux (Ctrl) and macOS (Cmd).
 */
export function matchesShortcut(event: KeyboardEventLike, shortcutId: string): boolean {
  const isMod = !!(event.ctrlKey || event.metaKey);
  const key = event.key;

  switch (shortcutId) {
    case 'send_request':
      return isMod && key === 'Enter';
    case 'save_endpoint':
      return isMod && (key === 's' || key === 'S');
    case 'open_command':
      return isMod && (key === 'k' || key === 'K');
    case 'open_shortcuts':
      return isMod && (key === '/' || key === '?');
    case 'open_environment':
      return isMod && (key === 'e' || key === 'E');
    case 'escape':
      return key === 'Escape';
    default:
      return false;
  }
}

export interface CommandPaletteItem {
  endpoint: Endpoint;
  collectionName: string;
  methodLabel: string;
  protocol: 'http' | 'grpc';
  urlOrService: string;
}

/**
 * Filters endpoints across collections for the command palette.
 * Searches by endpoint name, collection name, HTTP method, gRPC service, or URL.
 */
export function searchEndpointsForCommandPalette(
  endpoints: Endpoint[],
  collections: Collection[],
  query: string
): CommandPaletteItem[] {
  const collMap = new Map<string, string>();
  for (const c of collections) {
    collMap.set(c.id, c.name);
  }

  const q = query.trim().toLowerCase();

  const items: CommandPaletteItem[] = endpoints.map((ep) => {
    const collName = collMap.get(ep.collection_id) || 'Collection';
    const isHttp = ep.protocol === 'http';
    const methodLabel = isHttp
      ? ep.config?.method || 'GET'
      : ep.config?.stream_type === 'bidi_stream' || ep.config?.stream_type === 'omni_stream'
      ? 'STREAM'
      : 'gRPC';
    const urlOrService = isHttp
      ? ep.config?.url || ''
      : ep.config?.service ? `${ep.config.service}/${ep.config.method || ''}` : ep.config?.server_address || '';

    return {
      endpoint: ep,
      collectionName: collName,
      methodLabel,
      protocol: ep.protocol as 'http' | 'grpc',
      urlOrService,
    };
  });

  if (!q) {
    return items;
  }

  return items.filter((item) => {
    return (
      item.endpoint.name.toLowerCase().includes(q) ||
      item.collectionName.toLowerCase().includes(q) ||
      item.methodLabel.toLowerCase().includes(q) ||
      item.urlOrService.toLowerCase().includes(q)
    );
  });
}

/**
 * Computes wrapped index for keyboard arrow navigation in lists.
 */
export function navigateListIndex(
  currentIndex: number,
  totalCount: number,
  direction: 'up' | 'down'
): number {
  if (totalCount <= 0) return 0;
  if (direction === 'down') {
    return (currentIndex + 1) % totalCount;
  } else {
    return (currentIndex - 1 + totalCount) % totalCount;
  }
}
