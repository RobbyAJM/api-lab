import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type { Collection, Endpoint } from '@api-lab/api-types';
import { Search, X, CornerDownLeft, Layers, Radio, ArrowDownUp } from 'lucide-react';
import {
  searchEndpointsForCommandPalette,
  navigateListIndex,
  recordPaletteAction,
  loadPaletteRecency,
  savePaletteRecency,
  type CommandPaletteItem,
  type PaletteActionRecord,
} from '../../utils/shortcuts';
import { getHttpMethodBadgeClass } from '../../utils/httpMethodUtils';

export const EndpointSearchModal: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    activeWorkspaceId,
    endpointSearchOpen,
    setEndpointSearchOpen,
    setActiveEndpoint,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allEndpoints, setAllEndpoints] = useState<Endpoint[]>([]);
  const [paletteHistory, setPaletteHistory] = useState<PaletteActionRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch collections in active workspace
  const { data: collections = [] } = useQuery<Collection[]>({
    queryKey: ['collections', activeWorkspaceId],
    queryFn: () => apiRequest(`/workspaces/${activeWorkspaceId}/collections`),
    enabled: !!activeWorkspaceId && endpointSearchOpen,
  });

  // Load all endpoints across workspace collections
  useEffect(() => {
    if (!endpointSearchOpen || collections.length === 0) return;

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
  }, [endpointSearchOpen, collections, queryClient]);

  // Auto-focus input and load latest recency when opened
  useEffect(() => {
    if (endpointSearchOpen) {
      setPaletteHistory(loadPaletteRecency());
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [endpointSearchOpen]);

  const items = searchEndpointsForCommandPalette(allEndpoints, collections, query, paletteHistory);

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

  if (!endpointSearchOpen) return null;

  function handleSelect(item: CommandPaletteItem) {
    const recency = loadPaletteRecency();
    const updated = recordPaletteAction(recency, { id: item.endpoint.id, type: 'endpoint' });
    savePaletteRecency(updated);
    setPaletteHistory(updated);

    setActiveEndpoint(item.endpoint);
    localStorage.setItem('api_lab_active_endpoint_id', item.endpoint.id);
    setEndpointSearchOpen(false);
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
      setEndpointSearchOpen(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-start justify-center pt-24 p-4"
      onClick={() => setEndpointSearchOpen(false)}
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
            placeholder="Search endpoints, methods, services... (Ctrl+K)"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-sans"
          />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
              Esc
            </kbd>
            <button
              type="button"
              onClick={() => setEndpointSearchOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Endpoints List */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 flex flex-col items-center gap-1.5 select-none">
              <Layers size={24} className="text-zinc-700" />
              <span>No endpoints matching &quot;{query}&quot;</span>
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const isHttp = item.protocol === 'http';

              return (
                <div
                  key={item.endpoint.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-zinc-800 text-white border border-zinc-700/80'
                      : 'hover:bg-zinc-900/80 text-zinc-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {/* Method / Protocol Badge */}
                    {isHttp ? (
                      <span
                        className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border select-none ${getHttpMethodBadgeClass(
                          item.methodLabel,
                          isSelected
                        )}`}
                      >
                        {item.methodLabel}
                      </span>
                    ) : (
                      <span
                        className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border flex items-center gap-1 select-none ${
                          isSelected
                            ? 'bg-purple-900/60 text-purple-200 border-purple-700/80'
                            : 'bg-purple-950/40 text-purple-400 border-purple-900/50'
                        }`}
                      >
                        {item.methodLabel === 'STREAM' ? (
                          <>
                            <Radio size={10} className="text-purple-400" />
                            STREAM
                          </>
                        ) : (
                          'gRPC'
                        )}
                      </span>
                    )}

                    {/* Endpoint Name & Collection */}
                    <div className="truncate">
                      <span className="font-semibold text-zinc-200">{item.endpoint.name}</span>
                      <span className="text-zinc-500 text-[11px] ml-2">
                        {item.collectionName}
                      </span>
                    </div>
                  </div>

                  {/* Route & Enter Action */}
                  <div className="flex items-center gap-3 flex-shrink-0 text-zinc-500 text-[11px]">
                    <span className="font-mono max-w-[200px] truncate text-zinc-400">
                      {item.urlOrService}
                    </span>
                    {isSelected && (
                      <div className="flex items-center gap-1 text-[11px] text-primary font-medium">
                        <span>Open</span>
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
              <span>Select</span>
            </span>
          </div>
          <span className="font-mono text-[10px]">
            {items.length} {items.length === 1 ? 'endpoint' : 'endpoints'}
          </span>
        </div>
      </div>
    </div>
  );
};
