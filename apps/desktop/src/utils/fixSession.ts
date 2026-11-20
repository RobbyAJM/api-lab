import type {
  FixConnectRequest,
  FixDirection,
  FixEndpointConfig,
  FixLogLevel,
  FixMessageEvent,
  FixSessionEvent,
  FixSessionStatus,
  FixTransport,
} from '@api-lab/api-types';

export const FIX_ADMIN_MESSAGE_TYPES = new Set(['0', '1', '2', '3', '4', '5', 'A']);
export const FIX_MESSAGE_LIMIT = 2000;
export const FIX_TRANSPORT_LOG_LIMIT = 200;

export interface FixStatusMeta {
  label: string;
  className: string;
  dotClassName: string;
  active: boolean;
}

export interface FixTransportLogEntry {
  id: string;
  timestamp: string;
  level: FixLogLevel;
  detail: string;
}

export interface FixSessionRuntimeState {
  status?: FixSessionStatus;
  detail?: string;
  error?: string;
  messages: FixMessageEvent[];
  transportLogs: FixTransportLogEntry[];
  connectedAt?: string;
}

export interface FixMessageFilter {
  direction: 'all' | FixDirection;
  query: string;
  showAdmin: boolean;
}

/**
 * Creates an empty runtime transcript for a new native session.
 */
export function createEmptyFixSessionState(): FixSessionRuntimeState {
  return {
    status: 'connecting',
    messages: [],
    transportLogs: [],
  };
}

/**
 * Applies one native FIX event to a transcript without mutating prior state.
 */
export function applyFixTranscriptEvent(
  current: FixSessionRuntimeState,
  event: FixSessionEvent
): FixSessionRuntimeState {
  if (event.kind === 'message' && event.message) {
    return {
      ...current,
      error: undefined,
      messages: appendCapped(current.messages, event.message, FIX_MESSAGE_LIMIT),
    };
  }

  if (event.kind === 'transport') {
    const entry: FixTransportLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: event.timestamp,
      level: event.level || 'info',
      detail: event.detail || '',
    };
    return {
      ...current,
      transportLogs: appendCapped(
        current.transportLogs,
        entry,
        FIX_TRANSPORT_LOG_LIMIT
      ),
    };
  }

  if (event.kind === 'error') {
    return {
      ...current,
      status: 'error',
      error: event.detail || 'FIX session error',
      detail: event.detail || 'FIX session error',
    };
  }

  if (event.kind === 'state' && event.status) {
    if (event.status === 'disconnected' && current.error) {
      return {
        ...current,
        status: 'error',
        detail: event.detail || current.detail,
      };
    }
    return {
      ...current,
      status: event.status,
      detail: event.detail,
      error: event.status === 'connecting' ? undefined : current.error,
      connectedAt:
        event.status === 'logged_on'
          ? event.timestamp
          : event.status === 'connecting'
          ? undefined
          : current.connectedAt,
    };
  }

  return current;
}

/**
 * Creates the persisted configuration for a new FIX endpoint.
 */
export function createDefaultFixEndpointConfig(): FixEndpointConfig {
  return {
    host: '127.0.0.1',
    port: '9876',
    begin_string: 'FIX.4.4',
    sender_comp_id: 'CLIENT',
    target_comp_id: 'SERVER',
    heartbeat_seconds: 30,
    username: '',
    password: '',
    reset_seq_num_on_logon: true,
    transport: 'direct',
    stunnel: {
      executable: '',
      local_host: '127.0.0.1',
      local_port: '',
      ca_file: '',
      client_cert_file: '',
      client_key_file: '',
      verify_peer: true,
    },
    message_draft: '35=D|11=ORDER-1|55=AAPL|54=1|38=10|40=2',
  };
}

/**
 * Normalizes an API endpoint config into a complete FIX editor configuration.
 * Unknown and missing values fall back to safe defaults.
 */
