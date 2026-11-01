import { describe, expect, it } from 'vitest';
import {
  MAX_MESSAGE_CHARS,
  checkMessage,
  isPinnableOrigin,
  parsePayload,
  type GuardState,
} from '../src/bridge/guard';

const parent = { name: 'parent' };
const self = { name: 'self' };
const ORIGIN = 'https://app.example.org';
const registered = { action: 'component-registered', sessionKey: 'k' };

const fresh = (): GuardState => ({ pinnedOrigin: null });

describe('checkMessage', () => {
  it('rejects everything when the page is not framed', () => {
    const r = checkMessage({ source: self, origin: ORIGIN, data: registered }, self, self, fresh());
    expect(r).toEqual({ ok: false, reason: 'not-framed', sourceKind: 'parent' });
  });

  it('rejects messages whose source is not window.parent', () => {
    for (const [source, kind] of [
      [null, 'null'],
      [undefined, 'null'],
      [self, 'self'],
      [{}, 'other'],
    ] as const) {
      const r = checkMessage({ source, origin: ORIGIN, data: registered }, parent, self, fresh());
      expect(r).toEqual({ ok: false, reason: 'source', sourceKind: kind });
    }
  });

  it('accepts only component-registered before the origin is pinned', () => {
    const state = fresh();
    const r = checkMessage({ source: parent, origin: ORIGIN, data: { action: 'themes' } }, parent, self, state);
    expect(r).toMatchObject({ ok: false, reason: 'unregistered' });
    expect(state.pinnedOrigin).toBeNull();
  });

  it('pins the origin of component-registered and rejects other origins later', () => {
    const state = fresh();
    expect(checkMessage({ source: parent, origin: ORIGIN, data: registered }, parent, self, state)).toEqual({
      ok: true,
      action: 'component-registered',
    });
    expect(state.pinnedOrigin).toBe(ORIGIN);

    const reply = { action: 'reply', original: { messageId: '1' } };
    expect(checkMessage({ source: parent, origin: ORIGIN, data: reply }, parent, self, state)).toMatchObject({ ok: true });
    expect(
      checkMessage({ source: parent, origin: 'https://evil.example', data: reply }, parent, self, state),
    ).toMatchObject({ ok: false, reason: 'origin' });
    // A second registration from another origin cannot re-pin.
    expect(
      checkMessage({ source: parent, origin: 'https://evil.example', data: registered }, parent, self, state),
    ).toMatchObject({ ok: false, reason: 'origin' });
    expect(state.pinnedOrigin).toBe(ORIGIN);
  });

  it('refuses to pin opaque or malformed origins', () => {
    for (const origin of ['', 'null', 'https://app.example.org/path', 'not a url']) {
      const state = fresh();
      expect(checkMessage({ source: parent, origin, data: registered }, parent, self, state)).toMatchObject({
        ok: false,
        reason: 'origin',
      });
      expect(state.pinnedOrigin).toBeNull();
    }
  });

  it('accepts JSON strings (mobile) and rejects malformed payloads', () => {
    const state = fresh();
    expect(
      checkMessage({ source: parent, origin: ORIGIN, data: JSON.stringify(registered) }, parent, self, state),
    ).toMatchObject({ ok: true });
    for (const data of ['{bad json', '[1,2]', '"text"', 42, null, [registered], { action: 5 }, {}]) {
      expect(checkMessage({ source: parent, origin: ORIGIN, data }, parent, self, state)).toMatchObject({
        ok: false,
        reason: 'format',
      });
    }
  });
});

describe('parsePayload', () => {
  it('rejects oversized strings without parsing them', () => {
    expect(parsePayload(' '.repeat(MAX_MESSAGE_CHARS + 1))).toBe('size');
  });
});

describe('isPinnableOrigin', () => {
  it('accepts plain origins only', () => {
    expect(isPinnableOrigin('https://app.standardnotes.com')).toBe(true);
    expect(isPinnableOrigin('http://localhost:3001')).toBe(true);
    expect(isPinnableOrigin('https://app.standardnotes.com/')).toBe(false);
    expect(isPinnableOrigin('null')).toBe(false);
  });
});
