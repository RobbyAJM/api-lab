import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type {
  Collection,
  CollectionAuthSettings,
  CollectionHeaderSetting,
  VariableResponse,
} from '@api-lab/api-types';
import { VariableInput } from '../common/VariableInput';
import { Select } from '../common/Select';
import { X, Shield, Settings, Sliders, Plus, Trash2, Save, Check } from 'lucide-react';

interface CollectionSettingsModalProps {
  collection: Collection;
  isOpen: boolean;
  onClose: () => void;
  activeVariables?: Record<string, string>;
}

type SettingsTab = 'general' | 'auth' | 'headers';

export const CollectionSettingsModal: React.FC<CollectionSettingsModalProps> = ({
  collection,
  isOpen,
  onClose,
  activeVariables,
}) => {
  const queryClient = useQueryClient();
  const { activeEnvironmentId } = useAppStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // Name state
  const [name, setName] = useState(collection.name || '');

  // Fetch active environment variables so syntax highlighting is always accurate
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

  // Auth state
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

  // General settings state
  const [timeoutMs, setTimeoutMs] = useState<string>(
    collection.settings?.timeout_ms ? String(collection.settings.timeout_ms) : ''
  );
  const [description, setDescription] = useState(collection.settings?.description || '');

  // Shared Headers state
  const [headers, setHeaders] = useState<CollectionHeaderSetting[]>(() => {
    return collection.settings?.headers && collection.settings.headers.length > 0
      ? collection.settings.headers.map((h) => ({ ...h, enabled: h.enabled !== false }))
      : [];
  });

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Synchronize state when collection changes
  useEffect(() => {
    setName(collection.name || '');
    setAuthType(collection.settings?.auth?.auth_type || 'none');
    setToken(collection.settings?.auth?.token || '');
    setUsername(collection.settings?.auth?.username || '');
    setPassword(collection.settings?.auth?.password || '');
    setHeaderName(collection.settings?.auth?.header_name || 'Authorization');
    setHeaderValue(collection.settings?.auth?.header_value || '');
    setTimeoutMs(
      collection.settings?.timeout_ms ? String(collection.settings.timeout_ms) : ''
    );
    setDescription(collection.settings?.description || '');
    setHeaders(
      collection.settings?.headers && collection.settings.headers.length > 0
        ? collection.settings.headers.map((h) => ({ ...h, enabled: h.enabled !== false }))
        : []
    );
  }, [collection.id, collection.name, collection.settings]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const updateMutation = useMutation({
    mutationFn: () => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error('Collection name cannot be empty');
      }

      const authSettings: CollectionAuthSettings = {
        auth_type: authType,
        token: authType === 'bearer' ? token : undefined,
        username: authType === 'basic' ? username : undefined,
        password: authType === 'basic' ? password : undefined,
        header_name: authType === 'custom' ? headerName : undefined,
        header_value: authType === 'custom' ? headerValue : undefined,
      };

      const validHeaders = headers
        .filter((h) => h.key.trim() !== '')
        .map((h) => ({
          key: h.key.trim(),
          value: h.value || '',
          enabled: h.enabled !== false,
        }));

      const parsedTimeout = timeoutMs.trim() ? parseInt(timeoutMs.trim(), 10) : undefined;

      return apiRequest<Collection>(`/collections/${collection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: trimmedName,
          settings: {
            auth: authSettings,
            headers: validHeaders,
            timeout_ms: !isNaN(parsedTimeout as number) && (parsedTimeout as number) > 0 ? parsedTimeout : undefined,
            description: description.trim() || undefined,
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
      }, 800);
    },
    onError: (err: any) => {
      setStatusMessage(`Error saving: ${err.message}`);
    },
  });

  const handleAddHeader = () => {
    setHeaders((prev) => [...prev, { key: '', value: '', enabled: true }]);
  };

  const handleHeaderChange = (index: number, field: keyof CollectionHeaderSetting, val: any) => {
    setHeaders((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleRemoveHeader = (index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 font-sans select-none animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-md max-w-xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-950/80 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-zinc-800 border border-zinc-700/80 text-zinc-300">
              <Settings size={14} className="text-secondary" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                Collection Settings
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  {name || collection.name}
                </span>
              </h2>
              <p className="text-[10px] text-zinc-400">
                Configurations and options for this collection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-md hover:bg-zinc-800 transition"
            title="Close (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 border-b border-zinc-800/80 flex items-center gap-4 text-xs bg-zinc-950 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-2.5 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'general'
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Settings size={13} />
            <span>General</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('auth')}
            className={`py-2.5 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'auth'
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Shield size={13} />
            <span>Authorization</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('headers')}
            className={`py-2.5 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'headers'
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders size={13} />
            <span>Shared Headers</span>
            {headers.filter((h) => h.key.trim()).length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                {headers.filter((h) => h.key.trim()).length}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
          {/* TAB 1: General */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="block text-zinc-300 font-semibold mb-1">
                  Collection Name <span className="text-red-400">*</span>
                </label>
                <p className="text-[11px] text-zinc-400 mb-2 leading-relaxed">
                  Display name of this collection in workspace sidebar and exports.
                </p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Authentication API or Payments Service"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700 font-sans"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-semibold mb-1">
                  Default Request Timeout (ms)
                </label>
                <p className="text-[11px] text-zinc-400 mb-2 leading-relaxed">
                  Applied to requests in this collection that do not specify their own timeout. Default: 30000ms.
                </p>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(e.target.value)}
                  placeholder="30000"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-semibold mb-1">
                  Description / Documentation
                </label>
                <p className="text-[11px] text-zinc-400 mb-2 leading-relaxed">
                  Notes or context for team members working on this collection.
                </p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Notes, prerequisites, environment setup instructions..."
                  rows={3}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700 resize-none font-sans"
                />
              </div>
            </div>
          )}

          {/* TAB 2: Authorization */}
          {activeTab === 'auth' && (
            <div className="space-y-4">
              <div>
                <span className="text-[11px] font-semibold text-zinc-200 block mb-1">
                  Shared Authorization (Inherited)
                </span>
                <p className="text-[11px] text-zinc-400 mb-3 leading-relaxed">
                  Configure credentials once for this collection. HTTP endpoints with auth set to{' '}
                  <code className="text-zinc-300 font-mono">Inherit</code> and gRPC requests will automatically inherit these credentials.
                </p>

                <label className="block text-zinc-400 mb-1 font-medium">Auth Type</label>
                <Select
                  value={authType}
                  onChange={(val) => setAuthType(val as any)}
                  options={[
                    { value: 'none', label: 'No Auth (Inherit Disabled)' },
                    { value: 'bearer', label: 'Bearer Token (JWT / API Token)' },
                    { value: 'basic', label: 'Basic Auth (Username & Password)' },
                    { value: 'custom', label: 'Custom Header (API Key)' },
                  ]}
                  fontMono
                />
              </div>

              {authType === 'bearer' && (
                <div className="space-y-1.5">
                  <label className="block text-zinc-400 font-medium">Bearer Token</label>
                  <div className="bg-zinc-950 border border-zinc-800 rounded focus-within:border-zinc-700 h-8">
                    <VariableInput
                      value={token}
                      onChange={setToken}
                      variables={effectiveVariables}
                      placeholder="{{TOKEN}} or eyJhbGciOi..."
                      className="w-full h-full"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    Injected into HTTP <code className="text-zinc-400">Authorization: Bearer &lt;token&gt;</code> and gRPC metadata <code className="text-zinc-400">authorization</code>.
                  </p>
                </div>
              )}

              {authType === 'basic' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-zinc-400 mb-1 font-medium">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username or {{USER}}"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1 font-medium">Password</label>
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
                <div className="space-y-3">
                  <div>
                    <label className="block text-zinc-400 mb-1 font-medium">Header / Metadata Name</label>
                    <input
                      type="text"
                      value={headerName}
                      onChange={(e) => setHeaderName(e.target.value)}
                      placeholder="e.g. X-API-Key or x-client-id"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1 font-medium">Header Value</label>
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
            </div>
          )}

          {/* TAB 3: Shared Headers */}
          {activeTab === 'headers' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-zinc-200">
                    Collection-level Shared Headers
                  </span>
                  <button
                    type="button"
                    onClick={handleAddHeader}
                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 rounded text-[11px] font-medium flex items-center gap-1 transition"
                  >
                    <Plus size={12} />
                    <span>Add Header</span>
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 mb-3 leading-relaxed">
                  Injected into every request in this collection. Endpoints can override any header by defining the same header key.
                </p>
              </div>

              {headers.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-zinc-800 rounded-md text-zinc-500">
                  <Sliders size={20} className="mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No collection headers configured</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">Click "Add Header" above to add shared headers like Accept or X-Tenant-ID</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[24px_1fr_1fr_28px] gap-2 px-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                    <span></span>
                    <span>Header Key</span>
                    <span>Header Value</span>
                    <span></span>
                  </div>

                  {headers.map((h, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[24px_1fr_1fr_28px] gap-2 items-center bg-zinc-950/60 p-1 rounded border border-zinc-800/80"
                    >
                      <input
                        type="checkbox"
                        checked={h.enabled !== false}
                        onChange={(e) => handleHeaderChange(idx, 'enabled', e.target.checked)}
                        className="rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-0 cursor-pointer ml-1"
                        title={h.enabled !== false ? 'Enabled' : 'Disabled'}
                      />
                      <input
                        type="text"
                        value={h.key}
                        onChange={(e) => handleHeaderChange(idx, 'key', e.target.value)}
                        placeholder="e.g. Accept"
                        className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                      />
                      <div className="bg-zinc-900 border border-zinc-800 rounded focus-within:border-zinc-700 h-7">
                        <VariableInput
                          value={h.value}
                          onChange={(val) => handleHeaderChange(idx, 'value', val)}
                          variables={effectiveVariables}
                          placeholder="{{VALUE}} or application/json"
                          className="w-full h-full text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveHeader(idx)}
                        className="p-1 text-zinc-500 hover:text-red-400 rounded transition"
                        title="Delete header"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {statusMessage && (
            <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-300 flex items-center gap-1.5">
              <Check size={13} className="text-emerald-400 flex-shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-zinc-800 bg-zinc-950/60 flex-shrink-0">
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
            disabled={updateMutation.isPending || !name.trim()}
            className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow transition"
          >
            <Save size={12} />
            <span>{updateMutation.isPending ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
