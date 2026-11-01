import { describe, expect, it } from 'vitest';
import { createBridge, type BridgeWindow, type RelayLike } from '../src/bridge';

const EXT = 'io.example.ext';
const ORIGIN = 'https://app.example.org';

class FakeWindow extends EventTarget {
  readonly parent: object = { name: 'parent' };
}

function messageEvent(source: unknown, origin: string, data: unknown): Event {
  const event = new Event('message');
  Object.defineProperties(event, {
    source: { value: source },
    origin: { value: origin },
    data: { value: data },
  });
  return event;
}

interface Harness {
  readonly win: FakeWindow;
  readonly libraryReceived: unknown[];
  readonly saves: { item: unknown; presave: () => void; done: (() => void) | undefined }[];
  stream: ((item: unknown) => void) | null;
}

function setup() {
  const win = new FakeWindow();
  const h: Harness = { win, libraryReceived: [], saves: [], stream: null };
  const bridge = createBridge(win as unknown as BridgeWindow, EXT, (w, onReady) => {
    // Simulates the library: its own listener, registered after the guard.
    (w as unknown as EventTarget).addEventListener('message', (e) => {
      const data = (e as MessageEvent).data as { action?: string };
      h.libraryReceived.push(data);
      if (data.action === 'component-registered') onReady();
    });
    const relay: RelayLike = {
      environment: 'web',
      platform: 'linux',
      streamContextItem(cb) {
        h.stream = cb;
      },
      saveItemWithPresave(item, presave, done) {
        h.saves.push({ item, presave, done });
      },
    };
    return relay;
  });
  const register = () => win.dispatchEvent(messageEvent(win.parent, ORIGIN, { action: 'component-registered' }));
  return { bridge, h, register };
}

const note = (text: string, appData?: Record<string, unknown>) => ({
  uuid: 'note-1',
  content: { text, ...(appData === undefined ? {} : { appData }) },
});

describe('bridge guard in front of the library', () => {
  it('stops rejected messages before the library sees them', () => {
    const { bridge, h } = setup();
    h.win.dispatchEvent(messageEvent(null, ORIGIN, { action: 'component-registered' }));
    h.win.dispatchEvent(messageEvent({}, ORIGIN, { action: 'component-registered' }));
    h.win.dispatchEvent(messageEvent(h.win.parent, ORIGIN, { action: 'themes' }));
    expect(h.libraryReceived).toEqual([]);
    const d = bridge.diagnostics();
    expect(d.rejected.source).toBe(2);
    expect(d.rejected.unregistered).toBe(1);
    expect(d.lastRejected).toEqual({ reason: 'unregistered', sourceKind: 'parent', origin: ORIGIN });
  });

  it('passes valid messages and pins the origin', () => {
    const { bridge, h, register } = setup();
    register();
    expect(h.libraryReceived).toHaveLength(1);
    h.win.dispatchEvent(messageEvent(h.win.parent, 'https://evil.example', { action: 'reply' }));
    expect(h.libraryReceived).toHaveLength(1);
    const d = bridge.diagnostics();
    expect(d.registered).toBe(true);
    expect(d.pinnedOrigin).toBe(ORIGIN);
    expect(d.accepted).toBe(1);
    expect(d.rejected.origin).toBe(1);
  });
});

