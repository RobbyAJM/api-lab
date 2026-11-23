import React, { useEffect, useMemo, useState } from 'react';
import type { FixMessageEvent, FixSensitiveField } from '@api-lab/api-types';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react';
import { loadFixDictionary, type FixDictionary } from '../../utils/fixDictionary';
import {
  formatFixFieldValue,
  getFixFieldReference,
  indexFixSensitiveFields,
  parseFixMessageForDisplay,
  resolveSensitiveFieldValue,
  type FixFieldReference,
  type FixParsedFieldNode,
  type FixParsedGroupNode,
  type FixParsedNode,
} from '../../utils/fixParsedMessage';
import {
  FieldReferenceButton,
  FieldReferencePopover,
} from './FixFieldReferencePopover';

interface SelectedReference {
  key: string;
  reference: FixFieldReference;
  anchor: DOMRect;
}

export const FixParsedMessage: React.FC<{ message: FixMessageEvent }> = ({
  message,
}) => {
  const beginString = useMemo(
    () => message.fields.find(([tag]) => tag === '8')?.[1] || '',
    [message.fields]
  );
  const [dictionary, setDictionary] = useState<FixDictionary | null | undefined>(
    undefined
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedEntries, setCollapsedEntries] = useState<Set<string>>(new Set());
  const [revealedSensitive, setRevealedSensitive] = useState<Set<number>>(
    new Set()
  );
  const [selectedReference, setSelectedReference] =
    useState<SelectedReference | null>(null);
  const sensitiveFields = useMemo(
    () => indexFixSensitiveFields(message.sensitive_fields),
    [message.sensitive_fields]
  );

  useEffect(() => {
    let active = true;
    setDictionary(undefined);
    setCollapsedGroups(new Set());
    setCollapsedEntries(new Set());
    setRevealedSensitive(new Set());
    setSelectedReference(null);

    void loadFixDictionary(beginString).then((loaded) => {
      if (active) setDictionary(loaded);
    });

    return () => {
      active = false;
    };
  }, [beginString, message.timestamp]);

  const parsed = useMemo(
    () => (dictionary ? parseFixMessageForDisplay(message.fields, dictionary) : null),
    [dictionary, message.fields]
  );

  function openReference(
    event: React.MouseEvent<HTMLElement>,
    tag: number,
    value: string | undefined,
    groupContext: string | undefined,
    key: string,
    messageName: string | undefined
  ) {
    if (!dictionary) return;
    event.stopPropagation();
    const anchor = event.currentTarget.getBoundingClientRect();
    setSelectedReference((current) =>
      current?.key === key
        ? null
        : {
            key,
            reference: getFixFieldReference(
              dictionary,
              tag,
              value,
              groupContext,
              messageName
            ),
            anchor,
          }
    );
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((current) => toggleSetValue(current, key));
  }

  function toggleEntry(key: string) {
    setCollapsedEntries((current) => toggleSetValue(current, key));
  }

  function toggleSensitive(sourceIndex: number) {
    setRevealedSensitive((current) => {
      const next = new Set(current);
      if (next.has(sourceIndex)) next.delete(sourceIndex);
      else next.add(sourceIndex);
      return next;
    });
  }

  if (!dictionary || !parsed) {
    return (
      <div className="border-t border-zinc-900 bg-zinc-950/40 px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          {dictionary === null
            ? `No bundled dictionary for ${beginString || 'this FIX version'}.`
            : `Loading ${beginString || 'FIX'} dictionary...`}
          <span className="text-zinc-600">·</span>
          <span>Raw fields remain available below.</span>
        </div>
        <RawFieldTable
          fields={message.fields}
          sensitiveFields={sensitiveFields}
          revealedSensitive={revealedSensitive}
          onToggleSensitive={toggleSensitive}
        />
      </div>
    );
  }

  const warnings = parsed.warnings;

  return (
    <div className="bg-zinc-950/30">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-900/80 text-[10px] text-zinc-500">
        <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-zinc-400">
          {parsed.dictionaryVersion}
        </span>
        <span className="font-mono text-zinc-600">
          {message.fields.length} wire fields · {parsed.groupCount} group
          {parsed.groupCount === 1 ? '' : 's'}
        </span>
        <span className="text-zinc-600">·</span>
        <span className="inline-flex items-center gap-1 text-zinc-500">
          <Info size={10} className="text-zinc-600" />
          Click a tag or field name for its definition
        </span>
        {warnings.length > 0 && (
          <span
            className="ml-auto inline-flex items-center gap-1 rounded-sm border border-amber-800/60 bg-amber-950/30 px-1.5 py-0.5 text-amber-300"
            title={warnings.join('\n')}
          >
            <AlertTriangle size={10} />
            {warnings.length} warning{warnings.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="border-b border-amber-900/30 bg-amber-950/10 px-3 py-1.5 text-[10px] text-amber-200/80 space-y-0.5">
          {warnings.slice(0, 3).map((warning) => (
            <div key={warning} className="flex items-start gap-1.5">
              <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
          {warnings.length > 3 && (
            <div className="pl-4 text-amber-300/60">
              +{warnings.length - 3} more dictionary warnings
            </div>
          )}
        </div>
      )}

      <table className="w-full table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-[58px]" />
          <col className="w-[200px]" />
          <col />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-zinc-950">
          <tr className="border-b border-zinc-800/90 text-[9px] uppercase tracking-wider text-zinc-500">
            <th className="px-2 py-1.5 font-medium">Tag</th>
            <th className="px-2 py-1.5 font-medium">Name</th>
            <th className="px-2 py-1.5 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {renderNodes({
            nodes: parsed.nodes,
            depth: 0,
            keyPrefix: message.timestamp,
            collapsedGroups,
            collapsedEntries,
            onToggleGroup: toggleGroup,
            onToggleEntry: toggleEntry,
            onOpenReference: (event, node, groupContext, key) => {
              openReference(
                event,
                node.tag,
                node.value,
                groupContext,
                key,
                parsed.messageName
              );
            },
            onOpenGroupReference: (event, group, key) => {
              openReference(
                event,
                group.counterTag,
                group.countValue,
                undefined,
                key,
                parsed.messageName
              );
            },
            dictionary,
            sensitiveFields,
            revealedSensitive,
            onToggleSensitive: toggleSensitive,
          })}
        </tbody>
      </table>

      {selectedReference && (
        <FieldReferencePopover
          reference={selectedReference.reference}
          anchor={selectedReference.anchor}
          onClose={() => setSelectedReference(null)}
        />
      )}
    </div>
  );
};

