import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findFoldableRanges,
  getChildFoldLines,
  getAllFoldLines,
  autoExpandForMatches,
  getFoldedLinePreview,
  collapseDocument,
  reconstructFullText,
} from './codeFolding.ts';

test('findFoldableRanges: finds multi-line objects and arrays with correct depth', () => {
  const json = `{
  "name": "root",
  "child": {
    "sub": 123
  },
  "items": [
    1,
    2
  ]
}`;

  const ranges = findFoldableRanges(json);
  assert.equal(ranges.length, 3);

  // Root
  assert.equal(ranges[0].startLine, 0);
  assert.equal(ranges[0].endLine, 9);
  assert.equal(ranges[0].depth, 0);
  assert.equal(ranges[0].isChild, false);
  assert.equal(ranges[0].type, 'object');

  // Child
  assert.equal(ranges[1].startLine, 2);
  assert.equal(ranges[1].endLine, 4);
  assert.equal(ranges[1].depth, 1);
  assert.equal(ranges[1].isChild, true);

  // Items
  assert.equal(ranges[2].startLine, 5);
  assert.equal(ranges[2].endLine, 8);
  assert.equal(ranges[2].depth, 1);
  assert.equal(ranges[2].isChild, true);
  assert.equal(ranges[2].type, 'array');
});

test('findFoldableRanges: ignores braces in strings and comments', () => {
  const code = `{
  "bracketStr": "{ not a block }",
  // Comment with { brace
  /* Multi-line
     { comment } */
  "realChild": {
    "ok": true
  }
}`;

  const ranges = findFoldableRanges(code);
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].startLine, 0);
  assert.equal(ranges[1].startLine, 5);
  assert.equal(ranges[1].endLine, 7);
});

test('findFoldableRanges: ignores single-line blocks', () => {
  const json = `{
  "singleObj": { "a": 1 },
  "singleArr": [1, 2, 3]
}`;

  const ranges = findFoldableRanges(json);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].startLine, 0);
  assert.equal(ranges[0].endLine, 3);
});

test('getChildFoldLines and getAllFoldLines: filters lines appropriately', () => {
  const json = `{
  "data": {
    "list": [
      1
    ]
  }
}`;
  const ranges = findFoldableRanges(json);
  const childLines = getChildFoldLines(ranges);
  const allLines = getAllFoldLines(ranges);

  assert.equal(childLines.has(0), false);
  assert.equal(childLines.has(1), true);
  assert.equal(childLines.has(2), true);
  assert.equal(allLines.has(0), true);
  assert.equal(allLines.size, 3);
});

test('getFoldedLinePreview: formats clean preview with ... without comments or numbers', () => {
  // Root JSON
  assert.equal(getFoldedLinePreview('{', '}', 'object'), '{ ... }');
  // Child JSON with comma
  assert.equal(getFoldedLinePreview('  "address": {', '  },', 'object'), '  "address": { ... },');
  // Array
  assert.equal(getFoldedLinePreview('  "items": [', '  ]', 'array'), '  "items": [ ... ]');
  // JS function callback
  assert.equal(
    getFoldedLinePreview('pm.test("Status code is 0 (OK)", () => {', '});', 'object'),
    'pm.test("Status code is 0 (OK)", () => { ... });'
  );
});

test('collapseDocument: retains true original line numbers and clean ... placeholder', () => {
  const js = `pm.test("test 1", () => {
  pm.expect(1).to.equal(1);
});

pm.test("test 2", () => {
  pm.expect(2).to.equal(2);
});`;

  const ranges = findFoldableRanges(js);
  const folded = new Set([0]); // fold test 1

  const res = collapseDocument(js, folded, ranges);
  assert.equal(res.lines.length, 5);

  // Line 0 (collapsed test 1): original line 0 (gutter 1)
  assert.equal(res.lines[0].displayLineIndex, 0);
  assert.equal(res.lines[0].originalLineIndex, 0);
  assert.equal(res.lines[0].text, 'pm.test("test 1", () => { ... });');
  assert.equal(res.lines[0].isFolded, true);
  assert.equal(res.lines[0].hiddenCount, 2);

  // Line 1: empty line (original line 3, gutter 4)
  assert.equal(res.lines[1].originalLineIndex, 3);
  assert.equal(res.lines[1].text, '');
  assert.equal(res.lines[1].isFolded, false);

  // Line 2: test 2 (original line 4, gutter 5)
  assert.equal(res.lines[2].originalLineIndex, 4);
  assert.equal(res.lines[2].text, 'pm.test("test 2", () => {');
  assert.equal(res.lines[2].isFolded, false);
  assert.equal(res.lines[2].canFold, true);
});

test('reconstructFullText: restores original full document when editing around folded blocks', () => {
  const json = `{
  "user": {
    "name": "Jane",
    "age": 25
  },
  "score": 100
}`;

  const ranges = findFoldableRanges(json);
  const folded = new Set([1]); // Fold "user"

  const collapsed = collapseDocument(json, folded, ranges);
  assert.equal(collapsed.displayText, `{\n  "user": { ... },\n  "score": 100\n}`);

  // User edits score from 100 to 200 in the display text
  const userEditedDisplay = `{\n  "user": { ... },\n  "score": 200\n}`;
  const reconstructed = reconstructFullText(userEditedDisplay, json, folded, ranges);

  assert.equal(reconstructed.activeFoldedLines.has(1), true);
  assert.equal(
    reconstructed.fullText,
    `{\n  "user": {\n    "name": "Jane",\n    "age": 25\n  },\n  "score": 200\n}`
  );
});

test('reconstructFullText: unfolds block if user edited the folded placeholder line', () => {
  const json = `{
  "user": {
    "name": "Jane"
  }
}`;
  const ranges = findFoldableRanges(json);
  const folded = new Set([1]);

  // User deletes user line completely
  const userEditedDisplay = `{\n}`;
  const reconstructed = reconstructFullText(userEditedDisplay, json, folded, ranges);

  assert.equal(reconstructed.activeFoldedLines.size, 0); // No longer folded
  assert.equal(reconstructed.fullText, `{\n}`);
});

test('autoExpandForMatches: expands folded parent ranges when hidden lines match query', () => {
  const text = `{
  "details": {
    "secret": "found_me"
  }
}`;
  const ranges = findFoldableRanges(text);
  const folded = new Set([1]); // line 1 "details" folded
  const matchedLines = [2]; // line 2 contains secret

  const updated = autoExpandForMatches(ranges, folded, matchedLines);
  assert.equal(updated.has(1), false);
});
