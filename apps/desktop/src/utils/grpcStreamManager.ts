import type { Endpoint } from '@api-lab/api-types';

export interface StreamActionInfo {
  canInvoke: boolean;
  canStartStream: boolean;
  canStopStream: boolean;
  canSendStreamMessage: boolean;
  isStreaming: boolean;
  isOtherEndpointStreaming: boolean;
  isBidiStream: boolean;
  buttonLabel: 'Invoke' | 'Start Stream' | 'Stop Stream';
}

/**
 * Determines stream execution actions for a specific endpoint,
 * ensuring background streams on other endpoints NEVER disable unary invoke.
 */
export function getEndpointStreamActionInfo(
  endpoint: Endpoint,
  activeStreaming: {
    isStreaming: boolean;
    streamingEndpointId: string | null;
    isSending: boolean;
  }
): StreamActionInfo {
  const isGrpc = endpoint.protocol === 'grpc';
  const streamType = endpoint.config?.stream_type || 'unary';
  const isStreamType = isGrpc && streamType !== 'unary';
  const isBidiStream = isGrpc && streamType === 'bidi_stream';
  const isThisEndpointStreaming =
    activeStreaming.isStreaming && activeStreaming.streamingEndpointId === endpoint.id;
  const isOtherEndpointStreaming =
    activeStreaming.isStreaming &&
    activeStreaming.streamingEndpointId !== null &&
    activeStreaming.streamingEndpointId !== endpoint.id;

  const hasMethod =
    Boolean(endpoint.config?.method?.trim()) &&
    Boolean(endpoint.config?.service?.trim() || endpoint.protocol === 'http');

  if (!isStreamType) {
    // Unary gRPC or HTTP
    const canInvoke = !activeStreaming.isSending && hasMethod;
    return {
      canInvoke,
      canStartStream: false,
      canStopStream: false,
      canSendStreamMessage: false,
      isStreaming: false,
      isOtherEndpointStreaming,
      isBidiStream: false,
      buttonLabel: 'Invoke',
    };
  }

  // Streaming gRPC
  const canSendStreamMessage = isBidiStream && isThisEndpointStreaming && !activeStreaming.isSending;

  if (isThisEndpointStreaming) {
    return {
      canInvoke: false,
      canStartStream: false,
      canStopStream: true,
      canSendStreamMessage,
      isStreaming: true,
      isOtherEndpointStreaming: false,
      isBidiStream,
      buttonLabel: 'Stop Stream',
    };
  }

  return {
    canInvoke: false,
    canStartStream: !activeStreaming.isSending && hasMethod,
    canStopStream: false,
    canSendStreamMessage: false,
    isStreaming: false,
    isOtherEndpointStreaming,
    isBidiStream,
    buttonLabel: 'Start Stream',
  };
}

export interface StreamMessageRecord {
  id: string;
  timestamp: string;
  direction: 'in' | 'out';
  payload: any;
}

/**
 * Creates an in or out stream message record with validated direction and timestamp.
 */
export function createStreamMessage(
  payload: any,
  direction: 'in' | 'out' = 'in',
  idGenerator = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
): StreamMessageRecord {
  return {
    id: idGenerator(),
    timestamp: new Date().toLocaleTimeString(),
    direction,
    payload,
  };
}
