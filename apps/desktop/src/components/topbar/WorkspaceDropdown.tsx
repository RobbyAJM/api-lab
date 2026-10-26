import React, { useState, useRef, useEffect } from 'react';
import { Users, ChevronDown, Plus, Search, Star, Check, LayoutGrid } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { filterWorkspaces, sortWorkspaces } from '../../utils/workspacePicker';

export const WorkspaceDropdown: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('api_lab_favorite_workspaces');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);
  const setWorkspaceModalOpen = useAppStore((s) => s.setWorkspaceModalOpen);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const toggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = favorites.includes(id)
      ? favorites.filter((fid) => fid !== id)
      : [...favorites, id];
    setFavorites(updated);
    try {
      localStorage.setItem('api_lab_favorite_workspaces', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const filtered = filterWorkspaces(workspaces, search);
  const sorted = sortWorkspaces(filtered, activeWorkspaceId, favorites);

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-zinc-200 hover:bg-zinc-800/70 hover:text-white transition focus:outline-none"
        title="Switch Workspace"
      >
        <Users size={13} className="text-zinc-400" />
        <span className="font-semibold truncate max-w-[140px]">
          {activeWorkspace?.name || 'Select Workspace'}
        </span>
        <ChevronDown size={12} className="text-zinc-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-72 rounded-md border border-zinc-800 bg-zinc-900 shadow-xl z-50 flex flex-col overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100">
          {/* Search & Create Header */}
          <div className="p-2 border-b border-zinc-800 flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-2 text-zinc-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workspaces..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded pl-7 pr-2 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setWorkspaceModalOpen(true);
              }}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-medium transition flex items-center gap-1 flex-shrink-0"
              title="Create Workspace"
            >
              <Plus size={12} />
              <span>Create</span>
            </button>
          </div>

          {/* Workspaces List */}
          <div className="max-h-60 overflow-y-auto py-1">
            {sorted.length > 0 ? (
              sorted.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                const isFav = favorites.includes(ws.id);
                return (
                  <div
                    key={ws.id}
                    onClick={() => {
                      setActiveWorkspaceId(ws.id);
                      setOpen(false);
                    }}
                    className={`px-3 py-1.5 flex items-center justify-between text-xs cursor-pointer transition group ${
                      isActive
                        ? 'bg-zinc-800/80 text-white font-medium'
                        : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Users size={13} className={isActive ? 'text-blue-400' : 'text-zinc-500'} />
                      <span className="truncate">{ws.name}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => toggleFavorite(e, ws.id)}
                        className={`p-1 rounded hover:text-amber-400 transition ${
                          isFav ? 'text-amber-400' : 'text-zinc-600 opacity-0 group-hover:opacity-100'
                        }`}
                        title={isFav ? 'Remove from favorites' : 'Star workspace'}
                      >
                        <Star size={12} fill={isFav ? 'currentColor' : 'none'} />
                      </button>

                      {isActive && <Check size={13} className="text-blue-400" />}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-4 text-center text-xs text-zinc-500">No workspaces found</div>
            )}
          </div>

          {/* Footer */}
          <div className="p-1.5 border-t border-zinc-800 bg-zinc-950/40">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setWorkspaceModalOpen(true);
              }}
              className="w-full px-2.5 py-1.5 flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded transition"
            >
              <LayoutGrid size={13} />
              <span>View all workspaces</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
