import { describe, expect, it } from 'vitest';
import { isValidDate, parseNameCurrency, validateName, validateOperation } from '../src/templates/shared/ledger';

const base = { date: '2026-10-05', amount: '100', currency: 'UAH', uah: '', comment: ' ok ' };

describe('operation form rules (SPEC 4.2)', () => {
  it('UAH: "У грн" equals the amount', () => {
    expect(validateOperation(base)).toEqual({
      date: '2026-10-05', amount: 10000, currency: 'UAH', uah: 10000, comment: 'ok', extra: [],
    });
  });

  it('other currency: "У грн" is required', () => {
    expect(validateOperation({ ...base, currency: 'USD' })).toBe('Для валюти, відмінної від UAH, вкажіть суму в грн.');
    expect(validateOperation({ ...base, currency: 'usd', uah: '4150' })).toMatchObject({ currency: 'USD', uah: 415000 });
  });

  it('withdrawal stores both amounts as negative', () => {
    expect(validateOperation({ ...base, currency: 'EUR', uah: '4500' }, -1)).toMatchObject({ amount: -10000, uah: -450000 });
  });

  it('negative payment (debt increase) keeps the sign of "У грн"', () => {
    expect(validateOperation({ ...base, amount: '-50', currency: 'USD', uah: '2075' })).toMatchObject({ amount: -5000, uah: -207500 });
  });

  it('rejects bad input', () => {
    expect(typeof validateOperation({ ...base, date: '2026-02-30' })).toBe('string');
    expect(typeof validateOperation({ ...base, amount: '0' })).toBe('string');
    expect(typeof validateOperation({ ...base, amount: '1,5,5' })).toBe('string');
    expect(typeof validateOperation({ ...base, currency: 'US' })).toBe('string');
  });

  it('flattens line breaks in comments', () => {
    expect(validateOperation({ ...base, comment: 'a\nb' })).toMatchObject({ comment: 'a b' });
  });
});

describe('names and headings', () => {
  it('splits "name · CUR" at the last separator', () => {
    expect(parseNameCurrency('Позика · Іван · USD')).toEqual({ name: 'Позика · Іван', currency: 'USD' });
    expect(parseNameCurrency('Без валюти')).toBeNull();
  });

  it('validates names typed in the UI', () => {
    expect(validateName('  Кредит  ')).toBeNull();
    for (const bad of ['', '   ', 'a|b', 'a · b', '# x', 'x'.repeat(81)]) expect(validateName(bad)).not.toBeNull();
  });

  it('checks real calendar dates', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-1-01')).toBe(false);
  });
});
