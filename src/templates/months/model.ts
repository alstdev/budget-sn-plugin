/**
 * Month section (docs/SPEC.md 4.7, 5.2):
 *
 *   ### РРРР-ММ <Назва місяця>
 *   _<розрахункове>_
 *   #### Надходження
 *   | Дата | Звідки | Сума | Вал | У грн | Коментар |
 *   #### Витрати
 *   | Дата | Назва | Сума | Вал | У грн | Тип | Коментар |
 *
 * Date "очікує" marks an unpaid row; its "У грн" may be empty.
 */
import { normalizeTitle, parseHeading, type Heading } from '../../core/md/lines';
import { isTableLine } from '../../core/md/table';
import { formatAmount, isCurrency, parseAmount, sum, type Minor } from '../../core/money';
import type { Issue, MdBlock } from '../../core/template';
import { isValidDate } from '../shared/ledger';
import { emptyTable, parseTableAt, rowsOf, tableLines, type Column, type Table } from '../shared/typedTable';

export const PENDING = 'очікує';
export const EXPENSE_TYPES = ['пост', 'разова', 'план', 'борг', 'накоп.'] as const;
export const MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
] as const;

export interface MonthRow {
  /** "РРРР-ММ-ДД", or null for "очікує". */
  readonly date: string | null;
  /** "Звідки" for income, "Назва" for expenses. */
  readonly name: string;
  readonly amount: Minor;
  readonly currency: string;
  /** Null only for unpaid rows without a UAH amount. */
  readonly uah: Minor | null;
  /** Expense type; empty for income. Unknown values are kept as they are. */
  readonly type: string;
  readonly comment: string;
}

export interface MonthModel {
  /** "РРРР-ММ". */
  readonly key: string;
  readonly title: string;
  readonly income: Table<MonthRow>;
  readonly expenses: Table<MonthRow>;
}

export const INCOME_COLUMNS: readonly Column[] = [
  { title: 'Дата', align: 'left' },
  { title: 'Звідки', align: 'left' },
  { title: 'Сума', align: 'right' },
  { title: 'Вал', align: 'left' },
  { title: 'У грн', align: 'right' },
  { title: 'Коментар', align: 'left' },
];

export const EXPENSE_COLUMNS: readonly Column[] = [
  { title: 'Дата', align: 'left' },
  { title: 'Назва', align: 'left' },
  { title: 'Сума', align: 'right' },
  { title: 'Вал', align: 'left' },
  { title: 'У грн', align: 'right' },
  { title: 'Тип', align: 'left' },
  { title: 'Коментар', align: 'left' },
];

const KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return KEY_RE.test(value);
}

export function monthTitle(key: string): string {
  const month = Number(key.slice(5, 7));
  return MONTH_NAMES[month - 1] ?? '';
}

