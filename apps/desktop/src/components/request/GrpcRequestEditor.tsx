import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import {
  executeNativeGrpc,
  discoverNativeGrpcServices,
  generateNativeGrpcSamplePayload,
} from '../../api/native';
import type {
  Endpoint,
  GrpcExecutionRequest,
  GrpcServiceSummary,
  VariableResponse,
} from '@api-lab/api-types';
import {
  Send,
  Save,
  RefreshCw,
  Radio,
  Plus,
  Trash2,
  Wand2,
  Code,
  CheckCircle,
  XCircle,
  Terminal,
} from 'lucide-react';
import { JsonEditor } from '../common/JsonEditor';
import { VariableInput } from '../common/VariableInput';
import { runBeforeHook, runAfterHook, type HookTestResult } from '../../utils/hookRunner';

export const GrpcRequestEditor: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const queryClient = useQueryClient();
  const { activeEnvironmentId, setLastGrpcResponse } = useAppStore();

  const [serverAddress, setServerAddress] = useState(
    endpoint.config?.server_address || 'localhost:50051'
  );
  const [useTls, setUseTls] = useState<boolean>(endpoint.config?.use_tls || false);
  const [selectedService, setSelectedService] = useState(endpoint.config?.service || '');
  const [selectedMethod, setSelectedMethod] = useState(endpoint.config?.method || '');
  const [discoveredServices, setDiscoveredServices] = useState<GrpcServiceSummary[]>([]);

  const [metadata, setMetadata] = useState<[string, string][]>(() => {
    const raw = endpoint.config?.metadata || {};
    return Object.entries(raw);
  });
  const [payloadStr, setPayloadStr] = useState<string>(() => {
    return JSON.stringify(endpoint.config?.payload || {}, null, 2);
  });

  // Scripts state
  const [preRequestScript, setPreRequestScript] = useState<string>(
    endpoint.config?.pre_request_script || ''
  );
  const [postResponseScript, setPostResponseScript] = useState<string>(
    endpoint.config?.post_request_script || ''
  );
  const [hookScriptTab, setHookScriptTab] = useState<'pre' | 'post'>('pre');
  const [hookTests, setHookTests] = useState<HookTestResult[]>([]);
  const [hookLogs, setHookLogs] = useState<string[]>([]);

  const [activeVariables, setActiveVariables] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'payload' | 'metadata' | 'scripts' | 'options'>('payload');
  const [discovering, setDiscovering] = useState(false);
  const [generatingPayload, setGeneratingPayload] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
    setServerAddress(endpoint.config?.server_address || 'localhost:50051');
    setUseTls(endpoint.config?.use_tls || false);
    setSelectedService(endpoint.config?.service || '');
    setSelectedMethod(endpoint.config?.method || '');
    setMetadata(Object.entries(endpoint.config?.metadata || {}));
    setPayloadStr(JSON.stringify(endpoint.config?.payload || {}, null, 2));
    setPreRequestScript(endpoint.config?.pre_request_script || '');
    setPostResponseScript(endpoint.config?.post_request_script || '');
    setHookTests([]);
    setHookLogs([]);
  }, [endpoint.id]);

  // Discover services via reflection
  async function handleDiscover() {
    setDiscovering(true);
    setStatusMessage(null);
    try {
      const activeVars = await resolveVariables();
      const res = await discoverNativeGrpcServices(
        { server_address: serverAddress, use_tls: useTls },
        activeVars
      );
      if (res.error) {
        setStatusMessage(res.error);
      } else {
        setDiscoveredServices(res.services);
        if (res.services.length > 0 && !selectedService) {
          setSelectedService(res.services[0].name);
          if (res.services[0].methods.length > 0) {
            setSelectedMethod(res.services[0].methods[0].name);
          }
        }
        setStatusMessage(`Discovered ${res.services.length} services via reflection`);
      }
    } catch (err: any) {
      setStatusMessage(`Discovery error: ${err.message}`);
    } finally {
      setDiscovering(false);
    }
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

  // Save changes to endpoint on server
  const saveMutation = useMutation({
    mutationFn: () => {
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

      return apiRequest(`/endpoints/${endpoint.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: endpoint.version,
          config: {
            server_address: serverAddress,
            service: selectedService,
            method: selectedMethod,
            use_tls: useTls,
            metadata: metaMap,
            payload: payloadJson,
            pre_request_script: preRequestScript,
            post_request_script: postResponseScript,
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

  // Execute unary gRPC
  async function handleSend() {
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
      use_tls: useTls,
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

      // 2. Execute gRPC Request
      const resp = await executeNativeGrpc(beforeResult.request, beforeResult.variables);
      setLastGrpcResponse(resp);

      // 3. Run Post-response Hook (After)
      const afterResult = await runAfterHook(
        postResponseScript,
        beforeResult.request,
        resp,
        beforeResult.variables
      );
      setHookTests(afterResult.tests);
      setHookLogs((prev) => [...prev, ...afterResult.logs]);
      setActiveVariables(afterResult.variables);

      if (afterResult.error) {
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

  const currentServiceObj = discoveredServices.find((s) => s.name === selectedService);
  const availableMethods = currentServiceObj?.methods || [];

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 border-r border-zinc-800 h-screen select-none">
      {/* Top Bar: Server Address, Reflection, Send, Save */}
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-purple-400 flex items-center gap-1">
              <Radio size={13} /> gRPC Endpoint:
            </span>
            <span className="text-xs font-medium text-zinc-100">{endpoint.name}</span>
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
              onChange={setServerAddress}
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

          <button
            onClick={handleSend}
            disabled={sending || !selectedService || !selectedMethod}
            className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded text-xs flex items-center gap-1.5 shadow-sm transition h-8"
          >
            <Send size={13} />
            <span>{sending ? 'Calling...' : 'Invoke'}</span>
          </button>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded text-xs flex items-center gap-1.5 transition h-8"
          >
            <Save size={13} />
            <span>Save</span>
          </button>
        </div>

        {/* Service and Method Selectors */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label className="block text-[10px] text-zinc-400 mb-0.5">Service</label>
            {discoveredServices.length > 0 ? (
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
                {discoveredServices.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                placeholder="package.ServiceName (click Reflection to auto-discover)"
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300 focus:outline-none focus:border-purple-500 h-7"
              />
            )}
          </div>

          <div>
            <label className="block text-[10px] text-zinc-400 mb-0.5">Method</label>
            {availableMethods.length > 0 ? (
              <select
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-purple-500 h-7"
              >
                {availableMethods.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.input_type} → {m.output_type})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value)}
                placeholder="MethodName"
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300 focus:outline-none focus:border-purple-500 h-7"
              />
            )}
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
                JavaScript (Workbench syntax: pm.*)
              </span>
            </div>

            <div className="flex-1 flex flex-col space-y-2">
              {hookScriptTab === 'pre' ? (
                <div className="flex-1 flex flex-col space-y-1">
                  <span className="text-[10px] text-zinc-400">
                    Runs before invoking gRPC. Use <code className="text-purple-300 font-mono">pm.environment.set(key, val)</code> or mutate <code className="text-purple-300 font-mono">pm.request.payload</code> or <code className="text-purple-300 font-mono">pm.request.metadata</code>.
                  </span>
                  <textarea
                    value={preRequestScript}
                    onChange={(e) => setPreRequestScript(e.target.value)}
                    placeholder={`// Example gRPC Pre-request Script:\npm.environment.set("REQ_ID", "req_" + Date.now());\npm.request.metadata['x-request-id'] = pm.variables.get('REQ_ID');\nconsole.log('Invoking gRPC method...');`}
                    spellCheck={false}
                    className="flex-1 w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-purple-500 resize-none min-h-[160px]"
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col space-y-1">
                  <span className="text-[10px] text-zinc-400">
                    Runs after gRPC response arrives. Use <code className="text-purple-300 font-mono">pm.test(...)</code> and <code className="text-purple-300 font-mono">pm.response.json()</code>.
                  </span>
                  <textarea
                    value={postResponseScript}
                    onChange={(e) => setPostResponseScript(e.target.value)}
                    placeholder={`// Example gRPC Post-response Script:\npm.test("Status code is 0 (OK)", () => {\n  pm.expect(pm.response.code).to.equal(0);\n});\n\nconst body = pm.response.json();\nif (body && body.details && body.details.token) {\n  pm.environment.set("GRPC_TOKEN", body.details.token);\n}`}
                    spellCheck={false}
                    className="flex-1 w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-purple-500 resize-none min-h-[160px]"
                  />
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
