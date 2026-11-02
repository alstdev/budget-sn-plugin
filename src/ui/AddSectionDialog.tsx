import { useId, useState } from 'preact/hooks';
import type { CreateInput } from '../core/template';
import { parseColumnsInput } from '../templates/customTable/model';
import type { FixedRow, PlannedRow } from '../templates/monthTemplate/model';
import { useDialog } from './dialog';
import { NewSectionForm } from './NewSectionForm';
import { FixedRowForm, PlannedRowForm } from './TemplateRowForms';

type Choice = 'debt' | 'savings' | 'month' | 'fixed' | 'planned' | 'table';

const CHOICES: readonly { id: Choice; label: string; hint: string }[] = [
  { id: 'debt', label: 'Борг', hint: 'початкова сума й платежі' },
  { id: 'savings', label: 'Накопичення', hint: 'баланс і необов’язкова ціль' },
  { id: 'month', label: 'Місяць', hint: 'наступний місяць із шаблону' },
  { id: 'fixed', label: 'Постійна витрата', hint: 'рядок шаблону місяця' },
  { id: 'planned', label: 'Запланована покупка', hint: 'рядок шаблону місяця' },
  { id: 'table', label: 'Довільна таблиця', hint: 'свої колонки, лише текст' },
];

export interface AddSectionHandlers {
  readonly nextMonth: { readonly key: string; readonly title: string };
  readonly defaultPlannedMonth: string;
  readonly debtNames: readonly string[];
  readonly savingsNames: readonly string[];
  readonly addDebt: (input: CreateInput) => string | null;
  readonly addSavings: (input: CreateInput) => string | null;
  readonly createMonth: () => string | null;
  readonly addFixed: (row: FixedRow) => string | null;
  readonly addPlanned: (row: PlannedRow) => string | null;
  readonly addTable: (title: string, columns: string[]) => string | null;
}

function TableForm({ onSubmit, onCancel }: { onSubmit: (title: string, columns: string[]) => string | null; onCancel: () => void }) {
  const id = useId();
  const ref = useDialog<HTMLDivElement>(onCancel);
  const [title, setTitle] = useState('');
  const [columns, setColumns] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (event: Event) => {
    event.preventDefault();
    const parsed = parseColumnsInput(title, columns);
    setError(typeof parsed === 'string' ? parsed : onSubmit(parsed.title, parsed.columns));
  };
  return (
    <div class="dialog" role="dialog" aria-labelledby={`${id}-title`} ref={ref}>
      <form onSubmit={submit} noValidate>
        <h3 id={`${id}-title`}>Довільна таблиця</h3>
        <div class="field">
          <label for={`${id}-name`}>Назва</label>
          <input id={`${id}-name`} autoComplete="off" maxLength={80} placeholder="Напр.: Підписки" value={title} onInput={(e) => { setTitle(e.currentTarget.value); }} />
        </div>
        <div class="field">
          <label for={`${id}-cols`}>Колонки через кому</label>
          <input id={`${id}-cols`} autoComplete="off" maxLength={500} placeholder="Сервіс, Ціна, Дата" value={columns} onInput={(e) => { setColumns(e.currentTarget.value); }} />
        </div>
        {error !== null && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        <div class="actions">
          <button type="submit" class="primary">
            Створити
          </button>
          <button type="button" onClick={onCancel}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  );
}

function MonthConfirm({ next, onConfirm, onCancel }: { next: AddSectionHandlers['nextMonth']; onConfirm: () => string | null; onCancel: () => void }) {
  const id = useId();
  const ref = useDialog<HTMLDivElement>(onCancel);
  const [error, setError] = useState<string | null>(null);
  return (
    <div class="dialog" role="dialog" aria-labelledby={`${id}-title`} ref={ref}>
      <h3 id={`${id}-title`}>
        Створити {next.key} {next.title} з шаблону?
      </h3>
      <p class="hint">Постійні витрати й покупки цього місяця з’являться як рядки «очікує».</p>
      {error !== null && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <div class="actions">
        <button type="button" class="primary" onClick={() => { setError(onConfirm()); }}>
          Створити
        </button>
        <button type="button" onClick={onCancel}>
          Скасувати
        </button>
      </div>
    </div>
  );
}

/** "+ Розділ із шаблону" (docs/SPEC.md 4.1, 4.8): choose a section type, then fill its form. */
export function AddSectionDialog({ handlers, onClose }: { handlers: AddSectionHandlers; onClose: () => void }) {
  const id = useId();
  const [choice, setChoice] = useState<Choice | null>(null);
  const ref = useDialog<HTMLDivElement>(onClose);
  const done = (error: string | null) => {
    if (error === null) onClose();
    return error;
  };
  const back = () => {
    setChoice(null);
  };

  return (
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} ref={ref}>
        {choice === null && (
          <>
            <h2 id={`${id}-title`}>Новий розділ</h2>
            <ul class="choices">
              {CHOICES.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { setChoice(c.id); }}>
                    <span class="choice-label">{c.label}</span>
                    <span class="choice-hint">{c.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div class="actions">
              <button type="button" onClick={onClose}>
                Скасувати
              </button>
            </div>
          </>
        )}
        {choice !== null && <h2 id={`${id}-title`} class="sr-only">Новий розділ</h2>}
        {choice === 'debt' && (
          <NewSectionForm title="Новий борг" amountLabel="Початкова сума" amountRequired onSubmit={(i) => done(handlers.addDebt(i))} onCancel={back} />
        )}
        {choice === 'savings' && (
          <NewSectionForm title="Нове накопичення" amountLabel="Ціль" amountRequired={false} onSubmit={(i) => done(handlers.addSavings(i))} onCancel={back} />
        )}
        {choice === 'month' && <MonthConfirm next={handlers.nextMonth} onConfirm={() => done(handlers.createMonth())} onCancel={back} />}
        {choice === 'fixed' && (
          <FixedRowForm debtNames={handlers.debtNames} savingsNames={handlers.savingsNames} onSubmit={(r) => done(handlers.addFixed(r))} onCancel={back} />
        )}
        {choice === 'planned' && (
          <PlannedRowForm defaultMonth={handlers.defaultPlannedMonth} onSubmit={(r) => done(handlers.addPlanned(r))} onCancel={back} />
        )}
        {choice === 'table' && <TableForm onSubmit={(t, c) => done(handlers.addTable(t, c))} onCancel={back} />}
      </div>
    </div>
  );
}
