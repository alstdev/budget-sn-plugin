import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatAmountUi,
  formatMoneyUi,
  isCurrency,
  parseAmount,
  percent,
  rateUi,
  sum,
} from '../src/core/money';

describe('parseAmount', () => {
  it('reads canonical and hand-written forms', () => {
    expect(parseAmount('6000')).toBe(600000);
    expect(parseAmount('6000.5')).toBe(600050);
    expect(parseAmount('6000,05')).toBe(600005);
    expect(parseAmount(' 1 500,00 ')).toBe(150000);
    expect(parseAmount('1 500')).toBe(150000);
    expect(parseAmount('-12.3')).toBe(-1230);
    expect(parseAmount('−12')).toBe(-1200);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('-0')).toBe(0);
  });

  it('rejects anything ambiguous', () => {
    for (const bad of ['', ' ', '1.234,5', '1,234.5', '1.234', '12a', '--1', '1e5', '.5', '5.', '+5', 'NaN']) {
      expect(parseAmount(bad)).toBeNull();
    }
    expect(parseAmount('9'.repeat(16))).toBeNull();
  });
});

describe('formatting', () => {
  it('writes the canonical form', () => {
    expect(formatAmount(600000)).toBe('6000');
    expect(formatAmount(600050)).toBe('6000.50');
    expect(formatAmount(-1205)).toBe('-12.05');
    expect(formatAmount(5)).toBe('0.05');
    expect(formatAmount(0)).toBe('0');
  });

  it('round-trips through parse', () => {
    for (const v of [0, 1, 99, 100, 123456789, -5, 900719925474099]) {
      expect(parseAmount(formatAmount(v))).toBe(v);
    }
  });

  it('formats for display in uk-UA style', () => {
    expect(formatAmountUi(6000000)).toBe('60 000');
    expect(formatAmountUi(123450)).toBe('1 234,50');
    expect(formatAmountUi(-500)).toBe('−5');
    expect(formatMoneyUi(50000, 'USD')).toBe('500 $');
    expect(formatMoneyUi(100, 'PLN')).toBe('1 PLN');
  });
});

describe('helpers', () => {
  it('validates currency codes', () => {
    expect(isCurrency('UAH')).toBe(true);
    expect(isCurrency('uah')).toBe(false);
    expect(isCurrency('US')).toBe(false);
  });

  it('sums integers and refuses overflow', () => {
    expect(sum([100, 250, -50])).toBe(300);
    expect(() => sum([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });

  it('computes integer percentages', () => {
    expect(percent(850000, 5000000)).toBe(17);
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 0)).toBeNull();
  });

  it('shows a reference rate without floats', () => {
    expect(rateUi(10000, 415000)).toBe('41,5000');
    expect(rateUi(30000, 1000000)).toBe('33,3333');
    expect(rateUi(0, 5)).toBeNull();
  });
});
