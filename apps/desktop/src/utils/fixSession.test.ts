import test from 'node:test';
import assert from 'node:assert/strict';
import type { FixMessageEvent } from '@api-lab/api-types';
import {
  applyFixTranscriptEvent,
  createDefaultFixEndpointConfig,
  createEmptyFixSessionState,
  DEFAULT_FIX_TRANSCRIPT_ORDER,
  FIX_MESSAGE_LIMIT,
  FIX_TRANSCRIPT_ORDER_STORAGE_KEY,
  filterFixMessages,
  formatFixRaw,
  formatFixTimestamp,
  getFixMessageSummary,
  getFixStatusMeta,
  getStoredFixTranscriptOrder,
  isFixSessionActive,
  normalizeFixEndpointConfig,
  orderFixMessages,
  parseFixDraftFields,
  setStoredFixTranscriptOrder,
  toFixConnectRequest,
  validateFixDraft,
} from './fixSession.ts';

test('createDefaultFixEndpointConfig: provides a usable FIX 4.4 session', () => {
  const config = createDefaultFixEndpointConfig();
  assert.equal(config.begin_string, 'FIX.4.4');
  assert.equal(config.port, '9876');
  assert.equal(config.transport, 'direct');
  assert.equal(config.stunnel.verify_peer, true);
  assert.match(config.message_draft || '', /35=D/);
});

test('normalizeFixEndpointConfig: fills missing nested stunnel fields', () => {
  const config = normalizeFixEndpointConfig({
    host: 'fix.example.com',
    heartbeat_seconds: 15,
    transport: 'stunnel_managed',
    stunnel: { executable: 'C:/tools/stunnel.exe' },
  });
  assert.equal(config.host, 'fix.example.com');
  assert.equal(config.heartbeat_seconds, 15);
  assert.equal(config.transport, 'stunnel_managed');
  assert.equal(config.stunnel.executable, 'C:/tools/stunnel.exe');
  assert.equal(config.stunnel.local_host, '127.0.0.1');
  assert.equal(config.stunnel.verify_peer, true);
});

test('normalizeFixEndpointConfig: rejects invalid transport and heartbeat', () => {
  const config = normalizeFixEndpointConfig({
    transport: 'raw-socket',
    heartbeat_seconds: 9000,
  });
  assert.equal(config.transport, 'direct');
  assert.equal(config.heartbeat_seconds, 30);
});

test('toFixConnectRequest: excludes editor-only draft content', () => {
  const config = createDefaultFixEndpointConfig();
  config.message_draft = '35=D|11=ORDER-9';
  const request = toFixConnectRequest(config);
  assert.equal('message_draft' in request, false);
  assert.equal(request.sender_comp_id, 'CLIENT');
});

test('formatFixRaw: converts SOH and pipe separators into readable output', () => {
  assert.equal(formatFixRaw('8=FIX.4.4\u00019=5\u000135=0\u0001'), '8=FIX.4.4|9=5|35=0');
  assert.equal(formatFixRaw('35=D|11=ABC|'), '35=D|11=ABC');
});

test('parseFixDraftFields: masks credentials and accepts escaped SOH', () => {
  const fields = parseFixDraftFields('35=A\\x01553=user\\x01554=secret');
  assert.deepEqual(fields, [
    ['35', 'A'],
    ['553', 'user'],
    ['554', '********'],
  ]);
  assert.deepEqual(parseFixDraftFields('35=D\u000111=ORDER-2'), [
    ['35', 'D'],
    ['11', 'ORDER-2'],
  ]);
});

test('validateFixDraft: validates required and managed messages', () => {
  assert.match(validateFixDraft('') || '', /Enter a FIX message/);
  assert.match(validateFixDraft('11=ABC') || '', /missing MsgType/);
  assert.match(validateFixDraft('35=D|35=F') || '', /more than one MsgType/);
  assert.match(validateFixDraft('35=A|98=0') || '', /managed automatically/);
  assert.equal(validateFixDraft('35=D|11=ORDER-1|55=AAPL'), null);
});

test('getFixStatusMeta: maps active and terminal states', () => {
  assert.equal(getFixStatusMeta('logged_on').label, 'Logged On');
  assert.equal(getFixStatusMeta('logged_on').active, true);
  assert.equal(getFixStatusMeta('error').active, false);
  assert.equal(getFixStatusMeta(undefined).label, 'Idle');
  assert.equal(isFixSessionActive('connecting'), true);
  assert.equal(isFixSessionActive('disconnected'), false);
});

function message(
  overrides: Partial<FixMessageEvent> = {}
): FixMessageEvent {
  return {
    direction: 'in',
    raw: '35=8\u000111=ORDER-1\u000155=AAPL\u0001',
    fields: [
      ['35', '8'],
      ['11', 'ORDER-1'],
      ['55', 'AAPL'],
    ],
    message_type: '8',
    sequence_number: 2,
    is_admin: false,
    timestamp: '2026-11-20T12:34:56.789Z',
    ...overrides,
  };
}

test('filterFixMessages: filters direction, admin messages, and text', () => {
  const messages = [
    message(),
    message({
      direction: 'out',
      raw: '35=A\u0001554=********\u0001',
      fields: [
        ['35', 'A'],
        ['554', '********'],
      ],
      message_type: 'A',
      is_admin: true,
    }),
  ];
  assert.equal(
    filterFixMessages(messages, { direction: 'all', query: '', showAdmin: true }).length,
    2
  );
  assert.deepEqual(
    filterFixMessages(messages, { direction: 'out', query: 'AAPL', showAdmin: true }),
    []
  );
  assert.equal(
    filterFixMessages(messages, { direction: 'all', query: '', showAdmin: false }).length,
    1
  );
});

