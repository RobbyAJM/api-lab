import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type { Endpoint, SavedResponse } from '@api-lab/api-types';
import { Bookmark, Clock, HardDrive, Trash2 } from 'lucide-react';

export const ResponseViewer: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const queryClient = useQueryClient();
  const { lastHttpResponse, lastGrpcResponse } = useAppStore();
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'saved'>('body');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Fetch current saved response from server
  const { data: savedResponse, isLoading: loadingSaved } = useQuery<SavedResponse | null>({
    queryKey: ['saved_response', endpoint.id],
    queryFn: async () => {
      try {
        return await apiRequest<SavedResponse>(`/endpoints/${endpoint.id}/saved-response`);
      } catch {
        return null;
      }
    },
  });

  // Save current response mutation
  const saveResponseMutation = useMutation({
    mutationFn: (payload: {
      status_code: number;
      response_headers: Record<string, string>;
      response_body: string;
      response_time_ms: number;
      response_size_bytes: number;
    }) =>
      apiRequest(`/endpoints/${endpoint.id}/saved-response`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved_response', endpoint.id] });
      setSaveMessage('Response saved to workspace!');
      setTimeout(() => setSaveMessage(null), 2500);
    },
  });

  // Delete saved response mutation
  const deleteSavedMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/endpoints/${endpoint.id}/saved-response`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved_response', endpoint.id] });
    },
  });

  const isHttp = endpoint.protocol === 'http';
  const activeResponse = isHttp ? lastHttpResponse : lastGrpcResponse;

  function handleSaveCurrent() {
    if (!activeResponse) return;

    if (isHttp && lastHttpResponse) {
      saveResponseMutation.mutate({
        status_code: lastHttpResponse.status_code,
        response_headers: lastHttpResponse.headers,
        response_body: lastHttpResponse.body,
        response_time_ms: Number(lastHttpResponse.response_time_ms),
        response_size_bytes: Number(lastHttpResponse.response_size_bytes),
      });
    } else if (!isHttp && lastGrpcResponse) {
      saveResponseMutation.mutate({
        status_code: lastGrpcResponse.status_code,
        response_headers: lastGrpcResponse.metadata,
        response_body: JSON.stringify(lastGrpcResponse.body || {}, null, 2),
        response_time_ms: Number(lastGrpcResponse.response_time_ms),
        response_size_bytes: Number(lastGrpcResponse.response_size_bytes),
      });
    }
  }

  // Format body text
  let bodyDisplay = '';
  if (isHttp && lastHttpResponse) {
    try {
      bodyDisplay = JSON.stringify(JSON.parse(lastHttpResponse.body), null, 2);
    } catch {
      bodyDisplay = lastHttpResponse.body;
    }
  } else if (!isHttp && lastGrpcResponse) {
    bodyDisplay = JSON.stringify(lastGrpcResponse.body, null, 2);
  }

  const headersDisplay = isHttp
    ? lastHttpResponse?.headers || {}
    : lastGrpcResponse?.metadata || {};

  return (
    <div className="w-96 bg-zinc-950 flex flex-col h-screen select-none text-zinc-300">
      {/* Top Status Header */}
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-400">Response</span>
          {activeResponse && (
            <button
              onClick={handleSaveCurrent}
              disabled={saveResponseMutation.isPending}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition"
              title="Save this response to workspace"
            >
              <Bookmark size={12} />
              <span>Save Response</span>
            </button>
          )}
        </div>

        {saveMessage && (
          <div className="text-[11px] text-emerald-400 font-mono">{saveMessage}</div>
        )}

        {activeResponse ? (
          <div className="flex items-center gap-3 text-xs">
            {/* Status Badge */}
            {isHttp && lastHttpResponse ? (
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                  lastHttpResponse.status_code >= 200 && lastHttpResponse.status_code < 300
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : lastHttpResponse.status_code >= 400
                    ? 'bg-red-950 text-red-400 border border-red-800'
                    : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                {lastHttpResponse.status_code} {lastHttpResponse.status_text}
              </span>
            ) : !isHttp && lastGrpcResponse ? (
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                  lastGrpcResponse.status_code === 0
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-red-950 text-red-400 border border-red-800'
                }`}
              >
                gRPC [{lastGrpcResponse.status_code}] {lastGrpcResponse.status_message}
              </span>
            ) : null}

            {/* Time */}
            <span className="flex items-center gap-1 text-zinc-400 text-[11px]">
              <Clock size={11} />
              <span>{activeResponse.response_time_ms} ms</span>
            </span>

            {/* Size */}
            <span className="flex items-center gap-1 text-zinc-400 text-[11px]">
              <HardDrive size={11} />
              <span>{activeResponse.response_size_bytes} B</span>
            </span>
          </div>
        ) : (
          <div className="text-xs text-zinc-500 py-1">No response executed yet</div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 bg-zinc-900/40 text-xs">
        <button
          onClick={() => setActiveTab('body')}
          className={`px-3 py-2 font-medium border-b-2 transition ${
            activeTab === 'body'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Body
        </button>
        <button
          onClick={() => setActiveTab('headers')}
          className={`px-3 py-2 font-medium border-b-2 transition ${
            activeTab === 'headers'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {isHttp ? 'Headers' : 'Metadata'}
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`px-3 py-2 font-medium border-b-2 transition flex items-center gap-1 ${
            activeTab === 'saved'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span>Saved</span>
          {savedResponse && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 text-xs font-mono">
        {activeResponse?.error && (
          <div className="mb-3 p-2.5 bg-red-950/60 border border-red-800 rounded text-red-300 font-sans text-xs">
            <div className="font-semibold mb-1">Execution Error:</div>
            <div>{activeResponse.error}</div>
          </div>
        )}

        {activeTab === 'body' && (
          <div>
            {bodyDisplay ? (
              <pre className="whitespace-pre-wrap break-all text-zinc-200 select-text">
                {bodyDisplay}
              </pre>
            ) : (
              <div className="text-zinc-600 font-sans text-center py-10">
                Click Send/Invoke to execute request
              </div>
            )}
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="space-y-1.5">
            {Object.keys(headersDisplay).length === 0 ? (
              <div className="text-zinc-600 font-sans text-center py-10">
                No headers or metadata returned
              </div>
            ) : (
              Object.entries(headersDisplay).map(([k, v]) => (
                <div key={k} className="flex flex-col border-b border-zinc-900 pb-1">
                  <span className="text-indigo-400 font-semibold">{k}</span>
                  <span className="text-zinc-300 break-all select-text">{v}</span>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="space-y-3 font-sans">
            {loadingSaved ? (
              <div className="text-zinc-500 text-center py-10">Loading saved response...</div>
            ) : savedResponse ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <span className="text-xs font-medium text-emerald-400">
                    Latest Saved Response
                  </span>
                  <button
                    onClick={() => deleteSavedMutation.mutate()}
                    title="Delete saved response"
                    className="text-zinc-500 hover:text-red-400 p-1"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
                  <span>Status: {savedResponse.status_code}</span>
                  <span>•</span>
                  <span>{savedResponse.response_time_ms} ms</span>
                  <span>•</span>
                  <span>{savedResponse.response_size_bytes} B</span>
                </div>
                <pre className="font-mono text-xs text-zinc-200 bg-zinc-900 p-2.5 rounded border border-zinc-800 whitespace-pre-wrap break-all max-h-96 overflow-y-auto select-text">
                  {savedResponse.response_body}
                </pre>
              </div>
            ) : (
              <div className="text-zinc-600 text-center py-10">
                No saved response for this endpoint yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
