/**
 * Shared part of the "Борг" and "Накопичення" sections (docs/SPEC.md 5.2):
 *
 *   ### <Назва> · <ВАЛ>
 *   <Ключ>: <число> <ВАЛ>
 *   _<розрахункове>_
 *   | Дата | Сума | Вал | У грн | Коментар |
 */
import { normalizeTitle, type Heading } from '../../core/md/lines';
import {
  formatTable,
  isSeparatorRow,
  isTableLine,
  normalizeHeader,
  splitRow,
  type Align,
  type TableRow,
} from '../../core/md/table';
import { formatAmount, isCurrency, parseAmount, type Minor } from '../../core/money';
import type { Issue, MdBlock } from '../../core/template';

export const OP_COLUMNS = ['Дата', 'Сума', 'Вал', 'У грн', 'Коментар'] as const;
const OP_ALIGN: readonly Align[] = ['left', 'right', 'left', 'right', 'left'];
const OP_KEYS = OP_COLUMNS.map(normalizeHeader);

export interface Operation {
  readonly date: string;
  readonly amount: Minor;
  readonly currency: string;
  readonly uah: Minor;
  readonly comment: string;
  /** Cells of unknown extra columns, kept as they were. */
  readonly extra: readonly string[];
}

export type LedgerRow =
  | { readonly kind: 'op'; readonly op: Operation }
  | { readonly kind: 'raw'; readonly text: string; readonly reason: string };

export interface Ledger {
  readonly extraHeaders: readonly string[];
  readonly rows: readonly LedgerRow[];
}

export const EMPTY_LEDGER: Ledger = { extraHeaders: [], rows: [] };

export function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "Назва · USD" → name and currency; null if the heading does not fit. */
export function parseNameCurrency(text: string): { name: string; currency: string } | null {
  const match = /^(.*\S)\s*·\s*([A-Z]{3})$/.exec(text.trim());
  if (match === null) return null;
  return { name: match[1] ?? '', currency: match[2] ?? '' };
}

export function matchesLedgerHeading(heading: Heading, parent: Heading | undefined, parentHeading: string): boolean {
  return (
    heading.level === 3 &&
    parent !== undefined &&
    parent.level === 2 &&
    normalizeTitle(parent.text) === normalizeTitle(parentHeading) &&
    parseNameCurrency(heading.text) !== null
  );
}

