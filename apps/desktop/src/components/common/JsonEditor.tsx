import React, { useRef } from 'react';
import { tokenizeJsonLine, type VariableSource } from '../../utils/variableHighlight';

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
  const [formatError, setFormatError] = React.useState<string | null>(null);

  function handleBeautify() {
    setFormatError(null);
    try {
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 2);
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
  }

  // Highlight syntax tokens: keys, strings, numbers, booleans, variables {{VAR}} (defined vs undefined)
  function highlightJson(raw: string): React.ReactNode[] {
    const lines = raw.split('\n');
    return lines.map((line, lIdx) => {
      const tokens = tokenizeJsonLine(line, variables);
      return (
        <React.Fragment key={lIdx}>
          {tokens.map((token, tIdx) => {
            let colorClass = 'text-zinc-200';
            if (token.type === 'variable') {
              colorClass = token.isDefined
                ? 'text-emerald-300 font-bold bg-emerald-950/60 border border-emerald-800/50 px-0.5 rounded'
                : 'text-rose-300 font-bold bg-rose-950/60 border border-rose-800/50 px-0.5 rounded';
            } else if (token.type === 'key') {
              colorClass = 'text-indigo-400 font-medium';
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
            className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-indigo-300 hover:text-white rounded font-medium transition"
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
      <div className="relative flex-1 font-mono text-xs overflow-hidden">
        {/* Syntax Highlight Overlay */}
        <pre
          ref={preRef}
          aria-hidden="true"
          className="absolute inset-0 m-0 p-3 pointer-events-none whitespace-pre overflow-hidden text-zinc-200 font-mono text-xs select-none"
        >
          {highlightJson(value)}
        </pre>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          placeholder={placeholder}
          spellCheck={false}
          className="absolute inset-0 w-full h-full m-0 p-3 font-mono text-xs bg-transparent text-transparent caret-white resize-none focus:outline-none selection:bg-indigo-600/40"
        />
      </div>
    </div>
  );
};
