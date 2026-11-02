/**
 * Template "Борг": ## Борги → ### <назва> · <ВАЛ> (docs/SPEC.md 4.4, 4.8, 5.2).
 * Remaining = start − sum of payments in the debt currency. A negative
 * payment increases the debt.
 */
import { formatAmount, formatMoneyUi, percent, sum, type Minor } from '../../core/money';
import type { CardProps, SectionTemplate } from '../../core/template';
import {
  EMPTY_LEDGER,
  appendOperation,
  ledgerLines,
  matchesLedgerHeading,
  operations,
  parseLedgerSection,
  type Ledger,
} from '../shared/ledger';
import { LedgerCard } from '../shared/LedgerCard';

export interface DebtModel {
  readonly name: string;
  readonly currency: string;
  readonly start: Minor;
  readonly ledger: Ledger;
}

const KEY_LABEL = 'Початкова сума';

export interface DebtStats {
  readonly paid: Minor;
  readonly remaining: Minor;
  readonly paidUah: Minor;
  readonly otherCurrencyOps: number;
  readonly progress: number | null;
}

export function debtStats(model: DebtModel): DebtStats {
  const ops = operations(model.ledger);
  const own = ops.filter((op) => op.currency === model.currency);
  const paid = sum(own.map((op) => op.amount));
  return {
    paid,
    remaining: model.start - paid,
    paidUah: sum(ops.map((op) => op.uah)),
    otherCurrencyOps: ops.length - own.length,
    progress: percent(paid, model.start),
  };
}

function DebtCard({ model, issues, readOnly, open, onToggle, onChange }: CardProps<DebtModel>) {
  const stats = debtStats(model);
  const extraIssues =
    stats.otherCurrencyOps > 0
      ? [{ message: `Платежів в іншій валюті: ${stats.otherCurrencyOps}; у залишку не враховані.`, critical: false }]
      : [];
  return (
    <LedgerCard
      name={model.name}
      currency={model.currency}
      headline={stats.remaining}
      progress={stats.progress}
      progressLabel="Прогрес"
      details={[
        ['Початкова сума', formatMoneyUi(model.start, model.currency)],
        ['Залишок', formatMoneyUi(stats.remaining, model.currency)],
        ['Сплачено', formatMoneyUi(stats.paid, model.currency)],
        ['Сплачено в грн', formatMoneyUi(stats.paidUah, 'UAH')],
      ]}
      ledger={model.ledger}
      issues={[...issues, ...extraIssues]}
      readOnly={readOnly}
      open={open}
      onToggle={onToggle}
      actions={[{ label: '+ Платіж', formTitle: 'Платіж', sign: 1 }]}
      onAdd={(op) => onChange({ ...model, ledger: appendOperation(model.ledger, op) })}
    />
  );
}

export const debtTemplate: SectionTemplate<DebtModel> = {
  id: 'debt',
  formatVersion: 1,
  parentHeading: 'Борги',
  match: (heading, parent) => matchesLedgerHeading(heading, parent, 'Борги'),
  parse(block) {
    const parsed = parseLedgerSection(block, KEY_LABEL);
    const issues = parsed.issues;
    if (parsed.key === null && !issues.some((i) => i.critical)) {
      issues.push({ message: `Немає рядка «${KEY_LABEL}: <число> ${parsed.currency}».`, critical: true });
    }
    return {
      model: { name: parsed.name, currency: parsed.currency, start: parsed.key ?? 0, ledger: parsed.ledger },
      issues,
    };
  },
  summary(model) {
    const s = debtStats(model);
    return [
      `_Залишок: ${formatAmount(s.remaining)} ${model.currency} · сплачено: ${formatAmount(s.paid)} ${model.currency} · у грн: ${formatAmount(s.paidUah)} UAH_`,
    ];
  },
  serialize(model) {
    return [
      `### ${model.name} · ${model.currency}`,
      `${KEY_LABEL}: ${formatAmount(model.start)} ${model.currency}`,
      ...debtTemplate.summary(model),
      ...ledgerLines(model.ledger),
    ];
  },
  create: (input) => ({
    name: input.name.trim(),
    currency: input.currency,
    start: input.amount ?? 0,
    ledger: EMPTY_LEDGER,
  }),
  name: (model) => model.name,
  views: { Card: DebtCard },
};
