import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStreamTimestamp,
  getCompactPayloadPreview,
  filterStreamMessages,
  isLifecyclePayload,
} from './streamViewer.ts';

test('formatStreamTimestamp: formats date to HH:mm:ss.SSS', () => {
  const d = new Date(2026, 9, 22, 16, 54, 39, 495);
  const formatted = formatStreamTimestamp(d);
  assert.equal(formatted, '16:54:39.495');

  // Fallback for custom or invalid string
  assert.equal(formatStreamTimestamp('12:00:00'), '12:00:00');
  assert.equal(formatStreamTimestamp(''), '');
});

test('getCompactPayloadPreview: compresses objects and JSON strings into single line', () => {
  const obj = { tick: { symbol: 'XAUIDR', ask_price: 2412981.98 } };
  assert.equal(
    getCompactPayloadPreview(obj),
    '{"tick":{"symbol":"XAUIDR","ask_price":2412981.98}}'
  );

  const jsonStr = '{\n  "action": "SUBSCRIBE",\n  "symbol": ["XAUIDR"]\n}';
  assert.equal(
    getCompactPayloadPreview(jsonStr),
    '{"action":"SUBSCRIBE","symbol":["XAUIDR"]}'
  );

  const plainText = '  line 1 \n  line 2  ';
  assert.equal(getCompactPayloadPreview(plainText), 'line 1 line 2');
  assert.equal(getCompactPayloadPreview(null), '');
});

test('filterStreamMessages: filters by query and direction', () => {
  const messages = [
    { id: '1', timestamp: '16:00:00', direction: 'out', payload: { action: 'SUBSCRIBE', symbol: ['XAUIDR'] } },
    { id: '2', timestamp: '16:00:01', direction: 'in', payload: { tick: { symbol: 'XAUIDR', price: 100 } } },
    { id: '3', timestamp: '16:00:02', direction: 'in', payload: { tick: { symbol: 'BTCUSD', price: 90000 } } },
    { id: '4', timestamp: '16:00:03', direction: 'in', payload: 'Response received' },
  ];

  // All messages
  assert.equal(filterStreamMessages(messages, '', 'all').length, 4);

  // Direction filter
  const outMsgs = filterStreamMessages(messages, '', 'out');
  assert.equal(outMsgs.length, 1);
  assert.equal(outMsgs[0].id, '1');

  const inMsgs = filterStreamMessages(messages, '', 'in');
  assert.equal(inMsgs.length, 3);

  // Query filter
  const btcMsgs = filterStreamMessages(messages, 'BTCUSD', 'all');
  assert.equal(btcMsgs.length, 1);
  assert.equal(btcMsgs[0].id, '3');

  // Query + Direction filter
  const filtered = filterStreamMessages(messages, 'XAUIDR', 'in');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, '2');
});

test('isLifecyclePayload: identifies lifecycle strings correctly', () => {
  assert.equal(isLifecyclePayload('Request sent'), true);
  assert.equal(isLifecyclePayload('Response received'), true);
  assert.equal(isLifecyclePayload('Stream started'), true);
  assert.equal(isLifecyclePayload({ tick: 1 }), false);
  assert.equal(isLifecyclePayload('some other string'), false);
});
