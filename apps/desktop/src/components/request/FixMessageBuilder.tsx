import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FixEndpointConfig } from '@api-lab/api-types';
import {
  AlertTriangle,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Layers,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type { FixDictionary, FixFieldDefinition } from '../../utils/fixDictionary';
import {
  getFixFieldReference,
  type FixFieldReference,
} from '../../utils/fixParsedMessage';
import {
  buildBuilderEntrySummary,
  buildFixEnvelopePreview,
  changeBuilderMsgType,
  createEmptyBuilderDraft,
  createEmptyGroupEntry,
  createFixGroupEntryId,
  formatFixUtcDate,
  formatFixUtcTime,
  formatFixUtcTimestamp,
  generateFixFieldId,
  getFixFieldPlaceholder,
  getFixMessageSchema,
  getFixTemporalKind,
  hydrateBuilderDraftFromRaw,
  isIdLikeFixField,
  searchAddableSchemaMembers,
  searchFixApplicationMessages,
  serializeBuilderDraft,
  validateBuilderDraft,
  type FixAddableMemberOption,
  type FixBuilderDraft,
  type FixBuilderField,
  type FixBuilderGroup,
  type FixBuilderGroupEntry,
  type FixSchemaField,
  type FixSchemaGroup,
} from '../../utils/fixMessageBuilder';
import { formatFixRaw } from '../../utils/fixSession';
import { VariableInput } from '../common/VariableInput';
import {
  FieldReferenceButton,
  FieldReferencePopover,
} from './FixFieldReferencePopover';
import {
  FixSearchableCombobox,
  type FixComboboxOption,
} from './FixSearchableCombobox';

export interface FixMessageBuilderProps {
  rawDraft: string;
  onDraftChange: (nextRaw: string) => void;
  config: FixEndpointConfig;
  dictionary: FixDictionary | null | undefined;
  activeVariables: Record<string, string>;
  canSend: boolean;
  onSend: () => void;
  onSwitchToRaw: () => void;
  modeToggle: React.ReactNode;
}

interface ActiveFieldRefPopover {
  key: string;
  reference: FixFieldReference;
  anchor: DOMRect;
  onSelectEnumValue?: (value: string) => void;
}

export const FixMessageBuilder: React.FC<FixMessageBuilderProps> = ({
  rawDraft,
  onDraftChange,
  config,
  dictionary,
  activeVariables,
  canSend,
  onSend,
  onSwitchToRaw,
  modeToggle,
}) => {
  const [draft, setDraft] = useState<FixBuilderDraft>(() =>
    hydrateBuilderDraftFromRaw(rawDraft, dictionary)
  );
  const [showEnvelope, setShowEnvelope] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedEntries, setCollapsedEntries] = useState<Set<string>>(new Set());
  const [copiedWire, setCopiedWire] = useState(false);
  const [activePopover, setActivePopover] = useState<ActiveFieldRefPopover | null>(
    null
  );

  // Track the last draft we pushed outward so our own edits do not re-hydrate
  // and wipe empty starter rows or newly added blank optional rows.
  const lastEmittedRawRef = useRef<string | null>(null);
  const lastDictionaryRef = useRef<FixDictionary | null | undefined>(dictionary);

  useEffect(() => {
    const dictionaryChanged = lastDictionaryRef.current !== dictionary;
    lastDictionaryRef.current = dictionary;

    if (!dictionaryChanged && lastEmittedRawRef.current === rawDraft) {
      return;
    }

    lastEmittedRawRef.current = rawDraft;
    setDraft(hydrateBuilderDraftFromRaw(rawDraft, dictionary));
  }, [rawDraft, dictionary]);

  const schema = useMemo(
    () => (dictionary && draft.msgType ? getFixMessageSchema(dictionary, draft.msgType) : null),
    [dictionary, draft.msgType]
  );

  const validation = useMemo(
    () => validateBuilderDraft(draft, dictionary),
    [draft, dictionary]
  );

  const serializedWire = useMemo(
    () => serializeBuilderDraft(draft, dictionary),
    [draft, dictionary]
  );

  const wirePreview = useMemo(() => {
    if (!serializedWire) return '';
    return formatFixRaw(serializedWire, '|').replace(
      /(^|\|)(554|925)=[^|]*/g,
      '$1$2=********'
    );
  }, [serializedWire]);

  const wireFieldCount = useMemo(() => {
    if (!serializedWire) return 0;
    return serializedWire.split('|').filter(Boolean).length;
  }, [serializedWire]);

  const envelopePreview = useMemo(
    () => buildFixEnvelopePreview(config, draft.strippedEnvelopeFields),
    [config, draft.strippedEnvelopeFields]
  );

  const missingTopTagSet = useMemo(() => {
    const set = new Set<number>();
    for (const issue of validation.missingRequired) {
      if (!issue.context) set.add(issue.tag);
    }
    return set;
  }, [validation.missingRequired]);

  const commitDraft = useCallback(
    (updater: (current: FixBuilderDraft) => FixBuilderDraft) => {
      setDraft((current) => {
        const next = updater(current);
        const serialized = serializeBuilderDraft(next, dictionary);
        lastEmittedRawRef.current = serialized;
        onDraftChange(serialized);
        return next;
      });
    },
    [dictionary, onDraftChange]
  );

  const handleSelectMsgType = useCallback(
    (option: FixComboboxOption) => {
      if (!dictionary) return;
      commitDraft((current) => changeBuilderMsgType(current, option.value, dictionary));
    },
    [commitDraft, dictionary]
  );

  const handleResetTemplate = useCallback(() => {
    if (!dictionary || !draft.msgType) return;
    commitDraft(() => createEmptyBuilderDraft(dictionary, draft.msgType));
  }, [commitDraft, dictionary, draft.msgType]);

  const handleUpdateTopField = useCallback(
    (index: number, value: string) => {
      commitDraft((current) => ({
        ...current,
        fields: current.fields.map((field, idx) =>
          idx === index ? { ...field, value } : field
        ),
      }));
    },
    [commitDraft]
  );

  const handleRemoveTopField = useCallback(
    (index: number) => {
      commitDraft((current) => ({
        ...current,
        fields: current.fields.filter((_, idx) => idx !== index),
      }));
    },
    [commitDraft]
  );

  const handleClearExtraFields = useCallback(() => {
    commitDraft((current) => ({
      ...current,
      fields: current.fields.filter((field) => !field.isExtra),
    }));
  }, [commitDraft]);

  const handleAddTopMember = useCallback(
    (member: FixAddableMemberOption) => {
      if (member.kind === 'group') {
        const groupSchema = schema?.groupByCounterTag.get(member.tag);
        if (!groupSchema) return;
        commitDraft((current) => {
          if (current.groups.some((g) => g.counterTag === member.tag)) return current;
          return {
            ...current,
            groups: [
              ...current.groups,
              {
                counterTag: member.tag,
                entries: [createEmptyGroupEntry(groupSchema)],
              },
            ],
          };
        });
        return;
      }

      commitDraft((current) => {
        if (current.fields.some((f) => f.tag === member.tag)) return current;
        const isExtra = !member.fromSchema || member.kind === 'custom_tag';
        return {
          ...current,
          fields: [...current.fields, { tag: member.tag, value: '', isExtra }],
        };
      });
    },
    [commitDraft, schema]
  );

  const handleUpdateGroups = useCallback(
    (updater: (groups: FixBuilderGroup[]) => FixBuilderGroup[]) => {
      commitDraft((current) => ({
        ...current,
        groups: updater(current.groups),
      }));
    },
    [commitDraft]
  );

  const getMsgTypeOptions = useCallback(
    (query: string): FixComboboxOption[] => {
      if (!dictionary) return [];
      const matches = searchFixApplicationMessages(dictionary, query);
      const showSections = !query.trim();
      return matches.map((item) => ({
        value: item.msgType,
        code: item.msgType,
        label: item.label,
        meta: item.name !== item.label.replace(/\s+/g, '') ? item.name : undefined,
        section: showSections
          ? item.isCommon
            ? 'Common messages'
            : `All application messages (${matches.length})`
          : undefined,
      }));
    },
    [dictionary]
  );

  const existingTopFieldTags = useMemo(
    () => new Set(draft.fields.map((f) => f.tag)),
    [draft.fields]
  );
  const existingTopGroupTags = useMemo(
    () => new Set(draft.groups.map((g) => g.counterTag)),
    [draft.groups]
  );

  const getAddTopMemberOptions = useCallback(
    (query: string): FixComboboxOption[] => {
      if (!dictionary || !schema) return [];
      const members = searchAddableSchemaMembers(
        schema,
        dictionary,
        existingTopFieldTags,
        existingTopGroupTags,
        query
      );
      return members.map(toAddableComboboxOption);
    },
    [dictionary, schema, existingTopFieldTags, existingTopGroupTags]
  );

  const addableConditionalChips = useMemo(() => {
    if (!schema) return [];
    return schema.conditionalFields
      .filter((field) => !existingTopFieldTags.has(field.tag))
      .slice(0, 5);
  }, [schema, existingTopFieldTags]);

  const openFieldReference = useCallback(
    (
      event: React.MouseEvent<HTMLElement>,
      tag: number,
      currentValue: string | undefined,
      groupContext: string | undefined,
      key: string,
      onSelectEnumValue?: (value: string) => void
    ) => {
      if (!dictionary) return;
      event.stopPropagation();
      const anchor = event.currentTarget.getBoundingClientRect();
      setActivePopover((current) =>
        current?.key === key
          ? null
          : {
              key,
              reference: getFixFieldReference(
                dictionary,
                tag,
                currentValue,
                groupContext,
                schema?.name
              ),
              anchor,
              onSelectEnumValue,
            }
      );
    },
    [dictionary, schema?.name]
  );

  async function handleCopyWire() {
    if (!serializedWire) return;
    try {
      await navigator.clipboard.writeText(serializedWire);
      setCopiedWire(true);
      window.setTimeout(() => setCopiedWire(false), 1400);
    } catch {
      // Ignore clipboard permission denial
    }
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((current) => toggleSetItem(current, key));
  }

  function toggleEntry(key: string) {
    setCollapsedEntries((current) => toggleSetItem(current, key));
  }

  const schemaFieldsIndexed = useMemo(() => {
    const entries: Array<{ field: FixBuilderField; index: number; schemaField?: FixSchemaField }> = [];
    draft.fields.forEach((field, index) => {
      if (field.isExtra) return;
      entries.push({
        field,
        index,
        schemaField: schema?.fieldByTag.get(field.tag),
      });
    });
    entries.sort((a, b) => {
      const aOrder = a.schemaField?.wireOrder ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.schemaField?.wireOrder ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
    return entries;
  }, [draft.fields, schema]);

  const extraFieldsIndexed = useMemo(() => {
    const entries: Array<{ field: FixBuilderField; index: number }> = [];
    draft.fields.forEach((field, index) => {
      if (field.isExtra) entries.push({ field, index });
    });
    return entries;
  }, [draft.fields]);

  const warningIssues = [
    ...validation.delimiterWarnings,
    ...validation.missingRequired,
  ];
  const warningTooltip = warningIssues
    .map((issue) =>
      issue.context
        ? `${issue.context}: ${issue.tag} ${issue.name} — ${issue.reason}`
        : `${issue.tag} ${issue.name} — ${issue.reason}`
    )
    .join('\n');

  const canInteractWithSchema = Boolean(dictionary && schema && !draft.parseError && !draft.adminMsgType);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Unified Application Message Command Bar */}
      <div className="flex items-center gap-2 h-8 px-3 border-b border-zinc-900 bg-zinc-950/70 flex-shrink-0">
        {modeToggle}

        {dictionary ? (
          <FixSearchableCombobox
            getOptions={getMsgTypeOptions}
            selectedValue={draft.msgType}
            onSelect={handleSelectMsgType}
            searchPlaceholder="Search MsgType (e.g. V, D, New Order, mdr)..."
            emptyMessage="No matching FIX application message types."
            preferredWidth={380}
            preferredMaxHeight={360}
            ariaLabel="Select FIX message type"
            renderTrigger={({ open, toggle, triggerRef }) => (
              <button
                ref={triggerRef}
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-haspopup="dialog"
                title="Choose FIX application message type (tag 35)"
                className={`h-6 max-w-[280px] px-2 inline-flex items-center gap-1.5 rounded-sm border text-[11px] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 ${
                  open
                    ? 'border-zinc-600 bg-zinc-850 text-zinc-100'
                    : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-700 text-zinc-200'
                }`}
              >
                {draft.msgType ? (
                  <>
                    <span className="rounded-sm border border-blue-800/70 bg-blue-950/45 px-1 py-0 font-mono text-[10px] font-semibold text-blue-200 flex-shrink-0">
                      {draft.msgType}
                    </span>
                    <span className="truncate font-medium">
                      {schema?.label || draft.msgType}
                    </span>
                  </>
                ) : (
                  <span className="text-zinc-500 truncate">Select MsgType (35=)...</span>
                )}
                <ChevronDown
                  size={11}
                  className={`ml-0.5 text-zinc-500 flex-shrink-0 transition-transform ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </button>
            )}
          />
        ) : (
          <span className="text-[10px] font-mono text-zinc-500">
            {dictionary === undefined
              ? `Loading ${config.begin_string} dictionary...`
              : `No dictionary for ${config.begin_string}`}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {validation.blockingError ? (
            <span
              className="inline-flex items-center gap-1 h-5 px-1.5 rounded-sm border border-red-800/70 bg-red-950/35 text-[10px] font-mono text-red-200 max-w-[200px] truncate"
              title={validation.blockingError}
            >
              <AlertTriangle size={10} className="flex-shrink-0" />
              <span className="truncate">{validation.blockingError}</span>
            </span>
          ) : warningIssues.length > 0 ? (
            <span
              className="inline-flex items-center gap-1 h-5 px-1.5 rounded-sm border border-amber-800/60 bg-amber-950/35 text-[10px] font-mono text-amber-200"
              title={warningTooltip}
            >
              <AlertTriangle size={10} className="flex-shrink-0 text-amber-400" />
              {warningIssues.length} req empty
            </span>
          ) : (
            <span className="text-[10px] font-mono text-zinc-500 tabular-nums px-1">
              {wireFieldCount} field{wireFieldCount === 1 ? '' : 's'}
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowEnvelope((open) => !open)}
            aria-pressed={showEnvelope}
            title={
              showEnvelope
                ? 'Hide auto-generated session envelope fields (8, 9, 49, 56, 34, 52, 10)'
                : 'Show auto-generated session envelope fields (8, 9, 49, 56, 34, 52, 10)'
            }
            className={`h-6 px-2 inline-flex items-center gap-1 rounded-sm border text-[10px] transition ${
              showEnvelope
                ? 'border-sky-800/70 bg-sky-950/35 text-sky-200'
                : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
            }`}
          >
            <Layers size={10} />
            <span>Envelope</span>
            {draft.strippedEnvelopeFields.length > 0 && (
              <span className="font-mono text-[9px] text-zinc-400">
                ({draft.strippedEnvelopeFields.length})
              </span>
            )}
          </button>

          {canInteractWithSchema && (
            <button
              type="button"
              onClick={handleResetTemplate}
              title={`Reset ${draft.msgType} to clean required fields`}
              className="h-6 px-1.5 inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900/70 text-[10px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition"
            >
              <RotateCcw size={10} />
              <span className="hidden xl:inline">Reset</span>
            </button>
          )}

          <button
            type="button"
            onClick={onSend}
            disabled={!canSend || Boolean(validation.blockingError)}
            className="h-6 px-2.5 inline-flex items-center justify-center gap-1 rounded-sm border border-blue-700/60 bg-blue-950/50 hover:bg-blue-900/60 text-[10px] font-semibold text-blue-200 disabled:opacity-35 disabled:cursor-not-allowed transition"
            title={canSend ? 'Send message (Ctrl+Enter)' : 'Log on to send'}
          >
            <ArrowUp size={11} />
            Send
          </button>
        </div>
      </div>

      {/* Scrollable Structured Form Body */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-950/40">
        {dictionary === undefined ? (
          <div className="flex items-center gap-2 px-3 py-4 text-[11px] text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            Loading {config.begin_string} dictionary...
          </div>
        ) : dictionary === null ? (
          <div className="px-3 py-4 text-[11px] text-zinc-400 space-y-2">
            <p>
              No bundled FIX dictionary is available for{' '}
              <span className="font-mono text-zinc-200">{config.begin_string}</span>.
            </p>
            <button
              type="button"
              onClick={onSwitchToRaw}
              className="h-6 px-2 rounded-sm border border-zinc-700 bg-zinc-900 text-[10px] text-zinc-200 hover:bg-zinc-850"
            >
              Switch to Raw editor
            </button>
          </div>
        ) : draft.parseError || draft.adminMsgType ? (
          <div className="px-3 py-3 border-b border-amber-900/40 bg-amber-950/15 space-y-2">
            <div className="flex items-start gap-2 text-[11px] text-amber-200">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-amber-400" />
              <div className="min-w-0">
                <p className="font-medium">
                  {draft.adminMsgType
                    ? `Admin MsgType "${draft.adminMsgType}" is managed automatically by the session.`
                    : `Unable to parse current raw draft: ${draft.parseError}`}
                </p>
                <p className="mt-0.5 text-[10px] text-amber-200/75">
                  Choose an application MsgType above to build a structured message, or switch to Raw mode to edit the text directly.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSwitchToRaw}
              className="h-6 px-2 rounded-sm border border-zinc-700 bg-zinc-900 text-[10px] text-zinc-200 hover:bg-zinc-850"
            >
              Edit in Raw mode
            </button>
          </div>
        ) : !draft.msgType ? (
          <div className="px-3 py-5 text-center space-y-1.5">
            <p className="text-[11px] text-zinc-300">
              Choose a FIX message type above to populate its required fields and repeating groups.
            </p>
            <p className="text-[10px] text-zinc-500">
              Supports all {dictionary.data.messages.filter((m) => m.category === 'app').length}{' '}
              {dictionary.version} application messages, repeating groups, enums, and{' '}
              <span className="font-mono text-zinc-400">{'{{VARIABLE}}'}</span> tokens.
            </p>
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[58px]" />
              <col className="w-[228px]" />
              <col />
              <col className="w-[58px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-zinc-950">
              <tr className="border-b border-zinc-800/90 text-[9px] uppercase tracking-wider text-zinc-500">
                <th className="px-2 py-1 font-medium">Tag</th>
                <th className="px-2 py-1 font-medium">Field</th>
                <th className="px-2 py-1 font-medium">Value</th>
                <th className="px-2 py-1 font-medium text-right">Act</th>
              </tr>
            </thead>
            <tbody>
              {/* Optional Session Envelope Preview Section */}
              {showEnvelope && (
                <>
                  <tr className="border-b border-sky-900/35 bg-sky-950/15">
                    <td colSpan={4} className="px-2 py-1">
                      <div className="flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-wider text-sky-300/90">
                        <span>
                          Session Envelope · generated automatically on send (read-only)
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowEnvelope(false)}
                          className="font-sans font-normal normal-case tracking-normal text-[10px] text-sky-300/80 hover:text-sky-200"
                        >
                          Hide
                        </button>
                      </div>
                    </td>
                  </tr>
                  {envelopePreview.map((item) => (
                    <tr
                      key={`env-${item.tag}`}
                      className="border-b border-zinc-900/70 bg-zinc-950/70"
                    >
                      <td className="px-2 py-1 align-middle">
                        <FieldReferenceButton
                          label={String(item.tag)}
                          className="font-mono text-zinc-500"
                          onClick={(event) =>
                            openFieldReference(
                              event,
                              item.tag,
                              item.effectiveValue,
                              'Session Envelope',
                              `env-${item.tag}`
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1 align-middle">
                        <FieldReferenceButton
                          label={item.name}
                          className={
                            item.section === 'header'
                              ? 'text-sky-300/85'
                              : 'text-zinc-400'
                          }
                          onClick={(event) =>
                            openFieldReference(
                              event,
                              item.tag,
                              item.effectiveValue,
                              'Session Envelope',
                              `env-name-${item.tag}`
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1 align-middle text-[11px] font-mono">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`truncate ${
                              item.isAutoGenerated ? 'text-zinc-500 italic' : 'text-zinc-300'
                            }`}
                          >
                            {item.effectiveValue}
                          </span>
                          {item.pastedValue !== undefined && (
                            <span
                              className="flex-shrink-0 rounded-sm border border-zinc-800 bg-zinc-900 px-1 py-0 text-[9px] text-zinc-400"
                              title={`Raw draft contained ${item.tag}=${item.pastedValue}; replaced on send`}
                            >
                              draft: {item.pastedValue}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1 align-middle text-right">
                        <span className="rounded-sm border border-zinc-800 bg-zinc-900/80 px-1 py-0 font-mono text-[8px] uppercase text-zinc-500">
                          AUTO
                        </span>
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* Top-level Schema Fields */}
              {schemaFieldsIndexed.map(({ field, index, schemaField }) => {
                const definition = dictionary.fieldByTag(field.tag);
                const isStarter = Boolean(schemaField?.isStarter);
                const isMissing = missingTopTagSet.has(field.tag);
                return (
                  <BuilderFieldRow
                    key={`top-${field.tag}-${index}`}
                    tag={field.tag}
                    value={field.value}
                    definition={definition}
                    badge={
                      schemaField?.reqd === 'Y' || isStarter
                        ? 'REQ'
                        : schemaField?.reqd === 'C'
                        ? 'COND'
                        : undefined
                    }
                    badgeTone={
                      schemaField?.reqd === 'Y' || isStarter
                        ? 'required'
                        : schemaField?.reqd === 'C'
                        ? 'conditional'
                        : undefined
                    }
                    isMissing={isMissing}
                    canRemove={!isStarter}
                    depth={0}
                    activeVariables={activeVariables}
                    onChange={(nextValue) => handleUpdateTopField(index, nextValue)}
                    onRemove={() => handleRemoveTopField(index)}
                    onOpenReference={(event) =>
                      openFieldReference(
                        event,
                        field.tag,
                        field.value,
                        schemaField?.componentPath,
                        `top-${field.tag}-${index}`,
                        (selected) => handleUpdateTopField(index, selected)
                      )
                    }
                  />
                );
              })}

              {/* Top-level Repeating Groups */}
              {draft.groups.map((group) => {
                const groupSchema = schema?.groupByCounterTag.get(group.counterTag);
                if (!groupSchema) return null;
                return (
                  <BuilderGroupSection
                    key={`group-${group.counterTag}`}
                    group={group}
                    groupSchema={groupSchema}
                    dictionary={dictionary}
                    depth={0}
                    keyPrefix={`group-${group.counterTag}`}
                    collapsedGroups={collapsedGroups}
                    collapsedEntries={collapsedEntries}
                    activeVariables={activeVariables}
                    onToggleGroup={toggleGroup}
                    onToggleEntry={toggleEntry}
                    onOpenReference={openFieldReference}
                    onChangeGroup={(updatedGroup) =>
                      handleUpdateGroups((groups) =>
                        groups.map((candidate) =>
                          candidate.counterTag === group.counterTag
                            ? updatedGroup
                            : candidate
                        )
                      )
                    }
                    onRemoveGroup={
                      groupSchema.isStarter
                        ? undefined
                        : () =>
                            handleUpdateGroups((groups) =>
                              groups.filter(
                                (candidate) => candidate.counterTag !== group.counterTag
                              )
                            )
                    }
                  />
                );
              })}

              {/* Extra / Custom Fields */}
              {extraFieldsIndexed.length > 0 && (
                <>
                  <tr className="border-y border-zinc-800/80 bg-zinc-900/40">
                    <td colSpan={4} className="px-2 py-1">
                      <div className="flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                        <span>
                          Extra / Custom Fields ({extraFieldsIndexed.length})
                        </span>
                        <button
                          type="button"
                          onClick={handleClearExtraFields}
                          className="font-sans font-normal normal-case tracking-normal text-[10px] text-zinc-400 hover:text-red-300 transition"
                        >
                          Clear extra
                        </button>
                      </div>
                    </td>
                  </tr>
                  {extraFieldsIndexed.map(({ field, index }) => {
                    const definition = dictionary.fieldByTag(field.tag);
                    return (
                      <BuilderFieldRow
                        key={`extra-${field.tag}-${index}`}
                        tag={field.tag}
                        value={field.value}
                        definition={definition}
                        badge="EXTRA"
                        badgeTone="neutral"
                        isMissing={false}
                        canRemove={true}
                        depth={0}
                        activeVariables={activeVariables}
                        onChange={(nextValue) => handleUpdateTopField(index, nextValue)}
                        onRemove={() => handleRemoveTopField(index)}
                        onOpenReference={(event) =>
                          openFieldReference(
                            event,
                            field.tag,
                            field.value,
                            'Extra field',
                            `extra-${field.tag}-${index}`,
                            (selected) => handleUpdateTopField(index, selected)
                          )
                        }
                      />
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Field / Group + Conditional Quick-Add Strip */}
      {canInteractWithSchema && dictionary && schema && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-800/80 bg-zinc-950/90 px-3 py-1.5 flex-shrink-0">
          <FixSearchableCombobox
            getOptions={getAddTopMemberOptions}
            onSelect={(option) => {
              const members = searchAddableSchemaMembers(
                schema,
                dictionary,
                existingTopFieldTags,
                existingTopGroupTags,
                option.code || ''
              );
              const matched = members.find(
                (m) => `${m.kind}:${m.tag}` === option.value
              );
              if (matched) handleAddTopMember(matched);
            }}
            searchPlaceholder="Search tag, name, group, or type custom tag #..."
            emptyMessage="No remaining fields match. Type any numeric tag to add a custom field."
            preferredWidth={400}
            preferredMaxHeight={320}
            ariaLabel="Add FIX field or repeating group"
            renderTrigger={({ open, toggle, triggerRef }) => (
              <button
                ref={triggerRef}
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="h-6 px-2 inline-flex items-center gap-1 rounded-sm border border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-[10px] font-medium text-zinc-200 transition"
              >
                <Plus size={11} />
                Add field / group
              </button>
            )}
          />

          {addableConditionalChips.length > 0 && (
            <div className="flex items-center gap-1 min-w-0 overflow-hidden flex-wrap">
              <span className="text-[9px] uppercase tracking-wider text-zinc-500 ml-1">
                Conditional:
              </span>
              {addableConditionalChips.map((field) => (
                <button
                  key={`cond-chip-${field.tag}`}
                  type="button"
                  onClick={() =>
                    handleAddTopMember({
                      kind: 'field',
                      tag: field.tag,
                      name: field.name,
                      reqd: field.reqd,
                      componentPath: field.componentPath,
                      type: field.definition?.type,
                      fromSchema: true,
                    })
                  }
                  title={`Add conditional field ${field.tag} ${field.name}${
                    field.componentPath ? ` (${field.componentPath})` : ''
                  }`}
                  className="h-5 px-1.5 inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900/70 hover:border-amber-800/70 hover:bg-amber-950/25 text-[10px] text-zinc-300 hover:text-amber-200 transition"
                >
                  <Plus size={9} className="text-zinc-500" />
                  <span className="font-mono text-zinc-400">{field.tag}</span>
                  <span className="truncate max-w-[120px]">{field.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compact Live Wire Preview Bar */}
      {wirePreview && (
        <div className="flex items-center gap-2 h-6 px-3 border-t border-zinc-900 bg-zinc-950 flex-shrink-0">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 flex-shrink-0">
            Wire
          </span>
          <span
            className="flex-1 min-w-0 truncate font-mono text-[10px] text-zinc-400 select-text"
            title={wirePreview}
          >
            {wirePreview}
          </span>
          <button
            type="button"
            onClick={() => void handleCopyWire()}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition flex-shrink-0"
            title="Copy wire message body"
          >
            {copiedWire ? (
              <>
                <Check size={9} className="text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy size={9} />
                Copy
              </>
            )}
          </button>
        </div>
      )}

      {/* Shared FIX Orchestra Field Reference Popover */}
      {activePopover && (
        <FieldReferencePopover
          reference={activePopover.reference}
          anchor={activePopover.anchor}
          onClose={() => setActivePopover(null)}
          onSelectEnumValue={activePopover.onSelectEnumValue}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Field Row & Type-Aware Value Editor
// ---------------------------------------------------------------------------

function BuilderFieldRow({
  tag,
  value,
  definition,
  badge,
  badgeTone,
  isMissing,
  canRemove,
  depth,
  activeVariables,
  onChange,
  onRemove,
  onOpenReference,
}: {
  tag: number;
  value: string;
  definition?: FixFieldDefinition;
  badge?: string;
  badgeTone?: 'required' | 'conditional' | 'delimiter' | 'neutral';
  isMissing: boolean;
  canRemove: boolean;
  depth: number;
  activeVariables: Record<string, string>;
  onChange: (nextValue: string) => void;
  onRemove: () => void;
  onOpenReference: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  const fieldName = definition?.name || `Custom tag ${tag}`;

  return (
    <tr className="border-b border-zinc-900/70 last:border-b-0 hover:bg-zinc-900/25">
      <td
        className="px-2 py-1 align-middle"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <FieldReferenceButton
          label={String(tag)}
          className="font-mono text-zinc-400"
          onClick={onOpenReference}
        />
      </td>
      <td className="px-2 py-1 align-middle">
        <div className="flex items-center gap-1.5 min-w-0">
          <FieldReferenceButton
            label={fieldName}
            className={definition ? 'text-zinc-200' : 'text-zinc-400'}
            onClick={onOpenReference}
          />
          {badge && (
            <span
              className={`flex-shrink-0 rounded-sm border px-1 py-0 font-mono text-[8px] uppercase tracking-wide ${rowBadgeClassName(
                badgeTone
              )}`}
            >
              {badge}
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-1 align-middle">
        <FixFieldValueEditor
          tag={tag}
          value={value}
          definition={definition}
          isMissing={isMissing}
          activeVariables={activeVariables}
          onChange={onChange}
        />
      </td>
      <td className="px-2 py-1 align-middle text-right">
        <div className="inline-flex items-center justify-end gap-0.5">
          {value !== '' && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="p-1 rounded-sm text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition"
              title={`Clear ${tag} ${fieldName}`}
              aria-label={`Clear ${fieldName}`}
            >
              <X size={11} />
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1 rounded-sm text-zinc-500 hover:text-red-300 hover:bg-zinc-900 transition"
              title={`Remove ${tag} ${fieldName}`}
              aria-label={`Remove ${fieldName}`}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function FixFieldValueEditor({
  tag,
  value,
  definition,
  isMissing,
  activeVariables,
  onChange,
}: {
  tag: number;
  value: string;
  definition?: FixFieldDefinition;
  isMissing: boolean;
  activeVariables: Record<string, string>;
  onChange: (nextValue: string) => void;
}) {
  const enumValues = definition?.enumValues || [];
  const hasEnums = enumValues.length > 0;
  const isMultiValue = definition?.type === 'MultipleValueString';
  const isBoolean = definition?.type === 'Boolean' && !hasEnums;
  const temporalKind = getFixTemporalKind(definition?.type);
  const showIdGen = !hasEnums && !isBoolean && !temporalKind && isIdLikeFixField(tag, definition?.name);
  const isSensitive = tag === 554 || tag === 925;
  const placeholder = getFixFieldPlaceholder(definition);

  const matchedEnum = useMemo(() => {
    if (!hasEnums || !value) return undefined;
    return enumValues.find((candidate) => candidate.value === value);
  }, [enumValues, hasEnums, value]);

  const selectedMultiValues = useMemo(() => {
    if (!isMultiValue || !value.trim()) return undefined;
    return new Set(value.trim().split(/\s+/));
  }, [isMultiValue, value]);

  const getEnumOptions = useCallback(
    (query: string): FixComboboxOption[] => {
      const normalized = query.trim().toLowerCase();
      return enumValues
        .filter((item) => {
          if (!normalized) return true;
          return `${item.value} ${item.name} ${item.description}`
            .toLowerCase()
            .includes(normalized);
        })
        .map((item) => ({
          value: item.value,
          code: item.value,
          label: item.name.replace(/_+/g, ' '),
          description: item.description,
        }));
    },
    [enumValues]
  );

  function handleSelectEnum(option: FixComboboxOption) {
    if (!isMultiValue) {
      onChange(option.value);
      return;
    }
    const tokens = value.trim() ? value.trim().split(/\s+/) : [];
    const exists = tokens.includes(option.value);
    const next = exists
      ? tokens.filter((token) => token !== option.value)
      : [...tokens, option.value];
    onChange(next.join(' '));
  }

  function handleFillNow() {
    const now = new Date();
    if (temporalKind === 'timestamp') onChange(formatFixUtcTimestamp(now));
    else if (temporalKind === 'date') onChange(formatFixUtcDate(now));
    else if (temporalKind === 'time') onChange(formatFixUtcTime(now));
  }

  const borderClass = isMissing
    ? 'border-amber-800/60 focus-within:border-amber-600/80'
    : 'border-zinc-800 focus-within:border-zinc-600';

  return (
    <div className="flex items-center gap-1 min-w-0">
      <div
        className={`relative flex-1 min-w-0 flex items-center h-7 rounded-sm border bg-zinc-900/70 transition ${borderClass}`}
      >
        <VariableInput
          value={value}
          onChange={onChange}
          variables={activeVariables}
          placeholder={placeholder}
          maskValue={isSensitive}
          className="h-full min-h-0 flex-1 min-w-0"
        />

        {matchedEnum && (
          <span
            className="hidden sm:inline-block max-w-[160px] truncate pr-1.5 text-[10px] text-zinc-400 select-none pointer-events-none"
            title={`${matchedEnum.value} · ${matchedEnum.name.replace(/_+/g, ' ')}`}
          >
            {matchedEnum.name.replace(/_+/g, ' ')}
          </span>
        )}

        {hasEnums && (
          <FixSearchableCombobox
            getOptions={getEnumOptions}
            selectedValue={isMultiValue ? undefined : value}
            selectedValues={selectedMultiValues}
            keepOpenOnSelect={isMultiValue}
            onSelect={handleSelectEnum}
            searchPlaceholder={`Filter ${definition?.name || 'values'}...`}
            emptyMessage="No enum values match."
            footerHint={
              isMultiValue
                ? 'Click to toggle multiple values · Esc close'
                : '↑↓ navigate · Enter select · Esc close'
            }
            preferredWidth={360}
            preferredMaxHeight={300}
            ariaLabel={`Choose enum value for ${definition?.name || tag}`}
            renderTrigger={({ open, toggle, triggerRef }) => (
              <button
                ref={triggerRef}
                type="button"
                onClick={toggle}
                aria-expanded={open}
                title={`Browse ${enumValues.length} enum values for ${definition?.name || tag}`}
                aria-label={`Browse values for ${definition?.name || tag}`}
                className={`h-full px-1.5 border-l border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 transition flex-shrink-0 ${
                  open ? 'bg-zinc-850 text-zinc-100' : ''
                }`}
              >
                <ChevronDown
                  size={11}
                  className={`transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          />
        )}
      </div>

      {isBoolean && (
        <div className="flex items-center h-7 border border-zinc-800 rounded-sm overflow-hidden flex-shrink-0">
          {(['Y', 'N'] as const).map((flag) => {
            const active = value === flag;
            return (
              <button
                key={flag}
                type="button"
                onClick={() => onChange(active ? '' : flag)}
                aria-pressed={active}
                className={`h-full px-2 font-mono text-[10px] transition ${
                  active
                    ? 'bg-blue-950/60 text-blue-200 font-semibold'
                    : 'bg-zinc-900/70 text-zinc-400 hover:text-zinc-200'
                }`}
                title={flag === 'Y' ? 'Set Y (Yes)' : 'Set N (No)'}
              >
                {flag}
              </button>
            );
          })}
        </div>
      )}

      {temporalKind && (
        <button
          type="button"
          onClick={handleFillNow}
          className="h-7 px-2 inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 hover:text-zinc-100 text-[10px] font-mono text-zinc-400 transition flex-shrink-0"
          title={`Insert current UTC ${temporalKind}`}
        >
          <Clock size={10} />
          Now
        </button>
      )}

      {showIdGen && (
        <button
          type="button"
          onClick={() => onChange(generateFixFieldId())}
          className="h-7 px-2 inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 hover:text-zinc-100 text-[10px] font-mono text-zinc-400 transition flex-shrink-0"
          title={`Generate unique UUID for ${definition?.name || tag}`}
        >
          <RefreshCw size={10} />
          ID
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recursive Repeating Group Section
// ---------------------------------------------------------------------------

function BuilderGroupSection({
  group,
  groupSchema,
  dictionary,
  depth,
  keyPrefix,
  collapsedGroups,
  collapsedEntries,
  activeVariables,
  onToggleGroup,
  onToggleEntry,
  onOpenReference,
  onChangeGroup,
  onRemoveGroup,
}: {
  group: FixBuilderGroup;
  groupSchema: FixSchemaGroup;
  dictionary: FixDictionary;
  depth: number;
  keyPrefix: string;
  collapsedGroups: Set<string>;
  collapsedEntries: Set<string>;
  activeVariables: Record<string, string>;
  onToggleGroup: (key: string) => void;
  onToggleEntry: (key: string) => void;
  onOpenReference: (
    event: React.MouseEvent<HTMLElement>,
    tag: number,
    currentValue: string | undefined,
    groupContext: string | undefined,
    key: string,
    onSelectEnumValue?: (value: string) => void
  ) => void;
  onChangeGroup: (updated: FixBuilderGroup) => void;
  onRemoveGroup?: () => void;
}) {
  const isCollapsed = collapsedGroups.has(keyPrefix);
  const nonEmptyCount = group.entries.filter(isEntryNonEmpty).length;

  function handleAddEntry() {
    onChangeGroup({
      ...group,
      entries: [...group.entries, createEmptyGroupEntry(groupSchema)],
    });
    if (isCollapsed) onToggleGroup(keyPrefix);
  }

  function handleDuplicateEntry(entry: FixBuilderGroupEntry, index: number) {
    const cloned = cloneGroupEntry(entry);
    const nextEntries = [...group.entries];
    nextEntries.splice(index + 1, 0, cloned);
    onChangeGroup({ ...group, entries: nextEntries });
  }

  function handleDeleteEntry(index: number) {
    if (group.entries.length <= 1) {
      // Keep one clean starter entry for required groups, or clear last entry
      if (groupSchema.isStarter) {
        onChangeGroup({
          ...group,
          entries: [createEmptyGroupEntry(groupSchema)],
        });
      } else if (onRemoveGroup) {
        onRemoveGroup();
      }
      return;
    }
    onChangeGroup({
      ...group,
      entries: group.entries.filter((_, idx) => idx !== index),
    });
  }

  function handleUpdateEntry(
    entryIndex: number,
    updater: (entry: FixBuilderGroupEntry) => FixBuilderGroupEntry
  ) {
    onChangeGroup({
      ...group,
      entries: group.entries.map((entry, idx) =>
        idx === entryIndex ? updater(entry) : entry
      ),
    });
  }

  return (
    <>
      <tr className="border-y border-amber-900/35 bg-amber-950/10">
        <td
          className="px-2 py-1.5 align-middle"
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          <FieldReferenceButton
            label={String(group.counterTag)}
            className="font-mono text-amber-500/90"
            onClick={(event) =>
              onOpenReference(
                event,
                group.counterTag,
                String(nonEmptyCount),
                undefined,
                `${keyPrefix}/count`
              )
            }
          />
        </td>
        <td className="px-2 py-1.5 align-middle">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => onToggleGroup(keyPrefix)}
              className="flex-shrink-0 text-amber-500/80 hover:text-amber-300"
              aria-expanded={!isCollapsed}
              title={isCollapsed ? 'Expand repeating group' : 'Collapse repeating group'}
            >
              {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
            </button>
            <FieldReferenceButton
              label={groupSchema.name}
              className="text-amber-300"
              onClick={(event) =>
                onOpenReference(
                  event,
                  group.counterTag,
                  String(nonEmptyCount),
                  undefined,
                  `${keyPrefix}/name`
                )
              }
            />
            {groupSchema.isStarter && (
              <span className="flex-shrink-0 rounded-sm border border-amber-700/60 bg-amber-950/50 px-1 py-0 font-mono text-[8px] uppercase text-amber-200">
                REQ
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-1.5 align-middle">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] ${
                nonEmptyCount > 0
                  ? 'border-amber-700/60 bg-amber-950/40 text-amber-200'
                  : groupSchema.isStarter
                  ? 'border-amber-900/60 bg-amber-950/20 text-amber-300/80'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400'
              }`}
              title={`Automatically serialized as ${group.counterTag}=${nonEmptyCount}`}
            >
              {nonEmptyCount} {nonEmptyCount === 1 ? 'entry' : 'entries'} · {group.counterTag}=
              {nonEmptyCount}
            </span>
            <button
              type="button"
              onClick={handleAddEntry}
              className="h-5 px-1.5 inline-flex items-center gap-1 rounded-sm border border-amber-800/60 bg-amber-950/35 hover:bg-amber-950/65 text-[10px] font-medium text-amber-200 transition"
              title={`Add entry to ${groupSchema.name}`}
            >
              <Plus size={10} />
              Entry
            </button>
          </div>
        </td>
        <td className="px-2 py-1.5 align-middle text-right">
          {onRemoveGroup && (
            <button
              type="button"
              onClick={onRemoveGroup}
              className="p-1 rounded-sm text-zinc-500 hover:text-red-300 hover:bg-zinc-900 transition"
              title={`Remove repeating group ${groupSchema.name}`}
              aria-label={`Remove repeating group ${groupSchema.name}`}
            >
              <Trash2 size={11} />
            </button>
          )}
        </td>
      </tr>

      {!isCollapsed &&
        group.entries.map((entry, entryIndex) => {
          const entryKey = `${keyPrefix}/entry-${entry.id}`;
          const entryCollapsed = collapsedEntries.has(entryKey);
          const summary = buildBuilderEntrySummary(entry, dictionary);
          const entryFieldTags = new Set(entry.fields.map((f) => f.tag));
          const entryGroupTags = new Set(entry.groups.map((g) => g.counterTag));
          const entryHasAnyValue = isEntryNonEmpty(entry);

          return (
            <React.Fragment key={entry.id}>
              <tr className="border-b border-amber-900/20 bg-zinc-900/35">
                <td colSpan={4} className="px-2 py-1">
                  <div
                    className="flex items-center justify-between gap-2"
                    style={{ paddingLeft: (depth + 1) * 10 }}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleEntry(entryKey)}
                      aria-expanded={!entryCollapsed}
                      className="flex items-center gap-1.5 min-w-0 text-left text-[10px] text-amber-200/85 hover:text-amber-100"
                    >
                      {entryCollapsed ? (
                        <ChevronRight size={10} className="flex-shrink-0" />
                      ) : (
                        <ChevronDown size={10} className="flex-shrink-0" />
                      )}
                      <span className="font-mono font-semibold tabular-nums">
                        [{entryIndex + 1}]
                      </span>
                      <span className="truncate font-mono text-zinc-400">{summary}</span>
                    </button>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <FixSearchableCombobox
                        getOptions={(query) =>
                          searchAddableSchemaMembers(
                            groupSchema,
                            dictionary,
                            entryFieldTags,
                            entryGroupTags,
                            query
                          ).map(toAddableComboboxOption)
                        }
                        onSelect={(option) => {
                          const members = searchAddableSchemaMembers(
                            groupSchema,
                            dictionary,
                            entryFieldTags,
                            entryGroupTags,
                            option.code || ''
                          );
                          const matched = members.find(
                            (m) => `${m.kind}:${m.tag}` === option.value
                          );
                          if (!matched) return;
                          handleUpdateEntry(entryIndex, (curr) => {
                            if (matched.kind === 'group') {
                              const nestedSchema = groupSchema.groupByCounterTag.get(
                                matched.tag
                              );
                              if (!nestedSchema) return curr;
                              if (curr.groups.some((g) => g.counterTag === matched.tag)) {
                                return curr;
                              }
                              return {
                                ...curr,
                                groups: [
                                  ...curr.groups,
                                  {
                                    counterTag: matched.tag,
                                    entries: [createEmptyGroupEntry(nestedSchema)],
                                  },
                                ],
                              };
                            }
                            if (curr.fields.some((f) => f.tag === matched.tag)) return curr;
                            return {
                              ...curr,
                              fields: [
                                ...curr.fields,
                                {
                                  tag: matched.tag,
                                  value: '',
                                  isExtra: !matched.fromSchema || matched.kind === 'custom_tag',
                                },
                              ],
                            };
                          });
                          if (entryCollapsed) onToggleEntry(entryKey);
                        }}
                        searchPlaceholder={`Add field to ${groupSchema.name}[${entryIndex + 1}]...`}
                        emptyMessage="No remaining group fields match."
                        preferredWidth={360}
                        preferredMaxHeight={280}
                        ariaLabel={`Add field to ${groupSchema.name} entry ${entryIndex + 1}`}
                        renderTrigger={({ open, toggle, triggerRef }) => (
                          <button
                            ref={triggerRef}
                            type="button"
                            onClick={toggle}
                            aria-expanded={open}
                            className="h-5 px-1.5 inline-flex items-center gap-0.5 rounded-sm border border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 text-[9px] text-zinc-400 hover:text-zinc-200 transition"
                            title={`Add field to ${groupSchema.name}[${entryIndex + 1}]`}
                          >
                            <Plus size={9} />
                            Field
                          </button>
                        )}
                      />

                      <button
                        type="button"
                        onClick={() => handleDuplicateEntry(entry, entryIndex)}
                        className="p-1 rounded-sm text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition"
                        title="Duplicate entry"
                        aria-label={`Duplicate entry ${entryIndex + 1}`}
                      >
                        <Copy size={10} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteEntry(entryIndex)}
                        className="p-1 rounded-sm text-zinc-500 hover:text-red-300 hover:bg-zinc-900 transition"
                        title={
                          group.entries.length <= 1 && groupSchema.isStarter
                            ? 'Clear entry values'
                            : 'Remove entry'
                        }
                        aria-label={`Remove entry ${entryIndex + 1}`}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                </td>
              </tr>

              {!entryCollapsed && (
                <>
                  {entry.fields.map((field, fieldIndex) => {
                    const isDelimiter = field.tag === groupSchema.delimiterTag;
                    const childSchema = groupSchema.fieldByTag.get(field.tag);
                    const isRequiredChild = childSchema?.reqd === 'Y';
                    const isMissingDelimiter =
                      isDelimiter && entryHasAnyValue && field.value.trim() === '';
                    const isMissingChild =
                      isMissingDelimiter ||
                      (isRequiredChild && entryHasAnyValue && field.value.trim() === '');

                    return (
                      <BuilderFieldRow
                        key={`${entryKey}-f-${field.tag}-${fieldIndex}`}
                        tag={field.tag}
                        value={field.value}
                        definition={dictionary.fieldByTag(field.tag)}
                        badge={
                          isDelimiter
                            ? 'DELIM'
                            : isRequiredChild
                            ? 'REQ'
                            : childSchema?.reqd === 'C'
                            ? 'COND'
                            : field.isExtra
                            ? 'EXTRA'
                            : undefined
                        }
                        badgeTone={
                          isDelimiter
                            ? 'delimiter'
                            : isRequiredChild
                            ? 'required'
                            : childSchema?.reqd === 'C'
                            ? 'conditional'
                            : field.isExtra
                            ? 'neutral'
                            : undefined
                        }
                        isMissing={isMissingChild}
                        canRemove={!isDelimiter && !isRequiredChild}
                        depth={depth + 1}
                        activeVariables={activeVariables}
                        onChange={(nextValue) =>
                          handleUpdateEntry(entryIndex, (curr) => ({
                            ...curr,
                            fields: curr.fields.map((f, idx) =>
                              idx === fieldIndex ? { ...f, value: nextValue } : f
                            ),
                          }))
                        }
                        onRemove={() =>
                          handleUpdateEntry(entryIndex, (curr) => ({
                            ...curr,
                            fields: curr.fields.filter((_, idx) => idx !== fieldIndex),
                          }))
                        }
                        onOpenReference={(event) =>
                          onOpenReference(
                            event,
                            field.tag,
                            field.value,
                            `${groupSchema.name}[${entryIndex + 1}]`,
                            `${entryKey}-ref-${field.tag}-${fieldIndex}`,
                            (selected) =>
                              handleUpdateEntry(entryIndex, (curr) => ({
                                ...curr,
                                fields: curr.fields.map((f, idx) =>
                                  idx === fieldIndex ? { ...f, value: selected } : f
                                ),
                              }))
                          )
                        }
                      />
                    );
                  })}

                  {entry.groups.map((nestedGroup) => {
                    const nestedSchema = groupSchema.groupByCounterTag.get(
                      nestedGroup.counterTag
                    );
                    if (!nestedSchema) return null;
                    return (
                      <BuilderGroupSection
                        key={`${entryKey}-g-${nestedGroup.counterTag}`}
                        group={nestedGroup}
                        groupSchema={nestedSchema}
                        dictionary={dictionary}
                        depth={depth + 1}
                        keyPrefix={`${entryKey}-g-${nestedGroup.counterTag}`}
                        collapsedGroups={collapsedGroups}
                        collapsedEntries={collapsedEntries}
                        activeVariables={activeVariables}
                        onToggleGroup={onToggleGroup}
                        onToggleEntry={onToggleEntry}
                        onOpenReference={onOpenReference}
                        onChangeGroup={(updatedNested) =>
                          handleUpdateEntry(entryIndex, (curr) => ({
                            ...curr,
                            groups: curr.groups.map((g) =>
                              g.counterTag === nestedGroup.counterTag
                                ? updatedNested
                                : g
                            ),
                          }))
                        }
                        onRemoveGroup={
                          nestedSchema.isStarter
                            ? undefined
                            : () =>
                                handleUpdateEntry(entryIndex, (curr) => ({
                                  ...curr,
                                  groups: curr.groups.filter(
                                    (g) => g.counterTag !== nestedGroup.counterTag
                                  ),
                                }))
                        }
                      />
                    );
                  })}
                </>
              )}
            </React.Fragment>
          );
        })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toAddableComboboxOption(member: FixAddableMemberOption): FixComboboxOption {
  const section =
    member.kind === 'custom_tag'
      ? 'Custom tag'
      : member.kind === 'group'
      ? 'Repeating groups'
      : member.fromSchema
      ? member.reqd === 'C'
        ? 'Conditional fields'
        : 'Optional schema fields'
      : 'Other FIX dictionary tags';

  return {
    value: `${member.kind}:${member.tag}`,
    code: String(member.tag),
    label: member.name,
    meta: member.componentPath || member.type,
    description: member.description,
    badge:
      member.kind === 'group'
        ? 'GROUP'
        : member.kind === 'custom_tag'
        ? 'CUSTOM'
        : member.reqd === 'Y'
        ? 'REQ'
        : member.reqd === 'C'
        ? 'COND'
        : undefined,
    badgeTone:
      member.kind === 'group'
        ? 'group'
        : member.reqd === 'Y'
        ? 'required'
        : member.reqd === 'C'
        ? 'conditional'
        : 'neutral',
    section,
  };
}

function rowBadgeClassName(
  tone?: 'required' | 'conditional' | 'delimiter' | 'neutral'
): string {
  switch (tone) {
    case 'required':
      return 'border-blue-800/70 bg-blue-950/40 text-blue-300';
    case 'delimiter':
      return 'border-amber-700/60 bg-amber-950/40 text-amber-200';
    case 'conditional':
      return 'border-amber-800/50 bg-amber-950/25 text-amber-300/90';
    default:
      return 'border-zinc-800 bg-zinc-900 text-zinc-400';
  }
}

function isEntryNonEmpty(entry: FixBuilderGroupEntry): boolean {
  if (entry.fields.some((f) => f.value.trim() !== '')) return true;
  return entry.groups.some((g) => g.entries.some(isEntryNonEmpty));
}

function cloneGroupEntry(entry: FixBuilderGroupEntry): FixBuilderGroupEntry {
  return {
    id: createFixGroupEntryId(),
    fields: entry.fields.map((f) => ({ ...f })),
    groups: entry.groups.map((g) => ({
      counterTag: g.counterTag,
      entries: g.entries.map(cloneGroupEntry),
    })),
  };
}

function toggleSetItem(current: Set<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
