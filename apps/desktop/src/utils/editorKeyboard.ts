import type { EditorHistory } from './editorHistory';

/**
 * Pure functions for IDE-grade keyboard interactions in code editors:
 * - Tab & Shift+Tab indentation (single-line and multi-line selection)
 * - Auto-indent on Enter (inheriting indentation and bracket expansion)
 * - Pair wrapping on selection ("quote", {bracket}, [array], (paren))
 * - Auto-close pairs & skip closing character
 * - Smart backspace for empty pairs
 */

export interface EditorKeyAction {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface EditorChangeResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

const WRAP_PAIRS: Record<string, [string, string]> = {
  '"': ['"', '"'],
  "'": ["'", "'"],
  '`': ['`', '`'],
  '(': ['(', ')'],
  '[': ['[', ']'],
  '{': ['{', '}'],
};

const CLOSE_PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
};

const SKIP_CLOSING_CHARS = new Set([')', ']', '}', '"', "'", '`']);

/**
 * Handles Tab and Shift+Tab indentation for both single-line cursor and multi-line selections.
 */
export function handleTabIndentation(
  text: string,
  start: number,
  end: number,
  isShift: boolean,
  indentStr: string = '  ',
  forceLineIndent: boolean = false
): EditorChangeResult {
  const isMultiLine = text.substring(start, end).includes('\n') || start !== end;

  // Multi-line selection or selection spanning line start
  if (isMultiLine) {
    // Find beginning of first affected line
    const firstLineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    // Find end of last affected line
    let lastLineEnd = text.indexOf('\n', end);
    if (lastLineEnd === -1) lastLineEnd = text.length;

    // If selection ends right at the beginning of a line (after \n), don't indent that trailing line
    if (end > start && text[end - 1] === '\n') {
      lastLineEnd = end - 1;
    }

    const before = text.substring(0, firstLineStart);
    const middle = text.substring(firstLineStart, lastLineEnd);
    const after = text.substring(lastLineEnd);

    const lines = middle.split('\n');

    if (!isShift) {
      // Indent each line
      const indented = lines.map((l) => indentStr + l);
      const newText = before + indented.join('\n') + after;
      const addedPerLine = indentStr.length;
      return {
        text: newText,
        selectionStart: start + addedPerLine,
        selectionEnd: end + addedPerLine * lines.length,
      };
    } else {
      // Unindent each line
      let removedFirst = 0;
      let totalRemoved = 0;

      const unindented = lines.map((line, idx) => {
        let removeCount = 0;
        if (line.startsWith(indentStr)) {
          removeCount = indentStr.length;
        } else if (line.startsWith(' ')) {
          removeCount = 1;
        } else if (line.startsWith('\t')) {
          removeCount = 1;
        }

        if (idx === 0) removedFirst = removeCount;
        totalRemoved += removeCount;
        return line.substring(removeCount);
      });

      const newText = before + unindented.join('\n') + after;
      return {
        text: newText,
        selectionStart: Math.max(firstLineStart, start - removedFirst),
        selectionEnd: Math.max(firstLineStart, end - totalRemoved),
      };
    }
  }

  // Single cursor (no selection)
  if (!isShift) {
    if (forceLineIndent) {
      // Indent entire current line at line beginning
      const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      const newText = text.substring(0, lineStart) + indentStr + text.substring(lineStart);
      return {
        text: newText,
        selectionStart: start + indentStr.length,
        selectionEnd: start + indentStr.length,
      };
    }

    // Insert 2 spaces at cursor
    const newText = text.substring(0, start) + indentStr + text.substring(end);
    return {
      text: newText,
      selectionStart: start + indentStr.length,
      selectionEnd: start + indentStr.length,
    };
  } else {
    // Shift+Tab at cursor: unindent current line
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const currentLine = text.substring(lineStart);
    let removeCount = 0;
    if (currentLine.startsWith(indentStr)) {
      removeCount = indentStr.length;
    } else if (currentLine.startsWith(' ')) {
      removeCount = 1;
    }

    if (removeCount > 0) {
      const newText = text.substring(0, lineStart) + text.substring(lineStart + removeCount);
      const newPos = Math.max(lineStart, start - removeCount);
      return {
        text: newText,
        selectionStart: newPos,
        selectionEnd: newPos,
      };
    }

    return { text, selectionStart: start, selectionEnd: end };
  }
}

