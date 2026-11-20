import type { FixMessageField, FixSensitiveField } from '@api-lab/api-types';
import type {
  FixDictionary,
  FixEnumValue,
  FixFieldDefinition,
  FixGroupMember,
  FixScope,
} from './fixDictionary';

export type FixFieldSection = 'header' | 'body' | 'trailer';

export interface FixParsedFieldNode {
  kind: 'field';
  tag: number;
  tagText: string;
  name?: string;
  value: string;
  definition?: FixFieldDefinition;
  section: FixFieldSection;
  groupName?: string;
  entryIndex?: number;
  sourceIndex: number;
  warnings: string[];
}

export interface FixParsedGroupEntry {
  index: number;
  nodes: FixParsedNode[];
  summary: string;
}

export interface FixParsedGroupNode {
  kind: 'group';
  counterTag: number;
  tagText: string;
  name: string;
  countValue: string;
  declaredCount: number | null;
  actualCount: number;
  entries: FixParsedGroupEntry[];
  definition: FixGroupMember;
  delimiterTag?: number;
  section: FixFieldSection;
  warnings: string[];
}

export type FixParsedNode = FixParsedFieldNode | FixParsedGroupNode;

export interface ParsedFixMessage {
  beginString?: string;
  msgType: string;
  messageName?: string;
  dictionaryVersion: string;
  nodes: FixParsedNode[];
  warnings: string[];
  fieldCount: number;
  groupCount: number;
}

export interface FixFieldValueDisplay {
  raw: string;
  label?: string;
  secondary?: string;
  enumDescription?: string;
  isEnum: boolean;
}

export interface FixFieldReference {
  tag: number;
  name: string;
  type?: string;
  typeDescription?: string;
  description?: string;
  dictionaryVersion: string;
  enumValues: FixEnumValue[];
  currentValue?: string;
  currentEnum?: FixEnumValue;
  isGroupCounter: boolean;
  groupContext?: string;
  messageName?: string;
}

interface RootFrame {
  kind: 'root';
  scope: FixScope;
  nodes: FixParsedNode[];
}

interface GroupFrame {
  kind: 'group';
  scope: FixScope;
  group: FixParsedGroupNode;
  entry: FixParsedGroupEntry | null;
}

type ParseFrame = RootFrame | GroupFrame;

/**
 * Converts the ordered wire fields retained by the native FIX session into a
 * display tree with dictionary names, enum labels, warnings, and repeating
 * groups. Wire order is preserved.
 */
