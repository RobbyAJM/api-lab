import test from 'node:test';
import assert from 'node:assert/strict';
import fix42Json from '../data/fix/fix42.json' with { type: 'json' };
import fix44Json from '../data/fix/fix44.json' with { type: 'json' };
import { createFixDictionary } from './fixDictionary.ts';
import {
  buildFixEnvelopePreview,
  changeBuilderMsgType,
  createEmptyBuilderDraft,
  DEFAULT_FIX_COMPOSER_HEIGHT_PCT,
  DEFAULT_FIX_EDITOR_MODE,
  FIX_EDITOR_MODE_STORAGE_KEY,
  formatFixUtcDate,
  formatFixUtcTime,
  formatFixUtcTimestamp,
  getFixMessageSchema,
  getStoredFixComposerHeightPct,
  getStoredFixEditorMode,
  hydrateBuilderDraftFromRaw,
  isIdLikeFixField,
  listFixApplicationMessages,
  searchAddableSchemaMembers,
  searchFixApplicationMessages,
  serializeBuilderDraft,
  setStoredFixComposerHeightPct,
  setStoredFixEditorMode,
  validateBuilderDraft,
} from './fixMessageBuilder.ts';
import {
  hasRawSohDelimiter,
  parseFixDraftFields,
  resolveFixMessageTypeLabel,
} from './fixSession.ts';

const fix42 = createFixDictionary(fix42Json as any);
const fix44 = createFixDictionary(fix44Json as any);

const SCREENSHOT_MARKET_DATA_REQUEST =
  '8=FIX.4.4\u00019=165\u000135=V\u000134=2\u000149=LOCAL_ROBBY_Q\u000152=20261120-13:33:18.084\u000156=Valutrades_UAT_Q\u0001146=1\u000155=XAUIDR\u0001262=a66a143c-ccf3-45e3-915d-ee4576bc0938\u0001263=1\u0001264=1\u0001265=0\u0001267=2\u0001269=0\u0001269=1\u000110=086\u0001';

test('listFixApplicationMessages: excludes admin messages and pins common types first', () => {
  const list44 = listFixApplicationMessages(fix44);
  assert.equal(list44.length > 50, true);
  assert.equal(
    list44.some((item) => ['0', '1', '2', '3', '4', '5', 'A', 'n'].includes(item.msgType)),
    false,
    'admin message types must be excluded'
  );
  assert.equal(list44[0].msgType, 'D');
  assert.equal(list44[0].isCommon, true);

  const list42 = listFixApplicationMessages(fix42);
  assert.equal(list42.length, 39);
});

test('searchFixApplicationMessages: ranks exact MsgType code, initials, and names', () => {
  const byCode = searchFixApplicationMessages(fix44, 'V');
  assert.equal(byCode[0].msgType, 'V');
  assert.equal(byCode[0].label, 'Market Data Request');

  const byInitials = searchFixApplicationMessages(fix44, 'mdr');
  assert.equal(byInitials[0].msgType, 'V');

  const byName = searchFixApplicationMessages(fix44, 'cancel replace');
  assert.equal(byName[0].msgType, 'G');

  const byMultiCharCode = searchFixApplicationMessages(fix44, 'AE');
  assert.equal(byMultiCharCode[0].msgType, 'AE');
});

test('getFixMessageSchema: promotes FIX 4.4 required component starters (Instrument & OrderQtyData)', () => {
  const nos44 = getFixMessageSchema(fix44, 'D');
  assert.ok(nos44);
  const starterTags44 = nos44.fields.filter((f) => f.isStarter).map((f) => f.tag);
  assert.deepEqual(
    starterTags44,
    [11, 55, 54, 60, 38, 40],
    'FIX 4.4 NewOrderSingle includes ClOrdID, Symbol, Side, TransactTime, OrderQty, OrdType'
  );

  const nos42 = getFixMessageSchema(fix42, 'D');
  assert.ok(nos42);
  const starterTags42 = nos42.fields.filter((f) => f.isStarter).map((f) => f.tag);
  assert.equal(starterTags42.includes(21), true, 'FIX 4.2 NewOrderSingle requires 21 HandlInst');
  assert.equal(starterTags42.includes(55), true);
});

