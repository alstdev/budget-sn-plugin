import { describe, expect, it } from 'vitest';
import { applyAction, docContext, monthFromTemplate, type DocAction } from '../src/actions';
import {
  findSection,
  parseDocument,
  sectionsOf,
  serializeDocument,
  type BudgetDocument,
} from '../src/core/document';
import { debtStats, type DebtModel } from '../src/templates/debts';
import { daysInMonth, monthStats, nextMonthKey, type MonthModel, type MonthRow } from '../src/templates/months/model';
import type { PlannedModel } from '../src/templates/monthTemplate/model';
import type { SavingsModel } from '../src/templates/savings';
import { rowsOf } from '../src/templates/shared/typedTable';
import { buildPreview, overview } from '../src/ui/overview';
import canonical from './fixtures/months-canonical.md?raw';
import handwritten from './fixtures/months.md?raw';

const allDirty = (doc: BudgetDocument): BudgetDocument => ({
  ...doc,
  blocks: doc.blocks.map((b) => (b.kind === 'section' && !b.readOnly ? { ...b, dirty: true } : b)),
});
const crlf = (text: string) => text.replace(/\n/g, '\r\n');

interface Models {
  debt: DebtModel;
  month: MonthModel;
  savings: SavingsModel;
  planned: PlannedModel;
}

function model<K extends keyof Models>(doc: BudgetDocument, templateId: K, name: string): Models[K] {
  const block = doc.blocks[findSection(doc, templateId, name)];
  if (block?.kind !== 'section') throw new Error(`${templateId} ${name} not found`);
  return block.model as Models[K];
}

function apply(doc: BudgetDocument, action: DocAction): BudgetDocument {
  const result = applyAction(doc, action);
  if (!result.ok) throw new Error(result.error);
  // What the plugin saves is what it reads next time.
  return parseDocument(serializeDocument(result.doc));
}

const paid = (patch: Partial<MonthRow>): MonthRow => ({
  date: '2026-10-25',
  name: 'Інтернет',
  amount: 30000,
  currency: 'UAH',
  uah: 30000,
  type: 'пост',
  comment: '',
  ...patch,
});

describe('months and month template: preservation', () => {
  it('untouched text is written back byte for byte', () => {
    for (const text of [handwritten, canonical, crlf(handwritten)]) {
      expect(serializeDocument(parseDocument(text))).toBe(text);
    }
  });

  it('canonical text is stable and hand-written text normalises to it', () => {
    expect(serializeDocument(allDirty(parseDocument(canonical)))).toBe(canonical);
    expect(serializeDocument(allDirty(parseDocument(handwritten)))).toBe(canonical);
  });

  it('recognises all sections; bad rows stay verbatim', () => {
    const doc = parseDocument(handwritten);
    expect(['debt', 'month', 'savings', 'fixed', 'planned'].map((id) => sectionsOf(doc, id).length)).toEqual([1, 1, 1, 1, 1]);
    const month = sectionsOf(doc, 'month')[0]?.block;
    expect(month?.readOnly).toBe(false);
    expect(month?.issues).toEqual([expect.objectContaining({ critical: false })]);
    expect(canonical).toContain('| вчора | Кава | 80 | UAH | 80 | разова | |');
  });
});

describe('month totals (SPEC 4.2: only "У грн" is summed)', () => {
  it('computes income, spending, balance and pending', () => {
    const m = model(parseDocument(handwritten), 'month', '2026-10');
    expect(monthStats(m)).toEqual({
      incomeUah: 5245000,
      spentUah: 2325000,
      balance: 2920000,
      pendingUah: 30000,
      afterPending: 2890000,
      pendingOther: [['USD', 1000]],
      pendingCount: 2,
    });
  });

  it('knows month lengths and the next month', () => {
    expect([daysInMonth('2026-02'), daysInMonth('2028-02'), daysInMonth('2026-11'), daysInMonth('2026-12')]).toEqual([28, 29, 30, 31]);
    expect(nextMonthKey('2026-12')).toBe('2027-01');
  });
});

