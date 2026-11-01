import { describe, expect, it } from 'vitest';
import {
  TEST_MARKER,
  isTestNote,
  makeStressText,
  originOnly,
  readProbeMeta,
  shortHash,
  utf8Length,
} from '../src/hello/probe';

describe('probe helpers', () => {
  it('builds stress text of the exact size starting with the marker', () => {
    for (const bytes of [10, 100 * 1024, 1024 * 1024 + 7]) {
      const text = makeStressText(bytes);
      expect(isTestNote(text)).toBe(true);
      if (bytes > TEST_MARKER.length + 1) expect(utf8Length(text)).toBe(bytes);
    }
  });

  it('treats only marked notes as test notes', () => {
    expect(isTestNote('')).toBe(false);
    expect(isTestNote('# Бюджет 2026')).toBe(false);
    expect(isTestNote(` ${TEST_MARKER}`)).toBe(false);
  });

  it('reduces URLs to origins', () => {
    expect(originOnly('https://example.org/themes/dark.css?x=1')).toBe('https://example.org');
    expect(originOnly('inline')).toBe('inline');
    expect(originOnly('')).toBe('(empty)');
    expect(originOnly('file:///C:/themes/a.css')).toBe('file:');
    expect(originOnly('::bad')).toBe('(unparsable)');
  });

  it('reads the metadata counter defensively', () => {
    expect(readProbeMeta({ probeCounter: 3 })).toEqual({ probeCounter: 3 });
    for (const meta of [undefined, null, [], { probeCounter: -1 }, { probeCounter: 1.5 }, { probeCounter: '2' }]) {
      expect(readProbeMeta(meta)).toEqual({ probeCounter: 0 });
    }
  });

  it('hashes without exposing the text', async () => {
    const hash = await shortHash('abc');
    expect(hash).toBe('ba7816bf8f01cfea');
  });
});
