import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import {
  executeNativeGrpc,
  executeNativeGrpcStream,
  sendNativeGrpcStreamMessage,
  discoverNativeGrpcServices,
  generateNativeGrpcSamplePayload,
} from '../../api/native';
import type {
  Endpoint,
  GrpcExecutionRequest,
  GrpcServiceSummary,
  VariableResponse,
  Collection,
  CollectionFolder,
  HttpAuth,
} from '@api-lab/api-types';
import {
  Save,
  RefreshCw,
  Wand2,
  BookOpen,
  Copy,
  Check,
  ChevronDown,
  Radio,
  ArrowDownUp,
  ArrowLeftRight,
  Send,
  Shield,
  Search,
  X,
  Eye,
  EyeOff,
  Settings,
} from 'lucide-react';
import { JsonEditor } from '../common/JsonEditor';
import { VariableInput } from '../common/VariableInput';
import { Select } from '../common/Select';
import { resolveInheritedGrpcAddress } from '../../utils/folderTree';
import { KeyValueTable } from '../common/KeyValueTable';
import { ScriptEditorPane } from './ScriptEditorPane';
import { runBeforeHook, runAfterHook, type HookTestResult } from '../../utils/hookRunner';
import { applyCollectionSettingsToGrpc } from '../../utils/collectionSettings';
import { syncEnvironmentVariables } from '../../utils/envSync';
import { shouldAutoDetectTls } from '../../utils/grpcReflectionGenerator';
import {
  formatRpcSignature,
  filterGrpcServices,
} from '../../utils/grpcSpecification';
import { getEffectiveEndpointConfig } from '../../utils/tabManager';
import { parseJsonWithComments } from '../../utils/jsonComments';
import { mergeFolderSettings } from '../../utils/folderSettings';

function substituteVars(obj: any, vars: Record<string, string>): any {
  if (!obj || !vars) return obj;
  if (typeof obj === 'string') {
    return obj.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, k) => vars[k] ?? vars[k.toLowerCase()] ?? vars[k.toUpperCase()] ?? `{{${k}}}`);
  }
  if (Array.isArray(obj)) return obj.map((i) => substituteVars(i, vars));
  if (typeof obj === 'object') {
    const res: any = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = substituteVars(v, vars);
    }
    return res;
  }
  return obj;
}

