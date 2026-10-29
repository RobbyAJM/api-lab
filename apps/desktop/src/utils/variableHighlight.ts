import type { VariableResponse } from '@api-lab/api-types';

export interface VariableToken {
  text: string;
  isVariable: boolean;
  name?: string;
  isDefined?: boolean;
  value?: string;
}

export type VariableSource =
  | Record<string, string>
  | Set<string>
  | Map<string, string>
  | VariableResponse[]
  | null
  | undefined;

function hasVariable(name: string, env?: VariableSource): { exists: boolean; value?: string } {
  if (!env) {
    return { exists: false };
  }
  if (Array.isArray(env)) {
    const found = env.find((v) => v.key === name);
    return found ? { exists: true, value: found.value } : { exists: false };
  }
  if (env instanceof Set) {
    return { exists: env.has(name) };
  }
  if (env instanceof Map) {
    return { exists: env.has(name), value: env.get(name) };
  }
  if (Object.prototype.hasOwnProperty.call(env, name)) {
    return { exists: true, value: (env as any)[name] };
  }
  return { exists: false };
}

/**
 * Tokenizes arbitrary string (address, header key/value, metadata) into text and variable tokens.
 * Accurately tracks whether each variable is defined in the current environment.
 */
export function tokenizeVariables(text: string, env?: VariableSource): VariableToken[] {
  if (!text) return [];

  const regex = /\{\{([A-Za-z0-9_]+)\}\}/g;
  const tokens: VariableToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        text: text.substring(lastIndex, match.index),
        isVariable: false,
      });
    }

    const varName = match[1];
    const { exists, value } = hasVariable(varName, env);

    tokens.push({
      text: match[0],
      isVariable: true,
      name: varName,
      isDefined: exists,
      value,
    });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({
      text: text.substring(lastIndex),
      isVariable: false,
    });
  }

  return tokens;
}

export interface JsonSyntaxToken {
  type: 'key' | 'string' | 'number' | 'boolean' | 'null' | 'delimiter' | 'variable' | 'comment' | 'text';
  text: string;
  varName?: string;
  isDefined?: boolean;
}

/**
 * Parses a single line of JSON into granular syntax tokens, breaking string literals
 * down so embedded `{{VAR}}` templates are highlighted distinctly as defined/undefined.
 */
export function tokenizeJsonLine(line: string, env?: VariableSource): JsonSyntaxToken[] {
  const mainRegex =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\/\/.*|\/\*.*?\*\/|\{\{[A-Za-z0-9_]+\}\}|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}[\],:])/g;

  const tokens: JsonSyntaxToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mainRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        text: line.substring(lastIndex, match.index),
      });
    }

    const raw = match[0];

    if (raw.startsWith('//') || raw.startsWith('/*')) {
      tokens.push({
        type: 'comment',
        text: raw,
      });
    } else if (raw.startsWith('{{') && raw.endsWith('}}')) {
      const varName = raw.slice(2, -2);
      const { exists } = hasVariable(varName, env);
      tokens.push({
        type: 'variable',
        text: raw,
        varName,
        isDefined: exists,
      });
    } else if (raw.endsWith(':')) {
      // Key with colon
      tokens.push({
        type: 'key',
        text: raw,
      });
    } else if (raw.startsWith('"')) {
      // String literal: check if it embeds {{VAR}}
      const varInsideRegex = /\{\{([A-Za-z0-9_]+)\}\}/g;
      if (varInsideRegex.test(raw)) {
        varInsideRegex.lastIndex = 0;
        let strLast = 0;
        let innerMatch: RegExpExecArray | null;

        while ((innerMatch = varInsideRegex.exec(raw)) !== null) {
          if (innerMatch.index > strLast) {
            tokens.push({
              type: 'string',
              text: raw.substring(strLast, innerMatch.index),
            });
          }
          const innerName = innerMatch[1];
          const { exists } = hasVariable(innerName, env);
          tokens.push({
            type: 'variable',
            text: innerMatch[0],
            varName: innerName,
            isDefined: exists,
          });
          strLast = varInsideRegex.lastIndex;
        }

        if (strLast < raw.length) {
          tokens.push({
            type: 'string',
            text: raw.substring(strLast),
          });
        }
      } else {
        tokens.push({
          type: 'string',
          text: raw,
        });
      }
    } else if (raw === 'true' || raw === 'false') {
      tokens.push({ type: 'boolean', text: raw });
    } else if (raw === 'null') {
      tokens.push({ type: 'null', text: raw });
    } else if (/^-?\d/.test(raw)) {
      tokens.push({ type: 'number', text: raw });
    } else if (/[{}[\],:]/.test(raw)) {
      tokens.push({ type: 'delimiter', text: raw });
    } else {
      tokens.push({ type: 'text', text: raw });
    }

    lastIndex = mainRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({
      type: 'text',
      text: line.substring(lastIndex),
    });
  }

  return tokens;
}

/**
 * Returns Tailwind classes for variable tokens without adding horizontal padding or borders,
 * preserving strict character-grid alignment with underlying transparent input/textarea elements.
 */
export function getVariableTokenClassName(isDefined: boolean, isEditor: boolean = false): string {
  if (isEditor) {
    return isDefined
      ? 'text-emerald-300 font-bold bg-emerald-950/60 ring-1 ring-inset ring-emerald-800/50 rounded-sm'
      : 'text-rose-300 font-bold bg-rose-950/60 ring-1 ring-inset ring-rose-800/50 rounded-sm';
  }
  return isDefined
    ? 'text-emerald-300 font-semibold bg-emerald-950/70 ring-1 ring-inset ring-emerald-800/60 rounded-sm'
    : 'text-rose-300 font-semibold bg-rose-950/70 ring-1 ring-inset ring-rose-800/60 rounded-sm';
}

