/**
 * Document = ordered list of blocks: sections recognised by a template, and
 * raw text kept byte for byte (docs/SPEC.md 5.3, 6.2).
 *
 * Safety rule: only sections changed through the UI ("dirty") are rewritten
 * in canonical form; everything else is written back exactly as it was read.
 */
import {
  detectEol,
  isFence,
  joinLines,
  normalizeTitle,
  parseHeading,
  splitLines,
  type Line,
} from './md/lines';
import type { Issue } from './template';
import { findTemplate, findTopTemplate, getTemplate, knownParentTitles } from './registry';

export const FORMAT_VERSION = 1;
/** `parent` of sections that are top-level "## " sections themselves. */
export const TOP_LEVEL = '';
export const FORMAT_MARKER = '> формат: budget v1 · таблиці редагуються руками · рядки _курсивом_ рахує плагін';

export type FormatState =
  | { readonly kind: 'ok' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unsupported'; readonly version: string };

export interface RawBlock {
  readonly kind: 'raw';
  readonly lines: readonly Line[];
  /** Normalized title of the governing "## " heading, or null. */
  readonly parent: string | null;
}

export interface SectionBlock {
  readonly kind: 'section';
  readonly templateId: string;
  readonly parent: string;
  /** Original lines (heading included); empty for new sections. */
  readonly lines: readonly Line[];
  readonly model: unknown;
  readonly issues: readonly Issue[];
  readonly readOnly: boolean;
  readonly dirty: boolean;
  /** Separators around a newly inserted section. */
  readonly lead: string;
  readonly tail: string;
}

export type Block = RawBlock | SectionBlock;

export interface BudgetDocument {
  readonly blocks: readonly Block[];
  readonly eol: '\n' | '\r\n';
  readonly format: FormatState;
}

function detectFormat(lines: readonly Line[], text: string): FormatState {
  if (text.trim() === '') return { kind: 'empty' };
  for (const line of lines) {
    const heading = parseHeading(line.text);
    if (heading !== null && heading.level === 2) break;
    const match = /budget v(\d+)\b/.exec(line.text);
    if (match !== null) {
      return match[1] === String(FORMAT_VERSION)
        ? { kind: 'ok' }
        : { kind: 'unsupported', version: `v${match[1] ?? '?'}` };
    }
  }
  return { kind: 'missing' };
}

function sectionEnd(lines: readonly Line[], start: number, maxLevel = 3): number {
  let inFence = false;
  for (let i = start + 1; i < lines.length; i += 1) {
    const text = lines[i]?.text ?? '';
    if (isFence(text)) inFence = !inFence;
    if (inFence) continue;
    const heading = parseHeading(text);
    if (heading !== null && heading.level <= maxLevel) return i;
  }
  return lines.length;
}

export function parseDocument(text: string): BudgetDocument {
  const lines = splitLines(text);
  const blocks: Block[] = [];
  let raw: Line[] = [];
  let parent: string | null = null;
  let parentHeading: ReturnType<typeof parseHeading> = null;
  let inFence = false;

  const flush = () => {
    if (raw.length > 0) blocks.push({ kind: 'raw', lines: raw, parent });
    raw = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    if (isFence(line.text)) inFence = !inFence;
    const heading = inFence ? null : parseHeading(line.text);

    if (heading !== null && heading.level <= 2) {
      flush();
      parentHeading = heading.level === 2 ? heading : null;
      parent = parentHeading === null ? null : normalizeTitle(parentHeading.text);
    }

    // Top-level "## " section owned by a level-2 template (e.g. custom table).
    if (heading !== null && heading.level === 2) {
      const end = sectionEnd(lines, i, 2);
      const sectionLines = lines.slice(i, end);
      const body = sectionLines.slice(1).map((l) => l.text);
      const top = findTopTemplate(heading, body);
      if (top !== undefined) {
        const parsed = top.parse({ heading, lines: body });
        blocks.push({
          kind: 'section',
          templateId: top.id,
          parent: TOP_LEVEL,
          lines: sectionLines,
          model: parsed.model,
          issues: parsed.issues,
          readOnly: parsed.issues.some((issue) => issue.critical),
          dirty: false,
          lead: '',
          tail: '',
        });
        parentHeading = null;
        parent = null;
        i = end;
        continue;
      }
    }

    const template =
      heading !== null && heading.level === 3 && parentHeading !== null
        ? findTemplate(heading, parentHeading)
        : undefined;

    if (heading !== null && template !== undefined && parent !== null) {
      flush();
      const end = sectionEnd(lines, i);
      const sectionLines = lines.slice(i, end);
      const parsed = template.parse({
        heading,
        lines: sectionLines.slice(1).map((l) => l.text),
      });
      blocks.push({
        kind: 'section',
        templateId: template.id,
        parent,
        lines: sectionLines,
        model: parsed.model,
        issues: parsed.issues,
        readOnly: parsed.issues.some((issue) => issue.critical),
        dirty: false,
        lead: '',
        tail: '',
      });
      i = end;
      continue;
    }

    raw.push(line);
    i += 1;
  }
  flush();

  return { blocks, eol: detectEol(lines), format: detectFormat(lines, text) };
}

function serializeSection(block: SectionBlock, eol: string): string {
  if (!block.dirty) return joinLines(block.lines);
  const canonical = getTemplate(block.templateId).serialize(block.model).join(eol);
  if (block.lines.length === 0) return `${block.lead}${canonical}${eol}${block.tail}`;

  // Keep the blank lines that followed the original section.
  let contentEnd = block.lines.length;
  while (contentEnd > 1 && (block.lines[contentEnd - 1]?.text.trim() ?? '') === '') contentEnd -= 1;
  const lastEol = block.lines[contentEnd - 1]?.eol ?? '';
  return `${canonical}${lastEol === '' ? '' : eol}${joinLines(block.lines.slice(contentEnd))}`;
}

export function serializeDocument(doc: BudgetDocument): string {
  let out = '';
  for (const block of doc.blocks) {
    out += block.kind === 'raw' ? joinLines(block.lines) : serializeSection(block, doc.eol);
  }
  return out;
}

export function isWritable(doc: BudgetDocument): boolean {
  return doc.format.kind === 'ok';
}

/** Text of a new budget note (docs/SPEC.md 5.1, 5.2). */
export function skeletonText(year: number): string {
  return `# Бюджет ${year}\n${FORMAT_MARKER}\n\n## Борги\n\n## Місяці\n\n## Накопичення\n\n## Шаблон місяця\n`;
}

export function sectionsOf(doc: BudgetDocument, templateId: string): { block: SectionBlock; index: number }[] {
  const out: { block: SectionBlock; index: number }[] = [];
  doc.blocks.forEach((block, index) => {
    if (block.kind === 'section' && block.templateId === templateId) out.push({ block, index });
  });
  return out;
}

export function findSection(doc: BudgetDocument, templateId: string, name: string): number {
  const template = getTemplate(templateId);
  const key = normalizeTitle(name);
  return doc.blocks.findIndex(
    (b) => b.kind === 'section' && b.templateId === templateId && normalizeTitle(template.name(b.model)) === key,
  );
}

export type ChangeResult =
  | { readonly ok: true; readonly doc: BudgetDocument }
  | { readonly ok: false; readonly error: string };

/**
 * Replaces the model of one section. The new canonical text is parsed again
 * and must yield no critical issues, so a change can never produce a section
 * the plugin itself would refuse to read.
 */
export function updateSection(doc: BudgetDocument, index: number, model: unknown): ChangeResult {
  const block = doc.blocks[index];
  if (block === undefined || block.kind !== 'section') return { ok: false, error: 'Розділ не знайдено.' };
  if (block.readOnly) return { ok: false, error: 'Розділ лише для читання.' };
  const template = getTemplate(block.templateId);
  const reparsed = reparse(template.id, template.serialize(model));
  if (reparsed === null) return { ok: false, error: 'Зміна дала б нерозбірний розділ; не збережено.' };
  const next: SectionBlock = { ...block, model: reparsed.model, issues: reparsed.issues, dirty: true };
  const blocks = doc.blocks.slice();
  blocks[index] = next;
  return { ok: true, doc: { ...doc, blocks } };
}

function reparse(templateId: string, lines: readonly string[]): { model: unknown; issues: Issue[] } | null {
  const template = getTemplate(templateId);
  const heading = parseHeading(lines[0] ?? '');
  if (heading === null) return null;
  const parsed = template.parse({ heading, lines: lines.slice(1) });
  return parsed.issues.some((issue) => issue.critical) ? null : parsed;
}

/** Adds a new section at the end of its "## " group, creating the group if needed. */
export function addSection(doc: BudgetDocument, templateId: string, model: unknown): ChangeResult {
  const template = getTemplate(templateId);
  const name = template.name(model);
  if (findSection(doc, templateId, name) !== -1) {
    return { ok: false, error: 'Розділ з такою назвою вже існує.' };
  }
  const reparsed = reparse(templateId, template.serialize(model));
  if (reparsed === null) return { ok: false, error: 'Некоректні дані розділу.' };

  const eol = doc.eol;
  const blocks = doc.blocks.slice();
  let insertAt = -1;
  if (template.level === 2) {
    const title = normalizeTitle(name);
    const taken = doc.blocks.some((b) =>
      b.lines.some((l) => {
        const h = parseHeading(l.text);
        return h !== null && h.level <= 2 && normalizeTitle(h.text) === title;
      }),
    );
    if (taken || knownParentTitles().has(title)) {
      return { ok: false, error: 'Розділ з такою назвою вже існує.' };
    }
    insertAt = blocks.length;
  }
  blocks.forEach((b, i) => {
    if (template.level === 3 && b.parent === template.parentTitle) insertAt = i + 1;
  });

  const before = serializeDocument({ ...doc, blocks: insertAt === -1 ? blocks : blocks.slice(0, insertAt) });
  const separator = (text: string) =>
    text === '' || text.endsWith(`${eol}${eol}`) ? '' : text.endsWith(eol) ? eol : `${eol}${eol}`;

  if (insertAt === -1) {
    const headingText = `${separator(before)}## ${template.parentHeading}${eol}${eol}`;
    blocks.push({ kind: 'raw', lines: splitLines(headingText), parent: template.parentTitle });
    insertAt = blocks.length;
  }
  const hasNext = insertAt < blocks.length;
  const textBefore = serializeDocument({ ...doc, blocks: blocks.slice(0, insertAt) });
  const section: SectionBlock = {
    kind: 'section',
    templateId,
    parent: template.level === 2 ? TOP_LEVEL : template.parentTitle,
    lines: [],
    model: reparsed.model,
    issues: reparsed.issues,
    readOnly: false,
    dirty: true,
    lead: separator(textBefore),
    tail: hasNext ? eol : '',
  };
  blocks.splice(insertAt, 0, section);
  return { ok: true, doc: { ...doc, blocks } };
}

/** Raw blocks with content no template recognised (shown as "Інше"). */
export function unknownBlocks(doc: BudgetDocument): string[] {
  const known = knownParentTitles();
  const out: string[] = [];
  for (const block of doc.blocks) {
    if (block.kind !== 'raw') continue;
    const meaningful = block.lines.some((line) => {
      const t = line.text.trim();
      if (t === '') return false;
      const heading = parseHeading(t);
      if (heading !== null && heading.level === 1) return false;
      if (heading !== null && heading.level === 2 && known.has(normalizeTitle(heading.text))) return false;
      if (/budget v\d+/.test(t)) return false;
      return true;
    });
    if (meaningful) out.push(joinLines(block.lines));
  }
  return out;
}
