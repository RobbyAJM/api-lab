import test from 'node:test';
import assert from 'node:assert/strict';
import type { FixMessageField } from '@api-lab/api-types';
import fix42Json from '../data/fix/fix42.json' with { type: 'json' };
import fix44Json from '../data/fix/fix44.json' with { type: 'json' };
import { createFixDictionary } from './fixDictionary.ts';
import {
  buildGroupEntrySummary,
  calculateFixPopoverPosition,
  formatFixFieldValue,
  getFixFieldReference,
  parseFixMessageForDisplay,
  type FixParsedFieldNode,
  type FixParsedGroupNode,
} from './fixParsedMessage.ts';

const SAMPLE_W =
  '8=FIX.4.4|9=274|35=W|34=10|49=Valutrades_UAT_Q|52=20261120-13:33:18.487|56=LOCAL_ROBBY_Q|55=XAUIDR|262=a66a143c-ccf3-45e3-915d-ee4576bc0938|268=2|269=0|270=2049991|271=10.00|272=20261120|273=13:33:18.486|282=FIX_RELAY|269=1|270=2129058|271=10.00|272=20261120|273=13:33:18.486|282=FIX_RELAY|10=040|';

const fix44 = createFixDictionary(fix44Json as any);
const fix42 = createFixDictionary(fix42Json as any);

function fieldsFromRaw(raw: string): FixMessageField[] {
  return raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf('=');
      assert.ok(index > 0, `invalid field ${part}`);
      return [part.slice(0, index), part.slice(index + 1)];
    });
}

test('parseFixMessageForDisplay: groups MarketDataSnapshotFullRefresh entries in wire order', () => {
  const parsed = parseFixMessageForDisplay(fieldsFromRaw(SAMPLE_W), fix44);
  assert.equal(parsed.msgType, 'W');
  assert.equal(parsed.messageName, 'MarketDataSnapshotFullRefresh');
  assert.equal(parsed.dictionaryVersion, 'FIX.4.4');
  assert.equal(parsed.groupCount, 1);
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(
    parsed.nodes.map((node) => (node.kind === 'field' ? node.tag : node.counterTag)),
    ['8', '9', '35', '34', '49', '52', '56', '55', '262', '268', '10'].map(Number),
    'top-level wire order is preserved around the repeating group'
  );

  const group = parsed.nodes.find(
    (node): node is FixParsedGroupNode =>
      node.kind === 'group' && node.counterTag === 268
  );
  assert.ok(group, 'NoMDEntries group exists');
  assert.equal(group.name, 'NoMDEntries');
  assert.equal(group.declaredCount, 2);
  assert.equal(group.actualCount, 2);
  assert.equal(group.entries.length, 2);
  assert.equal(group.entries[0].summary, 'BID · 2049991 · 10.00');
  assert.equal(group.entries[1].summary, 'OFFER · 2129058 · 10.00');

  const firstEntryType = group.entries[0].nodes.find(
    (node): node is FixParsedFieldNode =>
      node.kind === 'field' && node.tag === 269
  );
  assert.equal(firstEntryType?.name, 'MDEntryType');
  assert.equal(firstEntryType?.groupName, 'NoMDEntries');
  assert.equal(firstEntryType?.entryIndex, 1);

  const symbol = parsed.nodes.find(
    (node): node is FixParsedFieldNode =>
      node.kind === 'field' && node.tag === 55
  );
  assert.equal(symbol?.name, 'Symbol');
  assert.equal(symbol?.value, 'XAUIDR');
});

test('formatFixFieldValue: resolves message and enum descriptions plus identifiers', () => {
  const dictionary = fix44;
  const msgType = dictionary.fieldByTag(35);
  const msgTypeValue = formatFixFieldValue(dictionary, msgType, 'W');
  assert.equal(msgTypeValue.isEnum, true);
  assert.match(msgTypeValue.label || '', /MARKET DATA/);

  const mdEntryType = dictionary.fieldByTag(269);
  const mdValue = formatFixFieldValue(dictionary, mdEntryType, '0');
  assert.equal(mdValue.label, 'BID');

  const sender = dictionary.fieldByTag(49);
  const senderValue = formatFixFieldValue(dictionary, sender, 'Valutrades_UAT_Q');
  assert.equal(senderValue.secondary, 'Valutrades UAT Q');
});

test('getFixFieldReference: exposes description, datatype, enums, and current value', () => {
  const dictionary = fix44;
  const reference = getFixFieldReference(
    dictionary,
    '269',
    '1',
    'NoMDEntries[2]',
    'MarketDataSnapshotFullRefresh'
  );
  assert.equal(reference.name, 'MDEntryType');
  assert.equal(reference.type, 'char');
  assert.match(reference.description || '', /Market Data/i);
  assert.equal(reference.enumValues.length > 2, true);
  assert.equal(reference.currentEnum?.name, 'OFFER');
  assert.equal(reference.groupContext, 'NoMDEntries[2]');
  assert.equal(reference.dictionaryVersion, 'FIX.4.4');

  const groupCounter = getFixFieldReference(dictionary, 268, '2');
  assert.equal(groupCounter.name, 'NoMDEntries');
  assert.equal(groupCounter.isGroupCounter, true);
  assert.match(groupCounter.description || '', /entries/i);

  const unknown = getFixFieldReference(dictionary, 99999, 'x');
  assert.equal(unknown.name, 'Unknown field');
  assert.equal(unknown.enumValues.length, 0);
  assert.equal(unknown.isGroupCounter, false);
});

