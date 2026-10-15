import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type { Collection, CollectionAuthSettings, VariableResponse } from '@api-lab/api-types';
import { VariableInput } from '../common/VariableInput';
import { X, Shield, Save, Check } from 'lucide-react';

interface CollectionSettingsModalProps {
  collection: Collection;
  isOpen: boolean;
  onClose: () => void;
  activeVariables?: Record<string, string>;
}

export const CollectionSettingsModal: React.FC<CollectionSettingsModalProps> = ({
  collection,
  isOpen,
  onClose,
  activeVariables,
}) => {
  const queryClient = useQueryClient();
  const { activeEnvironmentId } = useAppStore();

  // Fetch active environment variables so syntax highlighting is always accurate (Bug 4 Fix)
  const { data: envVars = [] } = useQuery<VariableResponse[]>({
    queryKey: ['variables', activeEnvironmentId],
    queryFn: () =>
      activeEnvironmentId
        ? apiRequest<VariableResponse[]>(`/environments/${activeEnvironmentId}/variables`)
        : Promise.resolve([]),
    enabled: !!activeEnvironmentId && isOpen,
  });

  const effectiveVariables = React.useMemo(() => {
    const map: Record<string, string> = { ...(activeVariables || {}) };
    for (const v of envVars) {
      map[v.key] = v.value;
    }
    return map;
  }, [envVars, activeVariables]);

  const [authType, setAuthType] = useState<CollectionAuthSettings['auth_type']>(
    collection.settings?.auth?.auth_type || 'none'
  );
  const [token, setToken] = useState(collection.settings?.auth?.token || '');
  const [username, setUsername] = useState(collection.settings?.auth?.username || '');
  const [password, setPassword] = useState(collection.settings?.auth?.password || '');
  const [headerName, setHeaderName] = useState(
    collection.settings?.auth?.header_name || 'Authorization'
  );
  const [headerValue, setHeaderValue] = useState(
    collection.settings?.auth?.header_value || ''
  );

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  React.useEffect(() => {
    setAuthType(collection.settings?.auth?.auth_type || 'none');
    setToken(collection.settings?.auth?.token || '');
    setUsername(collection.settings?.auth?.username || '');
    setPassword(collection.settings?.auth?.password || '');
    setHeaderName(collection.settings?.auth?.header_name || 'Authorization');
    setHeaderValue(collection.settings?.auth?.header_value || '');
  }, [collection.id, collection.settings]);

  const updateMutation = useMutation({
    mutationFn: () => {
      const authSettings: CollectionAuthSettings = {
        auth_type: authType,
        token: authType === 'bearer' ? token : undefined,
        username: authType === 'basic' ? username : undefined,
        password: authType === 'basic' ? password : undefined,
        header_name: authType === 'custom' ? headerName : undefined,
        header_value: authType === 'custom' ? headerValue : undefined,
      };

      return apiRequest<Collection>(`/collections/${collection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          settings: {
            auth: authSettings,
          },
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['collection', collection.id] });
      setStatusMessage('Settings saved successfully');
      setTimeout(() => {
        setStatusMessage(null);
        onClose();
      }, 1000);
    },
    onError: (err: any) => {
      setStatusMessage(`Error saving: ${err.message}`);
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-secondary" />
            <h2 className="text-xs font-semibold text-zinc-100">
              Collection Settings — {collection.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 text-xs">
          <div>
            <span className="text-[11px] font-semibold text-zinc-300 block mb-1">
              Shared Authorization (Inherited)
            </span>
            <p className="text-[11px] text-zinc-400 mb-3">
              Configure credentials once for this collection. All HTTP endpoints and gRPC calls in this collection will automatically inherit and use this token.
            </p>

            <label className="block text-zinc-400 mb-1">Auth Type</label>
            <select
              value={authType}
              onChange={(e) => setAuthType(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
            >
              <option value="none">No Auth (Inherit Disabled)</option>
              <option value="bearer">Bearer Token (JWT / API Token)</option>
              <option value="basic">Basic Auth (Username & Password)</option>
              <option value="custom">Custom Header (API Key)</option>
            </select>
          </div>

          {authType === 'bearer' && (
            <div className="space-y-1">
              <label className="block text-zinc-400">Bearer Token</label>
              <div className="bg-zinc-950 border border-zinc-800 rounded focus-within:border-zinc-700 h-8">
                <VariableInput
                  value={token}
                  onChange={setToken}
                  variables={effectiveVariables}
                  placeholder="{{TOKEN}} or eyJhbGciOi..."
                  className="w-full h-full"
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                Injected into HTTP <code className="text-zinc-400 font-mono">Authorization: Bearer &lt;token&gt;</code> and gRPC metadata <code className="text-zinc-400 font-mono">authorization</code>.
              </p>
            </div>
          )}

          {authType === 'basic' && (
            <div className="space-y-2">
              <div>
                <label className="block text-zinc-400 mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username or {{USER}}"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="password or {{PASS}}"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                />
              </div>
            </div>
          )}

          {authType === 'custom' && (
            <div className="space-y-2">
              <div>
                <label className="block text-zinc-400 mb-1">Header / Metadata Name</label>
                <input
                  type="text"
                  value={headerName}
                  onChange={(e) => setHeaderName(e.target.value)}
                  placeholder="e.g. X-API-Key or x-client-id"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Header Value</label>
                <div className="bg-zinc-950 border border-zinc-800 rounded focus-within:border-zinc-700 h-8">
                  <VariableInput
                    value={headerValue}
                    onChange={setHeaderValue}
                    variables={effectiveVariables}
                    placeholder="{{API_KEY}}"
                    className="w-full h-full"
                  />
                </div>
              </div>
            </div>
          )}

          {statusMessage && (
            <div className="p-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-300 flex items-center gap-1.5">
              <Check size={12} className="text-emerald-400" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow transition"
            >
              <Save size={12} />
              <span>{updateMutation.isPending ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
