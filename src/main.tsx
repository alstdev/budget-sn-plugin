import { render } from 'preact';
import { createBridge } from './bridge';
import { createComponentRelay } from './bridge/relay';
import { EXT_IDENTIFIER } from './ext-meta';
import { App } from './ui/App';
import './styles/app.css';

const bridge = createBridge(window, EXT_IDENTIFIER, createComponentRelay);
const root = document.getElementById('app');
if (root !== null) render(<App bridge={bridge} />, root);
