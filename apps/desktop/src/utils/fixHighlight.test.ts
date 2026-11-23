import test from 'node:test';
import assert from 'node:assert/strict';
import fix42Json from '../data/fix/fix42.json' with { type: 'json' };
import fix44Json from '../data/fix/fix44.json' with { type: 'json' };
import { createFixDictionary } from './fixDictionary.ts';
import {
  buildFixRawHoverInfo,
  calculateFixRawEditorHeight,
  FIX_RAW_MIN_HEIGHT_PX,
  FIX_RAW_MULTILINE_MAX_HEIGHT_PX,
  FIX_RAW_SINGLE_MAX_HEIGHT_PX,
  formatFixRawAsMultiline,
  formatFixRawAsSingleLine,
  getFixRawTokenClassName,
  isFixRawMultiline,
  tokenizeFixRaw,
} from './fixHighlight.ts';

const fix42 = createFixDictionary(fix42Json as any);
const fix44 = createFixDictionary(fix44Json as any);

const SCREENSHOT_SOH =
  '8=FIX.4.4\u00019=165\u000135=V\u000134=2\u000149=LOCAL_ROBBY_Q\u000152=20261120-13:33:18.084\u000156=Valutrades_UAT_Q\u0001146=1\u000155=XAUIDR\u0001262=a66a143c-ccf3-45e3-915d-ee4576bc0938\u0001263=1\u0001264=1\u0001265=0\u0001267=2\u0001269=0\u0001269=1\u000110=086\u0001';

test('tokenizeFixRaw: strictly preserves 1:1 character stream across all delimiter & edge formats', () => {
  const samples = [
    '',
    '   ',
    SCREENSHOT_SOH,
    '35=D|11=ORD-{{SEQ}}|55={{MISSING}}|54=1|38=10.5|60=20261123-10:00:00.000|5001=CUSTOM',
    '35=D\\x0111=ABC^A55=AAPL\r\n54=2\n38=5|',
    '  35=V | BADFIELD | =emptytag | abc=123 | 55=  | 35=D ',
    '35=A|98=0|554=secret|',
  ];

  for (const sample of samples) {
    const tokens = tokenizeFixRaw(sample, fix44, { SEQ: '42' });
    const rebuilt = tokens.map((t) => t.text).join('');
    assert.equal(rebuilt, sample, `character stream mismatch for: ${JSON.stringify(sample)}`);

    let expectedOffset = 0;
    for (const token of tokens) {
      assert.equal(token.start, expectedOffset);
      assert.equal(token.end, expectedOffset + token.text.length);
      expectedOffset = token.end;
    }
    assert.equal(expectedOffset, sample.length);
  }
});

test('tokenizeFixRaw: classifies envelope, MsgType, repeating group counters, enums, numbers, and custom tags', () => {
  const raw =
    '8=FIX.4.4|35=V|262=req-1|263=1|264=1|267=2|269=0|146=1|55=XAUIDR|5001=BROKER|10=086';
  const tokens = tokenizeFixRaw(raw, fix44);

  const byTextAndTag = (tag: number, text: string) =>
    tokens.find((t) => t.fieldTag === tag && t.text === text);

  assert.equal(byTextAndTag(8, '8')?.kind, 'tag_envelope');
  assert.equal(byTextAndTag(8, 'FIX.4.4')?.kind, 'value_envelope');
  assert.equal(byTextAndTag(10, '10')?.kind, 'tag_envelope');

  assert.equal(byTextAndTag(35, '35')?.kind, 'tag_msg_type');
  assert.equal(byTextAndTag(35, 'V')?.kind, 'value_msg_type');

  assert.equal(byTextAndTag(267, '267')?.kind, 'tag_group_counter');
  assert.equal(byTextAndTag(267, '2')?.kind, 'value_group_count');
  assert.equal(byTextAndTag(146, '146')?.kind, 'tag_group_counter');

  assert.equal(byTextAndTag(263, '263')?.kind, 'tag_body');
  assert.equal(byTextAndTag(263, '1')?.kind, 'value_enum');
  assert.equal(byTextAndTag(269, '0')?.kind, 'value_enum');
  assert.equal(byTextAndTag(264, '1')?.kind, 'value_number');
  assert.equal(byTextAndTag(55, 'XAUIDR')?.kind, 'value_text');

  assert.equal(byTextAndTag(5001, '5001')?.kind, 'tag_custom');
});

test('tokenizeFixRaw: highlights defined and undefined {{VARIABLE}} tokens embedded inside field values', () => {
  const raw = '35=D|11=ORD-{{ORDER_SEQ}}|55={{UNDEF_SYM}}|54=1';
  const tokens = tokenizeFixRaw(raw, fix44, { ORDER_SEQ: '009' });

  const definedVar = tokens.find((t) => t.kind === 'variable' && t.varName === 'ORDER_SEQ');
  assert.ok(definedVar);
  assert.equal(definedVar.isDefined, true);
  assert.equal(definedVar.fieldTag, 11);

  const undefinedVar = tokens.find((t) => t.kind === 'variable' && t.varName === 'UNDEF_SYM');
  assert.ok(undefinedVar);
  assert.equal(undefinedVar.isDefined, false);
  assert.equal(undefinedVar.fieldTag, 55);

  const prefix = tokens.find((t) => t.text === 'ORD-');
  assert.equal(prefix?.kind, 'value_text');
  assert.equal(prefix?.fieldTag, 11);
});

