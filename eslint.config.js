// Security rules: docs/SPEC.md 7.8, CLAUDE.md section 2.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const NETWORK = 'Network access is forbidden: note data must never leave the plugin (SPEC 7.1).';
const STORAGE = 'Browser storage is forbidden: UI state goes to note appData via the bridge (SPEC 7.1).';
const EXEC = 'Dynamic code execution is forbidden (SPEC 7.1).';
const HTML = 'Render note content as text only (Preact nodes), never as HTML (SPEC 7.1).';
// <form> is allowed: submit is always handled in JS and CSP form-action 'none'
// blocks any submission navigation.
const NAV = 'The plugin must not open windows, navigate or create frames (SPEC 7.4).';
const BRIDGE = 'Only src/bridge/ may use postMessage / message events (SPEC 7.4).';

const restrictedGlobals = [
  ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'BroadcastChannel', 'importScripts'].map(
    (name) => ({ name, message: NETWORK }),
  ),
  ...['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore', 'openDatabase'].map((name) => ({
    name,
    message: STORAGE,
  })),
  ...['eval', 'Function'].map((name) => ({ name, message: EXEC })),
  ...['open', 'location'].map((name) => ({ name, message: NAV })),
];

const restrictedProperties = [
  { object: 'navigator', property: 'sendBeacon', message: NETWORK },
  { object: 'document', property: 'cookie', message: STORAGE },
  { object: 'document', property: 'write', message: HTML },
  { object: 'document', property: 'writeln', message: HTML },
  { object: 'document', property: 'location', message: NAV },
  { object: 'window', property: 'open', message: NAV },
  { object: 'window', property: 'location', message: NAV },
];

const GLOBAL_OBJECTS = '/^(window|self|globalThis|top|parent|frames|document)$/';

const baseSyntax = [
  {
    selector: `MemberExpression[object.name=${GLOBAL_OBJECTS}][property.name=/^(fetch|XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker|BroadcastChannel)$/]`,
    message: NETWORK,
  },
  { selector: "MemberExpression[property.name='sendBeacon']", message: NETWORK },
  {
    selector: `MemberExpression[object.name=${GLOBAL_OBJECTS}][property.name=/^(localStorage|sessionStorage|indexedDB|caches|cookieStore|openDatabase)$/]`,
    message: STORAGE,
  },
  { selector: `MemberExpression[object.name=${GLOBAL_OBJECTS}][property.name=/^(eval|Function)$/]`, message: EXEC },
  {
    selector: "CallExpression[callee.name=/^(setTimeout|setInterval)$/][arguments.0.type=/^(Literal|TemplateLiteral|BinaryExpression)$/]",
    message: EXEC,
  },
  {
    selector: "CallExpression[callee.property.name=/^(setTimeout|setInterval)$/][arguments.0.type=/^(Literal|TemplateLiteral|BinaryExpression)$/]",
    message: EXEC,
  },
  { selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]", message: HTML },
  { selector: "CallExpression[callee.property.name=/^(insertAdjacentHTML|createContextualFragment|parseFromString)$/]", message: HTML },
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: HTML },
  {
    selector: "CallExpression[callee.property.name=/^(createElement|createElementNS)$/] > Literal.arguments[value=/^(iframe|frame|script|object|embed|a|base|meta|link|style)$/i]",
    message: NAV,
  },
  { selector: 'JSXOpeningElement[name.name=/^(iframe|frame|script|object|embed|a|base|meta|link|style)$/]', message: NAV },
  { selector: `MemberExpression[object.name=${GLOBAL_OBJECTS}][property.name='open']`, message: NAV },
];

const bridgeOnlySyntax = [
  { selector: "MemberExpression[property.name='postMessage']", message: BRIDGE },
  { selector: "CallExpression[callee.property.name=/^(addEventListener|removeEventListener)$/] > Literal.arguments[value='message']", message: BRIDGE },
  { selector: "MemberExpression[property.name='onmessage']", message: BRIDGE },
];

const securityRules = (syntax) => ({
  'no-restricted-globals': ['error', ...restrictedGlobals],
  'no-restricted-properties': ['error', ...restrictedProperties],
  'no-restricted-syntax': ['error', ...syntax],
  'no-console': 'error',
  'no-debugger': 'error',
  'no-alert': 'error',
  'no-implied-eval': 'off',
  '@typescript-eslint/no-implied-eval': 'error',
});

export default defineConfig(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'local/'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: securityRules([...baseSyntax, ...bridgeOnlySyntax]),
  },
  {
    // The bridge (and its tests) are the only place allowed to handle messages.
    files: ['src/bridge/**/*.ts', 'tests/bridge*.test.ts'],
    rules: securityRules(baseSyntax),
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', ...restrictedGlobals],
      'no-restricted-syntax': ['error', ...baseSyntax],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
  },
);
