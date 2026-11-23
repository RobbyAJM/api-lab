import type { FixDictionary, FixFieldDefinition } from './fixDictionary.ts';
import { FIX_SESSION_ENVELOPE_TAGS } from './fixMessageBuilder.ts';
import { formatFixFieldValue } from './fixParsedMessage.ts';
import {
  FIX_ADMIN_MESSAGE_TYPES,
  formatFixMessageName,
} from './fixSession.ts';
import {
  getVariableTokenClassName,
  tokenizeVariables,
  type VariableSource,
} from './variableHighlight.ts';
import type { BoundingBox } from './variableHover.ts';

export type FixRawDelimiterKind =
  | 'pipe'
  | 'soh'
  | 'escaped_soh'
  | 'caret_soh'
  | 'newline';

export type FixRawTokenKind =
  | 'delimiter'
  | 'equals'
  | 'whitespace'
  | 'tag_msg_type'
  | 'tag_envelope'
  | 'tag_group_counter'
  | 'tag_sensitive'
  | 'tag_body'
  | 'tag_custom'
  | 'value_msg_type'
  | 'value_msg_type_admin'
  | 'value_envelope'
  | 'value_group_count'
  | 'value_sensitive'
  | 'value_enum'
  | 'value_number'
  | 'value_temporal'
  | 'value_text'
  | 'variable'
  | 'error';

export interface FixRawToken {
  kind: FixRawTokenKind;
  text: string;
  start: number;
  end: number;
  delimiterKind?: FixRawDelimiterKind;
  fieldTag?: number;
  fieldRawValue?: string;
  varName?: string;
  isDefined?: boolean;
  errorReason?: string;
}

export interface FixRawHoverInfo {
  tag?: number;
  name: string;
  type?: string;
  rawValue?: string;
  valueLabel?: string;
  enumDescription?: string;
  description?: string;
  isEnvelope: boolean;
  isGroupCounter: boolean;
  isSensitive: boolean;
  isUnknownTag: boolean;
  errorReason?: string;
  dictionaryVersion?: string;
}

export interface HoveredFixFieldHit {
  tag?: number;
  value?: string;
  errorReason?: string;
  rect: BoundingBox;
}

export const FIX_RAW_MIN_HEIGHT_PX = 58;
export const FIX_RAW_SINGLE_MAX_HEIGHT_PX = 168;
export const FIX_RAW_MULTILINE_MAX_HEIGHT_PX = 240;

const NUMERIC_FIX_TYPES = new Set([
  'int',
  'float',
  'Price',
  'PriceOffset',
  'Amt',
  'Qty',
  'Percentage',
  'SeqNum',
  'Length',
  'NumInGroup',
  'DayOfMonth',
]);

const TEMPORAL_FIX_TYPES = new Set([
  'UTCTimestamp',
  'UTCDateOnly',
  'UTCDate',
  'UTCTimeOnly',
  'LocalMktDate',
  'MonthYear',
]);

const FIX_DELIMITER_SPLIT_REGEX = /\u0001|\\x01|\^A|\r\n|\n|\r|\|/;

/**
 * Tokenizes a raw FIX message string into granular syntax tokens while strictly
 * preserving every input character (`tokens.map(t => t.text).join('') === raw`)
 * so a `<pre>` backdrop stays pixel-aligned with a transparent `<textarea>`.
 */
export function tokenizeFixRaw(
  raw: string,
  dictionary?: FixDictionary | null,
  variables?: VariableSource
): FixRawToken[] {
  if (!raw) return [];

  const tokens: FixRawToken[] = [];
  let cursor = 0;
  let segmentStart = 0;
  let msgTypeSeenCount = 0;

  function flushSegment(end: number) {
    if (end <= segmentStart) return;
    msgTypeSeenCount = tokenizeSegment(
      raw,
      segmentStart,
      end,
      dictionary,
      variables,
      msgTypeSeenCount,
      tokens
    );
  }

  while (cursor < raw.length) {
    const delim = matchDelimiterAt(raw, cursor);
    if (delim) {
      flushSegment(cursor);
      tokens.push({
        kind: 'delimiter',
        text: delim.text,
        start: cursor,
        end: cursor + delim.length,
        delimiterKind: delim.kind,
      });
      cursor += delim.length;
      segmentStart = cursor;
    } else {
      cursor += 1;
    }
  }

  flushSegment(raw.length);
  return tokens;
}

