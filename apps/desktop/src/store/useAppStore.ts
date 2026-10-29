import { create } from 'zustand';
import type {
  UserSummary,
  WorkspaceSummary,
  Endpoint,
  HttpExecutionResponse,
  GrpcExecutionResponse,
  PresenceUser,
} from '@api-lab/api-types';
import { getAuthToken, setAuthToken, apiRequest } from '../api/client';
import { applyTheme, getThemeById, DEFAULT_THEME_ID } from '../utils/theme';
import { cancelNativeGrpcStream } from '../api/native';
import {
  openEndpointInTabs,
  closeEndpointInTabs,
  closeOtherEndpointsInTabs,
  closeAllEndpointsInTabs,
  updateEndpointInTabs,
  setEndpointDraftInState,
  clearEndpointDraftInState,
  isEndpointDirtyInState,
  switchWorkspaceTabs,
  removeWorkspaceTabs,
  type TabResponseData,
  type WorkspaceTabMap,
} from '../utils/tabManager';
import {
  recordPaletteAction,
  loadPaletteRecency,
  savePaletteRecency,
} from '../utils/shortcuts';
import {
  getStoredWorkspaceEnvironment,
  setStoredWorkspaceEnvironment,
  removeStoredWorkspaceEnvironment,
  NO_ENVIRONMENT_VALUE,
} from '../utils/environmentDropdown';
import type { ExecutedRequestMeta } from '../utils/responseViewerUtils';

export interface StreamMessageItem {
  id: string;
  timestamp: string;
  direction: 'in' | 'out';
  payload: any;
}

interface AppState {
  token: string | null;
  user: UserSummary | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  activeWorkspaceRole: 'admin' | 'developer' | null;
  workspaceTabs: WorkspaceTabMap;

  activeEnvironmentId: string | null;

  openEndpoints: Endpoint[];
  activeEndpointId: string | null;
  activeEndpoint: Endpoint | null;
  endpointDrafts: Record<string, Record<string, any>>;
  endpointResponses: Record<string, TabResponseData>;
  openEndpoint: (endpoint: Endpoint) => void;
  closeEndpoint: (endpointId: string) => void;
  closeOtherEndpoints: (endpointId: string) => void;
  closeAllEndpoints: () => void;
  setEndpointDraft: (endpointId: string, draft: Record<string, any>) => void;
  clearEndpointDraft: (endpointId: string) => void;
  isEndpointDirty: (endpointId: string) => boolean;

  lastHttpResponse: HttpExecutionResponse | null;
  lastGrpcResponse: GrpcExecutionResponse | null;
  httpResponses: Record<string, HttpExecutionResponse>;
  grpcResponses: Record<string, GrpcExecutionResponse>;
  executedRequests: Record<string, ExecutedRequestMeta>;
  executingEndpoints: Record<string, { startTime: number }>;
  setEndpointExecuting: (endpointId: string, executing: boolean) => void;
  setExecutedRequest: (endpointId: string, meta: ExecutedRequestMeta) => void;
  getExecutedRequest: (endpointId: string) => ExecutedRequestMeta | null;

  // Presence & Online Users
  onlineUsers: PresenceUser[];
  setOnlineUsers: (users: PresenceUser[]) => void;
  addOnlineUser: (user: PresenceUser) => void;
  removeOnlineUser: (userId: string) => void;

  // Streaming state
  isStreaming: boolean;
  activeStreamId: string | null;
  streamingEndpointId: string | null;
  streamMessages: StreamMessageItem[];
  backendUnavailable: boolean;
  setBackendUnavailable: (unavailable: boolean) => void;
  setIsStreaming: (
    isStreaming: boolean,
    streamId?: string | null,
    endpointId?: string | null
  ) => void;
  addStreamMessage: (msg: any, direction?: 'in' | 'out') => void;
  clearStreamMessages: () => void;
  stopStreaming: () => Promise<void>;

