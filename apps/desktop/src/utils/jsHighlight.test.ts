import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeJsLine } from './jsHighlight.ts';

test('tokenizeJsLine: parses keywords, globals, and strings', () => {
  const line = 'const token = pm.variables.get("TOKEN");';
  const tokens = tokenizeJsLine(line);

  // const -> keyword
  const constToken = tokens.find((t) => t.text === 'const');
  assert.ok(constToken);
  assert.equal(constToken.type, 'keyword');

  // pm -> global
  const pmToken = tokens.find((t) => t.text === 'pm');
  assert.ok(pmToken);
  assert.equal(pmToken.type, 'global');

  // "TOKEN" -> string
  const strToken = tokens.find((t) => t.text === '"TOKEN"');
  assert.ok(strToken);
  assert.equal(strToken.type, 'string');
});

test('tokenizeJsLine: handles comments at end of line', () => {
  const line = 'pm.test("Status 0", () => {}); // Verify OK';
  const tokens = tokenizeJsLine(line);

  const commentToken = tokens.find((t) => t.type === 'comment');
  assert.ok(commentToken);
  assert.equal(commentToken.text, '// Verify OK');
});

test('tokenizeJsLine: parses pm.environment.set snippet', () => {
  const line = 'pm.environment.set("nutrade_token", body.details.token);';
  const tokens = tokenizeJsLine(line);

  assert.equal(tokens[0].text, 'pm');
  assert.equal(tokens[0].type, 'global');

  const str = tokens.find((t) => t.text === '"nutrade_token"');
  assert.ok(str);
  assert.equal(str.type, 'string');
});
