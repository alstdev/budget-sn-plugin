/**
 * Section template contract (docs/SPEC.md 6.3). A new section type is a new
 * folder in src/templates/ plus one line in src/core/registry.ts.
 */
import type { ComponentType } from 'preact';
import type { DocAction, DocContext } from '../actions/types';
import type { Heading } from './md/lines';
import type { Minor } from './money';

export interface Issue {
  /** Line number inside the section (0 = heading), if known. */
  readonly line?: number;
  readonly message: string;
  /** Critical issues make the section read-only (docs/SPEC.md 7.2). */
  readonly critical: boolean;
}

/** Section text as found in the note: heading plus the following lines. */
export interface MdBlock {
  readonly heading: Heading;
  /** Lines after the heading, without line endings. */
  readonly lines: readonly string[];
}

export interface CreateInput {
  readonly name: string;
  readonly currency: string;
  readonly amount: Minor | null;
}

export interface CardProps<M> {
  readonly model: M;
  readonly issues: readonly Issue[];
  readonly readOnly: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** Applies a change; returns an error text to show, or null on success. */
  readonly onChange: (next: M) => string | null;
  /** Facts about the whole note (months, links, default currencies). */
  readonly context: DocContext;
  /** Applies a change that spans several sections; error text or null. */
  readonly act: (action: DocAction) => string | null;
}

export interface SectionTemplate<M> {
  readonly id: string;
  readonly formatVersion: number;
  /** Text of the parent "## " heading this template lives under, e.g. "Борги". */
  readonly parentHeading: string;
  /**
   * Heading level of the section: 3 (default, under a "## " group) or 2 (a
   * top-level "## " section, e.g. a custom table).
   */
  readonly level?: 2 | 3;
  /** Level-2 templates: decides from the section body whether it is theirs. */
  matchBody?(lines: readonly string[]): boolean;
  match(heading: Heading, parent?: Heading): boolean;
  parse(block: MdBlock): { model: M; issues: Issue[] };
  /** Canonical Markdown of the section, without trailing blank lines. */
  serialize(model: M): string[];
  /** Computed `_..._` lines written under the heading. */
  summary(model: M): string[];
  create(input: CreateInput): M;
  /** Name used to tell sections apart (unique within the parent). */
  name(model: M): string;
  views: { Card: ComponentType<CardProps<M>> };
}
