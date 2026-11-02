/**
 * Template "Місяць": ## Місяці → ### РРРР-ММ <Назва> (docs/SPEC.md 4.1, 4.7).
 */
import { useId, useState } from 'preact/hooks';
import { linkFor } from '../monthTemplate/model';
import { formatAmountUi, formatMoneyUi } from '../../core/money';
import type { CardProps, SectionTemplate } from '../../core/template';
import { MonthRowForm } from '../../ui/MonthRowForm';
import type { Row } from '../shared/typedTable';
import { emptyTable } from '../shared/typedTable';
import {
  EXPENSE_TYPES,
  matchesMonth,
  monthStats,
  monthSummary,
  monthTitle,
  parseMonth,
  serializeMonth,
  type MonthModel,
  type MonthRow,
} from './model';

type Form =
  | { readonly kind: 'income' }
  | { readonly kind: 'expense' }
  | { readonly kind: 'pay'; readonly index: number; readonly row: MonthRow };

function RowsTable({
  caption,
  rows,
  kind,
  onPay,
}: {
  caption: string;
  rows: readonly Row<MonthRow>[];
  kind: 'income' | 'expense';
  onPay: ((index: number, row: MonthRow) => void) | null;
}) {
  const cols = kind === 'expense' ? 6 : 5;
  return (
    <div class="table-wrap">
      <table class="history">
        <caption class="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Дата</th>
            <th scope="col">{kind === 'income' ? 'Звідки' : 'Назва'}</th>
            <th scope="col" class="num">
              Сума
            </th>
            <th scope="col" class="num">
              У грн
            </th>
            {kind === 'expense' && <th scope="col">Тип</th>}
            <th scope="col">Коментар</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols} class="muted">
                Записів немає.
              </td>
            </tr>
          )}
          {rows.map((r, i) =>
            r.kind === 'raw' ? (
              <tr key={i} class="raw-row">
                <td colSpan={cols}>
                  <span class="badge">не розібрано: {r.reason}</span> <code>{r.text}</code>
                </td>
              </tr>
            ) : (
              <tr key={i} class={r.row.date === null ? 'pending' : ''}>
                <td class="date">
                  {r.row.date ?? <span class="badge">очікує</span>}
                  {r.row.date === null && onPay !== null && (
                    <button
                      type="button"
                      class="small"
                      onClick={() => {
                        onPay(i, r.row);
                      }}
                    >
                      Оплатити
                    </button>
                  )}
                </td>
                <td>{r.row.name}</td>
                <td class={`num ${kind === 'income' ? 'pos' : 'neg'}`}>
                  {kind === 'income' ? '+' : '−'}
                  {formatMoneyUi(Math.abs(r.row.amount), r.row.currency)}
                  {r.row.amount < 0 ? ' (від’ємна)' : ''}
                </td>
                <td class="num">{r.row.uah === null ? '—' : formatAmountUi(r.row.uah)}</td>
                {kind === 'expense' && (
                  <td class={(EXPENSE_TYPES as readonly string[]).includes(r.row.type) ? '' : 'muted'}>{r.row.type}</td>
                )}
                <td>{r.row.comment}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function MonthCard({ model, issues, readOnly, open, onToggle, context, act }: CardProps<MonthModel>) {
  const id = useId();
  const [form, setForm] = useState<Form | null>(null);
  const s = monthStats(model);
  const title = model.title === '' ? monthTitle(model.key) : model.title;

  const close = (error: string | null) => {
    if (error === null) setForm(null);
    return error;
  };

  return (
    <article class="card">
      <h3 class="card-heading">
        <button type="button" class="card-toggle" aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle}>
          <span class="card-name">
            {model.key} {title}
          </span>
          <span class="card-amount num">залишок {formatMoneyUi(s.balance, 'UAH')}</span>
        </button>
      </h3>
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
            <dt>Надійшло</dt>
            <dd class="num">{formatMoneyUi(s.incomeUah, 'UAH')}</dd>
            <dt>Витрачено</dt>
            <dd class="num">{formatMoneyUi(s.spentUah, 'UAH')}</dd>
            <dt>Залишок</dt>
            <dd class="num">{formatMoneyUi(s.balance, 'UAH')}</dd>
            <dt>Після очікуваних</dt>
            <dd class="num">{formatMoneyUi(s.afterPending, 'UAH')}</dd>
            {s.pendingOther.length > 0 && [
              <dt key="t-other">Очікує в інших валютах</dt>,
              <dd key="d-other" class="num">
                {s.pendingOther.map(([c, v]) => formatMoneyUi(v, c)).join(', ')}
              </dd>,
            ]}
          </dl>
          <h4>Надходження</h4>
          <RowsTable caption={`Надходження ${model.key}`} rows={model.income.rows} kind="income" onPay={null} />
          <h4>Витрати</h4>
          <RowsTable
            caption={`Витрати ${model.key}`}
            rows={model.expenses.rows}
            kind="expense"
            onPay={readOnly ? null : (index, row) => { setForm({ kind: 'pay', index, row }); }}
          />
          {!readOnly && form === null && (
            <div class="actions">
              <button type="button" onClick={() => { setForm({ kind: 'income' }); }}>
                + Надходження
              </button>
              <button type="button" onClick={() => { setForm({ kind: 'expense' }); }}>
                + Витрата
              </button>
            </div>
          )}
          {!readOnly && form?.kind === 'income' && (
            <MonthRowForm
              title={`Надходження: ${model.key}`}
              kind="income"
              defaultCurrency={context.lastCur.inc}
              submitLabel="Зберегти"
              onSubmit={(row) => close(act({ type: 'addMonthRow', monthKey: model.key, table: 'income', row }))}
              onCancel={() => { setForm(null); }}
            />
          )}
          {!readOnly && form?.kind === 'expense' && (
            <MonthRowForm
              title={`Витрата: ${model.key}`}
              kind="expense"
              defaultCurrency={context.lastCur.exp}
              submitLabel="Зберегти"
              onSubmit={(row) => close(act({ type: 'addMonthRow', monthKey: model.key, table: 'expenses', row }))}
              onCancel={() => { setForm(null); }}
            />
          )}
          {!readOnly && form?.kind === 'pay' && (() => {
            const link = linkFor(context, form.row);
            const target =
              link === null || link.link.kind === 'none'
                ? null
                : `${link.link.kind === 'debt' ? 'борг' : 'накопичення'} «${link.link.name}»`;
            return (
              <MonthRowForm
                title={`Оплатити: ${form.row.name}`}
                kind="expense"
                defaultCurrency={form.row.currency}
                prefill={form.row}
                submitLabel="Оплатити"
                {...(target === null ? {} : { checkbox: { label: `Також записати в ${target}` } })}
                onSubmit={(row, linked) =>
                  close(
                    act({
                      type: 'payPending',
                      monthKey: model.key,
                      rowIndex: form.index,
                      expectName: form.row.name,
                      row,
                      link: linked,
                    }),
                  )
                }
                onCancel={() => { setForm(null); }}
              />
            );
          })()}
        </div>
      )}
    </article>
  );
}

export const monthTemplate: SectionTemplate<MonthModel> = {
  id: 'month',
  formatVersion: 1,
  parentHeading: 'Місяці',
  match: matchesMonth,
  parse: parseMonth,
  summary: monthSummary,
  serialize: serializeMonth,
  create: (input) => ({
    key: input.name,
    title: monthTitle(input.name),
    income: emptyTable<MonthRow>(),
    expenses: emptyTable<MonthRow>(),
  }),
  name: (model) => model.key,
  views: { Card: MonthCard },
};
