import type { Endpoint } from '@api-lab/api-types';

export interface TabResponseData {
  http?: any;
  grpc?: any;
  streamMessages?: any[];
}

export interface TabState {
  openEndpoints: Endpoint[];
  activeEndpointId: string | null;
  activeEndpoint: Endpoint | null;
  endpointDrafts?: Record<string, Record<string, any>>;
  endpointResponses?: Record<string, TabResponseData>;
}

/**
 * Checks if a working draft has unsaved changes compared to the base saved config.
 */
export function isConfigDirty(
  base: Record<string, any> | undefined | null,
  draft: Record<string, any> | undefined | null
): boolean {
  if (!draft) return false;
  const b = base || {};

  const normalize = (cfg: Record<string, any>) => {
    return {
      method: cfg.method || '',
      url: (cfg.url || '').trim(),
      server_address: (cfg.server_address || '').trim(),
      use_tls: Boolean(cfg.use_tls),
      service: (cfg.service || '').trim(),
      stream_type: cfg.stream_type || 'unary',
      authority_override: (cfg.authority_override || '').trim(),
      timeout_seconds: cfg.timeout_seconds !== undefined ? Number(cfg.timeout_seconds) : 30,
      max_msg_size_mb: cfg.max_msg_size_mb !== undefined ? Number(cfg.max_msg_size_mb) : 4,
      body_type: cfg.body_type || 'json',
      body: typeof cfg.body === 'string' ? cfg.body.trim() : '',
      payload:
        cfg.payload !== undefined && cfg.payload !== null
          ? typeof cfg.payload === 'string'
            ? cfg.payload.trim()
            : JSON.stringify(cfg.payload)
          : '',
      headers: Object.entries(cfg.headers || {})
        .filter(([k]) => k.trim())
        .sort(([k1], [k2]) => k1.localeCompare(k2)),
      header_descriptions: Object.entries(cfg.header_descriptions || {})
        .filter(([k]) => k.trim())
        .sort(([k1], [k2]) => k1.localeCompare(k2)),
      metadata: Object.entries(cfg.metadata || {})
        .filter(([k]) => k.trim())
        .sort(([k1], [k2]) => k1.localeCompare(k2)),
      metadata_descriptions: Object.entries(cfg.metadata_descriptions || {})
        .filter(([k]) => k.trim())
        .sort(([k1], [k2]) => k1.localeCompare(k2)),
      query_params: (cfg.query_params || [])
        .filter(([k]: [string, string]) => k && k.trim())
        .sort(([k1]: [string, string], [k2]: [string, string]) => k1.localeCompare(k2)),
      path_variables: (cfg.path_variables || [])
        .filter(([k]: [string, string]) => k && k.trim())
        .sort(([k1]: [string, string], [k2]: [string, string]) => k1.localeCompare(k2)),
      auth: cfg.auth || { auth_type: 'none' },
      pre_request_script: (cfg.pre_request_script || '').trim(),
      post_response_script: (cfg.post_response_script || cfg.post_request_script || '').trim(),
    };
  };

  return JSON.stringify(normalize(b)) !== JSON.stringify(normalize(draft));
}

/**
 * Resolves the effective working configuration for an endpoint editor.
 * If an unsaved draft exists, that draft is preserved and returned.
 * Otherwise, falls back to the saved endpoint.config.
 */
export function getEffectiveEndpointConfig(
  endpoint: Endpoint,
  draft?: Record<string, any> | null
): Record<string, any> {
  if (draft && typeof draft === 'object' && Object.keys(draft).length > 0) {
    return draft;
  }
  return endpoint.config || {};
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
    ...state,
    openEndpoints: nextOpen,
    activeEndpoint: endpoint,
    activeEndpointId: endpoint.id,
  };
}

/**
 * Closes an endpoint tab and cleans up its draft.
 * If closed tab was active, activates adjacent tab (left preferred, else next).
 * If no tabs remain, activeEndpoint becomes null.
 */
export function closeEndpointInTabs(state: TabState, endpointId: string): TabState {
  const idx = state.openEndpoints.findIndex((e) => e.id === endpointId);
  if (idx === -1) return state;

  const nextOpen = state.openEndpoints.filter((e) => e.id !== endpointId);
  const nextDrafts = { ...(state.endpointDrafts || {}) };
  delete nextDrafts[endpointId];
  const nextResponses = { ...(state.endpointResponses || {}) };
  delete nextResponses[endpointId];

  // Non-active tab closed: keep current active endpoint
  if (state.activeEndpointId !== endpointId) {
    return {
      openEndpoints: nextOpen,
      activeEndpointId: state.activeEndpointId,
      activeEndpoint: state.activeEndpoint,
      endpointDrafts: nextDrafts,
      endpointResponses: nextResponses,
    };
  }

  // Active tab closed and no tabs left
  if (nextOpen.length === 0) {
    return {
      openEndpoints: [],
      activeEndpoint: null,
      activeEndpointId: null,
      endpointDrafts: nextDrafts,
      endpointResponses: nextResponses,
    };
  }

  // Prefer tab to the left (idx - 1), otherwise fallback to current index (which is now next item)
  const nextActiveIdx = Math.max(0, idx - 1);
  const nextActive = nextOpen[nextActiveIdx];

  return {
    openEndpoints: nextOpen,
    activeEndpoint: nextActive,
    activeEndpointId: nextActive.id,
    endpointDrafts: nextDrafts,
    endpointResponses: nextResponses,
  };
}

