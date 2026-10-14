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
  Radio,
  ArrowDownUp,
  ArrowLeftRight,
  Plus,
  Trash2,
  Wand2,
  Code,
  CheckCircle,
  XCircle,
  Terminal,
  Play,
  Square,
  Shield,
} from 'lucide-react';
import { JsonEditor } from '../common/JsonEditor';
import { VariableInput } from '../common/VariableInput';
import { JavaScriptEditor } from '../common/JavaScriptEditor';
import { runBeforeHook, runAfterHook, type HookTestResult } from '../../utils/hookRunner';
import { applyInheritedGrpcAuth } from '../../utils/authInheritance';
import { syncEnvironmentVariables } from '../../utils/envSync';
import { shouldAutoDetectTls } from '../../utils/grpcReflectionGenerator';

export const GrpcRequestEditor: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const queryClient = useQueryClient();
  const {
    activeEnvironmentId,
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

  const initialDraft =
    useAppStore.getState().endpointDrafts[endpoint.id] || endpoint.config || {};

  const [serverAddress, setServerAddress] = useState(
    initialDraft.server_address || 'localhost:50051'
  );
  const [useTls, setUseTls] = useState<boolean>(() => {
    if (initialDraft.use_tls !== undefined) return Boolean(initialDraft.use_tls);
    return shouldAutoDetectTls(initialDraft.server_address || 'localhost:50051');
  });
  const [selectedService, setSelectedService] = useState(initialDraft.service || '');
  const [selectedMethod, setSelectedMethod] = useState(initialDraft.method || '');

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
    const raw = initialDraft.metadata || {};
    return Object.entries(raw);
  });
  const [payloadStr, setPayloadStr] = useState<string>(() => {
    if (initialDraft.payload !== undefined && initialDraft.payload !== null) {
      return typeof initialDraft.payload === 'string'
        ? initialDraft.payload
        : JSON.stringify(initialDraft.payload, null, 2);
    }
    return '{}';
  });

  // Scripts state
  const [preRequestScript, setPreRequestScript] = useState<string>(
    initialDraft.pre_request_script || ''
  );
  const [postResponseScript, setPostResponseScript] = useState<string>(
    initialDraft.post_response_script || initialDraft.post_request_script || ''
  );
  const [hookScriptTab, setHookScriptTab] = useState<'pre' | 'post'>('pre');
  const [hookTests, setHookTests] = useState<HookTestResult[]>([]);
  const [hookLogs, setHookLogs] = useState<string[]>([]);

  const [activeVariables, setActiveVariables] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'payload' | 'metadata' | 'scripts' | 'options'>('payload');
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

  useEffect(() => {
    setCurrentVersion(endpoint.version);
    currentVersionRef.current = endpoint.version;
    setServerAddress(endpoint.config?.server_address || 'localhost:50051');
    setUseTls(endpoint.config?.use_tls || false);
    setSelectedService(endpoint.config?.service || '');
    setSelectedMethod(endpoint.config?.method || '');
    setMetadata(Object.entries(endpoint.config?.metadata || {}));
    setPayloadStr(JSON.stringify(endpoint.config?.payload || {}, null, 2));
    setPreRequestScript(endpoint.config?.pre_request_script || '');
    setPostResponseScript(
      endpoint.config?.post_request_script || endpoint.config?.post_response_script || ''
    );
    setHookTests([]);
    setHookLogs([]);
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
      {/* Top Bar: Server Address, Reflection, Send, Save */}
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {streamType === 'bidi_stream' ? (
              <span className="text-xs font-semibold text-fuchsia-400 flex items-center gap-1">
                <ArrowLeftRight size={13} /> gRPC Bidi Stream:
              </span>
            ) : streamType === 'omni_stream' ? (
              <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1">
                <ArrowDownUp size={13} /> gRPC Stream:
              </span>
            ) : (
              <span className="text-xs font-semibold text-purple-400 flex items-center gap-1">
                <Radio size={13} /> gRPC Unary:
              </span>
            )}
            <span className="text-xs font-medium text-zinc-100">{endpoint.name}</span>

            {collection?.settings?.auth && collection.settings.auth.auth_type !== 'none' && (
              <span
                title="Inheriting authorization from collection settings"
                className="text-[10px] text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 px-1 rounded flex items-center gap-0.5"
              >
                <Shield size={9} /> Shared Auth
              </span>
            )}
          </div>
          {statusMessage && (
            <div className="p-1 px-2 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-indigo-300 break-all select-text">
              {statusMessage}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded focus-within:border-purple-500 h-8">
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
              className="w-full h-full"
            />
          </div>

          <button
            onClick={handleDiscover}
            disabled={discovering}
            title="Discover services via gRPC server reflection"
            className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-purple-300 rounded text-xs flex items-center gap-1 transition h-8"
          >
            <RefreshCw size={12} className={discovering ? 'animate-spin' : ''} />
            <span>{discovering ? 'Querying...' : 'Reflection'}</span>
          </button>

          {isStreamingRpc ? (
            isCurrentEndpointStreaming ? (
              <button
                onClick={handleStopStream}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded text-xs flex items-center gap-1.5 shadow-sm transition h-8"
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
                className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium rounded text-xs flex items-center gap-1.5 shadow-sm transition h-8"
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
              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded text-xs flex items-center gap-1.5 shadow-sm transition h-8"
              title="Invoke method (Ctrl+Enter)"
            >
              <Send size={13} />
              <span>{sending ? 'Calling...' : 'Invoke'}</span>
              <kbd className="text-[10px] font-mono px-1 py-0.5 rounded bg-purple-800/80 text-purple-200 border border-purple-700 ml-0.5 select-none">
                Ctrl+↵
              </kbd>
            </button>
          )}

          <button
            onClick={() => saveChanges({ silent: false })}
            disabled={isSavingRef.current}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded text-xs flex items-center gap-1.5 transition h-8"
            title="Save changes to endpoint (Ctrl+S)"
          >
            <Save size={13} />
            <span>Save</span>
            <kbd className="text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-700/60 ml-0.5 select-none">
              Ctrl+S
            </kbd>
          </button>
        </div>

        {/* Service and Method Selectors (Always Dropdown with Auto-Cache) */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label className="block text-[10px] text-zinc-400 mb-0.5">Service</label>
            <select
              value={selectedService}
              onChange={(e) => {
                setSelectedService(e.target.value);
                const svc = discoveredServices.find((s) => s.name === e.target.value);
                if (svc && svc.methods.length > 0) {
                  setSelectedMethod(svc.methods[0].name);
                }
              }}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-purple-500 h-7"
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

          <div>
            <label className="block text-[10px] text-zinc-400 mb-0.5">Method</label>
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-purple-500 h-7"
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

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 bg-zinc-900/40 text-xs">
        <button
          onClick={() => setActiveTab('payload')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'payload'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          JSON Payload
        </button>
        <button
          onClick={() => setActiveTab('metadata')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'metadata'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Metadata ({metadata.length})
        </button>
        <button
          onClick={() => setActiveTab('scripts')}
          className={`px-4 py-2 font-medium border-b-2 transition flex items-center gap-1 ${
            activeTab === 'scripts'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Code size={12} />
          <span>Scripts</span>
          {hookTests.length > 0 && (
            <span className="ml-1 px-1 py-0.2 bg-zinc-800 text-[10px] rounded font-mono">
              {hookTests.filter((t) => t.passed).length}/{hookTests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('options')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'options'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Options (TLS)
        </button>
      </div>

      {/* Panels */}
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {activeTab === 'payload' && (
          <div className="h-full flex flex-col space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>
                JSON matching protobuf schema. Variables like &#123;&#123;ID&#125;&#125; are supported.
              </span>
              <button
                type="button"
                onClick={handleGenerateSamplePayload}
                disabled={generatingPayload || !selectedService || !selectedMethod}
                title="Generate example JSON payload with types & enums from reflection"
                className="px-2 py-0.5 bg-purple-950/70 hover:bg-purple-900 border border-purple-800/60 text-purple-300 rounded flex items-center gap-1 transition"
              >
                <Wand2 size={11} className={generatingPayload ? 'animate-spin' : ''} />
                <span>{generatingPayload ? 'Generating...' : 'Generate Example'}</span>
              </button>
            </div>
            <div className="flex-1 h-72">
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
                JavaScript (Postman syntax: pm.*)
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
      </div>
    </div>
  );
};