export function nextMonthKey(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function daysInMonth(key: string): number {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "### 2026-11 Листопад" → key and title. */
export function parseMonthHeading(text: string): { key: string; title: string } | null {
  const match = /^(\d{4}-\d{2})(?:\s+(.*))?$/.exec(text.trim());
  if (match === null || !isMonthKey(match[1] ?? '')) return null;
  return { key: match[1] ?? '', title: (match[2] ?? '').trim() };
}

export function matchesMonth(heading: Heading, parent: Heading | undefined): boolean {
  return (
    heading.level === 3 &&
    parent?.level === 2 &&
    normalizeTitle(parent.text) === 'місяці' &&
    parseMonthHeading(heading.text) !== null
  );
}

function parseMoneyCells(
  dateText: string,
  amountText: string,
  currencyText: string,
  uahText: string,
): { date: string | null; amount: Minor; currency: string; uah: Minor | null } | string {
  const pending = normalizeTitle(dateText) === PENDING;
  if (!pending && !isValidDate(dateText)) return 'дата не у форматі РРРР-ММ-ДД або «очікує»';
  const amount = parseAmount(amountText);
  if (amount === null) return 'сума не розібрана';
  const currency = currencyText.trim().toUpperCase();
  if (!isCurrency(currency)) return 'валюта не розібрана';
  let uah: Minor | null;
  if (uahText.trim() === '') {
    if (pending) uah = null;
    else if (currency === 'UAH') uah = amount;
    else return 'немає суми в грн для валюти, відмінної від UAH';
  } else {
    uah = parseAmount(uahText);
    if (uah === null) return 'сума в грн не розібрана';
  }
  return { date: pending ? null : dateText, amount, currency, uah };
}

function parseIncome(cells: readonly string[]): MonthRow | string {
  const [date = '', name = '', amount = '', currency = '', uah = '', comment = ''] = cells;
  const money = parseMoneyCells(date, amount, currency, uah);
  if (typeof money === 'string') return money;
  return { ...money, name, type: '', comment };
}

function parseExpense(cells: readonly string[]): MonthRow | string {
  const [date = '', name = '', amount = '', currency = '', uah = '', type = '', comment = ''] = cells;
  const money = parseMoneyCells(date, amount, currency, uah);
  if (typeof money === 'string') return money;
  return { ...money, name, type, comment };
}

const uahCell = (row: MonthRow) => (row.uah === null ? '' : formatAmount(row.uah));

function incomeCells(row: MonthRow): string[] {
  return [row.date ?? PENDING, row.name, formatAmount(row.amount), row.currency, uahCell(row), row.comment];
}

function expenseCells(row: MonthRow): string[] {
  return [row.date ?? PENDING, row.name, formatAmount(row.amount), row.currency, uahCell(row), row.type, row.comment];
}

export function parseMonth(block: MdBlock): { model: MonthModel; issues: Issue[] } {
  const head = parseMonthHeading(block.heading.text);
  const issues: Issue[] = [];
  let income = emptyTable<MonthRow>();
  let expenses = emptyTable<MonthRow>();
  let current: 'income' | 'expenses' | null = null;
  const seen = new Set<string>();
  const lines = block.lines;

  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i] ?? '';
    const trimmed = text.trim();
    if (trimmed === '') continue;
    if (/^_.*_$/.test(trimmed)) continue;

    const heading = parseHeading(trimmed);
    if (heading?.level === 4) {
      const title = normalizeTitle(heading.text);
      const which = title === 'надходження' ? 'income' : title === 'витрати' ? 'expenses' : null;
      if (which === null || seen.has(which)) {
        issues.push({ line: i + 1, message: `Невідомий або повторний підрозділ «${heading.text}».`, critical: true });
        break;
      }
      seen.add(which);
      current = which;
      continue;
    }

    if (isTableLine(text) && current !== null) {
      const result =
        current === 'income'
          ? parseTableAt(lines, i, INCOME_COLUMNS, parseIncome)
          : parseTableAt(lines, i, EXPENSE_COLUMNS, parseExpense);
      if ('critical' in result) {
        issues.push(result.critical);
        break;
      }
      if (current === 'income') income = result.table;
      else expenses = result.table;
      issues.push(...result.issues);
      current = null; // one table per subsection
      i = result.next - 1;
      continue;
    }

    issues.push({ line: i + 1, message: 'Нерозпізнаний рядок; розділ лише для читання.', critical: true });
    break;
  }

  return {
    model: { key: head?.key ?? '', title: head?.title ?? '', income, expenses },
    issues,
  };
}

export interface MonthStats {
  readonly incomeUah: Minor;
  readonly spentUah: Minor;
  readonly balance: Minor;
  readonly pendingUah: Minor;
  readonly afterPending: Minor;
  /** Unpaid expenses without a UAH amount, by currency. */
  readonly pendingOther: readonly (readonly [string, Minor])[];
  readonly pendingCount: number;
}

export function monthStats(model: MonthModel): MonthStats {
  const income = rowsOf(model.income);
  const expenses = rowsOf(model.expenses);
  const paidUah = (rows: MonthRow[]) =>
    sum(rows.filter((r) => r.date !== null).map((r) => r.uah ?? 0));
  const incomeUah = paidUah(income);
  const spentUah = paidUah(expenses);
  const pending = expenses.filter((r) => r.date === null);
  const pendingKnown = pending.filter((r) => r.uah !== null || r.currency === 'UAH');
  const pendingUah = sum(pendingKnown.map((r) => r.uah ?? r.amount));
  const other = new Map<string, Minor>();
  for (const r of pending) {
    if (r.uah === null && r.currency !== 'UAH') other.set(r.currency, sum([other.get(r.currency) ?? 0, r.amount]));
  }
  const balance = incomeUah - spentUah;
  return {
    incomeUah,
    spentUah,
    balance,
    pendingUah,
    afterPending: balance - pendingUah,
    pendingOther: [...other.entries()],
    pendingCount: pending.length,
  };
}

export function monthSummary(model: MonthModel): string[] {
  const s = monthStats(model);
  const other =
    s.pendingOther.length === 0
      ? ''
      : ` · очікує в інших валютах: ${s.pendingOther.map(([c, v]) => `${formatAmount(v)} ${c}`).join(', ')}`;
  return [
    `_Надійшло: ${formatAmount(s.incomeUah)} UAH · витрачено: ${formatAmount(s.spentUah)} UAH · залишок: ${formatAmount(s.balance)} UAH · після очікуваних: ${formatAmount(s.afterPending)} UAH${other}_`,
  ];
}

export function serializeMonth(model: MonthModel): string[] {
  const title = model.title === '' ? '' : ` ${model.title}`;
  return [
    `### ${model.key}${title}`,
    ...monthSummary(model),
    '#### Надходження',
    ...tableLines(INCOME_COLUMNS, model.income, incomeCells),
    '',
    '#### Витрати',
    ...tableLines(EXPENSE_COLUMNS, model.expenses, expenseCells),
  ];
}

/** Uah for a pending UAH row is the amount itself. */
export function rowUah(row: MonthRow): Minor | null {
  return row.uah ?? (row.currency === 'UAH' ? row.amount : null);
}
