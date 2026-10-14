import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from './store/useAppStore';
import { apiRequest } from './api/client';
import { useWorkspaceSync } from './hooks/useWorkspaceSync';
import { Sidebar } from './components/sidebar/Sidebar';
import { EndpointTabBar } from './components/request/EndpointTabBar';
import { HttpRequestEditor } from './components/request/HttpRequestEditor';
import { GrpcRequestEditor } from './components/request/GrpcRequestEditor';
import { ResponseViewer } from './components/response/ResponseViewer';
import { AuthModal } from './components/auth/AuthModal';
import { EnvironmentModal } from './components/environments/EnvironmentModal';
import { MembersModal } from './components/members/MembersModal';
import { CommandPaletteModal } from './components/common/CommandPaletteModal';
import { ShortcutsHelpModal } from './components/common/ShortcutsHelpModal';
import { matchesShortcut } from './utils/shortcuts';
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
    activeEndpointId,
    closeEndpoint,
    closeOtherEndpoints,
    closeAllEndpoints,
    openAuthModal,
    envModalOpen,
    setEnvModalOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    shortcutsHelpOpen,
    setShortcutsHelpOpen,
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

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Open / Toggle Command Palette (Ctrl + K)
      if (matchesShortcut(e, 'open_command')) {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      // 2. Open / Toggle Shortcuts Help (Ctrl + /)
      else if (matchesShortcut(e, 'open_shortcuts')) {
        e.preventDefault();
        setShortcutsHelpOpen(!shortcutsHelpOpen);
      }
      // 3. Open / Toggle Environments (Ctrl + E)
      else if (matchesShortcut(e, 'open_environment')) {
        e.preventDefault();
        setEnvModalOpen(!envModalOpen);
      }
      // 4. Close Active Tab (Ctrl + W) - force close even if unsaved
      else if (matchesShortcut(e, 'close_tab')) {
        e.preventDefault();
        if (activeEndpointId) {
          closeEndpoint(activeEndpointId);
        }
      }
      // 5. Close All Other Tabs (Ctrl + Alt + T) - force close
      else if (matchesShortcut(e, 'close_other_tabs')) {
        e.preventDefault();
        if (activeEndpointId) {
          closeOtherEndpoints(activeEndpointId);
        }
      }
      // 6. Close All Tabs (Ctrl + Shift + W) - force close
      else if (matchesShortcut(e, 'close_all_tabs')) {
        e.preventDefault();
        closeAllEndpoints();
      }
      // 7. Escape closes any active top modal
      else if (matchesShortcut(e, 'escape')) {
        if (commandPaletteOpen) {
          e.preventDefault();
          setCommandPaletteOpen(false);
        } else if (shortcutsHelpOpen) {
          e.preventDefault();
          setShortcutsHelpOpen(false);
        } else if (envModalOpen) {
          e.preventDefault();
          setEnvModalOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    commandPaletteOpen,
    shortcutsHelpOpen,
    envModalOpen,
    activeEndpointId,
    setCommandPaletteOpen,
    setShortcutsHelpOpen,
    setEnvModalOpen,
    closeEndpoint,
    closeOtherEndpoints,
    closeAllEndpoints,
  ]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* Modals */}
      <AuthModal />
      <EnvironmentModal />
      <MembersModal />
      <CommandPaletteModal />
      <ShortcutsHelpModal />

      {/* 3-Panel Layout */}
      {/* Panel 1: Left Sidebar */}
      <Sidebar />

      {/* Panel 2: Request Editor with Multi-Tab Bar on top */}
      <div className="flex-1 flex flex-col min-w-0 h-screen bg-zinc-950 border-r border-zinc-800 overflow-hidden">
        <EndpointTabBar />
        {activeEndpoint ? (
          activeEndpoint.protocol === 'http' ? (
            <HttpRequestEditor key={activeEndpoint.id} endpoint={activeEndpoint} />
          ) : (
            <GrpcRequestEditor key={activeEndpoint.id} endpoint={activeEndpoint} />
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-8 text-center select-none">
            <Layers size={40} className="text-zinc-700 mb-3" />
            <h3 className="text-sm font-semibold text-zinc-400">No Endpoint Selected</h3>
            <p className="text-xs text-zinc-600 max-w-sm mt-1">
              Select an endpoint from the collection tree on the left, or create a new HTTP or gRPC request to start testing.
            </p>
          </div>
        )}
      </div>

      {/* Panel 3: Response Panel */}
      {activeEndpoint ? (
        <ResponseViewer key={activeEndpoint.id} endpoint={activeEndpoint} />
      ) : (
        <div className="w-96 bg-zinc-950 flex items-center justify-center text-zinc-700 text-xs">
          Response viewer idle
        </div>
      )}
    </div>
  );
};
