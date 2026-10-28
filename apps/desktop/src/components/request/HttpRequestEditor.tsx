import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { executeNativeHttp } from '../../api/native';
import type { Endpoint, HttpAuth, HttpExecutionRequest, VariableResponse, Collection, CollectionFolder } from '@api-lab/api-types';
import { Save, Shield, Globe, Settings, Plus, Trash2, FileUp } from 'lucide-react';
import { EndpointConflictAlert } from './EndpointConflictAlert';
import { JsonEditor } from '../common/JsonEditor';
import { VariableInput } from '../common/VariableInput';
import { Select } from '../common/Select';
import { HttpMethodDropdown } from './HttpMethodDropdown';
import { KeyValueTable } from '../common/KeyValueTable';
import { ScriptEditorPane } from './ScriptEditorPane';
import { runBeforeHook, runAfterHook, type HookTestResult } from '../../utils/hookRunner';
import { applyCollectionSettingsToHttp } from '../../utils/collectionSettings';
import { syncEnvironmentVariables } from '../../utils/envSync';
import { getEffectiveEndpointConfig, isConfigDirty } from '../../utils/tabManager';
import { stripJsonComments } from '../../utils/jsonComments';
import {
  serializeQueryParamsToUrl,
  parseUrlQueryParams,
  type HttpBodyType,
  type QueryParamRow,
} from '../../utils/httpRequest';
import { substituteVariables } from '../../utils/responseViewerUtils';
import {
  extractPathVariables,
  interpolatePathVariables,
  convertSwaggerPathToApiPath,
  syncPathVariablesWithKeys,
} from '../../utils/pathVariables';
import {
  mergeFolderSettings,
  resolveInheritedAuth,
  getInheritedAuthHeader,
} from '../../utils/folderSettings';
import { findSwaggerFolderForEndpoint } from '../../utils/folderTree';
import { fetchSwaggerSpec } from '../../utils/swaggerGenerator';
import { parseSwaggerSpec } from '../../utils/swaggerParser';
import { getHttpMethodBadgeClass } from '../../utils/httpMethodUtils';
import { EndpointSpecificationView } from '../common/EndpointSpecificationView';

export interface MultipartField {
  name: string;
  value: string;
  enabled?: boolean;
  filename?: string;
  data?: string;
  content_type?: string;
}

