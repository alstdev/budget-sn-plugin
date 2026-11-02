/**
 * Custom table (docs/SPEC.md 4.8, stage 3): a top-level "## <назва>" section
 * whose body is exactly one Markdown table with user-defined columns. Cells
 * are plain text; nothing is calculated.
 */
import { normalizeTitle } from '../../core/md/lines';
import {
  formatTable,
  isSeparatorRow,
  isTableLine,
  splitRow,
  type Align,
  type TableRow,
} from '../../core/md/table';
import type { Issue, MdBlock } from '../../core/template';

export type CustomRow =
  | { readonly kind: 'row'; readonly cells: readonly string[] }
  | { readonly kind: 'raw'; readonly text: string; readonly reason: string };

export interface CustomTableModel {
  readonly title: string;
  readonly columns: readonly string[];
  readonly align: readonly Align[];
  readonly rows: readonly CustomRow[];
}

export const MAX_COLUMNS = 12;

/** Body = blank lines + one table (header, separator, rows) and nothing else. */
export function isSingleTable(lines: readonly string[]): boolean {
  const content = lines.filter((l) => l.trim() !== '');
  if (content.length < 2 || !content.every(isTableLine)) return false;
  const first = lines.findIndex((l) => l.trim() !== '');
  const last = lines.length - 1 - [...lines].reverse().findIndex((l) => l.trim() !== '');
  if (lines.slice(first, last + 1).some((l) => l.trim() === '')) return false;
  const header = splitRow(content[0] ?? '');
  return header.length > 0 && header.length <= MAX_COLUMNS && isSeparatorRow(content[1] ?? '');
}

export function parseCustomTable(block: MdBlock): { model: CustomTableModel; issues: Issue[] } {
  const issues: Issue[] = [];
  const indexed = block.lines.map((text, i) => ({ text, line: i + 1 })).filter((l) => l.text.trim() !== '');
  const columns = splitRow(indexed[0]?.text ?? '');
  const align = splitRow(indexed[1]?.text ?? '').map((c): Align => (c.endsWith(':') && !c.startsWith(':') ? 'right' : 'left'));
  while (align.length < columns.length) align.push('left');
  const rows: CustomRow[] = indexed.slice(2).map(({ text, line }) => {
    const cells = splitRow(text);
    if (cells.length > columns.length) {
      issues.push({ line, message: 'Рядок не розібрано (зайві клітинки); збережено як є.', critical: false });
      return { kind: 'raw', text, reason: 'зайві клітинки' };
    }
    while (cells.length < columns.length) cells.push('');
    return { kind: 'row', cells };
  });
  return {
    model: { title: block.heading.text, columns, align: align.slice(0, columns.length), rows },
    issues,
  };
}

export function serializeCustomTable(model: CustomTableModel): string[] {
  const rows: TableRow[] = model.rows.map((r) => (r.kind === 'raw' ? { raw: r.text } : r.cells));
  return [`## ${model.title}`, ...formatTable(model.columns, model.align, rows)];
}

/** Validates the title and comma-separated column names typed in the UI. */
export function parseColumnsInput(title: string, columnsText: string): { title: string; columns: string[] } | string {
  const t = title.trim();
  if (t === '') return 'Вкажіть назву таблиці.';
  if (t.length > 80 || /[\r\n#|]/.test(t)) return 'Назва: до 80 символів, без # | і переводів рядка.';
  const columns = columnsText.split(',').map((c) => c.trim()).filter((c) => c !== '');
  if (columns.length === 0) return 'Вкажіть колонки через кому.';
  if (columns.length > MAX_COLUMNS) return `Не більше ${MAX_COLUMNS} колонок.`;
  if (columns.some((c) => c.length > 40 || /[\r\n|]/.test(c))) return 'Колонка: до 40 символів, без | і переводів рядка.';
  if (new Set(columns.map(normalizeTitle)).size !== columns.length) return 'Назви колонок не мають повторюватися.';
  return { title: t, columns };
}
