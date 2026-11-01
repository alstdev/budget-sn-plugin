import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { createBridge } from '../bridge';
import { createComponentRelay } from '../bridge/relay';
import { EXT_IDENTIFIER } from '../ext-meta';
import { App } from './App';
import { watchCsp, watchThemeLinks, type CspViolation, type ThemeLinks } from './watchers';
import '../styles/hello.css';

// Observers start before the bridge, so violations caused by theme
// stylesheets injected during registration are counted too.
let cspState: readonly CspViolation[] = [];
let themeState: ThemeLinks = { count: 0, origins: [] };
const listeners = new Set<() => void>();
const notify = () => { listeners.forEach((listener) => { listener(); }); };

watchCsp(document, (list) => {
  cspState = list;
  notify();
});
watchThemeLinks(document, (links) => {
  themeState = links;
  notify();
});

const bridge = createBridge(window, EXT_IDENTIFIER, createComponentRelay);

function Root() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => { setTick((n) => n + 1); };
    listeners.add(listener);
    // Catch up with events that happened before this effect ran.
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return <App bridge={bridge} csp={cspState} themes={themeState} />;
}

const root = document.getElementById('app');
if (root !== null) render(<Root />, root);
