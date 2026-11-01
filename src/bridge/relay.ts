/**
 * Factory for the real bridge library. Kept separate so unit tests can run
 * the adapter without loading the library (it expects a browser window).
 * Review notes for the library: docs/SECURITY-NOTES.md.
 */
import ComponentRelay from '@standardnotes/component-relay';
import type { RelayFactory, RelayLike } from './index';

/** Debounce for saves, docs/SPEC.md 6.4 (300–400 ms). */
export const SAVE_DEBOUNCE_MS = 350;

export const createComponentRelay: RelayFactory = (win, onReady) => {
  const relay: RelayLike = new ComponentRelay({
    targetWindow: win,
    options: {
      coallesedSaving: true,
      coallesedSavingDelay: SAVE_DEBOUNCE_MS,
      acceptsThemes: true,
      debug: false,
    },
    onReady,
  });
  return relay;
};
