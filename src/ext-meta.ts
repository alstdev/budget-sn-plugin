// Plugin identity (Standard Notes ext.json). The stage 0 probe used a separate
// identifier (io.github.alstdev.budget-hello), so both can coexist.
export const EXT_IDENTIFIER = 'io.github.alstdev.budget';
export const EXT_NAME = 'Budget';
export const PAGES_URL = 'https://alstdev.github.io/sn-plugin-budget/';
export const RELEASE_BASE = 'https://github.com/alstdev/sn-plugin-budget/releases/download/';
/** File name of the release zip; deploy.yml builds the same name. */
export const zipName = (version: string): string => `budget-${version}.zip`;
