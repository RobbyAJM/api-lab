import { create } from 'zustand';
import type { FixSessionEvent } from '@api-lab/api-types';
import {
  applyFixTranscriptEvent,
  createEmptyFixSessionState,
  type FixSessionRuntimeState,
} from '../utils/fixSession';

export type { FixSessionRuntimeState, FixTransportLogEntry } from '../utils/fixSession';

interface FixSessionStore {
  sessions: Record<string, FixSessionRuntimeState>;
  beginSession: (endpointId: string) => void;
  applyEvent: (endpointId: string, event: FixSessionEvent) => void;
  markDisconnecting: (endpointId: string) => void;
  setError: (endpointId: string, error: string) => void;
  clearTranscript: (endpointId: string) => void;
  resetSessions: () => void;
}

export const useFixSessionStore = create<FixSessionStore>((set) => ({
  sessions: {},
  beginSession: (endpointId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [endpointId]: createEmptyFixSessionState(),
      },
    })),
  applyEvent: (endpointId, event) =>
    set((state) => {
      const current = state.sessions[endpointId] || createEmptyFixSessionState();
      return {
        sessions: {
          ...state.sessions,
          [endpointId]: applyFixTranscriptEvent(current, event),
        },
      };
    }),
  markDisconnecting: (endpointId) =>
    set((state) => {
      const current = state.sessions[endpointId] || createEmptyFixSessionState();
      return {
        sessions: {
          ...state.sessions,
          [endpointId]: {
            ...current,
            status: 'disconnecting',
            detail: 'logout requested',
          },
        },
      };
    }),
  setError: (endpointId, error) =>
    set((state) => {
      const current = state.sessions[endpointId] || createEmptyFixSessionState();
      return {
        sessions: {
          ...state.sessions,
          [endpointId]: {
            ...current,
            status: 'error',
            error,
            detail: error,
          },
        },
      };
    }),
  clearTranscript: (endpointId) =>
    set((state) => {
      const current = state.sessions[endpointId];
      if (!current) return state;
      return {
        sessions: {
          ...state.sessions,
          [endpointId]: {
            ...current,
            messages: [],
            transportLogs: [],
          },
        },
      };
    }),
  resetSessions: () => set({ sessions: {} }),
}));
