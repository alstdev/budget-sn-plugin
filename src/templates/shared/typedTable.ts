/**
 * Generic table with a fixed leading set of columns (docs/SPEC.md 5.2):
 * header names are compared without case and spaces, extra columns on the
 * right are kept, rows that do not parse are kept verbatim with an issue.
 */
import {
  formatTable,
  isSeparatorRow,
  isTableLine,
  normalizeHeader,
  splitRow,
  type Align,
  type TableRow,
} from '../../core/md/table';
import type { Issue } from '../../core/template';

export interface Column {
  readonly title: string;
  readonly align: Align;
}

export type Row<R> =
  | { readonly kind: 'row'; readonly row: R; readonly extra: readonly string[] }
  | { readonly kind: 'raw'; readonly text: string; readonly reason: string };

export interface Table<R> {
  readonly extraHeaders: readonly string[];
  readonly rows: readonly Row<R>[];
}

export const emptyTable = <R>(): Table<R> => ({ extraHeaders: [], rows: [] });

/**
 * Parses the table starting at lines[start]. Returns the table, issues and
 * the index of the first line after it, or a critical issue.
 */
export function parseTableAt<R>(
  lines: readonly string[],
  start: number,
  columns: readonly Column[],
  parseRow: (cells: readonly string[]) => R | string,
): { table: Table<R>; issues: Issue[]; next: number } | { critical: Issue } {
  const header = splitRow(lines[start] ?? '');
  const keys = header.map(normalizeHeader);
  const expected = columns.map((c) => normalizeHeader(c.title));
  if (!isSeparatorRow(lines[start + 1] ?? '') || expected.some((k, j) => keys[j] !== k)) {
    return {
      critical: {
        line: start + 1,
        message: `Заголовок таблиці має бути: ${columns.map((c) => c.title).join(' | ')}.`,
        critical: true,
      },
    };
  }
  const extraHeaders = header.slice(columns.length);
  const rows: Row<R>[] = [];
  const issues: Issue[] = [];
  let i = start + 2;
  for (; i < lines.length && isTableLine(lines[i] ?? ''); i += 1) {
    const text = lines[i] ?? '';
    const cells = splitRow(text);
    if (cells.length > columns.length + extraHeaders.length) {
      rows.push({ kind: 'raw', text, reason: 'зайві клітинки' });
      issues.push({ line: i + 1, message: 'Рядок не розібрано (зайві клітинки); збережено як є.', critical: false });
      continue;
    }
    const padded = [...cells];
    while (padded.length < columns.length) padded.push('');
    const parsed = parseRow(padded);
    if (typeof parsed === 'string') {
      rows.push({ kind: 'raw', text, reason: parsed });
      issues.push({ line: i + 1, message: `Рядок не розібрано (${parsed}); збережено як є.`, critical: false });
    } else {
      const extra = padded.slice(columns.length);
      while (extra.length < extraHeaders.length) extra.push('');
      rows.push({ kind: 'row', row: parsed, extra });
    }
  }
  return { table: { extraHeaders, rows }, issues, next: i };
}

export function tableLines<R>(
  columns: readonly Column[],
  table: Table<R>,
  toCells: (row: R) => string[],
): string[] {
  const header = [...columns.map((c) => c.title), ...table.extraHeaders];
  const align = [...columns.map((c) => c.align), ...table.extraHeaders.map((): Align => 'left')];
  const rows: TableRow[] = table.rows.map((r) => (r.kind === 'raw' ? { raw: r.text } : [...toCells(r.row), ...r.extra]));
  return formatTable(header, align, rows);
}

export function rowsOf<R>(table: Table<R>): R[] {
  return table.rows.flatMap((r) => (r.kind === 'row' ? [r.row] : []));
}

export function appendRow<R>(table: Table<R>, row: R): Table<R> {
  return { ...table, rows: [...table.rows, { kind: 'row', row, extra: table.extraHeaders.map(() => '') }] };
}

export function replaceRow<R>(table: Table<R>, index: number, row: R): Table<R> {
  const current = table.rows[index];
  if (current?.kind !== 'row') return table;
  const rows = table.rows.slice();
  rows[index] = { ...current, row };
  return { ...table, rows };
}
