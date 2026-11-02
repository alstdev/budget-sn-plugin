// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { Bridge, Diagnostics, NoteSnapshot, SaveOutcome, SaveRequest } from '../src/bridge';
import { App } from '../src/ui/App';
import { debtTemplate, type DebtModel } from '../src/templates/debts';
import months from './fixtures/months.md?raw';

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
    const context = { monthKeys: [], debtNames: [], savingsNames: [], fixed: [], lastCur: { exp: 'UAH', inc: 'UAH' } };
    const c = mount(
      <Card model={model} issues={[]} readOnly={false} open onToggle={() => undefined} onChange={() => null} context={context} act={() => null} />,
    );
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

    click(button(c, 'Борги'));
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
    click(button(c, 'Борги'));
    expect(button(c, '+ Борг')).toBeUndefined();
    click(c.querySelector('.card-toggle'));
    expect(button(c, '+ Платіж')).toBeUndefined();
    expect(bridge.saves).toHaveLength(0);
  });

  it('notes without the format marker are read-only', () => {
    const bridge = new FakeBridge(note('# Звичайна нотатка\nтекст\n'));
    const c = mount(<App bridge={bridge} />);
    expect(c.textContent).toContain('не у форматі «budget v1»');
    click(button(c, 'Борги'));
    expect(button(c, '+ Борг')).toBeUndefined();
  });

  it('an external change while a form is open is applied to the latest note', () => {
    const start = '# Б\n> budget v1\n\n## Борги\n\n### А · UAH\nПочаткова сума: 100 UAH\n';
    const bridge = new FakeBridge(note(start));
    const c = mount(<App bridge={bridge} />);
    click(button(c, 'Борги'));
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

describe('months flow (SPEC 4.7)', () => {
  const now = () => new Date(2026, 9, 20);

  it('pays a pending row from the months tab; the last month is open', () => {
    const bridge = new FakeBridge(note(months));
    const c = mount(<App bridge={bridge} now={now} />);
    expect(c.textContent).toContain('Очікують оплати');
    click(button(c, 'Місяці'));
    const pay = [...c.querySelectorAll('button')].filter((b) => b.textContent === 'Оплатити');
    expect(pay).toHaveLength(2);
    click(pay[0]);
    expect(c.querySelector('[role="dialog"] h3')?.textContent).toBe('Оплатити: Інтернет');
    click(c.querySelector('[role="dialog"] button[type="submit"]'));
    const text = bridge.saves[0]?.text ?? '';
    expect(text).toMatch(/\| \d{4}-\d{2}-\d{2} \| Інтернет {2}\| {3}300 \| UAH \| {3}300 \| пост/);
    expect(bridge.saves[0]?.meta).toMatchObject({ lastCur: { exp: 'UAH' } });
  });

  it('creates the next month from the template', () => {
    const bridge = new FakeBridge(note(months));
    const c = mount(<App bridge={bridge} now={now} />);
    click(button(c, 'Місяці'));
    click(button(c, 'Створити 2026-11 Листопад з шаблону'));
    expect(bridge.saves[0]?.text).toContain('### 2026-11 Листопад');
    expect(button(c, 'Створити 2026-12 Грудень з шаблону')).toBeDefined();
  });

  it('debt payment form offers the month checkbox only when the month exists', () => {
    const bridge = new FakeBridge(note(months));
    const c = mount(<App bridge={bridge} now={now} />);
    click(button(c, 'Борги'));
    click(c.querySelector('.card-toggle'));
    click(button(c, '+ Платіж'));
    const box = c.querySelector('.dialog input[type="checkbox"]');
    if (!(box instanceof HTMLInputElement)) throw new Error('checkbox expected');
    // The form defaults to the real current date, so set it explicitly.
    type(c.querySelector('.dialog input[type="date"]'), '2026-12-01');
    expect(box.disabled).toBe(true);
    type(c.querySelector('.dialog input[type="date"]'), '2026-10-28');
    expect(box.disabled).toBe(false);
    const [, amount] = [...c.querySelectorAll('.dialog input')];
    type(amount ?? null, '500');
    click(button(c, 'Зберегти'));
    const text = bridge.saves[0]?.text ?? '';
    expect(text).toContain('| 2026-10-28 |  500 | UAH |   500 |');
    expect(text).toMatch(/\| 2026-10-28 \| Кредитка +\| +500 \| UAH \| +500 \| борг/);
  });
});

describe('"+ Розділ" dialog and mobile button (SPEC 4.1, 8)', () => {
  it('creates a custom table through the dialog; Escape closes it', () => {
    const bridge = new FakeBridge(note(months));
    const c = mount(<App bridge={bridge} now={() => new Date(2026, 9, 20)} />);
    expect(c.querySelector('button.fab')?.getAttribute('aria-label')).toBe('Новий розділ');
    click(button(c, '+ Розділ'));
    expect(c.querySelector('[aria-modal="true"]')).not.toBeNull();
    // Escape closes the dialog.
    void act(() => {
      c.querySelector('[aria-modal="true"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(c.querySelector('[aria-modal="true"]')).toBeNull();

    click(c.querySelector('button.fab'));
    const choice = [...c.querySelectorAll('.choices button')].find((b) => b.textContent.includes('Довільна таблиця'));
    click(choice);
    const [title, cols] = [...c.querySelectorAll('[aria-modal="true"] input')];
    type(title ?? null, 'Підписки');
    type(cols ?? null, 'Сервіс, Ціна');
    click(c.querySelector('[aria-modal="true"] button[type="submit"]'));
    expect(c.querySelector('[aria-modal="true"]')).toBeNull();
    expect(bridge.saves[0]?.text.endsWith('## Підписки\n| Сервіс | Ціна |\n| ------ | ---- |\n')).toBe(true);
  });

  it('shows consistency warnings in the overview and cards', () => {
    const text = months.replace('| 2026-10-05 | 6000 | UAH | 6000 | платіж |', '| 2026-10-06 | 6000 | UAH | 6000 | платіж |');
    const bridge = new FakeBridge(note(text));
    const c = mount(<App bridge={bridge} now={() => new Date(2026, 9, 20)} />);
    expect(c.textContent).toContain('Неузгоджених записів між місяцями й боргами/накопиченнями: 2');
    click(button(c, 'Борги'));
    click(c.querySelector('.card-toggle'));
    expect(c.textContent).toContain('2026-10-06 6000 UAH: немає рядка у витратах місяця 2026-10.');
  });
});
