import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import {
  executeNativeGrpc,
  executeNativeGrpcStream,
  discoverNativeGrpcServices,
  generateNativeGrpcSamplePayload,
} from '../../api/native';
import type {
  Endpoint,
  GrpcExecutionRequest,
  GrpcServiceSummary,
  VariableResponse,
  Collection,
} from '@api-lab/api-types';
import {
  Send,
  Save,
  RefreshCw,
  Plus,
  Trash2,
  Wand2,
  Code,
  CheckCircle,
  XCircle,
  Terminal,
  Play,
  Square,
  BookOpen,
  Copy,
  Check,
} from 'lucide-react';
import { JsonEditor } from '../common/JsonEditor';
import { VariableInput } from '../common/VariableInput';
import { JavaScriptEditor } from '../common/JavaScriptEditor';
import { runBeforeHook, runAfterHook, type HookTestResult } from '../../utils/hookRunner';
import { applyInheritedGrpcAuth } from '../../utils/authInheritance';
import { syncEnvironmentVariables } from '../../utils/envSync';
import { shouldAutoDetectTls } from '../../utils/grpcReflectionGenerator';
import { formatRpcSignature, formatMethodStreamingLabel } from '../../utils/grpcSpecification';
import { getEffectiveEndpointConfig } from '../../utils/tabManager';

