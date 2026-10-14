import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRpcSignature,
  formatMethodStreamingLabel,
  getGrpcStatusLabel,
  formatExecutionError,
} from './grpcSpecification.ts';

test('formatRpcSignature: formats full protobuf rpc signature', () => {
  const sig = formatRpcSignature('Login', 'nutrade.client.LoginRequest', 'nutrade.client.LoginResponse');
  assert.equal(sig, 'rpc Login (nutrade.client.LoginRequest) returns (nutrade.client.LoginResponse);');
});

test('formatRpcSignature: handles missing input or output gracefully', () => {
  const sig = formatRpcSignature('Ping');
  assert.equal(sig, 'rpc Ping (Unknown) returns (Unknown);');
});

test('formatMethodStreamingLabel: identifies Unary, Server Stream, Client Stream, and Bidi Stream', () => {
  assert.equal(formatMethodStreamingLabel('unary', false, false), 'Unary RPC');
  assert.equal(formatMethodStreamingLabel(undefined, false, false), 'Unary RPC');
  assert.equal(formatMethodStreamingLabel('omni_stream', false, true), 'Server Stream');
  assert.equal(formatMethodStreamingLabel(undefined, false, true), 'Server Stream');
  assert.equal(formatMethodStreamingLabel(undefined, true, false), 'Client Stream');
  assert.equal(formatMethodStreamingLabel('bidi_stream', true, true), 'Bidirectional Stream');
  assert.equal(formatMethodStreamingLabel(undefined, true, true), 'Bidirectional Stream');
});

test('getGrpcStatusLabel: maps standard status codes to canonical names', () => {
  assert.equal(getGrpcStatusLabel(0), 'OK');
  assert.equal(getGrpcStatusLabel(14, 'Connection failed: raw rust error string...'), 'UNAVAILABLE');
  assert.equal(getGrpcStatusLabel(5), 'NOT_FOUND');
  assert.equal(getGrpcStatusLabel(16), 'UNAUTHENTICATED');
  assert.equal(getGrpcStatusLabel(999), 'CODE_999');
});

test('formatExecutionError: parses connection refusal errors cleanly', () => {
  const raw = 'Connection error: failed to connect to gRPC server: transport error (tonic::transport::Error(Transport, ConnectError("tcp connect error", 127.0.0.1:9091, Os { code: 10061, kind: ConnectionRefused })))';
  const parsed = formatExecutionError(raw, 14);
  assert.equal(parsed.title, 'Connection Refused');
  assert.match(parsed.summary, /actively refused/);
  assert.equal(parsed.details, raw);
});

test('formatExecutionError: parses deadline exceeded and TLS errors', () => {
  const timeoutErr = formatExecutionError('context deadline exceeded', 4);
  assert.equal(timeoutErr.title, 'Deadline Exceeded');

  const tlsErr = formatExecutionError('tls handshake failed: invalid peer cert');
  assert.equal(tlsErr.title, 'TLS Handshake Failed');
});