/** Validates a section name typed in the UI. */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Вкажіть назву.';
  if (trimmed.length > 80) return 'Назва довша за 80 символів.';
  if (/[\r\n#|·]/.test(trimmed)) return 'Назва не може містити символи # | · і переводи рядка.';
  return null;
}

export interface OperationInput {
  readonly date: string;
  readonly amount: string;
  readonly currency: string;
  readonly uah: string;
  readonly comment: string;
}

/** Form input → operation (docs/SPEC.md 4.2), or an error text. */
export function validateOperation(input: OperationInput, sign: 1 | -1 = 1): Operation | string {
  if (!isValidDate(input.date)) return 'Дата має бути у форматі РРРР-ММ-ДД.';
  const amount = parseAmount(input.amount);
  if (amount === null || amount === 0) return 'Сума: число, до двох знаків після коми.';
  const currency = input.currency.trim().toUpperCase();
  if (!isCurrency(currency)) return 'Валюта: три латинські літери (ISO 4217).';
  let uah: Minor | null;
  if (currency === 'UAH') {
    uah = amount;
  } else {
    uah = parseAmount(input.uah);
    if (uah === null) return 'Для валюти, відмінної від UAH, вкажіть суму в грн.';
  }
  const comment = input.comment.replace(/[\r\n]+/g, ' ').trim();
  if (comment.length > 200) return 'Коментар довший за 200 символів.';
  return {
    date: input.date,
    amount: amount * sign,
    currency,
    uah: Math.abs(uah) * Math.sign(amount * sign),
    comment,
    extra: [],
  };
}

function parseRow(cells: readonly string[], extraCount: number): Operation | string {
  if (cells.length > OP_COLUMNS.length + extraCount) return 'зайві клітинки';
  const [date = '', amountText = '', currencyText = '', uahText = '', comment = ''] = cells;
  if (!isValidDate(date)) return 'дата не у форматі РРРР-ММ-ДД';
  const amount = parseAmount(amountText);
  if (amount === null) return 'сума не розібрана';
  const currency = currencyText.trim().toUpperCase();
  if (!isCurrency(currency)) return 'валюта не розібрана';
  let uah: Minor | null;
  if (uahText.trim() === '') {
    if (currency !== 'UAH') return 'немає суми в грн для валюти, відмінної від UAH';
    uah = amount;
  } else {
    uah = parseAmount(uahText);
    if (uah === null) return 'сума в грн не розібрана';
  }
  const extra = cells.slice(OP_COLUMNS.length);
  while (extra.length < extraCount) extra.push('');
  return { date, amount, currency, uah, comment, extra };
}

export interface ParsedLedgerSection {
  readonly name: string;
  readonly currency: string;
  readonly key: Minor | null;
  readonly ledger: Ledger;
  readonly issues: Issue[];
}

/** Parses heading, the key line ("Початкова сума" / "Ціль") and the table. */
export function parseLedgerSection(block: MdBlock, keyLabel: string): ParsedLedgerSection {
  const issues: Issue[] = [];
  const nc = parseNameCurrency(block.heading.text);
  const name = nc?.name ?? block.heading.text;
  const currency = nc?.currency ?? '';
  let key: Minor | null = null;
  let keySeen = false;
  let ledger: Ledger = EMPTY_LEDGER;
  let tableSeen = false;
  const keyRe = new RegExp(`^${keyLabel}:\\s*(.+?)\\s+([A-Za-z]{3})\\s*$`, 'i');
  const lines = block.lines;

  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i] ?? '';
    const trimmed = text.trim();
    const lineNo = i + 1;
    if (trimmed === '') continue;
    if (/^_.*_$/.test(trimmed)) continue; // computed line, rewritten on save

    const keyMatch = keyRe.exec(trimmed);
    if (keyMatch !== null && !tableSeen) {
      const amount = parseAmount(keyMatch[1] ?? '');
      const keyCurrency = (keyMatch[2] ?? '').toUpperCase();
      if (keySeen) {
        issues.push({ line: lineNo, message: `Рядок «${keyLabel}» повторюється.`, critical: true });
      } else if (amount === null) {
        issues.push({ line: lineNo, message: `«${keyLabel}»: сума не розібрана.`, critical: true });
      } else if (keyCurrency !== currency) {
        issues.push({ line: lineNo, message: `«${keyLabel}»: валюта не збігається з валютою розділу.`, critical: true });
      } else {
        key = amount;
      }
      keySeen = true;
      continue;
    }

    if (isTableLine(text)) {
      if (tableSeen) {
        issues.push({ line: lineNo, message: 'Друга таблиця в розділі.', critical: true });
        break;
      }
      tableSeen = true;
      const header = splitRow(text);
      const keys = header.map(normalizeHeader);
      const sep = lines[i + 1] ?? '';
      if (!isSeparatorRow(sep) || OP_KEYS.some((k, j) => keys[j] !== k)) {
        issues.push({
          line: lineNo,
          message: `Заголовок таблиці має бути: ${OP_COLUMNS.join(' | ')}.`,
          critical: true,
        });
        break;
      }
      const extraHeaders = header.slice(OP_COLUMNS.length);
      const rows: LedgerRow[] = [];
      let j = i + 2;
      for (; j < lines.length && isTableLine(lines[j] ?? ''); j += 1) {
        const rowText = lines[j] ?? '';
        const parsed = parseRow(splitRow(rowText), extraHeaders.length);
        if (typeof parsed === 'string') {
          rows.push({ kind: 'raw', text: rowText, reason: parsed });
          issues.push({ line: j + 1, message: `Рядок не розібрано (${parsed}); збережено як є.`, critical: false });
        } else {
          rows.push({ kind: 'op', op: parsed });
        }
      }
      ledger = { extraHeaders, rows };
      i = j - 1;
      continue;
    }

    issues.push({ line: lineNo, message: 'Нерозпізнаний рядок; розділ лише для читання.', critical: true });
  }

  return { name, currency, key, ledger, issues };
}

export function ledgerLines(ledger: Ledger): string[] {
  const header = [...OP_COLUMNS, ...ledger.extraHeaders];
  const align = [...OP_ALIGN, ...ledger.extraHeaders.map((): Align => 'left')];
  const rows: TableRow[] = ledger.rows.map((row) =>
    row.kind === 'raw'
      ? { raw: row.text }
      : [
          row.op.date,
          formatAmount(row.op.amount),
          row.op.currency,
          formatAmount(row.op.uah),
          row.op.comment,
          ...row.op.extra,
        ],
  );
  return formatTable(header, align, rows);
}

export function operations(ledger: Ledger): Operation[] {
  return ledger.rows.flatMap((row) => (row.kind === 'op' ? [row.op] : []));
}

export function appendOperation(ledger: Ledger, op: Operation): Ledger {
  const extra = ledger.extraHeaders.map(() => '');
  return { ...ledger, rows: [...ledger.rows, { kind: 'op', op: { ...op, extra } }] };
}
