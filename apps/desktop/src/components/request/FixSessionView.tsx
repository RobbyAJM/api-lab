import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  Endpoint,
  FixEndpointConfig,
  FixMessageEvent,
  FixTransport,
  VariableResponse,
} from '@api-lab/api-types';
import {
  AlertTriangle,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  Copy,
  Play,
  Radio,
  Save,
  Search,
  Shield,
  SlidersHorizontal,
  Square,
  Trash2,
  WrapText,
  X,
} from 'lucide-react';
import { apiRequest } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { useFixSessionStore } from '../../store/useFixSessionStore';
import { EndpointConflictAlert } from './EndpointConflictAlert';
import { ConflictDiffModal } from './ConflictDiffModal';
import { FixMessageBuilder } from './FixMessageBuilder';
import { FixParsedMessage } from './FixParsedMessage';
import { FixRawEditor } from './FixRawEditor';
import { Select } from '../common/Select';
import { VariableInput } from '../common/VariableInput';
import { loadFixDictionary, type FixDictionary } from '../../utils/fixDictionary';
import {
  formatFixRawAsMultiline,
  formatFixRawAsSingleLine,
  isFixRawMultiline,
} from '../../utils/fixHighlight';
import {
  clampComposerHeightPct,
  getStoredFixComposerHeightPct,
  getStoredFixEditorMode,
  setStoredFixComposerHeightPct,
  setStoredFixEditorMode,
  type FixMessageEditorMode,
} from '../../utils/fixMessageBuilder';
import {
  filterFixMessages,
  formatFixRaw,
  formatFixTimestamp,
  getFixMessageSummary,
  getFixMessageTypeLabel,
  getFixStatusMeta,
  getStoredFixTranscriptOrder,
  hasRawSohDelimiter,
  normalizeFixEndpointConfig,
  orderFixMessages,
  parseFixDraftFields,
  resolveFixMessageTypeLabel,
  setStoredFixTranscriptOrder,
  toFixConnectRequest,
  validateFixDraft,
  type FixTranscriptOrder,
} from '../../utils/fixSession';
import {
  disconnectFixSession,
  sendFixSessionMessage,
  startFixSession,
} from '../../utils/fixSessionManager';
import { getEffectiveEndpointConfig, isConfigDirty } from '../../utils/tabManager';

const TRANSPORT_OPTIONS: Array<{
  value: FixTransport;
  label: string;
}> = [
  { value: 'direct', label: 'Direct TCP' },
  { value: 'stunnel_managed', label: 'Managed stunnel' },
  { value: 'stunnel_external', label: 'External stunnel' },
];

