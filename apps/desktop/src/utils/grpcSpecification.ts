/**
 * Utilities for formatting and inspecting gRPC Reflection specifications & error statuses.
 */

export const GRPC_STATUS_NAMES: Record<number, string> = {
  0: 'OK',
  1: 'CANCELLED',
  2: 'UNKNOWN',
  3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED',
  5: 'NOT_FOUND',
  6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED',
  8: 'RESOURCE_EXHAUSTED',
  9: 'FAILED_PRECONDITION',
  10: 'ABORTED',
  11: 'OUT_OF_RANGE',
  12: 'UNIMPLEMENTED',
  13: 'INTERNAL',
  14: 'UNAVAILABLE',
  15: 'DATA_LOSS',
  16: 'UNAUTHENTICATED',
};

export function getGrpcStatusLabel(code: number, rawMessage?: string): string {
  if (code === 0) return 'OK';
  const canonical = GRPC_STATUS_NAMES[code];
  if (canonical) return canonical;
  if (rawMessage && rawMessage.length <= 24 && !rawMessage.includes('\n') && !rawMessage.includes('{')) {
    return rawMessage;
  }
  return `CODE_${code}`;
}

export interface FriendlyError {
  title: string;
  summary: string;
  details?: string;
}

export function formatExecutionError(error: string, statusCode?: number): FriendlyError {
  const trimmed = (error || '').trim();
  const lower = trimmed.toLowerCase();

  // 1. Connection Refused / Cannot Connect
  if (
    lower.includes('connectionrefused') ||
    lower.includes('actively refused') ||
    lower.includes('failed to connect') ||
    lower.includes('os error 10061') ||
    lower.includes('os error 111') ||
    lower.includes('econnrefused')
  ) {
    return {
      title: 'Connection Refused',
      summary: 'Unable to reach the gRPC server. Target host actively refused the connection.',
      details: trimmed,
    };
  }

  // 2. DNS / Host Resolution Failure
  if (lower.includes('failed to lookup address') || lower.includes('nodename nor servname provided')) {
    return {
      title: 'Host Unreachable',
      summary: 'Could not resolve the specified server address.',
      details: trimmed,
    };
  }

  // 3. Timeout / Deadline Exceeded
  if (lower.includes('timed out') || lower.includes('deadline exceeded') || statusCode === 4) {
    return {
      title: 'Deadline Exceeded',
      summary: 'Request timed out waiting for the server to respond.',
      details: trimmed,
    };
  }

  // 4. TLS / SSL Error
  if (lower.includes('tls') || lower.includes('certificate') || lower.includes('ssl')) {
    return {
      title: 'TLS Handshake Failed',
      summary: 'TLS connection failed. Check if server expects plaintext or requires valid certificates.',
      details: trimmed,
    };
  }

  // 5. Default fallback
  const firstLine = trimmed.split('\n')[0];
  const summary = firstLine.length > 120 ? `${firstLine.slice(0, 120)}...` : firstLine;
  return {
    title: statusCode !== undefined && GRPC_STATUS_NAMES[statusCode] ? GRPC_STATUS_NAMES[statusCode] : 'Execution Error',
    summary: summary || 'An unexpected error occurred during execution.',
    details: trimmed.length > summary.length ? trimmed : undefined,
  };
}

export function formatRpcSignature(
  methodName: string,
  inputType?: string,
  outputType?: string
): string {
  return `rpc ${methodName} (${inputType || 'Unknown'}) returns (${outputType || 'Unknown'});`;
}

export function formatMethodStreamingLabel(
  streamType?: string,
  isClientStreaming?: boolean,
  isServerStreaming?: boolean
): string {
  if (streamType === 'bidi_stream' || (isClientStreaming && isServerStreaming)) {
    return 'Bidirectional Stream';
  }
  if (streamType === 'omni_stream' || isServerStreaming) {
    return 'Server Stream';
  }
  if (isClientStreaming) {
    return 'Client Stream';
  }
  return 'Unary RPC';
}
