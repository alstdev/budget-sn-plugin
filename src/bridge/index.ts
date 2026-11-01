/**
 * The only module that talks to Standard Notes (docs/SPEC.md, 6.1 and 7.4).
 *
 * The rest of the code sees: onNote(note), save(text, preview, meta), platform
 * information and diagnostics counters. It never touches postMessage.
 */
import { checkMessage, type GuardState, type RejectReason, type SourceKind } from './guard';
import { MAX_TEXT_CHARS, readNote, type NoteSnapshot, type RawItem } from './item';

export type { NoteSnapshot } from './item';
export type { RejectReason, SourceKind } from './guard';

/** Subset of the bridge library used by the adapter. */
export interface RelayLike {
  streamContextItem(callback: (item: unknown) => void): void;
  saveItemWithPresave(item: unknown, presave: () => void, callback?: () => void): void;
  readonly environment: string | undefined;
  readonly platform: string | undefined;
}

export type RelayFactory = (win: Window, onReady: () => void) => RelayLike;

/** Minimal window surface the adapter needs (eases testing). */
export interface BridgeWindow {
  readonly parent: unknown;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void,
    options: AddEventListenerOptions,
  ): void;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type SaveOutcome = 'queued' | 'not-ready' | 'locked' | 'invalid' | 'too-large';

export interface SaveRequest {
  readonly text: string;
  readonly preview: string;
  /** Plugin metadata (appData[<identifier>]); omitted = keep current. */
  readonly meta?: JsonValue;
}

export interface Diagnostics {
  readonly registered: boolean;
  readonly environment: string | undefined;
  readonly platform: string | undefined;
  readonly pinnedOrigin: string | null;
  readonly accepted: number;
  readonly rejected: Readonly<Record<RejectReason, number>>;
  readonly lastRejected: {
    readonly reason: RejectReason;
    readonly sourceKind: SourceKind;
    readonly origin: string;
  } | null;
  readonly notesReceived: number;
  readonly invalidItems: number;
  readonly savesQueued: number;
  readonly savesConfirmed: number;
}

export interface Bridge {
  /** Subscribes to note updates; returns an unsubscribe function. */
  onNote(listener: (note: NoteSnapshot) => void): () => void;
  /** Subscribes to diagnostics changes; returns an unsubscribe function. */
  onDiagnostics(listener: (diag: Diagnostics) => void): () => void;
  diagnostics(): Diagnostics;
  save(request: SaveRequest, onSaved?: () => void): SaveOutcome;
}

export const MAX_PREVIEW_CHARS = 160;
const MAX_META_DEPTH = 16;

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > MAX_META_DEPTH) return false;
  if (value === null) return true;
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'object':
      if (Array.isArray(value)) return value.every((v) => isJsonValue(v, depth + 1));
      if (Object.getPrototypeOf(value) !== Object.prototype) return false;
      return Object.values(value).every((v) => isJsonValue(v, depth + 1));
    default:
      return false;
  }
}

export function createBridge(
  win: BridgeWindow,
  extIdentifier: string,
  relayFactory: RelayFactory,
): Bridge {
  const guardState: GuardState = { pinnedOrigin: null };
  const rejected: Record<RejectReason, number> = {
    'not-framed': 0,
    source: 0,
    format: 0,
    size: 0,
    unregistered: 0,
    origin: 0,
  };
  let lastRejected: Diagnostics['lastRejected'] = null;
  let accepted = 0;
  let registered = false;
  let notesReceived = 0;
  let invalidItems = 0;
  let savesQueued = 0;
  let savesConfirmed = 0;

  let current: { raw: RawItem; note: NoteSnapshot } | null = null;
  const noteListeners = new Set<(note: NoteSnapshot) => void>();
  const diagListeners = new Set<(diag: Diagnostics) => void>();

  let relay: RelayLike | null = null;

  const diagnostics = (): Diagnostics => ({
    registered,
    environment: relay?.environment,
    platform: relay?.platform,
    pinnedOrigin: guardState.pinnedOrigin,
    accepted,
    rejected: { ...rejected },
    lastRejected,
    notesReceived,
    invalidItems,
    savesQueued,
    savesConfirmed,
  });

  const emitDiagnostics = (): void => {
    const snapshot = diagnostics();
    for (const listener of diagListeners) listener(snapshot);
  };

  // Registered BEFORE the library so rejected events never reach it.
  // Capture phase on window also covers events dispatched on document.
  win.addEventListener(
    'message',
    (event: MessageEvent) => {
      const result = checkMessage(
        { source: event.source, origin: event.origin, data: event.data },
        win.parent,
        win,
        guardState,
      );
      if (result.ok) {
        accepted += 1;
      } else {
        event.stopImmediatePropagation();
        rejected[result.reason] += 1;
        lastRejected = {
          reason: result.reason,
          sourceKind: result.sourceKind,
          origin: event.origin,
        };
      }
      emitDiagnostics();
    },
    { capture: true },
  );

  const handleItem = (item: unknown): void => {
    const parsed = readNote(item, extIdentifier);
    if (parsed === 'shape' || parsed === 'size') {
      invalidItems += 1;
      emitDiagnostics();
      return;
    }
    current = parsed;
    notesReceived += 1;
    emitDiagnostics();
    for (const listener of noteListeners) listener(parsed.note);
  };

  relay = relayFactory(win as unknown as Window, () => {
    registered = true;
    emitDiagnostics();
    relay?.streamContextItem(handleItem);
  });

  const save = (request: SaveRequest, onSaved?: () => void): SaveOutcome => {
    // Never save before the first valid note arrived (docs/SPEC.md, 7.2).
    if (current === null) return 'not-ready';
    if (current.note.locked) return 'locked';
    if (request.meta !== undefined && !isJsonValue(request.meta)) return 'invalid';
    if (request.text.length > MAX_TEXT_CHARS) return 'too-large';

    const target = current.raw;
    const text = request.text;
    const preview = request.preview.slice(0, MAX_PREVIEW_CHARS);
    // The library coalesces saves within its debounce window and runs only the
    // last presave, so every save carries the latest metadata, not only the
    // saves that change it (stage 0 finding).
    const nextMeta: unknown =
      request.meta !== undefined ? JSON.parse(JSON.stringify(request.meta)) : current.note.meta;
    const hasMeta = nextMeta !== undefined;
    const meta = nextMeta;

    savesQueued += 1;
    emitDiagnostics();
    relay.saveItemWithPresave(
      target,
      () => {
        target.content.text = text;
        target.content.preview_plain = preview;
        if (hasMeta) {
          const appData = target.content.appData ?? {};
          appData[extIdentifier] = meta;
          target.content.appData = appData;
        }
      },
      () => {
        savesConfirmed += 1;
        emitDiagnostics();
        onSaved?.();
      },
    );
    // The adapter's view follows the last queued save; note listeners are
    // notified only for notes coming from Standard Notes.
    current = {
      raw: target,
      note: { ...current.note, text, meta },
    };
    return 'queued';
  };

  return {
    onNote(listener) {
      noteListeners.add(listener);
      if (current !== null) listener(current.note);
      return () => noteListeners.delete(listener);
    },
    onDiagnostics(listener) {
      diagListeners.add(listener);
      listener(diagnostics());
      return () => diagListeners.delete(listener);
    },
    diagnostics,
    save,
  };
}