describe('create month from template (SPEC 4.7)', () => {
  const doc = parseDocument(handwritten);

  it('copies fixed expenses and planned purchases of that month as pending rows', () => {
    const next = apply(doc, { type: 'createMonth', key: '2026-11' });
    const m = model(next, 'month', '2026-11');
    expect(m.title).toBe('Листопад');
    expect(rowsOf(m.expenses).map((r) => [r.date, r.name, r.amount, r.currency, r.uah, r.type, r.comment])).toEqual([
      [null, 'Оренда', 1500000, 'UAH', null, 'пост', 'до 03.11'],
      [null, 'Інтернет', 30000, 'UAH', null, 'пост', 'до 30.11'],
      [null, 'Кредитка', 600000, 'UAH', null, 'пост', 'до 05.11'],
      [null, 'Подушка', 200000, 'UAH', null, 'пост', 'до 10.11'],
      [null, 'Ноутбук', 120000, 'USD', null, 'план', ''],
    ]);
    const text = serializeDocument(next);
    expect(text.indexOf('### 2026-11 Листопад')).toBeGreaterThan(text.indexOf('### 2026-10 Жовтень'));
    expect(text.indexOf('### 2026-11 Листопад')).toBeLessThan(text.indexOf('## Накопичення'));
    // Everything before the new month is unchanged.
    expect(text.startsWith(handwritten.slice(0, handwritten.indexOf('## Накопичення')))).toBe(true);
  });

  it('clamps the due day to the last day of the month', () => {
    const feb = monthFromTemplate(doc, '2027-02');
    const leap = monthFromTemplate(doc, '2028-02');
    if (typeof feb === 'string' || typeof leap === 'string') throw new Error('month expected');
    expect(rowsOf(feb.expenses)[1]?.comment).toBe('до 28.02');
    expect(rowsOf(leap.expenses)[1]?.comment).toBe('до 29.02');
  });

  it('refuses to create an existing month', () => {
    expect(applyAction(doc, { type: 'createMonth', key: '2026-10' })).toMatchObject({ ok: false });
  });
});

describe('pay a pending row', () => {
  it('turns the row into a normal one; nothing else changes', () => {
    const doc = parseDocument(handwritten);
    const next = applyAction(doc, { type: 'payPending', monthKey: '2026-10', rowIndex: 2, expectName: 'Інтернет', row: paid({}), link: true });
    if (!next.ok) throw new Error(next.error);
    const text = serializeDocument(next.doc);
    expect(text).toContain('| 2026-10-25 | Інтернет  |   300 | UAH |   300 | пост  |               |');
    expect(text.startsWith(handwritten.slice(0, handwritten.indexOf('## Місяці')))).toBe(true);
    expect(text.endsWith(handwritten.slice(handwritten.indexOf('## Накопичення')))).toBe(true);
  });

  it('adds the payment to the linked debt (SPEC 4.7)', () => {
    let doc = apply(parseDocument(handwritten), { type: 'createMonth', key: '2026-11' });
    doc = apply(doc, {
      type: 'payPending',
      monthKey: '2026-11',
      rowIndex: 2,
      expectName: 'Кредитка',
      row: paid({ date: '2026-11-05', name: 'Кредитка', amount: 600000, uah: 600000 }),
      link: true,
    });
    expect(debtStats(model(doc, 'debt', 'Кредитка')).remaining).toBe(800000);
    expect(rowsOf(model(doc, 'month', '2026-11').expenses)[2]?.date).toBe('2026-11-05');
  });

  it('without the checkbox only the month row changes', () => {
    let doc = apply(parseDocument(handwritten), { type: 'createMonth', key: '2026-11' });
    doc = apply(doc, {
      type: 'payPending',
      monthKey: '2026-11',
      rowIndex: 3,
      expectName: 'Подушка',
      row: paid({ date: '2026-11-10', name: 'Подушка', amount: 200000, uah: 200000 }),
      link: false,
    });
    expect(model(doc, 'savings', 'Подушка').ledger.rows).toEqual([]);
  });

  it('marks the planned purchase as bought', () => {
    let doc = apply(parseDocument(handwritten), { type: 'createMonth', key: '2026-11' });
    doc = apply(doc, {
      type: 'payPending',
      monthKey: '2026-11',
      rowIndex: 4,
      expectName: 'Ноутбук',
      row: paid({ date: '2026-11-21', name: 'Ноутбук', amount: 115000, currency: 'USD', uah: 4800000, type: 'план' }),
      link: true,
    });
    const statuses = rowsOf(model(doc, 'planned', 'Заплановані покупки').table).map((r) => r.status);
    expect(statuses).toEqual(['куплено 21.11', 'скасовано', 'заплановано']);
  });

  it('refuses when the row changed meanwhile', () => {
    const doc = parseDocument(handwritten);
    expect(
      applyAction(doc, { type: 'payPending', monthKey: '2026-10', rowIndex: 2, expectName: 'Хостинг', row: paid({}), link: true }),
    ).toMatchObject({ ok: false });
    expect(
      applyAction(doc, { type: 'payPending', monthKey: '2026-10', rowIndex: 0, expectName: 'Оренда', row: paid({}), link: true }),
    ).toMatchObject({ ok: false });
  });
});

