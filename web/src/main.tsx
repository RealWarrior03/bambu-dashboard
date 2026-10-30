import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './styles.css';
import { applyTheme, loadTheme } from './lib/theme';
import { App } from './App';

applyTheme(loadTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
