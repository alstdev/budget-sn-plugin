import { useEffect, useRef, useState } from 'preact/hooks';
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
import { formatMoneyUi, sum } from '../core/money';
import { getTemplate } from '../core/registry';
import { checkSave } from '../core/saveGuard';
import { debtStats, type DebtModel } from '../templates/debts';
import { savingsStats, type SavingsModel } from '../templates/savings';
import { NewSectionForm } from './NewSectionForm';

const SAVE_ERRORS: Readonly<Record<Exclude<SaveOutcome, 'queued'>, string>> = {
  'not-ready': 'Нотатка ще не отримана від Standard Notes.',
  locked: 'Нотатка заблокована (Prevent editing).',
  invalid: 'Некоректні дані для збереження.',
  'too-large': 'Нотатка завелика для збереження.',
};

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'debts', label: 'Борги' },
  { id: 'savings', label: 'Накопичення' },
  { id: 'other', label: 'Інше' },
];

const TAB_TEMPLATE: Readonly<Record<Exclude<Tab, 'other'>, string>> = { debts: 'debt', savings: 'savings' };

function totalsByCurrency(items: readonly (readonly [string, number])[]): string {
  const totals = new Map<string, number[]>();
  for (const [currency, value] of items) totals.set(currency, [...(totals.get(currency) ?? []), value]);
  return [...totals.entries()].map(([c, values]) => formatMoneyUi(sum(values), c)).join(' + ');
}

/** Note preview shown in the Standard Notes list (docs/SPEC.md 6.4). */
export function buildPreview(doc: BudgetDocument): string {
  const debts = sectionsOf(doc, 'debt').map(({ block }) => {
    const model = block.model as DebtModel;
    return [model.currency, debtStats(model).remaining] as const;
  });
  const savings = sectionsOf(doc, 'savings').map(({ block }) => {
    const model = block.model as SavingsModel;
    return [model.currency, savingsStats(model).balance] as const;
  });
  const parts: string[] = [];
  if (debts.length > 0) parts.push(`Борги: ${totalsByCurrency(debts)}`);
  if (savings.length > 0) parts.push(`Накопичення: ${totalsByCurrency(savings)}`);
  return parts.length > 0 ? parts.join(' · ') : 'Бюджет';
}

interface Banner {
  readonly kind: 'info' | 'error';
  readonly text: string;
}

export function App({ bridge }: { readonly bridge: Bridge }) {
  const [doc, setDoc] = useState<BudgetDocument | null>(null);
  const [locked, setLocked] = useState(false);
  const [meta, setMeta] = useState<NoteMeta>(DEFAULT_META);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [adding, setAdding] = useState<Exclude<Tab, 'other'> | null>(null);

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
    const outcome = bridge.save({ text, preview: buildPreview(next), meta: writeMeta(metaRef.current) });
    if (outcome !== 'queued') return SAVE_ERRORS[outcome];
    const saved = parseDocument(text);
    lastText.current = text;
    docRef.current = saved;
    setDoc(saved);
    setBanner(null);
    return null;
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
              const error = commit(parseDocument(skeletonText(new Date().getFullYear())));
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

  const toggle = (key: string) => {
    const open = metaRef.current.ui.open;
    const next = open.includes(key) ? open.filter((k) => k !== key) : [...open, key];
    updateMeta({ ...metaRef.current, ui: { ...metaRef.current.ui, open: next } });
  };

  const renderSections = (templateId: string) => {
    const template = getTemplate(templateId);
    const list = sectionsOf(doc, templateId);
    if (list.length === 0) return <p class="muted">Ще немає жодного розділу.</p>;
    return list.map(({ block }) => {
      const name = template.name(block.model);
      const key = `${templateId}:${name}`;
      const Card = template.Card;
      return (
        <Card
          key={key}
          model={block.model}
          issues={block.issues}
          readOnly={!writable || block.readOnly}
          open={meta.ui.open.includes(key)}
          onToggle={() => {
            toggle(key);
          }}
          onChange={(nextModel) => {
            const current = docRef.current;
            if (current === null) return 'Нотатка ще не отримана.';
            const index = findSection(current, templateId, name);
            if (index === -1) return 'Розділ змінено або видалено в іншому місці; операцію не збережено.';
            const result = updateSection(current, index, nextModel);
            return result.ok ? commit(result.doc) : result.error;
          }}
        />
      );
    });
  };

  const addForm = (which: Exclude<Tab, 'other'>) => {
    const templateId = TAB_TEMPLATE[which];
    const isDebt = which === 'debts';
    return (
      <NewSectionForm
        title={isDebt ? 'Новий борг' : 'Нове накопичення'}
        amountLabel={isDebt ? 'Початкова сума' : 'Ціль'}
        amountRequired={isDebt}
        onSubmit={(input) => {
          const current = docRef.current;
          if (current === null) return 'Нотатка ще не отримана.';
          const result = addSection(current, templateId, getTemplate(templateId).create(input));
          if (!result.ok) return result.error;
          const error = commit(result.doc);
          if (error === null) setAdding(null);
          return error;
        }}
        onCancel={() => {
          setAdding(null);
        }}
      />
    );
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
      <div class="tabs" role="tablist" aria-label="Розділи бюджету">
        {TABS.map((t) => (
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
            {t.id === 'other' && others.length > 0 ? ` (${others.length})` : ''}
          </button>
        ))}
      </div>
      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} class="panel">
        {tab === 'other' ? (
          others.length === 0 ? (
            <p class="muted">Нерозпізнаного вмісту немає.</p>
          ) : (
            others.map((text, i) => (
              <details key={i} class="unknown">
                <summary>Невідомий розділ {i + 1}</summary>
                <pre>{text}</pre>
              </details>
            ))
          )
        ) : (
          <>
            {renderSections(TAB_TEMPLATE[tab])}
            {writable && adding === tab && addForm(tab)}
            {writable && adding !== tab && (
              <div class="actions">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(tab);
                  }}
                >
                  {tab === 'debts' ? '+ Борг' : '+ Накопичення'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