/**
 * Handles Enter key with intelligent auto-indentation and bracket opening.
 */
export function handleEnterKey(
  text: string,
  start: number,
  end: number,
  indentStr: string = '  '
): EditorChangeResult {
  const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const currentLine = text.substring(lineStart, start);
  const leadingIndent = currentLine.match(/^[ \t]*/)?.[0] || '';

  const charBefore = text[start - 1];
  const charAfter = text[end];

  // If between opening and closing braces: {|} or [|] or (|)
  if (
    (charBefore === '{' && charAfter === '}') ||
    (charBefore === '[' && charAfter === ']') ||
    (charBefore === '(' && charAfter === ')')
  ) {
    const insert = `\n${leadingIndent}${indentStr}\n${leadingIndent}`;
    const newText = text.substring(0, start) + insert + text.substring(end);
    const newPos = start + 1 + leadingIndent.length + indentStr.length;
    return {
      text: newText,
      selectionStart: newPos,
      selectionEnd: newPos,
    };
  }

  // If previous line ends with an opening bracket or colon, increase indent
  const trimmedBefore = currentLine.trimEnd();
  const shouldAddIndent =
    trimmedBefore.endsWith('{') ||
    trimmedBefore.endsWith('[') ||
    trimmedBefore.endsWith('(') ||
    trimmedBefore.endsWith(':');

  const extra = shouldAddIndent ? indentStr : '';
  const insert = `\n${leadingIndent}${extra}`;
  const newText = text.substring(0, start) + insert + text.substring(end);
  const newPos = start + insert.length;

  return {
    text: newText,
    selectionStart: newPos,
    selectionEnd: newPos,
  };
}

/**
 * Handles pair wrapping when text is selected, or pair auto-closing when cursor is idle.
 */
export function handlePairInsertion(
  text: string,
  start: number,
  end: number,
  key: string
): EditorChangeResult | null {
  // 1. Text is selected: wrap selection
  if (start < end && WRAP_PAIRS[key]) {
    const [open, close] = WRAP_PAIRS[key];
    const selected = text.substring(start, end);
    const newText = text.substring(0, start) + open + selected + close + text.substring(end);
    return {
      text: newText,
      selectionStart: start + 1,
      selectionEnd: end + 1,
    };
  }

  // 2. Cursor is immediately before closing character that matches typed char: skip over
  if (start === end && SKIP_CLOSING_CHARS.has(key) && text[start] === key) {
    return {
      text,
      selectionStart: start + 1,
      selectionEnd: start + 1,
    };
  }

  // 3. No selection: auto-close pair
  if (start === end && CLOSE_PAIRS[key]) {
    const close = CLOSE_PAIRS[key];
    // Don't auto-close quotes if directly preceded by word character
    if ((key === '"' || key === "'" || key === '`') && start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) {
      return null;
    }

    const newText = text.substring(0, start) + key + close + text.substring(end);
    return {
      text: newText,
      selectionStart: start + 1,
      selectionEnd: start + 1,
    };
  }

  return null;
}

/**
 * Handles Backspace between empty pairs: "" -> | or {} -> |
 */
export function handleBackspacePair(
  text: string,
  start: number,
  end: number
): EditorChangeResult | null {
  if (start === end && start > 0 && start < text.length) {
    const before = text[start - 1];
    const after = text[start];

    if (
      (before === '{' && after === '}') ||
      (before === '[' && after === ']') ||
      (before === '(' && after === ')') ||
      (before === '"' && after === '"') ||
      (before === "'" && after === "'") ||
      (before === '`' && after === '`')
    ) {
      const newText = text.substring(0, start - 1) + text.substring(start + 1);
      return {
        text: newText,
        selectionStart: start - 1,
        selectionEnd: start - 1,
      };
    }
  }

  return null;
}

/**
 * Toggles line comments (//) on single cursor line or across multi-line selection.
 * ponytail: line comments only; add block comment toggle (Shift+Alt+A) if multi-syntax mix needed.
 */
