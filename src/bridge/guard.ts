/**
 * Filter for incoming postMessage events (docs/SPEC.md, 7.4).
 *
 * Runs before the bridge library sees a message. A message is accepted only if:
 *  1. the page is framed (window.parent !== window);
 *  2. event.source === window.parent;
 *  3. the payload is an object (or a JSON string of an object) with a string `action`;
 *  4. before registration, only `component-registered` is accepted, and its
 *     origin is pinned; after that, every message must come from the pinned origin.
 *
 * Nothing here logs or stores message contents. Diagnostics carry only
 * counters, reason codes, the origin string and the kind of `source`.
 */

export const REGISTERED_ACTION = 'component-registered';

/** Upper bound for a JSON-string payload (mobile sends strings). */
export const MAX_MESSAGE_CHARS = 64 * 1024 * 1024;

export type RejectReason =
  | 'not-framed'
  | 'source'
  | 'format'
  | 'size'
  | 'unregistered'
  | 'origin';

export type SourceKind = 'parent' | 'self' | 'null' | 'other';

export interface IncomingMessage {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
}

export interface GuardState {
  pinnedOrigin: string | null;
}

export type GuardResult =
  | { readonly ok: true; readonly action: string }
  | { readonly ok: false; readonly reason: RejectReason; readonly sourceKind: SourceKind };

export function sourceKind(source: unknown, parent: unknown, self: unknown): SourceKind {
  if (source === null || source === undefined) return 'null';
  if (source === parent) return 'parent';
  if (source === self) return 'self';
  return 'other';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns the message payload as an object, or a reject reason.
 * Strings are parsed as JSON (the mobile app sends JSON strings).
 */
export function parsePayload(data: unknown): Record<string, unknown> | 'format' | 'size' {
  let value: unknown = data;
  if (typeof data === 'string') {
    if (data.length > MAX_MESSAGE_CHARS) return 'size';
    try {
      value = JSON.parse(data);
    } catch {
      return 'format';
    }
  }
  if (!isPlainObject(value)) return 'format';
  if (typeof value['action'] !== 'string') return 'format';
  return value;
}

/** An origin we are willing to pin and later use as postMessage targetOrigin. */
export function isPinnableOrigin(origin: string): boolean {
  if (origin === '' || origin === 'null') return false;
  try {
    return new URL(origin).origin === origin;
  } catch {
    return false;
  }
}

export function checkMessage(
  msg: IncomingMessage,
  parent: unknown,
  self: unknown,
  state: GuardState,
): GuardResult {
  const kind = sourceKind(msg.source, parent, self);
  const reject = (reason: RejectReason): GuardResult => ({ ok: false, reason, sourceKind: kind });

  if (parent === self) return reject('not-framed');
  if (kind !== 'parent') return reject('source');

  const payload = parsePayload(msg.data);
  if (payload === 'format' || payload === 'size') return reject(payload);
  const action = payload['action'] as string;

  if (state.pinnedOrigin === null) {
    if (action !== REGISTERED_ACTION) return reject('unregistered');
    if (!isPinnableOrigin(msg.origin)) return reject('origin');
    state.pinnedOrigin = msg.origin;
    return { ok: true, action };
  }

  if (msg.origin !== state.pinnedOrigin) return reject('origin');
  return { ok: true, action };
}
