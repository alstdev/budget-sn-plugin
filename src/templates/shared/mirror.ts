import type { DocContext } from '../../actions/types';

/** Why an operation dated `date` cannot be mirrored into month expenses, or null. */
export function mirrorUnavailable(context: DocContext, date: string): string | null {
  const key = date.slice(0, 7);
  return context.monthKeys.includes(key) ? null : `Місяця ${key} ще немає: спершу створіть його на вкладці «Місяці».`;
}
