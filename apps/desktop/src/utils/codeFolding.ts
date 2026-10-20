export interface FoldableRange {
  startLine: number; // 0-based
  endLine: number;   // 0-based
  depth: number;     // 0 = root block, >=1 = child block
  isChild: boolean;
  type: 'object' | 'array';
}

export interface CollapsedLine {
  displayLineIndex: number; // 0-based index in display lines
  originalLineIndex: number; // 0-based index in full text (gutter shows originalLineIndex + 1)
  text: string;
  isFolded: boolean;
  canFold: boolean;
  range?: FoldableRange;
  hiddenCount?: number;
}

export interface CollapsedDocResult {
  displayText: string;
  lines: CollapsedLine[];
}

/**
 * Parses JSON / JavaScript text and detects multi-line object `{}` and array `[]` ranges.
 * Skips braces inside string literals and comments.
 */
export function findFoldableRanges(text: string): FoldableRange[] {
  if (!text) return [];

  const ranges: FoldableRange[] = [];
  const stack: { char: '{' | '['; line: number; depth: number }[] = [];

  let currentLine = 0;
  let inString: '"' | "'" | '`' | null = null;
  let isEscaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const nextCh = text[i + 1];

    if (ch === '\n') {
      currentLine++;
      inLineComment = false;
      isEscaped = false;
      continue;
    }

    if (inLineComment) continue;

    if (inBlockComment) {
      if (ch === '*' && nextCh === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === '\\') {
        isEscaped = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }

    // Comment check
    if (ch === '/' && nextCh === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && nextCh === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    // String entry
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      isEscaped = false;
      continue;
    }

    // Opening brackets
    if (ch === '{' || ch === '[') {
      stack.push({
        char: ch,
        line: currentLine,
        depth: stack.length,
      });
      continue;
    }

    // Closing brackets
    if (ch === '}' || ch === ']') {
      const match = ch === '}' ? '{' : '[';
      const last = stack.pop();
      if (last && last.char === match) {
        if (last.line < currentLine) {
          ranges.push({
            startLine: last.line,
            endLine: currentLine,
            depth: last.depth,
            isChild: last.depth > 0,
            type: match === '{' ? 'object' : 'array',
          });
        }
      }
    }
  }

  // Sort by startLine ascending, then endLine descending
  return ranges.sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);
}

/**
 * Returns set of startLine numbers for all child blocks (depth >= 1).
 */
export function getChildFoldLines(ranges: FoldableRange[]): Set<number> {
  const result = new Set<number>();
  for (const r of ranges) {
    if (r.isChild) {
      result.add(r.startLine);
    }
  }
  return result;
}

/**
 * Returns set of startLine numbers for all blocks.
 */
export function getAllFoldLines(ranges: FoldableRange[]): Set<number> {
  const result = new Set<number>();
  for (const r of ranges) {
    result.add(r.startLine);
  }
  return result;
}

/**
 * Unfolds any ranges that conceal a line matching the search query.
 */
export function autoExpandForMatches(
  ranges: FoldableRange[],
  foldedLines: Set<number>,
  matchedLineIndices: number[]
): Set<number> {
  if (foldedLines.size === 0 || matchedLineIndices.length === 0) {
    return foldedLines;
  }

  const next = new Set(foldedLines);
  const matchSet = new Set(matchedLineIndices);

  for (const r of ranges) {
    if (next.has(r.startLine)) {
      // Check if any matched line falls strictly inside the hidden range: (startLine, endLine]
      for (let l = r.startLine + 1; l <= r.endLine; l++) {
        if (matchSet.has(l)) {
          next.delete(r.startLine);
          break;
        }
      }
    }
  }

  return next;
}

/**
 * Builds the single-line folded preview string for a range.
 * E.g.
 * `{` + `}` -> `{ ... }`
 * `  "address": {` + `  },` -> `  "address": { ... },`
 * `pm.test("title", () => {` + `});` -> `pm.test("title", () => { ... });`
 */