test('getFixMessageSchema: exposes required repeating groups & delimiters for 35=V', () => {
  const mdr = getFixMessageSchema(fix44, 'V');
  assert.ok(mdr);
  assert.deepEqual(
    mdr.fields.filter((f) => f.isStarter).map((f) => f.tag),
    [262, 263, 264]
  );
  assert.equal(mdr.conditionalFields.some((f) => f.tag === 265), true);

  const reqGroups = mdr.groups.filter((g) => g.isStarter);
  assert.deepEqual(
    reqGroups.map((g) => [g.counterTag, g.delimiterTag]),
    [
      [267, 269],
      [146, 55],
    ]
  );
});

test('hydrateBuilderDraftFromRaw & serializeBuilderDraft: round-trips screenshot 35=V SOH message', () => {
  assert.equal(hasRawSohDelimiter(SCREENSHOT_MARKET_DATA_REQUEST), true);
  const draft = hydrateBuilderDraftFromRaw(SCREENSHOT_MARKET_DATA_REQUEST, fix44);

  assert.equal(draft.msgType, 'V');
  assert.equal(draft.parseError, undefined);
  assert.deepEqual(
    draft.strippedEnvelopeFields.map(([tag]) => tag),
    [8, 9, 34, 49, 52, 56, 10]
  );

  const fieldMap = new Map(draft.fields.map((f) => [f.tag, f.value]));
  assert.equal(fieldMap.get(262), 'a66a143c-ccf3-45e3-915d-ee4576bc0938');
  assert.equal(fieldMap.get(263), '1');
  assert.equal(fieldMap.get(264), '1');
  assert.equal(fieldMap.get(265), '0');

  const mdEntries = draft.groups.find((g) => g.counterTag === 267);
  assert.ok(mdEntries);
  assert.equal(mdEntries.entries.length, 2);
  assert.equal(mdEntries.entries[0].fields[0].tag, 269);
  assert.equal(mdEntries.entries[0].fields[0].value, '0');
  assert.equal(mdEntries.entries[1].fields[0].value, '1');

  const syms = draft.groups.find((g) => g.counterTag === 146);
  assert.ok(syms);
  assert.equal(syms.entries.length, 1);
  assert.equal(syms.entries[0].fields[0].tag, 55);
  assert.equal(syms.entries[0].fields[0].value, 'XAUIDR');

  const serialized = serializeBuilderDraft(draft, fix44);
  assert.equal(
    serialized,
    '35=V|262=a66a143c-ccf3-45e3-915d-ee4576bc0938|263=1|264=1|265=0|267=2|269=0|269=1|146=1|55=XAUIDR'
  );
  const validation = validateBuilderDraft(draft, fix44);
  assert.equal(validation.blockingError, null);
  assert.deepEqual(validation.missingRequired, []);
  assert.deepEqual(validation.delimiterWarnings, []);
});

test('hydrateBuilderDraftFromRaw & serializeBuilderDraft: supports nested repeating groups (453 -> 802)', () => {
  const raw =
    '35=D|11=ORD-1|453=1|448=PARTY1|447=D|452=1|802=2|523=SUB1|803=1|523=SUB2|803=2|55=EURUSD|54=1|60=20261120-13:33:18.000|38=100|40=1';
  const draft = hydrateBuilderDraftFromRaw(raw, fix44);
  const parties = draft.groups.find((g) => g.counterTag === 453);
  assert.ok(parties);
  assert.equal(parties.entries.length, 1);
  const subGroup = parties.entries[0].groups.find((g) => g.counterTag === 802);
  assert.ok(subGroup);
  assert.equal(subGroup.entries.length, 2);
  assert.equal(subGroup.entries[0].fields[0].value, 'SUB1');
  assert.equal(subGroup.entries[1].fields[0].value, 'SUB2');

  const serialized = serializeBuilderDraft(draft, fix44);
  assert.match(serialized, /453=1\|448=PARTY1\|447=D\|452=1\|802=2\|523=SUB1\|803=1\|523=SUB2\|803=2/);
});

