import React from 'react';
import ReactDOM from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import App from './App';
import './styles.css';
import {
  installStartupWatchdog,
  isSafeMode,
  SafeModeScreen,
  signalBootOk
} from './boot';

// Install before anything else so errors in module evaluation are caught.
installStartupWatchdog();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root not found — index.html is malformed');
}

const root = ReactDOM.createRoot(rootEl);

if (isSafeMode()) {
  // Skip the engine entirely — render the recovery screen, then drop the
  // boot heartbeat so the user sees the panel instead of the spinner.
  root.render(
    <React.StrictMode>
      <SafeModeScreen />
    </React.StrictMode>
  );
  signalBootOk();
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  // App calls markBootReady() once the engine fires onReady — see App.tsx.
}
