import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleTabIndentation,
  handleEnterKey,
  handlePairInsertion,
  handleBackspacePair,
  handleToggleComment,
  handleDeleteLine,
  handleEditorKeyDown,
} from './editorKeyboard.ts';
import { EditorHistory } from './editorHistory.ts';

test('handleTabIndentation: single cursor inserts 2 spaces', () => {
  const result = handleTabIndentation('hello', 5, 5, false);
  assert.equal(result.text, 'hello  ');
  assert.equal(result.selectionStart, 7);
  assert.equal(result.selectionEnd, 7);
});

test('handleTabIndentation: single cursor Shift+Tab removes 2 leading spaces', () => {
  const result = handleTabIndentation('  hello', 4, 4, true);
  assert.equal(result.text, 'hello');
  assert.equal(result.selectionStart, 2);
});

test('handleTabIndentation: multi-line selection indents all affected lines', () => {
  const original = 'line1\nline2\nline3';
  // select from line1 to line2
  const start = 2; // in 'line1'
  const end = 8; // in 'line2'

  const result = handleTabIndentation(original, start, end, false);
  assert.equal(result.text, '  line1\n  line2\nline3');
  assert.equal(result.selectionStart, start + 2);
  assert.equal(result.selectionEnd, end + 4); // 2 lines indented
});

test('handleTabIndentation: multi-line selection Shift+Tab unindents all affected lines', () => {
  const original = '  line1\n  line2\nline3';
  const start = 3;
  const end = 12;

  const result = handleTabIndentation(original, start, end, true);
  assert.equal(result.text, 'line1\nline2\nline3');
  assert.equal(result.selectionStart, 1);
  assert.equal(result.selectionEnd, 8);
});

test('handleEnterKey: auto-indents matching previous line indentation', () => {
  const original = '  const a = 1;';
  const result = handleEnterKey(original, original.length, original.length);
  assert.equal(result.text, '  const a = 1;\n  ');
  assert.equal(result.selectionStart, original.length + 3);
});

test('handleEnterKey: expands braces between {|} with nested indentation', () => {
  const original = '{}';
  const result = handleEnterKey(original, 1, 1);
  assert.equal(result.text, '{\n  \n}');
  assert.equal(result.selectionStart, 4); // inside the indented empty line
});

test('handlePairInsertion: wraps selected text in quotes and braces', () => {
  const original = 'hello world';
  // select 'world'
  const start = 6;
  const end = 11;

  const quoted = handlePairInsertion(original, start, end, '"');
  assert.ok(quoted);
  assert.equal(quoted.text, 'hello "world"');
  assert.equal(quoted.selectionStart, 7);
  assert.equal(quoted.selectionEnd, 12);

  const braced = handlePairInsertion(original, start, end, '{');
  assert.ok(braced);
  assert.equal(braced.text, 'hello {world}');
});

test('handlePairInsertion: auto-closes bracket and quotes at idle cursor', () => {
  const res = handlePairInsertion('', 0, 0, '{');
  assert.ok(res);
  assert.equal(res.text, '{}');
  assert.equal(res.selectionStart, 1);

  const quote = handlePairInsertion('', 0, 0, '"');
  assert.ok(quote);
  assert.equal(quote.text, '""');
  assert.equal(quote.selectionStart, 1);
});

test('handleBackspacePair: deletes empty pair when cursor is in middle', () => {
  const res = handleBackspacePair('{}', 1, 1);
  assert.ok(res);
  assert.equal(res.text, '');
  assert.equal(res.selectionStart, 0);

  const resQuote = handleBackspacePair('""', 1, 1);
  assert.ok(resQuote);
  assert.equal(resQuote.text, '');
  assert.equal(resQuote.selectionStart, 0);
});

test('handleEditorKeyDown: dispatches Tab correctly', () => {
  const res = handleEditorKeyDown('foo\nbar', 1, 5, { key: 'Tab' });
  assert.ok(res);
  assert.equal(res.text, '  foo\n  bar');
});

test('handleEditorKeyDown: dispatches Ctrl+Z (undo) and Ctrl+Y (redo) with history', () => {
  const history = new EditorHistory('hello', 5, 5);
  history.recordChange('hello world', 11, 11, true);

  // Undo via Ctrl+Z
  const undoResult = handleEditorKeyDown('hello world', 11, 11, { key: 'z', ctrlKey: true }, history);
  assert.ok(undoResult);
  assert.equal(undoResult.text, 'hello');
  assert.equal(undoResult.selectionStart, 5);

  // Redo via Ctrl+Y
  const redoResult = handleEditorKeyDown('hello', 5, 5, { key: 'y', ctrlKey: true }, history);
  assert.ok(redoResult);
  assert.equal(redoResult.text, 'hello world');
  assert.equal(redoResult.selectionStart, 11);

  // Redo via Cmd+Shift+Z (Mac style)
  history.undo('hello world', 11, 11);
  const macRedo = handleEditorKeyDown('hello', 5, 5, { key: 'z', metaKey: true, shiftKey: true }, history);
  assert.ok(macRedo);
  assert.equal(macRedo.text, 'hello world');
});

test('handleEditorKeyDown: ignores Enter when Ctrl or Cmd is pressed (prevents newline on request execute)', () => {
  const code = '{"message": "hello"}';

  // Ctrl+Enter: must return null so no newline is inserted
  const ctrlEnter = handleEditorKeyDown(code, code.length, code.length, {
    key: 'Enter',
    ctrlKey: true,
  });
  assert.equal(ctrlEnter, null);

  // Cmd+Enter (Mac): must return null
  const cmdEnter = handleEditorKeyDown(code, code.length, code.length, {
    key: 'Enter',
    metaKey: true,
  });
  assert.equal(cmdEnter, null);

  // Normal Enter: must insert newline
  const normalEnter = handleEditorKeyDown(code, code.length, code.length, {
    key: 'Enter',
  });
  assert.ok(normalEnter);
  assert.equal(normalEnter.text, `${code}\n`);

  // Shift+Enter: must insert newline
  const shiftEnter = handleEditorKeyDown(code, code.length, code.length, {
    key: 'Enter',
    shiftKey: true,
  });
  assert.ok(shiftEnter);
  assert.equal(shiftEnter.text, `${code}\n`);
});

