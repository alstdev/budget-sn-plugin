/**
 * Month template (docs/SPEC.md 4.7, 5.2):
 *
 *   ## Шаблон місяця
 *   ### Постійні
 *   | Назва | Сума | Вал | День | Зв'язок |
 *   ### Заплановані покупки
 *   | Назва | Бюджет | Вал | Місяць | На місяць | Статус |
 */
import { normalizeTitle, parseHeading, type Heading } from '../../core/md/lines';
import { isTableLine } from '../../core/md/table';
import { formatAmount, isCurrency, parseAmount, type Minor } from '../../core/money';
import type { Issue, MdBlock } from '../../core/template';
import { isMonthKey, type MonthRow } from '../months/model';
import { emptyTable, parseTableAt, tableLines, type Column, type Table } from '../shared/typedTable';

export const TEMPLATE_PARENT = 'Шаблон місяця';
export const FIXED_TITLE = 'Постійні';
export const PLANNED_TITLE = 'Заплановані покупки';
export const STATUS_PLANNED = 'заплановано';
export const STATUS_CANCELLED = 'скасовано';

export type Link =
  | { readonly kind: 'none' }
  | { readonly kind: 'debt' | 'savings'; readonly name: string };

export interface FixedRow {
  readonly name: string;
  readonly amount: Minor;
  readonly currency: string;
  /** Day of month 1..31; null when empty. */
  readonly day: number | null;
  readonly link: Link;
}

export interface PlannedRow {
  readonly name: string;
  readonly budget: Minor;
  readonly currency: string;
  /** "РРРР-ММ" or "" (not scheduled). */
  readonly month: string;
  /** Kept as written; not used in calculations. */
  readonly perMonth: string;
  /** "заплановано", "куплено ДД.ММ", "скасовано" or any other text. */
  readonly status: string;
}

export interface FixedModel {
  readonly table: Table<FixedRow>;
}

export interface PlannedModel {
  readonly table: Table<PlannedRow>;
}

export const FIXED_COLUMNS: readonly Column[] = [
  { title: 'Назва', align: 'left' },
  { title: 'Сума', align: 'right' },
  { title: 'Вал', align: 'left' },
  { title: 'День', align: 'right' },
  { title: "Зв'язок", align: 'left' },
];

export const PLANNED_COLUMNS: readonly Column[] = [
  { title: 'Назва', align: 'left' },
  { title: 'Бюджет', align: 'right' },
  { title: 'Вал', align: 'left' },
  { title: 'Місяць', align: 'left' },
  { title: 'На місяць', align: 'left' },
  { title: 'Статус', align: 'left' },
];

export function parseLink(text: string): Link | null {
  const t = text.trim();
  if (t === '') return { kind: 'none' };
  const match = /^(борг|накоп)\s*:\s*(.+)$/i.exec(t);
  if (match === null) return null;
  return { kind: normalizeTitle(match[1] ?? '') === 'борг' ? 'debt' : 'savings', name: (match[2] ?? '').trim() };
}

export function formatLink(link: Link): string {
  if (link.kind === 'none') return '';
  return `${link.kind === 'debt' ? 'борг' : 'накоп'}: ${link.name}`;
}

function parseFixed(cells: readonly string[]): FixedRow | string {
  const [name = '', amountText = '', currencyText = '', dayText = '', linkText = ''] = cells;
  if (name.trim() === '') return 'немає назви';
  const amount = parseAmount(amountText);
  if (amount === null) return 'сума не розібрана';
  const currency = currencyText.trim().toUpperCase();
  if (!isCurrency(currency)) return 'валюта не розібрана';
  let day: number | null = null;
  if (dayText.trim() !== '') {
    if (!/^\d{1,2}$/.test(dayText.trim())) return 'день не розібрано';
    day = Number(dayText.trim());
    if (day < 1 || day > 31) return 'день поза 1–31';
  }
  const parsedLink = parseLink(linkText);
  if (parsedLink === null) return 'зв’язок має бути «борг: назва» або «накоп: назва»';
  // Typed separately: in a `FixedRow | string` return, `link` would resolve to String#link.
  const row: FixedRow = { name: name.trim(), amount, currency, day, link: parsedLink };
  return row;
}

