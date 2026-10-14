import React, { useRef } from 'react';
import { tokenizeJsLine } from '../../utils/jsHighlight';
import { handleEditorKeyDown } from '../../utils/editorKeyboard';

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
      }
    );

    if (result) {
      e.preventDefault();
      onChange(result.text);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(result.selectionStart, result.selectionEnd);
        }
      });
    }
  }

  const lineCount = Math.max(1, value.split('\n').length);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  function highlightJs(raw: string): React.ReactNode[] {
    const lines = raw.split('\n');
    return lines.map((line, lIdx) => {
      const tokens = tokenizeJsLine(line);
      return (
        <React.Fragment key={lIdx}>
          {tokens.map((token, tIdx) => {
            let colorClass = 'text-zinc-200';
            if (token.type === 'keyword') {
              colorClass = 'text-purple-400 font-semibold';
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

            return (
              <span key={`${lIdx}-${tIdx}`} className={colorClass}>
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
    <div
      className={`relative flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden ${className}`}
    >
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
            {highlightJs(value)}
          </pre>

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            placeholder={placeholder}
            spellCheck={false}
            className="absolute inset-0 w-full h-full m-0 py-3 px-3 font-mono text-xs leading-5 bg-transparent text-transparent caret-white resize-none focus:outline-none selection:bg-indigo-600/40 whitespace-pre"
          />
        </div>
      </div>
    </div>
  );
};
