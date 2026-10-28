import React, { useEffect, useState, useRef } from 'react';
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
import { EditVariableModal } from './components/common/EditVariableModal';
import { ReflectionFolderSettingsModal } from './components/collections/ReflectionFolderSettingsModal';
import { SwaggerFolderSettingsModal } from './components/collections/SwaggerFolderSettingsModal';
import { FolderSettingsModal } from './components/collections/FolderSettingsModal';
import { CollectionSettingsModal } from './components/collections/CollectionSettingsModal';
import { MembersModal } from './components/members/MembersModal';
import { WorkspaceSettingsModal } from './components/workspaces/WorkspaceSettingsModal';
import { CommandPaletteModal } from './components/common/CommandPaletteModal';
import { ShortcutsHelpModal } from './components/common/ShortcutsHelpModal';
import { ThemePickerModal } from './components/common/ThemePickerModal';
import { AppSettingsModal } from './components/settings/AppSettingsModal';
import { TopBar } from './components/topbar/TopBar';
import { BackendUnavailableModal } from './components/common/BackendUnavailableModal';
import { EmptyWorkspaceView } from './components/common/EmptyWorkspaceView';
import { matchesShortcut, getTabNumberFromEvent } from './utils/shortcuts';
import { applyZoom, calculateNextZoom, parseStoredZoom, ZOOM_STORAGE_KEY } from './utils/zoom';
import { getAdjacentEndpoint } from './utils/tabManager';
import { BACKEND_STATUS_EVENT } from './api/client';
import { testServerConnection, getServerUrl } from './utils/serverConfig';
import type { UserSummary, WorkspaceSummary } from '@api-lab/api-types';

interface MeApiResponse {
  user: UserSummary;
  workspaces: WorkspaceSummary[];
}

