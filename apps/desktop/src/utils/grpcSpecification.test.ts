import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRpcSignature,
  formatMethodStreamingLabel,
  getGrpcStatusLabel,
  formatExecutionError,
  filterGrpcServices,
} from './grpcSpecification.ts';
import type { GrpcServiceSummary } from '@api-lab/api-types';

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

test('filterGrpcServices: matches method names, service names, and multi-keywords', () => {
  const services: GrpcServiceSummary[] = [
    {
      name: 'grpc.health.v1.Health',
      methods: [
        { name: 'Check', input_type: '', output_type: '' },
        { name: 'Watch', input_type: '', output_type: '', stream_type: 'omni_stream' },
      ],
    },
    {
      name: 'nutrade.client.ClientAuthAPI',
      methods: [
        { name: 'Login', input_type: '', output_type: '' },
        { name: 'Register', input_type: '', output_type: '' },
        { name: 'GetProfile', input_type: '', output_type: '' },
      ],
    },
  ];

  // Empty query returns all
  assert.equal(filterGrpcServices(services, '').length, 2);

  // Filter by method name
  const filteredLogin = filterGrpcServices(services, 'login');
  assert.equal(filteredLogin.length, 1);
  assert.equal(filteredLogin[0].name, 'nutrade.client.ClientAuthAPI');
  assert.equal(filteredLogin[0].methods.length, 1);
  assert.equal(filteredLogin[0].methods[0].name, 'Login');

  // Filter by service name
  const filteredHealth = filterGrpcServices(services, 'health');
  assert.equal(filteredHealth.length, 1);
  assert.equal(filteredHealth[0].methods.length, 2);

  // Multi-keyword filter
  const multi = filterGrpcServices(services, 'auth register');
  assert.equal(multi.length, 1);
  assert.equal(multi[0].methods[0].name, 'Register');

  // No match
  assert.equal(filterGrpcServices(services, 'nonexistent').length, 0);
});

