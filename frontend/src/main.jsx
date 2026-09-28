import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// P44: self-hosted fonts via @fontsource (works offline; no Google Fonts link
// to break on bad Wi-Fi). Fraunces = display serif, Hanken Grotesk = UI,
// JetBrains Mono = tabular readings. Weights kept to what the UI uses.
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';

import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