/**
 * Returns Tailwind classes for a FIX raw syntax token without horizontal padding
 * or borders, preserving exact character-grid alignment with `<textarea>`.
 */
export function getFixRawTokenClassName(token: FixRawToken): string {
  switch (token.kind) {
    case 'delimiter':
      if (
        token.delimiterKind === 'soh' ||
        token.delimiterKind === 'escaped_soh' ||
        token.delimiterKind === 'caret_soh'
      ) {
        return 'text-amber-400 bg-amber-950/65 ring-1 ring-inset ring-amber-800/60 rounded-[2px]';
      }
      return 'text-zinc-600';
    case 'equals':
      return 'text-zinc-600';
    case 'whitespace':
      return 'text-zinc-200';
    case 'tag_msg_type':
      return 'text-blue-400 font-semibold';
    case 'value_msg_type':
      return 'text-blue-200 font-semibold bg-blue-950/55 ring-1 ring-inset ring-blue-800/60 rounded-[2px]';
    case 'value_msg_type_admin':
      return 'text-red-200 font-semibold bg-red-950/60 ring-1 ring-inset ring-red-800/70 rounded-[2px]';
    case 'tag_envelope':
      return 'text-sky-400/70';
    case 'value_envelope':
      return 'text-zinc-500';
    case 'tag_group_counter':
      return 'text-amber-400 font-semibold';
    case 'value_group_count':
      return 'text-amber-200 font-semibold';
    case 'tag_sensitive':
      return 'text-amber-400';
    case 'value_sensitive':
      return 'text-amber-300/80';
    case 'tag_body':
      return 'text-cyan-400';
    case 'tag_custom':
      return 'text-zinc-400';
    case 'value_enum':
      return 'text-teal-300';
    case 'value_number':
      return 'text-sky-200';
    case 'value_temporal':
      return 'text-indigo-300';
    case 'value_text':
      return 'text-zinc-100';
    case 'variable':
      return getVariableTokenClassName(token.isDefined ?? false, true);
    case 'error':
      return 'text-red-300 bg-red-950/55 underline decoration-red-400/80 decoration-wavy underline-offset-2';
  }
}

/**
 * Builds structured hover tooltip data for a FIX tag/value or syntax error token.
 */
export function buildFixRawHoverInfo(
  hit: Pick<HoveredFixFieldHit, 'tag' | 'value' | 'errorReason'>,
  dictionary?: FixDictionary | null
): FixRawHoverInfo {
  const tag = hit.tag;
  const rawValue = hit.value;

  if (tag === undefined || !Number.isInteger(tag) || tag <= 0) {
    return {
      name: 'Invalid FIX Field',
      rawValue,
      isEnvelope: false,
      isGroupCounter: false,
      isSensitive: false,
      isUnknownTag: false,
      errorReason: hit.errorReason || 'Malformed FIX field.',
      dictionaryVersion: dictionary?.version,
    };
  }

  const definition = dictionary?.fieldByTag(tag);
  const isEnvelope = FIX_SESSION_ENVELOPE_TAGS.has(tag);
  const isGroupCounter = definition?.isGroupCounter === true;
  const isSensitive = tag === 554 || tag === 925;
  const isUnknownTag = Boolean(dictionary && !definition);

  let valueLabel: string | undefined;
  let enumDescription: string | undefined;

  if (rawValue !== undefined && rawValue !== '' && dictionary) {
    if (tag === 35) {
      const msg = dictionary.messageByMsgType(rawValue);
      if (msg) valueLabel = formatFixMessageName(msg.name);
    } else {
      const formatted = formatFixFieldValue(dictionary, definition, rawValue);
      if (formatted.isEnum && formatted.label) {
        valueLabel = formatted.label;
        enumDescription = formatted.enumDescription;
      }
    }
  }

  return {
    tag,
    name: definition?.name || (dictionary ? `Custom tag ${tag}` : `Tag ${tag}`),
    type: definition?.type,
    rawValue,
    valueLabel,
    enumDescription,
    description: definition?.description,
    isEnvelope,
    isGroupCounter,
    isSensitive,
    isUnknownTag,
    errorReason: hit.errorReason,
    dictionaryVersion: dictionary?.version,
  };
}

