import { create } from 'zustand';
import type {
  UserSummary,
  WorkspaceSummary,
  Endpoint,
  HttpExecutionResponse,
  GrpcExecutionResponse,
} from '@api-lab/api-types';
import { getAuthToken, setAuthToken } from '../api/client';
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
} from '../utils/tabManager';
import {
  recordPaletteAction,
  loadPaletteRecency,
  savePaletteRecency,
} from '../utils/shortcuts';

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

  activeEnvironmentId: string | null;

  openEndpoints: Endpoint[];
  activeEndpointId: string | null;
  activeEndpoint: Endpoint | null;
  endpointDrafts: Record<string, Record<string, any>>;
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

  // Streaming state
  isStreaming: boolean;
  activeStreamId: string | null;
  streamingEndpointId: string | null;
  streamMessages: StreamMessageItem[];
  setIsStreaming: (
    isStreaming: boolean,
    streamId?: string | null,
    endpointId?: string | null
  ) => void;
  addStreamMessage: (msg: any, direction?: 'in' | 'out') => void;
  clearStreamMessages: () => void;
  stopStreaming: () => Promise<void>;

  // Modals
  authModalOpen: boolean;
  authModalTab: 'login' | 'register' | 'forgot' | 'reset';
  envModalOpen: boolean;
  membersModalOpen: boolean;
  workspaceModalOpen: boolean;
  commandPaletteOpen: boolean;
  shortcutsHelpOpen: boolean;
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

  setAuth: (token: string, user: UserSummary, workspace?: WorkspaceSummary) => void;
  logout: () => void;
  setWorkspaces: (workspaces: WorkspaceSummary[]) => void;
  setActiveWorkspaceId: (id: string | null) => void;
  setActiveEnvironmentId: (id: string | null) => void;
  setActiveEndpoint: (endpoint: Endpoint | null) => void;
  setLastHttpResponse: (res: HttpExecutionResponse | null, endpointId?: string) => void;
  setLastGrpcResponse: (res: GrpcExecutionResponse | null, endpointId?: string) => void;
  getHttpResponse: (endpointId: string) => HttpExecutionResponse | null;
  getGrpcResponse: (endpointId: string) => GrpcExecutionResponse | null;

  openAuthModal: (tab?: 'login' | 'register' | 'forgot' | 'reset') => void;
  closeAuthModal: () => void;
  setEnvModalOpen: (open: boolean) => void;
  setMembersModalOpen: (open: boolean) => void;
  setWorkspaceModalOpen: (open: boolean) => void;
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
}

export const useAppStore = create<AppState>((set, get) => ({
  token: getAuthToken(),
  user: null,
  workspaces: [],
  activeWorkspaceId: null,
  activeWorkspaceRole: null,

  activeEnvironmentId: typeof window !== 'undefined' ? localStorage.getItem('api_lab_active_environment_id') : null,

  openEndpoints: [],
  activeEndpointId: null,
  activeEndpoint: null,
  endpointDrafts: {},

  lastHttpResponse: null,
  lastGrpcResponse: null,
  httpResponses: {},
  grpcResponses: {},

  isStreaming: false,
  activeStreamId: null,
  streamingEndpointId: null,
  streamMessages: [],
  setIsStreaming: (isStreaming, streamId = null, endpointId = null) =>
    set({
      isStreaming,
      activeStreamId: streamId,
      streamingEndpointId: isStreaming ? endpointId : null,
    }),
  addStreamMessage: (msg, direction = 'in') =>
    set((state) => ({
      streamMessages: [
        ...state.streamMessages,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toLocaleTimeString(),
          direction,
          payload: msg,
        },
      ],
    })),
  clearStreamMessages: () => set({ streamMessages: [] }),
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
  workspaceModalOpen: false,

  setAuth: (token, user, workspace) => {
    setAuthToken(token);
    set((state) => {
      let activeWs = workspace?.id || state.activeWorkspaceId;
      let role = workspace?.role || state.activeWorkspaceRole;
      return {
        token,
        user,
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
      activeEndpointId: null,
      activeEndpoint: null,
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
    const current = get().activeWorkspaceId;
    let nextActive = current;
    let role = get().activeWorkspaceRole;

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

    set({ workspaces, activeWorkspaceId: nextActive, activeWorkspaceRole: role });
  },

  setActiveWorkspaceId: (id) => {
    const ws = get().workspaces.find((w) => w.id === id);
    set({
      activeWorkspaceId: id,
      activeWorkspaceRole: ws ? ws.role : null,
      openEndpoints: [],
      activeEndpointId: null,
      activeEndpoint: null,
      lastHttpResponse: null,
      lastGrpcResponse: null,
      isStreaming: false,
      activeStreamId: null,
      streamMessages: [],
    });
  },

  setActiveEnvironmentId: (id) => {
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
        },
        endpoint
      );

      const isSameEndpoint = state.activeEndpointId === endpoint.id;
      return {
        ...tabState,
        lastHttpResponse: isSameEndpoint ? state.lastHttpResponse : null,
        lastGrpcResponse: isSameEndpoint ? state.lastGrpcResponse : null,
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
        },
        endpointId
      );

      if (tabState.activeEndpointId) {
        localStorage.setItem('api_lab_active_endpoint_id', tabState.activeEndpointId);
      } else {
        localStorage.removeItem('api_lab_active_endpoint_id');
      }

      const wasActive = state.activeEndpointId === endpointId;
      return {
        ...tabState,
        lastHttpResponse: wasActive ? null : state.lastHttpResponse,
        lastGrpcResponse: wasActive ? null : state.lastGrpcResponse,
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
        },
        endpointId
      );

      const targetChanged = state.activeEndpointId !== endpointId;
      return {
        ...tabState,
        lastHttpResponse: targetChanged ? null : state.lastHttpResponse,
        lastGrpcResponse: targetChanged ? null : state.lastGrpcResponse,
      };
    });
  },

  closeAllEndpoints: () => {
    localStorage.removeItem('api_lab_active_endpoint_id');
    set({
      ...closeAllEndpointsInTabs(),
      lastHttpResponse: null,
      lastGrpcResponse: null,
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
  setMembersModalOpen: (open) => set({ membersModalOpen: open }),
  setWorkspaceModalOpen: (open) => set({ workspaceModalOpen: open }),
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
}));
