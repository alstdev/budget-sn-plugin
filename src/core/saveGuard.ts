/**
 * Last line of defence before a save (docs/SPEC.md 7.2, CLAUDE.md 2):
 * never save an empty result over a non-empty note, and never shrink the
 * text by more than 30% in one save without an explicit delete action.
 */

export type SaveVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'empty' | 'shrink'; readonly message: string };

export interface SaveIntent {
  /** True only for a confirmed delete action in the UI. */
  readonly explicitDelete: boolean;
}

export function checkSave(previous: string, next: string, intent: SaveIntent): SaveVerdict {
  if (next.trim() === '' && previous.trim() !== '') {
    return { ok: false, reason: 'empty', message: 'Збереження порожнього тексту заблоковано.' };
  }
  // next < 70% of previous, in integers.
  if (!intent.explicitDelete && next.length * 10 < previous.length * 7) {
    return {
      ok: false,
      reason: 'shrink',
      message: 'Текст скоротився більш ніж на 30%; збереження заблоковано.',
    };
  }
  return { ok: true };
}
