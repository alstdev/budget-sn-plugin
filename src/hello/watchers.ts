/**
 * Page-level observers of the stage 0 probe: CSP violations and theme
 * stylesheets injected by the bridge library. Only origins and directive
 * names are recorded.
 */
import { originOnly } from './probe';

export interface CspViolation {
  readonly directive: string;
  readonly blocked: string;
  readonly count: number;
}

export function watchCsp(doc: Document, onChange: (list: readonly CspViolation[]) => void): void {
  const seen = new Map<string, CspViolation>();
  doc.addEventListener('securitypolicyviolation', (event) => {
    const directive = event.effectiveDirective || event.violatedDirective;
    const blocked = originOnly(event.blockedURI);
    const key = `${directive} ${blocked}`;
    const prev = seen.get(key);
    seen.set(key, { directive, blocked, count: (prev?.count ?? 0) + 1 });
    onChange([...seen.values()]);
  });
}

export interface ThemeLinks {
  readonly count: number;
  readonly origins: readonly string[];
}

function readThemeLinks(doc: Document): ThemeLinks {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link.custom-theme'));
  const origins = [...new Set(links.map((link) => originOnly(link.href)))];
  return { count: links.length, origins };
}

export function watchThemeLinks(doc: Document, onChange: (links: ThemeLinks) => void): void {
  const observer = new MutationObserver(() => { onChange(readThemeLinks(doc)); });
  observer.observe(doc.head, { childList: true });
  onChange(readThemeLinks(doc));
}
