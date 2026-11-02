/**
 * Template "Накопичення": ## Накопичення → ### <назва> · <ВАЛ>
 * (docs/SPEC.md 4.5, 4.8, 5.2). Positive amount = deposit, negative =
 * withdrawal. The goal line is optional.
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

export interface SavingsModel {
  readonly name: string;
  readonly currency: string;
  readonly goal: Minor | null;
  readonly ledger: Ledger;
}

const KEY_LABEL = 'Ціль';

export interface SavingsStats {
  readonly balance: Minor;
  readonly balanceUah: Minor;
  readonly otherCurrencyOps: number;
  readonly progress: number | null;
}

export function savingsStats(model: SavingsModel): SavingsStats {
  const ops = operations(model.ledger);
  const own = ops.filter((op) => op.currency === model.currency);
  const balance = sum(own.map((op) => op.amount));
  return {
    balance,
    balanceUah: sum(ops.map((op) => op.uah)),
    otherCurrencyOps: ops.length - own.length,
    progress: model.goal === null ? null : percent(balance, model.goal),
  };
}

function SavingsCard({ model, issues, readOnly, open, onToggle, onChange }: CardProps<SavingsModel>) {
  const stats = savingsStats(model);
  const extraIssues =
    stats.otherCurrencyOps > 0
      ? [{ message: `Операцій в іншій валюті: ${stats.otherCurrencyOps}; у балансі не враховані.`, critical: false }]
      : [];
  const details: [string, string][] = [['Баланс', formatMoneyUi(stats.balance, model.currency)]];
  if (model.goal !== null) details.push(['Ціль', formatMoneyUi(model.goal, model.currency)]);
  details.push(['Внесено в грн (сума)', formatMoneyUi(stats.balanceUah, 'UAH')]);
  return (
    <LedgerCard
      name={model.name}
      currency={model.currency}
      headline={stats.balance}
      progress={stats.progress}
      progressLabel="Від цілі"
      details={details}
      ledger={model.ledger}
      issues={[...issues, ...extraIssues]}
      readOnly={readOnly}
      open={open}
      onToggle={onToggle}
      actions={[
        { label: '+ Поповнити', formTitle: 'Поповнення', sign: 1 },
        { label: '− Списати', formTitle: 'Списання', sign: -1 },
      ]}
      onAdd={(op) => onChange({ ...model, ledger: appendOperation(model.ledger, op) })}
    />
  );
}

export const savingsTemplate: SectionTemplate<SavingsModel> = {
  id: 'savings',
  formatVersion: 1,
  parentHeading: 'Накопичення',
  match: (heading, parent) => matchesLedgerHeading(heading, parent, 'Накопичення'),
  parse(block) {
    const parsed = parseLedgerSection(block, KEY_LABEL);
    return {
      model: { name: parsed.name, currency: parsed.currency, goal: parsed.key, ledger: parsed.ledger },
      issues: parsed.issues,
    };
  },
  summary(model) {
    const s = savingsStats(model);
    const goal =
      model.goal === null
        ? ''
        : ` · ціль: ${formatAmount(model.goal)} ${model.currency} · ${s.progress ?? 0}%`;
    return [`_Баланс: ${formatAmount(s.balance)} ${model.currency}${goal}_`];
  },
  serialize(model) {
    return [
      `### ${model.name} · ${model.currency}`,
      ...(model.goal === null ? [] : [`${KEY_LABEL}: ${formatAmount(model.goal)} ${model.currency}`]),
      ...savingsTemplate.summary(model),
      ...ledgerLines(model.ledger),
    ];
  },
  create: (input) => ({
    name: input.name.trim(),
    currency: input.currency,
    goal: input.amount,
    ledger: EMPTY_LEDGER,
  }),
  name: (model) => model.name,
  views: { Card: SavingsCard },
};
