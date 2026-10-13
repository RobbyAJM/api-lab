import { create } from 'zustand';
import type {
  UserSummary,
  WorkspaceSummary,
  Endpoint,
  HttpExecutionResponse,
  GrpcExecutionResponse,
} from '@api-lab/api-types';
import { getAuthToken, setAuthToken } from '../api/client';

interface AppState {
  token: string | null;
  user: UserSummary | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  activeWorkspaceRole: 'admin' | 'developer' | null;

  activeEnvironmentId: string | null;

  activeEndpointId: string | null;
  activeEndpoint: Endpoint | null;

  lastHttpResponse: HttpExecutionResponse | null;
  lastGrpcResponse: GrpcExecutionResponse | null;

  // Modals
  authModalOpen: boolean;
  authModalTab: 'login' | 'register' | 'forgot' | 'reset';
  envModalOpen: boolean;
  membersModalOpen: boolean;

  setAuth: (token: string, user: UserSummary, workspace?: WorkspaceSummary) => void;
  logout: () => void;
  setWorkspaces: (workspaces: WorkspaceSummary[]) => void;
  setActiveWorkspaceId: (id: string | null) => void;
  setActiveEnvironmentId: (id: string | null) => void;
  setActiveEndpoint: (endpoint: Endpoint | null) => void;
  setLastHttpResponse: (res: HttpExecutionResponse | null) => void;
  setLastGrpcResponse: (res: GrpcExecutionResponse | null) => void;

  openAuthModal: (tab?: 'login' | 'register' | 'forgot' | 'reset') => void;
  closeAuthModal: () => void;
  setEnvModalOpen: (open: boolean) => void;
  setMembersModalOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  token: getAuthToken(),
  user: null,
  workspaces: [],
  activeWorkspaceId: null,
  activeWorkspaceRole: null,

  activeEnvironmentId: null,

  activeEndpointId: null,
  activeEndpoint: null,

  lastHttpResponse: null,
  lastGrpcResponse: null,

  authModalOpen: !getAuthToken(),
  authModalTab: 'login',
  envModalOpen: false,
  membersModalOpen: false,

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
      activeEndpointId: null,
      activeEndpoint: null,
      lastHttpResponse: null,
      lastGrpcResponse: null,
    });
  },

  setActiveEnvironmentId: (id) => set({ activeEnvironmentId: id }),

  setActiveEndpoint: (endpoint) =>
    set({
      activeEndpoint: endpoint,
      activeEndpointId: endpoint ? endpoint.id : null,
      lastHttpResponse: null,
      lastGrpcResponse: null,
    }),

  setLastHttpResponse: (res) => set({ lastHttpResponse: res }),
  setLastGrpcResponse: (res) => set({ lastGrpcResponse: res }),

  openAuthModal: (tab = 'login') => set({ authModalOpen: true, authModalTab: tab }),
  closeAuthModal: () => set({ authModalOpen: false }),
  setEnvModalOpen: (open) => set({ envModalOpen: open }),
  setMembersModalOpen: (open) => set({ membersModalOpen: open }),
}));
