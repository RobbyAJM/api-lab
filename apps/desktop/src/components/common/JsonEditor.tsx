import React, { useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { tokenizeJsonLine, type VariableSource } from '../../utils/variableHighlight';
import { handleEditorKeyDown } from '../../utils/editorKeyboard';
import { EditorHistory } from '../../utils/editorHistory';
import { findHoveredVariableToken, type BoundingBox } from '../../utils/variableHover';
import { VariableHoverCard } from './VariableHoverCard';
import type { Environment, VariableResponse } from '@api-lab/api-types';

interface JsonEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  variables?: VariableSource;
}

export const JsonEditor: React.FC<JsonEditorProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
  variables,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<EditorHistory | null>(null);
  const [formatError, setFormatError] = useState<string | null>(null);
  const clearTimerRef = useRef<any>(null);

  const { activeWorkspaceId, activeEnvironmentId } = useAppStore();

  const [hoverState, setHoverState] = useState<{
    varName: string;
    rect: BoundingBox;
  } | null>(null);

  // Fetch active environment variables for rich metadata
  const { data: envVars = [] } = useQuery<VariableResponse[]>({
    queryKey: ['variables', activeEnvironmentId],
    queryFn: () =>
      activeEnvironmentId
        ? apiRequest<VariableResponse[]>(`/environments/${activeEnvironmentId}/variables`)
        : Promise.resolve([]),
    enabled: !!activeEnvironmentId,
  });

  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ['environments', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? apiRequest<Environment[]>(`/workspaces/${activeWorkspaceId}/environments`)
        : Promise.resolve([]),
    enabled: !!activeWorkspaceId,
  });

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId);
  const effectiveVars = variables !== undefined ? variables : envVars;

  function scheduleClear() {
    clearTimerRef.current = setTimeout(() => {
      setHoverState(null);
    }, 200);
  }

  function cancelClear() {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLTextAreaElement>) {
    const hit = findHoveredVariableToken(preRef.current, e.clientX, e.clientY);
    if (hit) {
      cancelClear();
      setHoverState({ varName: hit.name, rect: hit.rect });
    } else {
      if (hoverState) {
        scheduleClear();
      }
    }
  }

  function handleMouseLeave() {
    scheduleClear();
  }

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  if (!historyRef.current) {
    historyRef.current = new EditorHistory(value, 0, 0);
  }

  function handleBeautify() {
    setFormatError(null);
    try {
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 2);
      historyRef.current?.recordChange(formatted, 0, 0, true);
      onChange(formatted);
    } catch (err: any) {
      setFormatError(`Invalid JSON: ${err.message}`);
      setTimeout(() => setFormatError(null), 3500);
    }
  }

  function handleMinify() {
    setFormatError(null);
    try {
      const parsed = JSON.parse(value);
      const minified = JSON.stringify(parsed);
      historyRef.current?.recordChange(minified, 0, 0, true);
      onChange(minified);
    } catch (err: any) {
      setFormatError(`Invalid JSON: ${err.message}`);
      setTimeout(() => setFormatError(null), 3500);
    }
  }

  function handleScroll(e: React.UIEvent<HTMLTextAreaElement>) {
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Ignore Ctrl+Enter / Cmd+Enter: parent shortcut runner executes request
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      return;
    }

    const result = handleEditorKeyDown(
      value,
      textarea.selectionStart,
      textarea.selectionEnd,
      {
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
      },
      historyRef.current || undefined
    );

    if (result) {
      e.preventDefault();
      // If it wasn't an undo/redo (it's tab, enter, pair), record to history
      const isUndoRedo = (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y');
      if (!isUndoRedo && historyRef.current) {
        historyRef.current.recordChange(result.text, result.selectionStart, result.selectionEnd, true);
      }
      onChange(result.text);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(result.selectionStart, result.selectionEnd);
        }
      });
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextVal = e.target.value;
    historyRef.current?.recordChange(
      nextVal,
      e.target.selectionStart,
      e.target.selectionEnd,
      false
    );
    onChange(nextVal);
  }

  const lineCount = Math.max(1, value.split('\n').length);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  // Highlight syntax tokens: keys, strings, numbers, booleans, variables {{VAR}} (defined vs undefined)
  function highlightJson(raw: string): React.ReactNode[] {
    const lines = raw.split('\n');
    return lines.map((line, lIdx) => {
      const tokens = tokenizeJsonLine(line, effectiveVars);
      return (
        <React.Fragment key={lIdx}>
          {tokens.map((token, tIdx) => {
            let colorClass = 'text-zinc-200';
            if (token.type === 'variable') {
              colorClass = token.isDefined
                ? 'text-emerald-300 font-bold bg-emerald-950/60 border border-emerald-800/50 px-0.5 rounded'
                : 'text-rose-300 font-bold bg-rose-950/60 border border-rose-800/50 px-0.5 rounded';
            } else if (token.type === 'key') {
              colorClass = 'text-secondary font-medium';
            } else if (token.type === 'string') {
              colorClass = 'text-emerald-300';
            } else if (token.type === 'boolean') {
              colorClass = 'text-orange-400 font-medium';
            } else if (token.type === 'null') {
              colorClass = 'text-rose-400 font-medium italic';
            } else if (token.type === 'number') {
              colorClass = 'text-cyan-400';
            } else if (token.type === 'delimiter') {
              colorClass = 'text-zinc-500 font-bold';
            }

            return (
              <span
                key={`${lIdx}-${tIdx}`}
                data-var-name={token.type === 'variable' ? token.varName : undefined}
                className={colorClass}
                title={
                  token.type === 'variable'
                    ? token.isDefined
                      ? `Defined variable: ${token.varName}`
                      : `Undefined variable: ${token.varName}`
                    : undefined
                }
              >
                {token.text}
              </span>
            );
          })}
          {lIdx < lines.length - 1 && '\n'}
        </React.Fragment>
      );
    });
  }

  return (
    <div className={`relative flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden ${className}`}>
      {/* Editor Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 select-none text-[11px]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-400 uppercase tracking-wider">JSON</span>
          {formatError && (
            <span className="text-red-400 font-mono truncate max-w-xs">{formatError}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleBeautify}
            className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded font-medium transition"
            title="Prettify and indent JSON"
          >
            Beautify
          </button>
          <button
            type="button"
            onClick={handleMinify}
            className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded font-medium transition"
            title="Minify JSON payload"
          >
            Minify
          </button>
        </div>
      </div>

      {/* Editor View */}
      <div className="relative flex-1 flex font-mono text-xs overflow-hidden bg-zinc-950">
        {/* Line Numbers Gutter */}
        <div
          ref={lineNumbersRef}
          aria-hidden="true"
          className="py-3 pl-3 pr-2 select-none text-zinc-600 font-mono text-xs text-right border-r border-zinc-850 bg-zinc-950/80 overflow-hidden flex-shrink-0"
          style={{ minWidth: '2.5rem' }}
        >
          {lineNumbers.map((num) => (
            <div key={num} className="leading-5 h-5">
              {num}
            </div>
          ))}
        </div>

        {/* Text Area & Overlay */}
        <div className="relative flex-1 h-full overflow-hidden">
          {/* Syntax Highlight Overlay */}
          <pre
            ref={preRef}
            aria-hidden="true"
            className="absolute inset-0 m-0 py-3 px-3 pointer-events-none whitespace-pre overflow-hidden text-zinc-200 font-mono text-xs leading-5 select-none"
          >
            {highlightJson(value)}
          </pre>

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleTextareaChange}
            onKeyDown={(e) => {
              if (hoverState && (e.key === 'Escape' || e.key === 'Enter')) {
                setHoverState(null);
              }
              handleKeyDown(e);
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onScroll={handleScroll}
            placeholder={placeholder}
            spellCheck={false}
            className="absolute inset-0 w-full h-full m-0 py-3 px-3 font-mono text-xs leading-5 bg-transparent text-transparent caret-white resize-none focus:outline-none selection:bg-primary/40 whitespace-pre"
          />

          {/* Variable Hover Card */}
          {hoverState && (
            <VariableHoverCard
              varName={hoverState.varName}
              rect={hoverState.rect}
              variables={envVars.length > 0 ? envVars : effectiveVars}
              activeEnv={activeEnv}
              onClose={() => setHoverState(null)}
              onMouseEnter={cancelClear}
              onMouseLeave={scheduleClear}
            />
          )}
        </div>
      </div>
    </div>
  );
};
