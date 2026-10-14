import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { executeNativeHttp } from '../../api/native';
import type { Endpoint, HttpAuth, HttpExecutionRequest, VariableResponse, Collection } from '@api-lab/api-types';
import { Send, Save, Plus, Trash2, CheckCircle, XCircle, Terminal, Code, Shield, Wand2 } from 'lucide-react';
import { JsonEditor } from '../common/JsonEditor';
import { VariableInput } from '../common/VariableInput';
import { JavaScriptEditor } from '../common/JavaScriptEditor';
import { runBeforeHook, runAfterHook, type HookTestResult } from '../../utils/hookRunner';
import { applyInheritedHttpAuth } from '../../utils/authInheritance';
import { syncEnvironmentVariables } from '../../utils/envSync';
import { getEffectiveEndpointConfig } from '../../utils/tabManager';

export const HttpRequestEditor: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const queryClient = useQueryClient();
  const {
    activeEnvironmentId,
    setLastHttpResponse,
    setActiveEndpoint,
    setEndpointDraft,
    clearEndpointDraft,
  } = useAppStore();

  const [currentVersion, setCurrentVersion] = useState<number>(endpoint.version);
  const currentVersionRef = useRef<number>(endpoint.version);
  currentVersionRef.current = currentVersion;
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);

  const draft = useAppStore.getState().endpointDrafts[endpoint.id];
  const initialConfig = getEffectiveEndpointConfig(endpoint, draft);

  const [method, setMethod] = useState(initialConfig.method || 'GET');
  const [url, setUrl] = useState(
    initialConfig.url !== undefined ? initialConfig.url : 'https://httpbin.org/get'
  );
  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body' | 'auth' | 'scripts'>('params');

  // Query Params & Headers state
  const [queryParams, setQueryParams] = useState<[string, string][]>(
    initialConfig.query_params || []
  );
  const [headers, setHeaders] = useState<[string, string][]>(() => {
    const raw = initialConfig.headers || {};
    return Object.entries(raw);
  });

  // Body & Auth state
  const [bodyType, setBodyType] = useState<'none' | 'json' | 'text' | 'form'>(
    initialConfig.body_type || 'json'
  );
  const [body, setBody] = useState<string>(
    initialConfig.body !== undefined ? initialConfig.body : ''
  );
  const [auth, setAuth] = useState<HttpAuth>(
    initialConfig.auth || { auth_type: 'none' }
  );

  // Hook Scripts state (standard JavaScript)
  const [preRequestScript, setPreRequestScript] = useState<string>(
    initialConfig.pre_request_script || ''
  );
  const [postResponseScript, setPostResponseScript] = useState<string>(
    initialConfig.post_response_script || initialConfig.post_request_script || ''
  );
  const [hookScriptTab, setHookScriptTab] = useState<'pre' | 'post'>('pre');
  const [hookTests, setHookTests] = useState<HookTestResult[]>([]);
  const [hookLogs, setHookLogs] = useState<string[]>([]);

  const [activeVariables, setActiveVariables] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Fetch parent collection for inherited settings
  const { data: collection } = useQuery<Collection>({
    queryKey: ['collection', endpoint.collection_id],
    queryFn: () => apiRequest<Collection>(`/collections/${endpoint.collection_id}`),
    enabled: !!endpoint.collection_id,
  });

  // Resolve active environment variables
  async function resolveVariables(): Promise<Record<string, string>> {
    const vars: Record<string, string> = {};
    if (activeEnvironmentId) {
      const envVars = queryClient.getQueryData<VariableResponse[]>(['variables', activeEnvironmentId]);
      if (envVars) {
        for (const v of envVars) {
          vars[v.key] = v.value;
        }
      } else {
        try {
          const fetched = await apiRequest<VariableResponse[]>(`/environments/${activeEnvironmentId}/variables`);
          for (const v of fetched) {
            vars[v.key] = v.value;
          }
        } catch {
          // ignore
        }
      }
    }
    return vars;
  }

  useEffect(() => {
    resolveVariables().then(setActiveVariables);
  }, [activeEnvironmentId]);

  // Track previous endpoint id to only reinitialize state when switching to a different endpoint without remount
  const prevEndpointIdRef = useRef(endpoint.id);
  useEffect(() => {
    if (prevEndpointIdRef.current !== endpoint.id) {
      prevEndpointIdRef.current = endpoint.id;
      setCurrentVersion(endpoint.version);
      currentVersionRef.current = endpoint.version;
      const currentDraft = useAppStore.getState().endpointDrafts[endpoint.id];
      const cfg = getEffectiveEndpointConfig(endpoint, currentDraft);
      setMethod(cfg.method || 'GET');
      setUrl(cfg.url !== undefined ? cfg.url : 'https://httpbin.org/get');
      setQueryParams(cfg.query_params || []);
      setHeaders(Object.entries(cfg.headers || {}));
      setBodyType(cfg.body_type || 'json');
      setBody(cfg.body || '');
      setAuth(cfg.auth || { auth_type: 'none' });
      setPreRequestScript(cfg.pre_request_script || '');
      setPostResponseScript(
        cfg.post_request_script || cfg.post_response_script || ''
      );
      setHookTests([]);
      setHookLogs([]);
    }
  }, [endpoint.id]);

  function buildConfig() {
    const headerMap: Record<string, string> = {};
    for (const [k, v] of headers) {
      if (k.trim()) headerMap[k.trim()] = v;
    }
    return {
      method,
      url,
      query_params: queryParams.filter(([k]) => k.trim()),
      headers: headerMap,
      body_type: bodyType,
      body,
      auth,
      pre_request_script: preRequestScript,
      post_request_script: postResponseScript,
      post_response_script: postResponseScript,
    };
  }

  const saveChanges = async (options?: { silent?: boolean }) => {
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    isSavingRef.current = true;
    try {
      const cfg = buildConfig();
      let res: Endpoint;
      try {
        res = await apiRequest<Endpoint>(`/endpoints/${endpoint.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            version: currentVersionRef.current,
            config: cfg,
          }),
        });
      } catch (err: any) {
        if (err?.message?.includes('version mismatch') || err?.status === 409) {
          const latest = await apiRequest<Endpoint>(`/endpoints/${endpoint.id}`);
          currentVersionRef.current = latest.version;
          res = await apiRequest<Endpoint>(`/endpoints/${endpoint.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              version: latest.version,
              config: cfg,
            }),
          });
        } else {
          throw err;
        }
      }

      setCurrentVersion(res.version);
      currentVersionRef.current = res.version;
      clearEndpointDraft(endpoint.id);
      if (useAppStore.getState().activeEndpointId === endpoint.id) {
        setActiveEndpoint(res);
      }
      queryClient.setQueryData<Endpoint[]>(
        ['endpoints', endpoint.collection_id],
        (prev) => prev?.map((ep) => (ep.id === res.id ? res : ep)) || [res]
      );
      if (!options?.silent) {
        setStatusMessage('Saved successfully');
        setTimeout(() => setStatusMessage(null), 2000);
      }
    } catch (err: any) {
      if (!options?.silent) {
        setStatusMessage(`Error saving: ${err.message}`);
      }
    } finally {
      isSavingRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        saveChanges(options);
      }
    }
  };

  // Keep working draft synchronized in store so tab switches retain unsaved edits
  useEffect(() => {
    const cfg = buildConfig();
    setEndpointDraft(endpoint.id, cfg);
  }, [
    method,
    url,
    queryParams,
    headers,
    bodyType,
    body,
    auth,
    preRequestScript,
    postResponseScript,
  ]);

  // Keyboard shortcuts: Ctrl+S to save, Ctrl+Enter to send
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveChanges({ silent: false });
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentVersion, preRequestScript, postResponseScript, method, url, queryParams, headers, bodyType, body, auth]);

  // Generate example script for Before or After hook
  function handleGenerateScript() {
    if (hookScriptTab === 'pre') {
      const samplePre = `// Pre-request Script Example
pm.environment.set("TIMESTAMP", Date.now());
pm.request.headers['X-Request-ID'] = 'req_' + Math.random().toString(36).substring(2, 9);
console.log("Preparing HTTP request to:", pm.request.url);`;
      setPreRequestScript((prev) => (prev ? prev + '\n\n' + samplePre : samplePre));
      setStatusMessage('Generated example Pre-request script');
    } else {
      const samplePost = `// Post-response Script Example
pm.test("Status code is 200", function () {
  pm.expect(pm.response.code).to.equal(200);
});

pm.test("Response time is under 1500ms", function () {
  pm.expect(pm.response.responseTime < 1500).to.be.true();
});

try {
  const data = pm.response.json();
  if (data && data.token) {
    pm.environment.set("AUTH_TOKEN", data.token);
    console.log("Saved AUTH_TOKEN to environment");
  }
} catch (e) {
  console.log("Response is not JSON or token missing");
}`;
      setPostResponseScript((prev) => (prev ? prev + '\n\n' + samplePost : samplePost));
      setStatusMessage('Generated example Post-response script');
    }
    setTimeout(() => setStatusMessage(null), 2500);
  }

  async function handleSend() {
    saveChanges({ silent: true });
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
      const currentVars = await resolveVariables();

      // 1. Run Pre-request Hook (Before)
      const beforeResult = await runBeforeHook(preRequestScript, execReq, currentVars);
      if (beforeResult.error) {
        setStatusMessage(beforeResult.error);
      }
      setHookLogs(beforeResult.logs);

      // 2. Apply Inherited Collection Authorization if applicable
      let currentColl = collection;
      if (!currentColl && endpoint.collection_id) {
        try {
          currentColl = await queryClient.fetchQuery({
            queryKey: ['collection', endpoint.collection_id],
            queryFn: () => apiRequest<Collection>(`/collections/${endpoint.collection_id}`),
          });
        } catch {
          // ignore
        }
      }

      const finalReq = applyInheritedHttpAuth(
        beforeResult.request,
        currentColl?.settings,
        beforeResult.variables
      );

      // 3. Execute HTTP Request
      const resp = await executeNativeHttp(finalReq, beforeResult.variables);
      setLastHttpResponse(resp);

      // 4. Run Post-response Hook (After)
      const afterResult = await runAfterHook(
        postResponseScript,
        finalReq,
        resp,
        beforeResult.variables
      );
      setHookTests(afterResult.tests);
      setHookLogs((prev) => [...prev, ...afterResult.logs]);
      setActiveVariables(afterResult.variables);

      // Sync variables modified by pm.environment.set to the active environment (Bug 2 Fix)
      const syncRes = await syncEnvironmentVariables(
        beforeResult.variables,
        afterResult.variables,
        activeEnvironmentId,
        {
          get: (path) => apiRequest(path),
          post: (path, body) => apiRequest(path, { method: 'POST', body: JSON.stringify(body) }),
          patch: (path, body) => apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) }),
        }
      );
      if (syncRes.syncedCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['variables', activeEnvironmentId] });
        resolveVariables().then(setActiveVariables);
        setStatusMessage(`Saved ${syncRes.syncedKeys.join(', ')} to environment`);
      } else if (afterResult.error) {
        setStatusMessage(afterResult.error);
      }
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
    <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden select-none">
      {/* URL & Action Bar */}
      <div className="px-4 py-2.5 bg-zinc-950 border-b border-zinc-800/80 flex items-center gap-2.5 flex-shrink-0">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className={`bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs font-mono font-bold focus:outline-none focus:border-zinc-700 h-8 ${
            method === 'GET'
              ? 'text-emerald-400'
              : method === 'POST'
              ? 'text-blue-400'
              : method === 'PUT' || method === 'PATCH'
              ? 'text-amber-400'
              : 'text-rose-400'
          }`}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
          <option value="HEAD">HEAD</option>
          <option value="OPTIONS">OPTIONS</option>
        </select>

        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md focus-within:border-zinc-700 h-8 flex items-center px-1">
          <VariableInput
            value={url}
            onChange={setUrl}
            variables={activeVariables}
            placeholder="https://api.example.com/v1/users/{{USER_ID}}"
            className="w-full h-full text-xs font-mono"
          />
        </div>

        {statusMessage && (
          <span className="text-[11px] font-mono text-indigo-300 bg-zinc-900/80 px-2.5 py-1 rounded border border-zinc-800 truncate max-w-xs select-text">
            {statusMessage}
          </span>
        )}

        <button
          onClick={handleSend}
          disabled={sending}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-md text-xs flex items-center gap-1.5 shadow-sm shadow-indigo-950/50 transition h-8 border border-indigo-400/50"
          title="Send request (Ctrl+Enter)"
        >
          <Send size={12} />
          <span>{sending ? 'Sending...' : 'Send'}</span>
          <kbd className="text-[10px] font-mono text-indigo-200 bg-indigo-950/70 border border-indigo-500/40 px-1 py-0.2 rounded font-normal ml-0.5 select-none">
            Ctrl+↵
          </kbd>
        </button>

        <button
          onClick={() => saveChanges({ silent: false })}
          disabled={isSavingRef.current}
          className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/60 rounded-md transition flex items-center gap-1.5 shadow-sm h-8 disabled:opacity-50"
          title="Save changes to endpoint (Ctrl+S)"
        >
          <Save size={12} className="text-zinc-400" />
          <span>Save</span>
          <kbd className="text-[10px] font-mono text-zinc-500 bg-zinc-800/80 px-1 py-0.2 rounded border border-zinc-700/60 ml-0.5 select-none">
            Ctrl+S
          </kbd>
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 border-b border-zinc-800/80 flex items-center justify-between text-xs select-none bg-zinc-950 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('params')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'params'
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Params</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-900 text-zinc-400 rounded border border-zinc-800">
              {queryParams.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('headers')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'headers'
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Headers</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-900 text-zinc-400 rounded border border-zinc-800">
              {headers.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('body')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'body'
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Body</span>
            {bodyType !== 'none' && (
              <span className="text-[9px] font-mono uppercase px-1 py-0.2 bg-zinc-900 text-zinc-400 rounded border border-zinc-800">
                {bodyType}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('auth')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'auth'
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Auth</span>
            {auth.auth_type !== 'none' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('scripts')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'scripts'
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code size={12} />
            <span>Scripts</span>
            {hookTests.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-900 text-zinc-400 rounded border border-zinc-800">
                {hookTests.filter((t) => t.passed).length}/{hookTests.length}
              </span>
            )}
          </button>
        </div>
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
                  className="w-1/3 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-indigo-500 h-7"
                />
                <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded focus-within:border-indigo-500 h-7">
                  <VariableInput
                    value={val}
                    onChange={(newVal) => {
                      const next = [...queryParams];
                      next[idx][1] = newVal;
                      setQueryParams(next);
                    }}
                    variables={activeVariables}
                    placeholder="Value (or {{VAR}})"
                    className="w-full h-full"
                  />
                </div>
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
                  className="w-1/3 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-indigo-500 h-7"
                />
                <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded focus-within:border-indigo-500 h-7">
                  <VariableInput
                    value={val}
                    onChange={(newVal) => {
                      const next = [...headers];
                      next[idx][1] = newVal;
                      setHeaders(next);
                    }}
                    variables={activeVariables}
                    placeholder="Header Value (or {{VAR}})"
                    className="w-full h-full"
                  />
                </div>
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

            {bodyType === 'json' ? (
              <div className="flex-1 h-64">
                <JsonEditor
                  value={body}
                  onChange={setBody}
                  variables={activeVariables}
                  placeholder='{\n  "userId": "{{USER_ID}}",\n  "name": "Jane"\n}'
                />
              </div>
            ) : bodyType !== 'none' ? (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="raw payload"
                className="flex-1 w-full bg-zinc-900 border border-zinc-800 rounded p-3 font-mono text-xs focus:outline-none focus:border-indigo-500 resize-none h-64"
              />
            ) : null}
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
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value="inherit">Inherit auth from collection</option>
                <option value="none">No Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="custom">Custom Header</option>
              </select>
            </div>

            {auth.auth_type === 'inherit' && (
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded text-xs space-y-1">
                <div className="text-zinc-200 font-medium flex items-center gap-1.5">
                  <Shield size={13} className="text-indigo-400" />
                  <span>Inherited from Collection: {collection?.name || 'Current'}</span>
                </div>
                <div className="text-zinc-400 text-[11px]">
                  {collection?.settings?.auth && collection.settings.auth.auth_type !== 'none'
                    ? `Type: ${collection.settings.auth.auth_type.toUpperCase()} ${
                        collection.settings.auth.token
                          ? `(Token: ${collection.settings.auth.token})`
                          : ''
                      }`
                    : 'No authorization configured on this collection yet. Configure in Collection Settings.'}
                </div>
              </div>
            )}

            {auth.auth_type === 'bearer' && (
              <div>
                <label className="block text-zinc-400 mb-1">Token</label>
                <div className="bg-zinc-900 border border-zinc-800 rounded focus-within:border-indigo-500 h-8">
                  <VariableInput
                    value={auth.token || ''}
                    onChange={(newVal) => setAuth({ ...auth, token: newVal })}
                    variables={activeVariables}
                    placeholder="{{API_TOKEN}} or raw-token"
                    className="w-full h-full"
                  />
                </div>
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
                  <div className="bg-zinc-900 border border-zinc-800 rounded focus-within:border-indigo-500 h-8">
                    <VariableInput
                      value={auth.header_value || ''}
                      onChange={(newVal) => setAuth({ ...auth, header_value: newVal })}
                      variables={activeVariables}
                      placeholder="{{API_KEY}}"
                      className="w-full h-full"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scripts Panel (Before & After Hooks) */}
        {activeTab === 'scripts' && (
          <div className="space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHookScriptTab('pre')}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${
                    hookScriptTab === 'pre'
                      ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/60'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Pre-request Script (Before)
                </button>
                <button
                  type="button"
                  onClick={() => setHookScriptTab('post')}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${
                    hookScriptTab === 'post'
                      ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/60'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Post-response Script (After)
                </button>
              </div>

              <span className="text-[10px] text-zinc-500 font-mono">
                JavaScript (Workbench syntax: pm.*)
              </span>
            </div>

            <div className="flex-1 flex flex-col space-y-2">
              {hookScriptTab === 'pre' ? (
                <div className="flex-1 flex flex-col space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400">
                      Runs before sending request. Use <code className="text-indigo-300 font-mono">pm.environment.set(key, val)</code> or mutate <code className="text-indigo-300 font-mono">pm.request.headers[...]</code>.
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateScript}
                      className="text-[11px] text-indigo-300 hover:text-white px-2 py-0.5 bg-indigo-950/70 border border-indigo-800/60 rounded flex items-center gap-1 font-medium transition flex-shrink-0"
                    >
                      <Wand2 size={11} />
                      <span>Generate Example</span>
                    </button>
                  </div>
                  <div className="flex-1 min-h-[160px]">
                    <JavaScriptEditor
                      value={preRequestScript}
                      onChange={setPreRequestScript}
                      placeholder={`// Example Pre-request Script:\npm.environment.set("TIMESTAMP", Date.now());\npm.request.headers['Authorization'] = 'Bearer ' + pm.variables.get('API_KEY');\nconsole.log('Sending request...');`}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400">
                      Runs after response arrives. Use <code className="text-indigo-300 font-mono">pm.test(...)</code>, <code className="text-indigo-300 font-mono">pm.response.json()</code>, and extract values into variables.
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateScript}
                      className="text-[11px] text-indigo-300 hover:text-white px-2 py-0.5 bg-indigo-950/70 border border-indigo-800/60 rounded flex items-center gap-1 font-medium transition flex-shrink-0"
                    >
                      <Wand2 size={11} />
                      <span>Generate Example</span>
                    </button>
                  </div>
                  <div className="flex-1 min-h-[160px]">
                    <JavaScriptEditor
                      value={postResponseScript}
                      onChange={setPostResponseScript}
                      placeholder={`// Example Post-response Script:\npm.test("Status code is 200", () => {\n  pm.expect(pm.response.code).to.equal(200);\n});\n\nconst data = pm.response.json();\npm.environment.set("USER_TOKEN", data.token);`}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Test Results & Logs Output */}
            {(hookTests.length > 0 || hookLogs.length > 0) && (
              <div className="mt-2 p-2.5 bg-zinc-900/80 border border-zinc-800 rounded space-y-2 max-h-44 overflow-y-auto font-mono text-xs">
                {hookTests.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-zinc-300 block mb-1">
                      Test Results:
                    </span>
                    <div className="space-y-1">
                      {hookTests.map((t, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          {t.passed ? (
                            <CheckCircle size={13} className="text-emerald-400" />
                          ) : (
                            <XCircle size={13} className="text-rose-400" />
                          )}
                          <span className={t.passed ? 'text-zinc-200' : 'text-rose-300'}>
                            {t.name}
                          </span>
                          {t.error && (
                            <span className="text-[10px] text-rose-400 ml-1">
                              ({t.error})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {hookLogs.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1 mb-1">
                      <Terminal size={11} /> Logs:
                    </span>
                    <div className="bg-zinc-950 p-2 rounded text-[11px] text-zinc-300 space-y-0.5">
                      {hookLogs.map((log, idx) => (
                        <div key={idx} className="break-all">
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
