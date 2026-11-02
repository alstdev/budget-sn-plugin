import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/actions';
import { parseDocument, sectionsOf, serializeDocument, unknownBlocks, updateSection } from '../src/core/document';
import { consistencyIssues } from '../src/core/validate';
import type { CustomTableModel } from '../src/templates/customTable/model';
import { parseColumnsInput } from '../src/templates/customTable/model';
import months from './fixtures/months.md?raw';

const BASE = '<!-- FICTIONAL TEST DATA -->\n# Бюджет 2026\n> формат: budget v1\n\n## Борги\n';

describe('custom table (SPEC 4.8)', () => {
  const text = `${BASE}\n## Підписки\n| Сервіс | Ціна | Дата |\n|---|--:|---|\n| Музика | 99 | 05 |\n| Відео \\| HD | 199 |\n\n## Нотатки\nтекст і таблиця\n| a | b |\n|---|---|\n`;

  it('recognises a "## " section that is exactly one table; mixed content stays unknown', () => {
    const doc = parseDocument(text);
    const tables = sectionsOf(doc, 'table').map(({ block }) => block.model as CustomTableModel);
    expect(tables.map((t) => t.title)).toEqual(['Підписки']);
    expect(tables[0]?.columns).toEqual(['Сервіс', 'Ціна', 'Дата']);
    expect(tables[0]?.align).toEqual(['left', 'right', 'left']);
    expect(tables[0]?.rows).toEqual([
      { kind: 'row', cells: ['Музика', '99', '05'] },
      { kind: 'row', cells: ['Відео | HD', '199', ''] },
    ]);
    expect(unknownBlocks(doc).some((t) => t.startsWith('## Нотатки'))).toBe(true);
    expect(serializeDocument(doc)).toBe(text);
  });

  it('adding a row rewrites only that table', () => {
    const doc = parseDocument(text);
    const [{ block, index } = { block: null, index: -1 }] = sectionsOf(doc, 'table');
    const model = block?.model as CustomTableModel;
    const result = updateSection(doc, index, { ...model, rows: [...model.rows, { kind: 'row', cells: ['Хмара', '50', '10'] }] });
    if (!result.ok) throw new Error(result.error);
    const out = serializeDocument(result.doc);
    expect(out).toContain(
      '## Підписки\n| Сервіс      | Ціна | Дата |\n| ----------- | ---: | ---- |\n| Музика      |   99 | 05   |\n| Відео \\| HD |  199 |      |\n| Хмара       |   50 | 10   |\n\n## Нотатки',
    );
    expect(out.startsWith(BASE)).toBe(true);
    expect(out.endsWith('## Нотатки\nтекст і таблиця\n| a | b |\n|---|---|\n')).toBe(true);
  });

  it('is created at the end; names must be unique and not reserved', () => {
    const doc = parseDocument(BASE);
    const result = applyAction(doc, { type: 'addTable', title: 'Підписки', columns: ['Сервіс', 'Ціна'] });
    if (!result.ok) throw new Error(result.error);
    expect(serializeDocument(result.doc)).toBe(`${BASE}\n## Підписки\n| Сервіс | Ціна |\n| ------ | ---- |\n`);
    expect(applyAction(result.doc, { type: 'addTable', title: 'підписки', columns: ['x'] })).toMatchObject({ ok: false });
    expect(applyAction(doc, { type: 'addTable', title: 'Борги', columns: ['x'] })).toMatchObject({ ok: false });
  });

  it('validates the title and columns typed in the UI', () => {
    expect(parseColumnsInput(' Т ', 'a, b ,c')).toEqual({ title: 'Т', columns: ['a', 'b', 'c'] });
    expect(typeof parseColumnsInput('', 'a')).toBe('string');
    expect(typeof parseColumnsInput('Т', ' , ')).toBe('string');
    expect(typeof parseColumnsInput('Т', 'a, A')).toBe('string');
    expect(typeof parseColumnsInput('Т', 'a|b')).toBe('string');
  });
});

describe('consistency check (SPEC 4.6)', () => {
  it('matching rows produce no warnings', () => {
    expect(consistencyIssues(parseDocument(months)).size).toBe(0);
  });

  it('warns about a debt payment without a month row and vice versa', () => {
    let doc = parseDocument(months);
    const op = { date: '2026-10-25', amount: 100000, currency: 'UAH', uah: 100000, comment: '', extra: [] };
    const r1 = applyAction(doc, { type: 'ledgerOp', templateId: 'debt', name: 'Кредитка', op, mirror: false });
    if (!r1.ok) throw new Error(r1.error);
    doc = r1.doc;
    const row = { date: '2026-10-26', name: 'Подушка', amount: 50000, currency: 'UAH', uah: 50000, type: 'накоп.', comment: '' };
    const r2 = applyAction(doc, { type: 'addMonthRow', monthKey: '2026-10', table: 'expenses', row });
    if (!r2.ok) throw new Error(r2.error);
    const issues = consistencyIssues(r2.doc);
    expect(issues.get('debt:Кредитка')?.map((i) => i.message)).toEqual(['2026-10-25 1000 UAH: немає рядка у витратах місяця 2026-10.']);
    expect(issues.get('month:2026-10')?.map((i) => i.message)).toEqual([
      '2026-10-26 «Подушка» 500 UAH: немає такого ж запису в розділі «Подушка».',
    ]);
    expect([...issues.values()].flat().every((i) => !i.critical)).toBe(true);
  });

  it('payments in months that do not exist in the note are not flagged', () => {
    const doc = parseDocument(months);
    const op = { date: '2026-08-01', amount: 100000, currency: 'UAH', uah: 100000, comment: '', extra: [] };
    const r = applyAction(doc, { type: 'ledgerOp', templateId: 'debt', name: 'Кредитка', op, mirror: false });
    if (!r.ok) throw new Error(r.error);
    expect(consistencyIssues(r.doc).size).toBe(0);
  });
});
