import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { executeNativeHttp } from '../../api/native';
import type { Endpoint, HttpAuth, HttpExecutionRequest } from '@api-lab/api-types';
import { Send, Save, Plus, Trash2 } from 'lucide-react';

export const HttpRequestEditor: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const queryClient = useQueryClient();
  const { activeVariables, setLastHttpResponse } = useAppStore();

  const [method, setMethod] = useState(endpoint.config?.method || 'GET');
  const [url, setUrl] = useState(endpoint.config?.url || 'https://httpbin.org/get');
  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body' | 'auth'>('params');

  // Query Params & Headers state
  const [queryParams, setQueryParams] = useState<[string, string][]>(
    endpoint.config?.query_params || []
  );
  const [headers, setHeaders] = useState<[string, string][]>(() => {
    const raw = endpoint.config?.headers || {};
    return Object.entries(raw);
  });

  // Body & Auth state
  const [bodyType, setBodyType] = useState<'none' | 'json' | 'text' | 'form'>(
    endpoint.config?.body_type || 'json'
  );
  const [body, setBody] = useState<string>(endpoint.config?.body || '');
  const [auth, setAuth] = useState<HttpAuth>(
    endpoint.config?.auth || { auth_type: 'none' }
  );

  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Sync state if endpoint prop changes
  useEffect(() => {
    setMethod(endpoint.config?.method || 'GET');
    setUrl(endpoint.config?.url || 'https://httpbin.org/get');
    setQueryParams(endpoint.config?.query_params || []);
    setHeaders(Object.entries(endpoint.config?.headers || {}));
    setBodyType(endpoint.config?.body_type || 'json');
    setBody(endpoint.config?.body || '');
    setAuth(endpoint.config?.auth || { auth_type: 'none' });
  }, [endpoint.id]);

  // Save changes to endpoint on server
  const saveMutation = useMutation({
    mutationFn: () => {
      const headerMap: Record<string, string> = {};
      for (const [k, v] of headers) {
        if (k.trim()) headerMap[k.trim()] = v;
      }

      return apiRequest(`/endpoints/${endpoint.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: endpoint.version,
          config: {
            method,
            url,
            query_params: queryParams.filter(([k]) => k.trim()),
            headers: headerMap,
            body_type: bodyType,
            body,
            auth,
          },
        }),
      });
    },
    onSuccess: () => {
      setStatusMessage('Saved successfully');
      queryClient.invalidateQueries({ queryKey: ['endpoints', endpoint.collection_id] });
      setTimeout(() => setStatusMessage(null), 2000);
    },
    onError: (err: any) => {
      setStatusMessage(`Error saving: ${err.message}`);
    },
  });

  async function handleSend() {
    setSending(true);
    setStatusMessage(null);

    const headerMap: Record<string, string> = {};
    for (const [k, v] of headers) {
      if (k.trim()) headerMap[k.trim()] = v;
    }

    const execReq: HttpExecutionRequest = {
      url,
      method,
      headers: headerMap,
      query_params: queryParams.filter(([k]) => k.trim()),
      body: bodyType === 'none' ? undefined : body,
      body_type: bodyType,
      auth,
      timeout_ms: 30000,
    };

    try {
      const resp = await executeNativeHttp(execReq, activeVariables);
      setLastHttpResponse(resp);
    } catch (err: any) {
      setLastHttpResponse({
        status_code: 0,
        status_text: 'Execution Failed',
        response_time_ms: 0,
        response_size_bytes: 0,
        headers: {},
        body: '',
        error: err.message,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 border-r border-zinc-800 h-screen select-none">
      {/* Top Bar: Method, URL, Send, Save */}
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-400">Endpoint:</span>
            <span className="text-xs font-medium text-zinc-100">{endpoint.name}</span>
          </div>
          {statusMessage && (
            <span className="text-xs text-indigo-400 font-mono">{statusMessage}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
            <option value="HEAD">HEAD</option>
            <option value="OPTIONS">OPTIONS</option>
          </select>

          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/v1/users/{{USER_ID}}"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
          />

          <button
            onClick={handleSend}
            disabled={sending}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded text-xs flex items-center gap-1.5 shadow-sm transition"
          >
            <Send size={13} />
            <span>{sending ? 'Sending...' : 'Send'}</span>
          </button>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded text-xs flex items-center gap-1.5 transition"
            title="Save changes to endpoint"
          >
            <Save size={13} />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 bg-zinc-900/40 text-xs">
        <button
          onClick={() => setActiveTab('params')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'params'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Params ({queryParams.length})
        </button>
        <button
          onClick={() => setActiveTab('headers')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'headers'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Headers ({headers.length})
        </button>
        <button
          onClick={() => setActiveTab('body')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'body'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Body
        </button>
        <button
          onClick={() => setActiveTab('auth')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'auth'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Auth ({auth.auth_type})
        </button>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {/* Params Panel */}
        {activeTab === 'params' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-zinc-400 pb-1">
              <span>Query Parameters</span>
              <button
                onClick={() => setQueryParams([...queryParams, ['', '']])}
                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <Plus size={12} /> Add Param
              </button>
            </div>
            {queryParams.map(([key, val], idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => {
                    const next = [...queryParams];
                    next[idx][0] = e.target.value;
                    setQueryParams(next);
                  }}
                  placeholder="Key"
                  className="w-1/3 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  value={val}
                  onChange={(e) => {
                    const next = [...queryParams];
                    next[idx][1] = e.target.value;
                    setQueryParams(next);
                  }}
                  placeholder="Value (or {{VAR}})"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => setQueryParams(queryParams.filter((_, i) => i !== idx))}
                  className="text-zinc-500 hover:text-red-400 p-1"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Headers Panel */}
        {activeTab === 'headers' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-zinc-400 pb-1">
              <span>Request Headers</span>
              <button
                onClick={() => setHeaders([...headers, ['', '']])}
                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <Plus size={12} /> Add Header
              </button>
            </div>
            {headers.map(([key, val], idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => {
                    const next = [...headers];
                    next[idx][0] = e.target.value;
                    setHeaders(next);
                  }}
                  placeholder="Header Name"
                  className="w-1/3 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  value={val}
                  onChange={(e) => {
                    const next = [...headers];
                    next[idx][1] = e.target.value;
                    setHeaders(next);
                  }}
                  placeholder="Header Value (or {{VAR}})"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => setHeaders(headers.filter((_, i) => i !== idx))}
                  className="text-zinc-500 hover:text-red-400 p-1"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Body Panel */}
        {activeTab === 'body' && (
          <div className="space-y-3 h-full flex flex-col">
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="bodyType"
                  checked={bodyType === 'none'}
                  onChange={() => setBodyType('none')}
                />
                <span>None</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="bodyType"
                  checked={bodyType === 'json'}
                  onChange={() => setBodyType('json')}
                />
                <span>JSON</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="bodyType"
                  checked={bodyType === 'text'}
                  onChange={() => setBodyType('text')}
                />
                <span>Plain Text</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="bodyType"
                  checked={bodyType === 'form'}
                  onChange={() => setBodyType('form')}
                />
                <span>Form URL-Encoded</span>
              </label>
            </div>

            {bodyType !== 'none' && (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  bodyType === 'json'
                    ? '{\n  "userId": "{{USER_ID}}",\n  "name": "Jane"\n}'
                    : 'raw payload'
                }
                className="flex-1 w-full bg-zinc-900 border border-zinc-800 rounded p-3 font-mono text-xs focus:outline-none focus:border-indigo-500 resize-none h-64"
              />
            )}
          </div>
        )}

        {/* Auth Panel */}
        {activeTab === 'auth' && (
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-zinc-400 mb-1">Authentication Type</label>
              <select
                value={auth.auth_type}
                onChange={(e) =>
                  setAuth({ ...auth, auth_type: e.target.value as any })
                }
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="none">No Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="custom">Custom Header</option>
              </select>
            </div>

            {auth.auth_type === 'bearer' && (
              <div>
                <label className="block text-zinc-400 mb-1">Token</label>
                <input
                  type="text"
                  value={auth.token || ''}
                  onChange={(e) => setAuth({ ...auth, token: e.target.value })}
                  placeholder="{{API_TOKEN}} or raw-token"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {auth.auth_type === 'basic' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-zinc-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={auth.username || ''}
                    onChange={(e) => setAuth({ ...auth, username: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={auth.password || ''}
                    onChange={(e) => setAuth({ ...auth, password: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            {auth.auth_type === 'custom' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-zinc-400 mb-1">Header Name</label>
                  <input
                    type="text"
                    value={auth.header_name || ''}
                    onChange={(e) => setAuth({ ...auth, header_name: e.target.value })}
                    placeholder="X-API-Key"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Header Value</label>
                  <input
                    type="text"
                    value={auth.header_value || ''}
                    onChange={(e) => setAuth({ ...auth, header_value: e.target.value })}
                    placeholder="{{API_KEY}}"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
