import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './features.css';
import { isNativeApp } from './native';
import { applyTheme, getTheme } from './theme';
import { APP_NAME } from './supabase';

applyTheme(getTheme());
document.title = APP_NAME;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && !isNativeApp) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' }).catch(() => {});
  });
}