test('changeBuilderMsgType: preserves shared values across V <-> D and drops unmatched empty fields', () => {
  const mdrDraft = hydrateBuilderDraftFromRaw(SCREENSHOT_MARKET_DATA_REQUEST, fix44);
  const switchedToOrder = changeBuilderMsgType(mdrDraft, 'D', fix44);
  assert.equal(switchedToOrder.msgType, 'D');

  const orderFields = new Map(switchedToOrder.fields.map((f) => [f.tag, f]));
  // Symbol (55) carried over from 146 NoRelatedSym into D's top-level Symbol!
  assert.equal(orderFields.get(55)?.value, 'XAUIDR');
  assert.equal(orderFields.get(55)?.isExtra, undefined);
  // Required starter fields for D exist
  assert.equal(orderFields.has(11), true);
  assert.equal(orderFields.has(54), true);
  assert.equal(orderFields.has(60), true);
  assert.equal(orderFields.has(38), true);
  assert.equal(orderFields.has(40), true);
  // Non-empty unmatched fields from V retained as extra (zero data loss)
  assert.equal(orderFields.get(262)?.isExtra, true);

  // Switch D -> G (Cancel/Replace): shared fields + Price carry over, empty fields dropped
  const orderDraft = createEmptyBuilderDraft(fix44, 'D');
  orderDraft.fields = orderDraft.fields.map((f) => {
    if (f.tag === 11) return { ...f, value: 'ORD-42' };
    if (f.tag === 55) return { ...f, value: 'AAPL' };
    if (f.tag === 54) return { ...f, value: '1' };
    return f;
  });
  orderDraft.fields.push({ tag: 44, value: '192.50' });
  orderDraft.fields.push({ tag: 58, value: '' }); // empty unmatched/optional

  const cancelReplace = changeBuilderMsgType(orderDraft, 'G', fix44);
  const crMap = new Map(cancelReplace.fields.map((f) => [f.tag, f]));
  assert.equal(crMap.get(11)?.value, 'ORD-42');
  assert.equal(crMap.get(55)?.value, 'AAPL');
  assert.equal(crMap.get(54)?.value, '1');
  assert.equal(crMap.get(44)?.value, '192.50');
  assert.equal(crMap.has(41), true, 'OrigClOrdID required in G');
  assert.equal(crMap.has(58), false, 'empty non-starter field dropped');
});

test('serializeBuilderDraft: omits empty fields and empty repeating groups', () => {
  const emptyV = createEmptyBuilderDraft(fix44, 'V');
  assert.equal(serializeBuilderDraft(emptyV, fix44), '35=V');

  const validation = validateBuilderDraft(emptyV, fix44);
  assert.equal(validation.blockingError, null, 'missing required fields are non-blocking');
  assert.equal(validation.missingRequired.length, 5); // 262, 263, 264, group 267, group 146
});

test('validateBuilderDraft: warns when a repeating group entry omits its delimiter tag', () => {
  const draft = createEmptyBuilderDraft(fix44, 'V');
  const syms = draft.groups.find((g) => g.counterTag === 146)!;
  // Leave delimiter 55 empty, add optional 48 SecurityID with value
  syms.entries[0].fields.push({ tag: 48, value: 'ISIN123' });

  const validation = validateBuilderDraft(draft, fix44);
  assert.equal(validation.delimiterWarnings.length, 1);
  assert.equal(validation.delimiterWarnings[0].tag, 55);
});

test('hydrateBuilderDraftFromRaw: preserves custom tags, sensitive values, and reports errors cleanly', () => {
  const withCustomAndSecret = '35=D|11=ORD-1|55=AAPL|554=my-secret|5001=BROKER_TAG';
  assert.equal(
    parseFixDraftFields(withCustomAndSecret, { maskSensitive: false }).find(
      ([t]) => t === '554'
    )?.[1],
    'my-secret'
  );
  const hydrated = hydrateBuilderDraftFromRaw(withCustomAndSecret, fix44);
  assert.equal(hydrated.fields.find((f) => f.tag === 554)?.value, 'my-secret');
  assert.equal(hydrated.fields.find((f) => f.tag === 5001)?.value, 'BROKER_TAG');
  assert.equal(hydrated.fields.find((f) => f.tag === 5001)?.isExtra, true);

  const malformed = hydrateBuilderDraftFromRaw('35=D|BADTAG', fix44);
  assert.match(malformed.parseError || '', /missing '='/);

  const admin = hydrateBuilderDraftFromRaw('35=A|98=0|108=30', fix44);
  assert.equal(admin.adminMsgType, 'A');
  assert.match(
    validateBuilderDraft(admin, fix44).blockingError || '',
    /managed automatically/
  );
});

