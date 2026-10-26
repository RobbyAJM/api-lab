import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type { Endpoint, Environment } from '@api-lab/api-types';
import { X, Radio, ArrowDownUp, ArrowLeftRight, AlertTriangle, Plus } from 'lucide-react';
import { closeAllContextMenus, CONTEXT_MENU_CLOSE_EVENT } from '../../utils/contextMenu';
import { EnvironmentDropdown } from '../environments/EnvironmentDropdown';

export const EndpointTabBar: React.FC = () => {
  const {
    openEndpoints,
    activeEndpointId,
    openEndpoint,
    closeEndpoint,
    closeOtherEndpoints,
    closeAllEndpoints,
    isEndpointDirty,
    activeWorkspaceId,
    setCommandPaletteOpen,
  } = useAppStore();

  const [contextMenu, setContextMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);

  const [confirmEndpoint, setConfirmEndpoint] = useState<Endpoint | null>(null);

  // Fetch environments for active workspace
  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ['environments', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? apiRequest(`/workspaces/${activeWorkspaceId}/environments`)
        : Promise.resolve([]),
    enabled: !!activeWorkspaceId,
  });

  useEffect(() => {
    const handleWindowClick = () => setContextMenu(null);
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('contextmenu', handleWindowClick);
    window.addEventListener(CONTEXT_MENU_CLOSE_EVENT, handleWindowClick);
    return () => {
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('contextmenu', handleWindowClick);
      window.removeEventListener(CONTEXT_MENU_CLOSE_EVENT, handleWindowClick);
    };
  }, []);

  function handleAttemptClose(ep: Endpoint) {
    if (isEndpointDirty(ep.id)) {
      setConfirmEndpoint(ep);
    } else {
      closeEndpoint(ep.id);
    }
  }

  function renderEnvironmentDropdown() {
    return (
      <div className="flex items-center ml-auto pl-2 flex-shrink-0">
        <EnvironmentDropdown environments={environments} align="right" />
      </div>
    );
  }

  if (openEndpoints.length === 0) {
    return (
      <div className="flex items-center justify-between h-10 px-3 bg-zinc-950 border-b border-zinc-800/80 select-none flex-shrink-0">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 py-1 px-2 rounded hover:bg-zinc-900 transition"
          title="New Request / Open Palette (Ctrl+K)"
        >
          <Plus size={13} />
          <span>New Request</span>
        </button>
        {renderEnvironmentDropdown()}
      </div>
    );
  }

  function renderMethodBadge(ep: Endpoint) {
    if (ep.protocol === 'http') {
      const method = ep.config?.method || 'GET';
      const colorCls =
        method === 'GET'
          ? 'text-emerald-400'
          : method === 'POST'
          ? 'text-primary'
          : method === 'PUT' || method === 'PATCH'
          ? 'text-amber-400'
          : 'text-red-400';

      return (
        <span
          className={`text-[9px] font-mono font-bold tracking-tight select-none ${colorCls}`}
        >
          {method}
        </span>
      );
    }

    const streamType = ep.config?.stream_type || 'unary';
    if (streamType === 'bidi_stream') {
      return (
        <span
          title="gRPC Bidirectional Stream"
          className="text-amber-400 flex items-center select-none"
        >
          <ArrowLeftRight size={11} />
        </span>
      );
    }
    if (streamType === 'omni_stream') {
      return (
        <span
          title="gRPC Omnidirectional Stream"
          className="text-amber-400 flex items-center select-none"
        >
          <ArrowDownUp size={11} />
        </span>
      );
    }

    return (
      <span
        title="gRPC Unary Call"
        className="text-zinc-400 flex items-center select-none"
      >
        <Radio size={11} />
      </span>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between h-9 bg-zinc-950 border-b border-zinc-800 select-none flex-shrink-0">
        {/* Left: Open Tabs + Add Tab Button */}
        <div className="flex items-center overflow-x-auto scrollbar-none flex-1 min-w-0 h-full">
          {openEndpoints.map((ep) => {
            const isActive = ep.id === activeEndpointId;
            const dirty = isEndpointDirty(ep.id);

            return (
              <div
                key={ep.id}
                onClick={() => openEndpoint(ep)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    handleAttemptClose(ep);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  closeAllContextMenus();
                  setContextMenu({
                    tabId: ep.id,
                    x: Math.min(e.clientX, window.innerWidth - 180),
                    y: e.clientY,
                  });
                }}
                className={`group flex items-center gap-2 px-3 h-full text-xs cursor-pointer transition-colors border-r ${
                  isActive
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-100 font-medium border-t border-t-primary'
                    : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border-zinc-850'
                }`}
                title={`${ep.name} (${ep.protocol.toUpperCase()})`}
              >
                {renderMethodBadge(ep)}
                <span className="truncate max-w-[120px] text-xs font-medium">{ep.name}</span>

                {/* Unsaved Changes Indicator Dot */}
                {dirty && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"
                    title="Unsaved changes"
                  />
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAttemptClose(ep);
                  }}
                  className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition opacity-0 group-hover:opacity-100 ml-0.5"
                  title="Close tab (Middle click)"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="p-1.5 mx-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 rounded transition flex-shrink-0"
            title="New Request / Search (Ctrl+K)"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Right: Environment Selector Dropdown (Image 1) */}
        {renderEnvironmentDropdown()}
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 bg-zinc-900 border border-zinc-800 rounded shadow-xl py-1 w-44 text-xs select-none font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const tid = contextMenu.tabId;
              setContextMenu(null);
              closeEndpoint(tid);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center justify-between"
          >
            <span>Close Tab</span>
            <kbd className="text-[10px] text-zinc-500 font-mono">Ctrl+W</kbd>
          </button>
          <button
            onClick={() => {
              const tid = contextMenu.tabId;
              setContextMenu(null);
              closeOtherEndpoints(tid);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center justify-between"
          >
            <span>Close All Other Tabs</span>
            <kbd className="text-[10px] text-zinc-500 font-mono">Ctrl+Alt+T</kbd>
          </button>
          <div className="h-px bg-zinc-800 my-1" />
          <button
            onClick={() => {
              setContextMenu(null);
              closeAllEndpoints();
            }}
            className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-950/40 flex items-center justify-between"
          >
            <span>Close All Tabs</span>
            <kbd className="text-[10px] text-red-500/70 font-mono">Ctrl+Shift+W</kbd>
          </button>
        </div>
      )}

      {/* Unsaved Changes Confirmation Dialog */}
      {confirmEndpoint && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 font-sans"
          onClick={() => setConfirmEndpoint(null)}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-amber-950/60 border border-amber-800/60 text-amber-400 flex-shrink-0">
                <AlertTriangle size={18} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-100">Unsaved Changes</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Endpoint <span className="text-zinc-200 font-medium">"{confirmEndpoint.name}"</span> has unsaved changes. Closing this tab will discard them.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
              <button
                onClick={() => setConfirmEndpoint(null)}
                className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = confirmEndpoint.id;
                  setConfirmEndpoint(null);
                  closeEndpoint(id);
                }}
                className="px-3 py-1.5 rounded text-xs bg-red-600 hover:bg-red-500 text-white font-medium transition"
              >
                Discard & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
