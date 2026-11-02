/**
 * Note metadata in appData under the plugin key (docs/SPEC.md 5.4).
 * UI conveniences only; losing it never affects the data.
 */
import type { JsonValue } from '../bridge';

export type Tab = 'debts' | 'savings' | 'other';

export interface NoteMeta {
  readonly v: 1;
  readonly ui: {
    readonly tab: Tab;
    /** Expanded cards, e.g. "debt:Позика". */
    readonly open: readonly string[];
  };
  /** Keys this plugin version does not use, kept as they were. */
  readonly rest: Readonly<Record<string, JsonValue>>;
}

const TABS: readonly Tab[] = ['debts', 'savings', 'other'];
const MAX_OPEN = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const DEFAULT_META: NoteMeta = { v: 1, ui: { tab: 'debts', open: [] }, rest: {} };

export function readMeta(value: unknown): NoteMeta {
  if (!isRecord(value)) return DEFAULT_META;
  const ui = isRecord(value['ui']) ? value['ui'] : {};
  const tabValue = ui['tab'];
  const tab = TABS.find((t) => t === tabValue) ?? 'debts';
  const openValue = ui['open'];
  const open = Array.isArray(openValue)
    ? openValue.filter((v): v is string => typeof v === 'string' && v.length <= 200).slice(0, MAX_OPEN)
    : [];
  const rest: Record<string, JsonValue> = {};
  for (const [key, v] of Object.entries(value)) {
    if (key !== 'v' && key !== 'ui') rest[key] = v as JsonValue;
  }
  return { v: 1, ui: { tab, open }, rest };
}

export function writeMeta(meta: NoteMeta): JsonValue {
  return { ...meta.rest, v: 1, ui: { tab: meta.ui.tab, open: [...meta.ui.open] } };
}
