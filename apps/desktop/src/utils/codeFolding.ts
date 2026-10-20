export interface FoldableRange {
  startLine: number; // 0-based
  endLine: number;   // 0-based
  depth: number;     // 0 = root block, >=1 = child block
  isChild: boolean;
  type: 'object' | 'array';
}

export interface FoldedLineInfo {
  lineIndex: number; // 0-based original line index
  text: string;
  isFolded: boolean;
  endLine?: number;
  hiddenCount?: number;
  previewSuffix?: string;
  range?: FoldableRange;
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
 * Given document text and ranges to fold, replaces the interior lines
 * with an inline fold token `/* ... #N *\/`.
 * Returns the folded text and a map of token -> original interior content.
 */
export function foldText(
  text: string,
  rangesToFold: FoldableRange[]
): { foldedText: string; foldMap: Record<string, string> } {
  if (!text || rangesToFold.length === 0) {
    return { foldedText: text, foldMap: {} };
  }

  // Sort ranges from bottom to top (highest startLine first)
  const sorted = [...rangesToFold].sort((a, b) => b.startLine - a.startLine);
  const lines = text.split('\n');
  const foldMap: Record<string, string> = {};

  let foldCounter = 0;
  for (const r of sorted) {
    if (r.startLine >= lines.length || r.endLine >= lines.length || r.startLine >= r.endLine) {
      continue;
    }

    foldCounter++;
    const token = `/* ... #${foldCounter} */`;
    const startLineText = lines[r.startLine];
    const endLineText = lines[r.endLine];

    // Find closing bracket in endLineText
    const closeChar = r.type === 'object' ? '}' : ']';
    const closeIdx = endLineText.indexOf(closeChar);
    const closingTail = closeIdx !== -1 ? endLineText.substring(closeIdx).trim() : closeChar;

    // Interior lines: from startLine+1 to endLine-1, plus whatever came before closingTail on endLine
    const interior = lines.slice(r.startLine + 1, r.endLine + 1).join('\n');
    foldMap[token] = interior;

    // Combined line
    const combinedLine = `${startLineText} ${token} ${closingTail}`;
    lines.splice(r.startLine, r.endLine - r.startLine + 1, combinedLine);
  }

  return {
    foldedText: lines.join('\n'),
    foldMap,
  };
}

/**
 * Toggles fold state at a specific line.
 * If the line contains a folded token, unfolds it.
 * If the line starts an unfolded range, folds it.
 */
export function toggleFoldRange(
  text: string,
  lineIndex: number,
  ranges: FoldableRange[],
  currentFoldMap: Record<string, string>
): { text: string; foldMap: Record<string, string> } {
  const lines = text.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return { text, foldMap: currentFoldMap };
  }

  const lineText = lines[lineIndex];

  // 1. Check if line contains an active folded token -> Unfold it
  for (const token of Object.keys(currentFoldMap)) {
    if (lineText.includes(token)) {
      const interior = currentFoldMap[token];
      const tokenIdx = lineText.indexOf(token);
      const prefix = lineText.substring(0, tokenIdx).trimEnd();
      const interiorLines = interior.split('\n');
      lines.splice(lineIndex, 1, prefix, ...interiorLines);

      const nextMap = { ...currentFoldMap };
      delete nextMap[token];

      return {
        text: lines.join('\n'),
        foldMap: nextMap,
      };
    }
  }

  // 2. Check if line starts an unfolded range -> Fold it
  const range = ranges.find((r) => r.startLine === lineIndex);
  if (range && range.startLine < range.endLine) {
    const { foldedText, foldMap } = foldText(text, [range]);
    return {
      text: foldedText,
      foldMap: { ...currentFoldMap, ...foldMap },
    };
  }

  return { text, foldMap: currentFoldMap };
}

/**
 * Replaces any fold tokens `/* ... #N *\/` back with their original hidden lines.
 */
export function unfoldText(
  foldedText: string,
  foldMap: Record<string, string>
): string {
  if (!foldedText || !foldMap || Object.keys(foldMap).length === 0) {
    return foldedText;
  }

  let result = foldedText;
  for (const [token, interior] of Object.entries(foldMap)) {
    if (result.includes(token)) {
      // Find the line containing the token
      const lines = result.split('\n');
      const lineIdx = lines.findIndex((l) => l.includes(token));
      if (lineIdx !== -1) {
        const line = lines[lineIdx];
        const tokenIdx = line.indexOf(token);
        const prefix = line.substring(0, tokenIdx).trimEnd();
        const interiorLines = interior.split('\n');
        lines.splice(lineIdx, 1, prefix, ...interiorLines);
        result = lines.join('\n');
      }
    }
  }

  return result;
}

export function computeFoldedDisplayLines(
  lines: string[],
  foldedLines: Set<number>,
  ranges: FoldableRange[]
): FoldedLineInfo[] {
  const rangeMap = new Map<number, FoldableRange>();
  for (const r of ranges) {
    // Keep outer-most range if multiple start on same line
    if (!rangeMap.has(r.startLine) || (rangeMap.get(r.startLine)!.endLine < r.endLine)) {
      rangeMap.set(r.startLine, r);
    }
  }

  const result: FoldedLineInfo[] = [];
  let i = 0;

  while (i < lines.length) {
    const range = rangeMap.get(i);
    if (range && foldedLines.has(i)) {
      const hiddenCount = Math.max(0, range.endLine - range.startLine);
      const closeLine = lines[range.endLine] || '';
      const closeChar = range.type === 'object' ? '}' : ']';
      const suffixIdx = closeLine.indexOf(closeChar);
      const closingTail = suffixIdx !== -1 ? closeLine.substring(suffixIdx) : closeChar;
      const placeholder = ` ... ${closingTail.trim()}`;

      result.push({
        lineIndex: i,
        text: lines[i],
        isFolded: true,
        endLine: range.endLine,
        hiddenCount,
        previewSuffix: placeholder,
        range,
      });

      // Skip to the line after endLine
      i = range.endLine + 1;
    } else {
      result.push({
        lineIndex: i,
        text: lines[i],
        isFolded: false,
        range,
      });
      i++;
    }
  }

  return result;
}