export function handleToggleComment(
  text: string,
  start: number,
  end: number
): EditorChangeResult {
  const firstLineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  let lastLineEnd = text.indexOf('\n', end);
  if (lastLineEnd === -1) lastLineEnd = text.length;

  if (end > start && text[end - 1] === '\n') {
    lastLineEnd = end - 1;
  }

  const before = text.substring(0, firstLineStart);
  const middle = text.substring(firstLineStart, lastLineEnd);
  const after = text.substring(lastLineEnd);

  const lines = middle.split('\n');
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);

  const allCommented =
    nonEmptyLines.length > 0 &&
    nonEmptyLines.every((l) => /^\s*\/\//.test(l));

  let startDelta = 0;
  let totalDelta = 0;

  const newLines = lines.map((line, idx) => {
    let newLine: string;
    let lineDelta: number;

    if (allCommented) {
      if (/^\s*\/\//.test(line)) {
        newLine = line.replace(/^(\s*)\/\/ ?/, '$1');
        lineDelta = newLine.length - line.length;
      } else {
        newLine = line;
        lineDelta = 0;
      }
    } else {
      const match = line.match(/^(\s*)(.*)$/);
      if (match) {
        newLine = `${match[1]}// ${match[2]}`;
        lineDelta = newLine.length - line.length;
      } else {
        newLine = `// ${line}`;
        lineDelta = 3;
      }
    }

    if (idx === 0) {
      startDelta = lineDelta;
    }
    totalDelta += lineDelta;
    return newLine;
  });

  const newMiddle = newLines.join('\n');
  const newText = before + newMiddle + after;

  return {
    text: newText,
    selectionStart: Math.max(firstLineStart, start + startDelta),
    selectionEnd: Math.max(firstLineStart, end + totalDelta),
  };
}

/**
 * Removes the current line where cursor is focused (Ctrl+X with no selection).
 * Copies the deleted line to system clipboard if clipboard API is available.
 * ponytail: line deletion handles single, middle, and trailing line without selection; full multi-line cut delegates to browser cut event.
 */
export function handleDeleteLine(
  text: string,
  start: number,
  end: number
): EditorChangeResult {
  const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEnd = text.indexOf('\n', end);

  let removeStart = lineStart;
  let removeEnd = lineEnd;
  let removedText = '';

  if (lineEnd !== -1) {
    // Delete line including its trailing newline
    removeEnd = lineEnd + 1;
    removedText = text.substring(removeStart, removeEnd);
  } else if (lineStart > 0) {
    // Last line with preceding newline: delete from preceding newline to end
    removeStart = lineStart - 1;
    removeEnd = text.length;
    removedText = text.substring(removeStart + 1) + '\n';
  } else {
    // Only line in document
    removeStart = 0;
    removeEnd = text.length;
    removedText = text + '\n';
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(removedText).catch(() => {});
  }

  const newText = text.substring(0, removeStart) + text.substring(removeEnd);
  const newPos = Math.min(removeStart, newText.length);

  return {
    text: newText,
    selectionStart: newPos,
    selectionEnd: newPos,
  };
}

/**
 * Moves currently selected line or block of lines up or down (Alt+Up / Alt+Down).
 */
export function handleMoveLine(
  text: string,
  start: number,
  end: number,
  direction: 'up' | 'down'
): EditorChangeResult {
  const firstLineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  let lastLineEnd = text.indexOf('\n', end);
  if (lastLineEnd === -1) lastLineEnd = text.length;

  if (end > start && text[end - 1] === '\n') {
    lastLineEnd = end - 1;
  }

  const selectedBlock = text.substring(firstLineStart, lastLineEnd);

  if (direction === 'up') {
    if (firstLineStart === 0) {
      return { text, selectionStart: start, selectionEnd: end };
    }
    const prevLineStart = text.lastIndexOf('\n', firstLineStart - 2) + 1;
    const prevLineText = text.substring(prevLineStart, firstLineStart - 1);
    const before = text.substring(0, prevLineStart);
    const after = text.substring(lastLineEnd);
    const newText = before + selectedBlock + '\n' + prevLineText + after;
    const offset = prevLineText.length + 1;
    return {
      text: newText,
      selectionStart: start - offset,
      selectionEnd: end - offset,
    };
  } else {
    if (lastLineEnd >= text.length) {
      return { text, selectionStart: start, selectionEnd: end };
    }
    let nextLineEnd = text.indexOf('\n', lastLineEnd + 1);
    if (nextLineEnd === -1) nextLineEnd = text.length;
    const nextLineText = text.substring(lastLineEnd + 1, nextLineEnd);
    const before = text.substring(0, firstLineStart);
    const after = text.substring(nextLineEnd);
    const newText = before + nextLineText + '\n' + selectedBlock + after;
    const offset = nextLineText.length + 1;
    return {
      text: newText,
      selectionStart: start + offset,
      selectionEnd: end + offset,
    };
  }
}

