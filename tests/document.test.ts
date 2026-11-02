import { describe, expect, it } from 'vitest';
import {
  addSection,
  findSection,
  parseDocument,
  sectionsOf,
  serializeDocument,
  skeletonText,
  unknownBlocks,
  updateSection,
  type BudgetDocument,
} from '../src/core/document';
import { debtStats, type DebtModel } from '../src/templates/debts';
import { savingsStats, type SavingsModel } from '../src/templates/savings';
import { appendOperation, type Operation } from '../src/templates/shared/ledger';
import canonical from './fixtures/canonical.md?raw';
import handwritten from './fixtures/handwritten.md?raw';

const allDirty = (doc: BudgetDocument): BudgetDocument => ({
  ...doc,
  blocks: doc.blocks.map((b) => (b.kind === 'section' && !b.readOnly ? { ...b, dirty: true } : b)),
});

const op = (patch: Partial<Operation> = {}): Operation => ({
  date: '2026-11-01',
  amount: 100000,
  currency: 'UAH',
  uah: 100000,
  comment: 'тест',
  extra: [],
  ...patch,
});

const crlf = (text: string) => text.replace(/\n/g, '\r\n');

describe('byte-for-byte preservation (SPEC 5.3, 7.2)', () => {
  it('writes an untouched document back exactly', () => {
    for (const text of [handwritten, canonical, crlf(handwritten), `${handwritten}без кінця рядка`]) {
      expect(serializeDocument(parseDocument(text))).toBe(text);
    }
  });

  it('canonical text is stable when every section is rewritten', () => {
    expect(serializeDocument(allDirty(parseDocument(canonical)))).toBe(canonical);
    expect(serializeDocument(allDirty(parseDocument(crlf(canonical))))).toBe(crlf(canonical));
  });

  it('hand-written text normalises to the canonical fixture', () => {
    expect(serializeDocument(allDirty(parseDocument(handwritten)))).toBe(canonical);
  });

  it('a change rewrites only the changed section', () => {
    const doc = parseDocument(handwritten);
    const index = findSection(doc, 'debt', 'Кредитка');
    const block = doc.blocks[index];
    if (block?.kind !== 'section') throw new Error('section expected');
    const model = block.model as DebtModel;
    const result = updateSection(doc, index, { ...model, ledger: appendOperation(model.ledger, op()) });
    if (!result.ok) throw new Error(result.error);
    const text = serializeDocument(result.doc);
    const start = handwritten.indexOf('### Кредитка');
    const end = handwritten.indexOf('### Нотатки без валюти');
    expect(text.slice(0, start)).toBe(handwritten.slice(0, start));
    expect(text.endsWith(handwritten.slice(end))).toBe(true);
    expect(text).toContain('| 2026-11-01 | 1000 | UAH |  1000 | тест           |');
    expect(text).toContain('_Залишок: 13000 UAH · сплачено: 7000 UAH · у грн: 7000 UAH_');
  });
});

describe('sections', () => {
  const doc = parseDocument(handwritten);

  it('recognises debts and savings, but not headings in code or without currency', () => {
    const debts = sectionsOf(doc, 'debt').map(({ block }) => (block.model as DebtModel).name);
    const savings = sectionsOf(doc, 'savings').map(({ block }) => (block.model as SavingsModel).name);
    expect(debts).toEqual(['Позика у Тараса', 'Кредитка']);
    expect(savings).toEqual(['Подушка', 'Відпустка']);
  });

  it('computes debt figures in minor units; bad rows stay as raw with an issue', () => {
    const [loan] = sectionsOf(doc, 'debt');
    const model = loan?.block.model as DebtModel;
    expect(debtStats(model)).toEqual({ paid: 40050, remaining: 109950, paidUah: 1660575, otherCurrencyOps: 0, progress: 26 });
    expect(model.ledger.rows.filter((r) => r.kind === 'raw')).toHaveLength(1);
    expect(loan?.block.issues).toEqual([expect.objectContaining({ line: 8, critical: false })]);
    expect(loan?.block.readOnly).toBe(false);
  });

  it('keeps extra columns and computes savings', () => {
    const [cushion, trip] = sectionsOf(doc, 'savings');
    const model = cushion?.block.model as SavingsModel;
    expect(model.ledger.extraHeaders).toEqual(['Де']);
    expect(savingsStats(model)).toMatchObject({ balance: 850000, progress: 17 });
    expect((trip?.block.model as SavingsModel).goal).toBeNull();
  });

  it('lists unknown content for the "Інше" tab', () => {
    const others = unknownBlocks(doc);
    expect(others.some((t) => t.includes('Вступний абзац'))).toBe(true);
    expect(others.some((t) => t.includes('### Нотатки без валюти'))).toBe(true);
    expect(others.some((t) => t.includes('## Мій розділ'))).toBe(true);
    expect(others.some((t) => t.startsWith('## Борги'))).toBe(false);
  });
});

