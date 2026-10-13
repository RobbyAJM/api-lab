import React, { useRef } from 'react';

interface JsonEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export const JsonEditor: React.FC<JsonEditorProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
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

  // Highlight syntax tokens: keys, strings, numbers, booleans, variables {{VAR}}
  function highlightJson(raw: string): React.ReactNode[] {
    const lines = raw.split('\n');
    return lines.map((line, lIdx) => {
      const regex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\{\{[A-Za-z0-9_]+\}\}|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}[\],:])/g;

      let lastIndex = 0;
      const elements: React.ReactNode[] = [];
      let match;

      while ((match = regex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          elements.push(line.substring(lastIndex, match.index));
        }

        const token = match[0];
        let colorClass = 'text-zinc-200';

        if (token.startsWith('{{') && token.endsWith('}}')) {
          colorClass = 'text-amber-400 font-bold bg-amber-950/40 px-0.5 rounded';
        } else if (token.endsWith(':')) {
          colorClass = 'text-indigo-400 font-medium';
        } else if (token.startsWith('"')) {
          colorClass = 'text-emerald-300';
        } else if (token === 'true' || token === 'false') {
          colorClass = 'text-orange-400 font-medium';
        } else if (token === 'null') {
          colorClass = 'text-rose-400 font-medium italic';
        } else if (/^-?\d/.test(token)) {
          colorClass = 'text-cyan-400';
        } else if (/[{}[\],]/.test(token)) {
          colorClass = 'text-zinc-500 font-bold';
        }

        elements.push(
          <span key={`${lIdx}-${match.index}`} className={colorClass}>
            {token}
          </span>
        );
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < line.length) {
        elements.push(line.substring(lastIndex));
      }

      return (
        <React.Fragment key={lIdx}>
          {elements}
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
