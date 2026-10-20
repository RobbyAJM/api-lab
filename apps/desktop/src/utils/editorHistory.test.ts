import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorHistory } from './editorHistory.ts';

test('EditorHistory: initializes with base text and cannot undo initially', () => {
  const history = new EditorHistory('hello', 5, 5);
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);
  assert.equal(history.undo('hello', 5, 5), null);
});

test('EditorHistory: records changes and undoes back to previous state', () => {
  const history = new EditorHistory('hello', 5, 5);
  history.recordChange('hello world', 11, 11, true);

  assert.equal(history.canUndo(), true);
  assert.equal(history.canRedo(), false);

  const prev = history.undo('hello world', 11, 11);
  assert.ok(prev);
  assert.equal(prev.text, 'hello');
  assert.equal(prev.selectionStart, 5);

  assert.equal(history.canRedo(), true);

  const redone = history.redo();
  assert.ok(redone);
  assert.equal(redone.text, 'hello world');
  assert.equal(redone.selectionStart, 11);
});

test('EditorHistory: multiple edits stack and undo successively', () => {
  const history = new EditorHistory('A', 1, 1);
  history.recordChange('AB', 2, 2, true);
  history.recordChange('ABC', 3, 3, true);

  const undo1 = history.undo('ABC', 3, 3);
  assert.equal(undo1?.text, 'AB');

  const undo2 = history.undo('AB', 2, 2);
  assert.equal(undo2?.text, 'A');

  assert.equal(history.undo('A', 1, 1), null);

  const redo1 = history.redo();
  assert.equal(redo1?.text, 'AB');

  const redo2 = history.redo();
  assert.equal(redo2?.text, 'ABC');
});

test('EditorHistory: recordExternalChange enables Ctrl+Z undo for external generators/snippets', () => {
  const history = new EditorHistory('{\n}', 0, 0);
  assert.equal(history.canUndo(), false);

  // User triggers "Generate Example" or clicks snippet
  const generated = '{\n  "id": 123,\n  "name": "Generated"\n}';
  const recorded = history.recordExternalChange(generated);
  assert.equal(recorded, true);
  assert.equal(history.canUndo(), true);

  // Re-recording identical text does nothing
  assert.equal(history.recordExternalChange(generated), false);

  // Ctrl+Z undo restores previous state
  const undone = history.undo(generated, 0, 0);
  assert.ok(undone);
  assert.equal(undone.text, '{\n}');

  // Redo re-applies generated state
  const redone = history.redo();
  assert.ok(redone);
  assert.equal(redone.text, generated);
});

test('EditorHistory: reset re-initializes stack', () => {
  const history = new EditorHistory('A', 1, 1);
  history.recordChange('B', 1, 1, true);
  assert.equal(history.canUndo(), true);

  history.reset('C', 1, 1);
  assert.equal(history.canUndo(), false);
  assert.equal(history.getCurrentText(), 'C');
});