test('handleToggleComment: comments single line at cursor', () => {
  const code = 'const x = 10;';
  const res = handleToggleComment(code, 6, 6);
  assert.equal(res.text, '// const x = 10;');
  assert.equal(res.selectionStart, 9);
  assert.equal(res.selectionEnd, 9);

  // Toggle back to uncomment
  const unres = handleToggleComment(res.text, 9, 9);
  assert.equal(unres.text, code);
  assert.equal(unres.selectionStart, 6);
});

test('handleToggleComment: comments indented lines preserving indentation', () => {
  const code = '  const y = 20;';
  const res = handleToggleComment(code, 4, 4);
  assert.equal(res.text, '  // const y = 20;');

  const unres = handleToggleComment(res.text, 7, 7);
  assert.equal(unres.text, code);
});

test('handleToggleComment: multi-line selection comments and uncomments all lines', () => {
  const multi = 'line1\nline2\nline3';
  const commented = handleToggleComment(multi, 2, 8);
  assert.equal(commented.text, '// line1\n// line2\nline3');

  const uncommented = handleToggleComment(commented.text, 5, 14);
  assert.equal(uncommented.text, multi);
});

test('handleEditorKeyDown: dispatches Ctrl+/ to toggle comment', () => {
  const code = '{"foo": "bar"}';
  const res = handleEditorKeyDown(code, 2, 2, { key: '/', ctrlKey: true });
  assert.ok(res);
  assert.equal(res.text, '// {"foo": "bar"}');

  const unres = handleEditorKeyDown(res.text, 5, 5, { key: '/', metaKey: true });
  assert.ok(unres);
  assert.equal(unres.text, code);
});

test('handleDeleteLine: removes current line at cursor', () => {
  // Middle line
  const threeLines = 'line1\nline2\nline3';
  const resMiddle = handleDeleteLine(threeLines, 8, 8); // cursor in "line2"
  assert.equal(resMiddle.text, 'line1\nline3');
  assert.equal(resMiddle.selectionStart, 6);

  // First line
  const resFirst = handleDeleteLine(threeLines, 2, 2); // cursor in "line1"
  assert.equal(resFirst.text, 'line2\nline3');
  assert.equal(resFirst.selectionStart, 0);

  // Last line
  const resLast = handleDeleteLine(threeLines, 14, 14); // cursor in "line3"
  assert.equal(resLast.text, 'line1\nline2');
  assert.equal(resLast.selectionStart, 11);

  // Single line document
  const single = 'only one line';
  const resSingle = handleDeleteLine(single, 4, 4);
  assert.equal(resSingle.text, '');
  assert.equal(resSingle.selectionStart, 0);
});

test('handleEditorKeyDown: dispatches Ctrl+[ and Ctrl+] for indentation', () => {
  const text = 'line1\n  line2';

  // Ctrl+[ on line 2 unindents
  const unindent = handleEditorKeyDown(text, 10, 10, { key: '[', ctrlKey: true });
  assert.ok(unindent);
  assert.equal(unindent.text, 'line1\nline2');

  // Ctrl+] on line 1 indents line
  const indent = handleEditorKeyDown(text, 2, 2, { key: ']', ctrlKey: true });
  assert.ok(indent);
  assert.equal(indent.text, '  line1\n  line2');
});

test('handleEditorKeyDown: dispatches Ctrl+X to remove current line when no selection', () => {
  const text = 'alpha\nbeta\ngamma';

  // No selection (start === end): removes current line
  const cutLine = handleEditorKeyDown(text, 8, 8, { key: 'x', ctrlKey: true });
  assert.ok(cutLine);
  assert.equal(cutLine.text, 'alpha\ngamma');

  // With selection: returns null to allow browser native clipboard cut
  const withSelection = handleEditorKeyDown(text, 0, 5, { key: 'x', ctrlKey: true });
  assert.equal(withSelection, null);
});

test('handleMoveLine: moves line up and down with Alt+ArrowUp / Alt+ArrowDown', () => {
  const doc = 'line1\nline2\nline3';

  // Move line2 up -> line2\nline1\nline3
  const moveUp = handleEditorKeyDown(doc, 7, 7, { key: 'ArrowUp', altKey: true });
  assert.ok(moveUp);
  assert.equal(moveUp.text, 'line2\nline1\nline3');
  assert.equal(moveUp.selectionStart, 1);

  // Move line1 down from start -> line2\nline1\nline3
  const moveDown = handleEditorKeyDown(doc, 2, 2, { key: 'ArrowDown', altKey: true });
  assert.ok(moveDown);
  assert.equal(moveDown.text, 'line2\nline1\nline3');
  assert.equal(moveDown.selectionStart, 8);

  // Top line cannot move up
  const topUp = handleEditorKeyDown(doc, 0, 0, { key: 'ArrowUp', altKey: true });
  assert.ok(topUp);
  assert.equal(topUp.text, doc);

  // Bottom line cannot move down
  const bottomDown = handleEditorKeyDown(doc, 15, 15, { key: 'ArrowDown', altKey: true });
  assert.ok(bottomDown);
  assert.equal(bottomDown.text, doc);
});



