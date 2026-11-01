import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Bridge, Diagnostics, NoteSnapshot, SaveOutcome } from '../bridge';
import {
  STRESS_SIZES,
  TEST_MARKER,
  formatBytes,
  isTestNote,
  makeStressText,
  readProbeMeta,
  shortHash,
  utf8Length,
} from './probe';
import type { CspViolation, ThemeLinks } from './watchers';

interface Props {
  readonly bridge: Bridge;
  readonly csp: readonly CspViolation[];
  readonly themes: ThemeLinks;
}

interface NoteView {
  readonly uuid: string;
  readonly chars: number;
  readonly bytes: number;
  readonly locked: boolean;
  readonly isTest: boolean;
  readonly isEmpty: boolean;
  readonly counter: number;
}

interface SaveTiming {
  readonly what: string;
  readonly bytes: number;
  readonly ms: number | null;
}

const OUTCOME_TEXT: Readonly<Record<SaveOutcome, string>> = {
  queued: 'поставлено в чергу',
  'not-ready': 'нотатка ще не отримана',
  locked: 'нотатка заблокована (Prevent editing)',
  invalid: 'некоректні дані',
  'too-large': 'текст перевищує ліміт моста',
};

function yesNo(value: boolean): string {
  return value ? 'так' : 'ні';
}

