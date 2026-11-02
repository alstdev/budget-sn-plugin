/**
 * Template registry (docs/SPEC.md 6.3). A new section type = a new folder in
 * src/templates/ and one line in TEMPLATES below.
 */
import type { ComponentType } from 'preact';
import { normalizeTitle, type Heading } from './md/lines';
import type { CardProps, CreateInput, Issue, MdBlock, SectionTemplate } from './template';
import { debtTemplate } from '../templates/debts';
import { savingsTemplate } from '../templates/savings';

/** Template with its model type erased, so different templates fit one list. */
export interface RegisteredTemplate {
  readonly id: string;
  readonly parentTitle: string;
  readonly parentHeading: string;
  match(heading: Heading, parent?: Heading): boolean;
  parse(block: MdBlock): { model: unknown; issues: Issue[] };
  serialize(model: unknown): string[];
  name(model: unknown): string;
  create(input: CreateInput): unknown;
  readonly Card: ComponentType<CardProps<unknown>>;
}

function register<M>(t: SectionTemplate<M>): RegisteredTemplate {
  // The model stored with a section always comes from this template's parse().
  const own = (model: unknown) => model as M;
  return {
    id: t.id,
    parentTitle: normalizeTitle(t.parentHeading),
    parentHeading: t.parentHeading,
    match: (heading, parent) => t.match(heading, parent),
    parse: (block) => t.parse(block),
    serialize: (model) => t.serialize(own(model)),
    name: (model) => t.name(own(model)),
    create: (input) => t.create(input),
    Card: t.views.Card as unknown as ComponentType<CardProps<unknown>>,
  };
}

const TEMPLATES: readonly RegisteredTemplate[] = [register(debtTemplate), register(savingsTemplate)];

export function findTemplate(heading: Heading, parent: Heading): RegisteredTemplate | undefined {
  return TEMPLATES.find((t) => t.match(heading, parent));
}

export function getTemplate(id: string): RegisteredTemplate {
  const template = TEMPLATES.find((t) => t.id === id);
  if (template === undefined) throw new Error(`unknown template: ${id}`);
  return template;
}