export const GrpcRequestEditor: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const queryClient = useQueryClient();
  const {
    activeEnvironmentId,
    lastGrpcResponse,
    setLastGrpcResponse,
    isStreaming,
    streamingEndpointId,
    setIsStreaming,
    addStreamMessage,
    clearStreamMessages,
    stopStreaming,
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

  const [serverAddress, setServerAddress] = useState(
    initialConfig.server_address || 'localhost:50051'
  );
  const [useTls, setUseTls] = useState<boolean>(() => {
    if (initialConfig.use_tls !== undefined) return Boolean(initialConfig.use_tls);
    return shouldAutoDetectTls(initialConfig.server_address || 'localhost:50051');
  });
  const [selectedService, setSelectedService] = useState(initialConfig.service || '');
  const [selectedMethod, setSelectedMethod] = useState(initialConfig.method || '');

  const effectiveTls = useTls || shouldAutoDetectTls(serverAddress);

  // Auto-discover & cache reflection per server address (Fix for Bug 1)
  const {
    data: cachedServices = [],
    isFetching: discovering,
    refetch: refetchReflection,
  } = useQuery<GrpcServiceSummary[]>({
    queryKey: ['reflection', serverAddress, effectiveTls],
    queryFn: async () => {
      if (!serverAddress.trim()) return [];
      const activeVars = await resolveVariables();
      const res = await discoverNativeGrpcServices(
        { server_address: serverAddress, use_tls: effectiveTls },
        activeVars
      );
      if (res.error) {
        return [];
      }
      return res.services || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!serverAddress.trim(),
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

  const [activeVariables, setActiveVariables] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'payload' | 'metadata' | 'scripts' | 'options' | 'specification'>('payload');
  const [copiedSpec, setCopiedSpec] = useState<'signature' | 'input' | 'output' | 'sample' | null>(null);
  const [sampleSpecLoading, setSampleSpecLoading] = useState(false);
  const [specSamplePayload, setSpecSamplePayload] = useState<any>(null);
  const [generatingPayload, setGeneratingPayload] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Fetch parent collection for inherited settings
  const { data: collection } = useQuery<Collection>({
    queryKey: ['collection', endpoint.collection_id],
    queryFn: () => apiRequest<Collection>(`/collections/${endpoint.collection_id}`),
    enabled: !!endpoint.collection_id,
  });

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
          : shouldAutoDetectTls(cfg.server_address || 'localhost:50051')
      );
      setSelectedService(cfg.service || '');
      setSelectedMethod(cfg.method || '');
      setMetadata(Object.entries(cfg.metadata || {}));
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

  // Generate example script for Before or After hook (New Feature 1)
  function handleGenerateScript() {
    if (hookScriptTab === 'pre') {
      const samplePre = `// Pre-request Script Example
pm.environment.set("REQUEST_TIME", Date.now());
pm.request.metadata['x-client-timestamp'] = String(Date.now());
console.log("Calling gRPC:", pm.request.service + "/" + pm.request.method);`;
      setPreRequestScript((prev) => (prev ? prev + '\n\n' + samplePre : samplePre));
      setStatusMessage('Generated example Pre-request script');
    } else {
      const samplePost = `// Post-response Script Example
pm.test("Status is OK (0)", function () {
  pm.expect(pm.response.code).to.equal(0);
});

const body = pm.response.json();
console.log("gRPC Response body:", body);
if (body && body.details && body.details.token) {
  pm.environment.set("GRPC_TOKEN", body.details.token);
  console.log("Saved token to environment:", body.details.token);
}`;
      setPostResponseScript((prev) => (prev ? prev + '\n\n' + samplePost : samplePost));
      setStatusMessage('Generated example Post-response script');
    }
    setTimeout(() => setStatusMessage(null), 2500);
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
          server_address: serverAddress,
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
              server_address: serverAddress,
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
  }, [activeTab, selectedService, selectedMethod, serverAddress, effectiveTls, specSamplePayload]);

  const streamType =
    currentMethodObj?.stream_type ||
    endpoint.config?.stream_type ||
    (currentMethodObj?.is_server_streaming || currentMethodObj?.is_client_streaming
      ? 'omni_stream'
      : 'unary');

  const isStreamingRpc = streamType !== 'unary';
  const isCurrentEndpointStreaming = isStreaming && streamingEndpointId === endpoint.id;

  function buildConfig() {
    const metaMap: Record<string, string> = {};
    for (const [k, v] of metadata) {
      if (k.trim()) metaMap[k.trim()] = v;
    }

    let payloadJson = {};
    try {
      payloadJson = JSON.parse(payloadStr || '{}');
    } catch {
      // ignore
    }

    return {
      server_address: serverAddress,
      service: selectedService,
      method: selectedMethod,
      use_tls: effectiveTls,
      stream_type: streamType,
      metadata: metaMap,
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
      parsedPayload = JSON.parse(payloadStr || '{}');
    } catch {
      parsedPayload = payloadStr;
    }
    const metaMap: Record<string, string> = {};
    for (const [k, v] of metadata) {
      if (k.trim()) metaMap[k.trim()] = v;
    }
    const cfg = {
      server_address: serverAddress,
      use_tls: useTls,
      service: selectedService,
      method: selectedMethod,
      stream_type: streamType,
      metadata: metaMap,
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
    metadata,
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
          if (!isCurrentEndpointStreaming) handleStartStream();
          else handleStopStream();
        } else {
          handleSend();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentVersion, isStreamingRpc, isCurrentEndpointStreaming, selectedService, selectedMethod, preRequestScript, postResponseScript, payloadStr, serverAddress, useTls, metadata]);

  // Execute unary gRPC
  async function handleSend() {
    saveChanges({ silent: true });
    setSending(true);
    setStatusMessage(null);

    const metaMap: Record<string, string> = {};
    for (const [k, v] of metadata) {
      if (k.trim()) metaMap[k.trim()] = v;
    }

    let parsedPayload: any = {};
    try {
      parsedPayload = JSON.parse(payloadStr || '{}');
    } catch (err: any) {
      setLastGrpcResponse({
        status_code: 3,
        status_message: 'Invalid JSON',
        response_time_ms: 0,
        response_size_bytes: 0,
        metadata: {},
        body: null,
        error: `Payload is not valid JSON: ${err.message}`,
      });
      setSending(false);
      return;
    }

    const execReq: GrpcExecutionRequest = {
      server_address: serverAddress,
      service: selectedService,
      method: selectedMethod,
      metadata: metaMap,
      payload: parsedPayload,
      use_tls: effectiveTls,
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

      const finalReq = applyInheritedGrpcAuth(
        beforeResult.request,
        currentColl?.settings,
        beforeResult.variables
      );

      // 3. Execute gRPC Request
      const resp = await executeNativeGrpc(finalReq, beforeResult.variables);
      setLastGrpcResponse(resp);

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
      });
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

    let parsedPayload: any = {};
    try {
      parsedPayload = JSON.parse(payloadStr || '{}');
    } catch (err: any) {
      setLastGrpcResponse({
        status_code: 3,
        status_message: 'Invalid JSON',
        response_time_ms: 0,
        response_size_bytes: 0,
        metadata: {},
        body: null,
        error: `Payload is not valid JSON: ${err.message}`,
      });
      setSending(false);
      return;
    }

    const execReq: GrpcExecutionRequest = {
      server_address: serverAddress,
      service: selectedService,
      method: selectedMethod,
      metadata: metaMap,
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

      const finalReq = applyInheritedGrpcAuth(
        beforeResult.request,
        currentColl?.settings,
        beforeResult.variables
      );

      const resp = await executeNativeGrpcStream(
        finalReq,
        beforeResult.variables,
        streamId,
        (msg) => {
          addStreamMessage(msg, 'in');
        }
      );
      setLastGrpcResponse(resp);

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
      });
    } finally {
      setIsStreaming(false, null, null);
      setSending(false);
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
      {/* Request Configuration Section */}
      <div className="px-4 py-2.5 bg-zinc-950 border-b border-zinc-800/80 flex flex-col gap-2.5 flex-shrink-0">
        {/* Host Address & Action Bar */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500 font-mono text-xs">
              grpc://
            </div>
            <div className="pl-14 w-full h-8 bg-zinc-900 border border-zinc-800 rounded-md focus-within:border-zinc-700 transition flex items-center">
              <VariableInput
                value={serverAddress}
                onChange={(val) => {
                  setServerAddress(val);
                  if (shouldAutoDetectTls(val)) {
                    setUseTls(true);
                  }
                }}
                variables={activeVariables}
                placeholder="localhost:50051 or {{GRPC_ADDR}}"
                className="w-full h-full text-xs font-mono"
              />
            </div>
          </div>

          {/* Reflection Button */}
          <button
            onClick={handleDiscover}
            disabled={discovering}
            title="Discover services via gRPC server reflection"
            className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-850 hover:text-white border border-zinc-800 rounded-md transition flex items-center gap-1.5 shadow-sm h-8 disabled:opacity-50"
          >
            <RefreshCw size={12} className={discovering ? 'animate-spin text-indigo-400' : 'text-zinc-400'} />
            <span>{discovering ? 'Querying...' : 'Reflection'}</span>
          </button>

          {/* Invoke Primary Button */}
          {isStreamingRpc ? (
            isCurrentEndpointStreaming ? (
              <button
                onClick={handleStopStream}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-md text-xs flex items-center gap-1.5 shadow-sm transition h-8"
                title="Stop Stream (Ctrl+Enter)"
              >
                <Square size={12} fill="currentColor" />
                <span>Stop Stream</span>
                <kbd className="text-[10px] font-mono px-1 py-0.5 rounded bg-red-800/80 text-red-200 border border-red-700 ml-0.5 select-none">
                  Ctrl+↵
                </kbd>
              </button>
            ) : (
              <button
                onClick={handleStartStream}
                disabled={sending || !selectedService || !selectedMethod}
                className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium rounded-md text-xs flex items-center gap-1.5 shadow-sm transition h-8"
                title="Start stream (Ctrl+Enter)"
              >
                <Play size={12} fill="currentColor" />
                <span>Start Stream</span>
                <kbd className="text-[10px] font-mono px-1 py-0.5 rounded bg-cyan-800/80 text-cyan-200 border border-cyan-700 ml-0.5 select-none">
                  Ctrl+↵
                </kbd>
              </button>
            )
          ) : (
            <button
              onClick={handleSend}
              disabled={sending || !selectedService || !selectedMethod}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 border border-indigo-400/50 rounded-md transition flex items-center gap-1.5 shadow-sm shadow-indigo-950/50 h-8"
              title="Invoke method (Ctrl+Enter)"
            >
              <Send size={12} />
              <span>{sending ? 'Calling...' : 'Invoke'}</span>
              <kbd className="text-[10px] font-mono text-indigo-200 bg-indigo-950/70 border border-indigo-500/40 px-1 py-0.2 rounded font-normal ml-0.5 select-none">
                Ctrl+↵
              </kbd>
            </button>
          )}

          {/* Save Button */}
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

        {/* Service and Method Selectors (2-Column Grid, NO intermediate border) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">Service</label>
            <div className="relative">
              <select
                value={selectedService}
                onChange={(e) => {
                  setSelectedService(e.target.value);
                  setSpecSamplePayload(null);
                  const svc = discoveredServices.find((s) => s.name === e.target.value);
                  if (svc && svc.methods.length > 0) {
                    setSelectedMethod(svc.methods[0].name);
                  }
                }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md py-1.5 px-3 text-xs font-mono text-zinc-200 focus:border-zinc-700 focus:ring-0 cursor-pointer h-8"
              >
                {selectedService && !discoveredServices.some((s) => s.name === selectedService) && (
                  <option value={selectedService}>{selectedService}</option>
                )}
                {discoveredServices.length === 0 && !selectedService && (
                  <option value="">{discovering ? 'Discovering services...' : 'Click Reflection to discover'}</option>
                )}
                {discoveredServices.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">Method</label>
            <div className="relative">
              <select
                value={selectedMethod}
                onChange={(e) => {
                  setSelectedMethod(e.target.value);
                  setSpecSamplePayload(null);
                }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md py-1.5 px-3 text-xs font-mono text-zinc-200 focus:border-zinc-700 focus:ring-0 cursor-pointer h-8"
              >
                {selectedMethod && !availableMethods.some((m) => m.name === selectedMethod) && (
                  <option value={selectedMethod}>{selectedMethod}</option>
                )}
                {availableMethods.length === 0 && !selectedMethod && (
                  <option value="">{selectedService ? 'No methods found' : 'Select service first'}</option>
                )}
                {availableMethods.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.stream_type === 'bidi_stream' ? 'bidi stream' : m.stream_type === 'omni_stream' ? 'stream' : 'unary'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {statusMessage && (
          <div className="text-[11px] font-mono text-indigo-300 bg-zinc-900/80 px-2.5 py-0.5 rounded border border-zinc-800 self-start select-text">
            {statusMessage}
          </div>
        )}
      </div>

      {/* Tabs Bar */}
      <div className="px-4 border-b border-zinc-800/80 flex items-center justify-between text-xs select-none bg-zinc-950 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('payload')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'payload'
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Message</span>
          </button>

          <button
            onClick={() => setActiveTab('metadata')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'metadata'
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Metadata</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-900 text-zinc-400 rounded border border-zinc-800">
              {metadata.length}
            </span>
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

          <button
            onClick={() => setActiveTab('options')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'options'
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Options</span>
          </button>

          <button
            onClick={() => setActiveTab('specification')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'specification'
                ? 'border-indigo-400 text-indigo-200'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BookOpen size={12} className="text-indigo-400" />
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
              <Wand2 size={11} className={generatingPayload ? 'animate-spin text-indigo-400' : 'text-zinc-400'} />
              <span>{generatingPayload ? 'Generating...' : 'Generate Example'}</span>
            </button>
            <div className="h-3 w-px bg-zinc-800 mx-0.5" />
            <button
              type="button"
              onClick={() => {
                try {
                  const parsed = JSON.parse(payloadStr || '{}');
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
                  const parsed = JSON.parse(payloadStr || '{}');
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
                placeholder="{\n  \n}"
              />
            </div>
          </div>
        )}

        {activeTab === 'metadata' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-zinc-400 pb-1">
              <span>gRPC Request Metadata</span>
              <button
                onClick={() => setMetadata([...metadata, ['', '']])}
                className="text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                <Plus size={12} /> Add Key
              </button>
            </div>
            {metadata.map(([key, val], idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => {
                    const next = [...metadata];
                    next[idx][0] = e.target.value;
                    setMetadata(next);
                  }}
                  placeholder="Key"
                  className="w-1/3 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-purple-500 h-7"
                />
                <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded focus-within:border-purple-500 h-7">
                  <VariableInput
                    value={val}
                    onChange={(newVal) => {
                      const next = [...metadata];
                      next[idx][1] = newVal;
                      setMetadata(next);
                    }}
                    variables={activeVariables}
                    placeholder="Value (or {{VAR}})"
                    className="w-full h-full"
                  />
                </div>
                <button
                  onClick={() => setMetadata(metadata.filter((_, i) => i !== idx))}
                  className="text-zinc-500 hover:text-red-400 p-1"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Scripts Panel (Before & After Hooks for gRPC) */}
        {activeTab === 'scripts' && (
          <div className="space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHookScriptTab('pre')}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${
                    hookScriptTab === 'pre'
                      ? 'bg-purple-900/60 text-purple-300 border border-purple-700/60'
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
                      ? 'bg-purple-900/60 text-purple-300 border border-purple-700/60'
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
                      Runs before invoking gRPC. Use <code className="text-purple-300 font-mono">pm.environment.set(key, val)</code> or mutate <code className="text-purple-300 font-mono">pm.request.payload</code> or <code className="text-purple-300 font-mono">pm.request.metadata</code>.
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateScript}
                      className="text-[11px] text-purple-300 hover:text-white px-2 py-0.5 bg-purple-950/70 border border-purple-800/60 rounded flex items-center gap-1 font-medium transition flex-shrink-0"
                    >
                      <Wand2 size={11} />
                      <span>Generate Example</span>
                    </button>
                  </div>
                  <div className="flex-1 min-h-[160px]">
                    <JavaScriptEditor
                      value={preRequestScript}
                      onChange={setPreRequestScript}
                      placeholder={`// Example gRPC Pre-request Script:\npm.environment.set("REQ_ID", "req_" + Date.now());\npm.request.metadata['x-request-id'] = pm.variables.get('REQ_ID');\nconsole.log('Invoking gRPC method...');`}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400">
                      Runs after gRPC response arrives. Use <code className="text-purple-300 font-mono">pm.test(...)</code> and <code className="text-purple-300 font-mono">pm.response.json()</code>.
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateScript}
                      className="text-[11px] text-purple-300 hover:text-white px-2 py-0.5 bg-purple-950/70 border border-purple-800/60 rounded flex items-center gap-1 font-medium transition flex-shrink-0"
                    >
                      <Wand2 size={11} />
                      <span>Generate Example</span>
                    </button>
                  </div>
                  <div className="flex-1 min-h-[160px]">
                    <JavaScriptEditor
                      value={postResponseScript}
                      onChange={setPostResponseScript}
                      placeholder={`// Example gRPC Post-response Script:\npm.test("Status code is 0 (OK)", () => {\n  pm.expect(pm.response.code).to.equal(0);\n});\n\nconst body = pm.response.json();\nif (body && body.details && body.details.token) {\n  pm.environment.set("GRPC_TOKEN", body.details.token);\n}`}
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

        {activeTab === 'options' && (
          <div className="space-y-3 max-w-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useTls}
                onChange={(e) => setUseTls(e.target.checked)}
                className="rounded bg-zinc-900 border-zinc-700"
              />
              <span>Enable TLS (Transport Layer Security)</span>
            </label>
          </div>
        )}

        {activeTab === 'specification' && (
          <div className="h-full flex flex-col space-y-3 overflow-y-auto pr-1">
            {currentMethodObj ? (
              <>
                {/* Method Overview Banner */}
                <div className="p-3 bg-zinc-900/70 border border-zinc-800/80 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase font-semibold bg-indigo-950/70 text-indigo-300 border border-indigo-800/50">
                        {formatMethodStreamingLabel(
                          streamType,
                          currentMethodObj.is_client_streaming,
                          currentMethodObj.is_server_streaming
                        )}
                      </span>
                      <span className="font-mono text-xs text-zinc-300 font-medium">
                        {selectedService} / <span className="text-white font-semibold">{selectedMethod}</span>
                      </span>
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
                      className="text-[11px] text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2 py-1 rounded flex items-center gap-1 transition"
                      title="Copy full RPC signature"
                    >
                      {copiedSpec === 'signature' ? (
                        <>
                          <Check size={11} className="text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy Signature</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Proto Signature Code Box */}
                  <div className="p-2.5 bg-zinc-950 border border-zinc-850 rounded font-mono text-xs text-zinc-300 flex items-center justify-between overflow-x-auto">
                    <code>
                      <span className="text-indigo-400 font-semibold">rpc</span>{' '}
                      <span className="text-zinc-100 font-bold">{currentMethodObj.name}</span> (
                      <span className="text-amber-300">{currentMethodObj.input_type || 'Unknown'}</span>)
                      {' '}<span className="text-indigo-400 font-semibold">returns</span> (
                      <span className="text-emerald-300">{currentMethodObj.output_type || 'Unknown'}</span>);
                    </code>
                  </div>
                </div>

                {/* Two Struct Cards Grid: Request Message Struct & Response Message Struct */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0">
                  {/* Card 1: Request Message Struct */}
                  <div className="flex flex-col bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 space-y-2 min-h-[220px]">
                    <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
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
                        title="Copy input struct name"
                      >
                        {copiedSpec === 'input' ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                        <span>Copy Type</span>
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] text-zinc-400">
                        Type Definition:{' '}
                        <code className="text-amber-300 font-mono bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 text-[10px]">
                          {currentMethodObj.input_type || 'Unknown'}
                        </code>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        Client Streaming: {currentMethodObj.is_client_streaming ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>

                    {/* Reflected Request Struct / Sample JSON Preview */}
                    <div className="flex-1 flex flex-col min-h-0 pt-1">
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                        <span>Reflected Schema Preview:</span>
                        {specSamplePayload && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(specSamplePayload, null, 2));
                              setCopiedSpec('sample');
                              setTimeout(() => setCopiedSpec(null), 2000);
                            }}
                            className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                          >
                            {copiedSpec === 'sample' ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
                            <span>Copy JSON</span>
                          </button>
                        )}
                      </div>

                      <div className="flex-1 bg-zinc-950 border border-zinc-850 rounded p-2 overflow-auto font-mono text-[11px] text-zinc-300 leading-relaxed max-h-48">
                        {sampleSpecLoading ? (
                          <div className="text-zinc-500 italic py-4 text-center">Loading reflected structure...</div>
                        ) : specSamplePayload ? (
                          <pre className="whitespace-pre">
                            {JSON.stringify(specSamplePayload, null, 2)}
                          </pre>
                        ) : payloadStr && payloadStr.trim() !== '{}' ? (
                          <pre className="whitespace-pre">{payloadStr}</pre>
                        ) : (
                          <div className="text-zinc-500 italic py-4 text-center">
                            Click 'Generate Example' on Message tab or invoke reflection to preview full message struct fields.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Response Message Struct */}
                  <div className="flex flex-col bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 space-y-2 min-h-[220px]">
                    <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
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
                        title="Copy response struct name"
                      >
                        {copiedSpec === 'output' ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                        <span>Copy Type</span>
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] text-zinc-400">
                        Type Definition:{' '}
                        <code className="text-emerald-300 font-mono bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 text-[10px]">
                          {currentMethodObj.output_type || 'Unknown'}
                        </code>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        Server Streaming: {currentMethodObj.is_server_streaming ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>

                    {/* Response Struct Details / Last Executed Schema Preview */}
                    <div className="flex-1 flex flex-col min-h-0 pt-1">
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                        <span>Expected Response Contract:</span>
                      </div>

                      <div className="flex-1 bg-zinc-950 border border-zinc-850 rounded p-2.5 overflow-auto font-mono text-[11px] text-zinc-300 leading-relaxed max-h-48">
                        {lastGrpcResponse && lastGrpcResponse.body ? (
                          <div className="space-y-1.5">
                            <div className="text-[10px] text-emerald-400/90 font-sans font-medium flex items-center gap-1">
                              <Check size={10} /> Runtime Verified Struct:
                            </div>
                            <pre className="whitespace-pre text-zinc-300">
                              {typeof lastGrpcResponse.body === 'string'
                                ? lastGrpcResponse.body
                                : JSON.stringify(lastGrpcResponse.body, null, 2)}
                            </pre>
                          </div>
                        ) : (
                          <div className="space-y-2 text-zinc-400 font-sans text-xs">
                            <p>
                              The gRPC server will serialize and return protobuf message instances of type{' '}
                              <code className="text-emerald-300 font-mono text-[10px]">
                                {currentMethodObj.output_type}
                              </code>.
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              Execute an <strong className="text-zinc-300">Invoke</strong> call to inspect live decoded fields, status trailers, and stream frames in the Response section below.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/40 border border-zinc-800/80 rounded-lg text-center">
                <BookOpen size={32} className="text-zinc-600 mb-2" />
                <h4 className="text-xs font-semibold text-zinc-300">No Method Specification Selected</h4>
                <p className="text-[11px] text-zinc-500 max-w-sm mt-1">
                  Select a gRPC service and method above or click <strong className="text-zinc-400">Reflection</strong> to load protobuf message descriptors from the server.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
