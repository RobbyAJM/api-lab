import type { FixConnectRequest, FixSessionEvent } from '@api-lab/api-types';
import {
  connectNativeFixSession,
  disconnectNativeFixSession,
  sendNativeFixSessionMessage,
} from '../api/native';
import { useFixSessionStore } from '../store/useFixSessionStore';

interface SessionRuntime {
  intentionalDisconnect: boolean;
}

const runtimes = new Map<string, SessionRuntime>();

/**
 * Starts one native FIX session whose lifetime is independent of React mounts.
 * Repeated calls for an active endpoint are ignored.
 */
export function startFixSession(
  endpointId: string,
  request: FixConnectRequest,
  variables: Record<string, string>
): void {
  if (runtimes.has(endpointId)) return;

  const runtime: SessionRuntime = { intentionalDisconnect: false };
  runtimes.set(endpointId, runtime);
  useFixSessionStore.getState().beginSession(endpointId);

  const handleEvent = (event: FixSessionEvent) => {
    useFixSessionStore.getState().applyEvent(endpointId, event);
  };

  void connectNativeFixSession(request, variables, endpointId, handleEvent)
    .catch((error: unknown) => {
      if (!runtime.intentionalDisconnect) {
        useFixSessionStore
          .getState()
          .setError(endpointId, errorMessage(error, 'Failed to start FIX session.'));
      }
    })
    .finally(() => {
      runtimes.delete(endpointId);
    });
}

/**
 * Queues a message on an active native session.
 */
export async function sendFixSessionMessage(
  endpointId: string,
  message: string,
  variables: Record<string, string>
): Promise<void> {
  await sendNativeFixSessionMessage(endpointId, message, variables);
}

/**
 * Requests a graceful FIX logout. Native events update the visible state.
 */
export async function disconnectFixSession(endpointId: string): Promise<boolean> {
  const runtime = runtimes.get(endpointId);
  if (!runtime) return false;
  runtime.intentionalDisconnect = true;
  useFixSessionStore.getState().markDisconnecting(endpointId);
  return disconnectNativeFixSession(endpointId);
}

/**
 * Disconnects every active FIX item in the supplied endpoint set.
 */
export async function disconnectFixSessionsForEndpoints(
  endpointIds: string[]
): Promise<void> {
  const ids = endpointIds.filter((id) => runtimes.has(id));
  await Promise.all(ids.map((id) => disconnectFixSession(id)));
}

/**
 * Disconnects every active FIX session, including tabs from other workspaces.
 */
export async function disconnectAllFixSessions(): Promise<void> {
  await disconnectFixSessionsForEndpoints(Array.from(runtimes.keys()));
}

/**
 * Whether a native session is still tracked, including the connect handshake.
 */
export function hasFixSessionRuntime(endpointId: string): boolean {
  return runtimes.has(endpointId);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}
