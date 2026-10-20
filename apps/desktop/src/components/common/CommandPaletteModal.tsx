import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type { Collection, Endpoint } from '@api-lab/api-types';
import { Search, X, CornerDownLeft, Layers, Radio, Terminal, ArrowDownUp } from 'lucide-react';
import {
  searchUnifiedCommandPalette,
  navigateListIndex,
  type UnifiedPaletteItem,
} from '../../utils/shortcuts';

export const CommandPaletteModal: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    activeWorkspaceId,
    activeEndpointId,
    commandPaletteOpen,
    setCommandPaletteOpen,
    setActiveEndpoint,
    closeEndpoint,
    closeOtherEndpoints,
    closeAllEndpoints,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allEndpoints, setAllEndpoints] = useState<Endpoint[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch collections
  const { data: collections = [] } = useQuery<Collection[]>({
    queryKey: ['collections', activeWorkspaceId],
    queryFn: () => apiRequest(`/workspaces/${activeWorkspaceId}/collections`),
    enabled: !!activeWorkspaceId && commandPaletteOpen,
  });

  // Load all endpoints across workspace collections
  useEffect(() => {
    if (!commandPaletteOpen || collections.length === 0) return;

    let mounted = true;
    Promise.all(
      collections.map(async (c) => {
        const cached = queryClient.getQueryData<Endpoint[]>(['endpoints', c.id]);
        if (cached) return cached;
        try {
          return await apiRequest<Endpoint[]>(`/collections/${c.id}/endpoints`);
        } catch {
          return [];
        }
      })
    ).then((results) => {
      if (mounted) {
        setAllEndpoints(results.flat());
      }
    });

    return () => {
      mounted = false;
    };
  }, [commandPaletteOpen, collections, queryClient]);

  // Auto-focus input when opened
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  const items = searchUnifiedCommandPalette(allEndpoints, collections, query);

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

  function handleSelect(item: UnifiedPaletteItem) {
    if (item.type === 'command') {
      if (item.actionId === 'close_tab') {
        if (activeEndpointId) {
          closeEndpoint(activeEndpointId);
        }
      } else if (item.actionId === 'close_other_tabs') {
        if (activeEndpointId) {
          closeOtherEndpoints(activeEndpointId);
        }
      } else if (item.actionId === 'close_all_tabs') {
        closeAllEndpoints();
      }
    } else {
      setActiveEndpoint(item.endpoint);
      localStorage.setItem('api_lab_active_endpoint_id', item.endpoint.id);
    }
    setCommandPaletteOpen(false);
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
        handleSelect(items[selectedIndex]);
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
          <Search size={16} className="text-zinc-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search method, endpoint, service, URL..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-sans"
          />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
              Esc to exit
            </kbd>
            <button
              onClick={() => setCommandPaletteOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 flex flex-col items-center gap-1.5 select-none">
              <Layers size={24} className="text-zinc-700" />
              <span>No commands or endpoints matching "{query}"</span>
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;

              if (item.type === 'command') {
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2 rounded text-xs cursor-pointer transition ${
                      isSelected
                        ? 'bg-zinc-800 text-white border border-zinc-700/80'
                        : 'hover:bg-zinc-900/80 text-zinc-300 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60 flex items-center gap-1 select-none">
                        <Terminal size={10} />
                        COMMAND
                      </span>
                      <div className="truncate">
                        <span className="font-semibold text-zinc-200">{item.title}</span>
                        <span className="text-zinc-500 text-[11px] ml-2">
                          {item.description}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 select-none">
                        {item.keyLabel}
                      </kbd>
                      {isSelected && (
                        <div className="flex items-center gap-1 text-[11px] text-primary font-medium">
                          <span>Run</span>
                          <CornerDownLeft size={12} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              const isHttp = item.protocol === 'http';

              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-zinc-800 text-white border border-zinc-700/80'
                      : 'hover:bg-zinc-900/80 text-zinc-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {/* Method Badge */}
                    {isHttp ? (
                      <span
                        className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${
                          item.methodLabel === 'GET'
                            ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40'
                            : item.methodLabel === 'POST'
                            ? 'text-primary bg-primary-subtle border border-primary-border'
                            : item.methodLabel === 'PUT' || item.methodLabel === 'PATCH'
                            ? 'text-amber-400 bg-amber-950/60 border border-amber-800/40'
                            : 'text-red-400 bg-red-950/60 border border-red-800/40'
                        }`}
                      >
                        {item.methodLabel}
                      </span>
                    ) : item.methodLabel === 'STREAM' ? (
                      <span className="text-[9px] font-medium font-mono px-1.5 py-0.5 rounded text-amber-300 bg-amber-950/40 border border-amber-800/30 flex items-center gap-1">
                        <ArrowDownUp size={10} />
                        Stream
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium font-mono px-1.5 py-0.5 rounded text-zinc-300 bg-zinc-900 border border-zinc-800 flex items-center gap-1">
                        <Radio size={10} />
                        gRPC
                      </span>
                    )}

                    {/* Endpoint name and collection */}
                    <div className="truncate">
                      <span className="font-medium text-zinc-200">
                        {item.endpoint.name}
                      </span>
                      <span className="text-zinc-500 text-[11px] ml-2">
                        in {item.collectionName}
                      </span>
                      {item.urlOrService && (
                        <div className="text-[10px] text-zinc-500 font-mono truncate">
                          {item.urlOrService}
                        </div>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <div className="flex items-center gap-1 text-[11px] text-primary flex-shrink-0 font-medium">
                      <span>Jump</span>
                      <CornerDownLeft size={12} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-3 py-1.5 bg-zinc-900/50 border-t border-zinc-800/80 text-[11px] text-zinc-500 flex items-center justify-between select-none">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-zinc-800 px-1 rounded text-[10px] text-zinc-400">↑</kbd>
              <kbd className="font-mono bg-zinc-800 px-1 rounded text-[10px] text-zinc-400">↓</kbd>
              <span>to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-zinc-800 px-1 rounded text-[10px] text-zinc-400">↵</kbd>
              <span>to select</span>
            </span>
          </div>
          <span>{items.length} item{items.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
};
