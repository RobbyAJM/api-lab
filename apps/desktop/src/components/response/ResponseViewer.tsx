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
  Square,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
} from 'lucide-react';
import {
  detectResponseFormat,
  formatResponseBody,
} from '../../utils/responseDetector';
import { getGrpcStatusLabel, formatExecutionError } from '../../utils/grpcSpecification';
import { FormattedBodyViewer } from './FormattedBodyViewer';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';

export const ResponseViewer: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const queryClient = useQueryClient();
  const {
    getHttpResponse,
    getGrpcResponse,
    isStreaming,
    streamMessages,
    clearStreamMessages,
    stopStreaming,
  } = useAppStore();
  const lastHttpResponse = getHttpResponse(endpoint.id);
  const lastGrpcResponse = getGrpcResponse(endpoint.id);

  const [activeTab, setActiveTab] = useState<'body' | 'stream' | 'headers' | 'saved'>('body');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedSaved, setCopiedSaved] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [copiedError, setCopiedError] = useState(false);
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
  const [showDeleteSavedModal, setShowDeleteSavedModal] = useState(false);
  const deleteSavedMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/endpoints/${endpoint.id}/saved-response`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved_response', endpoint.id] });
      setShowDeleteSavedModal(false);
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
    <div className="w-full flex-1 flex flex-col min-h-0 bg-zinc-950 text-zinc-300 overflow-hidden">
      {/* Top Status & Search Header (Result V3 Sleek Bar) */}
      <div className="px-4 py-2 bg-zinc-900/60 border-b border-zinc-800/80 flex flex-wrap items-center justify-between text-xs gap-3 select-none flex-shrink-0">
        {/* Left: Status Badge, Metrics, Stream Indicator */}
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Response</span>

          {isStreaming && (
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-[10px] text-amber-300 font-mono font-bold bg-amber-950/50 border border-amber-800/60 px-2 py-0.5 rounded animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                STREAMING
              </span>
              <button
                onClick={stopStreaming}
                className="px-2 py-0.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 rounded text-[10px] font-medium flex items-center gap-1 transition"
                title="Stop gRPC Stream"
              >
                <Square size={9} fill="currentColor" />
                <span>Stop</span>
              </button>
            </div>
          )}

          {activeResponse || streamMessages.length > 0 ? (
            <div className="flex items-center gap-2.5 text-xs">
              {/* Status Badge */}
              {isHttp && lastHttpResponse ? (
                <span
                  title={lastHttpResponse.status_text}
                  className={`font-mono font-bold px-2.5 py-0.5 rounded text-xs inline-flex items-center gap-1.5 flex-shrink-0 ${
                    lastHttpResponse.status_code >= 200 && lastHttpResponse.status_code < 300
                      ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/60'
                      : lastHttpResponse.status_code >= 400
                      ? 'bg-red-950/50 text-red-400 border border-red-800/60'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      lastHttpResponse.status_code >= 200 && lastHttpResponse.status_code < 300
                        ? 'bg-emerald-400'
                        : 'bg-red-400'
                    }`}
                  />
                  <span>
                    {lastHttpResponse.status_code}
                    {lastHttpResponse.status_text && lastHttpResponse.status_text.length <= 24
                      ? ` ${lastHttpResponse.status_text}`
                      : ''}
                  </span>
                </span>
              ) : !isHttp && lastGrpcResponse ? (
                <span
                  title={lastGrpcResponse.status_message}
                  className={`font-mono font-bold px-2.5 py-0.5 rounded text-xs inline-flex items-center gap-1.5 flex-shrink-0 ${
                    lastGrpcResponse.status_code === 0
                      ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/60'
                      : 'bg-red-950/50 text-red-400 border border-red-800/60'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      lastGrpcResponse.status_code === 0 ? 'bg-emerald-400' : 'bg-red-400'
                    }`}
                  />
                  <span>
                    gRPC [{lastGrpcResponse.status_code}]{' '}
                    {getGrpcStatusLabel(lastGrpcResponse.status_code, lastGrpcResponse.status_message)}
                  </span>
                </span>
              ) : null}

              {/* Time */}
              {activeResponse && (
                <span className="flex items-center gap-1 text-zinc-400 font-mono text-[11px]">
                  <Clock size={11} className="text-zinc-500" />
                  <span>{activeResponse.response_time_ms} ms</span>
                </span>
              )}

              {activeResponse && <span className="text-zinc-600">•</span>}

              {/* Size */}
              {activeResponse && (
                <span className="flex items-center gap-1 text-zinc-400 font-mono text-[11px]">
                  <HardDrive size={11} className="text-zinc-500" />
                  <span>{activeResponse.response_size_bytes} B</span>
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-zinc-500">No response executed yet</span>
          )}

          {saveMessage && (
            <span className="text-[11px] text-emerald-400 font-mono ml-1">{saveMessage}</span>
          )}
        </div>

        {/* Right: Search Filter Input & Save Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search size={12} className="w-3 h-3 text-zinc-500 absolute left-2.5 top-2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'stream'
                  ? 'Filter stream messages...'
                  : activeTab === 'saved'
                  ? 'Filter saved response...'
                  : 'Filter response...'
              }
              className="w-44 lg:w-56 bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded py-1 pl-7 pr-12 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none"
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

          {(activeResponse || streamMessages.length > 0) && (
            <button
              onClick={handleSaveCurrent}
              disabled={saveResponseMutation.isPending}
              className="px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              title="Save response to workspace"
            >
              <Bookmark size={12} className="text-zinc-400" />
              <span>Save</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="px-4 border-b border-zinc-800/80 flex items-center justify-between text-xs select-none bg-zinc-950 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('body')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'body'
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Body</span>
          </button>

          {!isHttp && (
            <button
              onClick={() => setActiveTab('stream')}
              className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
                activeTab === 'stream'
                  ? 'border-zinc-200 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ArrowDownUp size={11} />
              <span>Stream</span>
              {streamMessages.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-900 text-amber-300 rounded border border-zinc-800">
                  {streamMessages.length}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => setActiveTab('headers')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'headers'
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>{isHttp ? 'Headers' : 'Metadata'}</span>
          </button>

          <button
            onClick={() => setActiveTab('saved')}
            className={`py-2 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'saved'
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Saved</span>
            {savedResponse && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>

        {/* Output Controls (Format indicator & Copy) */}
        {activeTab === 'body' && formattedBody && (
          <div className="flex items-center gap-2 py-1">
            <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
              {detectedFormat} Formatted
            </span>
            <button
              onClick={handleCopyBody}
              className="px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded transition flex items-center gap-1.5 shadow-sm"
              title="Copy response body to clipboard"
            >
              {copied ? (
                <>
                  <Check size={11} className="text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={11} className="text-zinc-400" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 text-xs font-mono">
        {/* Unary Body Tab */}
        {activeTab === 'body' && (
          <div className="space-y-2">
            {/* Execution Error ONLY inside Body tab */}
            {activeResponse?.error && (() => {
              const parsedErr = formatExecutionError(activeResponse.error, activeResponse.status_code);
              return (
                <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-md text-red-200 font-sans text-xs space-y-2 select-text">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={15} className="text-red-400 flex-shrink-0" />
                      <span className="font-semibold text-red-300 text-xs">{parsedErr.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(activeResponse.error || '');
                        setCopiedError(true);
                        setTimeout(() => setCopiedError(false), 2000);
                      }}
                      className="px-2 py-0.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-[11px] font-mono text-red-300 rounded flex items-center gap-1 transition"
                      title="Copy full error trace"
                    >
                      {copiedError ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>{copiedError ? 'Copied' : 'Copy Trace'}</span>
                    </button>
                  </div>

                  <p className="text-xs text-red-200/90 leading-relaxed font-sans">
                    {parsedErr.summary}
                  </p>

                  {parsedErr.details && (
                    <div className="mt-2 pt-2 border-t border-red-900/40">
                      <div className="text-[10px] uppercase font-mono tracking-wider text-red-400/80 mb-1">
                        Technical Details:
                      </div>
                      <div className="bg-zinc-950/90 p-2.5 rounded border border-red-950 font-mono text-[11px] text-red-300/80 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap break-all select-text">
                        {parsedErr.details}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {formattedBody ? (
              <div className="text-zinc-200 font-mono text-[11px] leading-relaxed select-text overflow-x-auto py-1">
                <FormattedBodyViewer
                  content={formattedBody}
                  format={detectedFormat}
                  searchQuery={searchQuery}
                />
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
                {isStreaming && (
                  <button
                    onClick={stopStreaming}
                    className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition shadow-sm"
                    title="Stop gRPC Stream"
                  >
                    <Square size={9} fill="currentColor" />
                    <span>Stop Stream</span>
                  </button>
                )}
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
                const isOut = msg.direction === 'out';

                return (
                  <div
                    key={msg.id}
                    className={`p-2.5 rounded space-y-1.5 transition select-text border ${
                      isOut
                        ? 'bg-blue-950/20 border-blue-900/40 hover:border-blue-700/60'
                        : 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 border-b border-zinc-800/60 pb-1 select-none">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-bold font-mono ${
                            isOut ? 'text-blue-400' : 'text-emerald-400'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                        {isOut ? (
                          <span className="flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                            <ArrowUpRight size={10} className="text-blue-400" />
                            OUT (SENT)
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                            <ArrowDownLeft size={10} className="text-emerald-400" />
                            IN (RECV)
                          </span>
                        )}
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
                    <div className="bg-zinc-950/80 py-2 rounded border border-zinc-800/50 overflow-x-auto">
                      <FormattedBodyViewer
                        content={formattedMsg}
                        format={msgFormat}
                        searchQuery={searchQuery}
                      />
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
                  className="flex justify-between py-1 border-b border-zinc-900 text-xs"
                >
                  <span className="text-zinc-300 font-semibold">{k}:</span>
                  <span className="text-zinc-400 break-all pl-2 text-right">{v}</span>
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
                      onClick={() => setShowDeleteSavedModal(true)}
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
                <div className="bg-zinc-950/70 py-2.5 rounded border border-zinc-800/60 overflow-x-auto">
                  <FormattedBodyViewer
                    content={formattedSavedBody}
                    format={savedFormat}
                    searchQuery={searchQuery}
                  />
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

      <ConfirmDeleteModal
        isOpen={showDeleteSavedModal}
        type="saved_response"
        isPending={deleteSavedMutation.isPending}
        onConfirm={() => deleteSavedMutation.mutate()}
        onClose={() => setShowDeleteSavedModal(false)}
      />
    </div>
  );
};
