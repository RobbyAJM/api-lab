/**
 * Strips single-line (//) and multi-line (/* ... *\/) comments from JSON text.
 * Preserves string literals, escaped quotes, and newlines for accurate error positions.
 * ponytail: scanner handles standard JSON comments; upgrade to CST parser if preserving comments across formatting is required.
 */
export function stripJsonComments(text: string): string {
  if (!text) return '';

  let result = '';
  let inString = false;
  let isEscaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        result += '\n';
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      } else if (ch === '\n') {
        result += '\n';
      }
      continue;
    }

    if (inString) {
      result += ch;
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === '\\') {
        isEscaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      isEscaped = false;
      result += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    result += ch;
  }

  return result;
}

/**
 * Parses JSON string that may contain comments.
 */
export function parseJsonWithComments<T = any>(text: string): T {
  const stripped = stripJsonComments(text).trim();
  if (!stripped) {
    return {} as T;
  }
  return JSON.parse(stripped) as T;
}
