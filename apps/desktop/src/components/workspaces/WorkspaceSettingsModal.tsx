import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type { WorkspaceSummary } from '@api-lab/api-types';
import {
  X,
  Briefcase,
  Copy,
  Check,
  Users,
  AlertTriangle,
  Plus,
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
  } = useAppStore();

  const currentWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const isAdmin = currentWs?.role === 'admin';

  const [wsName, setWsName] = useState(currentWs?.name || '');
  const [copiedId, setCopiedId] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // New workspace creation state
  const [newWsName, setNewWsName] = useState('');
  const [showCreateWs, setShowCreateWs] = useState(false);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (currentWs) {
      setWsName(currentWs.name);
      setShowDeleteConfirm(false);
      setStatusMessage(null);
    }
  }, [currentWs, workspaceModalOpen]);

  // Rename workspace mutation
  const renameMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest<WorkspaceSummary>(`/workspaces/${activeWorkspaceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<WorkspaceSummary[]>(['workspaces'], (prev) =>
        prev ? prev.map((w) => (w.id === updated.id ? { ...w, name: updated.name } : w)) : [updated]
      );
      queryClient.invalidateQueries({ queryKey: ['auth_me'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setStatusMessage('Workspace name updated');
      setTimeout(() => setStatusMessage(null), 2500);
    },
    onError: (err: any) => {
      setStatusMessage(`Error updating name: ${err.message}`);
    },
  });

  // Create workspace mutation
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
      setStatusMessage(`Switched to new workspace "${created.name}"`);
      setTimeout(() => setStatusMessage(null), 2500);
    },
    onError: (err: any) => {
      setStatusMessage(`Error creating workspace: ${err.message}`);
    },
  });

  // Delete workspace mutation
  const deleteWsMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/workspaces/${activeWorkspaceId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      const remaining = workspaces.filter((w) => w.id !== activeWorkspaceId);
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['auth_me'] });
      if (remaining.length > 0) {
        setActiveWorkspaceId(remaining[0].id);
      } else {
        setActiveWorkspaceId(null);
      }
      setWorkspaceModalOpen(false);
    },
    onError: (err: any) => {
      setStatusMessage(`Error deleting workspace: ${err.message}`);
    },
  });

  if (!workspaceModalOpen || !currentWs) return null;

  function handleCopyId() {
    navigator.clipboard.writeText(currentWs?.id || '');
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 font-sans select-none"
      onClick={() => setWorkspaceModalOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-zinc-100 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
              <Briefcase size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Workspace Settings</h2>
              <p className="text-[11px] text-zinc-400">Manage {currentWs.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setWorkspaceModalOpen(false)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
          {statusMessage && (
            <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono select-text">
              {statusMessage}
            </div>
          )}

          {/* General Workspace Info */}
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              General
            </h3>

            {/* Workspace Name */}
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Workspace Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  disabled={!isAdmin || renameMutation.isPending}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700 disabled:opacity-50 font-medium"
                />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => wsName.trim() && renameMutation.mutate(wsName.trim())}
                    disabled={!wsName.trim() || wsName.trim() === currentWs.name || renameMutation.isPending}
                    className="px-3 py-1.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-lg font-medium transition"
                  >
                    Save
                  </button>
                )}
              </div>
            </div>

            {/* Metadata (ID and Role) */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase font-semibold block mb-1">
                  Workspace ID
                </span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-[10px] text-zinc-400 hover:text-zinc-200 transition"
                  title="Click to copy ID"
                >
                  <span className="truncate max-w-[150px]">{currentWs.id}</span>
                  {copiedId ? <Check size={11} className="text-emerald-400 ml-1" /> : <Copy size={11} className="ml-1" />}
                </button>
              </div>

              <div>
                <span className="text-[10px] text-zinc-500 uppercase font-semibold block mb-1">
                  Your Access Role
                </span>
                <div className="px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-xs text-zinc-200 capitalize flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isAdmin ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  />
                  <span>{currentWs.role}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Members & Team Section */}
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="font-semibold text-zinc-200 text-xs flex items-center gap-1.5">
                <Users size={14} className="text-zinc-400" />
                <span>Workspace Members</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Manage roles, view team members, or generate invitation tokens.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setWorkspaceModalOpen(false);
                setMembersModalOpen(true);
              }}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg font-medium transition flex-shrink-0"
            >
              Manage Members
            </button>
          </div>

          {/* Create New Workspace */}
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-zinc-200 text-xs block">
                  Create Another Workspace
                </span>
                <span className="text-[11px] text-zinc-400">
                  Switch between isolated workspaces for different clients or APIs.
                </span>
              </div>
              {!showCreateWs && (
                <button
                  type="button"
                  onClick={() => setShowCreateWs(true)}
                  className="px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg font-medium transition flex items-center gap-1 flex-shrink-0"
                >
                  <Plus size={12} />
                  <span>New</span>
                </button>
              )}
            </div>

            {showCreateWs && (
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder="e.g. NuTrade Core or Staging"
                  autoFocus
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                />
                <button
                  type="button"
                  onClick={() => newWsName.trim() && createWsMutation.mutate(newWsName.trim())}
                  disabled={!newWsName.trim() || createWsMutation.isPending}
                  className="px-3 py-1.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-lg font-medium transition"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateWs(false);
                    setNewWsName('');
                  }}
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Danger Zone (Admin only) */}
          {isAdmin && (
            <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-900/40 space-y-2.5">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-xs">
                <AlertTriangle size={14} />
                <span>Danger Zone</span>
              </div>

              {!showDeleteConfirm ? (
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-zinc-400 max-w-sm">
                    Permanently delete <strong className="text-zinc-200 font-medium">"{currentWs.name}"</strong> and all associated collections, endpoints, and environments.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-2.5 py-1 text-xs text-red-400 hover:text-white bg-red-950/60 hover:bg-red-900 border border-red-800/60 rounded-lg transition font-medium flex items-center gap-1 flex-shrink-0"
                  >
                    <Trash2 size={12} />
                    <span>Delete</span>
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-zinc-950 border border-red-800/80 rounded-lg space-y-2.5">
                  <p className="text-xs text-red-300 font-medium">
                    Are you sure you want to delete "{currentWs.name}"? This action cannot be undone.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-md transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteWsMutation.mutate()}
                      disabled={deleteWsMutation.isPending}
                      className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 text-white font-semibold rounded-md transition"
                    >
                      {deleteWsMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
