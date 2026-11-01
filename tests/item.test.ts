import { describe, expect, it } from 'vitest';
import { MAX_TEXT_CHARS, readNote } from '../src/bridge/item';

const EXT = 'io.example.ext';

describe('readNote', () => {
  it('reads text, locked flag and plugin metadata', () => {
    const item = {
      uuid: 'u1',
      content: {
        text: 'hello',
        appData: { 'org.standardnotes.sn': { locked: true }, [EXT]: { v: 1 } },
      },
    };
    const r = readNote(item, EXT);
    expect(r).not.toBe('shape');
    if (typeof r === 'string') return;
    expect(r.note).toEqual({ uuid: 'u1', text: 'hello', locked: true, meta: { v: 1 } });
    expect(r.raw).toBe(item);
  });

  it('treats missing appData as unlocked without metadata', () => {
    const r = readNote({ uuid: 'u1', content: { text: '' } }, EXT);
    expect(typeof r === 'string' ? r : r.note).toEqual({ uuid: 'u1', text: '', locked: false, meta: undefined });
  });

  it('only the boolean true counts as locked', () => {
    const r = readNote({ uuid: 'u', content: { text: '', appData: { 'org.standardnotes.sn': { locked: 'yes' } } } }, EXT);
    expect(typeof r === 'string' ? r : r.note.locked).toBe(false);
  });

  it('rejects malformed items', () => {
    for (const item of [
      null,
      'text',
      [],
      { content: { text: '' } },
      { uuid: '', content: { text: '' } },
      { uuid: 'u', content: null },
      { uuid: 'u', content: { text: 5 } },
      { uuid: 'u', content: { text: '', appData: [] } },
    ]) {
      expect(readNote(item, EXT)).toBe('shape');
    }
  });

  it('rejects text above the size limit', () => {
    expect(readNote({ uuid: 'u', content: { text: 'x'.repeat(MAX_TEXT_CHARS + 1) } }, EXT)).toBe('size');
  });
});
