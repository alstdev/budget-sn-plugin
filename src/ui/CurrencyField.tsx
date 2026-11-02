import { useId, useState } from 'preact/hooks';

/** Quick currencies (docs/SPEC.md 4.3) plus "Інша…" for any ISO 4217 code. */
export const QUICK_CURRENCIES = ['UAH', 'USD', 'EUR'] as const;
const OTHER = 'other';

interface Props {
  readonly value: string;
  readonly onChange: (currency: string) => void;
  readonly label?: string;
}

export function CurrencyField({ value, onChange, label = 'Валюта' }: Props) {
  const id = useId();
  const isQuick = (QUICK_CURRENCIES as readonly string[]).includes(value);
  const [other, setOther] = useState(!isQuick);
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <div class="currency">
        <select
          id={id}
          value={other ? OTHER : value}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (v === OTHER) {
              setOther(true);
              onChange('');
            } else {
              setOther(false);
              onChange(v);
            }
          }}
        >
          {QUICK_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={OTHER}>Інша…</option>
        </select>
        {other && (
          <input
            aria-label="Код валюти (3 латинські літери)"
            value={value}
            maxLength={3}
            autoCapitalize="characters"
            pattern="[A-Za-z]{3}"
            onInput={(e) => {
              onChange(e.currentTarget.value.toUpperCase());
            }}
          />
        )}
      </div>
    </div>
  );
}
