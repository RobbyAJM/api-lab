import React, { useState } from 'react';
import { VariableInput } from './VariableInput';
import { Plus, Trash2, Edit3, List, Settings, Shield } from 'lucide-react';
import type { VariableSource } from '../../utils/variableHighlight';

export type KeyValueRow = [string, string, string?, boolean?];

export interface InheritedEntry {
  key: string;
  value: string;
  description?: string;
  sourceLabel: string;
  onEditSource?: () => void;
}

export interface KeyValueTableProps {
  title: string;
  items: Array<[string, string, string?, boolean?] | [string, string, string?] | [string, string]>;
  onChange: (items: any[]) => void;
  inheritedEntries?: InheritedEntry[];
  variables?: VariableSource;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  descriptionPlaceholder?: string;
  addLabel?: string;
  readOnlyKeys?: boolean;
  hideAdd?: boolean;
  hideDelete?: boolean;
  hideBulkEdit?: boolean;
  showCheckbox?: boolean;
  hideCheckbox?: boolean;
}

export const KeyValueTable: React.FC<KeyValueTableProps> = ({
  title,
  items,
  onChange,
  inheritedEntries = [],
  variables,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value (or {{VAR}})',
  descriptionPlaceholder = 'Description',
  addLabel = 'Add Row',
  readOnlyKeys = false,
  hideAdd = false,
  hideDelete = false,
  hideBulkEdit = false,
  showCheckbox = true,
  hideCheckbox = false,
}) => {
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const enableCheckbox = showCheckbox && !hideCheckbox;

  // Enter bulk edit mode
  function handleToggleBulk() {
    if (!isBulkEdit) {
      const text = items
        .filter(([k]) => k.trim())
        .map(([k, v, d, enabled]) => {
          const prefix = enabled === false ? '// ' : '';
          return d && d.trim() ? `${prefix}${k}: ${v} # ${d.trim()}` : `${prefix}${k}: ${v}`;
        })
        .join('\n');
      setBulkText(text);
      setIsBulkEdit(true);
    } else {
      // Parse bulk text back into rows
      const parsed: [string, string, string, boolean][] = bulkText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const isLineDisabled = line.startsWith('//');
          const cleanLine = isLineDisabled ? line.slice(2).trim() : line;
          let desc = '';
          let rest = cleanLine;
          const hashIdx = cleanLine.indexOf('#');
          if (hashIdx !== -1) {
            desc = cleanLine.slice(hashIdx + 1).trim();
            rest = cleanLine.slice(0, hashIdx).trim();
          }
          const idx = rest.indexOf(':');
          if (idx === -1) return [rest.trim(), '', desc, !isLineDisabled];
          return [rest.slice(0, idx).trim(), rest.slice(idx + 1).trim(), desc, !isLineDisabled];
        });
      onChange(parsed);
      setIsBulkEdit(false);
    }
  }

  function handleUpdateRow(index: number, keyValDesc: [string, string, string]) {
    const next: [string, string, string, boolean][] = items.map(([k, v, d, en]) => [
      k,
      v,
      d ?? '',
      en !== false,
    ]);
    const currentEnabled = items[index]?.[3] !== false;
    next[index] = [keyValDesc[0], keyValDesc[1], keyValDesc[2], currentEnabled];
    onChange(next);
  }

  function handleToggleRow(index: number, checked: boolean) {
    const next: [string, string, string, boolean][] = items.map(([k, v, d, en]) => [
      k,
      v,
      d ?? '',
      en !== false,
    ]);
    if (next[index]) {
      next[index][3] = checked;
      onChange(next);
    }
  }

  function handleAddRow() {
    const next: [string, string, string, boolean][] = items.map(([k, v, d, en]) => [
      k,
      v,
      d ?? '',
      en !== false,
    ]);
    onChange([...next, ['', '', '', true]]);
  }

  function handleDeleteRow(index: number) {
    const next: [string, string, string, boolean][] = items
      .filter((_, i) => i !== index)
      .map(([k, v, d, en]) => [k, v, d ?? '', en !== false]);
    onChange(next);
  }

  function handleClearAll() {
    onChange([]);
  }

  const gridCols = enableCheckbox
    ? hideDelete
      ? 'grid-cols-[24px_1fr_1fr_1fr]'
      : 'grid-cols-[24px_1fr_1fr_1fr_28px]'
    : hideDelete
      ? 'grid-cols-[1fr_1fr_1fr]'
      : 'grid-cols-[1fr_1fr_1fr_28px]';

  return (
    <div className="space-y-2 text-xs">
      {/* Top Action Header */}
      <div className="flex items-center justify-between pb-1 select-none">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-300">{title}</span>
          <span className="text-[10px] font-mono text-zinc-500">
            {items.length} {items.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!hideBulkEdit && (
            <button
              type="button"
              onClick={handleToggleBulk}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition"
              title={isBulkEdit ? 'Switch to Key-Value Form' : 'Bulk Edit (Raw text)'}
            >
              {isBulkEdit ? (
                <>
                  <List size={11} />
                  <span>Key-Value</span>
                </>
              ) : (
                <>
                  <Edit3 size={11} />
                  <span>Bulk Edit</span>
                </>
              )}
            </button>
          )}

          {!isBulkEdit && (
            <>
              {!hideDelete && items.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] text-zinc-500 hover:text-red-400 px-1.5 py-0.5 transition"
                  title="Clear all entries"
                >
                  Clear All
                </button>
              )}
              {!hideAdd && (
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
                >
                  <Plus size={11} />
                  <span>{addLabel}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Editor Surface */}
      {isBulkEdit ? (
        <div className="space-y-1">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`key: value # description\n// disabled_key: value`}
            className="w-full h-48 bg-zinc-900 border border-zinc-800 rounded-md p-3 font-mono text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 resize-none"
            spellCheck={false}
          />
          <p className="text-[10px] text-zinc-500 font-sans">
            One entry per line in <code>key: value # description</code> format. Prefix with <code>//</code> to disable. Click "Key-Value" above when done.
          </p>
        </div>
      ) : (
        <div className="border border-zinc-800/80 rounded-md overflow-hidden bg-zinc-950">
          {/* Table Header */}
          <div className={`grid ${gridCols} gap-2 bg-zinc-900/60 border-b border-zinc-800/80 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 select-none items-center`}>
            {enableCheckbox && <div className="text-center"></div>}
            <div>Key</div>
            <div>Value</div>
            <div>Description</div>
            {!hideDelete && <div className="text-right pr-1">Action</div>}
          </div>

          {/* Table Rows */}
          {items.length === 0 && inheritedEntries.length === 0 ? (
            <div className="py-6 text-center text-zinc-500 font-sans select-none">
              No entries. {!hideAdd && <>Click <strong className="text-zinc-400 font-medium">"{addLabel}"</strong> to add one.</>}
            </div>
          ) : (
            <div className="divide-y divide-zinc-900">
              {/* Inherited Uneditable Entries */}
              {inheritedEntries.map((entry, idx) => (
                <div
                  key={`inherited-${idx}`}
                  className={`grid ${gridCols} gap-2 items-center px-2 py-1.5 bg-zinc-950/60 transition group`}
                  title={`Inherited authorization from ${entry.sourceLabel}. Cannot be edited directly here.`}
                >
                  {enableCheckbox && (
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={true}
                        disabled
                        className="rounded border-zinc-800 bg-zinc-950 text-secondary cursor-not-allowed opacity-60"
                        title="Inherited entry always enabled"
                      />
                    </div>
                  )}

                  {/* Key Input */}
                  <div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={entry.key}
                        readOnly
                        disabled
                        className="w-full bg-zinc-950 text-zinc-400 border border-zinc-800/60 rounded px-2.5 py-1 text-xs font-mono h-7 cursor-not-allowed select-text pr-16"
                      />
                      <span className="absolute right-1.5 px-1 py-0.5 rounded text-[9px] font-mono tracking-wider uppercase text-zinc-400 bg-zinc-900 border border-zinc-800 select-none">
                        Inherited
                      </span>
                    </div>
                  </div>

                  {/* Value Input */}
                  <div>
                    <input
                      type="text"
                      value={entry.value}
                      readOnly
                      disabled
                      className="w-full bg-zinc-950 text-zinc-400 border border-zinc-800/60 rounded px-2.5 py-1 text-xs font-mono h-7 cursor-not-allowed select-text"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <div
                      className="w-full bg-zinc-950/80 border border-zinc-800/40 rounded px-2.5 py-1 text-[11px] text-zinc-400 truncate flex items-center gap-1.5 h-7 cursor-help"
                      title={`Inherited from ${entry.sourceLabel}. Adjust in settings.`}
                    >
                      <Shield size={11} className="text-secondary flex-shrink-0" />
                      <span className="truncate">{entry.description || `Inherited from ${entry.sourceLabel}`}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  {!hideDelete && (
                    <div className="text-right pr-1">
                      {entry.onEditSource ? (
                        <button
                          type="button"
                          onClick={entry.onEditSource}
                          className="p-1 rounded text-zinc-400 hover:text-secondary hover:bg-zinc-800 transition"
                          title={`Edit inherited authorization in ${entry.sourceLabel} settings`}
                        >
                          <Settings size={12} />
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-600 select-none px-1">locked</span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Standard Items */}
              {items.map(([k, v, d, en], idx) => {
                const isRowEnabled = en !== false;
                return (
                  <div
                    key={idx}
                    className={`grid ${gridCols} gap-2 items-center px-2 py-1.5 hover:bg-zinc-900/40 transition group ${
                      !isRowEnabled ? 'opacity-60' : ''
                    }`}
                  >
                    {enableCheckbox && (
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isRowEnabled}
                          onChange={(e) => handleToggleRow(idx, e.target.checked)}
                          className="rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-0 cursor-pointer ml-1"
                          title={isRowEnabled ? 'Disable row' : 'Enable row'}
                        />
                      </div>
                    )}

                    {/* Key Input */}
                    <div>
                      <input
                        type="text"
                        value={k}
                        readOnly={readOnlyKeys}
                        onChange={(e) =>
                          handleUpdateRow(idx, [e.target.value, v ?? '', d ?? ''])
                        }
                        placeholder={keyPlaceholder}
                        className={`w-full border rounded px-2.5 py-1 text-xs font-mono h-7 focus:outline-none ${
                          readOnlyKeys
                            ? 'bg-zinc-950 text-zinc-400 border-zinc-800/60 cursor-default'
                            : isRowEnabled
                              ? 'bg-zinc-900 border-zinc-800 text-zinc-200 focus:border-zinc-700'
                              : 'bg-zinc-900/60 border-zinc-800/60 text-zinc-400 focus:border-zinc-700 line-through'
                        }`}
                      />
                    </div>

                    {/* Value Input */}
                    <div>
                      <div className="w-full bg-zinc-900 border border-zinc-800 rounded focus-within:border-zinc-700 h-7 flex items-center">
                        <VariableInput
                          value={v ?? ''}
                          onChange={(newVal) =>
                            handleUpdateRow(idx, [k, newVal, d ?? ''])
                          }
                          variables={variables}
                          placeholder={valuePlaceholder}
                          className={`w-full h-full text-xs font-mono ${!isRowEnabled ? 'text-zinc-400' : ''}`}
                        />
                      </div>
                    </div>

                    {/* Description Input */}
                    <div>
                      <input
                        type="text"
                        value={d ?? ''}
                        onChange={(e) =>
                          handleUpdateRow(idx, [k, v ?? '', e.target.value])
                        }
                        placeholder={descriptionPlaceholder}
                        className={`w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 h-7 ${
                          isRowEnabled ? 'text-zinc-300' : 'text-zinc-500'
                        }`}
                      />
                    </div>

                    {/* Actions */}
                    {!hideDelete && (
                      <div className="text-right pr-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(idx)}
                          className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-900 transition"
                          title="Delete row"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
