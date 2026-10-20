import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type { Environment, VariableResponse } from '@api-lab/api-types';
import {
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Edit2,
  Check,
  Copy,
  Search,
  Layers,
  Database,
  Sparkles,
} from 'lucide-react';
import {
  duplicateEnvironment,
  filterVariables,
  validateEnvironmentName,
} from '../../utils/environmentManager';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';

export const EnvironmentModal: React.FC = () => {
  const queryClient = useQueryClient();
  const { envModalOpen, setEnvModalOpen, activeWorkspaceId } = useAppStore();

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [newEnvName, setNewEnvName] = useState('');
  const [showAddEnv, setShowAddEnv] = useState(false);

  // Environment Rename State (Bug Fix)
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [renameEnvValue, setRenameEnvValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  // Variable Search filter
  const [varSearchQuery, setVarSearchQuery] = useState('');

  // New variable state
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [newSensitive, setNewSensitive] = useState(false);
  const [showNewVal, setShowNewVal] = useState(false);
  const [showMasked, setShowMasked] = useState<Record<string, boolean>>({});

  // Edit variable state
  const [editingVarId, setEditingVarId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState('');
  const [editVal, setEditVal] = useState('');
  const [editSensitive, setEditSensitive] = useState(false);
  const [showEditVal, setShowEditVal] = useState(false);

  // Fetch environments
  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ['environments', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? apiRequest(`/workspaces/${activeWorkspaceId}/environments`)
        : Promise.resolve([]),
    enabled: !!activeWorkspaceId && envModalOpen,
  });

  // Set default selected environment
  useEffect(() => {
    if (environments.length > 0 && (!selectedEnvId || !environments.some((e) => e.id === selectedEnvId))) {
      setSelectedEnvId(environments[0].id);
    }
  }, [environments, selectedEnvId]);

  // Fetch variables for selected environment
  const { data: variables = [] } = useQuery<VariableResponse[]>({
    queryKey: ['variables', selectedEnvId],
    queryFn: () =>
      selectedEnvId
        ? apiRequest(`/environments/${selectedEnvId}/variables`)
        : Promise.resolve([]),
    enabled: !!selectedEnvId && envModalOpen,
  });

  const selectedEnvironment = environments.find((e) => e.id === selectedEnvId);

  // Create Environment
  const createEnvMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest<Environment>(`/workspaces/${activeWorkspaceId}/environments`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['environments', activeWorkspaceId] });
      setSelectedEnvId(data.id);
      setNewEnvName('');
      setShowAddEnv(false);
    },
  });

  // Rename Environment (Bug Fix: Allows changing environment name like DEV -> LOCAL)
  const renameEnvMutation = useMutation({
    mutationFn: (payload: { id: string; name: string }) =>
      apiRequest<Environment>(`/environments/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: payload.name.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environments', activeWorkspaceId] });
      setEditingEnvId(null);
      setRenameError(null);
    },
    onError: (err: any) => {
      setRenameError(err.message || 'Failed to rename environment');
    },
  });

  // Duplicate Environment (Feature: Duplicates DEV to DEV [Duplicate] with all variables)
  const duplicateEnvMutation = useMutation({
    mutationFn: async (env: Environment) => {
      const currentVars =
        queryClient.getQueryData<VariableResponse[]>(['variables', env.id]) ||
        (await apiRequest<VariableResponse[]>(`/environments/${env.id}/variables`));

      return await duplicateEnvironment(env, currentVars, activeWorkspaceId!, {
        post: (path, body) => apiRequest(path, { method: 'POST', body: JSON.stringify(body) }),
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['environments', activeWorkspaceId] });
      setSelectedEnvId(result.newEnvironment.id);
    },
  });

  // Delete Environment
  const [envToDelete, setEnvToDelete] = useState<{ id: string; name: string } | null>(null);
  const deleteEnvMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/environments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environments', activeWorkspaceId] });
      setSelectedEnvId(null);
      setEnvToDelete(null);
    },
  });

  // Add Variable
  const addVarMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/environments/${selectedEnvId}/variables`, {
        method: 'POST',
        body: JSON.stringify({
          key: newKey.trim(),
          value: newVal,
          is_sensitive: newSensitive,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variables', selectedEnvId] });
      setNewKey('');
      setNewVal('');
      setNewSensitive(false);
      setShowNewVal(false);
    },
  });

  // Delete Variable
  const deleteVarMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/variables/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variables', selectedEnvId] });
    },
  });

  // Update Variable
  const updateVarMutation = useMutation({
    mutationFn: (payload: { id: string; key: string; value: string; is_sensitive: boolean }) =>
      apiRequest(`/variables/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          key: payload.key.trim(),
          value: payload.value,
          is_sensitive: payload.is_sensitive,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variables', selectedEnvId] });
      setEditingVarId(null);
      setShowEditVal(false);
    },
  });

  function startEditingVar(v: VariableResponse) {
    setEditingVarId(v.id);
    setEditKey(v.key);
    setEditVal(v.value);
    setEditSensitive(v.is_sensitive);
    setShowEditVal(false);
  }

  function handleSaveEditVar(id: string) {
    if (!editKey.trim()) return;
    updateVarMutation.mutate({
      id,
      key: editKey.trim(),
      value: editVal,
      is_sensitive: editSensitive,
    });
  }

  function startRenamingEnv(env: Environment) {
    setEditingEnvId(env.id);
    setRenameEnvValue(env.name);
    setRenameError(null);
  }

  function handleSaveRenameEnv(id: string) {
    const val = validateEnvironmentName(renameEnvValue);
    if (!val.valid) {
      setRenameError(val.error || 'Invalid name');
      return;
    }
    renameEnvMutation.mutate({ id, name: renameEnvValue.trim() });
  }

  if (!envModalOpen) return null;

  const filteredVars = filterVariables(variables, varSearchQuery);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={() => setEnvModalOpen(false)}
    >
      <div
        className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col h-[650px] text-zinc-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-zinc-800/60 border border-zinc-700/60 text-zinc-300">
              <Database size={20} />
            </div>
            <div>
              <h2 className="font-semibold text-base text-zinc-100 flex items-center gap-2">
                Environments & Variables
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  {environments.length} Environment{environments.length === 1 ? '' : 's'}
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Manage workspace environments. Sensitive variables are encrypted at rest with AES-GCM.
              </p>
            </div>
          </div>
          <button
            onClick={() => setEnvModalOpen(false)}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body Split */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Environments List */}
          <div className="w-72 border-r border-zinc-800 p-4 flex flex-col space-y-3 bg-zinc-950/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Environments
              </span>
              <button
                onClick={() => setShowAddEnv(!showAddEnv)}
                className="text-xs text-zinc-300 hover:text-white font-medium flex items-center gap-1 transition px-2 py-0.5 rounded hover:bg-zinc-800"
              >
                <Plus size={13} />
                <span>New</span>
              </button>
            </div>

            {/* New Environment Input Form */}
            {showAddEnv && (
              <div className="flex gap-1.5 p-2 bg-zinc-900/80 border border-zinc-700/80 rounded-lg">
                <input
                  type="text"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newEnvName.trim()) {
                      createEnvMutation.mutate(newEnvName.trim());
                    } else if (e.key === 'Escape') {
                      setShowAddEnv(false);
                    }
                  }}
                  placeholder="e.g. LOCAL"
                  autoFocus
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
                <button
                  onClick={() => newEnvName.trim() && createEnvMutation.mutate(newEnvName.trim())}
                  disabled={!newEnvName.trim() || createEnvMutation.isPending}
                  className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-2.5 py-1 rounded text-xs font-semibold text-white transition"
                >
                  Add
                </button>
              </div>
            )}

            {/* Environments Navigation List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {environments.length === 0 ? (
                <div className="text-center py-12 text-zinc-600 text-xs">
                  No environments created yet.
                </div>
              ) : (
                environments.map((env) => {
                  const isSelected = selectedEnvId === env.id;
                  const isEditingThis = editingEnvId === env.id;

                  if (isEditingThis) {
                    return (
                      <div
                        key={env.id}
                        className="p-1.5 bg-zinc-900 border border-zinc-700 rounded-lg space-y-1"
                      >
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={renameEnvValue}
                            onChange={(e) => setRenameEnvValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRenameEnv(env.id);
                              else if (e.key === 'Escape') setEditingEnvId(null);
                            }}
                            autoFocus
                            className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 font-medium focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveRenameEnv(env.id)}
                            disabled={renameEnvMutation.isPending}
                            className="p-1 text-emerald-400 hover:text-emerald-300"
                            title="Save name"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setEditingEnvId(null)}
                            className="p-1 text-zinc-500 hover:text-zinc-300"
                            title="Cancel"
                          >
                            <X size={13} />
                          </button>
                        </div>
                        {renameError && (
                          <div className="text-[10px] text-red-400">{renameError}</div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={env.id}
                      onClick={() => setSelectedEnvId(env.id)}
                      onDoubleClick={() => startRenamingEnv(env)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition cursor-pointer group ${
                        isSelected
                          ? 'bg-zinc-800 text-white font-medium border border-zinc-700 shadow-sm'
                          : 'hover:bg-zinc-900/80 text-zinc-300 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="truncate">{env.name}</span>
                        {env.is_default && (
                          <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
                            default
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Rename button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRenamingEnv(env);
                          }}
                          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                          title="Rename environment"
                        >
                          <Edit2 size={12} />
                        </button>

                        {/* Duplicate button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateEnvMutation.mutate(env);
                          }}
                          disabled={duplicateEnvMutation.isPending}
                          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                          title={`Duplicate environment "${env.name}"`}
                        >
                          <Copy size={12} />
                        </button>

                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEnvToDelete({ id: env.id, name: env.name });
                          }}
                          className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition"
                          title="Delete environment"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Variables Management */}
          <div className="flex-1 p-5 flex flex-col overflow-hidden bg-zinc-950">
            {selectedEnvironment ? (
              <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
                {/* Environment Details Header & Quick Actions */}
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold text-zinc-100">
                      {selectedEnvironment.name}
                    </span>
                    <button
                      onClick={() => startRenamingEnv(selectedEnvironment)}
                      className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition"
                      title="Rename environment"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => duplicateEnvMutation.mutate(selectedEnvironment)}
                      disabled={duplicateEnvMutation.isPending}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-300 hover:text-white transition"
                      title="Duplicate this environment"
                    >
                      <Copy size={11} />
                      <span>Duplicate</span>
                    </button>
                  </div>

                  <div className="relative flex items-center">
                    <Search
                      size={13}
                      className="absolute left-2.5 text-zinc-500 pointer-events-none"
                    />
                    <input
                      type="text"
                      value={varSearchQuery}
                      onChange={(e) => setVarSearchQuery(e.target.value)}
                      placeholder="Filter variables..."
                      className="w-56 bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                    />
                    {varSearchQuery && (
                      <button
                        onClick={() => setVarSearchQuery('')}
                        className="absolute right-2 text-zinc-500 hover:text-zinc-300"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Add New Variable Form */}
                <div className="p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/80 space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block">
                    Add New Variable
                  </span>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder="VARIABLE_KEY"
                      className="w-1/3 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                    />

                    {/* Value Input with Show/Hide toggle button when sensitive */}
                    <div className="relative flex-1 flex items-center">
                      <input
                        type={newSensitive && !showNewVal ? 'password' : 'text'}
                        value={newVal}
                        onChange={(e) => setNewVal(e.target.value)}
                        placeholder="Value"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 pr-8"
                      />
                      {newSensitive && (
                        <button
                          type="button"
                          onClick={() => setShowNewVal(!showNewVal)}
                          className="absolute right-2 p-0.5 text-zinc-500 hover:text-zinc-300 transition"
                          title={showNewVal ? 'Hide value' : 'Show value'}
                        >
                          {showNewVal ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      )}
                    </div>

                    {/* Sensitive Toggle */}
                    <label
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-xs text-zinc-400 cursor-pointer select-none hover:border-zinc-700 transition"
                      title="Encrypt at rest with AES-GCM"
                    >
                      <input
                        type="checkbox"
                        checked={newSensitive}
                        onChange={(e) => {
                          setNewSensitive(e.target.checked);
                          if (!e.target.checked) setShowNewVal(false);
                        }}
                        className="rounded bg-zinc-900 border-zinc-700 text-primary focus:ring-0"
                      />
                      <Lock size={12} className={newSensitive ? 'text-amber-400' : 'text-zinc-500'} />
                      <span className={newSensitive ? 'text-amber-400 font-medium' : ''}>
                        Sensitive
                      </span>
                    </label>

                    <button
                      onClick={() => newKey.trim() && addVarMutation.mutate()}
                      disabled={!newKey.trim() || addVarMutation.isPending}
                      className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1"
                    >
                      <Plus size={13} />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                {/* Variables List / Table */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {filteredVars.length === 0 ? (
                    <div className="py-16 text-center text-zinc-600 text-xs flex flex-col items-center gap-2 select-none">
                      <Sparkles size={24} className="text-zinc-800" />
                      <span>
                        {varSearchQuery
                          ? `No variables matching "${varSearchQuery}"`
                          : 'No variables in this environment yet.'}
                      </span>
                    </div>
                  ) : (
                    filteredVars.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center gap-2.5 p-2 bg-zinc-900/40 border border-zinc-800/80 rounded-xl text-xs hover:border-zinc-700 transition"
                      >
                        {editingVarId === v.id ? (
                          // Edit mode with Show/Hide toggle on sensitive input
                          <>
                            <input
                              type="text"
                              value={editKey}
                              onChange={(e) => setEditKey(e.target.value)}
                              placeholder="Key"
                              className="w-1/3 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs font-mono text-zinc-100 focus:outline-none"
                            />
                            <div className="relative flex-1 flex items-center">
                              <input
                                type={editSensitive && !showEditVal ? 'password' : 'text'}
                                value={editVal}
                                onChange={(e) => setEditVal(e.target.value)}
                                placeholder="Value"
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs font-mono text-zinc-100 focus:outline-none pr-8"
                              />
                              {editSensitive && (
                                <button
                                  type="button"
                                  onClick={() => setShowEditVal(!showEditVal)}
                                  className="absolute right-2 p-0.5 text-zinc-500 hover:text-zinc-300"
                                  title={showEditVal ? 'Hide value' : 'Show value'}
                                >
                                  {showEditVal ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                              )}
                            </div>
                            <label
                              className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-zinc-800 bg-zinc-950 text-xs text-zinc-400 cursor-pointer select-none"
                              title="Sensitive / Encrypted"
                            >
                              <input
                                type="checkbox"
                                checked={editSensitive}
                                onChange={(e) => {
                                  setEditSensitive(e.target.checked);
                                  if (!e.target.checked) setShowEditVal(false);
                                }}
                                className="rounded bg-zinc-900 border-zinc-700 text-primary focus:ring-0"
                              />
                              <Lock size={12} className={editSensitive ? 'text-amber-400' : ''} />
                            </label>
                            <button
                              onClick={() => handleSaveEditVar(v.id)}
                              disabled={updateVarMutation.isPending}
                              className="p-1.5 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/20 transition"
                              title="Save changes"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingVarId(null)}
                              className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                              title="Cancel"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          // View mode
                          <>
                            <span className="w-1/3 font-mono font-semibold text-zinc-200 truncate">
                              {v.key}
                            </span>
                            <div className="flex-1 flex items-center gap-2 font-mono text-zinc-300 truncate">
                              {v.is_sensitive && !showMasked[v.id] ? (
                                <span className="text-zinc-500 tracking-wider">••••••••••••••••</span>
                              ) : (
                                <span className="truncate select-text">{v.value}</span>
                              )}
                              {v.is_sensitive && (
                                <button
                                  onClick={() =>
                                    setShowMasked((prev) => ({
                                      ...prev,
                                      [v.id]: !prev[v.id],
                                    }))
                                  }
                                  className="text-zinc-500 hover:text-zinc-300 p-0.5 transition"
                                  title={showMasked[v.id] ? 'Hide value' : 'Show value'}
                                >
                                  {showMasked[v.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                              )}
                            </div>
                            {v.is_sensitive && (
                              <span className="text-[10px] text-amber-400/90 font-medium px-2 py-0.5 bg-amber-950/40 rounded-full border border-amber-800/60 flex-shrink-0 select-none">
                                Encrypted
                              </span>
                            )}
                            <button
                              onClick={() => startEditingVar(v)}
                              className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition"
                              title="Edit variable"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => deleteVarMutation.mutate(v.id)}
                              className="text-zinc-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-zinc-800 transition"
                              title="Delete variable"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="text-zinc-600 text-center py-28 text-xs flex flex-col items-center gap-2 select-none">
                <Layers size={28} className="text-zinc-800" />
                <span>Select or create an environment on the left to view variables</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={!!envToDelete}
        type="environment"
        name={envToDelete?.name}
        isPending={deleteEnvMutation.isPending}
        onConfirm={async () => {
          if (envToDelete) {
            await deleteEnvMutation.mutateAsync(envToDelete.id);
          }
        }}
        onClose={() => setEnvToDelete(null)}
      />
    </div>
  );
};
