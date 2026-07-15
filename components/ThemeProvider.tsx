'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
interface Ctx { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void; }
const ThemeContext = createContext<Ctx>({ theme: 'light', setTheme: () => {}, toggle: () => {} });

export function useTheme() { return useContext(ThemeContext); }

function apply(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function ThemeProvider({ children, initial }: { children: React.ReactNode; initial?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(initial ?? 'light');

  // Load persisted preference on mount
  useEffect(() => {
    const stored = (localStorage.getItem('pangea-theme') as Theme | null);
    const t = stored ?? initial ?? 'light';
    setThemeState(t);
    apply(t);
  }, [initial]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    apply(t);
    try { localStorage.setItem('pangea-theme', t); } catch {}
    // Persist to the account (best effort)
    fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: t }) }).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }}>
      {children}
    </ThemeContext.Provider>
  );
}
