import { describe, expect, it } from 'vitest';
import { checkSave } from '../src/core/saveGuard';

describe('checkSave (SPEC 7.2)', () => {
  const prev = 'x'.repeat(1000);

  it('blocks an empty result over a non-empty note', () => {
    expect(checkSave(prev, '', { explicitDelete: true })).toMatchObject({ ok: false, reason: 'empty' });
    expect(checkSave(prev, '  \n', { explicitDelete: false })).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('blocks shrinking by more than 30% without an explicit delete', () => {
    expect(checkSave(prev, 'x'.repeat(699), { explicitDelete: false })).toMatchObject({ ok: false, reason: 'shrink' });
    expect(checkSave(prev, 'x'.repeat(700), { explicitDelete: false })).toEqual({ ok: true });
    expect(checkSave(prev, 'x'.repeat(100), { explicitDelete: true })).toEqual({ ok: true });
  });

  it('allows growth and the first write into an empty note', () => {
    expect(checkSave('', '# Бюджет', { explicitDelete: false })).toEqual({ ok: true });
    expect(checkSave(prev, prev + 'y', { explicitDelete: false })).toEqual({ ok: true });
  });
});