export function parseFixMessageForDisplay(
  fields: FixMessageField[],
  dictionary: FixDictionary
): ParsedFixMessage {
  const fieldMap = new Map(fields.map(([tag, value]) => [tag, value]));
  const msgType = fieldMap.get('35') || '';
  const beginString = fieldMap.get('8') || dictionary.beginString;
  const message = dictionary.messageByMsgType(msgType);
  const warnings: string[] = [];

  if (!message) {
    warnings.push(
      msgType
        ? `MsgType ${msgType} is not defined in ${dictionary.version}.`
        : 'Message is missing MsgType tag 35.'
    );
    const nodes = fields.map(([tag, value], index) =>
      makeFieldNode(tag, value, dictionary, warnings, index)
    );
    return {
      beginString,
      msgType,
      dictionaryVersion: dictionary.version,
      nodes,
      warnings,
      fieldCount: fields.length,
      groupCount: 0,
    };
  }

  const scope = dictionary.messageScope(msgType);
  if (!scope) {
    const nodes = fields.map(([tag, value], index) =>
      makeFieldNode(tag, value, dictionary, warnings, index)
    );
    return {
      beginString,
      msgType,
      messageName: message.name,
      dictionaryVersion: dictionary.version,
      nodes,
      warnings,
      fieldCount: fields.length,
      groupCount: 0,
    };
  }

  const root: RootFrame = { kind: 'root', scope, nodes: [] };
  const stack: ParseFrame[] = [root];

  for (const [sourceIndex, [tagText, value]] of fields.entries()) {
    const tag = Number(tagText);
    if (!Number.isInteger(tag) || tag <= 0) {
      warnings.push(`Invalid FIX tag "${tagText}".`);
      root.nodes.push(makeUnknownField(tagText, value, sourceIndex));
      continue;
    }

    let handled = false;
    while (!handled) {
      const frame = stack[stack.length - 1];

      if (frame.kind === 'group') {
        const isDelimiter = tag === frame.group.delimiterTag;
        if (isDelimiter) {
          startGroupEntry(frame);
          const childFrame = handleGroupMember(
            frame,
            tagText,
            value,
            dictionary,
            warnings,
            sourceIndex
          );
          if (childFrame) stack.push(childFrame);
          handled = true;
          break;
        }

        if (frame.scope.directTags.has(tag) || frame.scope.groups.has(tag)) {
          if (!frame.entry) {
            startGroupEntry(
              frame,
              `Group ${frame.group.name} is missing delimiter ${
                frame.group.delimiterTag ?? '?'
              }.`
            );
          }
          const childFrame = handleGroupMember(
            frame,
            tagText,
            value,
            dictionary,
            warnings,
            sourceIndex
          );
          if (childFrame) stack.push(childFrame);
          handled = true;
          break;
        }

        finishGroup(frame);
        stack.pop();
        continue;
      }

      const childGroup = frame.scope.groups.get(tag);
      if (childGroup) {
        const group = openGroup(frame.nodes, childGroup, tagText, value, dictionary);
        stack.push({
          kind: 'group',
          scope: childGroup,
          group,
          entry: null,
        });
        handled = true;
        break;
      }

      frame.nodes.push(
        makeFieldNode(
          tagText,
          value,
          dictionary,
          warnings,
          sourceIndex,
          undefined
        )
      );
      handled = true;
    }
  }

  while (stack.length > 1) {
    const frame = stack.pop();
    if (frame?.kind === 'group') finishGroup(frame);
  }
  collectGroupWarnings(root.nodes, warnings);

  return {
    beginString,
    msgType,
    messageName: message.name,
    dictionaryVersion: dictionary.version,
    nodes: root.nodes,
    warnings,
    fieldCount: fields.length,
    groupCount: countGroups(root.nodes),
  };
}

/**
 * Returns the display label for a field value using the active dictionary.
 */
