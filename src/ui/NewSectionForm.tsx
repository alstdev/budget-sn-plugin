import { useId, useState } from 'preact/hooks';
import { isCurrency, parseAmount } from '../core/money';
import type { CreateInput } from '../core/template';
import { validateName } from '../templates/shared/ledger';
import { CurrencyField } from './CurrencyField';
import { useDialog } from './dialog';

interface Props {
  readonly title: string;
  readonly amountLabel: string;
  readonly amountRequired: boolean;
  readonly onSubmit: (input: CreateInput) => string | null;
  readonly onCancel: () => void;
}

/** "+ Борг" / "+ Накопичення": name, currency, start amount or goal. */
export function NewSectionForm({ title, amountLabel, amountRequired, onSubmit, onCancel }: Props) {
  const id = useId();
  const ref = useDialog<HTMLDivElement>(onCancel);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('UAH');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: Event) => {
    event.preventDefault();
    const nameError = validateName(name);
    if (nameError !== null) {
      setError(nameError);
      return;
    }
    if (!isCurrency(currency)) {
      setError('Валюта: три латинські літери (ISO 4217).');
      return;
    }
    let value: number | null = null;
    if (amount.trim() !== '' || amountRequired) {
      value = parseAmount(amount);
      if (value === null || value <= 0) {
        setError(`${amountLabel}: додатне число, до двох знаків після коми.`);
        return;
      }
    }
    setError(onSubmit({ name: name.trim(), currency, amount: value }));
  };

  return (
    <div class="dialog" role="dialog" aria-labelledby={`${id}-title`} ref={ref}>
      <form onSubmit={submit} noValidate>
        <h3 id={`${id}-title`}>{title}</h3>
        <div class="field">
          <label for={`${id}-name`}>Назва</label>
          <input
            id={`${id}-name`}
            placeholder={amountRequired ? 'Напр.: Кредит у банку' : 'Напр.: Подушка безпеки'}
            required
            maxLength={80}
            autoComplete="off"
            value={name}
            onInput={(e) => {
              setName(e.currentTarget.value);
            }}
          />
        </div>
        <CurrencyField value={currency} onChange={setCurrency} />
        <div class="field">
          <label for={`${id}-amount`}>
            {amountLabel}
            {amountRequired ? '' : ' (необов’язково)'}
          </label>
          <input
            id={`${id}-amount`}
            inputMode="decimal"
            autoComplete="off"
            required={amountRequired}
            value={amount}
            onInput={(e) => {
              setAmount(e.currentTarget.value);
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