test('searchAddableSchemaMembers: finds schema fields, optional groups, global tags, and custom numeric tags', () => {
  const schema = getFixMessageSchema(fix44, 'V')!;
  const existingFields = new Set([262, 263, 264]);
  const existingGroups = new Set([267, 146]);

  const cond = searchAddableSchemaMembers(schema, fix44, existingFields, existingGroups, '265');
  assert.equal(cond[0].tag, 265);
  assert.equal(cond[0].reqd, 'C');

  const optGroup = searchAddableSchemaMembers(
    schema,
    fix44,
    existingFields,
    existingGroups,
    'NoTradingSessions'
  );
  assert.equal(optGroup[0].kind, 'group');
  assert.equal(optGroup[0].tag, 386);

  const globalHeaderTag = searchAddableSchemaMembers(
    schema,
    fix44,
    existingFields,
    existingGroups,
    'SenderSubID'
  );
  assert.equal(globalHeaderTag[0].tag, 50);
  assert.equal(globalHeaderTag[0].fromSchema, false);

  const customTag = searchAddableSchemaMembers(
    schema,
    fix44,
    existingFields,
    existingGroups,
    '5001'
  );
  assert.equal(customTag[0].kind, 'custom_tag');
  assert.equal(customTag[0].tag, 5001);
});

test('buildFixEnvelopePreview: reflects session config and pasted envelope overrides', () => {
  const preview = buildFixEnvelopePreview(
    {
      begin_string: 'FIX.4.4',
      sender_comp_id: 'LOCAL_ROBBY_Q',
      target_comp_id: 'Valutrades_UAT_Q',
    },
    [
      [8, 'FIX.4.4'],
      [34, '2'],
      [10, '086'],
    ]
  );
  assert.equal(preview.length, 7);
  assert.equal(preview.find((p) => p.tag === 49)?.effectiveValue, 'LOCAL_ROBBY_Q');
  assert.equal(preview.find((p) => p.tag === 34)?.pastedValue, '2');
  assert.equal(preview.find((p) => p.tag === 10)?.section, 'trailer');
});

test('UTC formatters, ID detection, dictionary labels, and storage preferences work deterministically', () => {
  const sampleDate = new Date('2026-11-23T09:05:07.042Z');
  assert.equal(formatFixUtcTimestamp(sampleDate), '20261123-09:05:07.042');
  assert.equal(formatFixUtcDate(sampleDate), '20261123');
  assert.equal(formatFixUtcTime(sampleDate), '09:05:07.042');
  assert.equal(isIdLikeFixField(262, 'MDReqID'), true);
  assert.equal(isIdLikeFixField(55, 'Symbol'), false);

  assert.equal(resolveFixMessageTypeLabel('c', fix44), 'Security Definition Request');
  assert.equal(resolveFixMessageTypeLabel('V', null), 'Market Data Request');

  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };

  assert.equal(DEFAULT_FIX_EDITOR_MODE, 'advanced');
  assert.equal(getStoredFixEditorMode(storage), 'advanced');
  setStoredFixEditorMode('raw', storage);
  assert.equal(store.get(FIX_EDITOR_MODE_STORAGE_KEY), 'raw');
  assert.equal(getStoredFixEditorMode(storage), 'raw');
  setStoredFixEditorMode('advanced', storage);
  assert.equal(getStoredFixEditorMode(storage), 'advanced');

  assert.equal(getStoredFixComposerHeightPct(storage), DEFAULT_FIX_COMPOSER_HEIGHT_PCT);
  setStoredFixComposerHeightPct(99, storage);
  assert.equal(getStoredFixComposerHeightPct(storage), 72);
  setStoredFixComposerHeightPct(5, storage);
  assert.equal(getStoredFixComposerHeightPct(storage), 20);
});