export const FixSessionView: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const queryClient = useQueryClient();
  const {
    activeEnvironmentId,
    setActiveEndpoint,
    setEndpointDraft,
    clearEndpointDraft,
  } = useAppStore();
  const session = useFixSessionStore((state) => state.sessions[endpoint.id]);
  const clearTranscript = useFixSessionStore((state) => state.clearTranscript);

  const draft = useAppStore.getState().endpointDrafts[endpoint.id];
  const initialConfig = normalizeFixEndpointConfig(
    getEffectiveEndpointConfig(endpoint, draft)
  );
  const [config, setConfig] = useState<FixEndpointConfig>(initialConfig);
  const [currentVersion, setCurrentVersion] = useState(endpoint.version);
  const currentVersionRef = useRef(endpoint.version);
  currentVersionRef.current = currentVersion;
  const [activeVariables, setActiveVariables] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [configExpanded, setConfigExpanded] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(config.transport !== 'direct');
  const [editorMode, setEditorMode] = useState<FixMessageEditorMode>(() =>
    getStoredFixEditorMode()
  );
  const [composerHeightPct, setComposerHeightPct] = useState<number>(() =>
    getStoredFixComposerHeightPct()
  );
  const [dictionary, setDictionary] = useState<FixDictionary | null | undefined>(
    undefined
  );
  const [showTransportLogs, setShowTransportLogs] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<'all' | 'in' | 'out'>('all');
  const [showAdmin, setShowAdmin] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageOrder, setMessageOrder] = useState<FixTranscriptOrder>(() =>
    getStoredFixTranscriptOrder()
  );
  const [unseenNewMessages, setUnseenNewMessages] = useState(0);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [conflictModalData, setConflictModalData] = useState<{
    localConfig: FixEndpointConfig;
    remoteEndpoint: Endpoint;
  } | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const workspaceSplitRef = useRef<HTMLDivElement>(null);
  const isResizingComposerRef = useRef(false);
  const followTranscriptRef = useRef(true);
  const previousNewestMessageIdRef = useRef<string | null>(null);

  const statusMeta = getFixStatusMeta(session?.status);
  const isActive = statusMeta.active;
  const canSend = session?.status === 'logged_on';
  const messages = session?.messages || [];
  const newestMessageId = messages[0]?.id || null;
  const transportLogs = session?.transportLogs || [];

  async function resolveVariables(): Promise<Record<string, string>> {
    const activeVars: Record<string, string> = {};
    if (!activeEnvironmentId) return activeVars;
    try {
      const fetched = await queryClient.fetchQuery({
        queryKey: ['variables', activeEnvironmentId],
        queryFn: () =>
          apiRequest<VariableResponse[]>(
            `/environments/${activeEnvironmentId}/variables`
          ),
        staleTime: 5_000,
      });
      for (const variable of fetched) activeVars[variable.key] = variable.value;
    } catch {
      const cached = queryClient.getQueryData<VariableResponse[]>([
        'variables',
        activeEnvironmentId,
      ]);
      for (const variable of cached || []) activeVars[variable.key] = variable.value;
    }
    return activeVars;
  }

  useEffect(() => {
    let cancelled = false;
    resolveVariables().then((variables) => {
      if (!cancelled) setActiveVariables(variables);
    });
    return () => {
      cancelled = true;
    };
  }, [activeEnvironmentId]);

  useEffect(() => {
    let active = true;
    setDictionary(undefined);
    void loadFixDictionary(config.begin_string).then((loaded) => {
      if (active) setDictionary(loaded);
    });
    return () => {
      active = false;
    };
  }, [config.begin_string]);

  useEffect(() => {
    if (isConfigDirty(endpoint.config, config)) {
      setEndpointDraft(endpoint.id, config);
    } else {
      clearEndpointDraft(endpoint.id);
    }
  }, [config, endpoint.config, endpoint.id, setEndpointDraft, clearEndpointDraft]);

  useEffect(() => {
    const previousNewestId = previousNewestMessageIdRef.current;
    previousNewestMessageIdRef.current = newestMessageId;

    if (!newestMessageId) {
      setUnseenNewMessages(0);
      return;
    }
    if (previousNewestId === newestMessageId) return;

    if (followTranscriptRef.current || previousNewestId === null) {
      setUnseenNewMessages(0);
      requestAnimationFrame(() => scrollTranscriptToNewest(messageOrder));
      return;
    }

    const previousMessageIndex = messages.findIndex(
      (message) => message.id === previousNewestId
    );
    const newlyArrived =
      previousMessageIndex > 0 ? previousMessageIndex : messages.length;
    setUnseenNewMessages((current) => current + newlyArrived);
  }, [messages, newestMessageId]);

  useEffect(() => {
    followTranscriptRef.current = true;
    setUnseenNewMessages(0);
    requestAnimationFrame(() => scrollTranscriptToNewest(messageOrder));
  }, [messageOrder]);

  useEffect(() => {
    setUnseenNewMessages(0);
  }, [directionFilter, searchQuery, showAdmin]);

  const filteredMessages = useMemo(
    () =>
      orderFixMessages(
        filterFixMessages(messages, {
          direction: directionFilter,
          query: searchQuery,
          showAdmin,
        }),
        messageOrder
      ),
    [messages, directionFilter, searchQuery, showAdmin, messageOrder]
  );

  const draftValidation = config.message_draft
    ? validateFixDraft(config.message_draft)
    : null;
  const draftFields = useMemo(() => {
    try {
      return parseFixDraftFields(config.message_draft || '');
    } catch {
      return [];
    }
  }, [config.message_draft]);
  const draftMessageType = draftFields.find(([tag]) => tag === '35')?.[1];

  function updateConfig(patch: Partial<FixEndpointConfig>) {
    setConfig((current) => ({ ...current, ...patch }));
    setStatusMessage(null);
  }

  function updateStunnel(patch: Partial<FixEndpointConfig['stunnel']>) {
    setConfig((current) => ({
      ...current,
      stunnel: { ...current.stunnel, ...patch },
    }));
    setStatusMessage(null);
  }

  async function saveChanges(options?: { silent?: boolean }) {
    if (saving) return;
    setSaving(true);
    try {
      let saved: Endpoint;
      try {
        saved = await apiRequest<Endpoint>(`/endpoints/${endpoint.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            version: currentVersionRef.current,
            config,
          }),
        });
      } catch (error: any) {
        if (error?.message?.includes('version mismatch') || error?.status === 409) {
          const latest = await apiRequest<Endpoint>(`/endpoints/${endpoint.id}`);
          setConflictModalData({ localConfig: config, remoteEndpoint: latest });
          setStatusMessage('Conflict: another user saved this FIX session first.');
          return;
        }
        throw error;
      }

      setCurrentVersion(saved.version);
      currentVersionRef.current = saved.version;
      clearEndpointDraft(endpoint.id);
      if (useAppStore.getState().activeEndpointId === endpoint.id) {
        setActiveEndpoint(saved);
      }
      queryClient.setQueryData<Endpoint[]>(
        ['endpoints', endpoint.collection_id],
        (previous) => previous?.map((item) => (item.id === saved.id ? saved : item)) || [saved]
      );
      if (!options?.silent) {
        setStatusMessage('FIX session saved');
      }
    } catch (error: any) {
      setStatusMessage(`Save failed: ${error.message || error}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleForceOverwrite() {
    if (!conflictModalData) return;
    try {
      const saved = await apiRequest<Endpoint>(`/endpoints/${endpoint.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: conflictModalData.remoteEndpoint.version,
          config: conflictModalData.localConfig,
        }),
      });
      setCurrentVersion(saved.version);
      currentVersionRef.current = saved.version;
      clearEndpointDraft(endpoint.id);
      setActiveEndpoint(saved);
      queryClient.setQueryData<Endpoint[]>(
        ['endpoints', endpoint.collection_id],
        (previous) => previous?.map((item) => (item.id === saved.id ? saved : item)) || [saved]
      );
      setConflictModalData(null);
      setStatusMessage('FIX session saved and server changes overwritten');
    } catch (error: any) {
      setStatusMessage(`Overwrite failed: ${error.message || error}`);
    }
  }

  function handleDiscardLocalEdits() {
    if (!conflictModalData) return;
    const remoteConfig = normalizeFixEndpointConfig(
      conflictModalData.remoteEndpoint.config
    );
    setConfig(remoteConfig);
    setCurrentVersion(conflictModalData.remoteEndpoint.version);
    currentVersionRef.current = conflictModalData.remoteEndpoint.version;
    clearEndpointDraft(endpoint.id);
    setActiveEndpoint(conflictModalData.remoteEndpoint);
    setShowAdvanced(remoteConfig.transport !== 'direct');
    setConflictModalData(null);
    setStatusMessage('Loaded the server version');
  }

  async function handleConnect() {
    const variables = await resolveVariables();
    setActiveVariables(variables);
    try {
      startFixSession(endpoint.id, toFixConnectRequest(config), variables);
    } catch (error: any) {
      setStatusMessage(`Connect failed: ${error.message || error}`);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectFixSession(endpoint.id);
    } catch (error: any) {
      setStatusMessage(`Disconnect failed: ${error.message || error}`);
    }
  }

  async function handleSend() {
    const error = validateFixDraft(config.message_draft || '');
    if (error) {
      setStatusMessage(error);
      return;
    }
    if (!canSend) {
      setStatusMessage('Log on before sending an application message.');
      return;
    }
    try {
      const variables = await resolveVariables();
      setActiveVariables(variables);
      await sendFixSessionMessage(
        endpoint.id,
        config.message_draft || '',
        variables
      );
      setStatusMessage(null);
    } catch (sendError: any) {
      setStatusMessage(`Send failed: ${sendError.message || sendError}`);
    }
  }

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveChanges();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        void handleSend();
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  });

  function toggleMessage(key: string) {
    setExpandedMessages((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function copyMessage(key: string, raw: string) {
    try {
      await navigator.clipboard.writeText(raw);
      setCopiedMessage(key);
      window.setTimeout(() => setCopiedMessage(null), 1500);
    } catch {
      setStatusMessage('Clipboard access is unavailable.');
    }
  }

  function scrollTranscriptToNewest(order: FixTranscriptOrder = messageOrder) {
    const element = transcriptScrollRef.current;
    if (!element) return;
    element.scrollTo({
      top: order === 'desc' ? 0 : element.scrollHeight,
      behavior: 'auto',
    });
  }

  function handleTranscriptScroll() {
    const element = transcriptScrollRef.current;
    if (!element) return;
    const atNewest =
      messageOrder === 'desc'
        ? element.scrollTop <= 24
        : element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    followTranscriptRef.current = atNewest;
    if (atNewest && unseenNewMessages > 0) {
      setUnseenNewMessages(0);
    }
  }

  function handleToggleMessageOrder() {
    const nextOrder: FixTranscriptOrder = messageOrder === 'desc' ? 'asc' : 'desc';
    setMessageOrder(nextOrder);
    setStoredFixTranscriptOrder(nextOrder);
  }

  function handleJumpToNewest() {
    followTranscriptRef.current = true;
    setUnseenNewMessages(0);
    scrollTranscriptToNewest();
  }

  function handleEditorModeChange(mode: FixMessageEditorMode) {
    setEditorMode(mode);
    setStoredFixEditorMode(mode);
  }

  function startComposerResize(event: React.MouseEvent) {
    event.preventDefault();
    isResizingComposerRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingComposerRef.current) return;
      const container = workspaceSplitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.height <= 0) return;
      const nextPct = clampComposerHeightPct(
        ((moveEvent.clientY - rect.top) / rect.height) * 100
      );
      setComposerHeightPct(nextPct);
    };

    const onMouseUp = () => {
      isResizingComposerRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setComposerHeightPct((current) => {
        setStoredFixComposerHeightPct(current);
        return current;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  const latestTransportLog = transportLogs[transportLogs.length - 1];
  const isStunnel = config.transport !== 'direct';
  const draftHasRawSoh = hasRawSohDelimiter(config.message_draft || '');
  const draftIsMultiline = isFixRawMultiline(config.message_draft || '');
  const draftMessageLabel = draftMessageType
    ? resolveFixMessageTypeLabel(draftMessageType, dictionary)
    : '';

  const editorModeToggle = (
    <div className="flex items-center gap-2 flex-shrink-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        Application Message
      </span>
      <div
        role="group"
        aria-label="FIX message editor mode"
        className="flex items-center h-5 border border-zinc-800 rounded-sm overflow-hidden"
      >
        <button
          type="button"
          onClick={() => handleEditorModeChange('raw')}
          aria-pressed={editorMode === 'raw'}
          title="Raw FIX wire / pipe-delimited text editor"
          className={`h-full px-2 inline-flex items-center gap-1 text-[9px] font-mono uppercase transition ${
            editorMode === 'raw'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Code2 size={9} />
          Raw
        </button>
        <button
          type="button"
          onClick={() => handleEditorModeChange('advanced')}
          aria-pressed={editorMode === 'advanced'}
          title="Dictionary-driven structured FIX message builder"
          className={`h-full px-2 inline-flex items-center gap-1 text-[9px] font-mono uppercase transition ${
            editorMode === 'advanced'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <SlidersHorizontal size={9} />
          Advanced
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-zinc-950">
      <header className="border-b border-zinc-800/80 bg-zinc-950 flex-shrink-0">
        <div className="flex items-center gap-3 px-3 h-9 border-b border-zinc-900">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-5 px-1.5 inline-flex items-center gap-1 rounded-sm border border-blue-800/70 bg-blue-950/40 text-blue-300 font-mono text-[10px] font-bold tracking-wider">
              <Radio size={10} />
              FIX
            </span>
            <span className="text-xs font-semibold text-zinc-200 truncate">
              {endpoint.name}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono hidden xl:inline">
              {config.begin_string}
            </span>
          </div>

          <EndpointConflictAlert endpointId={endpoint.id} />

          <span
            className={`inline-flex flex-shrink-0 items-center gap-1.5 h-5 px-2 rounded-sm border font-mono text-[10px] select-none ${statusMeta.className}`}
            title={session?.detail || statusMeta.label}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClassName}`} />
            {statusMeta.label}
          </span>

          {statusMessage && (
            <span
              className="text-[10px] text-zinc-400 font-mono truncate max-w-[300px]"
              title={statusMessage}
            >
              {statusMessage}
            </span>
          )}

          <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfigExpanded((open) => !open)}
              aria-expanded={configExpanded}
              className="h-6 px-2 inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 transition"
              title={
                configExpanded
                  ? 'Collapse session configuration to maximize message workspace'
                  : 'Expand session configuration'
              }
            >
              {configExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              Config
            </button>
            <button
              type="button"
              onClick={() => void saveChanges()}
              disabled={saving}
              className="h-6 px-2 inline-flex items-center gap-1 rounded-sm border border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-[10px] font-medium text-zinc-300 disabled:opacity-50 transition"
              title="Save FIX session configuration (Ctrl+S)"
            >
              <Save size={11} />
              {saving ? 'Saving' : 'Save'}
            </button>
            {isActive ? (
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                className="h-6 px-2.5 inline-flex items-center gap-1 rounded-sm border border-red-800/70 bg-red-950/40 hover:bg-red-950/70 text-[10px] font-semibold text-red-300 transition"
                title="Send Logout and disconnect"
              >
                <Square size={10} fill="currentColor" />
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleConnect()}
                className="h-6 px-2.5 inline-flex items-center gap-1 rounded-sm border border-emerald-700/70 bg-emerald-950/50 hover:bg-emerald-900/60 text-[10px] font-semibold text-emerald-300 transition"
                title="Connect and send Logon"
              >
                <Play size={10} fill="currentColor" />
                Connect
              </button>
            )}
          </div>
        </div>

        {configExpanded ? (
          <>
            <div className="grid grid-cols-[minmax(0,1.5fr)_64px_100px_minmax(0,1fr)_minmax(0,1fr)_68px] gap-x-2 gap-y-1.5 px-3 pt-2">
          <ConfigField label="Host">
            <VariableInput
              value={config.host}
              onChange={(host) => updateConfig({ host })}
              variables={activeVariables}
              placeholder="fix.example.com or {{FIX_HOST}}"
              className="h-7 w-full rounded-sm border border-zinc-800 bg-zinc-900/70"
            />
          </ConfigField>
          <ConfigField label="Port">
            <VariableInput
              value={config.port}
              onChange={(port) => updateConfig({ port })}
              variables={activeVariables}
              placeholder="9876"
              className="h-7 w-full rounded-sm border border-zinc-800 bg-zinc-900/70"
            />
          </ConfigField>
          <ConfigField label="BeginString">
            <Select
              value={config.begin_string}
              onChange={(begin_string) => updateConfig({ begin_string })}
              options={[
                { value: 'FIX.4.2', label: 'FIX 4.2' },
                { value: 'FIX.4.4', label: 'FIX 4.4' },
              ]}
              size="xs"
              fontMono
              className="w-full"
            />
          </ConfigField>
          <ConfigField label="SenderCompID">
            <VariableInput
              value={config.sender_comp_id}
              onChange={(sender_comp_id) => updateConfig({ sender_comp_id })}
              variables={activeVariables}
              placeholder="CLIENT"
              className="h-7 w-full rounded-sm border border-zinc-800 bg-zinc-900/70"
            />
          </ConfigField>
          <ConfigField label="TargetCompID">
            <VariableInput
              value={config.target_comp_id}
              onChange={(target_comp_id) => updateConfig({ target_comp_id })}
              variables={activeVariables}
              placeholder="SERVER"
              className="h-7 w-full rounded-sm border border-zinc-800 bg-zinc-900/70"
            />
          </ConfigField>
          <ConfigField label="Heartbeat">
            <div className="flex items-center h-7 border border-zinc-800 bg-zinc-900/70 rounded-sm">
              <input
                type="number"
                min={1}
                max={3600}
                value={config.heartbeat_seconds}
                onChange={(event) =>
                  updateConfig({ heartbeat_seconds: Number(event.target.value) })
                }
                className="w-full bg-transparent px-2 text-xs font-mono text-zinc-200 focus:outline-none"
              />
              <span className="pr-1.5 text-[9px] text-zinc-500 font-mono">s</span>
            </div>
          </ConfigField>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px_auto] gap-x-2 gap-y-1.5 px-3 pt-1.5 pb-2 items-end">
          <ConfigField label="Username">
            <VariableInput
              value={config.username}
              onChange={(username) => updateConfig({ username })}
              variables={activeVariables}
              placeholder="{{FIX_USERNAME}}"
              className="h-7 w-full rounded-sm border border-zinc-800 bg-zinc-900/70"
            />
          </ConfigField>
          <ConfigField label={passwordLabel(config.password)}>
            <VariableInput
              value={config.password}
              onChange={(password) => updateConfig({ password })}
              variables={activeVariables}
              placeholder="{{FIX_PASSWORD}}"
              maskValue
              className="h-7 w-full rounded-sm border border-zinc-800 bg-zinc-900/70"
            />
          </ConfigField>
          <ConfigField label="Transport">
            <Select
              value={config.transport}
              onChange={(transport) => {
                updateConfig({ transport });
                setShowAdvanced(transport !== 'direct');
              }}
              options={TRANSPORT_OPTIONS}
              size="xs"
              fontMono
              className="w-full"
            />
          </ConfigField>
          <div className="flex items-center gap-2 h-7">
            <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 select-none cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={config.reset_seq_num_on_logon}
                onChange={(event) =>
                  updateConfig({ reset_seq_num_on_logon: event.target.checked })
                }
                className="accent-primary"
              />
              Reset seq
            </label>
            {isStunnel && (
              <button
                type="button"
                onClick={() => setShowAdvanced((open) => !open)}
                className={`h-7 px-2 inline-flex items-center gap-1 rounded-sm border text-[10px] transition ${
                  showAdvanced
                    ? 'border-zinc-700 bg-zinc-850 text-zinc-200'
                    : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:text-zinc-200'
                }`}
                aria-expanded={showAdvanced}
              >
                <Shield size={11} className="text-emerald-400" />
                TLS Setup
                {showAdvanced ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
            )}
          </div>
        </div>

        {showAdvanced && isStunnel && (
          <div className="border-t border-zinc-900 bg-zinc-900/30 px-3 py-2 space-y-2">
            <div
              className={`grid gap-2 ${
                config.transport === 'stunnel_managed'
                  ? 'grid-cols-[minmax(0,1.3fr)_minmax(0,90px)_minmax(0,90px)]'
                  : 'grid-cols-[minmax(0,1fr)_minmax(0,120px)]'
              }`}
            >
              {config.transport === 'stunnel_managed' && (
                <ConfigField label="stunnel Executable">
                  <VariableInput
                    value={config.stunnel.executable}
                    onChange={(executable) => updateStunnel({ executable })}
                    variables={activeVariables}
                    placeholder="stunnel (PATH) or {{STUNNEL_BIN}}"
                    className="h-7 w-full rounded-sm border border-zinc-800 bg-zinc-950"
                  />
                </ConfigField>
              )}
              <ConfigField label="Local Host">
                <VariableInput
                  value={config.stunnel.local_host}
                  onChange={(local_host) => updateStunnel({ local_host })}
                  variables={activeVariables}
                  placeholder="127.0.0.1"
                  className="h-7 w-full rounded-sm border border-zinc-800 bg-zinc-950"
                />
              </ConfigField>
              <ConfigField
                label={
                  config.transport === 'stunnel_managed'
                    ? 'Local Port (auto)'
                    : 'Local Port'
                }
              >
                <VariableInput
                  value={config.stunnel.local_port}
                  onChange={(local_port) => updateStunnel({ local_port })}
                  variables={activeVariables}
                  placeholder={
                    config.transport === 'stunnel_managed' ? 'auto' : '12345'
                  }
                  className="h-7 w-full rounded-sm border border-zinc-800 bg-zinc-950"
                />
              </ConfigField>
            </div>

            {config.transport === 'stunnel_managed' ? (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end">
                  <ConfigField label="CA File">
                    <VariableInput
                      value={config.stunnel.ca_file}
                      onChange={(ca_file) => updateStunnel({ ca_file })}
                      variables={activeVariables}
                      placeholder="System roots or {{FIX_CA_FILE}}"
                      className="h-7 w-full rounded-sm border border-zinc-800 bg-zinc-950"
                    />
                  </ConfigField>
                  <ConfigField label="Client Certificate">
                    <VariableInput
                      value={config.stunnel.client_cert_file}
                      onChange={(client_cert_file) =>
                        updateStunnel({ client_cert_file })
                      }
                      variables={activeVariables}
                      placeholder="Optional client cert"
                      className="h-7 w-full rounded-sm border border-zinc-800 bg-zinc-950"
                    />
                  </ConfigField>
                  <ConfigField label="Client Key">
                    <VariableInput
                      value={config.stunnel.client_key_file}
                      onChange={(client_key_file) =>
                        updateStunnel({ client_key_file })
                      }
                      variables={activeVariables}
                      placeholder="Optional private key"
                      className="h-7 w-full rounded-sm border border-zinc-800 bg-zinc-950"
                    />
                  </ConfigField>
                  <label className="h-7 flex items-center gap-1.5 px-2 border border-zinc-800 rounded-sm bg-zinc-950 text-[10px] text-zinc-300 whitespace-nowrap select-none">
                    <input
                      type="checkbox"
                      checked={config.stunnel.verify_peer}
                      onChange={(event) =>
                        updateStunnel({ verify_peer: event.target.checked })
                      }
                      className="accent-primary"
                    />
                    Verify peer
                  </label>
                </div>
                <p
                  className={`text-[10px] leading-relaxed ${
                    config.stunnel.verify_peer ? 'text-zinc-500' : 'text-amber-400/80'
                  }`}
                >
                  API Lab starts one stunnel process per connection. The FIX engine
                  connects through the loopback listener; certificate paths are resolved
                  from the active environment.
                  {!config.stunnel.verify_peer &&
                    ' Peer certificate verification is disabled for this session.'}
                </p>
              </>
            ) : (
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Start stunnel separately and point the local accept address here. API Lab
                never starts or stops your external stunnel process. Configure the remote
                counterparty and TLS certificates inside stunnel; the Host and Port fields
                above remain session metadata in this mode.
              </p>
            )}
          </div>
        )}

        {config.transport === 'direct' && (
          <div className="flex items-center gap-1.5 border-t border-zinc-900 px-3 py-1 text-[10px] text-zinc-500">
            <Shield size={10} className="text-zinc-600 flex-shrink-0" />
            Direct TCP is unencrypted. Use stunnel transport for TLS.
          </div>
        )}
          </>
        ) : (
          <div className="flex items-center gap-2 px-3 h-7 bg-zinc-900/25 text-[10px] font-mono text-zinc-400">
            <span className="truncate">
              {config.host || '127.0.0.1'}:{config.port || '—'}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-300 flex-shrink-0">{config.begin_string}</span>
            <span className="text-zinc-600">·</span>
            <span className="truncate text-zinc-300">
              {config.sender_comp_id || '—'} → {config.target_comp_id || '—'}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500 flex-shrink-0">
              {TRANSPORT_OPTIONS.find((opt) => opt.value === config.transport)?.label ||
                config.transport}
            </span>
          </div>
        )}

        {session?.error && (
          <div className="flex items-start gap-2 border-t border-red-900/50 bg-red-950/25 px-3 py-1.5 text-[11px] text-red-200">
            <AlertTriangle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
            <span className="font-mono break-words">{session.error}</span>
          </div>
        )}

        {transportLogs.length > 0 && (
          <div className="border-t border-zinc-900 bg-zinc-900/25">
            <button
              type="button"
              onClick={() => setShowTransportLogs((open) => !open)}
              className="w-full h-6 px-3 flex items-center gap-2 text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              {showTransportLogs ? (
                <ChevronDown size={11} />
              ) : (
                <ChevronRight size={11} />
              )}
              <span className="font-semibold uppercase tracking-wide">Transport</span>
              <span className="font-mono text-zinc-600">{transportLogs.length}</span>
              {latestTransportLog && !showTransportLogs && (
                <span
                  className={`ml-1 truncate font-mono ${transportLevelClass(
                    latestTransportLog.level
                  )}`}
                >
                  {latestTransportLog.detail}
                </span>
              )}
            </button>
            {showTransportLogs && (
              <div className="max-h-28 overflow-y-auto border-t border-zinc-900 font-mono text-[10px]">
                {transportLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex gap-2 px-3 py-1 border-b border-zinc-900/60 last:border-b-0"
                  >
                    <span className="text-zinc-600 flex-shrink-0">
                      {formatFixTimestamp(entry.timestamp)}
                    </span>
                    <span className={transportLevelClass(entry.level)}>
                      {entry.detail}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      <div
        ref={workspaceSplitRef}
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
      >
        {editorMode === 'raw' ? (
          <section className="border-b border-zinc-800/80 bg-zinc-900/20 flex-shrink-0">
            <div className="flex items-center gap-2 h-8 px-3 border-b border-zinc-900">
              {editorModeToggle}
              <span className="text-[10px] font-mono text-zinc-500 truncate">
                header + checksum generated · {'{{VARIABLE}}'} resolved on send
              </span>
              <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                {draftHasRawSoh && (
                  <button
                    type="button"
                    onClick={() =>
                      updateConfig({
                        message_draft: formatFixRaw(config.message_draft || '', '|'),
                      })
                    }
                    className="h-5 px-1.5 rounded-sm border border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 text-[9px] font-mono text-zinc-300 transition"
                    title="Replace raw SOH (0x01) bytes with readable '|' delimiters"
                  >
                    Format |
                  </button>
                )}
                {(config.message_draft || '').trim() !== '' && (
                  <button
                    type="button"
                    onClick={() =>
                      updateConfig({
                        message_draft: draftIsMultiline
                          ? formatFixRawAsSingleLine(config.message_draft || '')
                          : formatFixRawAsMultiline(config.message_draft || ''),
                      })
                    }
                    className="h-5 px-1.5 inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 text-[9px] font-mono text-zinc-300 transition"
                    title={
                      draftIsMultiline
                        ? "Collapse into a single '|'-delimited line"
                        : 'Format as one tag=value field per line'
                    }
                  >
                    {draftIsMultiline ? (
                      <>
                        <AlignLeft size={9} />
                        One-line
                      </>
                    ) : (
                      <>
                        <WrapText size={9} />
                        Multiline
                      </>
                    )}
                  </button>
                )}
                <span className="text-[10px] font-mono text-zinc-400">
                  {draftMessageType
                    ? `${draftMessageType} · ${draftMessageLabel}`
                    : '35= required'}
                </span>
              </div>
            </div>
            <div className="flex items-stretch min-h-[58px] border-l border-blue-800/40">
              <FixRawEditor
                value={config.message_draft || ''}
                onChange={(message_draft) => updateConfig({ message_draft })}
                dictionary={dictionary}
                variables={activeVariables}
                placeholder="35=D|11=ORDER-1|55=AAPL|54=1|38=10|40=2"
                ariaLabel="FIX application message"
              />
              <div className="w-[164px] flex-shrink-0 border-l border-zinc-900 px-2 py-1.5 flex flex-col justify-between">
                <div className="text-[10px] text-zinc-500 font-mono">
                  {draftFields.length} field{draftFields.length === 1 ? '' : 's'}
                  {draftValidation && (
                    <span
                      className="block text-amber-400/80 truncate"
                      title={draftValidation}
                    >
                      {draftValidation}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!canSend || Boolean(draftValidation)}
                  className="h-7 mt-1 inline-flex items-center justify-center gap-1.5 rounded-sm border border-blue-700/60 bg-blue-950/50 hover:bg-blue-900/60 text-[10px] font-semibold text-blue-200 disabled:opacity-35 disabled:cursor-not-allowed transition"
                  title={canSend ? 'Send message (Ctrl+Enter)' : 'Log on to send'}
                >
                  <ArrowUp size={11} />
                  Send
                </button>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section
              style={{ height: `${composerHeightPct}%` }}
              className="flex flex-col min-h-[170px] overflow-hidden bg-zinc-900/20 flex-shrink-0"
            >
              <FixMessageBuilder
                rawDraft={config.message_draft || ''}
                onDraftChange={(message_draft) => updateConfig({ message_draft })}
                config={config}
                dictionary={dictionary}
                activeVariables={activeVariables}
                canSend={canSend}
                onSend={() => void handleSend()}
                onSwitchToRaw={() => handleEditorModeChange('raw')}
                modeToggle={editorModeToggle}
              />
            </section>
            <div
              onMouseDown={startComposerResize}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize message builder and session transcript"
              className="h-1.5 bg-zinc-900/90 border-y border-zinc-800/80 hover:bg-zinc-800 cursor-row-resize transition flex items-center justify-center group flex-shrink-0 select-none"
              title="Drag to resize Application Message and Session Transcript panels"
            >
              <div className="w-8 h-0.5 rounded-full bg-zinc-700 group-hover:bg-zinc-400 transition" />
            </div>
          </>
        )}

        <section className="flex-1 flex flex-col min-h-[140px] bg-zinc-950">
        <div className="h-8 flex items-center gap-2 px-3 border-b border-zinc-800/80 bg-zinc-950 flex-shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Session Transcript
          </span>
          <span className="text-[10px] font-mono text-zinc-600">
            {filteredMessages.length}/{messages.length}
          </span>

          <div className="flex items-center h-5 border border-zinc-800 rounded-sm overflow-hidden">
            {(['all', 'in', 'out'] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                onClick={() => setDirectionFilter(direction)}
                className={`h-full px-2 text-[9px] font-mono uppercase ${
                  directionFilter === direction
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {direction}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1 text-[10px] text-zinc-500 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={showAdmin}
              onChange={(event) => setShowAdmin(event.target.checked)}
              className="accent-primary"
            />
            Admin
          </label>

          <div className="relative w-48">
            <Search
              size={11}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600"
            />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Filter tags or values"
              className="w-full h-5 rounded-sm border border-zinc-800 bg-zinc-900/60 pl-6 pr-5 text-[10px] font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300"
                title="Clear filter"
              >
                <X size={10} />
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {unseenNewMessages > 0 && (
              <button
                type="button"
                onClick={handleJumpToNewest}
                className="inline-flex h-5 items-center gap-1 rounded-sm border border-blue-800/60 bg-blue-950/30 px-1.5 text-[9px] font-medium text-blue-300 transition hover:bg-blue-950/60"
                title={
                  messageOrder === 'desc'
                    ? 'New messages above. Jump to newest.'
                    : 'New messages below. Jump to newest.'
                }
                aria-label={`Jump to newest messages, ${unseenNewMessages} new`}
              >
                {messageOrder === 'desc' ? (
                  <ArrowUp size={9} />
                ) : (
                  <ArrowDown size={9} />
                )}
                {unseenNewMessages} new
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleMessageOrder}
              className="inline-flex h-5 items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900/60 px-1.5 text-[9px] font-mono text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
              title={
                messageOrder === 'desc'
                  ? 'Newest messages first. Switch to oldest first.'
                  : 'Oldest messages first. Switch to newest first.'
              }
              aria-label={
                messageOrder === 'desc'
                  ? 'Message order: newest first. Switch to oldest first.'
                  : 'Message order: oldest first. Switch to newest first.'
              }
            >
              {messageOrder === 'desc' ? (
                <ArrowDown size={9} />
              ) : (
                <ArrowUp size={9} />
              )}
              {messageOrder === 'desc' ? 'Newest' : 'Oldest'}
            </button>
            <button
              type="button"
              onClick={() => clearTranscript(endpoint.id)}
              disabled={messages.length === 0 && transportLogs.length === 0}
              className="p-1 text-zinc-600 hover:text-zinc-300 disabled:opacity-30"
              title="Clear local transcript"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        <div
          ref={transcriptScrollRef}
          onScroll={handleTranscriptScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden font-mono text-xs"
        >
          {filteredMessages.length === 0 ? (
            <div className="h-full min-h-32 flex flex-col items-center justify-center gap-2 text-zinc-600 select-none">
              <Radio size={20} className="text-zinc-700" />
              <p className="text-[11px]">
                {messages.length === 0
                  ? 'Connect to begin a FIX session.'
                  : 'No messages match the current filters.'}
              </p>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDirectionFilter('all');
                    setSearchQuery('');
                    setShowAdmin(true);
                  }}
                  className="text-[10px] text-blue-400 hover:text-blue-300"
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            filteredMessages.map((message) => (
              <TranscriptRow
                key={message.id}
                message={message}
                expanded={expandedMessages.has(message.id)}
                copied={copiedMessage === message.id}
                onToggle={() => toggleMessage(message.id)}
                onCopy={() => void copyMessage(message.id, message.raw)}
              />
            ))
          )}
        </div>
      </section>
      </div>

      <ConflictDiffModal
        isOpen={Boolean(conflictModalData)}
        localEndpoint={endpoint}
        remoteEndpoint={conflictModalData?.remoteEndpoint || endpoint}
        localConfig={conflictModalData?.localConfig || config}
        onOverwrite={() => void handleForceOverwrite()}
        onDiscardLocal={handleDiscardLocalEdits}
        onClose={() => setConflictModalData(null)}
      />
    </div>
  );
};

function ConfigField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="min-w-0 block">
      <span className="block text-[9px] uppercase tracking-wider text-zinc-500 mb-0.5 truncate">
        {label}
      </span>
      {children}
    </label>
  );
}

function TranscriptRow({
  message,
  expanded,
  copied,
  onToggle,
  onCopy,
}: {
  message: FixMessageEvent;
  expanded: boolean;
  copied: boolean;
  onToggle: () => void;
  onCopy: () => void;
}) {
  const isOutbound = message.direction === 'out';
  const summary = getFixMessageSummary(message);
  const preview = message.raw
    .replace(/\u0001/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <div className="border-b border-zinc-900/80 last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
        className="flex items-center gap-2.5 min-h-7 px-3 hover:bg-zinc-900/45 cursor-pointer outline-none focus-visible:bg-zinc-900/60"
      >
        <span className="w-[74px] flex-shrink-0 text-[10px] text-zinc-600 tabular-nums">
          {formatFixTimestamp(message.timestamp)}
        </span>
        <span
          className={`w-4 h-4 flex items-center justify-center flex-shrink-0 rounded-sm border ${
            isOutbound
              ? 'border-amber-700/50 bg-amber-950/40 text-amber-400'
              : 'border-blue-700/50 bg-blue-950/40 text-blue-300'
          }`}
          title={isOutbound ? 'Outbound' : 'Inbound'}
        >
          {isOutbound ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
        </span>
        <span
          className={`w-8 flex-shrink-0 text-[9px] font-bold px-1 py-0.5 text-center rounded-sm border ${
            message.is_admin
              ? 'border-zinc-800 bg-zinc-900 text-zinc-500'
              : 'border-blue-900/60 bg-blue-950/25 text-blue-300'
          }`}
          title={getFixMessageTypeLabel(message.message_type)}
        >
          {message.message_type}
        </span>
        <span
          className={`w-[220px] flex-shrink-0 truncate ${
            message.is_admin ? 'text-zinc-500' : 'text-zinc-300'
          }`}
        >
          {summary}
        </span>
        <span className="flex-1 min-w-0 truncate text-[11px] text-zinc-600">
          {preview}
        </span>
        <span className="w-10 text-right flex-shrink-0 text-[10px] text-zinc-600 tabular-nums">
          {message.sequence_number ?? '—'}
        </span>
        {expanded ? (
          <ChevronDown size={12} className="text-zinc-600 flex-shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-zinc-600 flex-shrink-0" />
        )}
      </div>

      {expanded && (
        <div className="bg-zinc-900/30 border-t border-zinc-900">
          <div className="flex items-center justify-between px-3 py-1.5">
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              <span className="uppercase font-semibold text-zinc-400">
                {getFixMessageTypeLabel(message.message_type)}
              </span>
              <span>{message.fields.length} fields</span>
              {message.is_admin && (
                <span className="px-1 rounded-sm border border-zinc-800 text-zinc-500">
                  admin
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCopy();
              }}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-sm border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200"
            >
              {copied ? (
                <>
                  <Check size={10} className="text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={10} />
                  Copy raw
                </>
              )}
            </button>
          </div>
          <FixParsedMessage message={message} />
        </div>
      )}
    </div>
  );
}

function passwordLabel(password: string): string {
  if (!password) return 'Password';
  if (/\{\{[A-Za-z0-9_]+\}\}/.test(password)) return 'Password · env';
  return 'Password · stored with item';
}

function transportLevelClass(level: 'info' | 'warn' | 'error'): string {
  if (level === 'error') return 'text-red-300';
  if (level === 'warn') return 'text-amber-300';
  return 'text-zinc-500';
}
