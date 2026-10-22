import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEndpointStreamActionInfo,
  createStreamMessage,
} from './grpcStreamManager.ts';
import type { Endpoint } from '@api-lab/api-types';

test('getEndpointStreamActionInfo: unary endpoint remains invokable when another endpoint is streaming', () => {
  const unaryEndpoint: Endpoint = {
    id: 'ep-unary-1',
    collection_id: 'coll-1',
    name: 'GetUser',
    protocol: 'grpc',
    config: {
      server_address: 'localhost:50051',
      service: 'users.UserService',
      method: 'GetUser',
      stream_type: 'unary',
    },
    sort_order: 0,
    version: 1,
    created_at: '',
    updated_at: '',
  };

  // Another endpoint 'ep-stream-2' is actively streaming
  const activeStreaming = {
    isStreaming: true,
    streamingEndpointId: 'ep-stream-2',
    isSending: false,
  };

  const info = getEndpointStreamActionInfo(unaryEndpoint, activeStreaming);

  // Unary Invoke MUST NOT be disabled by another endpoint streaming!
  assert.equal(info.canInvoke, true, 'Unary endpoint should be invokable');
  assert.equal(info.buttonLabel, 'Invoke');
  assert.equal(info.isOtherEndpointStreaming, true);
  assert.equal(info.isStreaming, false);
});

test('getEndpointStreamActionInfo: streaming endpoint shows Stop Stream when active', () => {
  const streamEndpoint: Endpoint = {
    id: 'ep-stream-1',
    collection_id: 'coll-1',
    name: 'SubscribePrice',
    protocol: 'grpc',
    config: {
      server_address: 'localhost:3100',
      service: 'nuconnector.PriceStreamAPI',
      method: 'SubscribePrice',
      stream_type: 'bidi_stream',
    },
    sort_order: 0,
    version: 1,
    created_at: '',
    updated_at: '',
  };

  const activeStreaming = {
    isStreaming: true,
    streamingEndpointId: 'ep-stream-1',
    isSending: false,
  };

  const info = getEndpointStreamActionInfo(streamEndpoint, activeStreaming);

  assert.equal(info.canStopStream, true);
  assert.equal(info.canStartStream, false);
  assert.equal(info.canSendStreamMessage, true, 'Active bidi stream allows sending messages');
  assert.equal(info.isBidiStream, true);
  assert.equal(info.buttonLabel, 'Stop Stream');
  assert.equal(info.isStreaming, true);
});

test('getEndpointStreamActionInfo: streaming endpoint shows Start Stream when idle', () => {
  const streamEndpoint: Endpoint = {
    id: 'ep-stream-1',
    collection_id: 'coll-1',
    name: 'SubscribePrice',
    protocol: 'grpc',
    config: {
      server_address: 'localhost:3100',
      service: 'nuconnector.PriceStreamAPI',
      method: 'SubscribePrice',
      stream_type: 'omni_stream',
    },
    sort_order: 0,
    version: 1,
    created_at: '',
    updated_at: '',
  };

  const idleStreaming = {
    isStreaming: false,
    streamingEndpointId: null,
    isSending: false,
  };

  const info = getEndpointStreamActionInfo(streamEndpoint, idleStreaming);

  assert.equal(info.canStartStream, true);
  assert.equal(info.canStopStream, false);
  assert.equal(info.canSendStreamMessage, false, 'Idle stream cannot send message');
  assert.equal(info.isBidiStream, false, 'omni_stream is not bidi');
  assert.equal(info.buttonLabel, 'Start Stream');
  assert.equal(info.isStreaming, false);
});

test('getEndpointStreamActionInfo: disables action buttons when missing method/service or sending', () => {
  const incompleteEndpoint: Endpoint = {
    id: 'ep-incomplete',
    collection_id: 'coll-1',
    name: 'Empty',
    protocol: 'grpc',
    config: {
      server_address: 'localhost:3100',
      service: '',
      method: '',
      stream_type: 'unary',
    },
    sort_order: 0,
    version: 1,
    created_at: '',
    updated_at: '',
  };

  const info = getEndpointStreamActionInfo(incompleteEndpoint, {
    isStreaming: false,
    streamingEndpointId: null,
    isSending: false,
  });
  assert.equal(info.canInvoke, false);

  const sendingInfo = getEndpointStreamActionInfo(incompleteEndpoint, {
    isStreaming: false,
    streamingEndpointId: null,
    isSending: true,
  });
  assert.equal(sendingInfo.canInvoke, false);
});

test('createStreamMessage: distinguishes in vs out message entries and payloads', () => {
  // Outgoing client message (e.g. SUBSCRIBE payload)
  const outPayload = { action: 'SUBSCRIBE', symbol: ['XAUIDR'] };
  const outMsg = createStreamMessage(outPayload, 'out', () => 'msg-out-1');

  assert.equal(outMsg.id, 'msg-out-1');
  assert.equal(outMsg.direction, 'out');
  assert.deepEqual(outMsg.payload, outPayload);
  assert.ok(outMsg.timestamp);

  // Incoming server message (e.g. Price tick)
  const inPayload = { tick: { symbol: 'XAUIDR', ask_price: 2400000, bid_price: 2390000 } };
  const inMsg = createStreamMessage(inPayload, 'in', () => 'msg-in-1');

  assert.equal(inMsg.id, 'msg-in-1');
  assert.equal(inMsg.direction, 'in');
  assert.deepEqual(inMsg.payload, inPayload);
});