/**
 * Hit-tests rendered FIX syntax tokens in the backdrop under pointer coordinates.
 */
export function findHoveredFixFieldToken(
  container: { querySelectorAll: (selector: string) => any } | null,
  clientX: number,
  clientY: number
): HoveredFixFieldHit | null {
  if (!container) return null;
  const elements = container.querySelectorAll('[data-fix-tag], [data-fix-error]');
  for (const el of elements) {
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!rect) continue;
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      const rawTag = el.getAttribute
        ? el.getAttribute('data-fix-tag')
        : el.dataset?.fixTag;
      const rawVal = el.getAttribute
        ? el.getAttribute('data-fix-val')
        : el.dataset?.fixVal;
      const errorReason = el.getAttribute
        ? el.getAttribute('data-fix-error')
        : el.dataset?.fixError;

      const parsedTag = rawTag !== null && rawTag !== undefined && rawTag !== ''
        ? Number(rawTag)
        : undefined;

      return {
        tag:
          parsedTag !== undefined && Number.isInteger(parsedTag) && parsedTag > 0
            ? parsedTag
            : undefined,
        value: rawVal !== null && rawVal !== undefined ? rawVal : undefined,
        errorReason: errorReason || undefined,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      };
    }
  }
  return null;
}

/**
 * Returns true when trimmed raw FIX text contains newline-separated fields.
 */
export function isFixRawMultiline(raw: string): boolean {
  return /\r?\n/.test(raw.trim());
}

/**
 * Converts any valid FIX delimiter (`|`, SOH, `\x01`, `^A`, newlines) into
 * clean `|`-delimited single-line text.
 */
export function formatFixRawAsSingleLine(raw: string): string {
  const parts = splitNonEmptyFixParts(raw);
  return parts.join('|');
}

/**
 * Converts any valid FIX delimiter (`|`, SOH, `\x01`, `^A`, newlines) into
 * one `tag=value` pair per line.
 */
export function formatFixRawAsMultiline(raw: string): string {
  const parts = splitNonEmptyFixParts(raw);
  return parts.join('\n');
}

/**
 * Clamps auto-growing Raw editor height to compact bounds.
 */
