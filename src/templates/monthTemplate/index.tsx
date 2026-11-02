/**
 * Templates "Постійні" and "Заплановані покупки" under ## Шаблон місяця
 * (docs/SPEC.md 4.1, 4.7). Rows are added on the "Планування" tab; editing
 * and deleting existing rows is done in the Plain Editor for now.
 */
import { formatMoneyUi } from '../../core/money';
import type { CardProps, SectionTemplate } from '../../core/template';
import type { Row } from '../shared/typedTable';
import { emptyTable } from '../shared/typedTable';
import {
  FIXED_TITLE,
  PLANNED_TITLE,
  TEMPLATE_PARENT,
  formatLink,
  matchesTemplateSection,
  parseFixedSection,
  parsePlannedSection,
  serializeFixed,
  serializePlanned,
  type FixedModel,
  type FixedRow,
  type PlannedModel,
  type PlannedRow,
} from './model';

function TableCard<R>({
  title,
  headers,
  rows,
  cells,
  issues,
  readOnly,
}: {
  title: string;
  headers: readonly string[];
  rows: readonly Row<R>[];
  cells: (row: R) => string[];
  issues: CardProps<unknown>['issues'];
  readOnly: boolean;
}) {
  return (
    <article class="card">
      <h3 class="card-heading plain">{title}</h3>
      <div class="card-body">
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
            <caption class="sr-only">{title}</caption>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={headers.length} class="muted">
                    Записів немає.
                  </td>
                </tr>
              )}
              {rows.map((r, i) =>
                r.kind === 'raw' ? (
                  <tr key={i} class="raw-row">
                    <td colSpan={headers.length}>
                      <span class="badge">не розібрано: {r.reason}</span> <code>{r.text}</code>
                    </td>
                  </tr>
                ) : (
                  <tr key={i}>
                    {cells(r.row).map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}

const fixedCells = (r: FixedRow): string[] => [
  r.name,
  formatMoneyUi(r.amount, r.currency),
  r.day === null ? '' : String(r.day),
  formatLink(r.link),
];

const plannedCells = (r: PlannedRow): string[] => [
  r.name,
  formatMoneyUi(r.budget, r.currency),
  r.month,
  r.perMonth,
  r.status,
];

function FixedCard({ model, issues, readOnly }: CardProps<FixedModel>) {
  return (
    <TableCard
      title={FIXED_TITLE}
      headers={['Назва', 'Сума', 'День', "Зв'язок"]}
      rows={model.table.rows}
      cells={fixedCells}
      issues={issues}
      readOnly={readOnly}
    />
  );
}

function PlannedCard({ model, issues, readOnly }: CardProps<PlannedModel>) {
  return (
    <TableCard
      title={PLANNED_TITLE}
      headers={['Назва', 'Бюджет', 'Місяць', 'На місяць', 'Статус']}
      rows={model.table.rows}
      cells={plannedCells}
      issues={issues}
      readOnly={readOnly}
    />
  );
}

export const fixedTemplate: SectionTemplate<FixedModel> = {
  id: 'fixed',
  formatVersion: 1,
  parentHeading: TEMPLATE_PARENT,
  match: (heading, parent) => matchesTemplateSection(heading, parent, FIXED_TITLE),
  parse: parseFixedSection,
  summary: () => [],
  serialize: serializeFixed,
  create: () => ({ table: emptyTable<FixedRow>() }),
  name: () => FIXED_TITLE,
  views: { Card: FixedCard },
};

export const plannedTemplate: SectionTemplate<PlannedModel> = {
  id: 'planned',
  formatVersion: 1,
  parentHeading: TEMPLATE_PARENT,
  match: (heading, parent) => matchesTemplateSection(heading, parent, PLANNED_TITLE),
  parse: parsePlannedSection,
  summary: () => [],
  serialize: serializePlanned,
  create: () => ({ table: emptyTable<PlannedRow>() }),
  name: () => PLANNED_TITLE,
  views: { Card: PlannedCard },
};
