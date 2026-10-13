import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from './store/useAppStore';
import { apiRequest } from './api/client';
import { useWorkspaceSync } from './hooks/useWorkspaceSync';
import { Sidebar } from './components/sidebar/Sidebar';
import { HttpRequestEditor } from './components/request/HttpRequestEditor';
import { GrpcRequestEditor } from './components/request/GrpcRequestEditor';
import { ResponseViewer } from './components/response/ResponseViewer';
import { AuthModal } from './components/auth/AuthModal';
import { EnvironmentModal } from './components/environments/EnvironmentModal';
import { MembersModal } from './components/members/MembersModal';
import type { UserSummary, WorkspaceSummary } from '@api-lab/api-types';
import { Layers } from 'lucide-react';

interface MeApiResponse {
  user: UserSummary;
  workspaces: WorkspaceSummary[];
}

export const App: React.FC = () => {
  const {
    token,
    setAuth,
    setWorkspaces,
    activeEndpoint,
    openAuthModal,
  } = useAppStore();

  // Real-time synchronization hook
  useWorkspaceSync();

  // Validate session on boot
  const { data: meData, error: meError } = useQuery<MeApiResponse>({
    queryKey: ['auth_me', token],
    queryFn: () => apiRequest<MeApiResponse>('/auth/me'),
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (meData) {
      setAuth(token!, meData.user);
      setWorkspaces(meData.workspaces);
    }
  }, [meData, token, setAuth, setWorkspaces]);

  useEffect(() => {
    if (meError) {
      openAuthModal('login');
    }
  }, [meError, openAuthModal]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* Modals */}
      <AuthModal />
      <EnvironmentModal />
      <MembersModal />

      {/* 3-Panel Layout */}
      {/* Panel 1: Left Sidebar */}
      <Sidebar />

      {/* Panel 2: Request Editor */}
      {activeEndpoint ? (
        activeEndpoint.protocol === 'http' ? (
          <HttpRequestEditor endpoint={activeEndpoint} />
        ) : (
          <GrpcRequestEditor endpoint={activeEndpoint} />
        )
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center border-r border-zinc-800 text-zinc-500 p-8 text-center select-none">
          <Layers size={40} className="text-zinc-700 mb-3" />
          <h3 className="text-sm font-semibold text-zinc-400">No Endpoint Selected</h3>
          <p className="text-xs text-zinc-600 max-w-sm mt-1">
            Select an endpoint from the collection tree on the left, or create a new HTTP or gRPC request to start testing.
          </p>
        </div>
      )}

      {/* Panel 3: Response Panel */}
      {activeEndpoint ? (
        <ResponseViewer endpoint={activeEndpoint} />
      ) : (
        <div className="w-96 bg-zinc-950 flex items-center justify-center text-zinc-700 text-xs">
          Response viewer idle
        </div>
      )}
    </div>
  );
};
