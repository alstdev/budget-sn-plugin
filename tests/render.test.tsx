// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { Bridge, Diagnostics, NoteSnapshot, SaveOutcome, SaveRequest } from '../src/bridge';
import { App } from '../src/ui/App';
import { debtTemplate, type DebtModel } from '../src/templates/debts';

const XSS = '<img src=x onerror="globalThis.pwned=1"><script>globalThis.pwned=1</script>';

let root: HTMLElement;
afterEach(() => {
  render(null, root);
  root.remove();
});

function mount(node: preact.ComponentChild): HTMLElement {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(node, root);
  });
  return root;
}

class FakeBridge implements Bridge {
  saves: SaveRequest[] = [];
  private listener: ((n: NoteSnapshot) => void) | null = null;
  constructor(private note: NoteSnapshot) {}
  onNote(listener: (n: NoteSnapshot) => void) {
    this.listener = listener;
    listener(this.note);
    return () => {
      this.listener = null;
    };
  }
  push(note: NoteSnapshot) {
    this.note = note;
    void act(() => {
      this.listener?.(note);
    });
  }
  onDiagnostics() {
    return () => undefined;
  }
  diagnostics(): Diagnostics {
    throw new Error('not used');
  }
  save(request: SaveRequest): SaveOutcome {
    if (this.note.locked) return 'locked';
    this.saves.push(request);
    return 'queued';
  }
}

const note = (text: string, locked = false): NoteSnapshot => ({ uuid: 'n1', text, locked, meta: undefined });

function type(el: Element | null, value: string) {
  if (!(el instanceof HTMLInputElement)) throw new Error('input expected');
  void act(() => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function click(el: Element | null | undefined) {
  if (!(el instanceof HTMLElement)) throw new Error('element expected');
  void act(() => {
    el.click();
  });
}

const button = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label);

describe('rendering note content as text (SPEC 7.8)', () => {
  it('HTML in names, comments and raw rows is shown as text', () => {
    const model: DebtModel = {
      name: XSS,
      currency: 'UAH',
      start: 100,
      ledger: {
        extraHeaders: [],
        rows: [
          { kind: 'op', op: { date: '2026-01-01', amount: 1, currency: 'UAH', uah: 1, comment: XSS, extra: [] } },
          { kind: 'raw', text: `| ${XSS} |`, reason: 'тест' },
        ],
      },
    };
    const Card = debtTemplate.views.Card;
    const c = mount(<Card model={model} issues={[]} readOnly={false} open onToggle={() => undefined} onChange={() => null} />);
    expect(c.querySelector('img, script')).toBeNull();
    expect(c.textContent).toContain(XSS);
    expect((globalThis as { pwned?: number }).pwned).toBeUndefined();
  });

  it('unknown sections are shown as text', () => {
    const bridge = new FakeBridge(note(`# Б\n> budget v1\n\n## Інше\n${XSS}\n`));
    const c = mount(<App bridge={bridge} />);
    click(button(c, 'Інше (1)'));
    expect(c.querySelector('img, script')).toBeNull();
    expect(c.querySelector('pre')?.textContent).toContain(XSS);
  });
});

describe('App flow', () => {
  it('creates a budget in an empty note, adds a debt and a payment', () => {
    const bridge = new FakeBridge(note(''));
    const c = mount(<App bridge={bridge} />);
    click(button(c, 'Створити бюджет'));
    expect(bridge.saves[0]?.text).toMatch(/^# Бюджет \d{4}\n> формат: budget v1/);

    click(button(c, '+ Борг'));
    type(c.querySelector('.dialog input'), 'Кредит');
    const inputs = c.querySelectorAll('.dialog input');
    type(inputs[inputs.length - 1] ?? null, '1 000');
    click(button(c, 'Додати'));
    expect(bridge.saves[1]?.text).toContain('### Кредит · UAH\nПочаткова сума: 1000 UAH\n');
    expect(bridge.saves[1]?.preview).toBe('Борги: 1 000 ₴');

    click(c.querySelector('.card-toggle'));
    click(button(c, '+ Платіж'));
    const [, amount] = [...c.querySelectorAll('.dialog input')];
    type(amount ?? null, '250');
    click(button(c, 'Зберегти'));
    const last = bridge.saves[bridge.saves.length - 1];
    expect(last?.text).toMatch(/\| \d{4}-\d{2}-\d{2} \| {2}250 \| UAH \| {3}250 \|/);
    expect(last?.text).toContain('_Залишок: 750 UAH · сплачено: 250 UAH · у грн: 250 UAH_');
    expect(last?.preview).toBe('Борги: 750 ₴');
    expect(last?.meta).toMatchObject({ v: 1, ui: { tab: 'debts', open: ['debt:Кредит'] } });
  });

  it('locked notes are read-only', () => {
    const bridge = new FakeBridge(note('# Б\n> budget v1\n\n## Борги\n\n### А · UAH\nПочаткова сума: 5 UAH\n', true));
    const c = mount(<App bridge={bridge} />);
    expect(c.textContent).toContain('Нотатка заблокована');
    expect(button(c, '+ Борг')).toBeUndefined();
    click(c.querySelector('.card-toggle'));
    expect(button(c, '+ Платіж')).toBeUndefined();
    expect(bridge.saves).toHaveLength(0);
  });

  it('notes without the format marker are read-only', () => {
    const bridge = new FakeBridge(note('# Звичайна нотатка\nтекст\n'));
    const c = mount(<App bridge={bridge} />);
    expect(c.textContent).toContain('не у форматі «budget v1»');
    expect(button(c, '+ Борг')).toBeUndefined();
  });

  it('an external change while a form is open is applied to the latest note', () => {
    const start = '# Б\n> budget v1\n\n## Борги\n\n### А · UAH\nПочаткова сума: 100 UAH\n';
    const bridge = new FakeBridge(note(start));
    const c = mount(<App bridge={bridge} />);
    click(c.querySelector('.card-toggle'));
    click(button(c, '+ Платіж'));
    const [, amount] = [...c.querySelectorAll('.dialog input')];
    type(amount ?? null, '10');
    // Another device adds text to the note meanwhile.
    bridge.push(note(`${start}\n## Нотатки\nз іншого пристрою\n`));
    expect(c.textContent).toContain('Нотатку змінено в іншому місці');
    click(button(c, 'Зберегти'));
    const text = bridge.saves[0]?.text ?? '';
    expect(text).toContain('з іншого пристрою');
    expect(text).toContain('_Залишок: 90 UAH');
  });
});
