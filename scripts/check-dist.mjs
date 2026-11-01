// Scans the built dist/ for forbidden APIs (docs/SPEC.md 7.8).
// Catches code brought in by dependencies too. Every exception must be listed
// in scripts/dist-allowlist.json with the exact count and a reason.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');

const RULES = {
  fetch: /\bfetch\s*\(/g,
  XMLHttpRequest: /\bXMLHttpRequest\b/g,
  WebSocket: /\bWebSocket\b/g,
  EventSource: /\bEventSource\b/g,
  sendBeacon: /\bsendBeacon\b/g,
  Worker: /\b(?:Shared)?Worker\s*\(/g,
  importScripts: /\bimportScripts\b/g,
  localStorage: /\blocalStorage\b/g,
  sessionStorage: /\bsessionStorage\b/g,
  indexedDB: /\bindexedDB\b/g,
  cacheStorage: /\bcaches\s*\./g,
  cookieStore: /\bcookieStore\b/g,
  cookie: /\.cookie\b/g,
  eval: /\beval\s*\(/g,
  Function: /\bFunction\s*\(/g,
  innerHTML: /\binnerHTML\b/g,
  outerHTML: /\bouterHTML\b/g,
  insertAdjacentHTML: /\binsertAdjacentHTML\b/g,
  documentWrite: /\bdocument\.write(?:ln)?\b/g,
  open: /\.open\s*\(/g,
  location: /\blocation\s*\.\s*(?:href|assign|replace|reload)\b/g,
  console: /\bconsole\s*\./g,
  debugger: /\bdebugger\b/g,
  externalUrl: /\bhttps?:\/\/[^\s"'`)]+/g,
};

const allowlist = JSON.parse(readFileSync(join(ROOT, 'scripts/dist-allowlist.json'), 'utf8'));
const policy = JSON.parse(readFileSync(join(ROOT, 'scripts/csp-policy.json'), 'utf8'));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error('dist/ not found: run `npm run build` first.');
  process.exit(1);
}

const errors = [];
const counts = {};
const urls = {};

// Source maps are not executed; they contain original sources and comments.
const scanned = files.filter((f) => /\.(?:js|mjs|css|html|json|svg|webmanifest)$/.test(f));
for (const file of scanned) {
  const text = readFileSync(file, 'utf8');
  for (const [rule, re] of Object.entries(RULES)) {
    for (const match of text.matchAll(re)) {
      counts[rule] = (counts[rule] ?? 0) + 1;
      if (rule === 'externalUrl') {
        // ext.json is the manifest read by Standard Notes, not code: its own
        // URLs (page, release zip) are expected and change every release.
        if (file.endsWith('/ext.json')) {
          counts[rule] -= 1;
          continue;
        }
        urls[match[0]] = (urls[match[0]] ?? 0) + 1;
      }
    }
  }
}

// externalUrl is allowlisted per exact URL; other rules per total count.
for (const [rule, count] of Object.entries(counts)) {
  if (rule === 'externalUrl') continue;
  const entry = allowlist.rules[rule];
  if (entry === undefined) {
    errors.push(`forbidden "${rule}" found ${count} time(s) in dist/ (not allowlisted)`);
  } else if (entry.count !== count) {
    errors.push(`"${rule}": allowlist expects ${entry.count}, found ${count}; review and update scripts/dist-allowlist.json`);
  }
}
for (const rule of Object.keys(allowlist.rules)) {
  if (counts[rule] === undefined) errors.push(`allowlist entry "${rule}" is stale (0 found); remove it`);
}
for (const [url, count] of Object.entries(urls)) {
  const entry = allowlist.urls[url];
  if (entry === undefined) errors.push(`external URL "${url}" found ${count} time(s) (not allowlisted)`);
  else if (entry.count !== count) errors.push(`URL "${url}": allowlist expects ${entry.count}, found ${count}`);
}
for (const url of Object.keys(allowlist.urls)) {
  if (urls[url] === undefined) errors.push(`allowlist URL "${url}" is stale (0 found); remove it`);
}
for (const [key, entry] of [...Object.entries(allowlist.rules), ...Object.entries(allowlist.urls)]) {
  if (typeof entry.reason !== 'string' || entry.reason.length < 20) errors.push(`allowlist "${key}" needs a reason`);
}

// index.html: exact CSP, no inline code or styles.
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const csp = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html);
if (csp === null) {
  errors.push('dist/index.html: CSP meta tag missing');
} else {
  const actual = csp[1].split(';').map((d) => d.trim()).filter(Boolean);
  if (JSON.stringify(actual) !== JSON.stringify(policy.directives)) {
    errors.push(`dist/index.html: CSP differs from scripts/csp-policy.json: "${csp[1]}"`);
  }
}
for (const tag of html.matchAll(/<script\b[^>]*>/gi)) {
  if (!/\bsrc=/.test(tag[0])) errors.push('dist/index.html: inline <script>');
}
if (/<style\b/i.test(html)) errors.push('dist/index.html: inline <style>');
if (/\sstyle\s*=/i.test(html)) errors.push('dist/index.html: style attribute');
if (/\son[a-z]+\s*=/i.test(html)) errors.push('dist/index.html: inline event handler');
if (/\b(?:src|href)\s*=\s*"(?:https?:)?\/\//i.test(html)) errors.push('dist/index.html: external resource');

if (errors.length > 0) {
  console.error(`check:dist FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check:dist OK: ${scanned.length} file(s) scanned, allowlisted: ${JSON.stringify(counts)}`);
