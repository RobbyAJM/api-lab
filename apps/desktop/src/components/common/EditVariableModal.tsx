import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type { Environment, VariableResponse } from '@api-lab/api-types';
import { X, Lock, Eye, EyeOff, Save } from 'lucide-react';
import { Select } from './Select';

export const EditVariableModal: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    editVariableModal,
    closeEditVariableModal,
    activeWorkspaceId,
    activeEnvironmentId,
  } = useAppStore();

  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [isSensitive, setIsSensitive] = useState(false);
  const [showPlainValue, setShowPlainValue] = useState(false);
  const [targetEnvId, setTargetEnvId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Fetch workspace environments for selector
  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ['environments', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? apiRequest<Environment[]>(`/workspaces/${activeWorkspaceId}/environments`)
        : Promise.resolve([]),
    enabled: !!activeWorkspaceId && !!editVariableModal?.isOpen,
  });

  useEffect(() => {
    if (editVariableModal?.isOpen) {
      setKey(editVariableModal.key || '');
      setValue(editVariableModal.value || '');
      setIsSensitive(Boolean(editVariableModal.isSensitive));
      setShowPlainValue(false);
      setError(null);

      // Default environment: provided, or active, or first in workspace
      const envId =
        editVariableModal.environmentId ||
        activeEnvironmentId ||
        environments[0]?.id ||
        '';
      setTargetEnvId(envId);
    }
  }, [editVariableModal, activeEnvironmentId, environments]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedKey = key.trim();
      if (!trimmedKey) {
        throw new Error('Variable key cannot be empty');
      }

      if (editVariableModal?.variableId) {
        // Update existing variable
        return await apiRequest<VariableResponse>(
          `/variables/${editVariableModal.variableId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              key: trimmedKey,
              value,
              is_sensitive: isSensitive,
            }),
          }
        );
      } else {
        // Create new variable in target environment
        if (!targetEnvId) {
          throw new Error('Please select an environment for this variable');
        }
        return await apiRequest<VariableResponse>(
          `/environments/${targetEnvId}/variables`,
          {
            method: 'POST',
            body: JSON.stringify({
              key: trimmedKey,
              value,
              is_sensitive: isSensitive,
            }),
          }
        );
      }
    },
    onSuccess: (data) => {
      const envId = data.environment_id || targetEnvId;
      queryClient.invalidateQueries({ queryKey: ['variables', envId] });
      closeEditVariableModal();
    },
    onError: (err: any) => {
      setError(err?.message || 'Failed to save variable');
    },
  });

  if (!editVariableModal?.isOpen) return null;

  const isEditing = Boolean(editVariableModal.variableId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 font-sans"
      onClick={closeEditVariableModal}
      onKeyDown={(e) => {
        if (e.key === 'Escape') closeEditVariableModal();
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          saveMutation.mutate();
        }
      }}
    >
      <div
        className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl overflow-hidden flex flex-col text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/60 select-none">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary/20 border border-primary/40 flex items-center justify-center text-primary text-xs font-mono font-bold">
              {'{ }'}
            </div>
            <h2 className="text-xs font-semibold text-zinc-200">
              {isEditing ? 'Edit Variable' : 'Define Variable'}
            </h2>
          </div>
          <button
            onClick={closeEditVariableModal}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition"
          >
            <X size={14} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 space-y-3.5 text-xs">
          {error && (
            <div className="p-2.5 rounded bg-rose-950/50 border border-rose-800/60 text-rose-300 text-[11px]">
              {error}
            </div>
          )}

          {/* Environment Selector */}
          <div>
            <label className="block text-zinc-400 font-medium mb-1 text-[11px]">
              Environment
            </label>
            <Select
              value={targetEnvId}
              disabled={isEditing}
              onChange={setTargetEnvId}
              options={environments.map((env) => ({
                value: env.id,
                label: env.name,
                badge: env.id === activeEnvironmentId ? 'Active' : undefined,
              }))}
              placeholder={environments.length === 0 ? 'No environments found' : 'Select environment'}
              fontMono
            />
          </div>

          {/* Variable Key */}
          <div>
            <label className="block text-zinc-400 font-medium mb-1 text-[11px]">
              Variable Name (Key)
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-2.5 text-zinc-500 font-mono text-[11px]">
                {'{{'}
              </span>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="VARIABLE_NAME"
                className="w-full bg-zinc-900 border border-zinc-800 rounded pl-7 pr-7 py-1.5 font-mono text-zinc-200 text-xs focus:border-primary focus:outline-none uppercase"
                autoFocus
              />
              <span className="absolute right-2.5 text-zinc-500 font-mono text-[11px]">
                {'}}'}
              </span>
            </div>
          </div>

          {/* Variable Value */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-zinc-400 font-medium text-[11px]">
                Value
              </label>
              {isSensitive && (
                <button
                  type="button"
                  onClick={() => setShowPlainValue(!showPlainValue)}
                  className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition"
                >
                  {showPlainValue ? <EyeOff size={11} /> : <Eye size={11} />}
                  <span>{showPlainValue ? 'Hide' : 'Show'}</span>
                </button>
              )}
            </div>
            <input
              type={isSensitive && !showPlainValue ? 'password' : 'text'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter variable value..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-zinc-200 text-xs focus:border-primary focus:outline-none"
            />
          </div>

          {/* Sensitive Checkbox */}
          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isSensitive}
                onChange={(e) => setIsSensitive(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-0 cursor-pointer"
              />
              <div className="flex items-center gap-1.5 text-zinc-300 text-xs">
                <Lock size={12} className={isSensitive ? 'text-amber-400' : 'text-zinc-500'} />
                <span>Sensitive variable (encrypted at rest, masked by default)</span>
              </div>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-800/80 bg-zinc-900/40 select-none">
          <span className="text-[10px] text-zinc-500 font-mono">
            Ctrl+Enter to save
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeEditVariableModal}
              disabled={saveMutation.isPending}
              className="px-3 py-1 text-zinc-400 hover:text-zinc-200 text-xs rounded hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !key.trim()}
              className="flex items-center gap-1.5 px-3 py-1 bg-primary hover:bg-primary-hover text-primary-foreground font-medium text-xs rounded transition disabled:opacity-50"
            >
              <Save size={12} />
              <span>{saveMutation.isPending ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
