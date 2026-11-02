/**
 * Operations that change more than one section at once (docs/SPEC.md 4.6, 4.7).
 * Type-only module, shared by templates (cards) and the action handlers.
 */
import type { MonthRow } from '../templates/months/model';
import type { FixedRow, PlannedRow } from '../templates/monthTemplate/model';
import type { Operation } from '../templates/shared/ledger';

export type DocAction =
  | { readonly type: 'createMonth'; readonly key: string }
  | {
      readonly type: 'addMonthRow';
      readonly monthKey: string;
      readonly table: 'income' | 'expenses';
      readonly row: MonthRow;
    }
  | {
      readonly type: 'payPending';
      readonly monthKey: string;
      readonly rowIndex: number;
      /** Name of the pending row when the form was opened (guards concurrent edits). */
      readonly expectName: string;
      readonly row: MonthRow;
      /** Also add the payment to the linked debt / savings section. */
      readonly link: boolean;
    }
  | {
      readonly type: 'ledgerOp';
      readonly templateId: 'debt' | 'savings';
      readonly name: string;
      readonly op: Operation;
      /** Also record the operation in the expenses of its month. */
      readonly mirror: boolean;
    }
  | { readonly type: 'addFixed'; readonly row: FixedRow }
  | { readonly type: 'addPlanned'; readonly row: PlannedRow };

/** Facts about the whole note that cards need (links, months, defaults). */
export interface DocContext {
  readonly monthKeys: readonly string[];
  readonly debtNames: readonly string[];
  readonly savingsNames: readonly string[];
  readonly fixed: readonly FixedRow[];
  /** Last used currency for new expenses / income (docs/SPEC.md 4.3). */
  readonly lastCur: { readonly exp: string; readonly inc: string };
}