interface RenderNodesOptions {
  nodes: FixParsedNode[];
  depth: number;
  keyPrefix: string;
  collapsedGroups: Set<string>;
  collapsedEntries: Set<string>;
  dictionary: FixDictionary;
  sensitiveFields: Map<number, FixSensitiveField>;
  revealedSensitive: Set<number>;
  onToggleSensitive: (sourceIndex: number) => void;
  onToggleGroup: (key: string) => void;
  onToggleEntry: (key: string) => void;
  onOpenReference: (
    event: React.MouseEvent<HTMLElement>,
    node: FixParsedFieldNode,
    groupContext: string | undefined,
    key: string
  ) => void;
  onOpenGroupReference: (
    event: React.MouseEvent<HTMLElement>,
    node: FixParsedGroupNode,
    key: string
  ) => void;
}

function renderNodes(options: RenderNodesOptions): React.ReactNode[] {
  const {
    nodes,
    depth,
    keyPrefix,
    collapsedGroups,
    collapsedEntries,
    dictionary,
    sensitiveFields,
    revealedSensitive,
    onToggleSensitive,
    onToggleGroup,
    onToggleEntry,
    onOpenReference,
    onOpenGroupReference,
  } = options;

  return nodes.flatMap((node, index) => {
    const key = `${keyPrefix}/${node.kind}-${node.kind === 'field' ? node.tagText : node.counterTag}-${index}`;
    if (node.kind === 'field') {
      const sensitiveValue = resolveSensitiveFieldValue(sensitiveFields, node);
      return (
        <FieldRow
          key={key}
          node={node}
          depth={depth}
          dictionary={dictionary}
          sensitiveValue={sensitiveValue}
          sensitiveRevealed={revealedSensitive.has(node.sourceIndex)}
          onToggleSensitive={() => onToggleSensitive(node.sourceIndex)}
          onOpenReference={(event) =>
            onOpenReference(
              event,
              node,
              node.groupName
                ? `${node.groupName}[${node.entryIndex ?? 1}]`
                : undefined,
              key
            )
          }
        />
      );
    }

    const groupCollapsed = collapsedGroups.has(key);
    const groupRows: React.ReactNode[] = [
      <GroupCountRow
        key={`${key}/count`}
        node={node}
        depth={depth}
        collapsed={groupCollapsed}
        dictionary={dictionary}
        onToggle={() => onToggleGroup(key)}
        onOpenReference={(event) => onOpenGroupReference(event, node, `${key}/count`)}
      />,
    ];

    if (!groupCollapsed) {
      node.entries.forEach((entry) => {
        const entryKey = `${key}/entry-${entry.index}`;
        const entryCollapsed = collapsedEntries.has(entryKey);
        groupRows.push(
          <GroupEntryRow
            key={`${entryKey}/header`}
            entry={entry}
            depth={depth}
            collapsed={entryCollapsed}
            onToggle={() => onToggleEntry(entryKey)}
          />
        );
        if (!entryCollapsed) {
          groupRows.push(
            ...renderNodes({
              ...options,
              nodes: entry.nodes,
              depth: depth + 1,
              keyPrefix: entryKey,
            })
          );
        }
      });
    }

    return groupRows;
  });
}

