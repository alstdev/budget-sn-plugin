/**
 * Handlers for DocAction. Every action is applied to the latest document and
 * produces one new document (one save), or an error text and no change.
 */
import {
  addSection,
  findSection,
  sectionsOf,
  updateSection,
  type BudgetDocument,
  type ChangeResult,
} from '../core/document';
import { normalizeTitle } from '../core/md/lines';
import type { DebtModel } from '../templates/debts';
import {
  daysInMonth,
  monthTitle,
  type MonthModel,
  type MonthRow,
} from '../templates/months/model';
import {
  FIXED_TITLE,
  PLANNED_TITLE,
  STATUS_PLANNED,
  type FixedModel,
  type FixedRow,
  type PlannedModel,
} from '../templates/monthTemplate/model';
import type { SavingsModel } from '../templates/savings';
import { appendOperation, type Operation } from '../templates/shared/ledger';
import { appendRow, emptyTable, replaceRow, rowsOf, type Table } from '../templates/shared/typedTable';
import type { DocAction, DocContext } from './types';
import { linkFor } from '../templates/monthTemplate/model';

export { linkFor } from '../templates/monthTemplate/model';

export type { DocAction, DocContext } from './types';

const ok = (doc: BudgetDocument): ChangeResult => ({ ok: true, doc });
const fail = (error: string): ChangeResult => ({ ok: false, error });

interface Found<M> {
  readonly index: number;
  readonly model: M;
  readonly readOnly: boolean;
}

/** Section by template and name; the model type is the template's own. */
function sectionModel<M>(doc: BudgetDocument, templateId: string, name: string): Found<M> | null {
  const index = findSection(doc, templateId, name);
  const block = doc.blocks[index];
  if (block?.kind !== 'section') return null;
  const found: Found<unknown> = { index, model: block.model, readOnly: block.readOnly };
  return found as Found<M>;
}

