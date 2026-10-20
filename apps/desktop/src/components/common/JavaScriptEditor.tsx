import React, { useRef, useState, useEffect, useMemo } from 'react';
import { tokenizeJsLine } from '../../utils/jsHighlight';
import { handleEditorKeyDown } from '../../utils/editorKeyboard';
import { EditorHistory } from '../../utils/editorHistory';
import {
  findFoldableRanges,
  collapseDocument,
  reconstructFullText,
  getChildFoldLines,
} from '../../utils/codeFolding';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface JavaScriptEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export const JavaScriptEditor: React.FC<JavaScriptEditorProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<EditorHistory | null>(null);

  // Set of folded original startLine indices
  const [foldedStartLines, setFoldedStartLines] = useState<Set<number>>(new Set());

  if (!historyRef.current) {
    historyRef.current = new EditorHistory(value, 0, 0);
  }

  // Sync external value updates (e.g. Snippet insertion) into history
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.recordExternalChange(value);
    }
  }, [value]);

  const ranges = useMemo(() => findFoldableRanges(value), [value]);
  const hasChildRanges = useMemo(() => ranges.some((r) => r.isChild), [ranges]);
  const isAnyFolded = foldedStartLines.size > 0;

  // Project visible lines and gutter numbers without mutating full document
  const { displayText, lines: displayLines } = useMemo(
    () => collapseDocument(value, foldedStartLines, ranges),
    [value, foldedStartLines, ranges]
  );

  function toggleFold(startLine: number) {
    setFoldedStartLines((prev) => {
      const next = new Set(prev);
      if (next.has(startLine)) {
        next.delete(startLine);
      } else {
        next.add(startLine);
      }
      return next;
    });
  }

  function handleCollapseChildren() {
    setFoldedStartLines(getChildFoldLines(ranges));
  }

  function handleExpandAll() {
    setFoldedStartLines(new Set());
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
      displayText,
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
        setFoldedStartLines(new Set());
        onChange(result.text);
      } else {
        const { fullText, activeFoldedLines } = reconstructFullText(
          result.text,
          value,
          foldedStartLines,
          ranges
        );
        setFoldedStartLines(activeFoldedLines);
        historyRef.current?.recordChange(fullText, result.selectionStart, result.selectionEnd, true);
        onChange(fullText);
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
    const { fullText, activeFoldedLines } = reconstructFullText(
      nextVal,
      value,
      foldedStartLines,
      ranges
    );
    setFoldedStartLines(activeFoldedLines);
    historyRef.current?.recordChange(
      fullText,
      e.target.selectionStart,
      e.target.selectionEnd,
      false
    );
    onChange(fullText);
  }

  function highlightJs(raw: string): React.ReactNode[] {
    const rawLines = raw.split('\n');
    return rawLines.map((line, lIdx) => {
      const tokens = tokenizeJsLine(line);
      const lineInfo = displayLines[lIdx];

      return (
        <React.Fragment key={lIdx}>
          {tokens.map((token, tIdx) => {
            let colorClass = 'text-zinc-200';
            if (token.type === 'keyword') {
              colorClass = 'text-secondary font-semibold';
            } else if (token.type === 'global') {
              colorClass = 'text-cyan-400 font-semibold';
            } else if (token.type === 'string') {
              colorClass = 'text-emerald-300';
            } else if (token.type === 'comment') {
              colorClass = 'text-zinc-500 italic';
            } else if (token.type === 'number') {
              colorClass = 'text-amber-400';
            } else if (token.type === 'boolean') {
              colorClass = 'text-orange-400 font-medium';
            } else if (token.type === 'operator') {
              colorClass = 'text-pink-400';
            } else if (token.type === 'delimiter') {
              colorClass = 'text-zinc-400 font-bold';
            }

            // Render clean fold badge pill when line contains the folded indicator
            if (token.text.trim() === '...' && lineInfo?.isFolded) {
              return (
                <span
                  key={`${lIdx}-${tIdx}`}
                  onClick={() => lineInfo.range && toggleFold(lineInfo.range.startLine)}
                  className="inline-flex items-center px-1.5 py-0.2 mx-0.5 text-[10px] font-mono text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 rounded cursor-pointer select-none transition pointer-events-auto"
                  title="Click to expand block"
                >
                  ...
                </span>
              );
            }

            return (
              <span key={`${lIdx}-${tIdx}`} className={colorClass}>
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
    <div
      className={`relative flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden ${className}`}
    >
      {/* Editor Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 select-none text-[11px]">
        <span className="font-semibold text-zinc-400 uppercase tracking-wider">JS SCRIPT</span>
        <div className="flex items-center gap-1.5">
          {hasChildRanges && (
            <button
              type="button"
              onClick={handleCollapseChildren}
              className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded font-medium transition"
              title="Collapse child blocks and objects"
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
        </div>
      </div>

      <div className="relative flex-1 flex font-mono text-xs overflow-hidden bg-zinc-950">
        {/* Line Numbers Gutter: preserves true original line numbers */}
        <div
          ref={lineNumbersRef}
          aria-hidden="true"
          className="py-3 pl-2 pr-1.5 select-none text-zinc-600 font-mono text-xs text-right border-r border-zinc-850 bg-zinc-950/80 overflow-hidden flex-shrink-0"
          style={{ minWidth: '3.2rem' }}
        >
          {displayLines.map((lineInfo) => {
            const num = lineInfo.originalLineIndex + 1;

            return (
              <div key={lineInfo.displayLineIndex} className="leading-5 h-5 flex items-center justify-end gap-1">
                <span className="text-[11px] text-zinc-600">{num}</span>
                {lineInfo.canFold ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => lineInfo.range && toggleFold(lineInfo.range.startLine)}
                    className="p-0.5 text-zinc-500 hover:text-zinc-200 pointer-events-auto transition rounded hover:bg-zinc-800"
                    title={lineInfo.isFolded ? 'Expand block' : 'Collapse block'}
                  >
                    {lineInfo.isFolded ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
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
            {highlightJs(displayText)}
          </pre>

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={displayText}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            placeholder={placeholder}
            spellCheck={false}
            className="absolute inset-0 w-full h-full m-0 py-3 px-3 font-mono text-xs leading-5 bg-transparent text-transparent caret-white resize-none focus:outline-none selection:bg-primary/40 whitespace-pre"
          />
        </div>
      </div>
    </div>
  );
};
