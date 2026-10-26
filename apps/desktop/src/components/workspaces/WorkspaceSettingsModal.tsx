import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { Avatar } from '../common/Avatar';
import { filterWorkspaces, getWorkspaceInitials } from '../../utils/workspacePicker';
import type { WorkspaceSummary } from '@api-lab/api-types';
import {
  X,
  Plus,
  Search,
  Star,
  MoreHorizontal,
  Settings,
  Trash2,
} from 'lucide-react';

export const WorkspaceSettingsModal: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspaceModalOpen,
    setWorkspaceModalOpen,
    setMembersModalOpen,
    user,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('api_lab_favorite_workspaces');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Action popover state
  const [menuWsId, setMenuWsId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Create workspace dialog state
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');

  // Delete workspace dialog state
  const [deletingWs, setDeletingWs] = useState<WorkspaceSummary | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuWsId(null);
      }
    }
    if (menuWsId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuWsId]);

  // Create Workspace Mutation
  const createWsMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest<WorkspaceSummary>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['auth_me'] });
      setActiveWorkspaceId(created.id);
      setNewWsName('');
      setShowCreateWs(false);
      setWorkspaceModalOpen(false);
    },
  });

  // Delete Workspace Mutation
  const deleteWsMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/workspaces/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, deletedId) => {
      const remaining = workspaces.filter((w) => w.id !== deletedId);
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['auth_me'] });
      if (activeWorkspaceId === deletedId && remaining.length > 0) {
        setActiveWorkspaceId(remaining[0].id);
      }
      setDeletingWs(null);
    },
  });

  if (!workspaceModalOpen) return null;

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

  const filteredWorkspaces = filterWorkspaces(workspaces, search);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) setWorkspaceModalOpen(false);
      }}
    >
      <div className="flex flex-col h-[620px] w-[980px] max-w-[95vw] rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-zinc-100">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-950">
          <h1 className="text-xl font-bold tracking-tight text-white">Workspaces</h1>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setNewWsName('');
                setShowCreateWs(true);
              }}
              className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-white rounded font-medium text-xs shadow transition flex items-center gap-1.5"
            >
              <Plus size={14} />
              <span>Create workspace</span>
            </button>

            <button
              type="button"
              onClick={() => setWorkspaceModalOpen(false)}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3 border-b border-zinc-800/60 bg-zinc-950 flex items-center">
          <div className="relative w-80">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workspaces"
              className="w-full bg-zinc-900 border border-zinc-800 rounded pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-primary font-sans"
            />
          </div>
        </div>

        {/* Workspaces Data Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800/80 text-zinc-400 text-[11px] font-medium bg-zinc-900/40">
                <th className="py-2.5 pl-6 pr-3">Name ↑</th>
                <th className="py-2.5 px-3">Creator</th>
                <th className="py-2.5 px-3">Contributors</th>
                <th className="py-2.5 px-3">Last activity</th>
                <th className="py-2.5 px-3">Access</th>
                <th className="py-2.5 px-3">Your role</th>
                <th className="py-2.5 pr-6 pl-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {filteredWorkspaces.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                const isFav = favorites.includes(ws.id);
                const isPersonal = ws.name.toLowerCase().includes('personal') || ws.name.toLowerCase().includes('my ');

                return (
                  <tr
                    key={ws.id}
                    onClick={() => {
                      setActiveWorkspaceId(ws.id);
                      setWorkspaceModalOpen(false);
                    }}
                    className={`cursor-pointer transition group ${
                      isActive ? 'bg-zinc-900/90' : 'hover:bg-zinc-900/50'
                    }`}
                  >
                    {/* Name */}
                    <td className="py-3 pl-6 pr-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-xs font-semibold text-zinc-200 flex-shrink-0 tracking-wider font-mono">
                          {getWorkspaceInitials(ws.name)}
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-200 group-hover:text-white flex items-center gap-1.5">
                            <span>{ws.name}</span>
                            {isActive && (
                              <span className="text-[10px] text-primary font-mono font-medium">
                                (Active)
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">Internal</div>
                        </div>
                      </div>
                    </td>

                    {/* Creator */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <Avatar avatar={user?.avatar} name={user?.name} size={20} />
                        <span className="text-zinc-300">You</span>
                      </div>
                    </td>

                    {/* Contributors */}
                    <td className="py-3 px-3 text-zinc-400 font-mono">1</td>

                    {/* Last Activity */}
                    <td className="py-3 px-3 text-zinc-500 font-mono">—</td>

                    {/* Access */}
                    <td className="py-3 px-3 text-zinc-400">
                      {isPersonal ? 'Only you and invited people' : 'Everyone in your team'}
                    </td>

                    {/* Your Role */}
                    <td className="py-3 px-3">
                      <span className="inline-block px-2 py-0.5 rounded bg-zinc-850 text-zinc-300 text-[11px] capitalize border border-zinc-800">
                        {ws.role}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 pr-6 pl-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => toggleFavorite(e, ws.id)}
                          className={`p-1 rounded transition hover:text-amber-400 ${
                            isFav ? 'text-amber-400' : 'text-zinc-600 opacity-0 group-hover:opacity-100'
                          }`}
                          title={isFav ? 'Unstar' : 'Star workspace'}
                        >
                          <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
                        </button>

                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setMenuWsId(menuWsId === ws.id ? null : ws.id)}
                            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
                            title="More options"
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {menuWsId === ws.id && (
                            <div
                              ref={menuRef}
                              className="absolute right-0 top-full mt-1 w-44 rounded-md border border-zinc-800 bg-zinc-900 shadow-xl z-50 py-1 text-left text-xs"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuWsId(null);
                                  setActiveWorkspaceId(ws.id);
                                  setWorkspaceModalOpen(false);
                                  setMembersModalOpen(true, 'general');
                                }}
                                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
                              >
                                <Settings size={12} />
                                <span>Configure workspace</span>
                              </button>

                              {workspaces.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuWsId(null);
                                    setDeletingWs(ws);
                                  }}
                                  className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-red-400 hover:text-red-300 transition"
                                >
                                  <Trash2 size={12} />
                                  <span>Delete workspace</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredWorkspaces.length === 0 && (
            <div className="py-12 text-center text-xs text-zinc-500">
              No workspaces found matching "{search}"
            </div>
          )}
        </div>

        {/* Create Workspace Inline Sub-dialog */}
        {showCreateWs && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
            <div className="w-96 rounded-lg border border-zinc-800 bg-zinc-950 p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Create new workspace</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateWs(false)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X size={15} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Workspace name
                </label>
                <input
                  type="text"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder="e.g. Acme API Services"
                  autoFocus
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateWs(false)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (newWsName.trim()) createWsMutation.mutate(newWsName.trim());
                  }}
                  disabled={!newWsName.trim() || createWsMutation.isPending}
                  className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-white rounded text-xs font-medium transition disabled:opacity-50"
                >
                  {createWsMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Workspace Sub-dialog */}
        {deletingWs && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
            <div className="w-96 rounded-lg border border-zinc-800 bg-zinc-950 p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-red-400">Delete workspace</h3>
                <button
                  type="button"
                  onClick={() => setDeletingWs(null)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X size={15} />
                </button>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">
                Are you sure you want to delete <strong className="text-white">"{deletingWs.name}"</strong>? All collections, endpoints, and environment variables inside will be permanently removed.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingWs(null)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteWsMutation.mutate(deletingWs.id)}
                  disabled={deleteWsMutation.isPending}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-medium transition disabled:opacity-50"
                >
                  {deleteWsMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
