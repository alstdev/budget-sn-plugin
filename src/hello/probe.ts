/**
 * Pure helpers of the stage 0 probe. Nothing here reads or reports note
 * contents: only lengths, a short hash, counters and timings.
 */

/** First line of every note the probe is allowed to modify. */
export const TEST_MARKER = '<!-- budget-hello test note: safe to overwrite -->';

export const STRESS_SIZES = [
  { label: '100 КБ', bytes: 100 * 1024 },
  { label: '1 МБ', bytes: 1024 * 1024 },
  { label: '5 МБ', bytes: 5 * 1024 * 1024 },
] as const;

/** The probe writes only to an empty note or to a note it marked itself. */
export function isTestNote(text: string): boolean {
  return text.startsWith(TEST_MARKER);
}

/**
 * Marker line + ASCII filler lines, exactly `bytes` long in UTF-8
 * (or the marker line alone if `bytes` is smaller than it).
 */
export function makeStressText(bytes: number): string {
  const head = `${TEST_MARKER}\n`;
  if (bytes <= head.length) return head;
  const lineLength = 64;
  const lines: string[] = [head];
  let size = head.length;
  let n = 0;
  while (size + lineLength <= bytes) {
    n += 1;
    const prefix = `filler ${String(n).padStart(8, '0')} `;
    lines.push(`${prefix.padEnd(lineLength - 1, 'x')}\n`);
    size += lineLength;
  }
  const rest = bytes - size;
  if (rest > 0) lines.push('y'.repeat(rest));
  return lines.join('');
}

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * First 16 hex chars of SHA-256 of the text, to compare devices without
 * showing contents. Returns null where WebCrypto is unavailable
 * (non-secure contexts).
 */
export async function shortHash(text: string): Promise<string | null> {
  // crypto.subtle is exposed only in secure contexts ([SecureContext] in WebIDL).
  if (!('subtle' in globalThis.crypto)) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/** Reduces a URL-like value to its origin, or keeps a CSP keyword as is. */
export function originOnly(value: string): string {
  if (value === '' || /^(inline|eval|data|blob|self|wasm-eval|trusted-types-sink)$/.test(value)) {
    return value || '(empty)';
  }
  try {
    const url = new URL(value);
    return url.origin === 'null' ? url.protocol : url.origin;
  } catch {
    return '(unparsable)';
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

export interface ProbeMeta {
  readonly probeCounter: number;
}

export function readProbeMeta(meta: unknown): ProbeMeta {
  if (typeof meta === 'object' && meta !== null && !Array.isArray(meta)) {
    const value = (meta as Record<string, unknown>)['probeCounter'];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
      return { probeCounter: value };
    }
  }
  return { probeCounter: 0 };
}
