/**
 * Consistency check between month expenses and debt / savings sections
 * (docs/SPEC.md 4.6). Warnings only: nothing is changed or blocked.
 *
 * A paid month expense of type "борг" / "накоп." should have a row with the
 * same date, amount and currency in the section with the same name, and a
 * positive debt payment / savings deposit should have such a month row when
 * the month of its date exists in the note.
 */
import type { DebtModel } from '../templates/debts';
import type { MonthModel } from '../templates/months/model';
import type { SavingsModel } from '../templates/savings';
import { operations } from '../templates/shared/ledger';
import { rowsOf } from '../templates/shared/typedTable';
import { sectionsOf, type BudgetDocument } from './document';
import { normalizeTitle } from './md/lines';
import { formatAmount } from './money';
import type { Issue } from './template';

const TYPE_TO_TEMPLATE: Readonly<Record<string, 'debt' | 'savings'>> = { борг: 'debt', 'накоп.': 'savings' };
const TEMPLATE_LABEL = { debt: 'борг', savings: 'накопичення' } as const;

const entryKey = (name: string, date: string, amount: number, currency: string) =>
  `${normalizeTitle(name)}\u0000${date}\u0000${String(amount)}\u0000${currency}`;

/** Issues keyed by card key ("debt:Назва", "month:2026-10"). */
export function consistencyIssues(doc: BudgetDocument): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>();
  const add = (key: string, message: string) => {
    out.set(key, [...(out.get(key) ?? []), { message, critical: false }]);
  };

  const months = sectionsOf(doc, 'month').map(({ block }) => block.model as MonthModel);
  const monthKeys = new Set(months.map((m) => m.key));
  const sections = {
    debt: sectionsOf(doc, 'debt').map(({ block }) => block.model as DebtModel),
    savings: sectionsOf(doc, 'savings').map(({ block }) => block.model as SavingsModel),
  };

  // Section operations available for matching, as a multiset.
  const sectionOps = new Map<string, number>();
  for (const templateId of ['debt', 'savings'] as const) {
    for (const s of sections[templateId]) {
      for (const op of operations(s.ledger)) {
        const k = `${templateId}\u0000${entryKey(s.name, op.date, op.amount, op.currency)}`;
        sectionOps.set(k, (sectionOps.get(k) ?? 0) + 1);
      }
    }
  }

  // Month rows available for matching, as a multiset.
  const monthRows = new Map<string, number>();

  for (const m of months) {
    for (const row of rowsOf(m.expenses)) {
      const templateId = TYPE_TO_TEMPLATE[row.type];
      if (templateId === undefined || row.date === null) continue;
      const k = `${templateId}\u0000${entryKey(row.name, row.date, row.amount, row.currency)}`;
      monthRows.set(k, (monthRows.get(k) ?? 0) + 1);
      const exists = sections[templateId].some((s) => normalizeTitle(s.name) === normalizeTitle(row.name));
      const label = `${row.date} «${row.name}» ${formatAmount(row.amount)} ${row.currency}`;
      if (!exists) {
        add(`month:${m.key}`, `${label}: ${TEMPLATE_LABEL[templateId]} з такою назвою не знайдено.`);
        continue;
      }
      const left = sectionOps.get(k) ?? 0;
      if (left > 0) sectionOps.set(k, left - 1);
      else add(`month:${m.key}`, `${label}: немає такого ж запису в розділі «${row.name}».`);
    }
  }

  for (const templateId of ['debt', 'savings'] as const) {
    for (const s of sections[templateId]) {
      for (const op of operations(s.ledger)) {
        if (op.amount <= 0 || !monthKeys.has(op.date.slice(0, 7))) continue;
        const k = `${templateId}\u0000${entryKey(s.name, op.date, op.amount, op.currency)}`;
        const left = monthRows.get(k) ?? 0;
        if (left > 0) monthRows.set(k, left - 1);
        else add(`${templateId}:${s.name}`, `${op.date} ${formatAmount(op.amount)} ${op.currency}: немає рядка у витратах місяця ${op.date.slice(0, 7)}.`);
      }
    }
  }
  return out;
}
