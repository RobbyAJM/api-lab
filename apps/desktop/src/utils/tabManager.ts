import type { Endpoint } from '@api-lab/api-types';

export interface TabState {
  openEndpoints: Endpoint[];
  activeEndpointId: string | null;
  activeEndpoint: Endpoint | null;
}

/**
 * Opens an endpoint in tabs. If already open, activates it and updates reference.
 * If not open, appends it and activates it.
 */
export function openEndpointInTabs(state: TabState, endpoint: Endpoint): TabState {
  const exists = state.openEndpoints.some((e) => e.id === endpoint.id);
  const nextOpen = exists
    ? state.openEndpoints.map((e) => (e.id === endpoint.id ? endpoint : e))
    : [...state.openEndpoints, endpoint];

  return {
    openEndpoints: nextOpen,
    activeEndpoint: endpoint,
    activeEndpointId: endpoint.id,
  };
}

/**
 * Closes an endpoint tab.
 * If closed tab was active, activates adjacent tab (left preferred, else next).
 * If no tabs remain, activeEndpoint becomes null.
 */
export function closeEndpointInTabs(state: TabState, endpointId: string): TabState {
  const idx = state.openEndpoints.findIndex((e) => e.id === endpointId);
  if (idx === -1) return state;

  const nextOpen = state.openEndpoints.filter((e) => e.id !== endpointId);

  // Non-active tab closed: keep current active endpoint
  if (state.activeEndpointId !== endpointId) {
    return {
      openEndpoints: nextOpen,
      activeEndpointId: state.activeEndpointId,
      activeEndpoint: state.activeEndpoint,
    };
  }

  // Active tab closed and no tabs left
  if (nextOpen.length === 0) {
    return {
      openEndpoints: [],
      activeEndpoint: null,
      activeEndpointId: null,
    };
  }

  // Prefer tab to the left (idx - 1), otherwise fallback to current index (which is now next item)
  const nextActiveIdx = Math.max(0, idx - 1);
  const nextActive = nextOpen[nextActiveIdx];

  return {
    openEndpoints: nextOpen,
    activeEndpoint: nextActive,
    activeEndpointId: nextActive.id,
  };
}

/**
 * Updates an endpoint in open tabs when saved or mutated.
 */
export function updateEndpointInTabs(state: TabState, updated: Endpoint): TabState {
  const exists = state.openEndpoints.some((e) => e.id === updated.id);
  const nextOpen = exists
    ? state.openEndpoints.map((e) => (e.id === updated.id ? updated : e))
    : state.openEndpoints;

  return {
    openEndpoints: nextOpen,
    activeEndpointId: state.activeEndpointId,
    activeEndpoint: state.activeEndpointId === updated.id ? updated : state.activeEndpoint,
  };
}
