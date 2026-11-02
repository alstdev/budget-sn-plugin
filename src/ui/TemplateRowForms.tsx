import { useId, useState } from 'preact/hooks';
import { isCurrency, parseAmount } from '../core/money';
import { isMonthKey } from '../templates/months/model';
import { STATUS_PLANNED, type FixedRow, type Link, type PlannedRow } from '../templates/monthTemplate/model';
import { CurrencyField } from './CurrencyField';
import { useDialog } from './dialog';

interface FormShellProps {
  readonly title: string;
  readonly error: string | null;
  readonly onSubmit: (event: Event) => void;
  readonly onCancel: () => void;
  readonly children: preact.ComponentChildren;
}

function FormShell({ title, error, onSubmit, onCancel, children }: FormShellProps) {
  const id = useId();
  const ref = useDialog<HTMLDivElement>(onCancel);
  return (
    <div class="dialog" role="dialog" aria-labelledby={`${id}-title`} ref={ref}>
      <form onSubmit={onSubmit} noValidate>
        <h3 id={`${id}-title`}>{title}</h3>
        {children}
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

function TextField(props: {
  label: string;
  value: string;
  onInput: (v: string) => void;
  inputMode?: 'decimal' | 'numeric';
  placeholder?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <input
        id={id}
        autoComplete="off"
        value={props.value}
        maxLength={props.maxLength ?? 80}
        {...(props.inputMode === undefined ? {} : { inputMode: props.inputMode })}
        {...(props.placeholder === undefined ? {} : { placeholder: props.placeholder })}
        onInput={(e) => {
          props.onInput(e.currentTarget.value);
        }}
      />
    </div>
  );
}

const badName = (name: string) =>
  name.trim() === '' ? 'Вкажіть назву.' : /[\r\n|]/.test(name) ? 'Назва не може містити | і переводи рядка.' : null;

/** "+ Постійна" (docs/SPEC.md 4.7): name, amount, currency, day, link. */
export function FixedRowForm(props: {
  readonly debtNames: readonly string[];
  readonly savingsNames: readonly string[];
  readonly onSubmit: (row: FixedRow) => string | null;
  readonly onCancel: () => void;
}) {
  const linkId = useId();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('UAH');
  const [day, setDay] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: Event) => {
    event.preventDefault();
    const nameError = badName(name);
    if (nameError !== null) {
      setError(nameError);
      return;
    }
    const value = parseAmount(amount);
    if (value === null || value <= 0) {
      setError('Сума: додатне число, до двох знаків після коми.');
      return;
    }
    if (!isCurrency(currency)) {
      setError('Валюта: три латинські літери (ISO 4217).');
      return;
    }
    let dayValue: number | null = null;
    if (day.trim() !== '') {
      dayValue = /^\d{1,2}$/.test(day.trim()) ? Number(day.trim()) : 0;
      if (dayValue < 1 || dayValue > 31) {
        setError('День: число від 1 до 31.');
        return;
      }
    }
    const [kind, target] = link.split('\u0000');
    const linkValue: Link =
      kind === 'debt' || kind === 'savings' ? { kind, name: target ?? '' } : { kind: 'none' };
    setError(props.onSubmit({ name: name.trim(), amount: value, currency, day: dayValue, link: linkValue }));
  };

  return (
    <FormShell title="Нова постійна витрата" error={error} onSubmit={submit} onCancel={props.onCancel}>
      <TextField label="Назва" value={name} onInput={setName} />
      <TextField label="Сума" value={amount} onInput={setAmount} inputMode="decimal" />
      <CurrencyField value={currency} onChange={setCurrency} />
      <TextField label="День оплати (1–31, необов’язково)" value={day} onInput={setDay} inputMode="numeric" maxLength={2} />
      <div class="field">
        <label for={linkId}>Зв’язок</label>
        <select
          id={linkId}
          value={link}
          onChange={(e) => {
            setLink(e.currentTarget.value);
          }}
        >
          <option value="">немає</option>
          {props.debtNames.map((n) => (
            <option key={`d${n}`} value={`debt\u0000${n}`}>
              борг: {n}
            </option>
          ))}
          {props.savingsNames.map((n) => (
            <option key={`s${n}`} value={`savings\u0000${n}`}>
              накоп: {n}
            </option>
          ))}
        </select>
      </div>
    </FormShell>
  );
}

/** "+ Покупка": name, budget, currency, month, per month, status. */
export function PlannedRowForm(props: {
  readonly defaultMonth: string;
  readonly onSubmit: (row: PlannedRow) => string | null;
  readonly onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState('UAH');
  const [month, setMonth] = useState(props.defaultMonth);
  const [perMonth, setPerMonth] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: Event) => {
    event.preventDefault();
    const nameError = badName(name);
    if (nameError !== null) {
      setError(nameError);
      return;
    }
    const value = parseAmount(budget);
    if (value === null || value <= 0) {
      setError('Бюджет: додатне число, до двох знаків після коми.');
      return;
    }
    if (!isCurrency(currency)) {
      setError('Валюта: три латинські літери (ISO 4217).');
      return;
    }
    if (month.trim() !== '' && !isMonthKey(month.trim())) {
      setError('Місяць у форматі РРРР-ММ або порожньо.');
      return;
    }
    if (/[\r\n|]/.test(perMonth)) {
      setError('«На місяць» не може містити | і переводи рядка.');
      return;
    }
    setError(
      props.onSubmit({
        name: name.trim(),
        budget: value,
        currency,
        month: month.trim(),
        perMonth: perMonth.trim(),
        status: STATUS_PLANNED,
      }),
    );
  };

  return (
    <FormShell title="Нова запланована покупка" error={error} onSubmit={submit} onCancel={props.onCancel}>
      <TextField label="Назва" value={name} onInput={setName} />
      <TextField label="Бюджет" value={budget} onInput={setBudget} inputMode="decimal" />
      <CurrencyField value={currency} onChange={setCurrency} />
      <TextField label="Місяць (РРРР-ММ)" value={month} onInput={setMonth} placeholder="2026-12" maxLength={7} />
      <TextField label="На місяць (необов’язково)" value={perMonth} onInput={setPerMonth} />
    </FormShell>
  );
}
