/**
 * Line tokenizer that keeps every line ending as it was, so untouched parts
 * of the note can be written back byte for byte (docs/SPEC.md 5.1, 5.3).
 */

export type Eol = '' | '\n' | '\r\n';

export interface Line {
  /** Line text without its line ending. */
  readonly text: string;
  readonly eol: Eol;
}

export function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start < text.length) {
    const nl = text.indexOf('\n', start);
    if (nl === -1) {
      lines.push({ text: text.slice(start), eol: '' });
      break;
    }
    const crlf = nl > start && text[nl - 1] === '\r';
    lines.push({ text: text.slice(start, crlf ? nl - 1 : nl), eol: crlf ? '\r\n' : '\n' });
    start = nl + 1;
  }
  return lines;
}

export function joinLines(lines: readonly Line[]): string {
  let out = '';
  for (const line of lines) out += line.text + line.eol;
  return out;
}

/** Line ending used for newly written text: the first one found, else "\n". */
export function detectEol(lines: readonly Line[]): '\n' | '\r\n' {
  for (const line of lines) if (line.eol !== '') return line.eol;
  return '\n';
}

export interface Heading {
  readonly level: number;
  readonly text: string;
}

/** ATX heading ("## Title"); null for other lines. */
export function parseHeading(text: string): Heading | null {
  const match = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(text);
  if (match === null) return null;
  return { level: (match[1] ?? '').length, text: (match[2] ?? '').trim() };
}

/** Opening or closing line of a fenced code block. */
export function isFence(text: string): boolean {
  return /^ {0,3}(```|~~~)/.test(text);
}

/** Heading text compared without case and extra spaces. */
export function normalizeTitle(text: string): string {
  return text.toLocaleLowerCase('uk-UA').replace(/\s+/g, ' ').trim();
}
