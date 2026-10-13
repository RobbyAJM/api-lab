import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type { Endpoint, SavedResponse } from '@api-lab/api-types';
import {
  Bookmark,
  Clock,
  HardDrive,
  Trash2,
  Search,
  X,
  ArrowDownUp,
  RotateCcw,
  Copy,
  Check,
} from 'lucide-react';
import {
  detectResponseFormat,
  formatResponseBody,
} from '../../utils/responseDetector';
import { FormattedBodyViewer } from './FormattedBodyViewer';

export const ResponseViewer: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const queryClient = useQueryClient();
  const {
    lastHttpResponse,
    lastGrpcResponse,
    isStreaming,
    streamMessages,
    clearStreamMessages,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'body' | 'stream' | 'headers' | 'saved'>('body');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedSaved, setCopiedSaved] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const streamBottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto switch to stream tab when streaming begins or stream messages exist
  useEffect(() => {
    if (isStreaming || (streamMessages.length > 0 && endpoint.protocol === 'grpc')) {
      setActiveTab('stream');
    }
  }, [isStreaming, streamMessages.length, endpoint.protocol]);

  // Auto-scroll stream messages
  useEffect(() => {
    if (autoScroll && activeTab === 'stream') {
      streamBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamMessages.length, autoScroll, activeTab]);

  // Fetch current saved response from server
  const { data: savedResponse } = useQuery<SavedResponse | null>({
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
    if (!activeResponse && streamMessages.length === 0) return;

    if (isHttp && lastHttpResponse) {
      saveResponseMutation.mutate({
        status_code: lastHttpResponse.status_code,
        response_headers: lastHttpResponse.headers,
        response_body: lastHttpResponse.body,
        response_time_ms: Number(lastHttpResponse.response_time_ms),
        response_size_bytes: Number(lastHttpResponse.response_size_bytes),
      });
    } else if (!isHttp) {
      const bodyToSave =
        streamMessages.length > 0
          ? streamMessages.map((m) => m.payload)
          : lastGrpcResponse?.body && lastGrpcResponse.body !== null
          ? lastGrpcResponse.body
          : {};

      saveResponseMutation.mutate({
        status_code: lastGrpcResponse?.status_code ?? 0,
        response_headers: lastGrpcResponse?.metadata || {},
        response_body: JSON.stringify(bodyToSave, null, 2),
        response_time_ms: Number(lastGrpcResponse?.response_time_ms || 0),
        response_size_bytes: Number(lastGrpcResponse?.response_size_bytes || 0),
      });
    }
  }

  // Format body text and detect response type
  let rawBody: any = '';
  if (isHttp && lastHttpResponse) {
    rawBody = lastHttpResponse.body || '';
  } else if (!isHttp && lastGrpcResponse) {
    if (lastGrpcResponse.body !== null && lastGrpcResponse.body !== undefined) {
      rawBody = lastGrpcResponse.body;
    }
  }

  // Prevent literal "null" from showing up inside body
  if (rawBody === 'null') {
    rawBody = '';
  }

  const contentType = isHttp
    ? lastHttpResponse?.headers?.['content-type']
    : 'application/json';

  const detectedFormat = detectResponseFormat(rawBody, contentType);
  const formattedBody = formatResponseBody(rawBody, detectedFormat);

  // Saved response formatting and detection
  const savedContentType = savedResponse?.response_headers?.['content-type'];
  const savedFormat = detectResponseFormat(
    savedResponse?.response_body || '',
    savedContentType
  );
  const formattedSavedBody = formatResponseBody(
    savedResponse?.response_body || '',
    savedFormat
  );

  const headersDisplay = isHttp
    ? lastHttpResponse?.headers || {}
    : lastGrpcResponse?.metadata || {};

  function handleCopyBody() {
    if (!formattedBody) return;
    navigator.clipboard.writeText(formattedBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCopySaved() {
    if (!formattedSavedBody) return;
    navigator.clipboard.writeText(formattedSavedBody);
    setCopiedSaved(true);
    setTimeout(() => setCopiedSaved(false), 2000);
  }

  function handleCopyStreamMsg(msgId: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  }

  // Filter stream messages by search query
  const q = searchQuery.trim().toLowerCase();
  const filteredStreamMessages = streamMessages.filter((msg) => {
    if (!q) return true;
    const msgText =
      typeof msg.payload === 'string'
        ? msg.payload
        : typeof msg.payload === 'object' && msg.payload !== null
        ? JSON.stringify(msg.payload)
        : String(msg.payload ?? '');
    return msgText.toLowerCase().includes(q);
  });

  // Match count in unary body
  const bodyMatchesCount =
    q && formattedBody
      ? (formattedBody.toLowerCase().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      : 0;

  // Match count in saved response
  const savedMatchesCount =
    q && formattedSavedBody
      ? (formattedSavedBody.toLowerCase().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      : 0;

  return (
    <div className="w-96 bg-zinc-950 flex flex-col h-screen text-zinc-300 border-l border-zinc-800">
      {/* Top Status Header */}
      <div className="p-3 border-b border-zinc-800 space-y-2 select-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-400">Response</span>
            {isStreaming && (
              <span className="flex items-center gap-1 text-[10px] text-cyan-400 font-mono font-bold bg-cyan-950/70 border border-cyan-800 px-1.5 py-0.5 rounded animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                STREAMING
              </span>
            )}
          </div>
          {(activeResponse || streamMessages.length > 0) && (
            <button
              onClick={handleSaveCurrent}
              disabled={saveResponseMutation.isPending}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition"
              title="Save this response to workspace"
            >
              <Bookmark size={12} />
              <span>Save</span>
            </button>
          )}
        </div>

        {saveMessage && (
          <div className="text-[11px] text-emerald-400 font-mono">{saveMessage}</div>
        )}

        {activeResponse || streamMessages.length > 0 ? (
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
            {activeResponse && (
              <span className="flex items-center gap-1 text-zinc-400 text-[11px]">
                <Clock size={11} />
                <span>{activeResponse.response_time_ms} ms</span>
              </span>
            )}

            {/* Size */}
            {activeResponse && (
              <span className="flex items-center gap-1 text-zinc-400 text-[11px]">
                <HardDrive size={11} />
                <span>{activeResponse.response_size_bytes} B</span>
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-zinc-500 py-1">No response executed yet</div>
        )}
      </div>

      {/* Searchbar in Response or Stream */}
      <div className="px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/50 select-none">
        <div className="relative flex items-center">
          <Search size={12} className="absolute left-2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'stream'
                ? 'Search stream messages...'
                : activeTab === 'saved'
                ? 'Search saved response...'
                : 'Search response body...'
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded pl-7 pr-12 py-1 text-[11px] font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
          {searchQuery && (
            <div className="absolute right-1.5 flex items-center gap-1">
              {activeTab === 'body' && bodyMatchesCount > 0 && (
                <span className="text-[10px] text-zinc-400 font-mono">
                  {bodyMatchesCount}
                </span>
              )}
              {activeTab === 'saved' && savedMatchesCount > 0 && (
                <span className="text-[10px] text-zinc-400 font-mono">
                  {savedMatchesCount}
                </span>
              )}
              {activeTab === 'stream' && (
                <span className="text-[10px] text-zinc-400 font-mono">
                  {filteredStreamMessages.length}/{streamMessages.length}
                </span>
              )}
              <button
                onClick={() => setSearchQuery('')}
                className="text-zinc-500 hover:text-zinc-300 p-0.5"
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 bg-zinc-900/40 text-xs select-none">
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

        {!isHttp && (
          <button
            onClick={() => setActiveTab('stream')}
            className={`px-3 py-2 font-medium border-b-2 transition flex items-center gap-1 ${
              activeTab === 'stream'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ArrowDownUp size={11} />
            <span>Stream</span>
            {streamMessages.length > 0 && (
              <span className="ml-0.5 px-1 bg-zinc-800 text-[10px] rounded font-mono text-cyan-300">
                {streamMessages.length}
              </span>
            )}
          </button>
        )}

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
        {/* Unary Body Tab */}
        {activeTab === 'body' && (
          <div className="space-y-2">
            {/* Execution Error ONLY inside Body tab */}
            {activeResponse?.error && (
              <div className="p-2.5 bg-red-950/60 border border-red-800 rounded text-red-300 font-sans text-xs">
                <div className="font-semibold mb-1">Execution Error:</div>
                <div className="font-mono text-xs">{activeResponse.error}</div>
              </div>
            )}

            {formattedBody ? (
              <div className="space-y-2">
                {/* Format badge and Copy button (New Feature 1) */}
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800/80 text-[11px] text-zinc-400 select-none">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      {detectedFormat}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      Formatted response
                    </span>
                  </div>
                  <button
                    onClick={handleCopyBody}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition text-[11px]"
                    title="Copy response body to clipboard"
                  >
                    {copied ? (
                      <>
                        <Check size={11} className="text-emerald-400" />
                        <span className="text-emerald-400 font-medium">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={11} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Response Text with syntax highlighting & select-text enabled */}
                <div className="text-zinc-200 font-mono text-[11px] leading-relaxed select-text selection:bg-indigo-600/40 overflow-x-auto p-1">
                  <FormattedBodyViewer content={formattedBody} format={detectedFormat} />
                </div>
              </div>
            ) : (
              !activeResponse?.error && (
                <div className="text-zinc-500 py-4 text-center select-none">
                  No response body
                </div>
              )
            )}
          </div>
        )}

        {/* Scrollable Stream Messages List */}
        {activeTab === 'stream' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 text-[11px] text-zinc-400 border-b border-zinc-800/80 select-none">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-zinc-300">
                  {streamMessages.length} Messages
                </span>
                {q && (
                  <span className="text-cyan-400 font-mono text-[10px]">
                    ({filteredStreamMessages.length} matching)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 cursor-pointer select-none text-[10px]">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded bg-zinc-900 border-zinc-700"
                  />
                  <span>Auto-scroll</span>
                </label>
                {streamMessages.length > 0 && (
                  <button
                    onClick={clearStreamMessages}
                    className="text-zinc-400 hover:text-red-400 p-0.5"
                    title="Clear stream messages"
                  >
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>
            </div>

            {filteredStreamMessages.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-[11px] select-none">
                {isStreaming
                  ? 'Waiting for stream messages...'
                  : streamMessages.length > 0
                  ? 'No stream messages match search'
                  : 'Stream idle. Click Start Stream to begin receiving messages.'}
              </div>
            ) : (
              filteredStreamMessages.map((msg, idx) => {
                const msgFormat = detectResponseFormat(msg.payload);
                const formattedMsg = formatResponseBody(msg.payload, msgFormat);
                const isCopied = copiedMsgId === msg.id;

                return (
                  <div
                    key={msg.id}
                    className="p-2.5 bg-zinc-900/90 border border-zinc-800 rounded space-y-1.5 hover:border-zinc-700 transition select-text"
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 border-b border-zinc-800/60 pb-1 select-none">
                      <div className="flex items-center gap-1.5">
                        <span className="text-cyan-400 font-bold font-mono">#{idx + 1}</span>
                        <span className="uppercase text-[9px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold">
                          {msgFormat}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>{msg.timestamp}</span>
                        <button
                          onClick={() => handleCopyStreamMsg(msg.id, formattedMsg)}
                          className="hover:text-zinc-300 transition p-0.5"
                          title="Copy message payload"
                        >
                          {isCopied ? (
                            <Check size={11} className="text-emerald-400" />
                          ) : (
                            <Copy size={11} />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="bg-zinc-950/70 p-2 rounded border border-zinc-800/50 overflow-x-auto">
                      <FormattedBodyViewer content={formattedMsg} format={msgFormat} />
                    </div>
                  </div>
                );
              })
            )}
            <div ref={streamBottomRef} />
          </div>
        )}

        {/* Headers / Metadata Tab */}
        {activeTab === 'headers' && (
          <div className="space-y-1 select-text">
            {Object.keys(headersDisplay).length === 0 ? (
              <div className="text-zinc-500 py-4 text-center select-none">
                No {isHttp ? 'headers' : 'metadata'} returned
              </div>
            ) : (
              Object.entries(headersDisplay).map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between py-1 border-b border-zinc-900 text-xs selection:bg-indigo-600/40"
                >
                  <span className="text-indigo-400 font-semibold">{k}:</span>
                  <span className="text-zinc-300 break-all pl-2 text-right">{v}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Saved Response Tab */}
        {activeTab === 'saved' && (
          <div className="space-y-3 select-text">
            {savedResponse ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between select-none">
                  <span className="text-zinc-400 text-xs">
                    Saved on {new Date(savedResponse.created_at).toLocaleString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopySaved}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition text-[11px]"
                      title="Copy saved response body"
                    >
                      {copiedSaved ? (
                        <>
                          <Check size={11} className="text-emerald-400" />
                          <span className="text-emerald-400 font-medium">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => deleteSavedMutation.mutate()}
                      className="text-red-400 hover:text-red-300 p-1"
                      title="Delete saved response"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs select-none">
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 font-mono">
                    Status: {savedResponse.status_code}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 font-mono">
                    {savedResponse.response_time_ms} ms
                  </span>
                  {savedResponse.response_size_bytes > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 font-mono">
                      {savedResponse.response_size_bytes} B
                    </span>
                  )}
                  <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {savedFormat}
                  </span>
                </div>
                <div className="bg-zinc-950/70 p-2.5 rounded border border-zinc-800/60 overflow-x-auto">
                  <FormattedBodyViewer content={formattedSavedBody} format={savedFormat} />
                </div>
              </div>
            ) : (
              <div className="text-zinc-500 py-4 text-center select-none">
                No saved response in workspace
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
