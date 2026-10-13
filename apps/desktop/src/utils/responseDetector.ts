export type ResponseFormat = 'json' | 'html' | 'text';

/**
 * Detects whether response body is JSON, HTML, or Plain Text
 * using Content-Type headers and heuristic inspection.
 */
export function detectResponseFormat(
  rawBody: any,
  contentType?: string
): ResponseFormat {
  if (rawBody === null || rawBody === undefined) {
    return 'text';
  }

  // Direct objects/arrays are JSON
  if (typeof rawBody === 'object') {
    return 'json';
  }

  // Primitives other than string
  if (typeof rawBody === 'number' || typeof rawBody === 'boolean') {
    return 'json';
  }

  if (typeof rawBody !== 'string') {
    return 'text';
  }

  const ct = (contentType || '').toLowerCase();
  const trimmed = rawBody.trim();

  // 1. Content-Type header checks
  if (ct.includes('application/json') || ct.includes('+json')) {
    return 'json';
  }
  if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) {
    return 'html';
  }

  // 2. Heuristic inspection: JSON
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // not valid JSON
    }
  }

  // 3. Heuristic inspection: HTML
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('<!doctype html') ||
    lower.startsWith('<html') ||
    lower.includes('<body') ||
    (lower.startsWith('<') && lower.includes('</html>')) ||
    /<([a-zA-Z0-9:-]+)[^>]*>[\s\S]*<\/\1>|<([a-zA-Z0-9:-]+)[^>]*\/>/i.test(trimmed)
  ) {
    return 'html';
  }

  return 'text';
}

/**
 * Formats response body according to its detected format.
 */
export function formatResponseBody(
  rawBody: any,
  format: ResponseFormat
): string {
  if (rawBody === null || rawBody === undefined) return '';

  if (format === 'json') {
    if (typeof rawBody === 'object') {
      try {
        return JSON.stringify(rawBody, null, 2);
      } catch {
        return String(rawBody);
      }
    }
    if (typeof rawBody === 'string') {
      try {
        const parsed = JSON.parse(rawBody);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return rawBody;
      }
    }
    return String(rawBody);
  }

  const str =
    typeof rawBody === 'string'
      ? rawBody
      : JSON.stringify(rawBody, null, 2);

  if (format === 'html') {
    return formatHtml(str);
  }

  return str;
}

/**
 * Simple, fast indentation for HTML markup without heavy external libraries.
 */
function formatHtml(html: string): string {
  let formatted = '';
  let indent = 0;
  const tab = '  ';

  // Insert newline between adjacent tags
  const lines = html.replace(/>\s*</g, '>\n<').split('\n');

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.startsWith('</')) {
      indent = Math.max(0, indent - 1);
      formatted += tab.repeat(indent) + line + '\n';
    } else if (
      line.startsWith('<') &&
      !line.startsWith('<!') &&
      !line.endsWith('/>') &&
      !isSelfClosingTag(line)
    ) {
      formatted += tab.repeat(indent) + line + '\n';
      if (!line.includes('</')) {
        indent++;
      }
    } else {
      formatted += tab.repeat(indent) + line + '\n';
    }
  }

  return formatted.trim();
}

function isSelfClosingTag(tag: string): boolean {
  const match = tag.match(/^<([a-zA-Z0-9]+)/);
  if (!match) return false;
  const tagName = match[1].toLowerCase();
  return [
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ].includes(tagName);
}

export interface HtmlSyntaxToken {
  type: 'doctype' | 'comment' | 'tag' | 'attr-name' | 'attr-val' | 'punctuation' | 'text';
  text: string;
}

/**
 * Tokenizes a single line of HTML markup into syntax tokens for syntax highlighting.
 */
export function tokenizeHtmlLine(line: string): HtmlSyntaxToken[] {
  if (!line) return [];

  // Check doctype or comment line
  const trimmed = line.trim();
  if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
    return [{ type: 'comment', text: line }];
  }
  if (trimmed.toLowerCase().startsWith('<!doctype')) {
    return [{ type: 'doctype', text: line }];
  }

  const regex =
    /(<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/[a-zA-Z0-9:-]+>|<\/?[a-zA-Z0-9:-]+|\/?>|="[^"]*"|='[^']*'|[a-zA-Z0-9:-]+(?==)|=)/g;

  const tokens: HtmlSyntaxToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        text: line.substring(lastIndex, match.index),
      });
    }

    const raw = match[0];

    if (raw.startsWith('<!--')) {
      tokens.push({ type: 'comment', text: raw });
    } else if (raw.toLowerCase().startsWith('<!doctype')) {
      tokens.push({ type: 'doctype', text: raw });
    } else if (raw.startsWith('<') || raw === '>' || raw === '/>') {
      tokens.push({ type: 'tag', text: raw });
    } else if (raw.startsWith('="') || raw.startsWith("='")) {
      tokens.push({ type: 'punctuation', text: '=' });
      tokens.push({ type: 'attr-val', text: raw.slice(1) });
    } else if (raw === '=') {
      tokens.push({ type: 'punctuation', text: '=' });
    } else {
      tokens.push({ type: 'attr-name', text: raw });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({
      type: 'text',
      text: line.substring(lastIndex),
    });
  }

  return tokens;
}
