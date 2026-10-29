import type { Endpoint } from '@api-lab/api-types';
import { splitUrlQuery } from './httpRequest.ts';
import { convertSwaggerPathToApiPath } from './pathVariables.ts';
import { shouldAutoDetectTls } from './grpcReflectionGenerator.ts';

export interface TabResponseData {
  http?: any;
  grpc?: any;
  streamMessages?: any[];
}

/**
 * Standard layout height and border tokens for workbench tab bar and sidebar brand alignment.
 */
export const WORKBENCH_TAB_BAR_HEIGHT_CLASS = 'h-9';
export const WORKBENCH_HEADER_BORDER_CLASS = 'border-zinc-800/80';

export interface TabState {
  openEndpoints: Endpoint[];
  activeEndpointId: string | null;
  activeEndpoint: Endpoint | null;
  endpointDrafts?: Record<string, Record<string, any>>;
  endpointResponses?: Record<string, TabResponseData>;
}

/**
 * Checks if a working draft has unsaved changes compared to the base saved config.
 * Normalizes protocol defaults, Swagger/URL path variables, query string formats,
 * and empty payload/auth representations to prevent false-positive dirty states.
 */
export function isConfigDirty(
  base: Record<string, any> | undefined | null,
  draft: Record<string, any> | undefined | null
): boolean {
  if (!draft) return false;
  const b = base || {};

  const isGrpc = Boolean(
    b.protocol === 'grpc' ||
    draft.protocol === 'grpc' ||
    b.server_address !== undefined ||
    draft.server_address !== undefined ||
    b.service !== undefined ||
    draft.service !== undefined
  );

  const normalize = (cfg: Record<string, any>) => {
    // 1. URL & query params normalization
    const rawUrl = convertSwaggerPathToApiPath((cfg.url || '').trim());
    const split = splitUrlQuery(rawUrl);
    const cleanUrl = split.url.trim();

    // Collect query params from both cfg.query_params and any URL query string
    const normalizedQueryParams: Array<[string, string, string, boolean]> = [];
    const rawQueryParams: Array<any> = Array.isArray(cfg.query_params) ? cfg.query_params : [];
    for (const item of rawQueryParams) {
      if (Array.isArray(item)) {
        const k = String(item[0] || '').trim();
        if (k) {
          const v = item[1] !== undefined && item[1] !== null ? String(item[1]).trim() : '';
          const d = item[2] !== undefined && item[2] !== null ? String(item[2]).trim() : '';
          const enabled = item[3] !== false;
          normalizedQueryParams.push([k, v, d, enabled]);
        }
      }
    }
    if (normalizedQueryParams.length === 0) {
      for (const [k, v] of split.params) {
        const trimmedKey = k.trim();
        if (trimmedKey) {
          normalizedQueryParams.push([trimmedKey, (v || '').trim(), '', true]);
        }
      }
    }
    normalizedQueryParams.sort(([aKey, aVal], [bKey, bVal]) => (aKey + aVal).localeCompare(bKey + bVal));

    // 2. Path variables: filter out empty placeholders (empty value and empty description)
    // ponytail: ignore unedited path placeholders so auto-extracted URL keys don't mark clean endpoints dirty
    const rawPathVars: Array<any> = Array.isArray(cfg.path_variables) ? cfg.path_variables : [];
    const normalizedPathVars = rawPathVars
      .filter((item) => Array.isArray(item) && String(item[0] || '').trim())
      .map((item) => [
        String(item[0] || '').trim(),
        item[1] !== undefined && item[1] !== null ? String(item[1]).trim() : '',
        item[2] !== undefined && item[2] !== null ? String(item[2]).trim() : '',
        item[3] !== false,
      ])
      .filter(([_, v, d, enabled]) => v !== '' || d !== '' || !enabled)
      .sort(([a], [b]) => (a as string).localeCompare(b as string));

    // 3. Headers & Descriptions
    const rawHeadersList: Array<any> = Array.isArray(cfg.headers_list) ? cfg.headers_list : [];
    const headersListMap = new Map<string, boolean>();
    for (const item of rawHeadersList) {
      if (Array.isArray(item)) {
        const k = String(item[0] || '').trim();
        if (k) headersListMap.set(k, item[3] !== false);
      }
    }
    const disabledHeaders = cfg.header_disabled || {};
    const headers = Object.entries(cfg.headers || {})
      .map(([k, v]) => {
        const trimmedKey = k.trim();
        const enabled = headersListMap.has(trimmedKey)
          ? headersListMap.get(trimmedKey)!
          : !disabledHeaders[trimmedKey];
        return [trimmedKey, typeof v === 'string' ? v.trim() : String(v ?? ''), enabled];
      })
      .filter(([k]) => Boolean(k))
      .sort(([k1], [k2]) => (k1 as string).localeCompare(k2 as string));

    const headerDescriptions = Object.entries(cfg.header_descriptions || {})
      .map(([k, v]) => [k.trim(), typeof v === 'string' ? v.trim() : String(v ?? '')])
      .filter(([k, v]) => Boolean(k) && Boolean(v))
      .sort(([k1], [k2]) => k1.localeCompare(k2));

    // 4. Metadata & Descriptions (gRPC)
    const rawAuth = cfg.auth;
    const hasAuthToken = rawAuth && (rawAuth.auth_type === 'bearer' || rawAuth.auth_type === 'custom');
    const rawMetadataList: Array<any> = Array.isArray(cfg.metadata_list) ? cfg.metadata_list : [];
    const metadataListMap = new Map<string, boolean>();
    for (const item of rawMetadataList) {
      if (Array.isArray(item)) {
        const k = String(item[0] || '').trim();
        if (k) metadataListMap.set(k, item[3] !== false);
      }
    }
    const disabledMetadata = cfg.metadata_disabled || {};
    const metadata = Object.entries(cfg.metadata || {})
      .map(([k, v]) => {
        const trimmedKey = k.trim();
        const enabled = metadataListMap.has(trimmedKey)
          ? metadataListMap.get(trimmedKey)!
          : !disabledMetadata[trimmedKey];
        return [trimmedKey, typeof v === 'string' ? v.trim() : String(v ?? ''), enabled];
      })
      .filter(([k]) => {
        if (!k) return false;
        // Ignore derived authorization header in metadata if auth object is configured
        if (hasAuthToken && (k as string).toLowerCase() === 'authorization') return false;
        return true;
      })
      .sort(([k1], [k2]) => (k1 as string).localeCompare(k2 as string));

    const metadataDescriptions = Object.entries(cfg.metadata_descriptions || {})
      .map(([k, v]) => [k.trim(), typeof v === 'string' ? v.trim() : String(v ?? '')])
      .filter(([k, v]) => Boolean(k) && Boolean(v))
      .sort(([k1], [k2]) => k1.localeCompare(k2));

    // 5. Auth normalization
    const defaultAuthType = isGrpc ? 'inherit' : 'none';
    const authType = rawAuth?.auth_type || defaultAuthType;
    let normalizedAuth: Record<string, string> = { auth_type: authType };
    if (authType === 'bearer') {
      normalizedAuth = { auth_type: 'bearer', token: (rawAuth.token || '').trim() };
    } else if (authType === 'basic') {
      normalizedAuth = {
        auth_type: 'basic',
        username: (rawAuth.username || '').trim(),
        password: (rawAuth.password || '').trim(),
      };
    } else if (authType === 'custom') {
      normalizedAuth = {
        auth_type: 'custom',
        header_name: (rawAuth.header_name || '').trim(),
        header_value: (rawAuth.header_value || '').trim(),
      };
    } else if (authType === 'inherit') {
      normalizedAuth = { auth_type: 'inherit' };
    } else {
      normalizedAuth = { auth_type: 'none' };
    }

    // 6. Payload normalization (empty protobuf message / json / string)
    let normalizedPayload = '';
    if (cfg.payload !== undefined && cfg.payload !== null) {
      if (typeof cfg.payload === 'string') {
        const trimmed = cfg.payload.trim();
        if (trimmed && trimmed !== '{}' && trimmed !== '{\n  \n}') {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length === 0) {
              normalizedPayload = '';
            } else {
              normalizedPayload = JSON.stringify(parsed);
            }
          } catch {
            normalizedPayload = trimmed;
          }
        }
      } else if (typeof cfg.payload === 'object') {
        if (Object.keys(cfg.payload).length > 0) {
          normalizedPayload = JSON.stringify(cfg.payload);
        }
      }
    }

    return {
      method: cfg.method || (isGrpc ? '' : 'GET'),
      url: cleanUrl,
      server_address: (cfg.server_address || '').trim(),
      use_tls: cfg.use_tls !== undefined ? Boolean(cfg.use_tls) : (isGrpc ? shouldAutoDetectTls(cfg.server_address || '') : false),
      service: (cfg.service || '').trim(),
      stream_type: cfg.stream_type || 'unary',
      authority_override: (cfg.authority_override || '').trim(),
      timeout_seconds: cfg.timeout_seconds !== undefined && cfg.timeout_seconds !== null ? Number(cfg.timeout_seconds) : 30,
      max_msg_size_mb: cfg.max_msg_size_mb !== undefined && cfg.max_msg_size_mb !== null ? Number(cfg.max_msg_size_mb) : 4,
      body_type: cfg.body_type || 'json',
      body: typeof cfg.body === 'string' ? cfg.body.trim() : '',
      payload: normalizedPayload,
      headers,
      header_descriptions: headerDescriptions,
      metadata,
      metadata_descriptions: metadataDescriptions,
      query_params: normalizedQueryParams,
      path_variables: normalizedPathVars,
      auth: normalizedAuth,
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

export type WorkspaceTabMap = Record<string, TabState>;

/**
 * Switches workspace tab state: saves outgoing workspace tab state and restores target workspace state.
 * If target workspace has no stored state, returns clean empty tab state.
 */
export function switchWorkspaceTabs(
  workspaceTabs: WorkspaceTabMap,
  currentWorkspaceId: string | null,
  currentTabState: TabState,
  targetWorkspaceId: string | null,
  storage?: Storage | null
): {
  workspaceTabs: WorkspaceTabMap;
  activeTabState: TabState;
} {
  if (currentWorkspaceId === targetWorkspaceId) {
    return {
      workspaceTabs,
      activeTabState: currentTabState,
    };
  }

  const nextWorkspaceTabs: WorkspaceTabMap = { ...workspaceTabs };

  if (currentWorkspaceId) {
    const outgoingState: TabState = {
      openEndpoints: [...currentTabState.openEndpoints],
      activeEndpointId: currentTabState.activeEndpointId,
      activeEndpoint: currentTabState.activeEndpoint,
      endpointDrafts: { ...(currentTabState.endpointDrafts || {}) },
      endpointResponses: { ...(currentTabState.endpointResponses || {}) },
    };
    nextWorkspaceTabs[currentWorkspaceId] = outgoingState;
    setStoredWorkspaceTabs(currentWorkspaceId, outgoingState, storage);
  }

  let restored = targetWorkspaceId ? nextWorkspaceTabs[targetWorkspaceId] : undefined;
  if (!restored && targetWorkspaceId) {
    const fromStorage = getStoredWorkspaceTabs(targetWorkspaceId, storage);
    if (fromStorage) {
      restored = fromStorage;
      nextWorkspaceTabs[targetWorkspaceId] = fromStorage;
    }
  }

  const activeTabState: TabState = restored
    ? {
        openEndpoints: [...restored.openEndpoints],
        activeEndpointId: restored.activeEndpointId,
        activeEndpoint: restored.activeEndpoint,
        endpointDrafts: { ...(restored.endpointDrafts || {}) },
        endpointResponses: { ...(restored.endpointResponses || {}) },
      }
    : {
        openEndpoints: [],
        activeEndpointId: null,
        activeEndpoint: null,
        endpointDrafts: {},
        endpointResponses: {},
      };

  return {
    workspaceTabs: nextWorkspaceTabs,
    activeTabState,
  };
}

/**
 * Removes tab state for a deleted workspace.
 */
export function removeWorkspaceTabs(
  workspaceTabs: WorkspaceTabMap,
  workspaceId: string,
  storage?: Storage | null
): WorkspaceTabMap {
  removeStoredWorkspaceTabs(workspaceId, storage);
  if (!workspaceTabs[workspaceId]) return workspaceTabs;
  const next = { ...workspaceTabs };
  delete next[workspaceId];
  return next;
}

export const ACTIVE_WORKSPACE_STORAGE_KEY = 'api_lab_active_workspace_id';
export const WORKSPACE_TABS_STORAGE_PREFIX = 'api_lab_workspace_tabs_';

export function getWorkspaceTabsStorageKey(workspaceId: string): string {
  return `${WORKSPACE_TABS_STORAGE_PREFIX}${workspaceId}`;
}

export function getStoredActiveWorkspaceId(storage?: Storage | null): string | null {
  const store = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return null;
  return store.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
}

export function setStoredActiveWorkspaceId(
  workspaceId: string | null,
  storage?: Storage | null
): void {
  const store = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return;
  if (workspaceId) {
    store.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
  } else {
    store.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  }
}

export function removeStoredActiveWorkspaceId(storage?: Storage | null): void {
  const store = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return;
  store.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
}

export interface StoredWorkspaceTabsPayload {
  openEndpoints: Endpoint[];
  activeEndpointId: string | null;
  endpointDrafts?: Record<string, Record<string, any>>;
}

export function getStoredWorkspaceTabs(
  workspaceId: string,
  storage?: Storage | null
): TabState | null {
  if (!workspaceId) return null;
  const store = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return null;

  try {
    const raw = store.getItem(getWorkspaceTabsStorageKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.openEndpoints)) return null;

    const activeEndpointId = typeof parsed.activeEndpointId === 'string' ? parsed.activeEndpointId : null;
    const activeEndpoint = activeEndpointId
      ? parsed.openEndpoints.find((e: Endpoint) => e.id === activeEndpointId) || null
      : null;

    return {
      openEndpoints: parsed.openEndpoints,
      activeEndpointId,
      activeEndpoint,
      endpointDrafts: parsed.endpointDrafts && typeof parsed.endpointDrafts === 'object' ? parsed.endpointDrafts : {},
      endpointResponses: {},
    };
  } catch {
    return null;
  }
}

export function setStoredWorkspaceTabs(
  workspaceId: string,
  tabState: TabState,
  storage?: Storage | null
): void {
  if (!workspaceId) return;
  const store = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return;

  // ponytail: omit responses to stay well clear of 5MB localStorage quota limit
  const payload: StoredWorkspaceTabsPayload = {
    openEndpoints: tabState.openEndpoints,
    activeEndpointId: tabState.activeEndpointId,
    endpointDrafts: tabState.endpointDrafts || {},
  };

  try {
    store.setItem(getWorkspaceTabsStorageKey(workspaceId), JSON.stringify(payload));
  } catch {
    // ignore quota / storage errors
  }
}

export function removeStoredWorkspaceTabs(
  workspaceId: string,
  storage?: Storage | null
): void {
  if (!workspaceId) return;
  const store = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return;
  store.removeItem(getWorkspaceTabsStorageKey(workspaceId));
}
