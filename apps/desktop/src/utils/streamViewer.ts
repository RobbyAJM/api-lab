export type MessageDirectionFilter = 'all' | 'in' | 'out';

export interface StreamMessageLike {
  id: string;
  timestamp: string;
  direction?: 'in' | 'out' | string;
  payload: any;
}

/**
 * Formats a timestamp into HH:mm:ss.SSS for high-precision streaming workbench.
 */
export function formatStreamTimestamp(rawTime?: string | number | Date): string {
  if (!rawTime) return '';
  const d =
    typeof rawTime === 'string' || typeof rawTime === 'number'
      ? new Date(rawTime)
      : rawTime;
  if (isNaN(d.getTime())) {
    return String(rawTime);
  }
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  const ms = pad(d.getMilliseconds(), 3);
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Returns a compact single-line JSON/string representation of message payload.
 */
export function getCompactPayloadPreview(payload: any): string {
  if (payload === null || payload === undefined) return '';
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return JSON.stringify(parsed);
    } catch {
      return payload.replace(/\s+/g, ' ').trim();
    }
  }
  if (typeof payload === 'object') {
    return JSON.stringify(payload);
  }
  return String(payload);
}

/**
 * Filters stream messages by case-insensitive query and directional filter.
 */
export function filterStreamMessages<T extends StreamMessageLike>(
  messages: T[],
  query: string,
  directionFilter: MessageDirectionFilter = 'all'
): T[] {
  const q = query.trim().toLowerCase();
  return messages.filter((msg) => {
    if (directionFilter !== 'all') {
      const dir = msg.direction || 'in';
      if (dir !== directionFilter) return false;
    }
    if (!q) return true;
    const text =
      typeof msg.payload === 'string'
        ? msg.payload
        : typeof msg.payload === 'object' && msg.payload !== null
        ? JSON.stringify(msg.payload)
        : String(msg.payload ?? '');
    return text.toLowerCase().includes(q);
  });
}

/**
 * Checks whether payload represents a lifecycle event line.
 */
export function isLifecyclePayload(payload: any): boolean {
  if (typeof payload !== 'string') return false;
  const lower = payload.trim().toLowerCase();
  return (
    lower === 'request sent' ||
    lower === 'response received' ||
    lower === 'stream started' ||
    lower === 'stream stopped' ||
    lower === 'connected' ||
    lower === 'disconnected'
  );
}
