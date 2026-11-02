/** Figures for the "Огляд" tab and the note preview (docs/SPEC.md 4.1, 6.4). */
import { sectionsOf, type BudgetDocument } from '../core/document';
import { normalizeTitle } from '../core/md/lines';
import { formatMoneyUi, sum, type Minor } from '../core/money';
import { debtStats, type DebtModel } from '../templates/debts';
import { monthStats, monthTitle, type MonthModel, type MonthRow } from '../templates/months/model';
import { STATUS_PLANNED, type PlannedModel, type PlannedRow } from '../templates/monthTemplate/model';
import { savingsStats, type SavingsModel } from '../templates/savings';
import { rowsOf } from '../templates/shared/typedTable';

export function totalsByCurrency(items: readonly (readonly [string, Minor])[]): [string, Minor][] {
  const totals = new Map<string, Minor[]>();
  for (const [currency, value] of items) totals.set(currency, [...(totals.get(currency) ?? []), value]);
  return [...totals.entries()].map(([c, values]) => [c, sum(values)]);
}

export const moneyList = (items: readonly (readonly [string, Minor])[]) =>
  items.map(([c, v]) => formatMoneyUi(v, c)).join(' + ');

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Month of today if it exists in the note, otherwise the last month. */
export function currentMonth(doc: BudgetDocument, today: Date): MonthModel | null {
  const months = sectionsOf(doc, 'month').map(({ block }) => block.model as MonthModel);
  const key = monthKeyOf(today);
  return months.find((m) => m.key === key) ?? months[months.length - 1] ?? null;
}

export interface Overview {
  readonly debts: [string, Minor][];
  readonly savings: [string, Minor][];
  readonly month: MonthModel | null;
  readonly pending: MonthRow[];
  readonly planned: PlannedRow[];
}

export function overview(doc: BudgetDocument, today: Date): Overview {
  const debts = totalsByCurrency(
    sectionsOf(doc, 'debt').map(({ block }) => {
      const m = block.model as DebtModel;
      return [m.currency, debtStats(m).remaining] as const;
    }),
  );
  const savings = totalsByCurrency(
    sectionsOf(doc, 'savings').map(({ block }) => {
      const m = block.model as SavingsModel;
      return [m.currency, savingsStats(m).balance] as const;
    }),
  );
  const month = currentMonth(doc, today);
  const pending = month === null ? [] : rowsOf(month.expenses).filter((r) => r.date === null);
  const planned = sectionsOf(doc, 'planned').flatMap(({ block }) =>
    rowsOf((block.model as PlannedModel).table).filter((r) => normalizeTitle(r.status) === STATUS_PLANNED),
  );
  return { debts, savings, month, pending, planned };
}

/** Note preview: "Борги: 60 000 ₴ + 500 $ · Жовтень: залишок 6 067 ₴". */
export function buildPreview(doc: BudgetDocument, today: Date): string {
  const o = overview(doc, today);
  const parts: string[] = [];
  if (o.debts.length > 0) parts.push(`Борги: ${moneyList(o.debts)}`);
  if (o.month !== null) {
    const title = o.month.title === '' ? monthTitle(o.month.key) : o.month.title;
    parts.push(`${title}: залишок ${formatMoneyUi(monthStats(o.month).balance, 'UAH')}`);
  }
  if (o.savings.length > 0) parts.push(`Накопичення: ${moneyList(o.savings)}`);
  return parts.length > 0 ? parts.join(' · ') : 'Бюджет';
}
