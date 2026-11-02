import { describe, expect, it } from 'vitest';
import { DEFAULT_META, readMeta, writeMeta } from '../src/core/meta';

describe('note metadata (SPEC 5.4)', () => {
  it('reads valid metadata and keeps unknown keys', () => {
    const meta = readMeta({ v: 1, lastCur: { exp: 'USD' }, ui: { tab: 'savings', open: ['debt:A', 5] }, future: [1] });
    expect(meta.ui).toEqual({ tab: 'savings', open: ['debt:A'] });
    expect(meta.lastCur).toEqual({ exp: 'USD', inc: 'UAH' });
    expect(writeMeta(meta)).toEqual({
      future: [1],
      v: 1,
      lastCur: { exp: 'USD', inc: 'UAH' },
      ui: { tab: 'savings', open: ['debt:A'] },
    });
  });

  it('falls back to defaults on garbage', () => {
    for (const value of [undefined, null, 'x', [], { ui: 'x' }, { ui: { tab: 'evil' } }, { lastCur: { exp: 'usd' } }]) {
      const meta = readMeta(value);
      expect(meta.ui).toEqual(DEFAULT_META.ui);
      expect(meta.lastCur).toEqual(DEFAULT_META.lastCur);
    }
  });
});