  // Modals
  appSettingsOpen: boolean;
  appSettingsTab: 'profile' | 'appearance' | 'general' | 'shortcuts';
  setAppSettingsOpen: (open: boolean) => void;
  setAppSettingsTab: (tab: 'profile' | 'appearance' | 'general' | 'shortcuts') => void;
  authModalOpen: boolean;
  authModalTab: 'login' | 'register' | 'forgot' | 'reset';
  envModalOpen: boolean;
  membersModalOpen: boolean;
  membersModalTab: 'general' | 'members';
  workspaceModalOpen: boolean;
  workspaceDropdownOpen: boolean;
  commandPaletteOpen: boolean;
  shortcutsHelpOpen: boolean;
  themeModalOpen: boolean;
  activeThemeId: string;
  setThemeModalOpen: (open: boolean) => void;
  setTheme: (themeId: string) => void;
  editVariableModal: {
    isOpen: boolean;
    key: string;
    value?: string;
    isSensitive?: boolean;
    variableId?: string;
    environmentId?: string;
    environmentName?: string;
  } | null;
  reflectionSettingsModal: {
    isOpen: boolean;
    folderId: string;
    collectionId: string;
  } | null;
  swaggerSettingsModal: {
    isOpen: boolean;
    folderId: string;
    collectionId: string;
  } | null;
  folderSettingsModal: {
    isOpen: boolean;
    folderId: string;
    collectionId: string;
    initialTab?: 'general' | 'auth';
  } | null;
  collectionSettingsModal: {
    isOpen: boolean;
    collectionId: string;
    initialTab?: 'general' | 'auth' | 'headers';
  } | null;
  revealedFolderId: string | null;

  setAuth: (token: string, user: UserSummary, workspace?: WorkspaceSummary) => void;
  logout: () => void;
  setWorkspaces: (workspaces: WorkspaceSummary[]) => void;
  setActiveWorkspaceId: (id: string | null) => void;
  removeWorkspaceTabState: (workspaceId: string) => void;
  setActiveEnvironmentId: (id: string | null) => void;
  setActiveEndpoint: (endpoint: Endpoint | null) => void;
  setLastHttpResponse: (res: HttpExecutionResponse | null, endpointId?: string) => void;
  setLastGrpcResponse: (res: GrpcExecutionResponse | null, endpointId?: string) => void;
  getHttpResponse: (endpointId: string) => HttpExecutionResponse | null;
  getGrpcResponse: (endpointId: string) => GrpcExecutionResponse | null;

  openAuthModal: (tab?: 'login' | 'register' | 'forgot' | 'reset') => void;
  closeAuthModal: () => void;
  setEnvModalOpen: (open: boolean) => void;
  setMembersModalOpen: (open: boolean, tab?: 'general' | 'members') => void;
  setMembersModalTab: (tab: 'general' | 'members') => void;
  setWorkspaceModalOpen: (open: boolean) => void;
  setWorkspaceDropdownOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setShortcutsHelpOpen: (open: boolean) => void;
  openEditVariableModal: (params: {
    key: string;
    value?: string;
    isSensitive?: boolean;
    variableId?: string;
    environmentId?: string;
    environmentName?: string;
  }) => void;
  closeEditVariableModal: () => void;
  openReflectionSettingsModal: (folderId: string, collectionId: string) => void;
  closeReflectionSettingsModal: () => void;
  openSwaggerSettingsModal: (folderId: string, collectionId: string) => void;
  closeSwaggerSettingsModal: () => void;
  openFolderSettingsModal: (folderId: string, collectionId: string, initialTab?: 'general' | 'auth') => void;
  closeFolderSettingsModal: () => void;
  openCollectionSettingsModal: (collectionId: string, initialTab?: 'general' | 'auth' | 'headers') => void;
  closeCollectionSettingsModal: () => void;
  revealFolder: (folderId: string) => void;
  clearRevealedFolder: () => void;
}

