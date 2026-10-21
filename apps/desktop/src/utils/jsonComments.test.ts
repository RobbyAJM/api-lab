import test from 'node:test';
import assert from 'node:assert/strict';
import { stripJsonComments, parseJsonWithComments } from './jsonComments.ts';

test('stripJsonComments: removes single-line comments', () => {
  const json = `{\n  // User identifier\n  "id": 123\n}`;
  const stripped = stripJsonComments(json);
  assert.equal(stripped, `{\n  \n  "id": 123\n}`);
  assert.deepEqual(JSON.parse(stripped), { id: 123 });
});

test('stripJsonComments: preserves slashes in strings', () => {
  const json = `{"url": "https://example.com/api//v1"}`;
  assert.equal(stripJsonComments(json), json);
  assert.deepEqual(parseJsonWithComments(json), { url: 'https://example.com/api//v1' });
});

test('stripJsonComments: handles escaped quotes in strings', () => {
  const json = `{"quote": "He said \\"//not a comment\\""}`;
  assert.equal(stripJsonComments(json), json);
  assert.deepEqual(parseJsonWithComments(json), { quote: 'He said "//not a comment"' });
});

test('stripJsonComments: removes block comments', () => {
  const json = `{\n  /* multi\n     line */\n  "name": "tester"\n}`;
  const parsed = parseJsonWithComments(json);
  assert.deepEqual(parsed, { name: 'tester' });
});

test('parseJsonWithComments: parses empty string to empty object', () => {
  assert.deepEqual(parseJsonWithComments(''), {});
  assert.deepEqual(parseJsonWithComments('   \n // comment \n '), {});
});
