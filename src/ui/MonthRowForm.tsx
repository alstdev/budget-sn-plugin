import { useId, useState } from 'preact/hooks';
import { formatAmount, isCurrency, parseAmount, rateUi } from '../core/money';
import { EXPENSE_TYPES, type MonthRow } from '../templates/months/model';
import { isValidDate, todayIso } from '../templates/shared/ledger';
import { CurrencyField } from './CurrencyField';

interface Props {
  readonly title: string;
  readonly kind: 'income' | 'expense';
  readonly defaultCurrency: string;
  /** Values of a pending row being paid. */
  readonly prefill?: MonthRow;
  readonly checkbox?: { readonly label: string };
  readonly submitLabel: string;
  readonly onSubmit: (row: MonthRow, checked: boolean) => string | null;
  readonly onCancel: () => void;
}

/** Income / expense row of a month, also used for "Оплатити" (docs/SPEC.md 4.2, 4.7). */
export function MonthRowForm(props: Props) {
  const { kind, prefill } = props;
  const id = useId();
  const [date, setDate] = useState(todayIso());
  const [name, setName] = useState(prefill?.name ?? '');
  const [amount, setAmount] = useState(prefill === undefined ? '' : formatAmount(prefill.amount));
  const [currency, setCurrency] = useState(prefill?.currency ?? props.defaultCurrency);
  const [uah, setUah] = useState(prefill?.uah == null ? '' : formatAmount(prefill.uah));
  const [type, setType] = useState(prefill?.type ?? 'разова');
  const [comment, setComment] = useState(prefill?.comment ?? '');
  const [checked, setChecked] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isUah = currency === 'UAH';
  const amountValue = parseAmount(amount);
  const uahValue = parseAmount(uah);
  const rate = !isUah && amountValue !== null && uahValue !== null ? rateUi(amountValue, uahValue) : null;
  const types: readonly string[] = (EXPENSE_TYPES as readonly string[]).includes(type) ? EXPENSE_TYPES : [...EXPENSE_TYPES, type];

  const validate = (): MonthRow | string => {
    if (!isValidDate(date)) return 'Дата має бути у форматі РРРР-ММ-ДД.';
    if (kind === 'expense' && name.trim() === '') return 'Вкажіть назву витрати.';
    if (/[\r\n|]/.test(name)) return 'Назва не може містити | і переводи рядка.';
    if (amountValue === null || amountValue === 0) return 'Сума: число, до двох знаків після коми.';
    const cur = currency.trim().toUpperCase();
    if (!isCurrency(cur)) return 'Валюта: три латинські літери (ISO 4217).';
    let uahResult = amountValue;
    if (cur !== 'UAH') {
      if (uahValue === null) return 'Для валюти, відмінної від UAH, вкажіть суму в грн.';
      uahResult = uahValue;
    }
    return {
      date,
      name: name.trim(),
      amount: amountValue,
      currency: cur,
      uah: uahResult,
      type: kind === 'expense' ? type : '',
      comment: comment.replace(/[\r\n]+/g, ' ').trim(),
    };
  };

  const submit = (event: Event) => {
    event.preventDefault();
    const row = validate();
    setError(typeof row === 'string' ? row : props.onSubmit(row, props.checkbox !== undefined && checked));
  };

  return (
    <div class="dialog" role="dialog" aria-labelledby={`${id}-title`}>
      <form onSubmit={submit} noValidate>
        <h3 id={`${id}-title`}>{props.title}</h3>
        <div class="field">
          <label for={`${id}-date`}>Дата</label>
          <input id={`${id}-date`} type="date" required value={date} onInput={(e) => { setDate(e.currentTarget.value); }} />
        </div>
        <div class="field">
          <label for={`${id}-name`}>{kind === 'income' ? 'Звідки' : 'Назва'}</label>
          <input id={`${id}-name`} autoComplete="off" maxLength={80} value={name} onInput={(e) => { setName(e.currentTarget.value); }} />
        </div>
        <div class="field">
          <label for={`${id}-amount`}>Сума</label>
          <input id={`${id}-amount`} inputMode="decimal" autoComplete="off" required value={amount} onInput={(e) => { setAmount(e.currentTarget.value); }} />
        </div>
        <CurrencyField value={currency} onChange={setCurrency} />
        <div class="field">
          <label for={`${id}-uah`}>У грн{isUah ? ' (дорівнює сумі)' : ''}</label>
          <input
            id={`${id}-uah`}
            inputMode="decimal"
            autoComplete="off"
            disabled={isUah}
            value={isUah ? amount : uah}
            onInput={(e) => { setUah(e.currentTarget.value); }}
          />
          {rate !== null && <p class="hint">Курс для довідки: {rate} грн за 1 {currency}; не зберігається.</p>}
        </div>
        {kind === 'expense' && (
          <div class="field">
            <label for={`${id}-type`}>Тип</label>
            <select id={`${id}-type`} value={type} onChange={(e) => { setType(e.currentTarget.value); }}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}
        <div class="field">
          <label for={`${id}-comment`}>Коментар</label>
          <input id={`${id}-comment`} autoComplete="off" maxLength={200} value={comment} onInput={(e) => { setComment(e.currentTarget.value); }} />
        </div>
        {props.checkbox !== undefined && (
          <div class="check">
            <input id={`${id}-check`} type="checkbox" checked={checked} onChange={(e) => { setChecked(e.currentTarget.checked); }} />
            <label for={`${id}-check`}>{props.checkbox.label}</label>
          </div>
        )}
        {error !== null && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        <div class="actions">
          <button type="submit" class="primary">
            {props.submitLabel}
          </button>
          <button type="button" onClick={props.onCancel}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  );
}
