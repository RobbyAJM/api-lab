import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { executeNativeHttp } from '../../api/native';
import type { Endpoint, HttpAuth, HttpExecutionRequest, VariableResponse, Collection, CollectionFolder } from '@api-lab/api-types';
import { Save, Shield, Globe } from 'lucide-react';
import { JsonEditor } from '../common/JsonEditor';
import { VariableInput } from '../common/VariableInput';
import { Select } from '../common/Select';
import { KeyValueTable } from '../common/KeyValueTable';
import { ScriptEditorPane } from './ScriptEditorPane';
import { runBeforeHook, runAfterHook, type HookTestResult } from '../../utils/hookRunner';
import { applyCollectionSettingsToHttp } from '../../utils/collectionSettings';
import { syncEnvironmentVariables } from '../../utils/envSync';
import { getEffectiveEndpointConfig } from '../../utils/tabManager';
import { stripJsonComments } from '../../utils/jsonComments';
import { splitUrlQuery, type HttpBodyType } from '../../utils/httpRequest';
import { mergeFolderSettings } from '../../utils/folderSettings';

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
  const [bodyType, setBodyType] = useState<HttpBodyType>(
    initialConfig.body_type || 'json'
  );
  const [body, setBody] = useState<string>(
    initialConfig.body !== undefined ? initialConfig.body : ''
  );
  const [multipartFields, setMultipartFields] = useState<
    { name: string; value: string; filename?: string; data?: string; content_type?: string }[]
  >(() => {
    try {
      const parsed = JSON.parse(initialConfig.body || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [auth, setAuth] = useState<HttpAuth>(
    initialConfig.auth || { auth_type: 'none' }
  );

  // Hook Scripts state (Postman-style JavaScript)
  const [preRequestScript, setPreRequestScript] = useState<string>(
    initialConfig.pre_request_script || ''
  );
  const [postResponseScript, setPostResponseScript] = useState<string>(
    initialConfig.post_response_script || initialConfig.post_request_script || ''
  );
  const [hookScriptTab, setHookScriptTab] = useState<'pre' | 'post'>('pre');
  const [hookTests, setHookTests] = useState<HookTestResult[]>([]);
  const [hookLogs, setHookLogs] = useState<string[]>([]);

  useEffect(() => {
    const parsed = splitUrlQuery(url);
    if (parsed.params.length > 0 && queryParams.length === 0) {
      setUrl(parsed.url);
      setQueryParams(parsed.params);
    }
  }, []);

  const [activeVariables, setActiveVariables] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Fetch parent collection for inherited settings
  const { data: collection } = useQuery<Collection>({
    queryKey: ['collection', endpoint.collection_id],
    queryFn: () => apiRequest<Collection>(`/collections/${endpoint.collection_id}`),
    enabled: !!endpoint.collection_id,
  });
  const { data: folders = [] } = useQuery<CollectionFolder[]>({
    queryKey: ['folders', endpoint.collection_id],
    queryFn: () => apiRequest<CollectionFolder[]>(`/collections/${endpoint.collection_id}/folders`),
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
       try {
         const parsedBody = JSON.parse(cfg.body || '[]');
         setMultipartFields(Array.isArray(parsedBody) ? parsedBody : []);
       } catch {
         setMultipartFields([]);
       }
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
      body: bodyType === 'multipart' ? JSON.stringify(multipartFields) : body,
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
     multipartFields,
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

  async function handleSend() {
    saveChanges({ silent: true });
    setSending(true);
    setStatusMessage(null);

    const headerMap: Record<string, string> = {};
    for (const [k, v] of headers) {
      if (k.trim()) headerMap[k.trim()] = v;
    }

    const cleanBody = bodyType === 'multipart'
      ? JSON.stringify(multipartFields)
      : bodyType === 'json' && body ? stripJsonComments(body) : body;

    const execReq: HttpExecutionRequest = {
      url,
      method,
      headers: headerMap,
      query_params: queryParams.filter(([k]) => k.trim()),
      body: bodyType === 'none' ? undefined : cleanBody,
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

      const finalReq = applyCollectionSettingsToHttp(
        beforeResult.request,
         mergeFolderSettings(currentColl?.settings, folders, endpoint.folder_id),
        beforeResult.variables
      );

      // 3. Execute HTTP Request
      const resp = await executeNativeHttp(finalReq, beforeResult.variables);
       setLastHttpResponse(resp, endpoint.id);

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
       }, endpoint.id);
    } finally {
      setSending(false);
    }
  }

  let binaryFile: { filename?: string; content_type?: string; data?: string } | null = null;
  if (bodyType === 'binary' && body) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object') binaryFile = parsed;
    } catch {
      // Keep empty-file placeholder for legacy or invalid body state.
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden select-none">
      {/* Breadcrumbs Row + Save Button (Image 1) */}
      <div className="px-4 py-2 flex items-center justify-between text-xs select-none flex-shrink-0">
        <div className="flex items-center gap-1.5 font-mono text-[11px] truncate mr-2">
          <Globe size={13} className="text-emerald-400 flex-shrink-0" />
          <span className="text-zinc-400">{collection?.name?.toUpperCase() || 'COLLECTION'}</span>
          <span className="text-zinc-600">&gt;</span>
          <span className="text-white font-semibold">{endpoint.name}</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {statusMessage && (
            <span className="text-[10px] font-mono text-zinc-300 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded select-text">
              {statusMessage}
            </span>
          )}

          <button
            type="button"
            onClick={() => saveChanges({ silent: false })}
            disabled={isSavingRef.current}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-md transition shadow-sm disabled:opacity-50"
            title="Save changes (Ctrl+S)"
          >
            <Save size={12} className="text-zinc-400" />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* URL & Action Bar */}
      <div className="px-4 pb-2.5 flex items-center gap-2 flex-shrink-0">
        <div className="flex-1 flex items-center bg-zinc-900 border border-zinc-800 rounded h-9 focus-within:border-primary transition overflow-hidden">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className={`bg-transparent border-0 px-2.5 py-1 text-xs font-mono font-bold focus:outline-none cursor-pointer h-full ${
              method === 'GET'
                ? 'text-emerald-400'
                : method === 'POST'
                ? 'text-blue-400'
                : method === 'PUT' || method === 'PATCH'
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            <option value="GET" className="bg-zinc-900">GET</option>
            <option value="POST" className="bg-zinc-900">POST</option>
            <option value="PUT" className="bg-zinc-900">PUT</option>
            <option value="PATCH" className="bg-zinc-900">PATCH</option>
            <option value="DELETE" className="bg-zinc-900">DELETE</option>
            <option value="HEAD" className="bg-zinc-900">HEAD</option>
            <option value="OPTIONS" className="bg-zinc-900">OPTIONS</option>
          </select>

          <div className="h-4 w-px bg-zinc-800 mx-1 flex-shrink-0" />

          <div className="flex-1 h-full flex items-center px-1 min-w-0">
            <VariableInput
              value={url}
              onChange={(next) => {
                const parsed = splitUrlQuery(next);
                setUrl(parsed.params.length ? parsed.url : next);
                setQueryParams(parsed.params);
              }}
              variables={activeVariables}
              placeholder="https://api.example.com/v1/users/{{USER_ID}}"
              className="w-full h-full text-xs font-mono bg-transparent border-0 focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={handleSend}
          disabled={sending}
          className="px-4 py-2 bg-primary hover:bg-primary-hover active:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded text-xs flex items-center gap-1.5 transition h-9 flex-shrink-0 cursor-pointer shadow-sm"
          title="Send request (Ctrl+Enter)"
        >
          <span>{sending ? 'Sending...' : 'Send'}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 border-b border-zinc-800 flex items-center justify-between text-xs select-none bg-zinc-950 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('params')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'params'
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Params</span>
          </button>
          <button
            onClick={() => setActiveTab('headers')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'headers'
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Headers</span>
          </button>
          <button
            onClick={() => setActiveTab('body')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'body'
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Body</span>
          </button>
          <button
            onClick={() => setActiveTab('auth')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'auth'
                ? 'border-primary text-zinc-100'
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
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
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
          <KeyValueTable
            title="Query Parameters"
            items={queryParams}
            onChange={setQueryParams}
            variables={activeVariables}
            keyPlaceholder="parameter"
            valuePlaceholder="value (or {{VAR}})"
            addLabel="Add Param"
          />
        )}

        {/* Headers Panel */}
        {activeTab === 'headers' && (
          <KeyValueTable
            title="Request Headers"
            items={headers}
            onChange={setHeaders}
            variables={activeVariables}
            keyPlaceholder="Header-Name"
            valuePlaceholder="Header-Value (or {{VAR}})"
            addLabel="Add Header"
          />
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
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="bodyType" checked={bodyType === 'multipart'} onChange={() => setBodyType('multipart')} />
                <span>Multipart</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="bodyType" checked={bodyType === 'binary'} onChange={() => setBodyType('binary')} />
                <span>Binary</span>
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
            ) : bodyType === 'multipart' ? (
              <div className="space-y-2">
                {multipartFields.map((field, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <input
                      value={field.name}
                      onChange={(e) => setMultipartFields((fields) => fields.map((item, i) => i === index ? { ...item, name: e.target.value } : item))}
                      placeholder="field name"
                      className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 font-mono"
                    />
                    {field.filename ? (
                      <span className="truncate text-zinc-300 bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5" title={field.filename}>{field.filename}</span>
                    ) : (
                      <input
                        value={field.value}
                        onChange={(e) => setMultipartFields((fields) => fields.map((item, i) => i === index ? { ...item, value: e.target.value } : item))}
                        placeholder="value"
                        className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 font-mono"
                      />
                    )}
                    <div className="flex gap-1">
                      <label className="cursor-pointer px-2 py-1.5 border border-zinc-800 rounded text-zinc-400 hover:text-white">
                        File
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => setMultipartFields((fields) => fields.map((item, i) => i === index ? {
                              ...item,
                              filename: file.name,
                              data: String(reader.result).split(',', 2)[1] || '',
                              content_type: file.type || 'application/octet-stream',
                            } : item));
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                      <button type="button" onClick={() => setMultipartFields((fields) => fields.filter((_, i) => i !== index))} className="px-2 text-zinc-500 hover:text-rose-400">×</button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setMultipartFields((fields) => [...fields, { name: '', value: '' }])} className="text-primary hover:text-white">+ Add field</button>
              </div>
            ) : bodyType === 'binary' ? (
              <label className="flex items-center justify-between gap-3 p-4 border border-dashed border-zinc-700 rounded text-zinc-400 cursor-pointer hover:border-zinc-500 hover:text-zinc-200">
                <span className="min-w-0">
                  {binaryFile?.filename ? (
                    <>
                      <span className="block truncate text-zinc-100">{binaryFile.filename}</span>
                      <span className="block mt-1 text-[11px] text-zinc-500">
                        {binaryFile.content_type || 'application/octet-stream'}
                        {binaryFile.data ? ` · ${Math.round((binaryFile.data.length * 3) / 4).toLocaleString()} bytes` : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block text-zinc-300">Choose binary file</span>
                      <span className="block mt-1 text-[11px] text-zinc-500">No file selected</span>
                    </>
                  )}
                </span>
                <span className="flex-shrink-0 text-[11px] text-primary">{binaryFile?.filename ? 'Change file' : 'Browse'}</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setBody(JSON.stringify({
                      filename: file.name,
                      content_type: file.type || 'application/octet-stream',
                      data: String(reader.result).split(',', 2)[1] || '',
                    }));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            ) : bodyType !== 'none' ? (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="raw payload"
                className="flex-1 w-full bg-zinc-900 border border-zinc-800 rounded p-3 font-mono text-xs focus:outline-none focus:border-zinc-700 resize-none h-64"
              />
            ) : null}
          </div>
        )}

        {/* Auth Panel */}
        {activeTab === 'auth' && (
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-zinc-400 mb-1">Auth Type</label>
              <Select
                value={auth.auth_type}
                onChange={(val) =>
                  setAuth({ ...auth, auth_type: val as HttpAuth['auth_type'] })
                }
                options={[
                  { value: 'inherit', label: 'Inherit auth from collection' },
                  { value: 'none', label: 'No Auth (Inherit Disabled)' },
                  { value: 'bearer', label: 'Bearer Token (JWT / API Token)' },
                  { value: 'basic', label: 'Basic Auth (Username & Password)' },
                  { value: 'custom', label: 'Custom Header (API Key)' },
                ]}
                fontMono
              />
            </div>

            {auth.auth_type === 'inherit' && (
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded text-xs space-y-1">
                <div className="text-zinc-200 font-medium flex items-center gap-1.5">
                  <Shield size={13} className="text-secondary" />
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
                <label className="block text-zinc-400 mb-1">Bearer Token</label>
                <div className="bg-zinc-900 border border-zinc-800 rounded focus-within:border-zinc-700 h-8">
                  <VariableInput
                    value={auth.token || ''}
                    onChange={(newVal) => setAuth({ ...auth, token: newVal })}
                    variables={activeVariables}
                    placeholder="{{TOKEN}} or raw-token"
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
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-zinc-700"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={auth.password || ''}
                    onChange={(e) => setAuth({ ...auth, password: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-zinc-700"
                  />
                </div>
              </div>
            )}

            {auth.auth_type === 'custom' && (
              <div className="space-y-2">
                <div>
                    <label className="block text-zinc-400 mb-1">Header / Metadata Name</label>
                  <input
                    type="text"
                    value={auth.header_name || ''}
                    onChange={(e) => setAuth({ ...auth, header_name: e.target.value })}
                    placeholder="e.g. X-API-Key or Authorization"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-zinc-700"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Header Value</label>
                  <div className="bg-zinc-900 border border-zinc-800 rounded focus-within:border-zinc-700 h-8">
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
          <ScriptEditorPane
            protocol="http"
            activeSubTab={hookScriptTab}
            onSubTabChange={setHookScriptTab}
            preScript={preRequestScript}
            onPreScriptChange={setPreRequestScript}
            postScript={postResponseScript}
            onPostScriptChange={setPostResponseScript}
            tests={hookTests}
            logs={hookLogs}
          />
        )}
      </div>
    </div>
  );
};
