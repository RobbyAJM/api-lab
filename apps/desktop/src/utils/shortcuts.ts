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
    id: 'close_tab',
    keyLabel: 'Ctrl + W',
    macKeyLabel: '⌘ + W',
    description: 'Close active endpoint tab',
    category: 'Navigation',
  },
  {
    id: 'close_other_tabs',
    keyLabel: 'Ctrl + Alt + T',
    macKeyLabel: '⌘ + ⌥ + T',
    description: 'Close all other endpoint tabs',
    category: 'Navigation',
  },
  {
    id: 'close_all_tabs',
    keyLabel: 'Ctrl + Shift + W',
    macKeyLabel: '⌘ + ⇧ + W',
    description: 'Close all open endpoint tabs',
    category: 'Navigation',
  },
  {
    id: 'prev_tab',
    keyLabel: 'Ctrl + [',
    macKeyLabel: '⌘ + [',
    description: 'Switch to previous tab',
    category: 'Navigation',
  },
  {
    id: 'next_tab',
    keyLabel: 'Ctrl + ]',
    macKeyLabel: '⌘ + ]',
    description: 'Switch to next tab',
    category: 'Navigation',
  },
  {
    id: 'switch_tab_number',
    keyLabel: 'Ctrl + 1-9',
    macKeyLabel: '⌘ + 1-9',
    description: 'Switch to tab 1-9',
    category: 'Navigation',
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
    case 'close_tab':
      return isMod && !event.shiftKey && !event.altKey && (key === 'w' || key === 'W');
    case 'close_other_tabs':
      return isMod && !!event.altKey && (key === 't' || key === 'T');
    case 'close_all_tabs':
      return isMod && !!event.shiftKey && (key === 'w' || key === 'W');
    case 'prev_tab':
      return isMod && !event.shiftKey && !event.altKey && key === '[';
    case 'next_tab':
      return isMod && !event.shiftKey && !event.altKey && key === ']';
    case 'escape':
      return key === 'Escape';
    default:
      return false;
  }
}

/**
 * Resolves 0-based tab index if event is Ctrl+1..9 / Cmd+1..9.
 * Returns null if event is not a numeric tab shortcut.
 * ponytail: 1-9 direct indexing covers typical tabs; add overflow switcher if 10+ open tabs common.
 */
export function getTabNumberFromEvent(event: KeyboardEventLike): number | null {
  const isMod = !!(event.ctrlKey || event.metaKey);
  if (!isMod || event.shiftKey || event.altKey) return null;
  const num = parseInt(event.key, 10);
  if (num >= 1 && num <= 9) {
    return num - 1;
  }
  return null;
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

  // Multi-keyword search: all whitespace-separated keywords must match any field
  // (equivalent to SQL: field LIKE '%k1%' AND field LIKE '%k2%')
  const keywords = q.split(/\s+/).filter(Boolean);

  return items.filter((item) => {
    const searchable = `${item.endpoint.name} ${item.collectionName} ${item.methodLabel} ${item.urlOrService} ${item.protocol}`.toLowerCase();
    return keywords.every((kw) => searchable.includes(kw));
  });
}

export interface PaletteCommandAction {
  id: string;
  actionId: 'close_tab' | 'close_other_tabs' | 'close_all_tabs';
  title: string;
  description: string;
  keyLabel: string;
}

export const COMMAND_PALETTE_ACTIONS: PaletteCommandAction[] = [
  {
    id: 'cmd_close_tab',
    actionId: 'close_tab',
    title: 'Close Tab',
    description: 'Force close active endpoint tab',
    keyLabel: 'Ctrl + W',
  },
  {
    id: 'cmd_close_all_tabs',
    actionId: 'close_all_tabs',
    title: 'Close All Tabs',
    description: 'Force close all open tabs',
    keyLabel: 'Ctrl + Shift + W',
  },
  {
    id: 'cmd_close_other_tabs',
    actionId: 'close_other_tabs',
    title: 'Close All Other Tabs',
    description: 'Force close all tabs except current active tab',
    keyLabel: 'Ctrl + Alt + T',
  },
];

export type UnifiedPaletteItem =
  | ({
      type: 'endpoint';
      id: string;
    } & CommandPaletteItem)
  | {
      type: 'command';
      id: string;
      actionId: 'close_tab' | 'close_other_tabs' | 'close_all_tabs';
      title: string;
      description: string;
      keyLabel: string;
    };

/**
 * Searches both executable actions and workspace endpoints in Command Palette.
 */
export function searchUnifiedCommandPalette(
  endpoints: Endpoint[],
  collections: Collection[],
  query: string
): UnifiedPaletteItem[] {
  const q = query.trim().toLowerCase();
  const keywords = q.split(/\s+/).filter(Boolean);

  const matchedCommands: UnifiedPaletteItem[] = COMMAND_PALETTE_ACTIONS.filter((action) => {
    if (!q) return true;
    const searchable = `${action.title} ${action.description} ${action.keyLabel}`.toLowerCase();
    return keywords.every((kw) => searchable.includes(kw));
  }).map((action) => ({
    type: 'command',
    id: action.id,
    actionId: action.actionId,
    title: action.title,
    description: action.description,
    keyLabel: action.keyLabel,
  }));

  const endpointItems: UnifiedPaletteItem[] = searchEndpointsForCommandPalette(
    endpoints,
    collections,
    query
  ).map((item) => ({
    type: 'endpoint',
    id: item.endpoint.id,
    ...item,
  }));

  return [...matchedCommands, ...endpointItems];
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
