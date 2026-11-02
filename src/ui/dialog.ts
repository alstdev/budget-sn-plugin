import { useEffect, useRef } from 'preact/hooks';

/**
 * Common dialog behaviour (docs/SPEC.md 8): focus the field marked
 * data-autofocus (or the first field) when the dialog opens, close it with Escape.
 */
export function useDialog<T extends HTMLElement>(onCancel: () => void) {
  const ref = useRef<T>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const preferred = el.querySelector<HTMLElement>('[data-autofocus]');
    (preferred ?? el.querySelector<HTMLElement>('input:not([disabled]), select, textarea, button'))?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        cancel.current();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
    };
  }, []);
  return ref;
}
