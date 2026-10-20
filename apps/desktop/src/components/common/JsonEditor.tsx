import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { tokenizeJsonLine, type VariableSource } from '../../utils/variableHighlight';
import { handleEditorKeyDown } from '../../utils/editorKeyboard';
import { EditorHistory } from '../../utils/editorHistory';
import { findHoveredVariableToken, type BoundingBox } from '../../utils/variableHover';
import {
  findFoldableRanges,
  foldText,
  unfoldText,
  toggleFoldRange,
} from '../../utils/codeFolding';
import { VariableHoverCard } from './VariableHoverCard';
import { ChevronDown, ChevronRight } from 'lucide-react';
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

  // Code folding state: foldMap maps token -> hidden interior string
  const [foldMap, setFoldMap] = useState<Record<string, string>>({});
  const [displayValue, setDisplayValue] = useState<string>(value);

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

  // Sync external value updates (e.g. Generate Example, Beautify) into history and display
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.recordExternalChange(value);
    }
    const currentFull = unfoldText(displayValue, foldMap);
    if (value !== currentFull) {
      setFoldMap({});
      setDisplayValue(value);
    }
  }, [value]);

  const ranges = useMemo(() => findFoldableRanges(displayValue), [displayValue]);
  const hasChildRanges = useMemo(() => {
    const full = unfoldText(displayValue, foldMap);
    return findFoldableRanges(full).some((r) => r.isChild);
  }, [displayValue, foldMap]);
  const isAnyFolded = Object.keys(foldMap).length > 0;

  function handleCollapseChildren() {
    const full = unfoldText(displayValue, foldMap);
    const fullRanges = findFoldableRanges(full);
    const children = fullRanges.filter((r) => r.isChild);
    if (children.length === 0) return;

    const { foldedText, foldMap: newMap } = foldText(full, children);
    setFoldMap(newMap);
    setDisplayValue(foldedText);
  }

  function handleExpandAll() {
    if (!isAnyFolded) return;
    const full = unfoldText(displayValue, foldMap);
    setFoldMap({});
    setDisplayValue(full);
    onChange(full);
  }

  function handleToggleLineFold(lineIdx: number) {
    const res = toggleFoldRange(displayValue, lineIdx, ranges, foldMap);
    setDisplayValue(res.text);
    setFoldMap(res.foldMap);
    const full = unfoldText(res.text, res.foldMap);
    onChange(full);
  }

  function handleBeautify() {
    setFormatError(null);
    try {
      const full = unfoldText(displayValue, foldMap);
      const parsed = JSON.parse(full);
      const formatted = JSON.stringify(parsed, null, 2);
      setFoldMap({});
      setDisplayValue(formatted);
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
      const full = unfoldText(displayValue, foldMap);
      const parsed = JSON.parse(full);
      const minified = JSON.stringify(parsed);
      setFoldMap({});
      setDisplayValue(minified);
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
      displayValue,
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
      const isUndoRedo =
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y');

      if (isUndoRedo) {
        setFoldMap({});
        setDisplayValue(result.text);
        onChange(result.text);
      } else {
        setDisplayValue(result.text);
        const full = unfoldText(result.text, foldMap);
        historyRef.current?.recordChange(full, result.selectionStart, result.selectionEnd, true);
        onChange(full);
      }

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(result.selectionStart, result.selectionEnd);
        }
      });
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextVal = e.target.value;
    setDisplayValue(nextVal);
    const full = unfoldText(nextVal, foldMap);
    historyRef.current?.recordChange(
      full,
      e.target.selectionStart,
      e.target.selectionEnd,
      false
    );
    onChange(full);
  }

  const lines = displayValue.split('\n');
  const lineCount = Math.max(1, lines.length);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  // Highlight syntax tokens: keys, strings, numbers, booleans, variables {{VAR}} (defined vs undefined)
  function highlightJson(raw: string): React.ReactNode[] {
    const rawLines = raw.split('\n');
    return rawLines.map((line, lIdx) => {
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

            // Fold token badge highlight
            if (token.text.includes('/* ... #')) {
              colorClass = 'text-amber-300 font-mono text-[10px] bg-zinc-800 border border-zinc-700 px-1 py-0.2 rounded cursor-pointer';
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
          {lIdx < rawLines.length - 1 && '\n'}
        </React.Fragment>
      );
    });
  }

  return (
    <div className={`relative flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden ${className}`}>
      {/* Editor Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 select-none text-[11px]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-400 uppercase tracking-wider">JSON</span>
          {formatError && (
            <span className="text-red-400 font-mono truncate max-w-xs">{formatError}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {hasChildRanges && (
            <button
              type="button"
              onClick={handleCollapseChildren}
              className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded font-medium transition"
              title="Collapse child JSON objects and arrays"
            >
              Collapse Children
            </button>
          )}
          {isAnyFolded && (
            <button
              type="button"
              onClick={handleExpandAll}
              className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded font-medium transition"
              title="Expand all collapsed blocks"
            >
              Expand All
            </button>
          )}
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
          className="py-3 pl-2 pr-1.5 select-none text-zinc-600 font-mono text-xs text-right border-r border-zinc-850 bg-zinc-950/80 overflow-hidden flex-shrink-0"
          style={{ minWidth: '3.2rem' }}
        >
          {lineNumbers.map((num, idx) => {
            const range = ranges.find((r) => r.startLine === idx);
            const lineText = lines[idx] || '';
            const hasFoldToken = Object.keys(foldMap).some((token) => lineText.includes(token));
            const canFold = Boolean(range && range.startLine < range.endLine);

            return (
              <div key={num} className="leading-5 h-5 flex items-center justify-end gap-1">
                <span className="text-[11px] text-zinc-600">{num}</span>
                {hasFoldToken ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => handleToggleLineFold(idx)}
                    className="p-0.5 text-zinc-400 hover:text-zinc-200 pointer-events-auto"
                    title="Expand block"
                  >
                    <ChevronRight size={11} />
                  </button>
                ) : canFold ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => handleToggleLineFold(idx)}
                    className="p-0.5 text-zinc-500 hover:text-zinc-300 pointer-events-auto"
                    title="Collapse block"
                  >
                    <ChevronDown size={11} />
                  </button>
                ) : (
                  <span className="w-3" />
                )}
              </div>
            );
          })}
        </div>

        {/* Text Area & Overlay */}
        <div className="relative flex-1 h-full overflow-hidden">
          {/* Syntax Highlight Overlay */}
          <pre
            ref={preRef}
            aria-hidden="true"
            className="absolute inset-0 m-0 py-3 px-3 pointer-events-none whitespace-pre overflow-hidden text-zinc-200 font-mono text-xs leading-5 select-none"
          >
            {highlightJson(displayValue)}
          </pre>

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={displayValue}
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
