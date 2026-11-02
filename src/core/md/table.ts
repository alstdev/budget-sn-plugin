/**
 * Markdown pipe tables: reading (tolerant) and writing (canonical, padded).
 * "|" inside a cell is escaped as "\|" (docs/SPEC.md 5.1).
 */

export type Align = 'left' | 'right';

export function isTableLine(text: string): boolean {
  return /^\s*\|/.test(text);
}

/** Splits a table row into trimmed, unescaped cells. */
export function splitRow(text: string): string[] {
  let s = text.trim();
  if (s.startsWith('|')) s = s.slice(1);
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s.charAt(i);
    if (ch === '\\' && s[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  // Text after the last "|" is a cell only if the row did not end with "|".
  if (current.trim() !== '') cells.push(current.trim());
  return cells;
}

export function isSeparatorRow(text: string): boolean {
  const cells = splitRow(text);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

/** Header cells compared without case and spaces (docs/SPEC.md 5.2). */
export function normalizeHeader(cell: string): string {
  return cell.toLocaleLowerCase('uk-UA').replace(/\s+/g, '');
}

function escapeCell(cell: string): string {
  return cell.replace(/\|/g, '\\|');
}

/** A row kept exactly as written (unparsed rows are never rewritten). */
export interface RawRow {
  readonly raw: string;
}

export type TableRow = readonly string[] | RawRow;

function isRawRow(row: TableRow): row is RawRow {
  return !Array.isArray(row);
}

/**
 * Canonical table: columns padded to equal width, "---:" for right-aligned.
 * Raw rows are emitted verbatim at their position.
 */
export function formatTable(
  header: readonly string[],
  align: readonly Align[],
  rows: readonly TableRow[],
): string[] {
  const escapedHeader = header.map(escapeCell);
  const cellRows = rows.filter((r): r is readonly string[] => !isRawRow(r));
  const escape = (row: readonly string[]) => header.map((_, i) => escapeCell(row[i] ?? ''));
  const widths = escapedHeader.map((h, i) =>
    Math.max(3, h.length, ...cellRows.map((r) => escape(r)[i]?.length ?? 0)),
  );
  const line = (cells: readonly string[]) =>
    `| ${cells
      .map((c, i) => {
        const w = widths[i] ?? 3;
        return align[i] === 'right' ? c.padStart(w) : c.padEnd(w);
      })
      .join(' | ')} |`;
  const separator = `| ${widths
    .map((w, i) => (align[i] === 'right' ? `${'-'.repeat(w - 1)}:` : '-'.repeat(w)))
    .join(' | ')} |`;
  return [
    line(escapedHeader),
    separator,
    ...rows.map((row) => (isRawRow(row) ? row.raw : line(escape(row)))),
  ];
}