function modify<M>(
  doc: BudgetDocument,
  templateId: string,
  name: string,
  change: (model: M) => M | string,
  missing: string,
): ChangeResult {
  const found = sectionModel<M>(doc, templateId, name);
  if (found === null) return fail(missing);
  if (found.readOnly) return fail(`Розділ «${name}» лише для читання; виправте його в Plain Editor.`);
  const next = change(found.model);
  if (typeof next === 'string') return fail(next);
  return updateSection(doc, found.index, next);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Rows of a month created from the template (docs/SPEC.md 4.7). */
export function monthFromTemplate(doc: BudgetDocument, key: string): MonthModel | string {
  const fixed = sectionModel<FixedModel>(doc, 'fixed', FIXED_TITLE);
  const planned = sectionModel<PlannedModel>(doc, 'planned', PLANNED_TITLE);
  for (const s of [fixed, planned]) {
    if (s === null) continue;
    const raw = s.model.table.rows.some((r) => r.kind === 'raw');
    if (s.readOnly || raw) return 'У шаблоні місяця є нерозібрані рядки; виправте їх у Plain Editor.';
  }
  const last = daysInMonth(key);
  const month = key.slice(5, 7);
  const rows: MonthRow[] = [];
  for (const f of fixed === null ? [] : rowsOf(fixed.model.table)) {
    rows.push({
      date: null,
      name: f.name,
      amount: f.amount,
      currency: f.currency,
      uah: null,
      type: 'пост',
      comment: f.day === null ? '' : `до ${pad2(Math.min(f.day, last))}.${month}`,
    });
  }
  for (const p of planned === null ? [] : rowsOf(planned.model.table)) {
    if (p.month !== key || normalizeTitle(p.status) !== STATUS_PLANNED) continue;
    rows.push({ date: null, name: p.name, amount: p.budget, currency: p.currency, uah: null, type: 'план', comment: '' });
  }
  return {
    key,
    title: monthTitle(key),
    income: emptyTable<MonthRow>(),
    expenses: rows.reduce<Table<MonthRow>>((t, r) => appendRow(t, r), emptyTable<MonthRow>()),
  };
}

function addLedgerOp(doc: BudgetDocument, templateId: 'debt' | 'savings', name: string, op: Operation): ChangeResult {
  return modify<DebtModel | SavingsModel>(
    doc,
    templateId,
    name,
    (m) => ({ ...m, ledger: appendOperation(m.ledger, op) }),
    `Розділ «${name}» не знайдено.`,
  );
}

function addMonthRow(doc: BudgetDocument, monthKey: string, table: 'income' | 'expenses', row: MonthRow): ChangeResult {
  return modify<MonthModel>(
    doc,
    'month',
    monthKey,
    (m) => ({ ...m, [table]: appendRow(m[table], row) }),
    `Місяця ${monthKey} немає; спершу створіть його.`,
  );
}

function payPending(doc: BudgetDocument, action: Extract<DocAction, { type: 'payPending' }>): ChangeResult {
  const { monthKey, rowIndex, expectName, row, link } = action;
  if (row.date === null) return fail('Вкажіть дату оплати.');
  const captured: { row: MonthRow | null } = { row: null };
  const first = modify<MonthModel>(
    doc,
    'month',
    monthKey,
    (m) => {
      const current = m.expenses.rows[rowIndex];
      if (current?.kind !== 'row' || current.row.date !== null || normalizeTitle(current.row.name) !== normalizeTitle(expectName)) {
        return 'Рядок змінено в іншому місці; відкрийте «Оплатити» ще раз.';
      }
      captured.row = current.row;
      return { ...m, expenses: replaceRow(m.expenses, rowIndex, row) };
    },
    `Місяця ${monthKey} немає.`,
  );
  const pendingRow = captured.row;
  if (!first.ok || pendingRow === null) return first;
  let next = first.doc;

  if (link) {
    const fixed = linkFor({ fixed: fixedRows(next) }, pendingRow);
    if (fixed !== null && fixed.link.kind !== 'none') {
      const op: Operation = {
        date: row.date,
        amount: row.amount,
        currency: row.currency,
        uah: row.uah ?? row.amount,
        comment: row.comment,
        extra: [],
      };
      const linked = addLedgerOp(next, fixed.link.kind === 'debt' ? 'debt' : 'savings', fixed.link.name, op);
      if (!linked.ok) return linked;
      next = linked.doc;
    }
  }

  const paid: MonthRow = pendingRow;
  if (paid.type === 'план') {
    const purchased = `куплено ${row.date.slice(8, 10)}.${row.date.slice(5, 7)}`;
    const planned = sectionModel<PlannedModel>(next, 'planned', PLANNED_TITLE);
    if (planned !== null && !planned.readOnly) {
      const index = planned.model.table.rows.findIndex(
        (r) =>
          r.kind === 'row' &&
          r.row.month === monthKey &&
          normalizeTitle(r.row.name) === normalizeTitle(paid.name) &&
          normalizeTitle(r.row.status) === STATUS_PLANNED,
      );
      const target = planned.model.table.rows[index];
      if (target?.kind === 'row') {
        const table = replaceRow(planned.model.table, index, { ...target.row, status: purchased });
        const updated = updateSection(next, planned.index, { table });
        if (!updated.ok) return updated;
        next = updated.doc;
      }
    }
  }
  return ok(next);
}

function ledgerOp(doc: BudgetDocument, action: Extract<DocAction, { type: 'ledgerOp' }>): ChangeResult {
  const { templateId, name, op, mirror } = action;
  const first = addLedgerOp(doc, templateId, name, op);
  if (!first.ok || !mirror) return first;
  if (op.amount <= 0) return fail('Від’ємну суму у витрати місяця не записуємо; зніміть галочку.');
  const monthKey = op.date.slice(0, 7);
  const sectionName = (() => {
    const found = sectionModel<DebtModel | SavingsModel>(first.doc, templateId, name);
    return found?.model.name ?? name;
  })();
  return addMonthRow(first.doc, monthKey, 'expenses', {
    date: op.date,
    name: sectionName,
    amount: op.amount,
    currency: op.currency,
    uah: op.uah,
    type: templateId === 'debt' ? 'борг' : 'накоп.',
    comment: op.comment,
  });
}

function addTemplateRow<R>(
  doc: BudgetDocument,
  templateId: 'fixed' | 'planned',
  title: string,
  row: R,
  duplicate: (rows: R[]) => boolean,
): ChangeResult {
  const found = sectionModel<{ table: Table<R> }>(doc, templateId, title);
  if (found === null) return addSection(doc, templateId, { table: appendRow(emptyTable<R>(), row) });
  if (found.readOnly) return fail(`Розділ «${title}» лише для читання; виправте його в Plain Editor.`);
  if (duplicate(rowsOf(found.model.table))) return fail('Рядок з такою назвою вже є.');
  return updateSection(doc, found.index, { table: appendRow(found.model.table, row) });
}

export function applyAction(doc: BudgetDocument, action: DocAction): ChangeResult {
  switch (action.type) {
    case 'createMonth': {
      if (findSection(doc, 'month', action.key) !== -1) return fail(`Місяць ${action.key} уже існує.`);
      const model = monthFromTemplate(doc, action.key);
      return typeof model === 'string' ? fail(model) : addSection(doc, 'month', model);
    }
    case 'addMonthRow':
      return addMonthRow(doc, action.monthKey, action.table, action.row);
    case 'payPending':
      return payPending(doc, action);
    case 'ledgerOp':
      return ledgerOp(doc, action);
    case 'addFixed': {
      const key = normalizeTitle(action.row.name);
      return addTemplateRow(doc, 'fixed', FIXED_TITLE, action.row, (rows) =>
        rows.some((r) => normalizeTitle(r.name) === key),
      );
    }
    case 'addPlanned': {
      const key = normalizeTitle(action.row.name);
      return addTemplateRow(doc, 'planned', PLANNED_TITLE, action.row, (rows) =>
        rows.some((r) => normalizeTitle(r.name) === key && r.month === action.row.month),
      );
    }
  }
}

function fixedRows(doc: BudgetDocument): FixedRow[] {
  const found = sectionModel<FixedModel>(doc, 'fixed', FIXED_TITLE);
  return found === null ? [] : rowsOf(found.model.table);
}

export function docContext(doc: BudgetDocument, lastCur: DocContext['lastCur']): DocContext {
  return {
    monthKeys: sectionsOf(doc, 'month').map(({ block }) => (block.model as MonthModel).key),
    debtNames: sectionsOf(doc, 'debt').map(({ block }) => (block.model as DebtModel).name),
    savingsNames: sectionsOf(doc, 'savings').map(({ block }) => (block.model as SavingsModel).name),
    fixed: fixedRows(doc),
    lastCur,
  };
}
