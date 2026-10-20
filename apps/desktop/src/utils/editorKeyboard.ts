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
  indentStr: string = '  '
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