export const HttpRequestEditor: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const queryClient = useQueryClient();
  const {
    activeEnvironmentId,
    setLastHttpResponse,
    setActiveEndpoint,
    setEndpointDraft,
    clearEndpointDraft,
    openFolderSettingsModal,
    openCollectionSettingsModal,
    setEndpointExecuting,
    setExecutedRequest,
  } = useAppStore();

  const [currentVersion, setCurrentVersion] = useState<number>(endpoint.version);
  const currentVersionRef = useRef<number>(endpoint.version);
  currentVersionRef.current = currentVersion;
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);

  const draft = useAppStore.getState().endpointDrafts[endpoint.id];
  const initialConfig = getEffectiveEndpointConfig(endpoint, draft);

  const [method, setMethod] = useState(initialConfig.method || 'GET');
  const [queryParams, setQueryParams] = useState<QueryParamRow[]>(() => {
    const rawParams = (initialConfig.query_params || []) as QueryParamRow[];
    const rawUrl = initialConfig.url !== undefined ? initialConfig.url : 'https://httpbin.org/get';
    const normalizedUrl = convertSwaggerPathToApiPath(rawUrl);
    if (normalizedUrl.includes('?')) {
      return parseUrlQueryParams(normalizedUrl, rawParams);
    }
    return rawParams.map(([k, v, d, en]) => [k, v, d ?? '', en !== false]);
  });
  const [url, setUrl] = useState(() => {
    const rawUrl = initialConfig.url !== undefined ? initialConfig.url : 'https://httpbin.org/get';
    const normalizedUrl = convertSwaggerPathToApiPath(rawUrl);
    const rawParams = (initialConfig.query_params || []) as QueryParamRow[];
    if (rawParams.length > 0 && !normalizedUrl.includes('?')) {
      return serializeQueryParamsToUrl(normalizedUrl, rawParams);
    }
    return normalizedUrl;
  });
  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body' | 'auth' | 'scripts' | 'specification'>('params');

  const [pathVariables, setPathVariables] = useState<[string, string, string, boolean][]>(() => {
    const saved = (initialConfig.path_variables || []) as Array<any>;
    const rawUrl = initialConfig.url !== undefined ? initialConfig.url : 'https://httpbin.org/get';
    const keys = extractPathVariables(convertSwaggerPathToApiPath(rawUrl));
    return syncPathVariablesWithKeys(saved, keys);
  });
  const [headers, setHeaders] = useState<[string, string, string, boolean][]>(() => {
    if (Array.isArray(initialConfig.headers_list)) {
      return initialConfig.headers_list.map((item: any) => [
        String(item[0] || ''),
        String(item[1] || ''),
        String(item[2] || ''),
        item[3] !== false,
      ]);
    }
    const raw = initialConfig.headers || {};
    const descs = initialConfig.header_descriptions || {};
    const disabled = initialConfig.header_disabled || {};
    return Object.entries(raw).map(([k, v]) => [
      k,
      v as string,
      descs[k] || '',
      !disabled[k],
    ]);
  });

  // Body & Auth state
  const [bodyType, setBodyType] = useState<HttpBodyType>(
    initialConfig.body_type || 'json'
  );
  const [body, setBody] = useState<string>(
    initialConfig.body !== undefined ? initialConfig.body : ''
  );
  const [multipartFields, setMultipartFields] = useState<MultipartField[]>(() => {
    try {
      const parsed = JSON.parse(initialConfig.body || '[]');
      return Array.isArray(parsed)
        ? parsed.map((item: any) => ({ ...item, enabled: item.enabled !== false }))
        : [];
    } catch {
      return [];
    }
  });
  const [auth, setAuth] = useState<HttpAuth>(
    initialConfig.auth || { auth_type: 'none' }
  );

  // Hook Scripts state (JavaScript hooks)
  const [preRequestScript, setPreRequestScript] = useState<string>(
    initialConfig.pre_request_script || ''
  );
  const [postResponseScript, setPostResponseScript] = useState<string>(
    initialConfig.post_response_script || initialConfig.post_request_script || ''
  );
  const [hookScriptTab, setHookScriptTab] = useState<'pre' | 'post'>('pre');
  const [hookTests, setHookTests] = useState<HookTestResult[]>([]);
  const [hookLogs, setHookLogs] = useState<string[]>([]);
  // Synchronize path variables when URL changes
  useEffect(() => {
    const keys = extractPathVariables(url);
    setPathVariables((prev) => syncPathVariablesWithKeys(prev, keys));
  }, [url]);

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

  const resolvedInheritedAuth = React.useMemo(() => {
    return resolveInheritedAuth(collection, folders, endpoint.folder_id);
  }, [collection, folders, endpoint.folder_id]);

  const inheritedAuthHeader = React.useMemo(() => {
    if (auth.auth_type !== 'inherit') return null;
    return getInheritedAuthHeader(resolvedInheritedAuth, 'http', activeVariables);
  }, [auth.auth_type, resolvedInheritedAuth, activeVariables]);

  const handleEditInheritedSource = React.useCallback(() => {
    if (!resolvedInheritedAuth) {
      if (endpoint.folder_id) {
        openFolderSettingsModal(endpoint.folder_id, endpoint.collection_id, 'auth');
      } else {
        openCollectionSettingsModal(endpoint.collection_id, 'auth');
      }
      return;
    }
    if (resolvedInheritedAuth.sourceType === 'folder') {
      openFolderSettingsModal(resolvedInheritedAuth.sourceId, endpoint.collection_id, 'auth');
    } else {
      openCollectionSettingsModal(endpoint.collection_id, 'auth');
    }
  }, [resolvedInheritedAuth, endpoint.folder_id, endpoint.collection_id, openFolderSettingsModal, openCollectionSettingsModal]);

  const swaggerFolderInfo = React.useMemo(() => {
    return findSwaggerFolderForEndpoint(endpoint.folder_id, folders, collection?.settings);
  }, [endpoint.folder_id, folders, collection?.settings]);

  const isSwaggerEndpoint = Boolean(swaggerFolderInfo || endpoint.config?.specification);

  const { data: swaggerDoc } = useQuery({
    queryKey: ['swaggerSpec', swaggerFolderInfo?.swaggerUrl],
    queryFn: async () => {
      if (!swaggerFolderInfo?.swaggerUrl) return null;
      return await fetchSwaggerSpec(swaggerFolderInfo.swaggerUrl);
    },
    enabled: !!swaggerFolderInfo?.swaggerUrl && !endpoint.config?.specification,
    staleTime: 5 * 60 * 1000,
  });

  const endpointSpec = React.useMemo(() => {
    if (endpoint.config?.specification) {
      return endpoint.config.specification;
    }
    if (!swaggerDoc) return null;
    const parsed = parseSwaggerSpec(swaggerDoc, swaggerFolderInfo?.swaggerUrl || '');
    for (const svc of parsed.services) {
      for (const ep of svc.endpoints) {
        if (
          ep.method.toUpperCase() === method.toUpperCase() &&
          (url.includes(ep.path) || ep.fullUrl === url || ep.name === endpoint.name)
        ) {
          return ep.specification || null;
        }
      }
    }
    return null;
  }, [endpoint.config?.specification, swaggerDoc, swaggerFolderInfo?.swaggerUrl, method, url, endpoint.name]);

  useEffect(() => {
    if (activeTab === 'specification' && !isSwaggerEndpoint) {
      setActiveTab('params');
    }
  }, [activeTab, isSwaggerEndpoint]);

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
      const rawUrl = cfg.url !== undefined ? cfg.url : 'https://httpbin.org/get';
      const normalizedUrl = convertSwaggerPathToApiPath(rawUrl);
      const rawParams = (cfg.query_params || []) as QueryParamRow[];
      const resolvedParams: QueryParamRow[] = normalizedUrl.includes('?')
        ? parseUrlQueryParams(normalizedUrl, rawParams)
        : rawParams.map(([k, v, d, en]) => [k, v, d ?? '', en !== false]);
      const resolvedUrl = rawParams.length > 0 && !normalizedUrl.includes('?')
        ? serializeQueryParamsToUrl(normalizedUrl, rawParams)
        : normalizedUrl;
      setUrl(resolvedUrl);
      setQueryParams(resolvedParams);
      if (Array.isArray(cfg.headers_list)) {
        setHeaders(cfg.headers_list.map((item: any) => [
          String(item[0] || ''),
          String(item[1] || ''),
          String(item[2] || ''),
          item[3] !== false,
        ]));
      } else {
        const rawHeaders = cfg.headers || {};
        const descs = cfg.header_descriptions || {};
        const disabled = cfg.header_disabled || {};
        setHeaders(Object.entries(rawHeaders).map(([k, v]) => [
          k,
          v as string,
          descs[k] || '',
          !disabled[k],
        ]));
      }
      setPathVariables(syncPathVariablesWithKeys(cfg.path_variables || [], extractPathVariables(resolvedUrl)));
      setBodyType(cfg.body_type || 'json');
      setBody(cfg.body || '');
      try {
        const parsedBody = JSON.parse(cfg.body || '[]');
        setMultipartFields(
          Array.isArray(parsedBody)
            ? parsedBody.map((item: any) => ({ ...item, enabled: item.enabled !== false }))
            : []
        );
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
    const headerDescMap: Record<string, string> = {};
    const headerDisabledMap: Record<string, boolean> = {};
    for (const [k, v, d, enabled] of headers) {
      if (k.trim()) {
        headerMap[k.trim()] = v;
        if (d && d.trim()) headerDescMap[k.trim()] = d.trim();
        if (enabled === false) headerDisabledMap[k.trim()] = true;
      }
    }
    return {
      method,
      url,
      query_params: queryParams.filter(([k]) => k && k.trim()),
      path_variables: pathVariables.filter(([k]) => k.trim()),
      headers: headerMap,
      headers_list: headers.filter(([k]) => k.trim()),
      header_descriptions: headerDescMap,
      header_disabled: headerDisabledMap,
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
    if (isConfigDirty(endpoint.config, cfg)) {
      setEndpointDraft(endpoint.id, cfg);
    } else {
      clearEndpointDraft(endpoint.id);
    }
  }, [
    method,
    url,
    queryParams,
    pathVariables,
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
  }, [currentVersion, preRequestScript, postResponseScript, method, url, queryParams, pathVariables, headers, bodyType, body, auth]);

  async function handleSend() {
    setSending(true);
    setEndpointExecuting(endpoint.id, true);
    setStatusMessage(null);

    const headerMap: Record<string, string> = {};
    for (const [k, v, _d, enabled] of headers) {
      if (k.trim() && enabled !== false) headerMap[k.trim()] = v;
    }

    const cleanBody = bodyType === 'multipart'
      ? JSON.stringify(multipartFields.filter((f) => f.enabled !== false && f.name.trim()))
      : bodyType === 'json' && body ? stripJsonComments(body) : body;

    const resolvedUrl = interpolatePathVariables(url, pathVariables);

    const execReq: HttpExecutionRequest = {
      url: resolvedUrl,
      method,
      headers: headerMap,
      query_params: queryParams
        .filter(([k, _v, _d, enabled]) => k && k.trim() && enabled !== false)
        .map(([k, v]) => [k, v] as [string, string]),
      body: bodyType === 'none' ? undefined : cleanBody,
      body_type: bodyType,
      auth,
      timeout_ms: 30000,
    };

    setExecutedRequest(endpoint.id, {
      timestamp: new Date().toISOString(),
      protocol: 'http',
      http: {
        url: execReq.url,
        method: execReq.method,
        headers: execReq.headers,
        queryParams: execReq.query_params,
        body: execReq.body,
        bodyType: execReq.body_type,
      },
    });

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

      const resolvedUrl = substituteVariables(finalReq.url, beforeResult.variables);
      const resolvedHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(finalReq.headers)) {
        resolvedHeaders[substituteVariables(k, beforeResult.variables)] = substituteVariables(v, beforeResult.variables);
      }
      const resolvedQueryParams = finalReq.query_params.map(
        ([k, v]) => [substituteVariables(k, beforeResult.variables), substituteVariables(v, beforeResult.variables)] as [string, string]
      );

      setExecutedRequest(endpoint.id, {
        timestamp: new Date().toISOString(),
        protocol: 'http',
        http: {
          url: resolvedUrl,
          method: finalReq.method,
          headers: resolvedHeaders,
          queryParams: resolvedQueryParams,
          body: finalReq.body,
          bodyType: finalReq.body_type,
        },
      });

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
      setEndpointExecuting(endpoint.id, false);
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
          <EndpointConflictAlert endpointId={endpoint.id} />

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
        <div className="flex-1 flex items-center bg-zinc-900 border border-zinc-800 rounded h-9 focus-within:border-primary transition">
          <HttpMethodDropdown
            method={method}
            onChange={setMethod}
          />

          <div className="h-4 w-px bg-zinc-800 mx-1 flex-shrink-0" />

          <div className="flex-1 h-full flex items-center px-1 min-w-0">
            <VariableInput
              value={url}
              onChange={(next) => {
                const normalized = convertSwaggerPathToApiPath(next);
                setUrl(normalized);
                setQueryParams((prev) => parseUrlQueryParams(normalized, prev));
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
          className="px-4 py-2 bg-primary hover:bg-primary-hover active:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded text-xs flex items-center gap-1.5 transition h-9 flex-shrink-0 cursor-pointer shadow-sm"
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
            {queryParams.filter(([k, _v, _d, enabled]) => k.trim() && enabled !== false).length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                {queryParams.filter(([k, _v, _d, enabled]) => k.trim() && enabled !== false).length}
              </span>
            )}
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
            {headers.filter(([k, _v, _d, enabled]) => k.trim() && enabled !== false).length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                {headers.filter(([k, _v, _d, enabled]) => k.trim() && enabled !== false).length}
              </span>
            )}
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
            {bodyType === 'multipart' && multipartFields.filter((f) => f.name.trim() && f.enabled !== false).length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                {multipartFields.filter((f) => f.name.trim() && f.enabled !== false).length}
              </span>
            )}
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
          {isSwaggerEndpoint && (
            <button
              onClick={() => setActiveTab('specification')}
              className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
                activeTab === 'specification'
                  ? 'border-primary text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>Specification</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {/* Params Panel */}
        {activeTab === 'params' && (
          <div className="space-y-4">
            {pathVariables.length > 0 && (
              <KeyValueTable
                title="Path Variables"
                items={pathVariables}
                onChange={setPathVariables}
                variables={activeVariables}
                keyPlaceholder="path-variable"
                valuePlaceholder="value (or {{VAR}})"
                descriptionPlaceholder="Description (optional)"
                readOnlyKeys={true}
                hideAdd={true}
                hideDelete={true}
                hideBulkEdit={true}
              />
            )}

            <KeyValueTable
              title="Query Parameters"
              items={queryParams}
              onChange={(next) => {
                setQueryParams(next);
                setUrl((prevUrl) => serializeQueryParamsToUrl(prevUrl, next));
              }}
              showCheckbox={true}
              variables={activeVariables}
              keyPlaceholder="parameter"
              valuePlaceholder="value (or {{VAR}})"
              descriptionPlaceholder="Description (optional)"
              addLabel="Add Param"
            />
          </div>
        )}

        {/* Headers Panel */}
        {activeTab === 'headers' && (
          <KeyValueTable
            title="Request Headers"
            items={headers}
            onChange={setHeaders}
            inheritedEntries={
              inheritedAuthHeader
                ? [
                    {
                      key: inheritedAuthHeader.key,
                      value: inheritedAuthHeader.value,
                      description: inheritedAuthHeader.description,
                      sourceLabel: `${inheritedAuthHeader.sourceType}: ${inheritedAuthHeader.sourceName}`,
                      onEditSource: handleEditInheritedSource,
                    },
                  ]
                : []
            }
            variables={activeVariables}
            keyPlaceholder="Header-Name"
            valuePlaceholder="Header-Value (or {{VAR}})"
            descriptionPlaceholder="Description (optional)"
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
              <div className="space-y-2 text-xs">
                {/* Top Action Header */}
                <div className="flex items-center justify-between pb-1 select-none">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-300">Multipart Form Data</span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {multipartFields.length} {multipartFields.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {multipartFields.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMultipartFields([])}
                        className="text-[11px] text-zinc-500 hover:text-red-400 px-1.5 py-0.5 transition"
                        title="Clear all entries"
                      >
                        Clear All
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setMultipartFields((fields) => [
                          ...fields,
                          { name: '', value: '', enabled: true },
                        ])
                      }
                      className="flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
                    >
                      <Plus size={11} />
                      <span>Add Field</span>
                    </button>
                  </div>
                </div>

                {/* Table Surface */}
                <div className="border border-zinc-800/80 rounded-md overflow-hidden bg-zinc-950">
                  {/* Table Header */}
                  <div className="grid grid-cols-[24px_1fr_1fr_auto_28px] gap-2 bg-zinc-900/60 border-b border-zinc-800/80 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 select-none items-center">
                    <div className="text-center"></div>
                    <div>Key</div>
                    <div>Value</div>
                    <div>Type</div>
                    <div className="text-right pr-1">Action</div>
                  </div>

                  {/* Table Rows */}
                  {multipartFields.length === 0 ? (
                    <div className="py-6 text-center text-zinc-500 font-sans select-none">
                      No entries. Click <strong className="text-zinc-400 font-medium">"Add Field"</strong> to add one.
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-900">
                      {multipartFields.map((field, index) => {
                        const isRowEnabled = field.enabled !== false;
                        return (
                          <div
                            key={index}
                            className={`grid grid-cols-[24px_1fr_1fr_auto_28px] gap-2 items-center px-2 py-1.5 hover:bg-zinc-900/40 transition group ${
                              !isRowEnabled ? 'opacity-60' : ''
                            }`}
                          >
                            {/* Checkbox */}
                            <div className="flex items-center justify-center">
                              <input
                                type="checkbox"
                                checked={isRowEnabled}
                                onChange={(e) =>
                                  setMultipartFields((fields) =>
                                    fields.map((item, i) =>
                                      i === index ? { ...item, enabled: e.target.checked } : item
                                    )
                                  )
                                }
                                className="rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-0 cursor-pointer"
                                title={isRowEnabled ? 'Disable field' : 'Enable field'}
                              />
                            </div>

                            {/* Field Name */}
                            <div>
                              <input
                                value={field.name}
                                onChange={(e) =>
                                  setMultipartFields((fields) =>
                                    fields.map((item, i) =>
                                      i === index ? { ...item, name: e.target.value } : item
                                    )
                                  )
                                }
                                placeholder="field-name"
                                className={`w-full border rounded px-2.5 py-1 text-xs font-mono h-7 focus:outline-none ${
                                  isRowEnabled
                                    ? 'bg-zinc-900 border-zinc-800 text-zinc-200 focus:border-zinc-700'
                                    : 'bg-zinc-900/60 border-zinc-800/60 text-zinc-400 focus:border-zinc-700 line-through'
                                }`}
                              />
                            </div>

                            {/* Value / File */}
                            <div>
                              {field.filename ? (
                                <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs font-mono h-7 text-zinc-200">
                                  <span className="truncate pr-1.5" title={field.filename}>
                                    {field.filename}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMultipartFields((fields) =>
                                        fields.map((item, i) =>
                                          i === index
                                            ? {
                                                name: item.name,
                                                value: '',
                                                enabled: item.enabled,
                                              }
                                            : item
                                        )
                                      )
                                    }
                                    className="text-zinc-500 hover:text-red-400 text-xs px-1"
                                    title="Remove file"
                                  >
                                    ×
                                  </button>
                                </div>
                              ) : (
                                <input
                                  value={field.value}
                                  onChange={(e) =>
                                    setMultipartFields((fields) =>
                                      fields.map((item, i) =>
                                        i === index ? { ...item, value: e.target.value } : item
                                      )
                                    )
                                  }
                                  placeholder="value (or {{VAR}})"
                                  className={`w-full border rounded px-2.5 py-1 text-xs font-mono h-7 focus:outline-none ${
                                    isRowEnabled
                                      ? 'bg-zinc-900 border-zinc-800 text-zinc-200 focus:border-zinc-700'
                                      : 'bg-zinc-900/60 border-zinc-800/60 text-zinc-400 focus:border-zinc-700'
                                  }`}
                                />
                              )}
                            </div>

                            {/* File Upload Trigger */}
                            <div>
                              <label className="cursor-pointer px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 hover:border-zinc-700 rounded text-[11px] font-medium flex items-center gap-1 transition h-7 select-none">
                                <FileUp size={11} className="text-zinc-400" />
                                <span>{field.filename ? 'Replace' : 'File'}</span>
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = () =>
                                      setMultipartFields((fields) =>
                                        fields.map((item, i) =>
                                          i === index
                                            ? {
                                                ...item,
                                                filename: file.name,
                                                data: String(reader.result).split(',', 2)[1] || '',
                                                content_type: file.type || 'application/octet-stream',
                                              }
                                            : item
                                        )
                                      );
                                    reader.readAsDataURL(file);
                                  }}
                                />
                              </label>
                            </div>

                            {/* Action (Delete) */}
                            <div className="text-right pr-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setMultipartFields((fields) =>
                                    fields.filter((_, i) => i !== index)
                                  )
                                }
                                className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-900 transition"
                                title="Delete field"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                  { value: 'inherit', label: 'Inherit auth from parent' },
                  { value: 'none', label: 'No Auth (Inherit Disabled)' },
                  { value: 'bearer', label: 'Bearer Token (JWT / API Token)' },
                  { value: 'basic', label: 'Basic Auth (Username & Password)' },
                  { value: 'custom', label: 'Custom Header (API Key)' },
                ]}
                fontMono
              />
            </div>

            {auth.auth_type === 'inherit' && (
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-zinc-200 font-medium flex items-center gap-1.5">
                    <Shield size={13} className="text-secondary" />
                    <span>
                      {resolvedInheritedAuth
                        ? `Inherited from ${resolvedInheritedAuth.sourceType}: ${resolvedInheritedAuth.sourceName}`
                        : 'Inherit auth from parent'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleEditInheritedSource}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 transition"
                    title="Edit inherited authorization settings"
                  >
                    <Settings size={11} />
                    <span>Edit in Settings</span>
                  </button>
                </div>
                <div className="text-zinc-400 text-[11px]">
                  {resolvedInheritedAuth
                    ? `Type: ${resolvedInheritedAuth.auth.auth_type.toUpperCase()} ${
                        resolvedInheritedAuth.auth.token
                          ? `(Token: ${resolvedInheritedAuth.auth.token.slice(0, 15)}...)`
                          : resolvedInheritedAuth.auth.header_name
                          ? `(Header: ${resolvedInheritedAuth.auth.header_name})`
                          : ''
                      }`
                    : 'No authorization configured on parent folders or collection yet. Click "Edit in Settings" to configure.'}
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

        {/* Specification Panel (for Swagger Folder endpoints) */}
        {activeTab === 'specification' && (
          <EndpointSpecificationView
            serviceName={swaggerFolderInfo?.folder.name || 'Swagger'}
            methodName={endpoint.name}
            badge={{
              label: method,
              colorClass: getHttpMethodBadgeClass(method, true),
            }}
            request={
              endpointSpec?.requestFields && endpointSpec.requestFields.length > 0
                ? {
                    typeName: endpointSpec.requestTypeName || 'RequestBody',
                    fields: endpointSpec.requestFields,
                  }
                : null
            }
            response={
              endpointSpec?.responseFields && endpointSpec.responseFields.length > 0
                ? {
                    typeName: endpointSpec.responseTypeName || 'ResponseBody',
                    fields: endpointSpec.responseFields,
                  }
                : null
            }
            emptyMessage="No request or response specification found in the Swagger definition for this operation."
          />
        )}
      </div>
    </div>
  );
};
