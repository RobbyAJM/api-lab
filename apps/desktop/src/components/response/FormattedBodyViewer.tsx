import React, { useState, useMemo, useEffect } from 'react';
import { tokenizeJsonLine } from '../../utils/variableHighlight';
import { tokenizeHtmlLine, type ResponseFormat } from '../../utils/responseDetector';
import {
  findFoldableRanges,
  getChildFoldLines,
  getAllFoldLines,
  collapseDocument,
  autoExpandForMatches,
} from '../../utils/codeFolding';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface FormattedBodyViewerProps {
  content: string;
  format: ResponseFormat;
  searchQuery?: string;
  className?: string;
}

function renderHighlightedText(text: string, query?: string) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  if (parts.length <= 1) return text;

  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={i}
        className="bg-amber-400/35 text-amber-200 rounded-sm px-0.5 font-bold underline select-text"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/**
 * Renders syntax-highlighted response body with code folding for child JSON
 * and interactive search match highlighting.
 */
export const FormattedBodyViewer: React.FC<FormattedBodyViewerProps> = ({
  content,
  format,
  searchQuery = '',
  className = '',
}) => {
  if (!content) return null;

  const lines = useMemo(() => content.split('\n'), [content]);
  const q = searchQuery.trim().toLowerCase();

  // Code folding state for JSON responses
  const ranges = useMemo(() => {
    if (format !== 'json') return [];
    return findFoldableRanges(content);
  }, [content, format]);

  const [foldedLines, setFoldedLines] = useState<Set<number>>(new Set());

  // Auto-expand any collapsed block when a search query matches hidden lines
  useEffect(() => {
    if (!q || ranges.length === 0 || foldedLines.size === 0) return;

    const matchedIndices: number[] = [];
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes(q)) {
        matchedIndices.push(idx);
      }
    });

    if (matchedIndices.length > 0) {
      setFoldedLines((prev) => autoExpandForMatches(ranges, prev, matchedIndices));
    }
  }, [q, lines, ranges]);

  function toggleFold(startLine: number) {
    setFoldedLines((prev) => {
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
    setFoldedLines(getChildFoldLines(ranges));
  }

  function handleCollapseAll() {
    setFoldedLines(getAllFoldLines(ranges));
  }

  function handleExpandAll() {
    setFoldedLines(new Set());
  }

  // JSON format with gutter & folding
  if (format === 'json') {
    const { lines: displayLines } = collapseDocument(content, foldedLines, ranges);
    const hasRanges = ranges.length > 0;
    const hasChildRanges = ranges.some((r) => r.isChild);

    return (
      <div className={`flex flex-col font-mono text-[11px] leading-relaxed select-text min-w-fit ${className}`}>
        {/* Folding Action Toolbar for JSON */}
        {hasRanges && (
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-zinc-800/60 select-none text-[10px] sticky left-0 bg-zinc-950 z-10 px-1">
            <span className="text-zinc-500 font-sans">
              {foldedLines.size > 0
                ? `${foldedLines.size} block${foldedLines.size > 1 ? 's' : ''} collapsed`
                : 'All blocks expanded'}
            </span>
            <div className="flex items-center gap-1.5">
              {hasChildRanges && (
                <button
                  type="button"
                  onClick={handleCollapseChildren}
                  className="px-1.5 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded transition font-sans"
                  title="Collapse all child JSON objects and arrays"
                >
                  Collapse Children
                </button>
              )}
              <button
                type="button"
                onClick={handleCollapseAll}
                className="px-1.5 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded transition font-sans"
                title="Collapse all objects and arrays"
              >
                Collapse All
              </button>
              <button
                type="button"
                onClick={handleExpandAll}
                disabled={foldedLines.size === 0}
                className="px-1.5 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded transition font-sans disabled:opacity-40"
                title="Expand all collapsed blocks"
              >
                Expand All
              </button>
            </div>
          </div>
        )}

        {/* Display lines with gutter */}
        <div className="divide-y divide-transparent">
          {displayLines.map((lineInfo) => {
            const tokens = tokenizeJsonLine(lineInfo.text);
            const isFolded = lineInfo.isFolded;
            const canFold = lineInfo.canFold;

            return (
              <div
                key={lineInfo.displayLineIndex}
                className="flex items-start font-mono whitespace-pre min-h-[1.35em] group hover:bg-zinc-900/30"
              >
                {/* Gutter: Line number + Fold Chevron */}
                <div
                  className="flex items-center justify-end pl-2 pr-1.5 select-none text-zinc-600 text-right flex-shrink-0 sticky left-0 bg-zinc-950 z-10 border-r border-zinc-850/80"
                  style={{ minWidth: '3.2rem' }}
                >
                  <span className="mr-1 text-[10px]">{lineInfo.originalLineIndex + 1}</span>
                  {canFold ? (
                    <button
                      type="button"
                      onClick={() => lineInfo.range && toggleFold(lineInfo.range.startLine)}
                      className="p-0.5 text-zinc-500 hover:text-zinc-200 rounded transition hover:bg-zinc-800"
                      title={isFolded ? 'Expand block' : 'Collapse block'}
                    >
                      {isFolded ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                    </button>
                  ) : (
                    <span className="w-3" />
                  )}
                </div>

                {/* Tokens */}
                <div className="flex-1 pl-2">
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

                      if (token.text.trim() === '...' && isFolded) {
                        return (
                          <span
                            key={tIdx}
                            onClick={() => lineInfo.range && toggleFold(lineInfo.range.startLine)}
                            className="inline-flex items-center px-1.5 py-0.2 mx-0.5 text-[10px] font-mono text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 rounded cursor-pointer select-none transition pointer-events-auto"
                            title="Click to expand block"
                          >
                            ...
                            {lineInfo.hiddenCount && (
                              <span className="ml-1 text-[9px] text-zinc-500 font-sans">
                                +{lineInfo.hiddenCount}
                              </span>
                            )}
                          </span>
                        );
                      }

                      return (
                        <span key={tIdx} className={colorClass}>
                          {renderHighlightedText(token.text, q)}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // HTML format
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
                      {renderHighlightedText(token.text, q)}
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

  // Plain Text format
  return (
    <pre
      className={`font-mono text-[11px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-all select-text ${className}`}
    >
      {renderHighlightedText(content, q)}
    </pre>
  );
};
