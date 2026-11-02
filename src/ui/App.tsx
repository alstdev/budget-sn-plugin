import { useEffect, useRef, useState } from 'preact/hooks';
import { applyAction, docContext, type DocAction } from '../actions';
import type { Bridge, SaveOutcome } from '../bridge';
import {
  addSection,
  findSection,
  isWritable,
  parseDocument,
  sectionsOf,
  serializeDocument,
  skeletonText,
  unknownBlocks,
  updateSection,
  type BudgetDocument,
} from '../core/document';
import { DEFAULT_META, readMeta, writeMeta, type NoteMeta, type Tab } from '../core/meta';
import { formatMoneyUi } from '../core/money';
import { getTemplate } from '../core/registry';
import { checkSave } from '../core/saveGuard';
import { consistencyIssues } from '../core/validate';
import { monthStats, monthTitle, nextMonthKey, type MonthModel } from '../templates/months/model';
import { AddSectionDialog, type AddSectionHandlers } from './AddSectionDialog';
import { NewSectionForm } from './NewSectionForm';
import { buildPreview, monthKeyOf, moneyList, overview } from './overview';
import { FixedRowForm, PlannedRowForm } from './TemplateRowForms';

export { buildPreview } from './overview';

const SAVE_ERRORS: Readonly<Record<Exclude<SaveOutcome, 'queued'>, string>> = {
  'not-ready': 'Нотатка ще не отримана від Standard Notes.',
  locked: 'Нотатка заблокована (Prevent editing).',
  invalid: 'Некоректні дані для збереження.',
  'too-large': 'Нотатка завелика для збереження.',
};

const TAB_LABELS: readonly { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Огляд' },
  { id: 'debts', label: 'Борги' },
  { id: 'months', label: 'Місяці' },
  { id: 'savings', label: 'Накопичення' },
  { id: 'planning', label: 'Планування' },
  { id: 'other', label: 'Інше' },
];

type Adding = 'debt' | 'savings' | 'fixed' | 'planned' | null;

interface Banner {
  readonly kind: 'info' | 'error';
  readonly text: string;
}

