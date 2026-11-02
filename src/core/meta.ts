/**
 * Note metadata in appData under the plugin key (docs/SPEC.md 5.4).
 * UI conveniences only; losing it never affects the data.
 */
import type { JsonValue } from '../bridge';
import { isCurrency } from './money';

export type Tab = 'overview' | 'debts' | 'months' | 'savings' | 'planning' | 'other';

export interface NoteMeta {
  readonly v: 1;
  /** Last used currency for new expenses / income (docs/SPEC.md 4.3). */
  readonly lastCur: { readonly exp: string; readonly inc: string };
  readonly ui: {
    readonly tab: Tab;
    /** Expanded cards, e.g. "debt:Позика", "month:2026-10". */
    readonly open: readonly string[];
  };
  /** Keys this plugin version does not use, kept as they were. */
  readonly rest: Readonly<Record<string, JsonValue>>;
}

export const TABS: readonly Tab[] = ['overview', 'debts', 'months', 'savings', 'planning', 'other'];
const MAX_OPEN = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const DEFAULT_META: NoteMeta = {
  v: 1,
  lastCur: { exp: 'UAH', inc: 'UAH' },
  ui: { tab: 'overview', open: [] },
  rest: {},
};

const currencyOr = (value: unknown, fallback: string) =>
  typeof value === 'string' && isCurrency(value) ? value : fallback;

export function readMeta(value: unknown): NoteMeta {
  if (!isRecord(value)) return DEFAULT_META;
  const ui = isRecord(value['ui']) ? value['ui'] : {};
  const tabValue = ui['tab'];
  const tab = TABS.find((t) => t === tabValue) ?? DEFAULT_META.ui.tab;
  const openValue = ui['open'];
  const open = Array.isArray(openValue)
    ? openValue.filter((v): v is string => typeof v === 'string' && v.length <= 200).slice(0, MAX_OPEN)
    : [];
  const last = isRecord(value['lastCur']) ? value['lastCur'] : {};
  const lastCur = { exp: currencyOr(last['exp'], 'UAH'), inc: currencyOr(last['inc'], 'UAH') };
  const rest: Record<string, JsonValue> = {};
  for (const [key, v] of Object.entries(value)) {
    if (key !== 'v' && key !== 'ui' && key !== 'lastCur') rest[key] = v as JsonValue;
  }
  return { v: 1, lastCur, ui: { tab, open }, rest };
}

export function writeMeta(meta: NoteMeta): JsonValue {
  return {
    ...meta.rest,
    v: 1,
    lastCur: { exp: meta.lastCur.exp, inc: meta.lastCur.inc },
    ui: { tab: meta.ui.tab, open: [...meta.ui.open] },
  };
}
