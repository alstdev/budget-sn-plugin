/**
 * Template "Довільна таблиця": ## <назва> with user-defined columns
 * (docs/SPEC.md 4.8). Rows are added in the plugin; editing and deleting
 * rows is done in the Plain Editor for now.
 */
import { useId, useState } from 'preact/hooks';
import type { CardProps, SectionTemplate } from '../../core/template';
import { useDialog } from '../../ui/dialog';
import {
  isSingleTable,
  parseCustomTable,
  serializeCustomTable,
  type CustomTableModel,
} from './model';

function RowForm({
  columns,
  onSubmit,
  onCancel,
}: {
  columns: readonly string[];
  onSubmit: (cells: string[]) => string | null;
  onCancel: () => void;
}) {
  const id = useId();
  const ref = useDialog<HTMLDivElement>(onCancel);
  const [cells, setCells] = useState<string[]>(() => columns.map(() => ''));
  const [error, setError] = useState<string | null>(null);
  const submit = (event: Event) => {
    event.preventDefault();
    const clean = cells.map((c) => c.replace(/[\r\n]+/g, ' ').trim());
    if (clean.every((c) => c === '')) {
      setError('Заповніть хоча б одну клітинку.');
      return;
    }
    setError(onSubmit(clean));
  };
  return (
    <div class="dialog" role="dialog" aria-labelledby={`${id}-title`} ref={ref}>
      <form onSubmit={submit} noValidate>
        <h3 id={`${id}-title`}>Новий рядок</h3>
        {columns.map((column, i) => (
          <div class="field" key={column}>
            <label for={`${id}-${String(i)}`}>{column}</label>
            <input
              id={`${id}-${String(i)}`}
              autoComplete="off"
              maxLength={200}
              value={cells[i] ?? ''}
              onInput={(e) => {
                const next = cells.slice();
                next[i] = e.currentTarget.value;
                setCells(next);
              }}
            />
          </div>
        ))}
        {error !== null && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        <div class="actions">
          <button type="submit" class="primary">
            Додати
          </button>
          <button type="button" onClick={onCancel}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  );
}

function CustomTableCard({ model, issues, readOnly, open, onToggle, onChange }: CardProps<CustomTableModel>) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const count = model.rows.length;
  return (
    <article class="card">
      <h3 class="card-heading">
        <button type="button" class="card-toggle" aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle}>
          <span class="card-name">{model.title}</span>
          <span class="card-amount num">рядків: {count}</span>
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
          <div class="table-wrap">
            <table class="history">
              <caption class="sr-only">{model.title}</caption>
              <thead>
                <tr>
                  {model.columns.map((c, i) => (
                    <th key={i} scope="col" class={model.align[i] === 'right' ? 'num' : ''}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {count === 0 && (
                  <tr>
                    <td colSpan={model.columns.length} class="muted">
                      Рядків ще немає.
                    </td>
                  </tr>
                )}
                {model.rows.map((r, i) =>
                  r.kind === 'raw' ? (
                    <tr key={i} class="raw-row">
                      <td colSpan={model.columns.length}>
                        <span class="badge">не розібрано: {r.reason}</span> <code>{r.text}</code>
                      </td>
                    </tr>
                  ) : (
                    <tr key={i}>
                      {r.cells.map((c, j) => (
                        <td key={j} class={model.align[j] === 'right' ? 'num' : ''}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {!readOnly && !adding && (
            <div class="actions">
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                }}
              >
                + Рядок
              </button>
            </div>
          )}
          {!readOnly && adding && (
            <RowForm
              columns={model.columns}
              onSubmit={(cells) => {
                const error = onChange({ ...model, rows: [...model.rows, { kind: 'row', cells }] });
                if (error === null) setAdding(false);
                return error;
              }}
              onCancel={() => {
                setAdding(false);
              }}
            />
          )}
        </div>
      )}
    </article>
  );
}

export const customTableTemplate: SectionTemplate<CustomTableModel> = {
  id: 'table',
  formatVersion: 1,
  parentHeading: '',
  level: 2,
  match: (heading) => heading.level === 2,
  matchBody: isSingleTable,
  parse: parseCustomTable,
  summary: () => [],
  serialize: serializeCustomTable,
  // Tables with user columns are created by the "addTable" action.
  create: (input) => ({ title: input.name, columns: ['Назва', 'Значення'], align: ['left', 'left'], rows: [] }),
  name: (model) => model.title,
  views: { Card: CustomTableCard },
};