test('tokenizeFixRaw: flags malformed fields, non-numeric tags, duplicate 35=, and admin MsgType inline', () => {
  const badSyntax = tokenizeFixRaw('35=D|MISSING_EQ|abc=123|35=F', fix44);
  const missingEq = badSyntax.find((t) => t.text === 'MISSING_EQ');
  assert.equal(missingEq?.kind, 'error');
  assert.match(missingEq?.errorReason || '', /missing '='/);

  const nonNumeric = badSyntax.find((t) => t.text === 'abc');
  assert.equal(nonNumeric?.kind, 'error');
  assert.match(nonNumeric?.errorReason || '', /must be numeric/);

  const dupMsgType = badSyntax.filter((t) => t.fieldTag === 35 && t.text === '35');
  assert.equal(dupMsgType[0].kind, 'tag_msg_type');
  assert.equal(dupMsgType[1].kind, 'error');
  assert.match(dupMsgType[1].errorReason || '', /more than one MsgType/);

  const adminMsg = tokenizeFixRaw('35=A|98=0', fix44);
  const adminVal = adminMsg.find((t) => t.fieldTag === 35 && t.text === 'A');
  assert.equal(adminVal?.kind, 'value_msg_type_admin');
  assert.match(adminVal?.errorReason || '', /managed automatically/);
});

test('tokenizeFixRaw: distinguishes literal SOH, escaped SOH, caret SOH, pipe, and newline delimiters', () => {
  const tokens = tokenizeFixRaw('35=D\u000111=1\\x0155=A^A54=1\n38=2|40=1', fix44);
  const delimiters = tokens.filter((t) => t.kind === 'delimiter');
  assert.deepEqual(
    delimiters.map((d) => [d.delimiterKind, d.text]),
    [
      ['soh', '\u0001'],
      ['escaped_soh', '\\x01'],
      ['caret_soh', '^A'],
      ['newline', '\n'],
      ['pipe', '|'],
    ]
  );

  // SOH delimiters get amber pill styling without horizontal padding
  const sohClass = getFixRawTokenClassName(delimiters[0]);
  assert.match(sohClass, /amber/);
  assert.equal(/\bpx-|\bmx-|\bborder-/.test(sohClass), false);
});

test('buildFixRawHoverInfo: resolves enum labels, MsgType names, envelope, group counters, and FIX 4.2', () => {
  const enumInfo = buildFixRawHoverInfo({ tag: 263, value: '1' }, fix44);
  assert.equal(enumInfo.name, 'SubscriptionRequestType');
  assert.equal(enumInfo.valueLabel, 'SNAPSHOT PLUS UPDATES');
  assert.equal(enumInfo.isEnvelope, false);

  const msgInfo = buildFixRawHoverInfo({ tag: 35, value: 'V' }, fix44);
  assert.equal(msgInfo.name, 'MsgType');
  assert.equal(msgInfo.valueLabel, 'Market Data Request');

  const envInfo = buildFixRawHoverInfo({ tag: 49, value: 'CLIENT' }, fix44);
  assert.equal(envInfo.isEnvelope, true);

  const groupInfo = buildFixRawHoverInfo({ tag: 267, value: '2' }, fix44);
  assert.equal(groupInfo.isGroupCounter, true);

  const customInfo = buildFixRawHoverInfo({ tag: 5001, value: 'X' }, fix44);
  assert.equal(customInfo.isUnknownTag, true);
  assert.equal(customInfo.name, 'Custom tag 5001');

  const fix42Info = buildFixRawHoverInfo({ tag: 21, value: '1' }, fix42);
  assert.equal(fix42Info.name, 'HandlInst');
  assert.equal(fix42Info.dictionaryVersion, 'FIX.4.2');
});

test('formatFixRawAsMultiline & formatFixRawAsSingleLine: cleanly toggle pipe, SOH, and newline formats', () => {
  assert.equal(isFixRawMultiline('35=D|11=ORD-1|55=AAPL'), false);

  const multiline = formatFixRawAsMultiline(SCREENSHOT_SOH);
  assert.equal(isFixRawMultiline(multiline), true);
  const lines = multiline.split('\n');
  assert.equal(lines.length, 17);
  assert.equal(lines[0], '8=FIX.4.4');
  assert.equal(lines[2], '35=V');
  assert.equal(lines[lines.length - 1], '10=086');

  const singleLine = formatFixRawAsSingleLine(multiline);
  assert.equal(isFixRawMultiline(singleLine), false);
  assert.equal(singleLine.startsWith('8=FIX.4.4|9=165|35=V|'), true);
  assert.equal(singleLine.endsWith('|10=086'), true);
  assert.equal(formatFixRawAsSingleLine('35=D|58=hello world|'), '35=D|58=hello world');
});

test('calculateFixRawEditorHeight: clamps auto-grow bounds for single-line and multiline modes', () => {
  assert.equal(calculateFixRawEditorHeight(20, false), FIX_RAW_MIN_HEIGHT_PX);
  assert.equal(calculateFixRawEditorHeight(120, false), 120);
  assert.equal(calculateFixRawEditorHeight(400, false), FIX_RAW_SINGLE_MAX_HEIGHT_PX);
  assert.equal(calculateFixRawEditorHeight(400, true), FIX_RAW_MULTILINE_MAX_HEIGHT_PX);
});