describe('read-only sections (SPEC 7.2)', () => {
  const text = '# Б\n> budget v1\n\n## Борги\n\n### Дивний · UAH\nПочаткова сума: 100 UAH\nякийсь рядок\n\n## Накопичення\n';

  it('unknown lines make the section read-only and it is never rewritten', () => {
    const doc = parseDocument(text);
    const [debt] = sectionsOf(doc, 'debt');
    expect(debt?.block.readOnly).toBe(true);
    const result = updateSection(doc, debt?.index ?? -1, debt?.block.model);
    expect(result.ok).toBe(false);
    expect(serializeDocument(doc)).toBe(text);
  });

  it('a debt without its start line is read-only', () => {
    const doc = parseDocument('# Б\n> budget v1\n## Борги\n### Без старту · UAH\n');
    expect(sectionsOf(doc, 'debt')[0]?.block.readOnly).toBe(true);
  });
});

describe('format marker', () => {
  it('detects empty, missing and unsupported formats', () => {
    expect(parseDocument('').format).toEqual({ kind: 'empty' });
    expect(parseDocument(' \n').format).toEqual({ kind: 'empty' });
    expect(parseDocument('# Нотатка\nтекст').format).toEqual({ kind: 'missing' });
    expect(parseDocument('# Б\n> budget v2\n').format).toEqual({ kind: 'unsupported', version: 'v2' });
    expect(parseDocument(skeletonText(2026)).format).toEqual({ kind: 'ok' });
  });
});

describe('adding sections', () => {
  it('adds a debt at the end of the debts group', () => {
    const doc = parseDocument(handwritten);
    const model: DebtModel = { name: 'Нова', currency: 'EUR', start: 50000, ledger: { extraHeaders: [], rows: [] } };
    const result = addSection(doc, 'debt', model);
    if (!result.ok) throw new Error(result.error);
    const text = serializeDocument(result.doc);
    const expected =
      '### Нова · EUR\nПочаткова сума: 500 EUR\n_Залишок: 500 EUR · сплачено: 0 EUR · у грн: 0 UAH_\n' +
      '| Дата | Сума | Вал | У грн | Коментар |\n| ---- | ---: | --- | ----: | -------- |\n\n## Накопичення';
    expect(text).toContain(`Просто текст під боргами.\n\n${expected}`);
    expect(text.replace(expected.slice(0, -'## Накопичення'.length), '')).toBe(handwritten);
    // The new section reads back as a valid debt.
    expect(sectionsOf(parseDocument(text), 'debt').map(({ block }) => (block.model as DebtModel).name)).toContain('Нова');
  });

  it('refuses duplicate names', () => {
    const doc = parseDocument(handwritten);
    const model: DebtModel = { name: 'кредитка', currency: 'UAH', start: 100, ledger: { extraHeaders: [], rows: [] } };
    expect(addSection(doc, 'debt', model)).toMatchObject({ ok: false });
  });

  it('creates the group when it is missing', () => {
    const doc = parseDocument('# Бюджет 2026\n> budget v1\n');
    const model: SavingsModel = { name: 'Ціль', currency: 'USD', goal: null, ledger: { extraHeaders: [], rows: [] } };
    const result = addSection(doc, 'savings', model);
    if (!result.ok) throw new Error(result.error);
    expect(serializeDocument(result.doc)).toBe(
      '# Бюджет 2026\n> budget v1\n\n## Накопичення\n\n### Ціль · USD\n_Баланс: 0 USD_\n' +
        '| Дата | Сума | Вал | У грн | Коментар |\n| ---- | ---: | --- | ----: | -------- |\n',
    );
  });

  it('starts from the skeleton of a new budget', () => {
    const doc = parseDocument(skeletonText(2026));
    const model: DebtModel = { name: 'Перший', currency: 'UAH', start: 100000, ledger: { extraHeaders: [], rows: [] } };
    const result = addSection(doc, 'debt', model);
    if (!result.ok) throw new Error(result.error);
    const text = serializeDocument(result.doc);
    expect(text.startsWith('# Бюджет 2026\n> формат: budget v1')).toBe(true);
    expect(text).toContain('## Борги\n\n### Перший · UAH\n');
    expect(text).toContain('| ---- | ---: | --- | ----: | -------- |\n\n## Накопичення\n');
  });
});

describe('docs/SAMPLE.md', () => {
  it('the sample note is a valid budget v1 note without issues', async () => {
    const { default: sample } = await import('../docs/SAMPLE.md?raw');
    const block = /```markdown\n([\s\S]*?)```/.exec(sample)?.[1] ?? '';
    const doc = parseDocument(block);
    expect(doc.format).toEqual({ kind: 'ok' });
    expect(sectionsOf(doc, 'debt')).toHaveLength(2);
    expect(sectionsOf(doc, 'savings')).toHaveLength(1);
    expect(doc.blocks.flatMap((b) => (b.kind === 'section' ? b.issues : []))).toEqual([]);
    expect(unknownBlocks(doc)).toEqual([]);
  });
});
