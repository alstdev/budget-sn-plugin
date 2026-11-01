/**
 * Validation of the note item streamed by Standard Notes (docs/SPEC.md, 7.4).
 * The raw item object is kept only so the bridge can update it in place on save,
 * which is how the bridge library sends it back to Standard Notes.
 */

/** Upper bound for note text accepted by the bridge (UTF-16 code units). */
export const MAX_TEXT_CHARS = 16 * 1024 * 1024;

/** App data domain used by Standard Notes itself (holds `locked`). */
export const SN_APPDATA_DOMAIN = 'org.standardnotes.sn';

export interface RawContent {
  text: string;
  preview_plain?: unknown;
  appData?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RawItem {
  uuid: string;
  content: RawContent;
  [key: string]: unknown;
}

export interface NoteSnapshot {
  readonly uuid: string;
  readonly text: string;
  readonly locked: boolean;
  /** Plugin metadata from appData[<plugin identifier>]; undefined if absent. */
  readonly meta: unknown;
}

export type ItemError = 'shape' | 'size';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readNote(
  item: unknown,
  extIdentifier: string,
): { readonly raw: RawItem; readonly note: NoteSnapshot } | ItemError {
  if (!isPlainObject(item)) return 'shape';
  const uuid = item['uuid'];
  const content = item['content'];
  if (typeof uuid !== 'string' || uuid.length === 0 || uuid.length > 128) return 'shape';
  if (!isPlainObject(content)) return 'shape';
  const text = content['text'];
  if (typeof text !== 'string') return 'shape';
  if (text.length > MAX_TEXT_CHARS) return 'size';

  const appData = content['appData'];
  if (appData !== undefined && !isPlainObject(appData)) return 'shape';

  const snDomain = appData?.[SN_APPDATA_DOMAIN];
  const locked = isPlainObject(snDomain) && snDomain['locked'] === true;
  const meta = appData?.[extIdentifier];

  return {
    raw: item as RawItem,
    note: { uuid, text, locked, meta },
  };
}
