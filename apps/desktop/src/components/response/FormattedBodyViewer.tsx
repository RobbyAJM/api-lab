import React from 'react';
import { tokenizeJsonLine } from '../../utils/variableHighlight';
import { tokenizeHtmlLine, type ResponseFormat } from '../../utils/responseDetector';

export interface FormattedBodyViewerProps {
  content: string;
  format: ResponseFormat;
  className?: string;
}

/**
 * Renders syntax-highlighted response body with preserved whitespace/indentation.
 * Supports JSON, HTML, and plain text.
 */
export const FormattedBodyViewer: React.FC<FormattedBodyViewerProps> = ({
  content,
  format,
  className = '',
}) => {
  if (!content) return null;
  const lines = content.split('\n');

  if (format === 'json') {
    return (
      <div className={`font-mono text-[11px] leading-relaxed select-text ${className}`}>
        {lines.map((line, lIdx) => {
          const tokens = tokenizeJsonLine(line);
          return (
            <div key={lIdx} className="font-mono whitespace-pre min-h-[1.25em]">
              {tokens.length === 0 ? (
                <span>&nbsp;</span>
              ) : (
                tokens.map((token, tIdx) => {
                  let colorClass = 'text-zinc-200';
                  if (token.type === 'key') colorClass = 'text-indigo-400 font-medium';
                  else if (token.type === 'string') colorClass = 'text-emerald-300';
                  else if (token.type === 'number') colorClass = 'text-cyan-400';
                  else if (token.type === 'boolean') colorClass = 'text-orange-400 font-medium';
                  else if (token.type === 'null') colorClass = 'text-rose-400 font-medium italic';
                  else if (token.type === 'delimiter') colorClass = 'text-zinc-500 font-bold';
                  else if (token.type === 'variable') colorClass = 'text-amber-400 font-semibold';
                  return (
                    <span key={tIdx} className={colorClass}>
                      {token.text}
                    </span>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (format === 'html') {
    return (
      <div className={`font-mono text-[11px] leading-relaxed select-text ${className}`}>
        {lines.map((line, lIdx) => {
          const tokens = tokenizeHtmlLine(line);
          return (
            <div key={lIdx} className="font-mono whitespace-pre min-h-[1.25em]">
              {tokens.length === 0 ? (
                <span>&nbsp;</span>
              ) : (
                tokens.map((token, tIdx) => {
                  let colorClass = 'text-zinc-200';
                  if (token.type === 'tag') colorClass = 'text-indigo-400 font-semibold';
                  else if (token.type === 'attr-name') colorClass = 'text-amber-400 font-medium';
                  else if (token.type === 'attr-val') colorClass = 'text-emerald-300';
                  else if (token.type === 'doctype') colorClass = 'text-purple-400 font-bold';
                  else if (token.type === 'comment') colorClass = 'text-zinc-500 italic';
                  else if (token.type === 'punctuation') colorClass = 'text-zinc-400';
                  return (
                    <span key={tIdx} className={colorClass}>
                      {token.text}
                    </span>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <pre
      className={`font-mono text-[11px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-all select-text ${className}`}
    >
      {content}
    </pre>
  );
};