test('parseFixMessageForDisplay: parses nested PartySubIDs group', () => {
  const dictionary = fix44;
  const raw =
    '8=FIX.4.4|9=100|35=D|34=2|49=CLIENT|52=20261120-13:33:18.487|56=SERVER|11=ORD-1|453=1|448=PARTY1|447=D|452=1|802=1|523=SUB1|803=1|55=EURUSD|54=1|60=20261120-13:33:18.487|10=000|';
  const parsed = parseFixMessageForDisplay(fieldsFromRaw(raw), dictionary);
  const parties = parsed.nodes.find(
    (node): node is FixParsedGroupNode =>
      node.kind === 'group' && node.counterTag === 453
  );
  assert.ok(parties, 'NoPartyIDs group exists');
  const subGroup = parties.entries[0].nodes.find(
    (node): node is FixParsedGroupNode =>
      node.kind === 'group' && node.counterTag === 802
  );
  assert.ok(subGroup, 'nested NoPartySubIDs group exists');
  assert.equal(subGroup.actualCount, 1);
  assert.equal(
    subGroup.entries[0].nodes.some(
      (node) => node.kind === 'field' && node.tag === 523
    ),
    true
  );
});

test('parseFixMessageForDisplay: reports count mismatch and unknown tags without data loss', () => {
  const dictionary = fix44;
  const raw =
    '8=FIX.4.4|9=100|35=W|34=1|49=S|52=20261120-13:33:18.487|56=T|55=EURUSD|268=3|269=0|270=1.10|9999=custom|10=000|';
  const parsed = parseFixMessageForDisplay(fieldsFromRaw(raw), dictionary);
  const group = parsed.nodes.find(
    (node): node is FixParsedGroupNode =>
      node.kind === 'group' && node.counterTag === 268
  );
  assert.ok(group);
  assert.equal(group.actualCount, 1);
  assert.equal(group.declaredCount, 3);
  assert.equal(group.warnings.some((warning) => warning.includes('declares 3')), true);
  assert.equal(
    parsed.nodes.some((node) => node.kind === 'field' && node.tag === 9999),
    true,
    'unknown tag is retained'
  );
  assert.equal(parsed.warnings.some((warning) => warning.includes('Unknown tag 9999')), true);
});

test('parseFixMessageForDisplay: loads FIX 4.2 names independently', () => {
  const dictionary = fix42;
  assert.equal(dictionary.version, 'FIX.4.2');
  const raw =
    '8=FIX.4.2|9=80|35=0|34=1|49=CLIENT|52=20261120-13:33:18|56=SERVER|10=000|';
  const parsed = parseFixMessageForDisplay(fieldsFromRaw(raw), dictionary);
  assert.equal(parsed.dictionaryVersion, 'FIX.4.2');
  const sender = parsed.nodes.find(
    (node): node is FixParsedFieldNode =>
      node.kind === 'field' && node.tag === 49
  );
  assert.equal(sender?.name, 'SenderCompID');
});

test('buildGroupEntrySummary: skips date and time fields for generic groups', () => {
  const nodes: FixParsedFieldNode[] = [
    field(269, '0', 'MDEntryType'),
    field(270, '2049991', 'MDEntryPx'),
    field(271, '10.00', 'MDEntrySize'),
    field(272, '20261120', 'MDEntryDate', 'UTCDateOnly'),
    field(273, '13:33:18.486', 'MDEntryTime', 'UTCTimeOnly'),
  ];
  assert.equal(buildGroupEntrySummary(nodes, 'NoMDEntries'), 'BID · 2049991 · 10.00');
});

test('calculateFixPopoverPosition: clamps to viewport and flips above the anchor', () => {
  const below = calculateFixPopoverPosition(
    { top: 100, left: 100, right: 180, bottom: 120 },
    { width: 1440, height: 900 }
  );
  assert.equal(below.placement, 'below');
  assert.equal(below.left, 100);

  const clamped = calculateFixPopoverPosition(
    { top: 100, left: 1300, right: 1380, bottom: 120 },
    { width: 1440, height: 900 }
  );
  assert.equal(clamped.left + clamped.width <= 1432, true);

  const above = calculateFixPopoverPosition(
    { top: 700, left: 100, right: 180, bottom: 730 },
    { width: 1440, height: 800 }
  );
  assert.equal(above.placement, 'above');
});

function field(
  tag: number,
  value: string,
  name: string,
  type = 'String'
): FixParsedFieldNode {
  return {
    kind: 'field',
    tag,
    tagText: String(tag),
    name,
    value,
    definition: {
      tag,
      name,
      type,
      enumValues:
        tag === 269
          ? [
              { value: '0', name: 'BID', description: 'Bid' },
              { value: '1', name: 'OFFER', description: 'Offer' },
            ]
          : undefined,
    },
    section: 'body',
    warnings: [],
  };
}