describe('bridge notes and saving', () => {
  it('refuses to save before the first valid note', () => {
    const { bridge, h, register } = setup();
    expect(bridge.save({ text: 'x', preview: 'p' })).toBe('not-ready');
    register();
    expect(bridge.save({ text: 'x', preview: 'p' })).toBe('not-ready');
    h.stream?.({ uuid: 'bad' });
    expect(bridge.save({ text: 'x', preview: 'p' })).toBe('not-ready');
    expect(bridge.diagnostics().invalidItems).toBe(1);
    expect(h.saves).toHaveLength(0);
  });

  it('delivers notes and refuses to save a locked note', () => {
    const { bridge, h, register } = setup();
    const seen: unknown[] = [];
    bridge.onNote((n) => seen.push(n));
    register();
    h.stream?.(note('abc', { 'org.standardnotes.sn': { locked: true } }));
    expect(seen).toEqual([{ uuid: 'note-1', text: 'abc', locked: true, meta: undefined }]);
    expect(bridge.save({ text: 'x', preview: 'p' })).toBe('locked');
    expect(h.saves).toHaveLength(0);
  });

  it('writes text, preview and metadata into the item inside presave', () => {
    const { bridge, h, register } = setup();
    register();
    const item = note('old');
    h.stream?.(item);
    let confirmed = false;
    expect(bridge.save({ text: 'new', preview: 'P'.repeat(500), meta: { c: 1 } }, () => (confirmed = true))).toBe(
      'queued',
    );
    expect(h.saves).toHaveLength(1);
    const call = h.saves[0];
    expect(call?.item).toBe(item);
    expect(item.content.text).toBe('old'); // nothing changes before presave
    call?.presave();
    expect(item.content).toMatchObject({ text: 'new', appData: { [EXT]: { c: 1 } } });
    expect((item.content as { preview_plain?: string }).preview_plain).toHaveLength(160);
    call?.done?.();
    expect(confirmed).toBe(true);
    expect(bridge.diagnostics()).toMatchObject({ savesQueued: 1, savesConfirmed: 1 });
  });

  it('keeps existing appData domains when writing metadata', () => {
    const { bridge, h, register } = setup();
    register();
    const item = note('t', { 'org.standardnotes.sn': { pinned: true } });
    h.stream?.(item);
    bridge.save({ text: 't', preview: '', meta: { c: 2 } });
    h.saves[0]?.presave();
    expect(item.content.appData).toEqual({ 'org.standardnotes.sn': { pinned: true }, [EXT]: { c: 2 } });
  });

  it('rejects metadata that is not plain JSON', () => {
    const { bridge, h, register } = setup();
    register();
    h.stream?.(note('t'));
    const bad = { d: new Date() } as unknown as { c: number };
    expect(bridge.save({ text: 't', preview: '', meta: bad })).toBe('invalid');
    expect(bridge.save({ text: 't', preview: '', meta: { n: Number.NaN } })).toBe('invalid');
    expect(h.saves).toHaveLength(0);
  });
});

describe('bridge state after own saves', () => {
  it('keeps the queued text and metadata for the next save without notifying listeners', () => {
    const { bridge, h, register } = setup();
    let notified = 0;
    bridge.onNote(() => {
      notified += 1;
    });
    register();
    const item = note('a');
    h.stream?.(item);
    expect(notified).toBe(1);
    bridge.save({ text: 'b', preview: '', meta: { c: 1 } });
    bridge.save({ text: 'c', preview: '' });
    expect(notified).toBe(1);
    // Late subscribers see the adapter's current view.
    let latest: unknown = null;
    bridge.onNote((n) => {
      latest = n;
    });
    expect(latest).toEqual({ uuid: 'note-1', text: 'c', locked: false, meta: { c: 1 } });
  });
});

describe('coalesced saves', () => {
  it('keeps metadata when only the last presave of a burst runs', () => {
    const { bridge, h, register } = setup();
    register();
    const item = note('t', { 'org.standardnotes.sn': {} });
    h.stream?.(item);
    bridge.save({ text: 't', preview: '', meta: { c: 5 } });
    bridge.save({ text: 't2', preview: '' });
    // The library runs only the latest presave of the debounce window.
    h.saves[h.saves.length - 1]?.presave();
    expect(item.content).toMatchObject({ text: 't2', appData: { [EXT]: { c: 5 } } });
  });

  it('writes back metadata received from Standard Notes on a text-only save', () => {
    const { bridge, h, register } = setup();
    register();
    const item = note('t', { [EXT]: { c: 7 } });
    h.stream?.(item);
    bridge.save({ text: 'u', preview: '' });
    h.saves[0]?.presave();
    expect(item.content).toMatchObject({ text: 'u', appData: { [EXT]: { c: 7 } } });
  });
});