describe('debt payment also recorded in month expenses (SPEC 4.6)', () => {
  const op = { date: '2026-10-25', amount: 100000, currency: 'UAH', uah: 100000, comment: 'достроково', extra: [] };

  it('writes two rows in one change', () => {
    const doc = apply(parseDocument(handwritten), { type: 'ledgerOp', templateId: 'debt', name: 'Кредитка', op, mirror: true });
    expect(debtStats(model(doc, 'debt', 'Кредитка')).remaining).toBe(1300000);
    const last = rowsOf(model(doc, 'month', '2026-10').expenses).at(-1);
    expect(last).toEqual({ date: '2026-10-25', name: 'Кредитка', amount: 100000, currency: 'UAH', uah: 100000, type: 'борг', comment: 'достроково' });
  });

  it('fails as a whole when the month is missing or the amount is negative', () => {
    const doc = parseDocument(handwritten);
    expect(applyAction(doc, { type: 'ledgerOp', templateId: 'debt', name: 'Кредитка', op: { ...op, date: '2026-12-01' }, mirror: true })).toMatchObject({ ok: false });
    expect(applyAction(doc, { type: 'ledgerOp', templateId: 'debt', name: 'Кредитка', op: { ...op, amount: -100 }, mirror: true })).toMatchObject({ ok: false });
  });

  it('savings deposit uses type "накоп."', () => {
    const doc = apply(parseDocument(handwritten), { type: 'ledgerOp', templateId: 'savings', name: 'Подушка', op, mirror: true });
    expect(rowsOf(model(doc, 'month', '2026-10').expenses).at(-1)?.type).toBe('накоп.');
  });
});

describe('month template rows', () => {
  it('adds a fixed expense; refuses duplicates', () => {
    const doc = parseDocument(handwritten);
    const row = { name: 'Спортзал', amount: 80000, currency: 'UAH', day: 1, link: { kind: 'none' } } as const;
    const next = apply(doc, { type: 'addFixed', row });
    expect(docContext(next, { exp: 'UAH', inc: 'UAH' }).fixed.map((f) => f.name)).toContain('Спортзал');
    expect(applyAction(next, { type: 'addFixed', row: { ...row, name: 'спортзал' } })).toMatchObject({ ok: false });
  });

  it('creates the template group when it is missing', () => {
    const doc = parseDocument('# Бюджет\n> budget v1\n\n## Борги\n');
    const next = applyAction(doc, {
      type: 'addPlanned',
      row: { name: 'Велосипед', budget: 1500000, currency: 'UAH', month: '2026-12', perMonth: '', status: 'заплановано' },
    });
    if (!next.ok) throw new Error(next.error);
    expect(serializeDocument(next.doc)).toBe(
      '# Бюджет\n> budget v1\n\n## Борги\n\n## Шаблон місяця\n\n### Заплановані покупки\n' +
        '| Назва     | Бюджет | Вал | Місяць  | На місяць | Статус      |\n' +
        '| --------- | -----: | --- | ------- | --------- | ----------- |\n' +
        '| Велосипед |  15000 | UAH | 2026-12 |           | заплановано |\n',
    );
  });
});

describe('overview and preview (SPEC 4.1, 6.4)', () => {
  it('summarises the current month', () => {
    const doc = parseDocument(handwritten);
    const o = overview(doc, new Date(2026, 9, 20));
    expect(o.month?.key).toBe('2026-10');
    expect(o.pending.map((r) => r.name)).toEqual(['Інтернет', 'Хостинг']);
    expect(o.planned.map((r) => r.name)).toEqual(['Ноутбук', 'Телефон']);
    expect(buildPreview(doc, new Date(2026, 9, 20))).toBe(
      'Борги: 14 000 ₴ · Жовтень: залишок 29 200 ₴ · Накопичення: 0 ₴',
    );
  });
});