export function App({ bridge, now = () => new Date() }: { readonly bridge: Bridge; readonly now?: () => Date }) {
  const [doc, setDoc] = useState<BudgetDocument | null>(null);
  const [locked, setLocked] = useState(false);
  const [meta, setMeta] = useState<NoteMeta>(DEFAULT_META);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [adding, setAdding] = useState<Adding>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Latest values for callbacks created in earlier renders.
  const lastText = useRef<string | null>(null);
  const docRef = useRef<BudgetDocument | null>(null);
  const metaRef = useRef<NoteMeta>(DEFAULT_META);
  const lockedRef = useRef(false);

  useEffect(
    () =>
      bridge.onNote((note) => {
        lockedRef.current = note.locked;
        setLocked(note.locked);
        if (note.text === lastText.current) return; // our own save coming back
        const first = lastText.current === null;
        const parsed = parseDocument(note.text);
        lastText.current = note.text;
        docRef.current = parsed;
        setDoc(parsed);
        if (first) {
          const m = readMeta(note.meta);
          metaRef.current = m;
          setMeta(m);
        } else {
          setBanner({ kind: 'info', text: 'Нотатку змінено в іншому місці; показано актуальну версію.' });
        }
      }),
    [bridge],
  );

  const updateMeta = (next: NoteMeta) => {
    // UI state is stored together with the next data save (no extra note saves).
    metaRef.current = next;
    setMeta(next);
  };

  /** Saves a changed document; returns an error text or null. */
  const commit = (next: BudgetDocument): string | null => {
    if (lockedRef.current) return SAVE_ERRORS.locked;
    if (!isWritable(next)) return 'Формат нотатки не підтримується для запису.';
    const text = serializeDocument(next);
    const verdict = checkSave(lastText.current ?? '', text, { explicitDelete: false });
    if (!verdict.ok) {
      setBanner({ kind: 'error', text: verdict.message });
      return verdict.message;
    }
    const outcome = bridge.save({ text, preview: buildPreview(next, now()), meta: writeMeta(metaRef.current) });
    if (outcome !== 'queued') return SAVE_ERRORS[outcome];
    const saved = parseDocument(text);
    lastText.current = text;
    docRef.current = saved;
    setDoc(saved);
    setBanner(null);
    return null;
  };

  /** Applies a multi-section action to the latest document and saves it. */
  const act = (action: DocAction): string | null => {
    const current = docRef.current;
    if (current === null) return 'Нотатка ще не отримана.';
    const result = applyAction(current, action);
    if (!result.ok) return result.error;
    const previous = metaRef.current;
    if (action.type === 'addMonthRow' || action.type === 'payPending') {
      const kind = action.type === 'addMonthRow' && action.table === 'income' ? 'inc' : 'exp';
      updateMeta({ ...previous, lastCur: { ...previous.lastCur, [kind]: action.row.currency } });
    }
    const error = commit(result.doc);
    if (error !== null) updateMeta(previous);
    return error;
  };

  if (doc === null) {
    return (
      <main class="app">
        <p class="muted">Очікування нотатки від Standard Notes…</p>
      </main>
    );
  }

  const writable = isWritable(doc) && !locked;
  const tab = meta.ui.tab;
  const others = unknownBlocks(doc);
  const context = docContext(doc, meta.lastCur);
  const consistency = consistencyIssues(doc);
  const warningCount = [...consistency.values()].reduce((n, list) => n + list.length, 0);

  const notices: string[] = [];
  if (locked) notices.push('Нотатка заблокована (Prevent editing): лише перегляд.');
  if (doc.format.kind === 'missing') {
    notices.push('Нотатка не у форматі «budget v1»: лише перегляд. Зразок формату — docs/SAMPLE.md у репозиторії плагіна.');
  }
  if (doc.format.kind === 'unsupported') {
    notices.push(`Формат ${doc.format.version} не підтримується цією версією плагіна: лише перегляд.`);
  }

  if (doc.format.kind === 'empty') {
    return (
      <main class="app">
        <p>Нотатка порожня.</p>
        {!locked && (
          <button
            type="button"
            class="primary"
            onClick={() => {
              const error = commit(parseDocument(skeletonText(now().getFullYear())));
              if (error !== null) setBanner({ kind: 'error', text: error });
            }}
          >
            Створити бюджет
          </button>
        )}
        {banner !== null && <p class={banner.kind}>{banner.text}</p>}
      </main>
    );
  }

  const setTab = (next: Tab) => {
    updateMeta({ ...metaRef.current, ui: { ...metaRef.current.ui, tab: next } });
    setAdding(null);
  };

  const months = sectionsOf(doc, 'month').map(({ block }) => (block.model as MonthModel).key);
  const lastMonth = months[months.length - 1];
  const anyMonthOpen = meta.ui.open.some((k) => k.startsWith('month:'));
  const isOpen = (key: string) =>
    meta.ui.open.includes(key) || (!anyMonthOpen && lastMonth !== undefined && key === `month:${lastMonth}`);

  const toggle = (key: string) => {
    let open = metaRef.current.ui.open;
    // The last month is open by default; make that explicit before toggling.
    if (!open.some((k) => k.startsWith('month:')) && lastMonth !== undefined) open = [...open, `month:${lastMonth}`];
    const next = open.includes(key) ? open.filter((k) => k !== key) : [...open, key];
    updateMeta({ ...metaRef.current, ui: { ...metaRef.current.ui, open: next } });
  };

  const renderSections = (templateId: string, empty: string) => {
    const template = getTemplate(templateId);
    const list = sectionsOf(doc, templateId);
    if (list.length === 0) return <p class="muted">{empty}</p>;
    return list.map(({ block }) => {
      const name = template.name(block.model);
      const key = `${templateId}:${name}`;
      const Card = template.Card;
      return (
        <Card
          key={key}
          model={block.model}
          issues={[...block.issues, ...(consistency.get(key) ?? [])]}
          readOnly={!writable || block.readOnly}
          open={isOpen(key)}
          onToggle={() => {
            toggle(key);
          }}
          onChange={(nextModel) => {
            const current = docRef.current;
            if (current === null) return 'Нотатка ще не отримана.';
            const index = findSection(current, templateId, name);
            if (index === -1) return 'Розділ змінено або видалено в іншому місці; не збережено.';
            const result = updateSection(current, index, nextModel);
            return result.ok ? commit(result.doc) : result.error;
          }}
          context={context}
          act={act}
        />
      );
    });
  };

  const addLedgerSection = (templateId: 'debt' | 'savings', input: Parameters<AddSectionHandlers['addDebt']>[0]) => {
    const current = docRef.current;
    if (current === null) return 'Нотатка ще не отримана.';
    const result = addSection(current, templateId, getTemplate(templateId).create(input));
    return result.ok ? commit(result.doc) : result.error;
  };

  const newSectionForm = (templateId: 'debt' | 'savings') => (
    <NewSectionForm
      title={templateId === 'debt' ? 'Новий борг' : 'Нове накопичення'}
      amountLabel={templateId === 'debt' ? 'Початкова сума' : 'Ціль'}
      amountRequired={templateId === 'debt'}
      onSubmit={(input) => {
        const error = addLedgerSection(templateId, input);
        if (error === null) setAdding(null);
        return error;
      }}
      onCancel={() => {
        setAdding(null);
      }}
    />
  );

  const addButton = (which: Exclude<Adding, null>, label: string) =>
    writable && adding !== which ? (
      <button
        type="button"
        onClick={() => {
          setAdding(which);
        }}
      >
        {label}
      </button>
    ) : null;

  const done = (error: string | null) => {
    if (error === null) setAdding(null);
    return error;
  };

  const nextKey = lastMonth === undefined ? monthKeyOf(now()) : nextMonthKey(lastMonth);
  const handlers: AddSectionHandlers = {
    nextMonth: { key: nextKey, title: monthTitle(nextKey) },
    defaultPlannedMonth: nextKey,
    debtNames: context.debtNames,
    savingsNames: context.savingsNames,
    addDebt: (input) => addLedgerSection('debt', input),
    addSavings: (input) => addLedgerSection('savings', input),
    createMonth: () => act({ type: 'createMonth', key: nextKey }),
    addFixed: (row) => act({ type: 'addFixed', row }),
    addPlanned: (row) => act({ type: 'addPlanned', row }),
    addTable: (title, columns) => act({ type: 'addTable', title, columns }),
  };

  const panel = () => {
    switch (tab) {
      case 'overview': {
        const o = overview(doc, now());
        const s = o.month === null ? null : monthStats(o.month);
        return (
          <div class="overview">
            <dl class="details">
              <dt>Борги</dt>
              <dd class="num">{o.debts.length === 0 ? '—' : moneyList(o.debts)}</dd>
              <dt>Накопичення</dt>
              <dd class="num">{o.savings.length === 0 ? '—' : moneyList(o.savings)}</dd>
            </dl>
            {o.month !== null && s !== null && (
              <>
                <h3>
                  {o.month.key} {o.month.title === '' ? monthTitle(o.month.key) : o.month.title}
                </h3>
                <dl class="details">
                  <dt>Надійшло</dt>
                  <dd class="num">{formatMoneyUi(s.incomeUah, 'UAH')}</dd>
                  <dt>Витрачено</dt>
                  <dd class="num">{formatMoneyUi(s.spentUah, 'UAH')}</dd>
                  <dt>Залишок</dt>
                  <dd class="num">{formatMoneyUi(s.balance, 'UAH')}</dd>
                  <dt>Після очікуваних</dt>
                  <dd class="num">{formatMoneyUi(s.afterPending, 'UAH')}</dd>
                </dl>
                <h4>Очікують оплати</h4>
                {o.pending.length === 0 ? (
                  <p class="muted">Немає.</p>
                ) : (
                  <ul class="plain-list">
                    {o.pending.map((r, i) => (
                      <li key={i}>
                        {r.name} — <span class="num">{formatMoneyUi(r.amount, r.currency)}</span>
                        {r.comment === '' ? '' : ` (${r.comment})`}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {o.month === null && <p class="muted">Місяців ще немає. Створіть перший на вкладці «Місяці».</p>}
            {warningCount > 0 && (
              <p class="notice">
                Неузгоджених записів між місяцями й боргами/накопиченнями: {warningCount}. Деталі — у картках
                (попередження, не помилка).
              </p>
            )}
            <h4>Заплановані покупки</h4>
            {o.planned.length === 0 ? (
              <p class="muted">Немає.</p>
            ) : (
              <ul class="plain-list">
                {o.planned.map((r, i) => (
                  <li key={i}>
                    {r.name} — <span class="num">{formatMoneyUi(r.budget, r.currency)}</span>
                    {r.month === '' ? '' : `, ${r.month}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }
      case 'debts':
        return (
          <>
            {renderSections('debt', 'Боргів ще немає.')}
            {adding === 'debt' && writable && newSectionForm('debt')}
            <div class="actions">{addButton('debt', '+ Борг')}</div>
          </>
        );
      case 'savings':
        return (
          <>
            {renderSections('savings', 'Накопичень ще немає.')}
            {adding === 'savings' && writable && newSectionForm('savings')}
            <div class="actions">{addButton('savings', '+ Накопичення')}</div>
          </>
        );
      case 'months': {
        return (
          <>
            {renderSections('month', 'Місяців ще немає.')}
            {writable && (
              <div class="actions">
                <button
                  type="button"
                  onClick={() => {
                    const error = act({ type: 'createMonth', key: nextKey });
                    if (error !== null) setBanner({ kind: 'error', text: error });
                  }}
                >
                  Створити {nextKey} {monthTitle(nextKey)} з шаблону
                </button>
              </div>
            )}
          </>
        );
      }
      case 'planning':
        return (
          <>
            {renderSections('fixed', 'Постійних витрат ще немає.')}
            {adding === 'fixed' && writable && (
              <FixedRowForm
                debtNames={context.debtNames}
                savingsNames={context.savingsNames}
                onSubmit={(row) => done(act({ type: 'addFixed', row }))}
                onCancel={() => {
                  setAdding(null);
                }}
              />
            )}
            <div class="actions">{addButton('fixed', '+ Постійна витрата')}</div>
            {renderSections('planned', 'Запланованих покупок ще немає.')}
            {adding === 'planned' && writable && (
              <PlannedRowForm
                defaultMonth={lastMonth === undefined ? monthKeyOf(now()) : nextMonthKey(lastMonth)}
                onSubmit={(row) => done(act({ type: 'addPlanned', row }))}
                onCancel={() => {
                  setAdding(null);
                }}
              />
            )}
            <div class="actions">{addButton('planned', '+ Покупка')}</div>
            <p class="hint">Змінити чи видалити рядки шаблону можна в Plain Editor.</p>
          </>
        );
      case 'other':
        return (
          <>
            {sectionsOf(doc, 'table').length > 0 && renderSections('table', '')}
            {others.length === 0 ? (
              <p class="muted">Нерозпізнаного вмісту немає.</p>
            ) : (
              others.map((text, i) => (
                <details key={i} class="unknown">
                  <summary>Невідомий розділ {i + 1}</summary>
                  <pre>{text}</pre>
                </details>
              ))
            )}
          </>
        );
    }
  };

  return (
    <main class="app">
      {notices.map((text) => (
        <p key={text} class="notice">
          {text}
        </p>
      ))}
      {banner !== null && (
        <p class={banner.kind} role={banner.kind === 'error' ? 'alert' : 'status'}>
          {banner.text}
        </p>
      )}
      <div class="tabbar">
      <div class="tabs" role="tablist" aria-label="Розділи бюджету">
        {TAB_LABELS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            class={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => {
              setTab(t.id);
            }}
          >
            {t.label}
            {t.id === 'other' && others.length + sectionsOf(doc, 'table').length > 0
              ? ` (${others.length + sectionsOf(doc, 'table').length})`
              : ''}
          </button>
        ))}
      </div>
        {writable && (
          <button
            type="button"
            class="add-section"
            onClick={() => {
              setShowAdd(true);
            }}
          >
            + Розділ
          </button>
        )}
      </div>
      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} class="panel">
        {panel()}
      </section>
      {writable && !showAdd && (
        <button
          type="button"
          class="fab"
          aria-label="Новий розділ"
          onClick={() => {
            setShowAdd(true);
          }}
        >
          +
        </button>
      )}
      {showAdd && (
        <AddSectionDialog
          handlers={handlers}
          onClose={() => {
            setShowAdd(false);
          }}
        />
      )}
    </main>
  );
}
