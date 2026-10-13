import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type { Environment, VariableResponse } from '@api-lab/api-types';
import { X, Plus, Trash2, Eye, EyeOff, Lock } from 'lucide-react';

export const EnvironmentModal: React.FC = () => {
  const queryClient = useQueryClient();
  const { envModalOpen, setEnvModalOpen, activeWorkspaceId } = useAppStore();

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [newEnvName, setNewEnvName] = useState('');
  const [showAddEnv, setShowAddEnv] = useState(false);

  // New variable state
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [newSensitive, setNewSensitive] = useState(false);
  const [showMasked, setShowMasked] = useState<Record<string, boolean>>({});

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
  React.useEffect(() => {
    if (environments.length > 0 && !selectedEnvId) {
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

  // Delete Environment
  const deleteEnvMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/environments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environments', activeWorkspaceId] });
      setSelectedEnvId(null);
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

  if (!envModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col h-[520px] text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <h2 className="font-semibold text-base">Environments & Variables</h2>
            <p className="text-xs text-zinc-400">
              Manage workspace environments. Sensitive variables are encrypted at rest with AES-GCM.
            </p>
          </div>
          <button
            onClick={() => setEnvModalOpen(false)}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body Split */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Environments List */}
          <div className="w-52 border-r border-zinc-800 p-3 flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400">Environments</span>
              <button
                onClick={() => setShowAddEnv(!showAddEnv)}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
              >
                <Plus size={12} /> New
              </button>
            </div>

            {showAddEnv && (
              <div className="flex gap-1 pb-1">
                <input
                  type="text"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  placeholder="e.g. Staging"
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => newEnvName.trim() && createEnvMutation.mutate(newEnvName.trim())}
                  className="bg-indigo-600 px-2 rounded text-xs text-white"
                >
                  +
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1">
              {environments.map((env) => (
                <div
                  key={env.id}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition cursor-pointer group ${
                    selectedEnvId === env.id
                      ? 'bg-indigo-950 text-indigo-200 font-medium border border-indigo-800'
                      : 'hover:bg-zinc-800/60 text-zinc-400'
                  }`}
                  onClick={() => setSelectedEnvId(env.id)}
                >
                  <span className="truncate">{env.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteEnvMutation.mutate(env.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Variables Table */}
          <div className="flex-1 p-4 flex flex-col overflow-hidden">
            {selectedEnvId ? (
              <div className="flex-1 flex flex-col space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-zinc-300">
                    Variables for Selected Environment
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    Use syntax &#123;&#123;KEY&#125;&#125; in requests
                  </span>
                </div>

                {/* Add new variable */}
                <div className="flex gap-2 items-center bg-zinc-950/60 p-2 rounded border border-zinc-800">
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="VARIABLE_NAME"
                    className="w-1/3 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    value={newVal}
                    onChange={(e) => setNewVal(e.target.value)}
                    placeholder="Value"
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer" title="Encrypt value with AES-GCM">
                    <input
                      type="checkbox"
                      checked={newSensitive}
                      onChange={(e) => setNewSensitive(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-700"
                    />
                    <Lock size={12} className={newSensitive ? 'text-amber-400' : ''} />
                  </label>
                  <button
                    onClick={() => newKey.trim() && addVarMutation.mutate()}
                    disabled={!newKey.trim() || addVarMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-2.5 py-1 rounded text-xs font-medium"
                  >
                    Add
                  </button>
                </div>

                {/* Variables list */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {variables.length === 0 ? (
                    <div className="text-zinc-600 text-center py-10 text-xs">
                      No variables defined in this environment.
                    </div>
                  ) : (
                    variables.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center gap-2 p-1.5 bg-zinc-950/40 border border-zinc-800/80 rounded text-xs"
                      >
                        <span className="w-1/3 font-mono font-semibold text-indigo-400 truncate">
                          {v.key}
                        </span>
                        <div className="flex-1 flex items-center gap-1.5 font-mono text-zinc-300 truncate">
                          {v.is_sensitive && !showMasked[v.id] ? (
                            <span className="text-zinc-500">••••••••••••••••</span>
                          ) : (
                            <span className="truncate">{v.value}</span>
                          )}
                          {v.is_sensitive && (
                            <button
                              onClick={() =>
                                setShowMasked((prev) => ({
                                  ...prev,
                                  [v.id]: !prev[v.id],
                                }))
                              }
                              className="text-zinc-500 hover:text-zinc-300 p-0.5"
                            >
                              {showMasked[v.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          )}
                        </div>
                        {v.is_sensitive && (
                          <span className="text-[10px] text-amber-400/80 font-medium px-1 bg-amber-950/40 rounded border border-amber-900/60">
                            Encrypted
                          </span>
                        )}
                        <button
                          onClick={() => deleteVarMutation.mutate(v.id)}
                          className="text-zinc-500 hover:text-red-400 p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="text-zinc-600 text-center py-20 text-xs">
                Select or create an environment on the left
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
