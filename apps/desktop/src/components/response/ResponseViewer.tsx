import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type { Endpoint, SavedResponse } from '@api-lab/api-types';
import {
  Save,
  Clock,
  HardDrive,
  Trash2,
  Search,
  X,
  Copy,
  Check,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
} from 'lucide-react';
import {
  detectResponseFormat,
  formatResponseBody,
} from '../../utils/responseDetector';
import { getGrpcStatusLabel, formatExecutionError } from '../../utils/grpcSpecification';
import {
  formatStreamTimestamp,
  getCompactPayloadPreview,
  filterStreamMessages,
  isLifecyclePayload,
  type MessageDirectionFilter,
} from '../../utils/streamViewer';
import { formatResponseSize, formatElapsedTime } from '../../utils/responseViewerUtils';
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
  } = useAppStore();
  const lastHttpResponse = getHttpResponse(endpoint.id);
  const lastGrpcResponse = getGrpcResponse(endpoint.id);
  const executionInfo = useAppStore((s) => s.executingEndpoints[endpoint.id]);
  const isExecuting = Boolean(executionInfo);

  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isExecuting || !executionInfo?.startTime) {
      setElapsedMs(0);
      return;
    }
    const start = executionInfo.startTime;
    setElapsedMs(Date.now() - start);
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 50);
    return () => clearInterval(interval);
  }, [isExecuting, executionInfo?.startTime]);

  const isGrpc = endpoint.protocol === 'grpc';
  const isStreamRpc =
    isGrpc &&
    Boolean(endpoint.config?.stream_type && endpoint.config.stream_type !== 'unary');

  const [activeTab, setActiveTab] = useState<'body' | 'stream' | 'headers' | 'trailers' | 'saved'>(
    isStreamRpc ? 'stream' : 'body'
  );
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [streamSearchQuery, setStreamSearchQuery] = useState('');
  const [directionFilter, setDirectionFilter] = useState<MessageDirectionFilter>('all');
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(new Set());
  const [showNewMessagesPill, setShowNewMessagesPill] = useState(false);
  const userScrolledDownRef = useRef(false);
  const streamScrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [copiedSaved, setCopiedSaved] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [copiedError, setCopiedError] = useState(false);
  const streamBottomRef = useRef<HTMLDivElement>(null);

  // Sync tab on RPC stream type changes: stream RPCs never show body
  useEffect(() => {
    if (isStreamRpc && activeTab === 'body') {
      setActiveTab('stream');
    } else if (!isStreamRpc && activeTab === 'stream') {
      setActiveTab('body');
    }
  }, [isStreamRpc, activeTab, endpoint.id]);

  // Reset tab state on endpoint switch
  useEffect(() => {
    setExpandedMessageIds(new Set());
    setShowNewMessagesPill(false);
    userScrolledDownRef.current = false;
  }, [endpoint.id]);

  // Auto-scroll stream messages or show new message pill (prepend: newest at top)
  useEffect(() => {
    if (activeTab !== 'stream') return;
    if (userScrolledDownRef.current) {
      setShowNewMessagesPill(true);
    } else {
      streamScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [streamMessages.length, activeTab]);

  const handleStreamScroll = () => {
    const el = streamScrollRef.current;
    if (!el) return;
    const isAtTop = el.scrollTop <= 40;
    userScrolledDownRef.current = !isAtTop;
    if (isAtTop && showNewMessagesPill) {
      setShowNewMessagesPill(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  // Filter stream messages by stream search query & direction filter
  const q = searchQuery.trim().toLowerCase();
  const filteredStreamMessages = filterStreamMessages(
    streamMessages,
    streamSearchQuery,
    directionFilter
  );

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
      {/* Moving Smooth Gradient Progress Bar (Active Theme Follower) */}
      {isExecuting && (
        <div className="relative w-full h-[2px] overflow-hidden bg-zinc-900 flex-shrink-0">
          <div className="response-progress-gradient absolute inset-0 h-full w-full" />
        </div>
      )}

      {/* Unified Compact Header Bar (Compact Style) */}
      <div className="h-10 px-3 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between text-xs select-none flex-shrink-0 gap-3">
        {/* Left: Navigation Tabs */}
        <div className="flex items-center gap-1 sm:gap-2 h-full">
          {!isStreamRpc && (
            <button
              onClick={() => setActiveTab('body')}
              className={`h-full px-2.5 flex items-center gap-1.5 font-medium border-b-2 transition ${
                activeTab === 'body'
                  ? 'border-zinc-200 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>{isGrpc ? 'Response' : 'Body'}</span>
            </button>
          )}

          {isStreamRpc && (
            <button
              onClick={() => setActiveTab('stream')}
              className={`h-full px-2.5 flex items-center gap-1.5 font-medium border-b-2 transition ${
                activeTab === 'stream'
                  ? 'border-zinc-200 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>Responses</span>
              {streamMessages.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-900 text-zinc-400 rounded border border-zinc-800">
                  {streamMessages.length}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => setActiveTab('headers')}
            className={`h-full px-2.5 flex items-center gap-1.5 font-medium border-b-2 transition ${
              activeTab === 'headers'
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>{isHttp ? 'Headers' : 'Metadata'}</span>
            {Object.keys(headersDisplay).length > 0 && (
              <span className="text-[10px] font-mono text-zinc-500">
                ({Object.keys(headersDisplay).length})
              </span>
            )}
          </button>

          {isGrpc && (
            <button
              onClick={() => setActiveTab('trailers')}
              className={`h-full px-2.5 flex items-center gap-1.5 font-medium border-b-2 transition ${
                activeTab === 'trailers'
                  ? 'border-zinc-200 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>Trailers</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('saved')}
            className={`h-full px-2.5 flex items-center gap-1.5 font-medium border-b-2 transition ${
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

        {/* Right: Status Pill, Latency, Size & Compact Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isStreaming && (
            <span className="flex items-center text-[10px] text-white font-semibold bg-blue-600 px-2 py-0.5 rounded shadow-sm tracking-wider uppercase">
              STREAMING
            </span>
          )}

          {isExecuting ? (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-primary/20 text-primary border border-primary/30 inline-flex items-center gap-1.5 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span>{isGrpc ? 'Invoking...' : 'Sending...'}</span>
              </span>
              <span className="text-zinc-600">•</span>
              <span className="flex items-center gap-1 text-zinc-300 font-mono text-[11px]">
                <Clock size={11} className="text-primary animate-spin" />
                <span>{formatElapsedTime(elapsedMs)}</span>
              </span>
            </div>
          ) : activeResponse || streamMessages.length > 0 ? (
            <div className="flex items-center gap-2 text-xs">
              {/* Status Badge */}
              {isHttp && lastHttpResponse ? (
                <span
                  title={lastHttpResponse.status_text}
                  className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] inline-flex items-center gap-1.5 flex-shrink-0 ${
                    lastHttpResponse.status_code >= 200 && lastHttpResponse.status_code < 300
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                      : lastHttpResponse.status_code >= 400
                      ? 'bg-red-950/60 text-red-400 border border-red-800/60'
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
                    {lastHttpResponse.status_text ? ` ${lastHttpResponse.status_text}` : ''}
                  </span>
                </span>
              ) : !isHttp && lastGrpcResponse ? (
                <span
                  title={lastGrpcResponse.status_message}
                  className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] inline-flex items-center gap-1.5 flex-shrink-0 ${
                    lastGrpcResponse.status_code === 0
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                      : 'bg-red-950/60 text-red-400 border border-red-800/60'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      lastGrpcResponse.status_code === 0 ? 'bg-emerald-400' : 'bg-red-400'
                    }`}
                  />
                  <span>
                    {lastGrpcResponse.status_code === 0
                      ? '0 OK'
                      : `[${lastGrpcResponse.status_code}] ${getGrpcStatusLabel(lastGrpcResponse.status_code)}`}
                  </span>
                </span>
              ) : null}

              {/* Time */}
              {activeResponse && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className="flex items-center gap-1 text-zinc-400 font-mono text-[11px]">
                    <Clock size={11} className="text-zinc-500" />
                    <span>{activeResponse.response_time_ms} ms</span>
                  </span>
                </>
              )}

              {/* Size */}
              {activeResponse && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className="flex items-center gap-1 text-zinc-400 font-mono text-[11px]">
                    <HardDrive size={11} className="text-zinc-500" />
                    <span>{formatResponseSize(activeResponse.response_size_bytes)}</span>
                  </span>
                </>
              )}

              {/* Actions Divider */}
              <div className="h-3.5 w-px bg-zinc-800 mx-0.5" />

              {/* Inline Search / Filter */}
              {showSearchInput || searchQuery ? (
                <div className="relative flex items-center">
                  <Search size={11} className="w-3 h-3 text-zinc-500 absolute left-2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    autoFocus
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter..."
                    className="w-28 sm:w-36 bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded py-0.5 pl-6 pr-5 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setShowSearchInput(false);
                    }}
                    className="absolute right-1 text-zinc-500 hover:text-zinc-300 p-0.5"
                    title="Close search"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSearchInput(true)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded transition"
                  title="Filter response"
                >
                  <Search size={12} />
                </button>
              )}

              {/* Copy Body */}
              {!isStreamRpc && formattedBody && (
                <button
                  onClick={handleCopyBody}
                  className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded transition"
                  title="Copy response body"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              )}

              {/* Save Response Button */}
              <button
                onClick={handleSaveCurrent}
                disabled={saveResponseMutation.isPending}
                className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded transition disabled:opacity-50"
                title="Save response to workspace"
              >
                <Save size={12} className="text-primary" />
              </button>
            </div>
          ) : (
            <span className="text-xs text-zinc-500">No response executed yet</span>
          )}

          {saveMessage && (
            <span className="text-[11px] text-emerald-400 font-mono">{saveMessage}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 ${activeTab === 'stream' ? 'overflow-hidden p-0' : 'overflow-y-auto p-3'} text-xs font-mono`}>
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

        {/* Stream Messages Tab (High-Density Compact Style) */}
        {activeTab === 'stream' && (
          <div className="relative flex flex-col h-full">
            {/* Sticky Stream Toolbar */}
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-950 border-b border-zinc-800/80 text-xs flex-shrink-0 select-none">
              <div className="flex items-center gap-2">
                <div className="relative flex items-center w-44">
                  <Search size={11} className="absolute left-2 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    value={streamSearchQuery}
                    onChange={(e) => setStreamSearchQuery(e.target.value)}
                    placeholder="Search"
                    className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 pl-6 pr-6 py-0.5 rounded text-xs focus:outline-none focus:border-zinc-700 placeholder-zinc-500"
                  />
                  {streamSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setStreamSearchQuery('')}
                      className="absolute right-1.5 text-zinc-500 hover:text-zinc-300"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>

                <select
                  value={directionFilter}
                  onChange={(e) => setDirectionFilter(e.target.value as MessageDirectionFilter)}
                  className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded text-xs focus:outline-none cursor-pointer"
                >
                  <option value="all">All Messages</option>
                  <option value="in">Inbound (↓)</option>
                  <option value="out">Outbound (↑)</option>
                </select>

                <button
                  type="button"
                  onClick={clearStreamMessages}
                  disabled={streamMessages.length === 0}
                  className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 text-xs transition px-2 py-0.5 rounded hover:bg-zinc-900 border border-transparent hover:border-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  title="Clear stream messages"
                >
                  <Trash2 size={12} />
                  <span>Clear Messages</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {streamMessages.length > 0 && (
                  <button
                    onClick={handleSaveCurrent}
                    disabled={saveResponseMutation.isPending}
                    className="flex items-center gap-1.5 text-zinc-300 hover:text-white text-xs transition px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 shadow-sm disabled:opacity-50"
                    title="Save stream messages to workspace"
                  >
                    <Save size={12} className="text-primary" />
                    <span>Save Response</span>
                  </button>
                )}
              </div>
            </div>

            {/* Floating New Messages Pill */}
            {showNewMessagesPill && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 z-20">
                <button
                  onClick={() => {
                    streamScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    setShowNewMessagesPill(false);
                    userScrolledDownRef.current = false;
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-full shadow-lg transition select-none"
                >
                  <ArrowUp size={12} />
                  <span>New messages</span>
                </button>
              </div>
            )}

            {/* High Density Flat Messages List */}
            <div
              ref={streamScrollRef}
              onScroll={handleStreamScroll}
              className="flex-1 overflow-y-auto select-text font-mono text-xs"
            >
              {filteredStreamMessages.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs select-none">
                  {isStreaming
                    ? 'Waiting for stream messages...'
                    : streamMessages.length > 0
                    ? 'No stream messages match search'
                    : 'Stream idle. Click Stream to begin receiving messages.'}
                </div>
              ) : (
                filteredStreamMessages.map((msg, idx) => {
                  const isOut = msg.direction === 'out';
                  const isLifecycle = isLifecyclePayload(msg.payload);
                  const isExpanded = expandedMessageIds.has(msg.id);
                  const compactText = getCompactPayloadPreview(msg.payload);
                  const msgFormat = detectResponseFormat(msg.payload);
                  const formattedMsg = formatResponseBody(msg.payload, msgFormat);
                  const isCopied = copiedMsgId === msg.id;

                  return (
                    <div key={msg.id} className="border-b border-zinc-800/60 last:border-b-0">
                      <div
                        onClick={() => !isLifecycle && toggleExpand(msg.id)}
                        className={`flex items-center gap-2.5 py-1.5 px-3 hover:bg-zinc-900/60 transition-colors ${
                          isLifecycle ? 'cursor-default' : 'cursor-pointer select-none group'
                        }`}
                      >
                        {/* Direction / Lifecycle Icon */}
                        {isLifecycle ? (
                          <div className="w-4 h-4 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center justify-center flex-shrink-0">
                            <Info size={10} />
                          </div>
                        ) : isOut ? (
                          <div className="w-4 h-4 rounded bg-amber-950/60 border border-amber-600/40 text-amber-400 flex items-center justify-center flex-shrink-0">
                            <ArrowUp size={10} />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded bg-blue-950/60 border border-blue-600/40 text-blue-400 flex items-center justify-center flex-shrink-0">
                            <ArrowDown size={10} />
                          </div>
                        )}

                        {/* Message Preview */}
                        <div className="flex-1 min-w-0 truncate font-mono text-xs">
                          {isLifecycle ? (
                            <span className="text-zinc-300 font-sans">{compactText}</span>
                          ) : (
                            <span className="text-zinc-300">{compactText}</span>
                          )}
                        </div>

                        {/* Timestamp */}
                        <span className="text-zinc-500 font-mono text-[11px] whitespace-nowrap flex-shrink-0">
                          {formatStreamTimestamp(msg.timestamp)}
                        </span>

                        {/* Expand Chevron */}
                        {!isLifecycle && (
                          <div className="text-zinc-500 group-hover:text-zinc-300 p-0.5 flex-shrink-0">
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </div>
                        )}
                      </div>

                      {/* Expanded View */}
                      {isExpanded && !isLifecycle && (
                        <div className="bg-zinc-950 px-3 py-2 border-t border-zinc-800/60 select-text">
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 pb-1.5 mb-1.5 border-b border-zinc-900">
                            <div className="flex items-center gap-2">
                              <span className="uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400 font-medium border border-zinc-800">
                                {msgFormat}
                              </span>
                              <span className="font-mono text-zinc-500">#{idx + 1}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyStreamMsg(msg.id, formattedMsg);
                              }}
                              className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-850 border border-zinc-800"
                              title="Copy message payload"
                            >
                              {isCopied ? (
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
                          <div className="py-1">
                            <FormattedBodyViewer
                              content={formattedMsg}
                              format={msgFormat}
                              searchQuery={streamSearchQuery}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={streamBottomRef} />
            </div>
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

        {/* Trailers Tab */}
        {activeTab === 'trailers' && (
          <div className="space-y-1 select-text">
            <div className="text-zinc-500 py-6 text-center select-none text-xs">
              No trailers returned
            </div>
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
