/**
 * Money as integers in minor units (2 decimal places: kopiyky, cents).
 * No floating point anywhere in calculations (docs/SPEC.md 5.1, CLAUDE.md 4).
 */

/** Amount in minor units (1/100 of the currency unit). Always a safe integer. */
export type Minor = number;

const CURRENCY_RE = /^[A-Z]{3}$/;

export function isCurrency(value: string): boolean {
  return CURRENCY_RE.test(value);
}

/**
 * Parses an amount written in the note or typed in a form.
 * Accepts a decimal point or comma, spaces (incl. no-break spaces) between
 * digits, a leading "-" or "−" and up to 2 decimals. Returns null otherwise.
 */
export function parseAmount(raw: string): Minor | null {
  let s = raw.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (s === '') return null;
  let negative = false;
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true;
    s = s.slice(1);
  }
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (match === null) return null;
  const whole = match[1] ?? '';
  const frac = (match[2] ?? '').padEnd(2, '0');
  const digits = `${whole}${frac}`.replace(/^0+(?=\d)/, '');
  if (digits.length > 15) return null;
  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return null;
  return negative && value !== 0 ? -value : value;
}

/** Canonical form for the note: "6000", "6000.50", "-12.05" (dot, no separators). */
export function formatAmount(value: Minor): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const cents = abs % 100;
  const whole = (abs - cents) / 100; // exact: divisible by 100
  return cents === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(cents).padStart(2, '0')}`;
}

const SYMBOLS: Readonly<Record<string, string>> = { UAH: '₴', USD: '$', EUR: '€' };

/** Display form (uk-UA): "60 000", "1 234,50"; built from integers only. */
export function formatAmountUi(value: Minor): string {
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  const cents = abs % 100;
  const whole = String((abs - cents) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return cents === 0 ? `${sign}${whole}` : `${sign}${whole},${String(cents).padStart(2, '0')}`;
}

export function formatMoneyUi(value: Minor, currency: string): string {
  return `${formatAmountUi(value)}\u00a0${SYMBOLS[currency] ?? currency}`;
}

/** Sum of minor amounts; throws if the total leaves the safe integer range. */
export function sum(values: readonly Minor[]): Minor {
  let total = 0;
  for (const v of values) {
    total += v;
    if (!Number.isSafeInteger(total)) throw new RangeError('amount overflow');
  }
  return total;
}

/** Integer percentage floor(part * 100 / whole); null when whole <= 0. */
export function percent(part: Minor, whole: Minor): number | null {
  if (whole <= 0) return null;
  return Number((BigInt(part) * 100n) / BigInt(whole));
}

/**
 * Reference exchange rate "UAH per unit" for display only, with 4 decimals,
 * computed with integers: uah / amount. Never stored (docs/SPEC.md 4.2).
 */
export function rateUi(amount: Minor, uah: Minor): string | null {
  if (amount === 0) return null;
  const scaled = (BigInt(Math.abs(uah)) * 10000n) / BigInt(Math.abs(amount));
  const whole = scaled / 10000n;
  const frac = String(scaled % 10000n).padStart(4, '0');
  return `${String(whole)},${frac}`;
}
