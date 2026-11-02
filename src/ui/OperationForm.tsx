import { useId, useState } from 'preact/hooks';
import { parseAmount, rateUi } from '../core/money';
import {
  todayIso,
  validateOperation,
  type Operation,
} from '../templates/shared/ledger';
import { CurrencyField } from './CurrencyField';

interface Props {
  readonly title: string;
  readonly defaultCurrency: string;
  /** -1 stores the entered amount as negative (withdrawal). */
  readonly sign: 1 | -1;
  readonly submitLabel: string;
  /** Returns an error text, or null when the operation was saved. */
  readonly onSubmit: (op: Operation) => string | null;
  readonly onCancel: () => void;
}

/** Operation form (docs/SPEC.md 4.2, 4.3). */
export function OperationForm({ title, defaultCurrency, sign, submitLabel, onSubmit, onCancel }: Props) {
  const id = useId();
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [uah, setUah] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isUah = currency === 'UAH';
  const amountValue = parseAmount(amount);
  const uahValue = parseAmount(uah);
  const rate =
    !isUah && amountValue !== null && uahValue !== null ? rateUi(amountValue, uahValue) : null;

  const submit = (event: Event) => {
    event.preventDefault();
    const op = validateOperation({ date, amount, currency, uah, comment }, sign);
    if (typeof op === 'string') {
      setError(op);
      return;
    }
    setError(onSubmit(op));
  };

  return (
    <div class="dialog" role="dialog" aria-labelledby={`${id}-title`}>
      <form onSubmit={submit} noValidate>
        <h3 id={`${id}-title`}>{title}</h3>
        <div class="field">
          <label for={`${id}-date`}>Дата</label>
          <input
            id={`${id}-date`}
            type="date"
            required
            value={date}
            onInput={(e) => {
              setDate(e.currentTarget.value);
            }}
          />
        </div>
        <div class="field">
          <label for={`${id}-amount`}>Сума{sign === -1 ? ' (списати)' : ''}</label>
          <input
            id={`${id}-amount`}
            inputMode="decimal"
            autoComplete="off"
            required
            value={amount}
            onInput={(e) => {
              setAmount(e.currentTarget.value);
            }}
          />
        </div>
        <CurrencyField value={currency} onChange={setCurrency} />
        <div class="field">
          <label for={`${id}-uah`}>У грн{isUah ? ' (дорівнює сумі)' : ''}</label>
          <input
            id={`${id}-uah`}
            inputMode="decimal"
            autoComplete="off"
            disabled={isUah}
            required={!isUah}
            value={isUah ? amount : uah}
            onInput={(e) => {
              setUah(e.currentTarget.value);
            }}
          />
          {rate !== null && <p class="hint">Курс для довідки: {rate} грн за 1 {currency}; не зберігається.</p>}
        </div>
        <div class="field">
          <label for={`${id}-comment`}>Коментар</label>
          <input
            id={`${id}-comment`}
            autoComplete="off"
            maxLength={200}
            value={comment}
            onInput={(e) => {
              setComment(e.currentTarget.value);
            }}
          />
        </div>
        {error !== null && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        <div class="actions">
          <button type="submit" class="primary">
            {submitLabel}
          </button>
          <button type="button" onClick={onCancel}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  );
}