export function normalizeFixEndpointConfig(raw?: Record<string, any> | null): FixEndpointConfig {
  const defaults = createDefaultFixEndpointConfig();
  const config = raw || {};
  const stunnel = config.stunnel || {};
  const heartbeat = Number(config.heartbeat_seconds);
  const transport = config.transport;

  return {
    host: stringValue(config.host, defaults.host),
    port: stringValue(config.port, defaults.port),
    begin_string: stringValue(config.begin_string, defaults.begin_string),
    sender_comp_id: stringValue(config.sender_comp_id, defaults.sender_comp_id),
    target_comp_id: stringValue(config.target_comp_id, defaults.target_comp_id),
    heartbeat_seconds:
      Number.isFinite(heartbeat) && heartbeat >= 1 && heartbeat <= 3600
        ? Math.trunc(heartbeat)
        : defaults.heartbeat_seconds,
    username: stringValue(config.username, defaults.username),
    password: stringValue(config.password, defaults.password),
    reset_seq_num_on_logon: config.reset_seq_num_on_logon !== false,
    transport: isFixTransport(transport) ? transport : defaults.transport,
    stunnel: {
      executable: stringValue(stunnel.executable, defaults.stunnel.executable),
      local_host: stringValue(stunnel.local_host, defaults.stunnel.local_host),
      local_port: stringValue(stunnel.local_port, defaults.stunnel.local_port),
      ca_file: stringValue(stunnel.ca_file, defaults.stunnel.ca_file),
      client_cert_file: stringValue(
        stunnel.client_cert_file,
        defaults.stunnel.client_cert_file
      ),
      client_key_file: stringValue(stunnel.client_key_file, defaults.stunnel.client_key_file),
      verify_peer: stunnel.verify_peer !== false,
    },
    message_draft: stringValue(config.message_draft, defaults.message_draft || ''),
  };
}

/**
 * Converts editor state into the exact request consumed by the native runner.
 */
export function toFixConnectRequest(config: FixEndpointConfig): FixConnectRequest {
  const { message_draft: _messageDraft, ...request } = config;
  return request;
}

/**
 * Formats SOH-delimited FIX content for readable display.
 */
export function formatFixRaw(raw: string, delimiter = '|'): string {
  return raw
    .replace(/\u0001/g, delimiter)
    .replace(/\\x01/g, delimiter)
    .replace(/\^A/g, delimiter)
    .replace(/\r?\n/g, delimiter)
    .replace(new RegExp(`\\${delimiter}+`, 'g'), delimiter)
    .replace(new RegExp(`\\${delimiter}$`), '');
}

/**
 * Parses tag/value fields for a draft preview. Credential fields are masked.
 */
export function parseFixDraftFields(raw: string): [string, string][] {
  const normalized = raw
    .replace(/\u0001/g, '|')
    .replace(/\\x01/g, '|')
    .replace(/\^A/g, '|')
    .replace(/\r?\n/g, '|');
  const fields: [string, string][] = [];
  for (const part of normalized.split('|')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      throw new Error(`Field "${trimmed}" is missing '='.`);
    }
    const tag = trimmed.slice(0, separator).trim();
    if (!/^\d+$/.test(tag)) {
      throw new Error(`Tag "${tag}" must be numeric.`);
    }
    const value = trimmed.slice(separator + 1);
    fields.push([tag, tag === '554' || tag === '925' ? '********' : value]);
  }
  return fields;
}

/**
 * Validates a draft application message without requiring a native round trip.
 */
export function validateFixDraft(raw: string): string | null {
  if (!raw.trim()) return 'Enter a FIX message before sending.';
  let fields: [string, string][];
  try {
    fields = parseFixDraftFields(raw);
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid FIX message.';
  }
  const messageTypes = fields.filter(([tag]) => tag === '35');
  if (messageTypes.length === 0) return 'Message is missing MsgType tag 35.';
  if (messageTypes.length > 1) return 'Message contains more than one MsgType tag 35.';
  if (!messageTypes[0][1].trim()) return 'MsgType cannot be empty.';
  if (FIX_ADMIN_MESSAGE_TYPES.has(messageTypes[0][1])) {
    return 'Administrative FIX messages are managed automatically by the session.';
  }
  return null;
}

/**
 * Returns the display state and styling for a FIX session.
 */