const initialTheme =
  typeof window !== 'undefined'
    ? localStorage.getItem('api-lab-theme') || DEFAULT_THEME_ID
    : DEFAULT_THEME_ID;

if (typeof window !== 'undefined') {
  applyTheme(getThemeById(initialTheme));
}

export const useAppStore = create<AppState>((set, get) => ({
  token: getAuthToken(),
  user: null,
  activeThemeId: initialTheme,
  onlineUsers: [],
  setOnlineUsers: (users) => set({ onlineUsers: users }),
  addOnlineUser: (user) =>
    set((state) => ({
      onlineUsers: [...state.onlineUsers.filter((u) => u.user_id !== user.user_id), user],
    })),
  removeOnlineUser: (userId) =>
    set((state) => ({
      onlineUsers: state.onlineUsers.filter((u) => u.user_id !== userId),
    })),
  appSettingsOpen: false,
  appSettingsTab: 'profile',
  setAppSettingsOpen: (open: boolean) => set({ appSettingsOpen: open }),
  setAppSettingsTab: (tab) => set({ appSettingsTab: tab }),
  themeModalOpen: false,
  setThemeModalOpen: (open: boolean) => set({ themeModalOpen: open }),
  setTheme: (themeId: string) => {
    applyTheme(getThemeById(themeId));
    if (typeof window !== 'undefined') {
      localStorage.setItem('api-lab-theme', themeId);
    }
    set((state) => ({
      activeThemeId: themeId,
      user: state.user ? { ...state.user, theme: themeId } : null,
    }));
    const token = get().token;
    if (token) {
      apiRequest('/auth/theme', {
        method: 'PATCH',
        body: JSON.stringify({ theme: themeId }),
      }).catch((err) => {
        console.error('Failed to sync theme with backend:', err);
      });
    }
  },
  workspaces: [],
  activeWorkspaceId: null,
  activeWorkspaceRole: null,
  workspaceTabs: {},

  activeEnvironmentId: typeof window !== 'undefined' ? localStorage.getItem('api_lab_active_environment_id') : null,

  openEndpoints: [],
  activeEndpointId: null,
  activeEndpoint: null,
  endpointDrafts: {},
  endpointResponses: {},

  lastHttpResponse: null,
  lastGrpcResponse: null,
  httpResponses: {},
  grpcResponses: {},
  executedRequests: {},
  setExecutedRequest: (endpointId, meta) =>
    set((state) => ({
      executedRequests: {
        ...state.executedRequests,
        [endpointId]: meta,
      },
    })),
  getExecutedRequest: (endpointId) => get().executedRequests[endpointId] || null,
  executingEndpoints: {},
  setEndpointExecuting: (endpointId, executing) =>
    set((state) => {
      const next = { ...state.executingEndpoints };
      if (executing) {
        next[endpointId] = { startTime: Date.now() };
      } else {
        delete next[endpointId];
      }
      return { executingEndpoints: next };
    }),

  isStreaming: false,
  activeStreamId: null,
  streamingEndpointId: null,
  streamMessages: [],
  backendUnavailable: false,
  setBackendUnavailable: (unavailable) => set({ backendUnavailable: unavailable }),
  setIsStreaming: (isStreaming, streamId = null, endpointId = null) =>
    set({
      isStreaming,
      activeStreamId: streamId,
      streamingEndpointId: isStreaming ? endpointId : null,
    }),
  addStreamMessage: (msg, direction = 'in') =>
    set((state) => {
      const targetEpId = state.streamingEndpointId || state.activeEndpointId;
      const newMsg: StreamMessageItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        direction,
        payload: msg,
      };
      const nextResponses = { ...(state.endpointResponses || {}) };
      if (targetEpId) {
        const epResp = nextResponses[targetEpId] || {};
        nextResponses[targetEpId] = {
          ...epResp,
          streamMessages: [newMsg, ...(epResp.streamMessages || [])],
        };
      }
      return {
        endpointResponses: nextResponses,
        streamMessages:
          !targetEpId || targetEpId === state.activeEndpointId
            ? [newMsg, ...state.streamMessages]
            : state.streamMessages,
      };
    }),
  clearStreamMessages: () =>
    set((state) => {
      const activeId = state.activeEndpointId;
      const nextResponses = { ...(state.endpointResponses || {}) };
      if (activeId && nextResponses[activeId]) {
        nextResponses[activeId] = {
          ...nextResponses[activeId],
          streamMessages: [],
        };
      }
      return {
        endpointResponses: nextResponses,
        streamMessages: [],
      };
    }),
  stopStreaming: async () => {
    const { activeStreamId } = get();
    if (activeStreamId) {
      await cancelNativeGrpcStream(activeStreamId);
    }
    set({
      isStreaming: false,
      activeStreamId: null,
      streamingEndpointId: null,
    });
  },

  authModalOpen: !getAuthToken(),
  authModalTab: 'login',
  envModalOpen: false,
  membersModalOpen: false,
  membersModalTab: 'general',
  workspaceModalOpen: false,

  setAuth: (token, user, workspace) => {
    setAuthToken(token);
    if (user.theme) {
      applyTheme(getThemeById(user.theme));
      if (typeof window !== 'undefined') {
        localStorage.setItem('api-lab-theme', user.theme);
      }
    }
    set((state) => {
      let activeWs = workspace?.id || state.activeWorkspaceId;
      let role = workspace?.role || state.activeWorkspaceRole;
      return {
        token,
        user,
        activeThemeId: user.theme || state.activeThemeId,
        activeWorkspaceId: activeWs,
        activeWorkspaceRole: role,
        authModalOpen: false,
      };
    });
  },

  logout: () => {
    setAuthToken(null);
    set({
      token: null,
      user: null,
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspaceRole: null,
      workspaceTabs: {},
      activeEndpointId: null,
      activeEndpoint: null,
      endpointResponses: {},
      lastHttpResponse: null,
      lastGrpcResponse: null,
      isStreaming: false,
      activeStreamId: null,
      streamMessages: [],
      authModalOpen: true,
      authModalTab: 'login',
    });
  },

  setWorkspaces: (workspaces) => {
    const state = get();
    const current = state.activeWorkspaceId;
    let nextActive = current;
    let role = state.activeWorkspaceRole;

    if (!current || !workspaces.some((w) => w.id === current)) {
      if (workspaces.length > 0) {
        nextActive = workspaces[0].id;
        role = workspaces[0].role;
      } else {
        nextActive = null;
        role = null;
      }
    } else {
      const activeObj = workspaces.find((w) => w.id === current);
      if (activeObj) role = activeObj.role;
    }

    if (nextActive === current) {
      set({ workspaces, activeWorkspaceRole: role });
      return;
    }

    const { workspaceTabs, activeTabState } = switchWorkspaceTabs(
      state.workspaceTabs,
      current,
      {
        openEndpoints: state.openEndpoints,
        activeEndpointId: state.activeEndpointId,
        activeEndpoint: state.activeEndpoint,
        endpointDrafts: state.endpointDrafts,
        endpointResponses: state.endpointResponses,
      },
      nextActive
    );

    const activeEpId = activeTabState.activeEndpointId;
    const targetResp = activeEpId ? activeTabState.endpointResponses?.[activeEpId] : null;

    if (activeEpId) {
      localStorage.setItem('api_lab_active_endpoint_id', activeEpId);
    } else {
      localStorage.removeItem('api_lab_active_endpoint_id');
    }

    const storedEnv = nextActive ? getStoredWorkspaceEnvironment(nextActive) : null;
    const initialEnvId = storedEnv === NO_ENVIRONMENT_VALUE ? null : (storedEnv || null);

    set({
      workspaces,
      activeWorkspaceId: nextActive,
      activeWorkspaceRole: role,
      activeEnvironmentId: initialEnvId,
      workspaceTabs,
      openEndpoints: activeTabState.openEndpoints,
      activeEndpointId: activeTabState.activeEndpointId,
      activeEndpoint: activeTabState.activeEndpoint,
      endpointDrafts: activeTabState.endpointDrafts || {},
      endpointResponses: activeTabState.endpointResponses || {},
      lastHttpResponse: targetResp?.http ?? null,
      lastGrpcResponse: targetResp?.grpc ?? null,
      streamMessages: targetResp?.streamMessages ?? [],
      isStreaming: false,
      activeStreamId: null,
    });
  },

  setActiveWorkspaceId: (id) => {
    const state = get();
    if (state.activeWorkspaceId === id) return;

    const ws = state.workspaces.find((w) => w.id === id);
    const { workspaceTabs, activeTabState } = switchWorkspaceTabs(
      state.workspaceTabs,
      state.activeWorkspaceId,
      {
        openEndpoints: state.openEndpoints,
        activeEndpointId: state.activeEndpointId,
        activeEndpoint: state.activeEndpoint,
        endpointDrafts: state.endpointDrafts,
        endpointResponses: state.endpointResponses,
      },
      id
    );

    const activeEpId = activeTabState.activeEndpointId;
    const targetResp = activeEpId ? activeTabState.endpointResponses?.[activeEpId] : null;

    if (activeEpId) {
      localStorage.setItem('api_lab_active_endpoint_id', activeEpId);
    } else {
      localStorage.removeItem('api_lab_active_endpoint_id');
    }

    const storedEnv = id ? getStoredWorkspaceEnvironment(id) : null;
    const nextEnvId = storedEnv === NO_ENVIRONMENT_VALUE ? null : (storedEnv || null);

    set({
      activeWorkspaceId: id,
      activeWorkspaceRole: ws ? ws.role : null,
      activeEnvironmentId: nextEnvId,
      workspaceTabs,
      openEndpoints: activeTabState.openEndpoints,
      activeEndpointId: activeTabState.activeEndpointId,
      activeEndpoint: activeTabState.activeEndpoint,
      endpointDrafts: activeTabState.endpointDrafts || {},
      endpointResponses: activeTabState.endpointResponses || {},
      lastHttpResponse: targetResp?.http ?? null,
      lastGrpcResponse: targetResp?.grpc ?? null,
      streamMessages: targetResp?.streamMessages ?? [],
      isStreaming: false,
      activeStreamId: null,
    });
  },

  removeWorkspaceTabState: (workspaceId) => {
    removeStoredWorkspaceEnvironment(workspaceId);
    set((state) => ({
      workspaceTabs: removeWorkspaceTabs(state.workspaceTabs, workspaceId),
    }));
  },

  setActiveEnvironmentId: (id) => {
    const wsId = get().activeWorkspaceId;
    if (wsId) {
      setStoredWorkspaceEnvironment(wsId, id);
    }
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('api_lab_active_environment_id', id);
      } else {
        localStorage.removeItem('api_lab_active_environment_id');
      }
    }
    set({ activeEnvironmentId: id });
  },

  openEndpoint: (endpoint) => {
    localStorage.setItem('api_lab_active_endpoint_id', endpoint.id);
    try {
      const recency = loadPaletteRecency();
      const updated = recordPaletteAction(recency, { id: endpoint.id, type: 'endpoint' });
      savePaletteRecency(updated);
    } catch {
      // ignore
    }
    set((state) => {
      const tabState = openEndpointInTabs(
        {
          openEndpoints: state.openEndpoints,
          activeEndpointId: state.activeEndpointId,
          activeEndpoint: state.activeEndpoint,
          endpointDrafts: state.endpointDrafts,
          endpointResponses: state.endpointResponses,
        },
        endpoint
      );

      const targetResp = state.endpointResponses?.[endpoint.id];
      return {
        ...tabState,
        lastHttpResponse: targetResp?.http ?? null,
        lastGrpcResponse: targetResp?.grpc ?? null,
        streamMessages: targetResp?.streamMessages ?? [],
      };
    });
  },

  closeEndpoint: (endpointId) => {
    set((state) => {
      const tabState = closeEndpointInTabs(
        {
          openEndpoints: state.openEndpoints,
          activeEndpointId: state.activeEndpointId,
          activeEndpoint: state.activeEndpoint,
          endpointDrafts: state.endpointDrafts,
          endpointResponses: state.endpointResponses,
        },
        endpointId
      );

      if (tabState.activeEndpointId) {
        localStorage.setItem('api_lab_active_endpoint_id', tabState.activeEndpointId);
      } else {
        localStorage.removeItem('api_lab_active_endpoint_id');
      }

      const nextActiveId = tabState.activeEndpointId;
      const targetResp = nextActiveId ? tabState.endpointResponses?.[nextActiveId] : null;
      return {
        ...tabState,
        lastHttpResponse: targetResp?.http ?? null,
        lastGrpcResponse: targetResp?.grpc ?? null,
        streamMessages: targetResp?.streamMessages ?? [],
      };
    });
  },

  closeOtherEndpoints: (endpointId) => {
    localStorage.setItem('api_lab_active_endpoint_id', endpointId);
    set((state) => {
      const tabState = closeOtherEndpointsInTabs(
        {
          openEndpoints: state.openEndpoints,
          activeEndpointId: state.activeEndpointId,
          activeEndpoint: state.activeEndpoint,
          endpointDrafts: state.endpointDrafts,
          endpointResponses: state.endpointResponses,
        },
        endpointId
      );

      const targetResp = tabState.endpointResponses?.[endpointId];
      return {
        ...tabState,
        lastHttpResponse: targetResp?.http ?? null,
        lastGrpcResponse: targetResp?.grpc ?? null,
        streamMessages: targetResp?.streamMessages ?? [],
      };
    });
  },

  closeAllEndpoints: () => {
    localStorage.removeItem('api_lab_active_endpoint_id');
    set({
      ...closeAllEndpointsInTabs(),
      lastHttpResponse: null,
      lastGrpcResponse: null,
      streamMessages: [],
    });
  },

  setEndpointDraft: (endpointId, draft) => {
    set((state) =>
      setEndpointDraftInState(
        {
          openEndpoints: state.openEndpoints,
          activeEndpointId: state.activeEndpointId,
          activeEndpoint: state.activeEndpoint,
          endpointDrafts: state.endpointDrafts,
        },
        endpointId,
        draft
      )
    );
  },

  clearEndpointDraft: (endpointId) => {
    set((state) =>
      clearEndpointDraftInState(
        {
          openEndpoints: state.openEndpoints,
          activeEndpointId: state.activeEndpointId,
          activeEndpoint: state.activeEndpoint,
          endpointDrafts: state.endpointDrafts,
        },
        endpointId
      )
    );
  },

  isEndpointDirty: (endpointId) => {
    const state = get();
    return isEndpointDirtyInState(
      {
        openEndpoints: state.openEndpoints,
        activeEndpointId: state.activeEndpointId,
        activeEndpoint: state.activeEndpoint,
        endpointDrafts: state.endpointDrafts,
      },
      endpointId
    );
  },

  setActiveEndpoint: (endpoint) => {
    if (!endpoint) {
      localStorage.removeItem('api_lab_active_endpoint_id');
      set({
        activeEndpoint: null,
        activeEndpointId: null,
        lastHttpResponse: null,
        lastGrpcResponse: null,
        streamMessages: [],
      });
      return;
    }
    const state = get();
    if (state.activeEndpointId === endpoint.id) {
      // Update endpoint metadata/config in place
      set((s) => ({
        ...updateEndpointInTabs(
          {
            openEndpoints: s.openEndpoints,
            activeEndpointId: s.activeEndpointId,
            activeEndpoint: s.activeEndpoint,
            endpointDrafts: s.endpointDrafts,
            endpointResponses: s.endpointResponses,
          },
          endpoint
        ),
      }));
      return;
    }
    state.openEndpoint(endpoint);
  },

  setLastHttpResponse: (res, endpointId = get().activeEndpointId || '') => set((state) => ({
    lastHttpResponse: res,
    httpResponses: endpointId ? { ...state.httpResponses, ...(res ? { [endpointId]: res } : {}) } : state.httpResponses,
  })),
  setLastGrpcResponse: (res, endpointId = get().activeEndpointId || '') => set((state) => ({
    lastGrpcResponse: res,
    grpcResponses: endpointId ? { ...state.grpcResponses, ...(res ? { [endpointId]: res } : {}) } : state.grpcResponses,
  })),
  getHttpResponse: (endpointId) => get().httpResponses[endpointId] || null,
  getGrpcResponse: (endpointId) => get().grpcResponses[endpointId] || null,

  openAuthModal: (tab = 'login') => set({ authModalOpen: true, authModalTab: tab }),
  closeAuthModal: () => set({ authModalOpen: false }),
  setEnvModalOpen: (open) => set({ envModalOpen: open }),
  setMembersModalOpen: (open, tab) =>
    set((state) => ({
      membersModalOpen: open,
      membersModalTab: tab !== undefined ? tab : (open ? state.membersModalTab : 'general'),
    })),
  setMembersModalTab: (tab) => set({ membersModalTab: tab }),
  setWorkspaceModalOpen: (open) => set({ workspaceModalOpen: open }),
  workspaceDropdownOpen: false,
  setWorkspaceDropdownOpen: (open) => set({ workspaceDropdownOpen: open }),
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  shortcutsHelpOpen: false,
  setShortcutsHelpOpen: (open) => set({ shortcutsHelpOpen: open }),
  editVariableModal: null,
  openEditVariableModal: (params) =>
    set({
      editVariableModal: {
        isOpen: true,
        ...params,
      },
    }),
  closeEditVariableModal: () => set({ editVariableModal: null }),
  reflectionSettingsModal: null,
  openReflectionSettingsModal: (folderId, collectionId) =>
    set({
      reflectionSettingsModal: {
        isOpen: true,
        folderId,
        collectionId,
      },
    }),
  closeReflectionSettingsModal: () => set({ reflectionSettingsModal: null }),
  swaggerSettingsModal: null,
  openSwaggerSettingsModal: (folderId: string, collectionId: string) =>
    set({
      swaggerSettingsModal: {
        isOpen: true,
        folderId,
        collectionId,
      },
    }),
  closeSwaggerSettingsModal: () => set({ swaggerSettingsModal: null }),
  folderSettingsModal: null,
  openFolderSettingsModal: (folderId: string, collectionId: string, initialTab?: 'general' | 'auth') =>
    set({
      folderSettingsModal: {
        isOpen: true,
        folderId,
        collectionId,
        initialTab,
      },
    }),
  closeFolderSettingsModal: () => set({ folderSettingsModal: null }),
  collectionSettingsModal: null,
  openCollectionSettingsModal: (collectionId: string, initialTab?: 'general' | 'auth' | 'headers') =>
    set({
      collectionSettingsModal: {
        isOpen: true,
        collectionId,
        initialTab,
      },
    }),
  closeCollectionSettingsModal: () => set({ collectionSettingsModal: null }),
  revealedFolderId: null,
  revealFolder: (folderId: string) => set({ revealedFolderId: folderId }),
  clearRevealedFolder: () => set({ revealedFolderId: null }),
}));
