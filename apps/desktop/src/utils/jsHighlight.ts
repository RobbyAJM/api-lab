export interface JsSyntaxToken {
  type:
    | 'keyword'
    | 'global'
    | 'boolean'
    | 'string'
    | 'comment'
    | 'number'
    | 'operator'
    | 'delimiter'
    | 'text';
  text: string;
}

const JS_KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'try',
  'catch',
  'finally',
  'throw',
  'new',
  'async',
  'await',
  'for',
  'while',
  'typeof',
  'instanceof',
  'import',
  'export',
  'class',
  'extends',
  'switch',
  'case',
  'break',
  'continue',
  'default',
]);

const JS_GLOBALS = new Set([
  'pm',
  'console',
  'request',
  'response',
  'variables',
  'Date',
  'JSON',
  'Math',
  'Promise',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
]);

/**
 * Tokenizes a single line of JavaScript into colored syntax tokens.
 */
export function tokenizeJsLine(line: string): JsSyntaxToken[] {
  if (!line) return [];

  // Single-line comment check
  const commentIndex = line.indexOf('//');
  if (commentIndex !== -1) {
    // Check if // is inside a string literal
    const beforeComment = line.substring(0, commentIndex);
    const doubleQuotes = (beforeComment.match(/"/g) || []).length;
    const singleQuotes = (beforeComment.match(/'/g) || []).length;

    // If not inside an unclosed string
    if (doubleQuotes % 2 === 0 && singleQuotes % 2 === 0) {
      const codeTokens = tokenizeJsCode(beforeComment);
      const commentToken: JsSyntaxToken = {
        type: 'comment',
        text: line.substring(commentIndex),
      };
      return [...codeTokens, commentToken];
    }
  }

  return tokenizeJsCode(line);
}

function tokenizeJsCode(code: string): JsSyntaxToken[] {
  const regex =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"|'(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\'])*'|`[^`]*`|\b(?:true|false|null|undefined)\b|\b\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?\b|\b[A-Za-z_$][A-Za-z0-9_$]*\b|===|!==|==|!=|<=|>=|=>|&&|\|\||[+\-*\/%=<>!?:&|^~]|[{}()[\].,;])/g;

  const tokens: JsSyntaxToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        text: code.substring(lastIndex, match.index),
      });
    }

    const raw = match[0];

    if (raw.startsWith('"') || raw.startsWith("'") || raw.startsWith('`')) {
      tokens.push({ type: 'string', text: raw });
    } else if (raw === 'true' || raw === 'false' || raw === 'null' || raw === 'undefined') {
      tokens.push({ type: 'boolean', text: raw });
    } else if (/^\d/.test(raw)) {
      tokens.push({ type: 'number', text: raw });
    } else if (JS_KEYWORDS.has(raw)) {
      tokens.push({ type: 'keyword', text: raw });
    } else if (JS_GLOBALS.has(raw)) {
      tokens.push({ type: 'global', text: raw });
    } else if (/^[{}()[\].,;]$/.test(raw)) {
      tokens.push({ type: 'delimiter', text: raw });
    } else if (/^[+\-*\/%=<>!?:&|^~]+$/.test(raw)) {
      tokens.push({ type: 'operator', text: raw });
    } else {
      tokens.push({ type: 'text', text: raw });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < code.length) {
    tokens.push({
      type: 'text',
      text: code.substring(lastIndex),
    });
  }

  return tokens;
}