/**
 * Detects whether cursor is currently inside a JSON key or value string open for autocomplete.
 * Matches:
 * - Keys:   `{ "foo` or `, "foo`
 * - Values: `: "foo` or `: "STATUS_`
 * Returns the query string and matchStart to filter suggestions, or null if not in an autocomplete position.
 */
export function findAutocompleteQuery(
  text: string,
  cursorIndex: number
): { query: string; matchStart: number } | null {
  const beforeCursor = text.slice(0, cursorIndex);
  const match = beforeCursor.match(/(?:\{|,|:)\s*"([^"\n]*)$/);
  if (!match) return null;
  return {
    query: match[1].toLowerCase(),
    matchStart: cursorIndex - match[1].length,
  };
}

/**
 * Master dispatcher for code editor keyboard events.
 * Returns null if default browser behavior should proceed.
 */
export function handleEditorKeyDown(
  text: string,
  start: number,
  end: number,
  action: EditorKeyAction,
  history?: EditorHistory
): EditorChangeResult | null {
  const isMod = !!(action.ctrlKey || action.metaKey);

  // Undo (Ctrl+Z / Cmd+Z)
  if (isMod && !action.shiftKey && (action.key === 'z' || action.key === 'Z')) {
    if (history) {
      const prev = history.undo(text, start, end);
      if (prev) {
        return {
          text: prev.text,
          selectionStart: prev.selectionStart,
          selectionEnd: prev.selectionEnd,
        };
      }
      return { text, selectionStart: start, selectionEnd: end };
    }
  }

  // Redo (Ctrl+Y / Cmd+Shift+Z / Ctrl+Shift+Z)
  if (
    isMod &&
    ((action.key === 'y' || action.key === 'Y') ||
      (action.shiftKey && (action.key === 'z' || action.key === 'Z')))
  ) {
    if (history) {
      const next = history.redo();
      if (next) {
        return {
          text: next.text,
          selectionStart: next.selectionStart,
          selectionEnd: next.selectionEnd,
        };
      }
      return { text, selectionStart: start, selectionEnd: end };
    }
  }

  // Toggle line comment (Ctrl+/ or Cmd+/)
  if (isMod && (action.key === '/' || action.key === '?')) {
    return handleToggleComment(text, start, end);
  }

  // Move line up / down (Alt+ArrowUp / Alt+ArrowDown)
  if (action.altKey && !isMod && (action.key === 'ArrowUp' || action.key === 'ArrowDown')) {
    return handleMoveLine(text, start, end, action.key === 'ArrowUp' ? 'up' : 'down');
  }

  // Adjust indentation (Ctrl+[ to unindent, Ctrl+] to indent)
  if (isMod && !action.shiftKey && !action.altKey) {
    if (action.key === '[') {
      return handleTabIndentation(text, start, end, true);
    }
    if (action.key === ']') {
      return handleTabIndentation(text, start, end, false, '  ', true);
    }
  }

  // Remove current line (Ctrl+X with no selection)
  if (isMod && !action.shiftKey && !action.altKey && (action.key === 'x' || action.key === 'X')) {
    if (start === end) {
      return handleDeleteLine(text, start, end);
    }
    // With selection: let native browser cut proceed
    return null;
  }

  // Tab / Shift+Tab
  if (action.key === 'Tab') {
    return handleTabIndentation(text, start, end, Boolean(action.shiftKey));
  }

  // Enter (ignore if Ctrl/Cmd held - used for request execution shortcut)
  if (action.key === 'Enter') {
    if (isMod) {
      return null;
    }
    return handleEnterKey(text, start, end);
  }

  // Backspace
  if (action.key === 'Backspace') {
    return handleBackspacePair(text, start, end);
  }

  // Bracket / Quote pairs
  if (action.key in CLOSE_PAIRS || action.key in WRAP_PAIRS || SKIP_CLOSING_CHARS.has(action.key)) {
    return handlePairInsertion(text, start, end, action.key);
  }

  return null;
}
