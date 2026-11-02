import { render } from 'preact';
import { createBridge } from './bridge';
import { createComponentRelay } from './bridge/relay';
import { EXT_IDENTIFIER } from './ext-meta';
import { App } from './ui/App';
import './styles/app.css';

const bridge = createBridge(window, EXT_IDENTIFIER, createComponentRelay);
// Opened directly in a browser rather than inside Standard Notes: no note
// will ever arrive, so only the neutral waiting screen is shown.
const standalone = window.parent === window;
const root = document.getElementById('app');
if (root !== null) render(<App bridge={bridge} standalone={standalone} />, root);
