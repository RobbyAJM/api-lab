import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Terminal, X, CornerDownLeft, Layers, ArrowDownUp } from 'lucide-react';
import {
  searchCommandsForPalette,
  navigateListIndex,
  recordPaletteAction,
  loadPaletteRecency,
  savePaletteRecency,
  type PaletteCommandAction,
  type PaletteActionRecord,
} from '../../utils/shortcuts';

export const CommandPaletteModal: React.FC = () => {
  const {
    activeEndpointId,
    openEndpoints,
    commandPaletteOpen,
    setCommandPaletteOpen,
    setEndpointSearchOpen,
    openEndpoint,
    closeEndpoint,
    closeOtherEndpoints,
    closeAllEndpoints,
    setWorkspaceDropdownOpen,
    setEnvModalOpen,
    setAppSettingsOpen,
    setShortcutsHelpOpen,
    setThemeModalOpen,
    setMembersModalOpen,
    logout,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [paletteHistory, setPaletteHistory] = useState<PaletteActionRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-focus input and load latest recency when opened
  useEffect(() => {
    if (commandPaletteOpen) {
      setPaletteHistory(loadPaletteRecency());
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  const items = searchCommandsForPalette(query, paletteHistory);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Ensure selected item is visible in list
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!commandPaletteOpen) return null;

  function executeCommand(action: PaletteCommandAction) {
    const recency = loadPaletteRecency();
    const updated = recordPaletteAction(recency, { id: action.id, type: 'command' });
    savePaletteRecency(updated);
    setPaletteHistory(updated);
    setCommandPaletteOpen(false);

    switch (action.actionId) {
      case 'close_tab':
        if (activeEndpointId) closeEndpoint(activeEndpointId);
        break;
      case 'close_other_tabs':
        if (activeEndpointId) closeOtherEndpoints(activeEndpointId);
        break;
      case 'close_all_tabs':
        closeAllEndpoints();
        break;
      case 'switch_workspace':
        setWorkspaceDropdownOpen(true);
        break;
      case 'open_endpoint_search':
        setEndpointSearchOpen(true);
        break;
      case 'open_environment':
        setEnvModalOpen(true);
        break;
      case 'open_settings':
        setAppSettingsOpen(true);
        break;
      case 'open_shortcuts':
        setShortcutsHelpOpen(true);
        break;
      case 'open_theme_picker':
        setThemeModalOpen(true);
        break;
      case 'open_members':
        setMembersModalOpen(true, 'members');
        break;
      case 'zoom_in':
        window.dispatchEvent(new CustomEvent('api-lab-zoom', { detail: 'in' }));
        break;
      case 'zoom_out':
        window.dispatchEvent(new CustomEvent('api-lab-zoom', { detail: 'out' }));
        break;
      case 'zoom_reset':
        window.dispatchEvent(new CustomEvent('api-lab-zoom', { detail: 'reset' }));
        break;
      case 'logout':
        logout();
        break;
      case 'prev_tab':
        if (openEndpoints.length > 1) {
          const curr = openEndpoints.findIndex((ep) => ep.id === activeEndpointId);
          const next = curr > 0 ? curr - 1 : openEndpoints.length - 1;
          openEndpoint(openEndpoints[next]);
        }
        break;
      case 'next_tab':
        if (openEndpoints.length > 1) {
          const curr = openEndpoints.findIndex((ep) => ep.id === activeEndpointId);
          const next = curr >= 0 && curr < openEndpoints.length - 1 ? curr + 1 : 0;
          openEndpoint(openEndpoints[next]);
        }
        break;
      default:
        break;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => navigateListIndex(prev, items.length, 'down'));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => navigateListIndex(prev, items.length, 'up'));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        executeCommand(items[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setCommandPaletteOpen(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-start justify-center pt-24 p-4"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-3.5 py-3 border-b border-zinc-800 gap-2.5 bg-zinc-900/60">
          <Terminal size={16} className="text-zinc-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command... (Ctrl+P)"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-sans"
          />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
              Esc
            </kbd>
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Commands List */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 flex flex-col items-center gap-1.5 select-none">
              <Layers size={24} className="text-zinc-700" />
              <span>No commands matching &quot;{query}&quot;</span>
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={item.id}
                  onClick={() => executeCommand(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-zinc-800 text-white border border-zinc-700/80'
                      : 'hover:bg-zinc-900/80 text-zinc-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 flex items-center gap-1 select-none">
                      {item.category.toUpperCase()}
                    </span>
                    <div className="truncate">
                      <span className="font-semibold text-zinc-200">{item.title}</span>
                      <span className="text-zinc-500 text-[11px] ml-2">
                        {item.description}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.keyLabel && (
                      <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 select-none">
                        {item.keyLabel}
                      </kbd>
                    )}
                    {isSelected && (
                      <div className="flex items-center gap-1 text-[11px] text-primary font-medium">
                        <span>Run</span>
                        <CornerDownLeft size={12} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Hint Bar */}
        <div className="px-3 py-2 border-t border-zinc-800/80 bg-zinc-950/80 flex items-center justify-between text-[11px] text-zinc-500 select-none">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ArrowDownUp size={12} />
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono px-1 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-[10px]">
                ↵
              </kbd>
              <span>Execute</span>
            </span>
          </div>
          <span className="font-mono text-[10px]">
            {items.length} {items.length === 1 ? 'command' : 'commands'}
          </span>
        </div>
      </div>
    </div>
  );
};
