import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectResponseFormat,
  formatResponseBody,
  tokenizeHtmlLine,
} from './responseDetector.ts';
import { tokenizeJsonLine } from './variableHighlight.ts';

test('detectResponseFormat: detects JSON from content-type or structure', () => {
  assert.equal(detectResponseFormat('{"hello":"world"}'), 'json');
  assert.equal(detectResponseFormat('[1, 2, 3]'), 'json');
  assert.equal(detectResponseFormat('{"a":1}', 'application/json; charset=utf-8'), 'json');
  assert.equal(detectResponseFormat({ id: 1, name: 'Alice' }), 'json');
  assert.equal(detectResponseFormat([{ id: 1 }]), 'json');
  assert.equal(detectResponseFormat(123), 'json');
  assert.equal(detectResponseFormat(true), 'json');
});

test('detectResponseFormat: detects HTML from content-type, tags, or markup', () => {
  const html = '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>';
  assert.equal(detectResponseFormat(html), 'html');
  assert.equal(detectResponseFormat('<div>Hello</div>', 'text/html'), 'html');
  assert.equal(detectResponseFormat('<p class="lead">Hello World</p>'), 'html');
  assert.equal(detectResponseFormat('<img src="avatar.png" />'), 'html');
});

test('detectResponseFormat: falls back to text for plain text', () => {
  assert.equal(detectResponseFormat('Plain text response'), 'text');
  assert.equal(detectResponseFormat('OK 200'), 'text');
  assert.equal(detectResponseFormat(''), 'text');
  assert.equal(detectResponseFormat(null), 'text');
  assert.equal(detectResponseFormat(undefined), 'text');
});

test('formatResponseBody: pretty prints JSON string with 2-space indentation', () => {
  const formatted = formatResponseBody('{"a":1,"b":[2,3]}', 'json');
  assert.equal(
    formatted,
    JSON.stringify({ a: 1, b: [2, 3] }, null, 2)
  );
  assert.ok(formatted.includes('  "a": 1'));
  assert.ok(formatted.includes('  "b": ['));
  assert.ok(formatted.includes('    2,'));
});

test('formatResponseBody: pretty prints JSON object and array directly', () => {
  const obj = { user: { id: 1, name: 'Bob' }, roles: ['admin'] };
  const formatted = formatResponseBody(obj, 'json');
  assert.equal(formatted, JSON.stringify(obj, null, 2));
  assert.ok(formatted.includes('  "user": {'));
  assert.ok(formatted.includes('    "id": 1,'));
});

test('formatResponseBody: handles invalid JSON gracefully', () => {
  assert.equal(formatResponseBody('{"broken":', 'json'), '{"broken":');
});

test('formatResponseBody: handles HTML formatting', () => {
  const rawHtml = '<html><body><h1>Title</h1></body></html>';
  const formatted = formatResponseBody(rawHtml, 'html');
  assert.ok(formatted.includes('<h1>Title</h1>'));
  assert.ok(formatted.includes('\n'));
});

test('formatResponseBody: preserves plain text', () => {
  assert.equal(formatResponseBody('Just raw log', 'text'), 'Just raw log');
});

test('JSON indentation and whitespace preservation across lines', () => {
  const complex = {
    root: {
      nested: {
        id: 42,
        title: 'Deep indentation',
        tags: ['one', 'two'],
        flag: false,
        nullable: null,
      },
    },
  };
  const formatted = formatResponseBody(complex, 'json');
  const lines = formatted.split('\n');

  // Verify that multi-level indentation lines exist
  const twoSpaces = lines.find((l) => l.startsWith('  "root":'));
  const fourSpaces = lines.find((l) => l.startsWith('    "nested":'));
  const sixSpaces = lines.find((l) => l.startsWith('      "id": 42'));

  assert.ok(twoSpaces, 'Expected 2-space indentation');
  assert.ok(fourSpaces, 'Expected 4-space indentation');
  assert.ok(sixSpaces, 'Expected 6-space indentation');

  // Verify tokenization preserves leading spaces and character reconstruction 100%
  for (const line of lines) {
    const tokens = tokenizeJsonLine(line);
    const reconstructed = tokens.map((t) => t.text).join('');
    assert.equal(reconstructed, line, `Mismatch on line: "${line}"`);

    // If the line has leading indentation, tokens[0] must contain exact spaces
    const leadingSpacesMatch = line.match(/^(\s+)/);
    if (leadingSpacesMatch) {
      assert.equal(tokens[0].text, leadingSpacesMatch[1]);
      assert.equal(tokens[0].type, 'text');
    }
  }
});

test('Stream message scenario: handles object, JSON string, HTML string, text', () => {
  // 1. JSON object payload (standard gRPC streaming chunk)
  const objMsg = { stream_id: 101, data: { status: 'active' } };
  const objFormat = detectResponseFormat(objMsg);
  assert.equal(objFormat, 'json');
  const formattedObj = formatResponseBody(objMsg, objFormat);
  assert.ok(formattedObj.includes('  "stream_id": 101'));

  // 2. JSON string payload
  const strJsonMsg = '{"seq":2,"text":"message"}';
  const strFormat = detectResponseFormat(strJsonMsg);
  assert.equal(strFormat, 'json');
  const formattedStr = formatResponseBody(strJsonMsg, strFormat);
  assert.ok(formattedStr.includes('  "seq": 2'));

  // 3. HTML string payload
  const htmlMsg = '<div class="alert">Warning</div>';
  const htmlFormat = detectResponseFormat(htmlMsg);
  assert.equal(htmlFormat, 'html');
  const formattedHtml = formatResponseBody(htmlMsg, htmlFormat);
  assert.ok(formattedHtml.includes('<div class="alert">'));

  // 4. Plain text payload
  const textMsg = 'PING';
  const textFormat = detectResponseFormat(textMsg);
  assert.equal(textFormat, 'text');
  const formattedText = formatResponseBody(textMsg, textFormat);
  assert.equal(formattedText, 'PING');
});

test('Saved response scenario: formats JSON with headers and indentation', () => {
  const saved = {
    status_code: 200,
    response_headers: { 'content-type': 'application/json' },
    response_body: '{"saved":true,"count":10}',
  };

  const format = detectResponseFormat(
    saved.response_body,
    saved.response_headers['content-type']
  );
  assert.equal(format, 'json');

  const formatted = formatResponseBody(saved.response_body, format);
  assert.equal(
    formatted,
    '{\n  "saved": true,\n  "count": 10\n}'
  );
  assert.ok(formatted.includes('  "saved": true'));
});

test('tokenizeHtmlLine: parses HTML tags, attributes, and text', () => {
  const line = '  <div class="container" id="main">Hello World</div>';
  const tokens = tokenizeHtmlLine(line);

  const tagToken = tokens.find((t) => t.type === 'tag' && t.text === '<div');
  assert.ok(tagToken);

  const attrToken = tokens.find((t) => t.type === 'attr-name' && t.text === 'class');
  assert.ok(attrToken);

  const valToken = tokens.find((t) => t.type === 'attr-val' && t.text === '"container"');
  assert.ok(valToken);

  const textToken = tokens.find((t) => t.type === 'text' && t.text.includes('Hello World'));
  assert.ok(textToken);

  const closeTag = tokens.find((t) => t.type === 'tag' && t.text === '</div>');
  assert.ok(closeTag);

  // Line reconstruction invariant
  assert.equal(tokens.map((t) => t.text).join(''), line);
});
