/**
 * Undo / Redo history manager for code editors.
 * Provides deterministic state snapshots for Ctrl+Z and Ctrl+Y (or Cmd+Z / Cmd+Shift+Z),
 * avoiding React controlled-input desync and native textarea history wipes.
 */

export interface HistorySnapshot {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export class EditorHistory {
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private lastPushTime: number = 0;
  private maxDepth: number;

  constructor(initialText: string = '', start: number = 0, end: number = 0, maxDepth: number = 100) {
    this.maxDepth = maxDepth;
    this.undoStack.push({
      text: initialText,
      selectionStart: start,
      selectionEnd: end,
    });
    this.lastPushTime = Date.now();
  }

  /**
   * Pushes a new text snapshot into the undo stack.
   * Clears the redo stack. Group successive character typing within 350ms.
   */
  recordChange(
    newText: string,
    start: number,
    end: number,
    forceNewSnapshot: boolean = false
  ): void {
    const current = this.undoStack[this.undoStack.length - 1];
    if (current && current.text === newText) {
      current.selectionStart = start;
      current.selectionEnd = end;
      return;
    }

    const now = Date.now();
    const isTypingBatch =
      !forceNewSnapshot &&
      now - this.lastPushTime < 350 &&
      Math.abs(newText.length - (current?.text.length || 0)) === 1;

    if (isTypingBatch && this.undoStack.length > 1) {
      // Update top snapshot during continuous typing
      const top = this.undoStack[this.undoStack.length - 1];
      top.text = newText;
      top.selectionStart = start;
      top.selectionEnd = end;
    } else {
      this.undoStack.push({
        text: newText,
        selectionStart: start,
        selectionEnd: end,
      });

      if (this.undoStack.length > this.maxDepth) {
        this.undoStack.shift();
      }
    }

    this.redoStack = [];
    this.lastPushTime = now;
  }

  /**
   * Reverts to the previous snapshot, returning the target text and selection.
   */
  undo(currentText: string, currentStart: number, currentEnd: number): HistorySnapshot | null {
    if (this.undoStack.length <= 1) {
      return null;
    }

    this.undoStack.pop();
    this.redoStack.push({
      text: currentText,
      selectionStart: currentStart,
      selectionEnd: currentEnd,
    });

    const previous = this.undoStack[this.undoStack.length - 1];
    this.lastPushTime = 0;
    return previous;
  }

  /**
   * Redoes to the next snapshot in the redo stack.
   */
  redo(): HistorySnapshot | null {
    if (this.redoStack.length === 0) {
      return null;
    }

    const next = this.redoStack.pop()!;
    this.undoStack.push({
      text: next.text,
      selectionStart: next.selectionStart,
      selectionEnd: next.selectionEnd,
    });

    this.lastPushTime = 0;
    return next;
  }

  canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