export function App({ bridge, csp, themes }: Props) {
  const [diag, setDiag] = useState<Diagnostics>(() => bridge.diagnostics());
  const [note, setNote] = useState<NoteView | null>(null);
  const [text, setText] = useState<string>('');
  const [hash, setHash] = useState<string | null>(null);
  const [firstNoteMs, setFirstNoteMs] = useState<number | null>(null);
  const [updates, setUpdates] = useState(0);
  const [lastSave, setLastSave] = useState<SaveTiming | null>(null);
  const [message, setMessage] = useState<string>('');

  useEffect(() => bridge.onDiagnostics(setDiag), [bridge]);

  /** Shows a note state: received from SN or just queued for saving. */
  const show = (uuid: string, nextText: string, locked: boolean, counter: number) => {
    setText(nextText);
    setNote({
      uuid,
      chars: nextText.length,
      bytes: utf8Length(nextText),
      locked,
      isTest: isTestNote(nextText),
      isEmpty: nextText.length === 0,
      counter,
    });
    setHash(null);
    void shortHash(nextText).then(setHash);
  };

  useEffect(
    () =>
      bridge.onNote((snapshot: NoteSnapshot) => {
        setFirstNoteMs((prev) => prev ?? Math.round(performance.now()));
        setUpdates((n) => n + 1);
        show(snapshot.uuid, snapshot.text, snapshot.locked, readProbeMeta(snapshot.meta).probeCounter);
      }),
    [bridge],
  );

  const canWrite = note !== null && !note.locked && note.isTest;
  const environment = diag.environment ?? '—';
  const platform = diag.platform ?? '—';

  const write = (what: string, nextText: string, meta?: { probeCounter: number }) => {
    const started = performance.now();
    const bytes = utf8Length(nextText);
    setLastSave({ what, bytes, ms: null });
    const outcome = bridge.save(
      {
        text: nextText,
        preview: `Budget hello: ${formatBytes(bytes)}`,
        ...(meta === undefined ? {} : { meta }),
      },
      () => {
        setLastSave({ what, bytes, ms: Math.round(performance.now() - started) });
      },
    );
    setMessage(`${what}: ${OUTCOME_TEXT[outcome]}`);
    if (outcome === 'queued' && note !== null) {
      show(note.uuid, nextText, note.locked, meta?.probeCounter ?? note.counter);
    }
  };

  const markAsTest = () => {
    write('Позначити як тестову', `${TEST_MARKER}\n`);
  };
  const appendLine = () => {
    write('Додати рядок', `${text}${environment}/${platform} ${new Date().toISOString()}\n`);
  };
  const bumpMeta = () => {
    write('Метадані +1', text, { probeCounter: (note?.counter ?? 0) + 1 });
  };

  const rejectedTotal = Object.values(diag.rejected).reduce((a, b) => a + b, 0);

  const report = useMemo(() => {
    const lines = [
      `budget-hello report`,
      `environment=${environment} platform=${platform}`,
      `registered=${diag.registered} pinnedOrigin=${diag.pinnedOrigin ?? '-'}`,
      `accepted=${diag.accepted} rejected=${JSON.stringify(diag.rejected)}`,
      `lastRejected=${diag.lastRejected === null ? '-' : `${diag.lastRejected.reason}/${diag.lastRejected.sourceKind}/${diag.lastRejected.origin || '(empty)'}`}`,
      `notes=${diag.notesReceived} invalidItems=${diag.invalidItems} saves=${diag.savesConfirmed}/${diag.savesQueued}`,
      `firstNoteMs=${firstNoteMs ?? '-'} updates=${updates}`,
      `note: chars=${note?.chars ?? '-'} bytes=${note?.bytes ?? '-'} hash=${hash ?? '-'} locked=${note?.locked ?? '-'} test=${note?.isTest ?? '-'} counter=${note?.counter ?? '-'}`,
      `lastSave=${lastSave === null ? '-' : `${lastSave.what} ${lastSave.bytes}B ${lastSave.ms ?? 'pending'}ms`}`,
      `themeLinks=${themes.count} [${themes.origins.join(', ')}]`,
      `csp=${csp.length === 0 ? '-' : csp.map((v) => `${v.directive} ${v.blocked} x${v.count}`).join('; ')}`,
    ];
    return lines.join('\n');
  }, [diag, environment, platform, firstNoteMs, updates, note, hash, lastSave, themes, csp]);

  return (
    <main class="hello">
      <h1>Budget hello — етап 0</h1>
      <p class="warn">
        Перевірка платформи. Відкривайте лише на окремій тестовій нотатці: плагін змінює текст,
        тільки якщо нотатка порожня або позначена ним як тестова.
      </p>

      <section aria-labelledby="h-platform">
        <h2 id="h-platform">Платформа</h2>
        <dl>
          <dt>Середовище</dt>
          <dd>{environment}</dd>
          <dt>Платформа</dt>
          <dd>{platform}</dd>
          <dt>Зареєстровано в SN</dt>
          <dd>{yesNo(diag.registered)}</dd>
          <dt>Origin батька</dt>
          <dd>{diag.pinnedOrigin ?? '—'}</dd>
        </dl>
      </section>

      <section aria-labelledby="h-note">
        <h2 id="h-note">Нотатка</h2>
        <dl>
          <dt>Отримано</dt>
          <dd>{note === null ? 'ні' : `так, оновлень: ${updates}`}</dd>
          <dt>Від старту до першої нотатки</dt>
          <dd>{firstNoteMs === null ? '—' : `${firstNoteMs} мс`}</dd>
          <dt>Довжина</dt>
          <dd>{note === null ? '—' : `${note.chars} симв., ${formatBytes(note.bytes)}`}</dd>
          <dt>Відбиток SHA-256</dt>
          <dd class="mono">{hash ?? '—'}</dd>
          <dt>Заблокована (locked)</dt>
          <dd>{note === null ? '—' : yesNo(note.locked)}</dd>
          <dt>Тестова нотатка</dt>
          <dd>{note === null ? '—' : yesNo(note.isTest)}</dd>
          <dt>Лічильник у метаданих</dt>
          <dd>{note === null ? '—' : note.counter}</dd>
        </dl>
      </section>

      <section aria-labelledby="h-actions">
        <h2 id="h-actions">Дії</h2>
        <div class="buttons">
          <button
            type="button"
            onClick={markAsTest}
            disabled={note === null || note.locked || !note.isEmpty}
          >
            Позначити порожню нотатку як тестову
          </button>
          <button type="button" onClick={appendLine} disabled={!canWrite}>
            Додати рядок
          </button>
          <button type="button" onClick={bumpMeta} disabled={!canWrite}>
            Метадані +1
          </button>
          {STRESS_SIZES.map((size) => (
            <button
              key={size.label}
              type="button"
              disabled={!canWrite}
              onClick={() => { write(`Записати ${size.label}`, makeStressText(size.bytes)); }}
            >
              Записати {size.label}
            </button>
          ))}
        </div>
        <p role="status">{message}</p>
        <dl>
          <dt>Останнє збереження</dt>
          <dd>
            {lastSave === null
              ? '—'
              : `${lastSave.what}, ${formatBytes(lastSave.bytes)}: ${
                  lastSave.ms === null ? 'чекаємо підтвердження…' : `${lastSave.ms} мс`
                }`}
          </dd>
        </dl>
        <p class="hint">Час збереження включає затримку 350 мс перед відправкою.</p>
      </section>

      <section aria-labelledby="h-security">
        <h2 id="h-security">Безпека</h2>
        <dl>
          <dt>Повідомлень прийнято</dt>
          <dd>{diag.accepted}</dd>
          <dt>Відкинуто</dt>
          <dd>
            {rejectedTotal}
            {rejectedTotal > 0 &&
              ` (${Object.entries(diag.rejected)
                .filter(([, n]) => n > 0)
                .map(([reason, n]) => `${reason}: ${n}`)
                .join(', ')})`}
          </dd>
          <dt>Останнє відкинуте</dt>
          <dd>
            {diag.lastRejected === null
              ? '—'
              : `${diag.lastRejected.reason}, source=${diag.lastRejected.sourceKind}, origin=${
                  diag.lastRejected.origin || '(порожній)'
                }`}
          </dd>
          <dt>Некоректних нотаток</dt>
          <dd>{diag.invalidItems}</dd>
          <dt>Стилі теми</dt>
          <dd>
            {themes.count === 0 ? 'немає' : `${themes.count}: ${themes.origins.join(', ')}`}
          </dd>
          <dt>Порушення CSP</dt>
          <dd>
            {csp.length === 0 ? (
              'немає'
            ) : (
              <ul>
                {csp.map((v) => (
                  <li key={`${v.directive} ${v.blocked}`}>
                    {v.directive}: {v.blocked} ×{v.count}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </section>

      <section aria-labelledby="h-report">
        <h2 id="h-report">Звіт</h2>
        <p class="hint">Без вмісту нотатки. Виділіть і скопіюйте в docs/STAGE0.md або в чат.</p>
        <label class="sr-only" for="report">
          Звіт
        </label>
        <textarea id="report" readOnly rows={12} value={report} />
      </section>
    </main>
  );
}
