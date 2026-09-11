'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
interface Ctx { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void; setForcedLight: (on: boolean) => void; }
const ThemeContext = createContext<Ctx>({ theme: 'light', setTheme: () => {}, toggle: () => {}, setForcedLight: () => {} });

export function useTheme() { return useContext(ThemeContext); }

function apply(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function ThemeProvider({ children, initial }: { children: React.ReactNode; initial?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(initial ?? 'light');
  // Managero client (hostovské stránky i jeho správa) je světlý vždycky —
  // je to samostatné prostředí s vlastní značkou a tmavý motiv ho nezná.
  // Dokud je připnutý, volba uživatele se jen odloží, nepřepisuje se.
  const [forcedLight, setForcedLight] = useState(false);

  // Load persisted preference on mount
  useEffect(() => {
    const stored = ((localStorage.getItem('managero-theme') ?? localStorage.getItem('pangea-theme')) as Theme | null);
    setThemeState(stored ?? initial ?? 'light');
  }, [initial]);
  useEffect(() => { apply(forcedLight ? 'light' : theme); }, [forcedLight, theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem('managero-theme', t); } catch {}
    // Persist to the account (best effort)
    fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: t }) }).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'), setForcedLight }}>
      {children}
    </ThemeContext.Provider>
  );
}