test('getFixMessageSummary: includes business identifiers and logon direction', () => {
  assert.match(getFixMessageSummary(message()), /Execution Report/);
  assert.match(getFixMessageSummary(message()), /ORDER-1/);
  assert.equal(
    getFixMessageSummary(
      message({ direction: 'out', message_type: 'A', is_admin: true, fields: [] })
    ),
    'Logon request'
  );
});

test('formatFixTimestamp: includes millisecond precision', () => {
  const formatted = formatFixTimestamp('2026-11-20T12:34:56.789Z');
  assert.match(formatted, /^\d{2}:\d{2}:\d{2}\.\d{3}$/);
});

test('applyFixTranscriptEvent: tracks lifecycle, messages, and transport logs', () => {
  let state = createEmptyFixSessionState();
  state = applyFixTranscriptEvent(state, {
    kind: 'state',
    timestamp: '2026-11-20T12:00:00.000Z',
    status: 'logged_on',
  });
  assert.equal(state.status, 'logged_on');
  assert.equal(state.connectedAt, '2026-11-20T12:00:00.000Z');

  state = applyFixTranscriptEvent(
    state,
    {
      kind: 'message',
      timestamp: '2026-11-20T12:00:01.000Z',
      message: message(),
    },
    () => 'message-1'
  );
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].id, 'message-1');

  state = applyFixTranscriptEvent(state, {
    kind: 'transport',
    timestamp: '2026-11-20T12:00:02.000Z',
    level: 'warn',
    detail: 'stunnel: handshake retry',
  });
  assert.equal(state.transportLogs[0].level, 'warn');
});

test('applyFixTranscriptEvent: prepends messages and keeps stable newest-first IDs', () => {
  let state = createEmptyFixSessionState();
  for (const id of ['first', 'second', 'third']) {
    state = applyFixTranscriptEvent(
      state,
      {
        kind: 'message',
        timestamp: '2026-11-20T12:00:00.000Z',
        message: message(),
      },
      () => id
    );
  }

  assert.deepEqual(
    state.messages.map((entry) => entry.id),
    ['third', 'second', 'first']
  );
});

test('applyFixTranscriptEvent: capped transcript keeps the newest messages', () => {
  let state = createEmptyFixSessionState();
  for (let index = 1; index <= FIX_MESSAGE_LIMIT + 2; index += 1) {
    state = applyFixTranscriptEvent(
      state,
      {
        kind: 'message',
        timestamp: '2026-11-20T12:00:00.000Z',
        message: message(),
      },
      () => `message-${index}`
    );
  }

  assert.equal(state.messages.length, FIX_MESSAGE_LIMIT);
  assert.equal(state.messages[0].id, `message-${FIX_MESSAGE_LIMIT + 2}`);
  assert.equal(
    state.messages[state.messages.length - 1].id,
    'message-3'
  );
});

test('orderFixMessages: reverses only for ascending display and keeps the source order', () => {
  const newestFirst = [
    { ...message(), id: 'third' },
    { ...message(), id: 'second' },
    { ...message(), id: 'first' },
  ];

  assert.equal(orderFixMessages(newestFirst, 'desc'), newestFirst);
  assert.deepEqual(
    orderFixMessages(newestFirst, 'asc').map((entry) => entry.id),
    ['first', 'second', 'third']
  );
  assert.deepEqual(
    newestFirst.map((entry) => entry.id),
    ['third', 'second', 'first'],
    'source transcript remains newest-first'
  );
});

test('filterFixMessages: preserves stable transcript message order and IDs', () => {
  const newestFirst = [
    { ...message(), id: 'third' },
    { ...message({ direction: 'out' }), id: 'second' },
    { ...message(), id: 'first' },
  ];
  const filtered = filterFixMessages(newestFirst, {
    direction: 'all',
    query: '',
    showAdmin: true,
  });
  assert.deepEqual(
    filtered.map((entry) => entry.id),
    ['third', 'second', 'first']
  );
});

test('FIX transcript order: defaults to newest-first and persists both modes', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };

  assert.equal(DEFAULT_FIX_TRANSCRIPT_ORDER, 'desc');
  assert.equal(getStoredFixTranscriptOrder(storage), 'desc');

  setStoredFixTranscriptOrder('asc', storage);
  assert.equal(values.get(FIX_TRANSCRIPT_ORDER_STORAGE_KEY), 'asc');
  assert.equal(getStoredFixTranscriptOrder(storage), 'asc');

  setStoredFixTranscriptOrder('desc', storage);
  assert.equal(getStoredFixTranscriptOrder(storage), 'desc');

  values.set(FIX_TRANSCRIPT_ORDER_STORAGE_KEY, 'sideways');
  assert.equal(getStoredFixTranscriptOrder(storage), 'desc');
  assert.equal(getStoredFixTranscriptOrder(null), 'desc');
});

test('applyFixTranscriptEvent: preserves a session error after final disconnect', () => {
  let state = createEmptyFixSessionState();
  state = applyFixTranscriptEvent(state, {
    kind: 'error',
    timestamp: '2026-11-20T12:00:03.000Z',
    detail: 'sequence mismatch',
  });
  state = applyFixTranscriptEvent(state, {
    kind: 'state',
    timestamp: '2026-11-20T12:00:04.000Z',
    status: 'disconnected',
  });
  assert.equal(state.status, 'error');
  assert.equal(state.error, 'sequence mismatch');
});