export function calculateFixRawEditorHeight(
  measuredHeight: number,
  isMultiline: boolean
): number {
  const maxHeight = isMultiline
    ? FIX_RAW_MULTILINE_MAX_HEIGHT_PX
    : FIX_RAW_SINGLE_MAX_HEIGHT_PX;
  const safeMeasured = Number.isFinite(measuredHeight)
    ? Math.ceil(measuredHeight)
    : FIX_RAW_MIN_HEIGHT_PX;
  return Math.max(FIX_RAW_MIN_HEIGHT_PX, Math.min(maxHeight, safeMeasured));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function matchDelimiterAt(
  raw: string,
  index: number
): { kind: FixRawDelimiterKind; text: string; length: number } | null {
  const ch = raw[index];
  if (ch === '|') return { kind: 'pipe', text: '|', length: 1 };
  if (ch === '\u0001') return { kind: 'soh', text: '\u0001', length: 1 };
  if (ch === '\r') {
    if (raw[index + 1] === '\n') {
      return { kind: 'newline', text: '\r\n', length: 2 };
    }
    return { kind: 'newline', text: '\r', length: 1 };
  }
  if (ch === '\n') return { kind: 'newline', text: '\n', length: 1 };
  if (ch === '\\' && raw.startsWith('\\x01', index)) {
    return { kind: 'escaped_soh', text: '\\x01', length: 4 };
  }
  if (ch === '^' && raw.startsWith('^A', index)) {
    return { kind: 'caret_soh', text: '^A', length: 2 };
  }
  return null;
}

function tokenizeSegment(
  raw: string,
  start: number,
  end: number,
  dictionary: FixDictionary | null | undefined,
  variables: VariableSource | undefined,
  msgTypeSeenCount: number,
  tokens: FixRawToken[]
): number {
  const segment = raw.slice(start, end);
  const leadLen = segment.length - segment.trimStart().length;
  const trailLen = segment.length - segment.trimEnd().length;

  if (leadLen === segment.length) {
    tokens.push({
      kind: 'whitespace',
      text: segment,
      start,
      end,
    });
    return msgTypeSeenCount;
  }

  if (leadLen > 0) {
    tokens.push({
      kind: 'whitespace',
      text: segment.slice(0, leadLen),
      start,
      end: start + leadLen,
    });
  }

  const contentStart = start + leadLen;
  const contentEnd = end - trailLen;
  const content = raw.slice(contentStart, contentEnd);
  const eqOffset = content.indexOf('=');

  if (eqOffset <= 0) {
    tokens.push({
      kind: 'error',
      text: content,
      start: contentStart,
      end: contentEnd,
      errorReason:
        eqOffset === 0
          ? 'FIX tag before "=" cannot be empty.'
          : `Field "${content}" is missing '='.`,
    });
  } else {
    const tagText = content.slice(0, eqOffset);
    const tagTrimmed = tagText.trim();
    const valStart = contentStart + eqOffset + 1;
    const valueText = content.slice(eqOffset + 1);

    if (!/^\d+$/.test(tagTrimmed)) {
      tokens.push({
        kind: 'error',
        text: tagText,
        start: contentStart,
        end: contentStart + eqOffset,
        errorReason: `Tag "${tagTrimmed}" must be numeric.`,
      });
      tokens.push({
        kind: 'equals',
        text: '=',
        start: contentStart + eqOffset,
        end: valStart,
      });
      emitValueTokens(
        valueText,
        valStart,
        'value_text',
        undefined,
        valueText,
        undefined,
        variables,
        tokens
      );
    } else {
      const numericTag = Number(tagTrimmed);
      const definition = dictionary?.fieldByTag(numericTag);
      const isMsgType = numericTag === 35;

      let nextMsgTypeCount = msgTypeSeenCount;
      let isDuplicateMsgType = false;
      let isEmptyMsgType = false;
      let isAdminMsgType = false;

      if (isMsgType) {
        nextMsgTypeCount += 1;
        isDuplicateMsgType = nextMsgTypeCount > 1;
        const trimmedVal = valueText.trim();
        isEmptyMsgType = trimmedVal === '';
        if (!isEmptyMsgType) {
          const dictMsg = dictionary?.messageByMsgType(trimmedVal);
          isAdminMsgType =
            FIX_ADMIN_MESSAGE_TYPES.has(trimmedVal) || dictMsg?.category === 'admin';
        }
      }

      const tagError = isDuplicateMsgType
        ? 'Message contains more than one MsgType tag 35.'
        : isEmptyMsgType
        ? 'MsgType (tag 35) cannot be empty.'
        : isAdminMsgType
        ? 'Administrative FIX messages are managed automatically by the session.'
        : undefined;

      const tagKind: FixRawTokenKind = isDuplicateMsgType || isEmptyMsgType
        ? 'error'
        : classifyTagKind(numericTag, definition, dictionary);

      tokens.push({
        kind: tagKind,
        text: tagText,
        start: contentStart,
        end: contentStart + eqOffset,
        fieldTag: numericTag,
        fieldRawValue: valueText,
        errorReason: tagError,
      });

      tokens.push({
        kind: 'equals',
        text: '=',
        start: contentStart + eqOffset,
        end: valStart,
        fieldTag: numericTag,
        fieldRawValue: valueText,
      });

      const baseValueKind: FixRawTokenKind = isDuplicateMsgType
        ? 'error'
        : isMsgType
        ? isAdminMsgType
          ? 'value_msg_type_admin'
          : 'value_msg_type'
        : classifyValueKind(numericTag, valueText, definition);

      emitValueTokens(
        valueText,
        valStart,
        baseValueKind,
        numericTag,
        valueText,
        tagError,
        variables,
        tokens
      );

      msgTypeSeenCount = nextMsgTypeCount;
    }
  }

  if (trailLen > 0) {
    tokens.push({
      kind: 'whitespace',
      text: segment.slice(segment.length - trailLen),
      start: contentEnd,
      end,
    });
  }

  return msgTypeSeenCount;
}

function classifyTagKind(
  tag: number,
  definition: FixFieldDefinition | undefined,
  dictionary: FixDictionary | null | undefined
): FixRawTokenKind {
  if (tag === 35) return 'tag_msg_type';
  if (FIX_SESSION_ENVELOPE_TAGS.has(tag)) return 'tag_envelope';
  if (tag === 554 || tag === 925) return 'tag_sensitive';
  if (definition?.isGroupCounter) return 'tag_group_counter';
  if (definition) return 'tag_body';
  return dictionary ? 'tag_custom' : 'tag_body';
}

function classifyValueKind(
  tag: number,
  valueText: string,
  definition: FixFieldDefinition | undefined
): FixRawTokenKind {
  if (FIX_SESSION_ENVELOPE_TAGS.has(tag)) return 'value_envelope';
  if (tag === 554 || tag === 925) return 'value_sensitive';
  if (definition?.isGroupCounter) return 'value_group_count';

  if (definition && valueText !== '') {
    if (definition.enumValues?.some((candidate) => candidate.value === valueText)) {
      return 'value_enum';
    }
    if (
      definition.type === 'Boolean' &&
      (valueText === 'Y' || valueText === 'N')
    ) {
      return 'value_enum';
    }
    if (TEMPORAL_FIX_TYPES.has(definition.type)) {
      return 'value_temporal';
    }
    if (
      NUMERIC_FIX_TYPES.has(definition.type) &&
      /^-?\d+(?:\.\d+)?$/.test(valueText.trim())
    ) {
      return 'value_number';
    }
  }

  return 'value_text';
}

function emitValueTokens(
  valueText: string,
  valStart: number,
  baseKind: FixRawTokenKind,
  fieldTag: number | undefined,
  fieldRawValue: string,
  errorReason: string | undefined,
  variables: VariableSource | undefined,
  tokens: FixRawToken[]
): void {
  if (!valueText) return;

  const varParts = tokenizeVariables(valueText, variables);
  let offset = valStart;

  for (const part of varParts) {
    const partEnd = offset + part.text.length;
    if (part.isVariable) {
      tokens.push({
        kind: 'variable',
        text: part.text,
        start: offset,
        end: partEnd,
        fieldTag,
        fieldRawValue,
        varName: part.name,
        isDefined: part.isDefined,
      });
    } else {
      tokens.push({
        kind: baseKind,
        text: part.text,
        start: offset,
        end: partEnd,
        fieldTag,
        fieldRawValue,
        errorReason,
      });
    }
    offset = partEnd;
  }
}

function splitNonEmptyFixParts(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(FIX_DELIMITER_SPLIT_REGEX)
    .map((part) => part.trim())
    .filter(Boolean);
}