export function getFoldedLinePreview(startLineText: string, endLineText: string, type: 'object' | 'array'): string {
  const closeChar = type === 'object' ? '}' : ']';
  const closeIdx = endLineText.lastIndexOf(closeChar);
  const closingTail = closeIdx !== -1 ? endLineText.substring(closeIdx).trim() : closeChar;
  return `${startLineText.trimEnd()} ... ${closingTail}`;
}

/**
 * Collapses the full document lines based on the folded start lines.
 * Retains exact original line indices so gutters show true line numbers without renumbering.
 */
export function collapseDocument(
  fullText: string,
  foldedStartLines: Set<number>,
  ranges: FoldableRange[]
): CollapsedDocResult {
  if (!fullText) {
    return { displayText: '', lines: [] };
  }

  const origLines = fullText.split('\n');
  const rangeMap = new Map<number, FoldableRange>();
  for (const r of ranges) {
    // Retain outermost range if multiple start on same line
    if (!rangeMap.has(r.startLine) || rangeMap.get(r.startLine)!.endLine < r.endLine) {
      rangeMap.set(r.startLine, r);
    }
  }

  const collapsedLines: CollapsedLine[] = [];
  let i = 0;

  while (i < origLines.length) {
    const range = rangeMap.get(i);
    const shouldFold = Boolean(range && foldedStartLines.has(i) && range.startLine < range.endLine);

    if (range && shouldFold) {
      const startLineText = origLines[range.startLine];
      const endLineText = origLines[range.endLine] || '';
      const previewText = getFoldedLinePreview(startLineText, endLineText, range.type);
      const hiddenCount = range.endLine - range.startLine;

      collapsedLines.push({
        displayLineIndex: collapsedLines.length,
        originalLineIndex: i,
        text: previewText,
        isFolded: true,
        canFold: true,
        range,
        hiddenCount,
      });

      // Advance index past the folded range
      i = range.endLine + 1;
    } else {
      collapsedLines.push({
        displayLineIndex: collapsedLines.length,
        originalLineIndex: i,
        text: origLines[i],
        isFolded: false,
        canFold: Boolean(range && range.startLine < range.endLine),
        range,
      });
      i++;
    }
  }

  return {
    displayText: collapsedLines.map((l) => l.text).join('\n'),
    lines: collapsedLines,
  };
}

/**
 * Reconstructs the full document text when display text changes.
 * Preserves hidden interior lines for unchanged folded blocks.
 * If a folded block was edited or deleted, its startLine is dropped from activeFoldedLines.
 */
export function reconstructFullText(
  currentDisplayText: string,
  originalFullText: string,
  foldedStartLines: Set<number>,
  ranges: FoldableRange[]
): { fullText: string; activeFoldedLines: Set<number> } {
  if (foldedStartLines.size === 0 || !originalFullText) {
    return { fullText: currentDisplayText, activeFoldedLines: new Set() };
  }

  const origLines = originalFullText.split('\n');
  const rangeMap = new Map<number, FoldableRange>();
  for (const r of ranges) {
    if (!rangeMap.has(r.startLine) || rangeMap.get(r.startLine)!.endLine < r.endLine) {
      rangeMap.set(r.startLine, r);
    }
  }

  const displayLines = currentDisplayText.split('\n');
  const activeFoldedLines = new Set<number>();
  const reconstructedLines: string[] = [];

  for (let d = 0; d < displayLines.length; d++) {
    const lineText = displayLines[d];

    // Check if this line is an unchanged folded preview
    let matchedRange: FoldableRange | null = null;
    for (const startLine of foldedStartLines) {
      const r = rangeMap.get(startLine);
      if (r && r.startLine < origLines.length && r.endLine < origLines.length) {
        const expectedPreview = getFoldedLinePreview(origLines[r.startLine], origLines[r.endLine], r.type);
        if (lineText === expectedPreview) {
          matchedRange = r;
          break;
        }
      }
    }

    if (matchedRange) {
      // Restore original lines from startLine to endLine
      activeFoldedLines.add(matchedRange.startLine);
      for (let k = matchedRange.startLine; k <= matchedRange.endLine; k++) {
        reconstructedLines.push(origLines[k]);
      }
    } else {
      reconstructedLines.push(lineText);
    }
  }

  return {
    fullText: reconstructedLines.join('\n'),
    activeFoldedLines,
  };
}