export function getFixStatusMeta(status: FixSessionStatus | undefined): FixStatusMeta {
  switch (status) {
    case 'logged_on':
      return {
        label: 'Logged On',
        className: 'text-emerald-300 bg-emerald-950/50 border-emerald-800/60',
        dotClassName: 'bg-emerald-400',
        active: true,
      };
    case 'connecting':
    case 'transport_ready':
    case 'logon_sent':
      return {
        label:
          status === 'logon_sent'
            ? 'Logon Sent'
            : status === 'transport_ready'
            ? 'Transport Ready'
            : 'Connecting',
        className: 'text-amber-300 bg-amber-950/50 border-amber-800/60',
        dotClassName: 'bg-amber-400 animate-pulse',
        active: true,
      };
    case 'disconnecting':
      return {
        label: 'Disconnecting',
        className: 'text-amber-300 bg-amber-950/50 border-amber-800/60',
        dotClassName: 'bg-amber-400 animate-pulse',
        active: true,
      };
    case 'error':
      return {
        label: 'Session Error',
        className: 'text-red-300 bg-red-950/40 border-red-800/60',
        dotClassName: 'bg-red-400',
        active: false,
      };
    case 'disconnected':
      return {
        label: 'Disconnected',
        className: 'text-zinc-400 bg-zinc-900 border-zinc-700/70',
        dotClassName: 'bg-zinc-500',
        active: false,
      };
    default:
      return {
        label: 'Idle',
        className: 'text-zinc-500 bg-zinc-900 border-zinc-800',
        dotClassName: 'bg-zinc-600',
        active: false,
      };
  }
}

/**
 * Whether a status represents a live native session.
 */
export function isFixSessionActive(status: FixSessionStatus | undefined): boolean {
  return (
    status === 'connecting' ||
    status === 'transport_ready' ||
    status === 'logon_sent' ||
    status === 'logged_on' ||
    status === 'disconnecting'
  );
}

/**
 * Filters a FIX transcript by direction, admin visibility, and tag/value text.
 */
export function filterFixMessages(
  messages: FixMessageEvent[],
  filter: FixMessageFilter
): FixMessageEvent[] {
  const query = filter.query.trim().toLowerCase();
  return messages.filter((message) => {
    if (!filter.showAdmin && message.is_admin) return false;
    if (filter.direction !== 'all' && message.direction !== filter.direction) return false;
    if (!query) return true;
    const searchable = `${message.message_type} ${message.raw} ${message.fields
      .map(([tag, value]) => `${tag}=${value}`)
      .join(' ')}`.toLowerCase();
    return searchable.includes(query);
  });
}

/**
 * Returns the human-readable MsgType name for common FIX messages.
 */
export function getFixMessageTypeLabel(messageType: string): string {
  const labels: Record<string, string> = {
    '0': 'Heartbeat',
    '1': 'Test Request',
    '2': 'Resend Request',
    '3': 'Reject',
    '4': 'Sequence Reset',
    '5': 'Logout',
    A: 'Logon',
    D: 'New Order Single',
    F: 'Order Cancel Request',
    G: 'Order Cancel/Replace',
    '8': 'Execution Report',
    '9': 'Order Cancel Reject',
    R: 'Quote Request',
    S: 'Quote',
    AE: 'Trade Capture Report',
  };
  return labels[messageType] || messageType;
}

/**
 * Compact inbound/outbound summary for the transcript.
 */
export function getFixMessageSummary(message: FixMessageEvent): string {
  if (message.is_admin) {
    if (message.message_type === 'A') {
      return message.direction === 'out' ? 'Logon request' : 'Logon acknowledged';
    }
    if (message.message_type === '5') return 'Logout';
    if (message.message_type === '1') return 'Test Request';
    if (message.message_type === '0') return 'Heartbeat';
    return getFixMessageTypeLabel(message.message_type);
  }
  const fields = new Map(message.fields);
  const identifier =
    fields.get('11') || fields.get('37') || fields.get('17') || fields.get('112') || '';
  return identifier
    ? `${getFixMessageTypeLabel(message.message_type)} · ${identifier}`
    : getFixMessageTypeLabel(message.message_type);
}

/**
 * Formats an ISO timestamp as `HH:mm:ss.SSS` in local time.
 */
export function formatFixTimestamp(raw?: string): string {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}.${pad(date.getMilliseconds(), 3)}`;
}

function appendCapped<T>(items: T[], item: T, limit: number): T[] {
  if (items.length < limit) return [...items, item];
  return [...items.slice(items.length - limit + 1), item];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function isFixTransport(value: unknown): value is FixTransport {
  return (
    value === 'direct' || value === 'stunnel_managed' || value === 'stunnel_external'
  );
}
