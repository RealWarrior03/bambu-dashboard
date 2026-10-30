export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'theme';

export function loadTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    // storage unavailable
  }
  return 'auto';
}

export function applyTheme(theme: Theme): void {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // storage unavailable
  }
}