function parsePlanned(cells: readonly string[]): PlannedRow | string {
  const [name = '', budgetText = '', currencyText = '', month = '', perMonth = '', status = ''] = cells;
  if (name.trim() === '') return 'немає назви';
  const budget = parseAmount(budgetText);
  if (budget === null) return 'бюджет не розібрано';
  const currency = currencyText.trim().toUpperCase();
  if (!isCurrency(currency)) return 'валюта не розібрана';
  if (month.trim() !== '' && !isMonthKey(month.trim())) return 'місяць не у форматі РРРР-ММ';
  return { name: name.trim(), budget, currency, month: month.trim(), perMonth, status: status.trim() };
}

export function matchesTemplateSection(heading: Heading, parent: Heading | undefined, title: string): boolean {
  return (
    heading.level === 3 &&
    parent?.level === 2 &&
    normalizeTitle(parent.text) === normalizeTitle(TEMPLATE_PARENT) &&
    normalizeTitle(heading.text) === normalizeTitle(title)
  );
}

/** One table under the heading; anything else makes the section read-only. */
function parseSingleTable<R>(
  block: MdBlock,
  columns: readonly Column[],
  parseRow: (cells: readonly string[]) => R | string,
): { table: Table<R>; issues: Issue[] } {
  const issues: Issue[] = [];
  let table = emptyTable<R>();
  let seen = false;
  const lines = block.lines;
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i] ?? '';
    const trimmed = text.trim();
    if (trimmed === '' || /^_.*_$/.test(trimmed)) continue;
    if (isTableLine(text) && !seen && parseHeading(trimmed) === null) {
      const result = parseTableAt(lines, i, columns, parseRow);
      if ('critical' in result) {
        issues.push(result.critical);
        break;
      }
      table = result.table;
      issues.push(...result.issues);
      seen = true;
      i = result.next - 1;
      continue;
    }
    issues.push({ line: i + 1, message: 'Нерозпізнаний рядок; розділ лише для читання.', critical: true });
    break;
  }
  return { table, issues };
}

export function parseFixedSection(block: MdBlock): { model: FixedModel; issues: Issue[] } {
  const { table, issues } = parseSingleTable(block, FIXED_COLUMNS, parseFixed);
  return { model: { table }, issues };
}

export function parsePlannedSection(block: MdBlock): { model: PlannedModel; issues: Issue[] } {
  const { table, issues } = parseSingleTable(block, PLANNED_COLUMNS, parsePlanned);
  return { model: { table }, issues };
}

export function serializeFixed(model: FixedModel): string[] {
  return [
    `### ${FIXED_TITLE}`,
    ...tableLines(FIXED_COLUMNS, model.table, (r) => [
      r.name,
      formatAmount(r.amount),
      r.currency,
      r.day === null ? '' : String(r.day),
      formatLink(r.link),
    ]),
  ];
}

export function serializePlanned(model: PlannedModel): string[] {
  return [
    `### ${PLANNED_TITLE}`,
    ...tableLines(PLANNED_COLUMNS, model.table, (r) => [
      r.name,
      formatAmount(r.budget),
      r.currency,
      r.month,
      r.perMonth,
      r.status,
    ]),
  ];
}

/** Fixed expense a pending "пост" row came from, if it links to a section. */
export function linkFor(context: { readonly fixed: readonly FixedRow[] }, row: MonthRow): FixedRow | null {
  if (row.type !== 'пост') return null;
  const key = normalizeTitle(row.name);
  const fixed = context.fixed.find((f) => normalizeTitle(f.name) === key);
  return fixed !== undefined && fixed.link.kind !== 'none' ? fixed : null;
}
