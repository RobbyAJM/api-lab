import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenizeVariables,
  tokenizeJsonLine,
  type VariableToken,
  type JsonSyntaxToken,
} from './variableHighlight.ts';

test('tokenizeVariables: empty string returns empty array', () => {
  const tokens = tokenizeVariables('');
  assert.deepEqual(tokens, []);
});

test('tokenizeVariables: plain string with no variables', () => {
  const text = 'https://api.example.com/v1/users';
  const tokens = tokenizeVariables(text);
  assert.deepEqual(tokens, [
    { text: 'https://api.example.com/v1/users', isVariable: false },
  ]);
});

test('tokenizeVariables: distinguishes defined vs undefined variables', () => {
  const text = '{{BASE_URL}}/users/{{USER_ID}}/details?key={{API_KEY}}';
  const env = {
    BASE_URL: 'https://api.example.com',
    USER_ID: '42',
  };

  const tokens = tokenizeVariables(text, env);

  assert.equal(tokens.length, 5);

  // BASE_URL (defined)
  assert.deepEqual(tokens[0], {
    text: '{{BASE_URL}}',
    isVariable: true,
    name: 'BASE_URL',
    isDefined: true,
    value: 'https://api.example.com',
  });

  // /users/
  assert.deepEqual(tokens[1], {
    text: '/users/',
    isVariable: false,
  });

  // USER_ID (defined)
  assert.deepEqual(tokens[2], {
    text: '{{USER_ID}}',
    isVariable: true,
    name: 'USER_ID',
    isDefined: true,
    value: '42',
  });

  // /details?key=
  assert.deepEqual(tokens[3], {
    text: '/details?key=',
    isVariable: false,
  });

  // API_KEY (undefined)
  assert.deepEqual(tokens[4], {
    text: '{{API_KEY}}',
    isVariable: true,
    name: 'API_KEY',
    isDefined: false,
    value: undefined,
  });

  // Trailing empty shouldn't create phantom tokens
  assert.equal(tokens.length, 5);
});

test('tokenizeVariables: supports Set and Map as environment variable sources', () => {
  const setSource = new Set(['TOKEN']);
  const tokens1 = tokenizeVariables('Bearer {{TOKEN}} {{MISSING}}', setSource);
  assert.equal(tokens1[1].isDefined, true);
  assert.equal(tokens1[3].isDefined, false);

  const mapSource = new Map([['PORT', '8080']]);
  const tokens2 = tokenizeVariables('localhost:{{PORT}}', mapSource);
  assert.equal(tokens2[1].isDefined, true);
  assert.equal(tokens2[1].value, '8080');

  const arraySource = [
    { id: '1', environment_id: 'e1', key: 'ARRAY_VAR', value: 'hello_array', is_sensitive: false, created_at: '', updated_at: '' },
  ];
  const tokens3 = tokenizeVariables('val={{ARRAY_VAR}}', arraySource);
  assert.equal(tokens3[1].isDefined, true);
  assert.equal(tokens3[1].value, 'hello_array');
});

test('tokenizeJsonLine: highlights defined and undefined variables embedded in JSON strings', () => {
  const line = '  "url": "{{BASE_URL}}/items/{{ITEM_ID}}",';
  const env = { BASE_URL: 'https://example.com' };

  const tokens = tokenizeJsonLine(line, env);

  // Key
  assert.equal(tokens[1].type, 'key');
  assert.equal(tokens[1].text, '"url":');

  // String prefix before variable: "
  assert.equal(tokens[3].type, 'string');
  assert.equal(tokens[3].text, '"');

  // Variable: {{BASE_URL}} (defined)
  assert.equal(tokens[4].type, 'variable');
  assert.equal(tokens[4].varName, 'BASE_URL');
  assert.equal(tokens[4].isDefined, true);

  // In-between string: /items/
  assert.equal(tokens[5].type, 'string');
  assert.equal(tokens[5].text, '/items/');

  // Variable: {{ITEM_ID}} (undefined)
  assert.equal(tokens[6].type, 'variable');
  assert.equal(tokens[6].varName, 'ITEM_ID');
  assert.equal(tokens[6].isDefined, false);

  // String suffix: "
  assert.equal(tokens[7].type, 'string');
  assert.equal(tokens[7].text, '"');
});

test('tokenizeJsonLine: standalone variable outside quotes', () => {
  const line = '  "id": {{ID}},';
  const env = { ID: '100' };
  const tokens = tokenizeJsonLine(line, env);

  const varToken = tokens.find((t) => t.type === 'variable');
  assert.ok(varToken);
  assert.equal(varToken.varName, 'ID');
  assert.equal(varToken.isDefined, true);
});

test('tokenizeJsonLine: parses single-line comment', () => {
  const line = '  // This is a comment';
  const tokens = tokenizeJsonLine(line);

  const comment = tokens.find((t) => t.type === 'comment');
  assert.ok(comment);
  assert.equal(comment.text, '// This is a comment');
});

test('tokenizeJsonLine: parses inline comment after JSON tokens', () => {
  const line = '  "key": "value", // inline note';
  const tokens = tokenizeJsonLine(line);

  const key = tokens.find((t) => t.type === 'key');
  assert.ok(key);

  const comment = tokens.find((t) => t.type === 'comment');
  assert.ok(comment);
  assert.equal(comment.text, '// inline note');
});

test('tokenizeJsonLine: preserves slashes inside string literals', () => {
  const line = '  "url": "https://example.com/api//v1"';
  const tokens = tokenizeJsonLine(line);

  const comment = tokens.find((t) => t.type === 'comment');
  assert.equal(comment, undefined);

  const str = tokens.find((t) => t.type === 'string');
  assert.ok(str);
  assert.equal(str.text, '"https://example.com/api//v1"');
});