export const App: React.FC = () => {
  const {
    token,
    setAuth,
    setWorkspaces,
    openEndpoints,
    openEndpoint,
    activeEndpoint,
    activeEndpointId,
    closeEndpoint,
    closeOtherEndpoints,
    closeAllEndpoints,
    openAuthModal,
    envModalOpen,
    setEnvModalOpen,
    membersModalOpen,
    setMembersModalOpen,
    workspaceModalOpen,
    setWorkspaceModalOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    shortcutsHelpOpen,
    setShortcutsHelpOpen,
    themeModalOpen,
    setThemeModalOpen,
    appSettingsOpen,
    setAppSettingsOpen,
    backendUnavailable,
    setBackendUnavailable,
  } = useAppStore();

  // Vertical resizer state between Request & Response
  const [requestHeightPercent, setRequestHeightPercent] = useState<number>(() => {
    const saved = localStorage.getItem('api_lab_request_height_pct');
    return saved ? Math.max(25, Math.min(80, Number(saved))) : 52;
  });
  const [zoomFactor, setZoomFactor] = useState<number>(() => {
    return parseStoredZoom(typeof localStorage !== 'undefined' ? localStorage.getItem(ZOOM_STORAGE_KEY) : null);
  });
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const isResizingVerticalRef = useRef(false);

  const startVerticalResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingVerticalRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingVerticalRef.current) return;
      const container = mainContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = Math.max(25, Math.min(80, ((moveEvent.clientY - rect.top) / rect.height) * 100));
      setRequestHeightPercent(pct);
    };

    const onMouseUp = () => {
      isResizingVerticalRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setRequestHeightPercent((curr) => {
        localStorage.setItem('api_lab_request_height_pct', String(curr));
        return curr;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Real-time synchronization hook
  useWorkspaceSync();

  // Initial backend health check on application boot
  useEffect(() => {
    testServerConnection(getServerUrl()).then((res) => {
      if (!res.ok) {
        setBackendUnavailable(true);
      }
    });
  }, [setBackendUnavailable]);

  // Synchronize backend reachability status across network requests
  useEffect(() => {
    const handleStatus = (e: Event) => {
      const custom = e as CustomEvent<{ unavailable: boolean }>;
      if (custom.detail) {
        setBackendUnavailable(custom.detail.unavailable);
      }
    };
    window.addEventListener(BACKEND_STATUS_EVENT, handleStatus);
    return () => window.removeEventListener(BACKEND_STATUS_EVENT, handleStatus);
  }, [setBackendUnavailable]);

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

  // Initial UI zoom restore
  useEffect(() => {
    void applyZoom(zoomFactor);
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Zoom Controls (Ctrl/Cmd + +, Ctrl/Cmd + -, Ctrl/Cmd + 0)
      if (matchesShortcut(e, 'zoom_in')) {
        e.preventDefault();
        setZoomFactor((curr) => {
          const next = calculateNextZoom(curr, 'in');
          localStorage.setItem(ZOOM_STORAGE_KEY, String(next));
          void applyZoom(next);
          return next;
        });
        return;
      }
      if (matchesShortcut(e, 'zoom_out')) {
        e.preventDefault();
        setZoomFactor((curr) => {
          const next = calculateNextZoom(curr, 'out');
          localStorage.setItem(ZOOM_STORAGE_KEY, String(next));
          void applyZoom(next);
          return next;
        });
        return;
      }
      if (matchesShortcut(e, 'zoom_reset')) {
        e.preventDefault();
        setZoomFactor(() => {
          const next = calculateNextZoom(1.0, 'reset');
          localStorage.setItem(ZOOM_STORAGE_KEY, String(next));
          void applyZoom(next);
          return next;
        });
        return;
      }

      if (backendUnavailable) return;
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
      // Open / Toggle App Settings (Ctrl + ,)
      else if (matchesShortcut(e, 'open_settings')) {
        e.preventDefault();
        setAppSettingsOpen(!appSettingsOpen);
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
      // 7. Tab Navigation: Ctrl + 1..9 (switch tab by number)
      else if (!e.shiftKey && !e.altKey && (e.ctrlKey || e.metaKey) && getTabNumberFromEvent(e) !== null) {
        const tabIdx = getTabNumberFromEvent(e)!;
        if (tabIdx < openEndpoints.length) {
          e.preventDefault();
          openEndpoint(openEndpoints[tabIdx]);
        }
      }
      // 8. Tab Navigation: Previous tab (Ctrl + [) / Next tab (Ctrl + ])
      // Skip tab switching if focused in code editor/textarea (editor handles indentation)
      else if (matchesShortcut(e, 'prev_tab') || matchesShortcut(e, 'next_tab')) {
        const target = e.target as HTMLElement | null;
        const isEditor =
          target?.tagName === 'TEXTAREA' ||
          target?.tagName === 'INPUT' ||
          target?.isContentEditable;

        if (!e.defaultPrevented && !isEditor) {
          e.preventDefault();
          const dir = matchesShortcut(e, 'prev_tab') ? 'prev' : 'next';
          const targetEp = getAdjacentEndpoint(openEndpoints, activeEndpointId, dir);
          if (targetEp) {
            openEndpoint(targetEp);
          }
        }
      }
      // 9. Escape closes any active top modal
      else if (matchesShortcut(e, 'escape')) {
        if (commandPaletteOpen) {
          e.preventDefault();
          setCommandPaletteOpen(false);
        } else if (appSettingsOpen) {
          e.preventDefault();
          setAppSettingsOpen(false);
        } else if (shortcutsHelpOpen) {
          e.preventDefault();
          setShortcutsHelpOpen(false);
        } else if (themeModalOpen) {
          e.preventDefault();
          setThemeModalOpen(false);
        } else if (envModalOpen) {
          e.preventDefault();
          setEnvModalOpen(false);
        } else if (membersModalOpen) {
          e.preventDefault();
          setMembersModalOpen(false);
        } else if (workspaceModalOpen) {
          e.preventDefault();
          setWorkspaceModalOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    commandPaletteOpen,
    appSettingsOpen,
    shortcutsHelpOpen,
    themeModalOpen,
    envModalOpen,
    membersModalOpen,
    workspaceModalOpen,
    openEndpoints,
    openEndpoint,
    activeEndpointId,
    setCommandPaletteOpen,
    setAppSettingsOpen,
    setShortcutsHelpOpen,
    setThemeModalOpen,
    setEnvModalOpen,
    setMembersModalOpen,
    setWorkspaceModalOpen,
    closeEndpoint,
    closeOtherEndpoints,
    closeAllEndpoints,
    backendUnavailable,
  ]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* Modals */}
      <BackendUnavailableModal />
      <AuthModal />
      <EnvironmentModal />
      <EditVariableModal />
      <ReflectionFolderSettingsModal />
      <SwaggerFolderSettingsModal />
      <FolderSettingsModal />
      <CollectionSettingsModal />
      <MembersModal />
      <WorkspaceSettingsModal />
      <CommandPaletteModal />
      <ShortcutsHelpModal />
      <ThemePickerModal />
      <AppSettingsModal />

      {/* Top Bar spanning full width */}
      <TopBar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Right Main Area: Tab Bar + Vertical Split (Request Top, Response Bottom) */}
        <main className="flex-1 flex flex-col min-w-0 bg-zinc-950 overflow-hidden">
          <EndpointTabBar />

          {activeEndpoint ? (
            <div ref={mainContainerRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Top: Request Section */}
              <section
                style={{ height: `${requestHeightPercent}%` }}
                className="flex flex-col min-h-[220px] overflow-hidden"
              >
                {activeEndpoint.protocol === 'http' ? (
                  <HttpRequestEditor key={activeEndpoint.id} endpoint={activeEndpoint} />
                ) : (
                  <GrpcRequestEditor key={activeEndpoint.id} endpoint={activeEndpoint} />
                )}
              </section>

              {/* Vertical Resizable Split Handle */}
              <div
                onMouseDown={startVerticalResize}
                className="h-1.5 bg-zinc-900/90 border-y border-zinc-800/80 hover:bg-zinc-800 cursor-row-resize transition flex items-center justify-center group flex-shrink-0 select-none"
                title="Drag to resize Request and Response panels"
              >
                <div className="w-8 h-0.5 rounded-full bg-zinc-700 group-hover:bg-zinc-400 transition" />
              </div>

              {/* Bottom: Response Section */}
              <section className="flex-1 min-h-[160px] flex flex-col overflow-hidden bg-zinc-950">
                <ResponseViewer key={activeEndpoint.id} endpoint={activeEndpoint} />
              </section>
            </div>
          ) : (
            <EmptyWorkspaceView />
          )}
        </main>
      </div>
    </div>
  );
};
