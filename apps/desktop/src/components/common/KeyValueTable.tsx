import React, { useState } from 'react';
import { VariableInput } from './VariableInput';
import { Plus, Trash2, Edit3, List } from 'lucide-react';
import type { VariableSource } from '../../utils/variableHighlight';

export interface KeyValueTableProps {
  title: string;
  items: [string, string][];
  onChange: (items: [string, string][]) => void;
  variables?: VariableSource;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}

export const KeyValueTable: React.FC<KeyValueTableProps> = ({
  title,
  items,
  onChange,
  variables,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value (or {{VAR}})',
  addLabel = 'Add Row',
}) => {
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Enter bulk edit mode
  function handleToggleBulk() {
    if (!isBulkEdit) {
      const text = items
        .filter(([k]) => k.trim())
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      setBulkText(text);
      setIsBulkEdit(true);
    } else {
      // Parse bulk text back into rows
      const parsed: [string, string][] = bulkText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const idx = line.indexOf(':');
          if (idx === -1) return [line.trim(), ''];
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        });
      onChange(parsed);
      setIsBulkEdit(false);
    }
  }

  function handleUpdateRow(index: number, keyVal: [string, string]) {
    const next = [...items];
    next[index] = keyVal;
    onChange(next);
  }

  function handleAddRow() {
    onChange([...items, ['', '']]);
  }

  function handleDeleteRow(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function handleClearAll() {
    onChange([]);
  }

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

          {!isBulkEdit && (
            <>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] text-zinc-500 hover:text-red-400 px-1.5 py-0.5 transition"
                  title="Clear all entries"
                >
                  Clear All
                </button>
              )}
              <button
                type="button"
                onClick={handleAddRow}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
              >
                <Plus size={11} />
                <span>{addLabel}</span>
              </button>
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
            placeholder={`key: value\nkey2: value2`}
            className="w-full h-48 bg-zinc-900 border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 resize-none"
            spellCheck={false}
          />
          <p className="text-[10px] text-zinc-500 font-sans">
            One entry per line in <code>key: value</code> format. Click "Key-Value" above when done.
          </p>
        </div>
      ) : (
        <div className="border border-zinc-800/80 rounded-lg overflow-hidden bg-zinc-950">
          {/* Table Header */}
          <div className="grid grid-cols-12 bg-zinc-900/60 border-b border-zinc-800/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 select-none">
            <div className="col-span-5">Key</div>
            <div className="col-span-6 pl-2">Value</div>
            <div className="col-span-1 text-right">Action</div>
          </div>

          {/* Table Rows */}
          {items.length === 0 ? (
            <div className="py-6 text-center text-zinc-500 font-sans select-none">
              No entries. Click <strong className="text-zinc-400 font-medium">"{addLabel}"</strong> to add one.
            </div>
          ) : (
            <div className="divide-y divide-zinc-900">
              {items.map(([k, v], idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-center px-2 py-1.5 hover:bg-zinc-900/40 transition group"
                >
                  {/* Key Input */}
                  <div className="col-span-5 pr-1">
                    <input
                      type="text"
                      value={k}
                      onChange={(e) => handleUpdateRow(idx, [e.target.value, v])}
                      placeholder={keyPlaceholder}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-700 h-7"
                    />
                  </div>

                  {/* Value Input */}
                  <div className="col-span-6 px-1">
                    <div className="w-full bg-zinc-900 border border-zinc-800 rounded focus-within:border-zinc-700 h-7 flex items-center">
                      <VariableInput
                        value={v}
                        onChange={(newVal) => handleUpdateRow(idx, [k, newVal])}
                        variables={variables}
                        placeholder={valuePlaceholder}
                        className="w-full h-full text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 text-right pr-1">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(idx)}
                      className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-900 transition"
                      title="Delete row"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
