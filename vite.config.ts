import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };
import { EXT_IDENTIFIER, EXT_NAME, PAGES_URL, RELEASE_BASE, zipName } from './src/ext-meta.ts';

/**
 * Emits ext.json (Standard Notes plugin manifest) next to index.html.
 * The version is taken from package.json so the tag, the manifest and the
 * release zip can never disagree.
 */
function extJson(): Plugin {
  return {
    name: 'budget-ext-json',
    apply: 'build',
    generateBundle() {
      const manifest = {
        identifier: EXT_IDENTIFIER,
        name: EXT_NAME,
        content_type: 'SN|Component',
        area: 'editor-editor',
        version: pkg.version,
        description: 'Budget kept as plain Markdown: debts, savings, months.',
        url: `${PAGES_URL}index.html`,
        download_url: `${RELEASE_BASE}v${pkg.version}/${zipName(pkg.version)}`,
        // Desktop SN compares `version` here with the installed copy and
        // downloads `download_url` when it is newer (auto-update).
        latest_url: `${PAGES_URL}ext.json`,
      };
      this.emitFile({
        type: 'asset',
        fileName: 'ext.json',
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  plugins: [extJson()],
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    // The modulepreload polyfill contains fetch(); not needed for a single chunk.
    modulePreload: { polyfill: false },
    // Inlined assets would be data: URLs inside JS/CSS; keep every asset a file.
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        minify:
          mode === 'production'
            ? { compress: { dropConsole: true, dropDebugger: true } }
            : false,
      },
    },
  },
}));
