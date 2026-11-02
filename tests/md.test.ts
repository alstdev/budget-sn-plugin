import { describe, expect, it } from 'vitest';
import { detectEol, joinLines, parseHeading, splitLines } from '../src/core/md/lines';
import { formatTable, isSeparatorRow, normalizeHeader, splitRow } from '../src/core/md/table';

describe('lines', () => {
  it('keeps every line ending exactly', () => {
    for (const text of ['', 'a', 'a\n', 'a\r\nb\nc', '\n\n', 'x\r\n\r\n', 'тест\r\nбез кінця']) {
      expect(joinLines(splitLines(text))).toBe(text);
    }
  });

  it('detects the line ending for new text', () => {
    expect(detectEol(splitLines('a\r\nb'))).toBe('\r\n');
    expect(detectEol(splitLines('a\nb'))).toBe('\n');
    expect(detectEol(splitLines('a'))).toBe('\n');
  });

  it('parses ATX headings', () => {
    expect(parseHeading('## Борги')).toEqual({ level: 2, text: 'Борги' });
    expect(parseHeading('###   Позика · USD  ')).toEqual({ level: 3, text: 'Позика · USD' });
    expect(parseHeading('#Без пробілу')).toBeNull();
    expect(parseHeading('текст')).toBeNull();
  });
});

describe('tables', () => {
  it('splits rows and unescapes \\|', () => {
    expect(splitRow('| a | b \\| c |  |')).toEqual(['a', 'b | c', '']);
    expect(splitRow('|a|b')).toEqual(['a', 'b']);
  });

  it('recognises separator rows', () => {
    expect(isSeparatorRow('|---|---:|:--|')).toBe(true);
    expect(isSeparatorRow('| --- | x |')).toBe(false);
  });

  it('compares headers without case and spaces', () => {
    expect(normalizeHeader(' У  грн ')).toBe('угрн');
  });

  it('writes padded tables, escapes | and keeps raw rows verbatim', () => {
    const lines = formatTable(['A', 'Сума'], ['left', 'right'], [['x|y', '5'], { raw: '| сирий | рядок |' }]);
    expect(lines).toEqual(['| A    | Сума |', '| ---- | ---: |', '| x\\|y |    5 |', '| сирий | рядок |']);
    expect(splitRow(lines[2] ?? '')).toEqual(['x|y', '5']);
  });
});