export const GrpcRequestEditor: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const queryClient = useQueryClient();
  const {
    activeEnvironmentId,
    lastGrpcResponse,
    setLastGrpcResponse,
    isStreaming,
    activeStreamId,
    streamingEndpointId,
    setIsStreaming,
    addStreamMessage,
    clearStreamMessages,
    stopStreaming,
    setActiveEndpoint,
    setEndpointDraft,
    clearEndpointDraft,
    openReflectionSettingsModal,
  } = useAppStore();

  const [currentVersion, setCurrentVersion] = useState<number>(endpoint.version);
  const currentVersionRef = useRef<number>(endpoint.version);
  currentVersionRef.current = currentVersion;
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);

  const draft = useAppStore.getState().endpointDrafts[endpoint.id];
  const initialConfig = getEffectiveEndpointConfig(endpoint, draft);

  const [serverAddress, setServerAddress] = useState(
    initialConfig.server_address || 'localhost:50051'
  );
  const [useTls, setUseTls] = useState<boolean>(() => {
    if (initialConfig.use_tls !== undefined) return Boolean(initialConfig.use_tls);
    return shouldAutoDetectTls(initialConfig.server_address || 'localhost:50051');
  });
  const [selectedService, setSelectedService] = useState(initialConfig.service || '');
  const [selectedMethod, setSelectedMethod] = useState(initialConfig.method || '');

  // Options state
  const [authorityOverride, setAuthorityOverride] = useState(
    initialConfig.authority_override || ''
  );
  const [auth, setAuth] = useState<HttpAuth>(() => {
    return initialConfig.auth || { auth_type: 'inherit' };
  });
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    initialConfig.timeout_seconds !== undefined ? String(initialConfig.timeout_seconds) : '30'
  );
  const [maxMsgSizeMb, setMaxMsgSizeMb] = useState(
    initialConfig.max_msg_size_mb !== undefined ? String(initialConfig.max_msg_size_mb) : '4'
  );

  // Specification state
  const [showReqSchemaPreview, setShowReqSchemaPreview] = useState(false);
  const [showResSchemaPreview, setShowResSchemaPreview] = useState(false);

  const [activeVariables, setActiveVariables] = useState<Record<string, string>>({});

  async function resolveVariables(): Promise<Record<string, string>> {
    const activeVars: Record<string, string> = {};
    if (activeEnvironmentId) {
      const envVars = queryClient.getQueryData<VariableResponse[]>(['variables', activeEnvironmentId]);
      if (envVars) {
        for (const v of envVars) {
          activeVars[v.key] = v.value;
        }
      } else {
        try {
          const fetched = await apiRequest<VariableResponse[]>(`/environments/${activeEnvironmentId}/variables`);
          for (const v of fetched) {
            activeVars[v.key] = v.value;
          }
        } catch {
          // fallback
        }
      }
    }
    return activeVars;
  }

  useEffect(() => {
    resolveVariables().then(setActiveVariables);
  }, [activeEnvironmentId]);

  // Fetch parent collection for inherited settings
  const { data: collection } = useQuery<Collection>({
    queryKey: ['collection', endpoint.collection_id],
    queryFn: () => apiRequest<Collection>(`/collections/${endpoint.collection_id}`),
    enabled: !!endpoint.collection_id,
  });

  // Fetch folders of collection to compute reflection folder inheritance
  const { data: folders = [] } = useQuery<CollectionFolder[]>({
    queryKey: ['folders', endpoint.collection_id],
    queryFn: () => apiRequest<CollectionFolder[]>(`/collections/${endpoint.collection_id}/folders`),
    enabled: !!endpoint.collection_id,
  });

  const inheritedInfo = resolveInheritedGrpcAddress(endpoint, folders, collection?.settings);
  const effectiveServerAddress = inheritedInfo.isInherited
    ? (inheritedInfo.inheritedAddress || '')
    : serverAddress;

  const effectiveTls = useTls || shouldAutoDetectTls(effectiveServerAddress, activeVariables);

  // Auto-discover & cache reflection per server address (Fix for Bug 1)
  const {
    data: cachedServices = [],
    isFetching: discovering,
    refetch: refetchReflection,
  } = useQuery<GrpcServiceSummary[]>({
    queryKey: ['reflection', effectiveServerAddress, effectiveTls, activeEnvironmentId],
    queryFn: async () => {
      if (!effectiveServerAddress.trim()) return [];
      const activeVars = await resolveVariables();
      const res = await discoverNativeGrpcServices(
        { server_address: effectiveServerAddress, use_tls: effectiveTls },
        activeVars
      );
      if (res.error) {
        return [];
      }
      return res.services || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!effectiveServerAddress.trim(),
  });

  const discoveredServices = cachedServices;

  const [metadata, setMetadata] = useState<[string, string][]>(() => {
    const raw = initialConfig.metadata || {};
    return Object.entries(raw);
  });
  const [payloadStr, setPayloadStr] = useState<string>(() => {
    if (initialConfig.payload !== undefined && initialConfig.payload !== null) {
      return typeof initialConfig.payload === 'string'
        ? initialConfig.payload
        : JSON.stringify(initialConfig.payload, null, 2);
    }
    return '{}';
  });

  // Scripts state
  const [preRequestScript, setPreRequestScript] = useState<string>(
    initialConfig.pre_request_script || ''
  );
  const [postResponseScript, setPostResponseScript] = useState<string>(
    initialConfig.post_response_script || initialConfig.post_request_script || ''
  );
  const [hookScriptTab, setHookScriptTab] = useState<'pre' | 'post'>('pre');
  const [hookTests, setHookTests] = useState<HookTestResult[]>([]);
  const [hookLogs, setHookLogs] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState<'payload' | 'metadata' | 'authorization' | 'scripts' | 'options' | 'specification'>('payload');
  const [copiedSpec, setCopiedSpec] = useState<'signature' | 'input' | 'output' | 'sample' | null>(null);
  const [sampleSpecLoading, setSampleSpecLoading] = useState(false);
  const [specSamplePayload, setSpecSamplePayload] = useState<any>(null);
  const [schemaSamplePayload, setSchemaSamplePayload] = useState<any>(null);
  const [generatingPayload, setGeneratingPayload] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [isMethodPickerOpen, setIsMethodPickerOpen] = useState(false);
  const [methodSearchQuery, setMethodSearchQuery] = useState('');
  const methodPickerRef = useRef<HTMLDivElement>(null);
  const methodSearchInputRef = useRef<HTMLInputElement>(null);

  // Track previous endpoint id to only reinitialize state when switching to a different endpoint without remount
  const prevEndpointIdRef = useRef(endpoint.id);
  useEffect(() => {
    if (prevEndpointIdRef.current !== endpoint.id) {
      prevEndpointIdRef.current = endpoint.id;
      setCurrentVersion(endpoint.version);
      currentVersionRef.current = endpoint.version;
      const currentDraft = useAppStore.getState().endpointDrafts[endpoint.id];
      const cfg = getEffectiveEndpointConfig(endpoint, currentDraft);
      setServerAddress(cfg.server_address || 'localhost:50051');
      setUseTls(
        cfg.use_tls !== undefined
          ? Boolean(cfg.use_tls)
          : shouldAutoDetectTls(cfg.server_address || 'localhost:50051', activeVariables)
      );
      setSelectedService(cfg.service || '');
      setSelectedMethod(cfg.method || '');
      setSchemaSamplePayload(null);
      setAuthorityOverride(cfg.authority_override || '');
      setAuth(cfg.auth || { auth_type: 'inherit' });
      setTimeoutSeconds(cfg.timeout_seconds !== undefined ? String(cfg.timeout_seconds) : '30');
      setMaxMsgSizeMb(cfg.max_msg_size_mb !== undefined ? String(cfg.max_msg_size_mb) : '4');
      setShowReqSchemaPreview(false);
      setShowResSchemaPreview(false);
      setMetadata(Object.entries(cfg.metadata || {}));
       setAuth(cfg.auth || { auth_type: 'inherit' });
      setPayloadStr(
        cfg.payload !== undefined && cfg.payload !== null
          ? typeof cfg.payload === 'string'
            ? cfg.payload
            : JSON.stringify(cfg.payload, null, 2)
          : '{}'
      );
      setPreRequestScript(cfg.pre_request_script || '');
      setPostResponseScript(
        cfg.post_request_script || cfg.post_response_script || ''
      );
      setHookTests([]);
      setHookLogs([]);
    }
  }, [endpoint.id]);

  // Discover services via reflection
  async function handleDiscover() {
    setStatusMessage('Querying server reflection...');
    const res = await refetchReflection();
    if (res.data && res.data.length > 0) {
      setStatusMessage(`Discovered ${res.data.length} services via reflection`);
      if (!selectedService) {
        setSelectedService(res.data[0].name);
        if (res.data[0].methods.length > 0) {
          setSelectedMethod(res.data[0].methods[0].name);
        }
      }
    } else {
      setStatusMessage('No services discovered. Reflection may be disabled on target.');
    }
    setTimeout(() => setStatusMessage(null), 3500);
  }

  // Generate example JSON payload from reflection schema (Feature 4)
  async function handleGenerateSamplePayload() {
    if (!selectedService || !selectedMethod) {
      setStatusMessage('Please select a service and method first');
      return;
    }

    setGeneratingPayload(true);
    setStatusMessage(null);

    try {
      const activeVars = await resolveVariables();
      const res = await generateNativeGrpcSamplePayload(
        {
          server_address: effectiveServerAddress,
          service: selectedService,
          method: selectedMethod,
          use_tls: useTls,
        },
        activeVars
      );

      if (res.error) {
        setStatusMessage(`Sample payload generation error: ${res.error}`);
      } else if (res.payload) {
        setPayloadStr(JSON.stringify(res.payload, null, 2));
        setStatusMessage('Generated example JSON payload from protobuf schema');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (err: any) {
      setStatusMessage(`Generation error: ${err.message}`);
    } finally {
      setGeneratingPayload(false);
    }
  }

  const currentServiceObj = discoveredServices.find((s) => s.name === selectedService);
  const availableMethods = currentServiceObj?.methods || [];
  const currentMethodObj = availableMethods.find((m) => m.name === selectedMethod);
  const shortServiceName = selectedService
    ? selectedService.split('.').pop() || selectedService
    : '';

  const schemaFieldNames = schemaSamplePayload && typeof schemaSamplePayload === 'object'
    ? Object.keys(schemaSamplePayload)
    : [];

  useEffect(() => {
    if (!selectedService || !selectedMethod) {
      setSchemaSamplePayload(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const activeVars = await resolveVariables();
        const res = await generateNativeGrpcSamplePayload(
          {
            server_address: effectiveServerAddress,
            service: selectedService,
            method: selectedMethod,
            use_tls: effectiveTls,
          },
          activeVars
        );
        if (!cancelled && res.payload) setSchemaSamplePayload(res.payload);
      } catch {
        if (!cancelled) setSchemaSamplePayload(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedService, selectedMethod, effectiveServerAddress, effectiveTls]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isMethodPickerOpen) {
      setMethodSearchQuery('');
      setTimeout(() => {
        methodSearchInputRef.current?.focus();
      }, 50);
    }
  }, [isMethodPickerOpen]);

  // Filtered services for method picker dropdown
  const filteredServices = filterGrpcServices(discoveredServices, methodSearchQuery);

  // Close method picker dropdown on outside click
  useEffect(() => {
    if (!isMethodPickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (methodPickerRef.current && !methodPickerRef.current.contains(e.target as Node)) {
        setIsMethodPickerOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isMethodPickerOpen]);

  // Auto-fetch sample message struct for specification tab
  useEffect(() => {
    if (activeTab === 'specification' && selectedService && selectedMethod && !specSamplePayload) {
      let isCancelled = false;
      (async () => {
        try {
          setSampleSpecLoading(true);
          const activeVars = await resolveVariables();
          const res = await generateNativeGrpcSamplePayload(
            {
              server_address: effectiveServerAddress,
              service: selectedService,
              method: selectedMethod,
              use_tls: effectiveTls,
            },
            activeVars
          );
          if (!isCancelled && res.payload) {
            setSpecSamplePayload(res.payload);
          }
        } catch {
          // ignore
        } finally {
          if (!isCancelled) setSampleSpecLoading(false);
        }
      })();
      return () => {
        isCancelled = true;
      };
    }
  }, [activeTab, selectedService, selectedMethod, effectiveServerAddress, effectiveTls, specSamplePayload]);

  const streamType =
    currentMethodObj?.stream_type ||
    endpoint.config?.stream_type ||
    (currentMethodObj?.is_server_streaming || currentMethodObj?.is_client_streaming
      ? 'omni_stream'
      : 'unary');

  const isStreamingRpc = streamType !== 'unary';
  const isCurrentEndpointStreaming = isStreaming && streamingEndpointId === endpoint.id;

  function applyRequestAuth(metaMap: Record<string, string>) {
    if (auth.auth_type === 'inherit') return;
    Object.keys(metaMap).forEach((key) => {
      if (key.toLowerCase() === 'authorization') delete metaMap[key];
    });
    if (auth.auth_type === 'none') return;
    if (auth.auth_type === 'bearer' && auth.token?.trim()) {
      const token = auth.token.trim();
      metaMap.authorization = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
    } else if (auth.auth_type === 'custom' && auth.header_name?.trim() && auth.header_value?.trim()) {
      metaMap[auth.header_name.trim()] = auth.header_value.trim();
    }
  }

  function buildConfig() {
    const metaMap: Record<string, string> = {};
    for (const [k, v] of metadata) {
      if (k.trim()) metaMap[k.trim()] = v;
    }
    applyRequestAuth(metaMap);

    let payloadJson = {};
    try {
      payloadJson = parseJsonWithComments(payloadStr || '{}');
    } catch {
      // ignore
    }

    return {
      server_address: effectiveServerAddress,
      service: selectedService,
      method: selectedMethod,
      use_tls: effectiveTls,
      stream_type: streamType,
      authority_override: authorityOverride.trim(),
      timeout_seconds: timeoutSeconds ? Number(timeoutSeconds) : 30,
      max_msg_size_mb: maxMsgSizeMb ? Number(maxMsgSizeMb) : 4,
      metadata: metaMap,
      auth,
      payload: payloadJson,
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
    let parsedPayload: any = {};
    try {
      parsedPayload = parseJsonWithComments(payloadStr || '{}');
    } catch {
      parsedPayload = payloadStr;
    }
    const metaMap: Record<string, string> = {};
    for (const [k, v] of metadata) {
      if (k.trim()) metaMap[k.trim()] = v;
    }
    applyRequestAuth(metaMap);
    const cfg = {
      server_address: serverAddress,
      use_tls: useTls,
      service: selectedService,
      method: selectedMethod,
      stream_type: streamType,
      authority_override: authorityOverride.trim(),
      timeout_seconds: timeoutSeconds ? Number(timeoutSeconds) : 30,
      max_msg_size_mb: maxMsgSizeMb ? Number(maxMsgSizeMb) : 4,
      metadata: metaMap,
      auth,
      payload: parsedPayload,
      pre_request_script: preRequestScript,
      post_request_script: postResponseScript,
      post_response_script: postResponseScript,
    };
    setEndpointDraft(endpoint.id, cfg);
  }, [
    serverAddress,
    useTls,
    selectedService,
    selectedMethod,
    streamType,
    authorityOverride,
    timeoutSeconds,
    maxMsgSizeMb,
    metadata,
    auth,
    payloadStr,
    preRequestScript,
    postResponseScript,
  ]);

  // Keyboard shortcuts: Ctrl+S to save, Ctrl+Enter to invoke / stream
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveChanges({ silent: false });
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (isStreamingRpc) {
          if (isCurrentEndpointStreaming && streamType === 'bidi_stream') {
            handleSendStreamMessage();
          } else if (!isCurrentEndpointStreaming) {
            handleStartStream();
          } else {
            handleStopStream();
          }
        } else {
          handleSend();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentVersion, isStreamingRpc, isCurrentEndpointStreaming, streamType, activeStreamId, selectedService, selectedMethod, preRequestScript, postResponseScript, payloadStr, serverAddress, useTls, metadata, auth]);

  // Execute unary gRPC
  async function handleSend() {
    saveChanges({ silent: true });
    setSending(true);
    setStatusMessage(null);

    const metaMap: Record<string, string> = {};
    for (const [k, v] of metadata) {
      if (k.trim()) metaMap[k.trim()] = v;
    }
    applyRequestAuth(metaMap);

    let parsedPayload: any = {};
    try {
      parsedPayload = parseJsonWithComments(payloadStr || '{}');
    } catch (err: any) {
       setLastGrpcResponse({
        status_code: 3,
        status_message: 'Invalid JSON',
        response_time_ms: 0,
        response_size_bytes: 0,
        metadata: {},
        body: null,
         error: `Payload is not valid JSON: ${err.message}`,
       }, endpoint.id);
      setSending(false);
      return;
    }

    const execReq: GrpcExecutionRequest = {
      server_address: effectiveServerAddress,
      service: selectedService,
      method: selectedMethod,
       metadata: metaMap,
      payload: parsedPayload,
      use_tls: effectiveTls,
      timeout_ms: 30000,
      auth,
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

      let finalReq = applyCollectionSettingsToGrpc(
        beforeResult.request,
         auth.auth_type === 'inherit' ? mergeFolderSettings(currentColl?.settings, folders, endpoint.folder_id) : undefined,
        beforeResult.variables
      );

      if (auth.auth_type === 'bearer' && auth.token) {
        const token = substituteVars(auth.token.trim(), beforeResult.variables);
        finalReq = {
          ...finalReq,
          metadata: {
            ...finalReq.metadata,
            authorization: token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`,
          },
        };
      } else if (auth.auth_type === 'custom' && auth.header_name && auth.header_value) {
        const headerName = substituteVars(auth.header_name.trim(), beforeResult.variables).toLowerCase();
        const headerVal = substituteVars(auth.header_value.trim(), beforeResult.variables);
        finalReq = {
          ...finalReq,
          metadata: {
            ...finalReq.metadata,
            [headerName]: headerVal,
          },
        };
      }

      // 3. Execute gRPC Request
      const resp = await executeNativeGrpc(finalReq, beforeResult.variables);
      setLastGrpcResponse(resp, endpoint.id);

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
       setLastGrpcResponse({
        status_code: 14,
        status_message: 'Execution Failed',
        response_time_ms: 0,
        response_size_bytes: 0,
        metadata: {},
        body: null,
         error: err.message,
       }, endpoint.id);
    } finally {
      setSending(false);
    }
  }

  // Execute Streaming gRPC (Feature 1)
  async function handleStartStream() {
    saveChanges({ silent: true });
    setSending(true);
    setStatusMessage('Starting stream...');
    clearStreamMessages();

    const metaMap: Record<string, string> = {};
    for (const [k, v] of metadata) {
      if (k.trim()) metaMap[k.trim()] = v;
    }
    applyRequestAuth(metaMap);

    let parsedPayload: any = {};
    try {
      parsedPayload = parseJsonWithComments(payloadStr || '{}');
    } catch (err: any) {
      setLastGrpcResponse({
        status_code: 3,
        status_message: 'Invalid JSON',
        response_time_ms: 0,
        response_size_bytes: 0,
        metadata: {},
        body: null,
        error: `Payload is not valid JSON: ${err.message}`,
      }, endpoint.id);
      setSending(false);
      return;
    }

    const execReq: GrpcExecutionRequest = {
      server_address: effectiveServerAddress,
      service: selectedService,
      method: selectedMethod,
      metadata: metaMap,
      auth,
      payload: parsedPayload,
      use_tls: effectiveTls,
      timeout_ms: 60000,
    };

    const streamId = `stream-${Date.now()}`;
    setIsStreaming(true, streamId, endpoint.id);
    addStreamMessage(parsedPayload, 'out');

    try {
      const currentVars = await resolveVariables();
      const beforeResult = await runBeforeHook(preRequestScript, execReq, currentVars);
      setHookLogs(beforeResult.logs);

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

      let finalReq = applyCollectionSettingsToGrpc(
        beforeResult.request,
         auth.auth_type === 'inherit' ? mergeFolderSettings(currentColl?.settings, folders, endpoint.folder_id) : undefined,
        beforeResult.variables
      );

      if (auth.auth_type === 'bearer' && auth.token) {
        const token = substituteVars(auth.token.trim(), beforeResult.variables);
        finalReq = {
          ...finalReq,
          metadata: {
            ...finalReq.metadata,
            authorization: token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`,
          },
        };
      } else if (auth.auth_type === 'custom' && auth.header_name && auth.header_value) {
        const headerName = substituteVars(auth.header_name.trim(), beforeResult.variables).toLowerCase();
        const headerVal = substituteVars(auth.header_value.trim(), beforeResult.variables);
        finalReq = {
          ...finalReq,
          metadata: {
            ...finalReq.metadata,
            [headerName]: headerVal,
          },
        };
      }

      const resp = await executeNativeGrpcStream(
        finalReq,
        beforeResult.variables,
        streamId,
        (msg) => {
          addStreamMessage(msg, 'in');
        }
      );
      setLastGrpcResponse(resp, endpoint.id);

      const afterResult = await runAfterHook(
        postResponseScript,
        finalReq,
        resp,
        beforeResult.variables
      );
      setHookTests(afterResult.tests);
      setHookLogs((prev) => [...prev, ...afterResult.logs]);
      setActiveVariables(afterResult.variables);

      // Sync variables modified by stream hook to the active environment (Bug 2 Fix)
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
      setLastGrpcResponse({
        status_code: 14,
        status_message: 'Stream Failed',
        response_time_ms: 0,
        response_size_bytes: 0,
        metadata: {},
        body: null,
        error: err.message,
      }, endpoint.id);
    } finally {
      setIsStreaming(false, null, null);
      setSending(false);
    }
  }

  async function handleSendStreamMessage() {
    if (!isCurrentEndpointStreaming || !activeStreamId) return;
    let parsedPayload: any = {};
    try {
      parsedPayload = parseJsonWithComments(payloadStr || '{}');
    } catch (err: any) {
      setStatusMessage(`Invalid JSON: ${err.message}`);
      return;
    }
    const currentVars = await resolveVariables();
    const finalPayload = substituteVars(parsedPayload, currentVars);
    try {
      await sendNativeGrpcStreamMessage(activeStreamId, finalPayload);
      addStreamMessage(finalPayload, 'out');
      setStatusMessage('Sent message to stream');
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (err: any) {
      setStatusMessage(`Send failed: ${err.message || err}`);
    }
  }

  async function handleStopStream() {
    await stopStreaming();
    setSending(false);
    setStatusMessage('Stream stopped by user');
    setTimeout(() => setStatusMessage(null), 2500);
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden select-none">
      {/* Breadcrumbs Row + Save Button (Image 1) */}
      <div className="px-4 py-2 flex items-center justify-between text-xs select-none flex-shrink-0">
        <div className="flex items-center gap-1.5 font-mono text-[11px] truncate mr-2">
          {streamType === 'bidi_stream' ? (
            <ArrowLeftRight size={13} className="text-amber-400 flex-shrink-0" />
          ) : streamType === 'omni_stream' ? (
            <ArrowDownUp size={13} className="text-amber-400 flex-shrink-0" />
          ) : (
            <Radio size={13} className="text-secondary flex-shrink-0" />
          )}
          <span className="text-zinc-400">{collection?.name?.toUpperCase() || 'COLLECTION'}</span>
          <span className="text-zinc-600">&gt;</span>
          <span className="text-zinc-400">{shortServiceName || 'Service'}</span>
          <span className="text-zinc-600">&gt;</span>
          <span className="text-white font-semibold">{selectedMethod || endpoint.name}</span>
          {streamType === 'bidi_stream' && (
            <span className="ml-1 px-1.5 py-0.2 rounded bg-amber-950/60 border border-amber-800/50 text-amber-300 text-[10px] font-sans">
              Bidi Stream
            </span>
          )}
          {streamType === 'omni_stream' && (
            <span className="ml-1 px-1.5 py-0.2 rounded bg-amber-950/60 border border-amber-800/50 text-amber-300 text-[10px] font-sans">
              Omni Stream
            </span>
          )}
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

      {/* Combined Address & Service/Method Bar (Image 1) */}
      <div className="px-4 pb-2.5 flex items-center gap-2 flex-shrink-0">
        <div className="flex-1 flex items-center bg-zinc-900 border border-zinc-800 rounded h-9 focus-within:border-primary transition relative">
          {/* Left Segment: TLS Icon + Address Input */}
          <div className="flex-1 flex items-center pl-2 min-w-0">
            <button
              type="button"
              onClick={() => setUseTls(!effectiveTls)}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition mr-1 flex-shrink-0"
              title={effectiveTls ? 'TLS Enabled (Click to disable)' : 'TLS Disabled (Click to enable)'}
            >
              <Shield size={14} className={effectiveTls ? 'text-emerald-400' : 'text-zinc-600'} />
            </button>

            <div className="flex-1 h-full flex items-center min-w-0">
              {inheritedInfo.isInherited ? (
                <div className="flex items-center justify-between w-full h-full pr-1 font-mono text-xs select-none">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 pl-1">
                    <span
                      className="text-zinc-200 truncate select-text"
                      title={`Inherited from reflection folder "${inheritedInfo.folderName}"`}
                    >
                      {effectiveServerAddress || <span className="text-zinc-500 italic">No address set</span>}
                    </span>
                    <span
                      className="px-1.5 py-0.2 rounded bg-amber-950/60 border border-amber-800/50 text-amber-300 text-[10px] font-sans flex-shrink-0"
                      title={`Inherited from reflection folder "${inheritedInfo.folderName}"`}
                    >
                      Inherited
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (inheritedInfo.folderId && endpoint.collection_id) {
                        openReflectionSettingsModal(inheritedInfo.folderId, endpoint.collection_id);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-100 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 transition cursor-pointer flex-shrink-0"
                    title={`Edit gRPC address in ${inheritedInfo.folderName} reflection settings`}
                  >
                    <Settings size={11} className="text-primary" />
                    <span>Edit</span>
                  </button>
                </div>
              ) : (
                <VariableInput
                  value={serverAddress}
                  onChange={(val) => {
                    setServerAddress(val);
                    if (shouldAutoDetectTls(val, activeVariables)) {
                      setUseTls(true);
                    }
                  }}
                  variables={activeVariables}
                  placeholder="localhost:50051 or {{GRPC_ADDR}}"
                  className="w-full h-full text-xs font-mono bg-transparent border-0 focus:outline-none"
                />
              )}
            </div>
          </div>

          {/* Vertical Divider */}
          <div className="h-4 w-px bg-zinc-800 mx-1 flex-shrink-0" />

          {/* Right Segment: Combined Service & Method Selector Trigger */}
          <div className="flex-1 relative min-w-0 pr-1">
            <button
              type="button"
              onClick={() => setIsMethodPickerOpen(!isMethodPickerOpen)}
              className="w-full h-8 flex items-center justify-between px-2 text-xs font-mono text-left hover:bg-zinc-850/60 rounded transition"
            >
              <div className="flex items-center gap-1.5 truncate">
                <ArrowDownUp size={12} className="text-zinc-400 flex-shrink-0" />
                <span className="truncate">
                  {selectedService && selectedMethod ? (
                    <>
                      <span className="text-zinc-400">{shortServiceName}</span>
                      <span className="text-zinc-600 mx-1">/</span>
                      <span className="text-white font-semibold">{selectedMethod}</span>
                    </>
                  ) : (
                    <span className="text-zinc-500">Select a method</span>
                  )}
                </span>
              </div>
              <ChevronDown size={13} className="text-zinc-500 flex-shrink-0 ml-1" />
            </button>

            {/* Floating Dropdown (Image 2 + Search) */}
            {isMethodPickerOpen && (
              <div
                ref={methodPickerRef}
                className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-zinc-950 border border-zinc-800 rounded shadow-xl overflow-hidden text-xs select-none max-h-80 flex flex-col font-mono"
              >
                {/* Search Bar */}
                <div className="p-2 border-b border-zinc-800/80 bg-zinc-900/70 flex items-center gap-2">
                  <Search size={13} className="text-zinc-500 flex-shrink-0" />
                  <input
                    ref={methodSearchInputRef}
                    type="text"
                    value={methodSearchQuery}
                    onChange={(e) => setMethodSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsMethodPickerOpen(false);
                      }
                    }}
                    placeholder="Search service or method..."
                    className="w-full bg-transparent text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none"
                  />
                  {methodSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setMethodSearchQuery('')}
                      className="p-0.5 text-zinc-500 hover:text-zinc-300"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto p-1 flex-1 space-y-2">
                  {discoveredServices.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500 font-sans">
                      {discovering
                        ? 'Discovering services via reflection...'
                        : 'No services found. Click ↻ below to query reflection.'}
                    </div>
                  ) : filteredServices.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500 font-sans">
                      No methods matching "{methodSearchQuery}"
                    </div>
                  ) : (
                    filteredServices.map((svc) => (
                      <div key={svc.name} className="space-y-0.5">
                        <div className="text-[11px] font-semibold text-zinc-400 px-2.5 pt-2 pb-0.5 truncate">
                          {svc.name}
                        </div>
                        {svc.methods.map((m) => {
                          const isSelected = selectedService === svc.name && selectedMethod === m.name;
                          return (
                            <button
                              key={m.name}
                              type="button"
                              onClick={() => {
                                setSelectedService(svc.name);
                                setSelectedMethod(m.name);
                                setIsMethodPickerOpen(false);
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-left transition ${
                                isSelected
                                  ? 'bg-zinc-800 text-white font-semibold'
                                  : 'text-zinc-300 hover:text-white hover:bg-zinc-900'
                              }`}
                            >
                              <ArrowDownUp size={12} className={isSelected ? 'text-primary' : 'text-zinc-500'} />
                              <span className="truncate">{m.name}</span>
                              {m.stream_type === 'bidi_stream' ? (
                                <span className="ml-auto text-[10px] text-amber-400 font-sans px-1 rounded bg-amber-950/60 border border-amber-800/50">
                                  bidi
                                </span>
                              ) : m.stream_type === 'omni_stream' ? (
                                <span className="ml-auto text-[10px] text-amber-400 font-sans px-1 rounded bg-amber-950/60 border border-amber-800/50">
                                  omni
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>

                {/* Footer: Using server reflection. ↻ (Image 2) */}
                <div className="border-t border-zinc-800/80 px-3 py-2 bg-zinc-900/60 flex items-center justify-between text-[11px] text-zinc-400 font-sans">
                  <span>Using server reflection.</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDiscover();
                    }}
                    disabled={discovering}
                    className="p-1 hover:text-white rounded hover:bg-zinc-800 text-zinc-400 transition"
                    title="Refresh server reflection"
                  >
                    <RefreshCw size={12} className={discovering ? 'animate-spin text-primary' : ''} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Invoke Primary Button */}
        <button
          type="button"
          onClick={isStreamingRpc ? (isCurrentEndpointStreaming ? handleStopStream : handleStartStream) : handleSend}
          disabled={sending || (!isCurrentEndpointStreaming && (!selectedService || !selectedMethod))}
          className={`px-4 py-2 text-xs font-semibold rounded transition flex items-center gap-1.5 h-9 flex-shrink-0 cursor-pointer shadow-sm ${
            isStreamingRpc && isCurrentEndpointStreaming
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-primary hover:bg-primary-hover active:bg-blue-700 disabled:opacity-50 text-white'
          }`}
          title="Invoke method (Ctrl+Enter)"
        >
          <span>
            {sending ? 'Calling...' : isStreamingRpc ? (isCurrentEndpointStreaming ? 'Stop' : 'Stream') : 'Invoke'}
          </span>
        </button>

        {/* Send message on Bidirectional Stream */}
        {streamType === 'bidi_stream' && (
          <button
            type="button"
            onClick={handleSendStreamMessage}
            disabled={!isCurrentEndpointStreaming}
            className="px-3.5 py-2 text-xs font-semibold rounded transition flex items-center gap-1.5 h-9 flex-shrink-0 cursor-pointer shadow-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white"
            title={isCurrentEndpointStreaming ? "Send message to stream (Ctrl+Enter)" : "Start stream first to send messages"}
          >
            <Send size={12} />
            <span>Send</span>
          </button>
        )}
      </div>

      {/* Tabs Bar */}
      <div className="px-4 border-b border-zinc-800 flex items-center justify-between text-xs select-none bg-zinc-950 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('payload')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'payload'
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Message</span>
          </button>

          <button
            onClick={() => setActiveTab('metadata')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'metadata'
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Metadata</span>
            {metadata.filter(([k]) => k.trim()).length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-900 text-zinc-400 rounded border border-zinc-800">
                {metadata.filter(([k]) => k.trim()).length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('authorization')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'authorization'
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Authorization</span>
            {auth.auth_type !== 'inherit' && auth.auth_type !== 'none' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
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

          <button
            onClick={() => setActiveTab('options')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'options'
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Options</span>
          </button>

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
        </div>

        {/* Sub-toolbar inside Message tab */}
        {activeTab === 'payload' && (
          <div className="flex items-center gap-2 py-1">
            <button
              type="button"
              onClick={handleGenerateSamplePayload}
              disabled={generatingPayload || !selectedService || !selectedMethod}
              title="Generate example JSON payload with types & enums from reflection"
              className="px-2 py-1 text-[11px] text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded transition flex items-center gap-1 shadow-sm disabled:opacity-50"
            >
              <Wand2 size={11} className={generatingPayload ? 'animate-spin text-zinc-300' : 'text-zinc-400'} />
              <span>{generatingPayload ? 'Generating...' : 'Generate Example'}</span>
            </button>
            <div className="h-3 w-px bg-zinc-800 mx-0.5" />
            <button
              type="button"
              onClick={() => {
                try {
                  const parsed = parseJsonWithComments(payloadStr || '{}');
                  setPayloadStr(JSON.stringify(parsed, null, 2));
                } catch {}
              }}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-900 transition"
            >
              Beautify
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  const parsed = parseJsonWithComments(payloadStr || '{}');
                  setPayloadStr(JSON.stringify(parsed));
                } catch {}
              }}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-900 transition"
            >
              Minify
            </button>
          </div>
        )}
      </div>

      {/* Panels */}
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {activeTab === 'payload' && (
          <div className="h-full flex flex-col space-y-2">
            <div className="flex-1 min-h-[160px]">
              <JsonEditor
                value={payloadStr}
                onChange={setPayloadStr}
                variables={activeVariables}
                suggestions={schemaFieldNames}
                placeholder="{\n  \n}"
              />
            </div>
          </div>
        )}

        {activeTab === 'metadata' && (
          <KeyValueTable
            title="gRPC Request Metadata"
            items={metadata}
            onChange={setMetadata}
            variables={activeVariables}
            keyPlaceholder="x-metadata-key"
            valuePlaceholder="metadata-value (or {{TOKEN}})"
            addLabel="Add Metadata"
          />
        )}

        {/* Auth Panel */}
        {activeTab === 'authorization' && (
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-zinc-400 mb-1">Authentication Type</label>
              <Select
                value={auth.auth_type}
                onChange={(val) => setAuth({ ...auth, auth_type: val as any })}
                options={[
                  { value: 'inherit', label: 'Inherit auth from collection' },
                  { value: 'none', label: 'No Auth' },
                  { value: 'bearer', label: 'Bearer Token' },
                  { value: 'custom', label: 'Custom Header' },
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
                          ? `(Token: ${collection.settings.auth.token.slice(0, 15)}...)`
                          : ''
                      }`
                    : 'No authorization configured on this collection yet. Configure in Collection Settings.'}
                </div>
              </div>
            )}

            {auth.auth_type === 'bearer' && (
              <div className="space-y-1.5">
                <label className="block text-zinc-400 font-medium">Bearer Token</label>
                <div className="bg-zinc-950 border border-zinc-800 rounded focus-within:border-primary h-8">
                  <VariableInput
                    value={auth.token || ''}
                    onChange={(newVal) => setAuth({ ...auth, token: newVal })}
                    variables={activeVariables}
                    placeholder="{{TOKEN}} or eyJhbGciOi..."
                    className="w-full h-full text-xs font-mono"
                  />
                </div>
                <p className="text-[10px] text-zinc-500 font-mono">
                  Injected into gRPC metadata <code className="text-zinc-400">authorization</code>.
                </p>
              </div>
            )}

            {auth.auth_type === 'custom' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Header Name</label>
                  <input
                    type="text"
                    value={auth.header_name || ''}
                    onChange={(e) => setAuth({ ...auth, header_name: e.target.value })}
                    placeholder="x-api-key"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Header Value</label>
                  <div className="bg-zinc-950 border border-zinc-800 rounded focus-within:border-primary h-8">
                    <VariableInput
                      value={auth.header_value || ''}
                      onChange={(newVal) => setAuth({ ...auth, header_value: newVal })}
                      variables={activeVariables}
                      placeholder="key_value or {{API_KEY}}"
                      className="w-full h-full text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scripts Panel (Before & After Hooks for gRPC) */}
        {activeTab === 'scripts' && (
          <ScriptEditorPane
            protocol="grpc"
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

        {activeTab === 'options' && (
          <div className="space-y-4 max-w-2xl text-xs">
            {/* Group 1: Connection & Security */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-md p-4 space-y-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Connection & Security
              </h4>
              <div className="space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useTls}
                    onChange={(e) => setUseTls(e.target.checked)}
                    className="mt-0.5 rounded bg-zinc-950 border-zinc-700 text-primary focus:ring-0"
                  />
                  <div>
                    <span className="text-zinc-200 font-medium block">
                      Enable TLS / SSL Encryption
                    </span>
                    <span className="text-zinc-500 text-[11px]">
                      Encrypt communication channel using Transport Layer Security.
                    </span>
                  </div>
                </label>

                <div>
                  <label className="block text-zinc-400 font-medium mb-1">
                    Authority / Host Header Override
                  </label>
                  <input
                    type="text"
                    value={authorityOverride}
                    onChange={(e) => setAuthorityOverride(e.target.value)}
                    placeholder="e.g. auth-service.internal or custom :authority"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                  />
                  <span className="text-[10px] text-zinc-500 block mt-1">
                    Overrides the pseudo <code>:authority</code> header for routing behind reverse proxies or Envoy ingresses.
                  </span>
                </div>
              </div>
            </div>

            {/* Group 2: Deadlines & Message Limits */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-md p-4 space-y-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Deadlines & Message Framing
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">
                    Call Timeout (seconds)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="600"
                    value={timeoutSeconds}
                    onChange={(e) => setTimeoutSeconds(e.target.value)}
                    placeholder="30"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                  />
                  <span className="text-[10px] text-zinc-500 block mt-1">
                    Cancel RPC execution if no response received before deadline.
                  </span>
                </div>

                <div>
                  <label className="block text-zinc-400 font-medium mb-1">
                    Max Message Limit (MB)
                  </label>
                  <Select
                    value={maxMsgSizeMb}
                    onChange={setMaxMsgSizeMb}
                    options={[
                      { value: '4', label: '4 MB (Standard default)' },
                      { value: '16', label: '16 MB (Medium payloads)' },
                      { value: '64', label: '64 MB (Large streaming batches)' },
                      { value: '256', label: '256 MB (Very large)' },
                    ]}
                    fontMono
                  />
                  <span className="text-[10px] text-zinc-500 block mt-1">
                    Maximum incoming protobuf byte frame threshold.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'specification' && (
          <div className="h-full flex flex-col space-y-3 overflow-y-auto pr-1">
            {currentMethodObj ? (
              <>
                {/* Method Overview Pill */}
                <div className="p-2.5 bg-zinc-900/60 border border-zinc-800 rounded-md flex items-center justify-between text-xs select-none">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-secondary font-semibold">rpc</span>
                    <span className="text-white font-bold">{currentMethodObj.name}</span>
                    <span className="text-zinc-500">(</span>
                    <span className="text-amber-300 font-medium">{currentMethodObj.input_type || 'Empty'}</span>
                    <span className="text-zinc-500">)</span>
                    <span className="text-secondary font-semibold">returns</span>
                    <span className="text-zinc-500">(</span>
                    <span className="text-emerald-300 font-medium">{currentMethodObj.output_type || 'Empty'}</span>
                    <span className="text-zinc-500">);</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const sig = formatRpcSignature(
                        currentMethodObj.name,
                        currentMethodObj.input_type,
                        currentMethodObj.output_type
                      );
                      navigator.clipboard.writeText(sig);
                      setCopiedSpec('signature');
                      setTimeout(() => setCopiedSpec(null), 2000);
                    }}
                    className="text-[11px] text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2 py-0.5 rounded flex items-center gap-1 transition"
                    title="Copy RPC signature"
                  >
                    {copiedSpec === 'signature' ? (
                      <>
                        <Check size={11} className="text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={11} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 2 Clean Cards: Request & Response Structs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0">
                  {/* Card 1: Request Type */}
                  <div className="flex flex-col bg-zinc-900/40 border border-zinc-800 rounded-md p-3 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="font-semibold text-zinc-200 text-xs">Request Message Struct</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (currentMethodObj.input_type) {
                            navigator.clipboard.writeText(currentMethodObj.input_type);
                            setCopiedSpec('input');
                            setTimeout(() => setCopiedSpec(null), 2000);
                          }
                        }}
                        className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-mono transition"
                      >
                        {copiedSpec === 'input' ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                        <span>Copy Type</span>
                      </button>
                    </div>

                    <div className="space-y-1 font-mono text-xs">
                      <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                        <span>Type:</span>
                        <code className="text-amber-300 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 text-[10px]">
                          {currentMethodObj.input_type || 'Unknown'}
                        </code>
                      </div>
                      <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                        <span>Streaming:</span>
                        <span className="text-zinc-300">
                          {currentMethodObj.is_client_streaming ? 'Client Streaming' : 'Unary'}
                        </span>
                      </div>
                    </div>

                    {/* Toggle button: Show/Hide schema preview */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowReqSchemaPreview(!showReqSchemaPreview)}
                        className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded px-2.5 py-1 transition flex items-center gap-1.5"
                      >
                        {showReqSchemaPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                        <span>{showReqSchemaPreview ? 'Hide schema preview' : 'Show schema preview'}</span>
                      </button>

                      {showReqSchemaPreview && (
                        <div className="mt-2 bg-zinc-950 border border-zinc-850 rounded p-2.5 font-mono text-[11px] text-zinc-300 max-h-52 overflow-auto">
                          {sampleSpecLoading ? (
                            <span className="text-zinc-500 italic">Loading reflected structure...</span>
                          ) : specSamplePayload ? (
                            <pre className="whitespace-pre">
                              {JSON.stringify(specSamplePayload, null, 2)}
                            </pre>
                          ) : payloadStr && payloadStr.trim() !== '{}' ? (
                            <pre className="whitespace-pre">{payloadStr}</pre>
                          ) : (
                            <span className="text-zinc-500 italic">No schema structure available.</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card 2: Response Type */}
                  <div className="flex flex-col bg-zinc-900/40 border border-zinc-800 rounded-md p-3 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="font-semibold text-zinc-200 text-xs">Response Message Struct</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (currentMethodObj.output_type) {
                            navigator.clipboard.writeText(currentMethodObj.output_type);
                            setCopiedSpec('output');
                            setTimeout(() => setCopiedSpec(null), 2000);
                          }
                        }}
                        className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-mono transition"
                      >
                        {copiedSpec === 'output' ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                        <span>Copy Type</span>
                      </button>
                    </div>

                    <div className="space-y-1 font-mono text-xs">
                      <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                        <span>Type:</span>
                        <code className="text-emerald-300 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 text-[10px]">
                          {currentMethodObj.output_type || 'Unknown'}
                        </code>
                      </div>
                      <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                        <span>Streaming:</span>
                        <span className="text-zinc-300">
                          {currentMethodObj.is_server_streaming ? 'Server Streaming' : 'Unary'}
                        </span>
                      </div>
                    </div>

                    {/* Toggle button: Show/Hide schema preview */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowResSchemaPreview(!showResSchemaPreview)}
                        className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded px-2.5 py-1 transition flex items-center gap-1.5"
                      >
                        {showResSchemaPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                        <span>{showResSchemaPreview ? 'Hide schema preview' : 'Show schema preview'}</span>
                      </button>

                      {showResSchemaPreview && (
                        <div className="mt-2 bg-zinc-950 border border-zinc-850 rounded p-2.5 font-mono text-[11px] text-zinc-300 max-h-52 overflow-auto">
                          {lastGrpcResponse && lastGrpcResponse.body ? (
                            <pre className="whitespace-pre">
                              {typeof lastGrpcResponse.body === 'string'
                                ? lastGrpcResponse.body
                                : JSON.stringify(lastGrpcResponse.body, null, 2)}
                            </pre>
                          ) : (
                            <span className="text-zinc-500 italic">
                              Invoke method to view live decoded response payload.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500">
                <BookOpen size={28} className="text-zinc-600 mb-2" />
                <span className="text-xs font-semibold text-zinc-300">No Method Specification</span>
                <span className="text-[11px] text-zinc-500 mt-0.5">
                  Select a gRPC service and method above to view its protobuf type definitions.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
