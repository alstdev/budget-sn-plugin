// Checks GitHub Actions workflows against docs/SPEC.md 7.5 (no dependencies):
//  - top-level `permissions:` with `contents: read`;
//  - every `uses:` of a remote action is pinned to a full 40-char commit SHA
//    followed by a `# vX.Y.Z` comment;
//  - no `pull_request_target` trigger;
//  - no `${{ ... }}` expressions inside `run:` scripts (use `env:` instead).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = join(ROOT, '.github/workflows');
const errors = [];

const indentOf = (line) => line.length - line.trimStart().length;

for (const name of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
  const lines = readFileSync(join(DIR, name), 'utf8').split('\n');
  const where = (i) => `${name}:${i + 1}`;

  if (!lines.some((l) => /^permissions:\s*$/.test(l))) {
    errors.push(`${name}: top-level "permissions:" block is missing`);
  } else {
    const start = lines.findIndex((l) => /^permissions:\s*$/.test(l));
    const block = [];
    for (let i = start + 1; i < lines.length && (lines[i].startsWith(' ') || lines[i].trim() === ''); i += 1) {
      if (lines[i].trim() !== '') block.push(lines[i].trim());
    }
    if (block.join('|') !== 'contents: read') {
      errors.push(`${name}: top-level permissions must be exactly "contents: read" (found: ${block.join(', ')})`);
    }
  }

  let runIndent = -1;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return;

    if (/\bpull_request_target\b/.test(line)) errors.push(`${where(i)}: pull_request_target is forbidden`);

    // Inside a multi-line run: block?
    if (runIndent >= 0) {
      if (trimmed === '' || indentOf(line) > runIndent) {
        if (line.includes('${{')) errors.push(`${where(i)}: \${{ }} inside run: (pass it via env:)`);
        return;
      }
      runIndent = -1;
    }

    const run = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(line);
    if (run !== null) {
      const rest = run[2];
      if (/^[|>][-+]?\s*$/.test(rest)) {
        runIndent = indentOf(line) + (/^\s*-\s+/.test(line) ? 2 : 0);
      } else if (rest.includes('${{')) {
        errors.push(`${where(i)}: \${{ }} inside run: (pass it via env:)`);
      }
    }

    const uses = /^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/.exec(line);
    if (uses !== null) {
      const ref = uses[1];
      if (ref.startsWith('./')) return;
      if (ref.startsWith('docker://')) {
        if (!/@sha256:[0-9a-f]{64}$/.test(ref)) errors.push(`${where(i)}: docker action must be pinned by digest`);
        return;
      }
      if (!/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(ref)) {
        errors.push(`${where(i)}: "${ref}" is not pinned to a full commit SHA`);
      } else if (!/^\s+#\s*v\d+(\.\d+){0,2}\s*$/.test(uses[2])) {
        errors.push(`${where(i)}: pinned action needs a "# vX.Y.Z" comment`);
      }
    }
  });
}

if (errors.length > 0) {
  console.error(`check:workflows FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('check:workflows OK');