/**
 * Closes all other tabs except the specified endpoint tab.
 */
export function closeOtherEndpointsInTabs(state: TabState, endpointId: string): TabState {
  const target = state.openEndpoints.find((e) => e.id === endpointId);
  if (!target) return state;

  const nextDrafts: Record<string, Record<string, any>> = {};
  if (state.endpointDrafts && state.endpointDrafts[endpointId]) {
    nextDrafts[endpointId] = state.endpointDrafts[endpointId];
  }

  const nextResponses: Record<string, TabResponseData> = {};
  if (state.endpointResponses && state.endpointResponses[endpointId]) {
    nextResponses[endpointId] = state.endpointResponses[endpointId];
  }

  return {
    openEndpoints: [target],
    activeEndpointId: target.id,
    activeEndpoint: target,
    endpointDrafts: nextDrafts,
    endpointResponses: nextResponses,
  };
}

/**
 * Closes all open tabs.
 */
export function closeAllEndpointsInTabs(): TabState {
  return {
    openEndpoints: [],
    activeEndpointId: null,
    activeEndpoint: null,
    endpointDrafts: {},
    endpointResponses: {},
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
    ...state,
    openEndpoints: nextOpen,
    activeEndpointId: state.activeEndpointId,
    activeEndpoint: state.activeEndpointId === updated.id ? updated : state.activeEndpoint,
  };
}

/**
 * Records or updates an unsaved draft for a specific endpoint.
 */
export function setEndpointDraftInState(
  state: TabState,
  endpointId: string,
  draft: Record<string, any>
): TabState {
  return {
    ...state,
    endpointDrafts: {
      ...(state.endpointDrafts || {}),
      [endpointId]: draft,
    },
  };
}

/**
 * Clears an unsaved draft (e.g. after successful save).
 */
export function clearEndpointDraftInState(
  state: TabState,
  endpointId: string
): TabState {
  const nextDrafts = { ...(state.endpointDrafts || {}) };
  delete nextDrafts[endpointId];
  return {
    ...state,
    endpointDrafts: nextDrafts,
  };
}

/**
 * Determines whether an open tab has unsaved changes.
 */
export function isEndpointDirtyInState(state: TabState, endpointId: string): boolean {
  const ep =
    state.openEndpoints.find((e) => e.id === endpointId) ||
    (state.activeEndpointId === endpointId ? state.activeEndpoint : null);
  if (!ep) return false;
  const draft = state.endpointDrafts?.[endpointId];
  return isConfigDirty(ep.config, draft);
}

/**
 * Returns the adjacent endpoint when navigating left ('prev') or right ('next').
 * Returns null if no adjacent tab exists in that direction.
 * ponytail: clamp at ends without cycle wrap; avoids accidental wraparound during rapid navigation.
 */
export function getAdjacentEndpoint(
  openEndpoints: Endpoint[],
  activeEndpointId: string | null,
  direction: 'prev' | 'next'
): Endpoint | null {
  if (openEndpoints.length === 0) return null;
  const currentIndex = openEndpoints.findIndex((e) => e.id === activeEndpointId);
  if (currentIndex === -1) {
    return openEndpoints[0];
  }
  const nextIndex =
    direction === 'prev'
      ? Math.max(0, currentIndex - 1)
      : Math.min(openEndpoints.length - 1, currentIndex + 1);

  if (nextIndex === currentIndex) return null;
  return openEndpoints[nextIndex];
}

export function setEndpointResponseInState(
  state: TabState,
  endpointId: string,
  responseUpdate: Partial<TabResponseData>
): TabState {
  const current = state.endpointResponses?.[endpointId] || {};
  return {
    ...state,
    endpointResponses: {
      ...(state.endpointResponses || {}),
      [endpointId]: {
        ...current,
        ...responseUpdate,
      },
    },
  };
}

export function getEndpointResponseFromState(
  state: TabState,
  endpointId: string | null
): TabResponseData | null {
  if (!endpointId || !state.endpointResponses) return null;
  return state.endpointResponses[endpointId] || null;
}
