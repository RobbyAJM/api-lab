import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findFoldableRanges,
  getChildFoldLines,
  getAllFoldLines,
  computeFoldedDisplayLines,
  autoExpandForMatches,
  foldText,
  unfoldText,
  toggleFoldRange,
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
  // Expect 3 ranges: root { (0..10, depth 0), child { (2..4, depth 1), items [ (5..8, depth 1)
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
  assert.equal(ranges.length, 2); // root and realChild
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
  assert.equal(ranges.length, 1); // Only root
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
  assert.equal(childLines.has(1), true); // data
  assert.equal(childLines.has(2), true); // list
  assert.equal(allLines.has(0), true);
  assert.equal(allLines.size, 3);
});

test('computeFoldedDisplayLines: collapses lines and adds placeholder suffix', () => {
  const lines = [
    '{',
    '  "name": "Jane",',
    '  "address": {',
    '    "city": "Jakarta",',
    '    "country": "ID"',
    '  }',
    '}'
  ];
  const text = lines.join('\n');
  const ranges = findFoldableRanges(text);
  const folded = new Set([2]); // fold "address"

  const display = computeFoldedDisplayLines(lines, folded, ranges);

  // Visible lines:
  // 0: {
  // 1:   "name": "Jane",
  // 2:   "address": { ... }
  // 3: }
  assert.equal(display.length, 4);
  assert.equal(display[0].lineIndex, 0);
  assert.equal(display[1].lineIndex, 1);
  assert.equal(display[2].lineIndex, 2);
  assert.equal(display[2].isFolded, true);
  assert.equal(display[2].hiddenCount, 3);
  assert.ok(display[2].previewSuffix?.includes('}'));
  assert.equal(display[3].lineIndex, 6);
  assert.equal(display[3].isFolded, false);
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
  assert.equal(updated.has(1), false); // expanded!
});

test('foldText and unfoldText: folds child ranges and recovers original text', () => {
  const json = `{
  "name": "Jane",
  "address": {
    "city": "Jakarta",
    "country": "ID"
  },
  "active": true
}`;

  const ranges = findFoldableRanges(json);
  const childRanges = ranges.filter((r) => r.isChild);
  assert.equal(childRanges.length, 1);

  const { foldedText, foldMap } = foldText(json, childRanges);
  assert.ok(foldedText.includes('/* ... #1 */'));
  assert.equal(foldedText.split('\n').length, 5); // reduced line count

  // Unfold recovers exact original
  const recovered = unfoldText(foldedText, foldMap);
  assert.equal(recovered, json);
});

test('toggleFoldRange: toggles fold on and off cleanly at specific line', () => {
  const json = `{
  "name": "Jane",
  "address": {
    "city": "Jakarta"
  }
}`;
  const ranges = findFoldableRanges(json);

  // Fold line 2
  const step1 = toggleFoldRange(json, 2, ranges, {});
  assert.ok(step1.text.includes('/* ... #1 */'));
  assert.equal(Object.keys(step1.foldMap).length, 1);

  // Unfold line 2
  const step2 = toggleFoldRange(step1.text, 2, ranges, step1.foldMap);
  assert.equal(step2.text, json);
  assert.equal(Object.keys(step2.foldMap).length, 0);
});