function FieldRow({
  node,
  depth,
  dictionary,
  sensitiveValue,
  sensitiveRevealed,
  onToggleSensitive,
  onOpenReference,
}: {
  node: FixParsedFieldNode;
  depth: number;
  dictionary: FixDictionary;
  sensitiveValue?: string;
  sensitiveRevealed: boolean;
  onToggleSensitive: () => void;
  onOpenReference: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  const isSensitive = sensitiveValue !== undefined;
  const effectiveValue =
    isSensitive && sensitiveRevealed ? sensitiveValue : node.value;
  const value = formatFixFieldValue(dictionary, node.definition, effectiveValue);
  const isMessageType = node.tag === 35 && Boolean(value.label);
  const nameClass =
    node.section === 'header'
      ? 'text-sky-300/90'
      : node.section === 'trailer'
      ? 'text-zinc-500'
      : 'text-zinc-300';

  return (
    <tr className="border-b border-zinc-900/70 last:border-b-0 hover:bg-zinc-900/30">
      <td className="align-top px-2 py-1.5" style={{ paddingLeft: 8 + depth * 12 }}>
        <FieldReferenceButton
          onClick={onOpenReference}
          label={node.tagText}
          className="text-zinc-500 font-mono"
        />
      </td>
      <td className="align-top px-2 py-1.5">
        <FieldReferenceButton
          onClick={onOpenReference}
          label={node.name || 'Unknown field'}
          className={nameClass}
        />
      </td>
      <td className="align-top px-2 py-1.5 text-[11px] text-zinc-200 select-text">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {value.raw === '' ? (
              <span className="text-zinc-600">(empty)</span>
            ) : isMessageType ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="inline-flex rounded-sm border border-blue-800/70 bg-blue-950/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-200">
                  {value.raw}
                </span>
                <span className="text-zinc-200">{value.label}</span>
              </span>
            ) : (
              <span className="break-all">
                <span className="font-mono">{value.raw}</span>
                {value.label && (
                  <span className="text-zinc-400">
                    {' · '}
                    {value.label}
                  </span>
                )}
                {!value.label && value.secondary && (
                  <span className="text-zinc-500">
                    {' · '}
                    {value.secondary}
                  </span>
                )}
              </span>
            )}
          </div>
          {isSensitive && (
            <button
              type="button"
              onClick={onToggleSensitive}
              aria-label={
                sensitiveRevealed
                  ? 'Hide sensitive value'
                  : 'Show sensitive value'
              }
              aria-pressed={sensitiveRevealed}
              title={
                sensitiveRevealed
                  ? 'Hide sensitive value'
                  : 'Show sensitive value'
              }
              className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
            >
              {sensitiveRevealed ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function GroupCountRow({
  node,
  depth,
  collapsed,
  dictionary,
  onToggle,
  onOpenReference,
}: {
  node: FixParsedGroupNode;
  depth: number;
  collapsed: boolean;
  dictionary: FixDictionary;
  onToggle: () => void;
  onOpenReference: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  const counter = dictionary.fieldByTag(node.counterTag);
  const countLabel = `${node.actualCount} ${
    node.actualCount === 1 ? 'entry' : 'entries'
  }`;
  const hasCountMismatch =
    node.declaredCount !== null && node.declaredCount !== node.actualCount;

  return (
    <tr className="border-y border-amber-900/35 bg-amber-950/10">
      <td className="align-top px-2 py-1.5" style={{ paddingLeft: 8 + depth * 12 }}>
        <FieldReferenceButton
          onClick={onOpenReference}
          label={node.tagText}
          className="font-mono text-amber-500/90"
        />
      </td>
      <td className="align-top px-2 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onToggle}
            className="flex-shrink-0 text-amber-500/80 hover:text-amber-300"
            title={collapsed ? 'Expand repeating group' : 'Collapse repeating group'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
          </button>
          <FieldReferenceButton
            onClick={onOpenReference}
            label={node.name}
            className="text-amber-300"
          />
          {node.warnings.length > 0 && (
            <span
              className="flex-shrink-0 text-amber-400"
              title={node.warnings.join('\n')}
            >
              <AlertTriangle size={10} />
            </span>
          )}
        </div>
      </td>
      <td className="align-top px-2 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            hasCountMismatch
              ? 'border-red-800/70 bg-red-950/30 text-red-300'
              : 'border-amber-700/60 bg-amber-950/40 text-amber-200'
          }`}
          title={
            hasCountMismatch
              ? `Dictionary count is ${node.declaredCount}; ${node.actualCount} entries parsed`
              : counter?.description
          }
        >
          {countLabel}
          {hasCountMismatch && <AlertTriangle size={9} />}
        </button>
      </td>
    </tr>
  );
}

function GroupEntryRow({
  entry,
  depth,
  collapsed,
  onToggle,
}: {
  entry: { index: number; summary: string };
  depth: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className="border-y border-amber-900/20 bg-zinc-900/35">
      <td colSpan={3} className="px-2 py-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-1.5 text-left text-[10px] text-amber-200/80 hover:text-amber-100"
          style={{ paddingLeft: depth * 12 }}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight size={10} className="flex-shrink-0" />
          ) : (
            <ChevronDown size={10} className="flex-shrink-0" />
          )}
          <span className="font-semibold tabular-nums">[{entry.index}]</span>
          <span className="truncate">{entry.summary}</span>
        </button>
      </td>
    </tr>
  );
}

function RawFieldTable({
  fields,
  sensitiveFields,
  revealedSensitive,
  onToggleSensitive,
}: {
  fields: FixMessageEvent['fields'];
  sensitiveFields: Map<number, FixSensitiveField>;
  revealedSensitive: Set<number>;
  onToggleSensitive: (sourceIndex: number) => void;
}) {
  return (
    <div className="mt-1.5 border border-zinc-800/70">
      {fields.map(([tag, value], index) => {
        const sensitive = sensitiveFields.get(index);
        const isSensitive = sensitive?.tag === tag;
        const revealed = isSensitive && revealedSensitive.has(index);
        const displayValue = revealed ? sensitive.value : value;
        return (
          <div
            key={`${tag}-${index}`}
            className="grid grid-cols-[48px_minmax(0,1fr)] border-b border-zinc-900/70 last:border-b-0"
          >
            <span className="px-2 py-1 border-r border-zinc-900/70 text-[10px] font-mono text-zinc-500">
              {tag}
            </span>
            <div className="flex items-start gap-2 px-2 py-1">
              <span className="min-w-0 flex-1 text-[11px] font-mono text-zinc-300 break-all select-text">
                {displayValue || <span className="text-zinc-600">(empty)</span>}
              </span>
              {isSensitive && (
                <button
                  type="button"
                  onClick={() => onToggleSensitive(index)}
                  aria-label={
                    revealed ? 'Hide sensitive value' : 'Show sensitive value'
                  }
                  aria-pressed={revealed}
                  title={
                    revealed ? 'Hide sensitive value' : 'Show sensitive value'
                  }
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
                >
                  {revealed ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function toggleSetValue(current: Set<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
