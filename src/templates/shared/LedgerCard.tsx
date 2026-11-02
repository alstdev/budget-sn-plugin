import type { ComponentChildren } from 'preact';
import { useId, useState } from 'preact/hooks';
import { formatAmountUi, formatMoneyUi, type Minor } from '../../core/money';
import type { Issue } from '../../core/template';
import { OperationForm } from '../../ui/OperationForm';
import type { Ledger, Operation } from './ledger';

export interface CardAction {
  readonly label: string;
  readonly formTitle: string;
  readonly sign: 1 | -1;
  /** Offer "also record in month expenses" (docs/SPEC.md 4.6). */
  readonly mirror?: boolean;
}

interface Props {
  readonly name: string;
  readonly currency: string;
  readonly headline: Minor;
  readonly progress: number | null;
  readonly progressLabel: string;
  readonly details: readonly (readonly [string, string])[];
  readonly ledger: Ledger;
  readonly issues: readonly Issue[];
  readonly readOnly: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly actions: readonly CardAction[];
  readonly onAdd: (op: Operation, mirror: boolean) => string | null;
  /** Why the month mirror is unavailable for a date, or null. */
  readonly mirrorUnavailable?: (date: string) => string | null;
  readonly children?: ComponentChildren;
}

/** Collapsible card with summary, history and operation forms. */
export function LedgerCard(props: Props) {
  const id = useId();
  const [action, setAction] = useState<CardAction | null>(null);
  const { name, currency, headline, progress, open, readOnly, ledger, issues } = props;

  return (
    <article class="card">
      <h3 class="card-heading">
        <button
          type="button"
          class="card-toggle"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={props.onToggle}
        >
          <span class="card-name">{name}</span>
          <span class="card-amount num">{formatMoneyUi(headline, currency)}</span>
        </button>
      </h3>
      {progress !== null && (
        <progress class="card-progress" max={100} value={Math.max(0, Math.min(100, progress))}>
          {progress}%
        </progress>
      )}
      {open && (
        <div class="card-body" id={`${id}-body`}>
          {readOnly && <p class="notice">Розділ лише для читання.</p>}
          {issues.length > 0 && (
            <ul class="issues">
              {issues.map((issue, i) => (
                <li key={i} class={issue.critical ? 'critical' : 'warning'}>
                  {issue.line === undefined ? '' : `Рядок ${issue.line}: `}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          <dl class="details">
            {props.details.map(([term, value]) => [
              <dt key={`t-${term}`}>{term}</dt>,
              <dd key={`d-${term}`} class="num">
                {value}
              </dd>,
            ])}
            {progress !== null && [
              <dt key="t-progress">{props.progressLabel}</dt>,
              <dd key="d-progress" class="num">
                {progress}%
              </dd>,
            ]}
          </dl>
          <div class="table-wrap">
            <table class="history">
              <caption class="sr-only">Історія операцій: {name}</caption>
              <thead>
                <tr>
                  <th scope="col">Дата</th>
                  <th scope="col" class="num">
                    Сума
                  </th>
                  <th scope="col" class="num">
                    У грн
                  </th>
                  <th scope="col">Коментар</th>
                </tr>
              </thead>
              <tbody>
                {ledger.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} class="muted">
                      Операцій ще немає.
                    </td>
                  </tr>
                )}
                {ledger.rows.map((row, i) =>
                  row.kind === 'op' ? (
                    <tr key={i}>
                      <td class="date">{row.op.date}</td>
                      <td class={`num ${row.op.amount < 0 ? 'neg' : 'pos'}`}>
                        {row.op.amount < 0 ? '' : '+'}
                        {formatMoneyUi(row.op.amount, row.op.currency)}
                      </td>
                      <td class="num">{formatAmountUi(row.op.uah)}</td>
                      <td>{row.op.comment}</td>
                    </tr>
                  ) : (
                    <tr key={i} class="raw-row">
                      <td colSpan={4}>
                        <span class="badge">не розібрано: {row.reason}</span> <code>{row.text}</code>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {props.children}
          {!readOnly && action === null && (
            <div class="actions">
              {props.actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => {
                    setAction(a);
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
          {!readOnly && action !== null && (
            <OperationForm
              title={`${action.formTitle}: ${name}`}
              defaultCurrency={currency}
              sign={action.sign}
              submitLabel="Зберегти"
              {...(action.mirror === true
                ? {
                    checkbox: {
                      label: 'Також записати у витрати місяця',
                      unavailable: props.mirrorUnavailable ?? (() => null),
                    },
                  }
                : {})}
              onSubmit={(op, mirror) => {
                const error = props.onAdd(op, mirror);
                if (error === null) setAction(null);
                return error;
              }}
              onCancel={() => {
                setAction(null);
              }}
            />
          )}
        </div>
      )}
    </article>
  );
}
