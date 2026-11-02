import { describe, expect, it } from 'vitest';
import { DEFAULT_META, readMeta, writeMeta } from '../src/core/meta';

describe('note metadata (SPEC 5.4)', () => {
  it('reads valid metadata and keeps unknown keys', () => {
    const meta = readMeta({ v: 1, lastCur: { exp: 'USD' }, ui: { tab: 'savings', open: ['debt:A', 5] } });
    expect(meta.ui).toEqual({ tab: 'savings', open: ['debt:A'] });
    expect(writeMeta(meta)).toEqual({ lastCur: { exp: 'USD' }, v: 1, ui: { tab: 'savings', open: ['debt:A'] } });
  });

  it('falls back to defaults on garbage', () => {
    for (const value of [undefined, null, 'x', [], { ui: 'x' }, { ui: { tab: 'evil' } }]) {
      expect(readMeta(value).ui).toEqual(DEFAULT_META.ui);
    }
  });
});