export function formatFixFieldValue(
  dictionary: FixDictionary,
  definition: FixFieldDefinition | undefined,
  raw: string
): FixFieldValueDisplay {
  if (!raw) {
    return { raw, isEnum: false };
  }
  const enumValue = definition?.enumValues?.find((candidate) => candidate.value === raw);
  if (enumValue) {
    return {
      raw,
      label: formatEnumLabel(enumValue),
      enumDescription: enumValue.description,
      isEnum: true,
    };
  }

  if (definition?.type === 'Boolean') {
    const booleanLabel =
      raw === 'Y' ? 'YES' : raw === 'N' ? 'NO' : raw === 'true' ? 'YES' : raw === 'false' ? 'NO' : undefined;
    if (booleanLabel) {
      return { raw, label: booleanLabel, isEnum: true };
    }
  }

  if (definition?.name === 'MsgType') {
    const message = dictionary.messageByMsgType(raw);
    if (message) {
      return { raw, label: messageNameToWords(message.name), isEnum: true };
    }
  }

  if (raw.includes('_')) {
    return {
      raw,
      secondary: raw
        .replace(/_+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
      isEnum: false,
    };
  }

  return { raw, isEnum: false };
}

/**
 * Builds the data shown when a user clicks a field tag or field name.
 */
export function getFixFieldReference(
  dictionary: FixDictionary,
  tag: number | string,
  currentValue?: string,
  groupContext?: string,
  messageName?: string
): FixFieldReference {
  const numericTag = typeof tag === 'number' ? tag : Number(tag);
  const definition = dictionary.fieldByTag(numericTag);
  const enumValues = definition?.enumValues || [];
  return {
    tag: numericTag,
    name: definition?.name || 'Unknown field',
    type: definition?.type,
    typeDescription: definition
      ? dictionary.datatypeForField(definition)?.description
      : undefined,
    description: definition?.description,
    dictionaryVersion: dictionary.version,
    enumValues,
    currentValue,
    currentEnum: enumValues.find((value) => value.value === currentValue),
    isGroupCounter: definition?.isGroupCounter === true,
    groupContext,
    messageName,
  };
}

/**
 * Indexes locally available sensitive field values by their wire position.
 */
export function indexFixSensitiveFields(
  fields: FixSensitiveField[] | undefined
): Map<number, FixSensitiveField> {
  const indexed = new Map<number, FixSensitiveField>();
  for (const field of fields || []) {
    if (
      Number.isSafeInteger(field.field_index) &&
      field.field_index >= 0 &&
      typeof field.value === 'string'
    ) {
      indexed.set(field.field_index, field);
    }
  }
  return indexed;
}

/**
 * Returns a sensitive value only when the entry's tag still matches the parsed
 * field at the same wire position.
 */
export function resolveSensitiveFieldValue(
  indexed: Map<number, FixSensitiveField>,
  node: Pick<FixParsedFieldNode, 'sourceIndex' | 'tagText'>
): string | undefined {
  const sensitive = indexed.get(node.sourceIndex);
  return sensitive && sensitive.tag === node.tagText
    ? sensitive.value
    : undefined;
}

/**
 * Formats a raw group entry as a compact summary such as
 * `BID · 2049991 · 10.00`.
 */
export function buildGroupEntrySummary(
  nodes: FixParsedNode[],
  groupName: string
): string {
  const fields = nodes.filter(
    (node): node is FixParsedFieldNode => node.kind === 'field'
  );
  const preferredTags =
    groupName === 'NoMDEntries' ? [269, 270, 271] : [];
  const selected: FixParsedFieldNode[] = [];

  for (const tag of preferredTags) {
    const field = fields.find((candidate) => candidate.tag === tag);
    if (field) selected.push(field);
  }

  if (selected.length === 0) {
    const fallbackFields = fields
      .filter((field) => field.value !== '' && !isDateOrTimeField(field))
      .slice(0, 3);
    selected.push(...fallbackFields);
  }

  const parts = selected.map((field) => {
    const value = field.definition?.enumValues?.find(
      (candidate) => candidate.value === field.value
    );
    return value ? formatEnumLabel(value) : field.value;
  });
  return parts.filter(Boolean).join(' · ');
}

/**
 * Calculates a viewport-safe anchored popover placement.
 */
export function calculateFixPopoverPosition(
  anchor: { top: number; right: number; bottom: number; left: number },
  viewport: { width: number; height: number },
  preferredWidth = 420,
  preferredMaxHeight = 480
): {
  left: number;
  width: number;
  maxHeight: number;
  placement: 'above' | 'below';
} {
  const margin = 8;
  const gap = 6;
  const width = Math.max(240, Math.min(preferredWidth, viewport.width - margin * 2));
  let left = anchor.left;
  if (left + width > viewport.width - margin) {
    left = viewport.width - width - margin;
  }
  left = Math.max(margin, left);

  const spaceBelow = viewport.height - anchor.bottom - margin;
  const spaceAbove = anchor.top - margin;
  const placement: 'above' | 'below' =
    spaceBelow < Math.min(260, preferredMaxHeight) && spaceAbove > spaceBelow
      ? 'above'
      : 'below';
  const available = Math.max(160, (placement === 'above' ? spaceAbove : spaceBelow) - gap);
  return {
    left,
    width,
    maxHeight: Math.min(preferredMaxHeight, available),
    placement,
  };
}

function openGroup(
  parentNodes: FixParsedNode[],
  schema: FixScope & {
    counterTag: number;
    delimiterTag?: number;
    definition: FixGroupMember;
  },
  tagText: string,
  countValue: string,
  dictionary: FixDictionary
): FixParsedGroupNode {
  const counter = dictionary.fieldByTag(schema.counterTag);
  const declared = parseGroupCount(countValue);
  const groupWarnings: string[] = [];
  if (declared === null) {
    groupWarnings.push(
      `${counter?.name || tagText}: invalid group count "${countValue}".`
    );
  }
  const group: FixParsedGroupNode = {
    kind: 'group',
    counterTag: schema.counterTag,
    tagText,
    name: counter?.name || `Tag ${tagText}`,
    countValue,
    declaredCount: declared,
    actualCount: 0,
    entries: [],
    definition: schema.definition,
    delimiterTag: schema.delimiterTag,
    section: sectionForTag(dictionary, schema.counterTag),
    warnings: groupWarnings,
  };
  parentNodes.push(group);
  return group;
}

function handleGroupMember(
  frame: GroupFrame,
  tagText: string,
  value: string,
  dictionary: FixDictionary,
  warnings: string[],
  sourceIndex: number
): GroupFrame | null {
  const tag = Number(tagText);
  const childScope = frame.scope.groups.get(tag);
  if (childScope) {
    const child = openGroup(
      frame.entry?.nodes || [],
      childScope,
      tagText,
      value,
      dictionary
    );
    return {
      kind: 'group',
      scope: childScope,
      group: child,
      entry: null,
    };
  }

  frame.entry?.nodes.push(
    makeFieldNode(
      tagText,
      value,
      dictionary,
      warnings,
      sourceIndex,
      frame.group.name,
      frame.entry?.index
    )
  );
  return null;
}

function startGroupEntry(frame: GroupFrame, warning?: string): void {
  if (frame.entry && frame.entry.nodes.length === 0) {
    if (warning) {
      frame.group.warnings.push(warning);
      warning = undefined;
    }
  }
  if (warning) frame.group.warnings.push(warning);

  const entry: FixParsedGroupEntry = {
    index: frame.group.entries.length + 1,
    nodes: [],
    summary: '',
  };
  frame.group.entries.push(entry);
  frame.entry = entry;
}

function finishGroup(frame: GroupFrame): void {
  const group = frame.group;
  group.actualCount = group.entries.length;
  if (group.declaredCount !== null && group.declaredCount !== group.actualCount) {
    const warning = `Group ${group.name} declares ${group.declaredCount} entr${
      group.declaredCount === 1 ? 'y' : 'ies'
    } but ${group.actualCount} ${group.actualCount === 1 ? 'was' : 'were'} parsed.`;
    group.warnings.push(warning);
  }
  for (const entry of group.entries) {
    entry.summary = buildGroupEntrySummary(entry.nodes, group.name) || `Entry ${entry.index}`;
  }
}

function makeFieldNode(
  tagText: string,
  value: string,
  dictionary: FixDictionary,
  warnings: string[],
  sourceIndex: number,
  groupName?: string,
  entryIndex?: number
): FixParsedFieldNode {
  const tag = Number(tagText);
  const definition = dictionary.fieldByTag(tag);
  if (!definition && !warnings.includes(`Unknown tag ${tagText}.`)) {
    warnings.push(`Unknown tag ${tagText}.`);
  }
  return {
    kind: 'field',
    tag,
    tagText,
    name: definition?.name,
    value,
    definition,
    section: sectionForTag(dictionary, tag),
    groupName,
    entryIndex,
    sourceIndex,
    warnings: [],
  };
}

function makeUnknownField(
  tagText: string,
  value: string,
  sourceIndex: number
): FixParsedFieldNode {
  return {
    kind: 'field',
    tag: 0,
    tagText,
    value,
    section: 'body',
    warnings: [],
    definition: undefined,
    sourceIndex,
  };
}

function parseGroupCount(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
}

function sectionForTag(
  dictionary: FixDictionary,
  tag: number
): FixFieldSection {
  if (dictionary.headerTags.has(tag)) return 'header';
  if (dictionary.trailerTags.has(tag)) return 'trailer';
  return 'body';
}

function countGroups(nodes: FixParsedNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (node.kind !== 'group') continue;
    total += 1;
    for (const entry of node.entries) total += countGroups(entry.nodes);
  }
  return total;
}

function collectGroupWarnings(nodes: FixParsedNode[], warnings: string[]): void {
  for (const node of nodes) {
    if (node.kind !== 'group') continue;
    for (const warning of node.warnings) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
    for (const entry of node.entries) {
      collectGroupWarnings(entry.nodes, warnings);
    }
  }
}

function formatEnumLabel(value: FixEnumValue): string {
  return value.name.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
}

function messageNameToWords(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toUpperCase();
}

function isDateOrTimeField(field: FixParsedFieldNode): boolean {
  const type = field.definition?.type || '';
  return /date|time|timestamp|month-year/i.test(type);
}
