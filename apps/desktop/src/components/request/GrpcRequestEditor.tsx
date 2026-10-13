import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { executeNativeGrpc, discoverNativeGrpcServices } from '../../api/native';
import type {
  Endpoint,
  GrpcExecutionRequest,
  GrpcServiceSummary,
  VariableResponse,
} from '@api-lab/api-types';
import { Send, Save, RefreshCw, Radio, Plus, Trash2 } from 'lucide-react';

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

  const [activeTab, setActiveTab] = useState<'payload' | 'metadata' | 'options'>('payload');
  const [discovering, setDiscovering] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setServerAddress(endpoint.config?.server_address || 'localhost:50051');
    setUseTls(endpoint.config?.use_tls || false);
    setSelectedService(endpoint.config?.service || '');
    setSelectedMethod(endpoint.config?.method || '');
    setMetadata(Object.entries(endpoint.config?.metadata || {}));
    setPayloadStr(JSON.stringify(endpoint.config?.payload || {}, null, 2));
  }, [endpoint.id]);

  async function resolveVariables(): Promise<Record<string, string>> {
    const activeVariables: Record<string, string> = {};
    if (activeEnvironmentId) {
      const envVars = queryClient.getQueryData<VariableResponse[]>(['variables', activeEnvironmentId]);
      if (envVars) {
        for (const v of envVars) {
          activeVariables[v.key] = v.value;
        }
      } else {
        try {
          const fetched = await apiRequest<VariableResponse[]>(`/environments/${activeEnvironmentId}/variables`);
          for (const v of fetched) {
            activeVariables[v.key] = v.value;
          }
        } catch {
          // fallback
        }
      }
    }
    return activeVariables;
  }

  // Discover services via reflection
  async function handleDiscover() {
    setDiscovering(true);
    setStatusMessage(null);
    try {
      const activeVariables = await resolveVariables();
      const res = await discoverNativeGrpcServices(
        { server_address: serverAddress, use_tls: useTls },
        activeVariables
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
      const activeVariables = await resolveVariables();
      const resp = await executeNativeGrpc(execReq, activeVariables);
      setLastGrpcResponse(resp);
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
          <div className="p-2 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-indigo-300 break-all select-text">
            {statusMessage}
          </div>
        )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={serverAddress}
            onChange={(e) => setServerAddress(e.target.value)}
            placeholder="localhost:50051 or {{GRPC_ADDR}}"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
          />

          <button
            onClick={handleDiscover}
            disabled={discovering}
            title="Discover services via gRPC server reflection"
            className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-purple-300 rounded text-xs flex items-center gap-1 transition"
          >
            <RefreshCw size={12} className={discovering ? 'animate-spin' : ''} />
            <span>{discovering ? 'Querying...' : 'Reflection'}</span>
          </button>

          <button
            onClick={handleSend}
            disabled={sending || !selectedService || !selectedMethod}
            className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded text-xs flex items-center gap-1.5 shadow-sm transition"
          >
            <Send size={13} />
            <span>{sending ? 'Calling...' : 'Invoke'}</span>
          </button>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded text-xs flex items-center gap-1.5 transition"
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
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
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
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
              />
            )}
          </div>

          <div>
            <label className="block text-[10px] text-zinc-400 mb-0.5">Method</label>
            {availableMethods.length > 0 ? (
              <select
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
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
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
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
            <span className="text-[11px] text-zinc-400">
              Provide JSON matching the protobuf message schema. Variables like &#123;&#123;ID&#125;&#125; are supported.
            </span>
            <textarea
              value={payloadStr}
              onChange={(e) => setPayloadStr(e.target.value)}
              className="flex-1 w-full bg-zinc-900 border border-zinc-800 rounded p-3 font-mono text-xs focus:outline-none focus:border-purple-500 resize-none h-64"
            />
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
                  className="w-1/3 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-purple-500"
                />
                <input
                  type="text"
                  value={val}
                  onChange={(e) => {
                    const next = [...metadata];
                    next[idx][1] = e.target.value;
                    setMetadata(next);
                  }}
                  placeholder="Value"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-purple-500"
                />
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

        {activeTab === 'options' && (
          <div className="space-y-3 max-w-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useTls}
                onChange={(e) => setUseTls(e.target.checked)}
                className="rounded bg-zinc-900 border-zinc-700"
              />
              <span className="text-zinc-200">Enable TLS connection</span>
            </label>
            <p className="text-[11px] text-zinc-500">
              When checked, connects over HTTPS/TLS with strict certificate validation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
