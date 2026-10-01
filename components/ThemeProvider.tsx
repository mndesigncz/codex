'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { motivKUplatneni } from '@/lib/i18n/synchronizace';

/** Co si člověk zvolil. „system" = podle zařízení (prefers-color-scheme). */
export type VolbaMotivu = 'light' | 'dark' | 'system';
type Theme = 'light' | 'dark';
interface Ctx {
  /** Skutečně použitý motiv (volba „system" je už přeložená na světlý/tmavý). */
  theme: Theme;
  /** Volba člověka, i „system". */
  volba: VolbaMotivu;
  /** `naUcet: false` = jen na tomhle zařízení (tablet u baru nesmí přepsat motiv sdíleného účtu). */
  setTheme: (t: VolbaMotivu, o?: { naUcet?: boolean }) => void;
  toggle: () => void;
  setForcedLight: (on: boolean) => void;
  /**
   * Motiv uložený na účtu (users.theme) uplatní jen tehdy, když na tomto zařízení
   * člověk motiv výslovně nezvolil. Nepíše se na server a nepočítá se jako výslovná volba,
   * takže změna na jiném zařízení se sem při příštím přihlášení promítne.
   */
  pouzijZUctu: (t: unknown) => void;
}
const ThemeContext = createContext<Ctx>({ theme: 'light', volba: 'light', setTheme: () => {}, toggle: () => {}, setForcedLight: () => {}, pouzijZUctu: () => {} });

export function useTheme() { return useContext(ThemeContext); }

/** Výslovná volba na tomhle zařízení (nastavil ji člověk přepínačem). */
export const KLIC_MOTIVU = 'managero-theme';
/** Název klíče z doby před přejmenováním; čte se dál, ať se lidem nezahodí uložená volba. */
const KLIC_MOTIVU_STARY = 'pangea-theme';
/** Motiv převzatý z účtu: jen kvůli skriptu v layoutu, ať se po načtení nepřeblikne. */
export const KLIC_MOTIVU_Z_UCTU = 'managero-theme-server';

const jeVolba = (v: unknown): v is VolbaMotivu => v === 'light' || v === 'dark' || v === 'system';

function cti(klic: string): VolbaMotivu | null {
  try { const v = localStorage.getItem(klic); return jeVolba(v) ? v : null; } catch { return null; }
}

function apply(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function ThemeProvider({ children, initial }: { children: React.ReactNode; initial?: Theme }) {
  const [volba, setVolba] = useState<VolbaMotivu>(initial ?? 'light');
  // Preference systému: zjišťuje se až v prohlížeči (server ji nezná), takže první vykreslení je vždy shodné.
  const [systemTmavy, setSystemTmavy] = useState(false);
  // Managero client (hostovské stránky i jeho správa) je světlý vždycky —
  // je to samostatné prostředí s vlastní značkou a tmavý motiv ho nezná.
  // Dokud je připnutý, volba uživatele se jen odloží, nepřepisuje se.
  const [forcedLight, setForcedLight] = useState(false);

  // Load persisted preference on mount
  useEffect(() => {
    const stored = cti(KLIC_MOTIVU) ?? cti(KLIC_MOTIVU_STARY) ?? cti(KLIC_MOTIVU_Z_UCTU);
    setVolba(stored ?? initial ?? 'light');
  }, [initial]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const prepni = () => setSystemTmavy(mq.matches);
    prepni();
    mq.addEventListener?.('change', prepni);
    return () => mq.removeEventListener?.('change', prepni);
  }, []);

  const theme: Theme = volba === 'system' ? (systemTmavy ? 'dark' : 'light') : volba;
  // Motiv na <html> se bere přímo z matchMedia, ne ze stavu `systemTmavy`: ten se nastaví až v efektu výš
  // a první průchod by přepsal tmavý motiv z inline skriptu na světlý (krátké zablikání při volbě „podle systému“).
  useEffect(() => {
    const zSystemu = volba === 'system' && typeof window !== 'undefined' && window.matchMedia
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    apply(forcedLight ? 'light' : zSystemu);
  }, [forcedLight, theme, volba]);

  const setTheme = (t: VolbaMotivu, o?: { naUcet?: boolean }) => {
    setVolba(t);
    try { localStorage.setItem(KLIC_MOTIVU, t); } catch {}
    // Persist to the account (best effort)
    if (o?.naUcet !== false) fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: t }) }).catch(() => {});
  };

  const pouzijZUctu = (z: unknown) => {
    // Výslovná volba na zařízení (klíč `managero-theme`, i starý `pangea-theme`) má přednost.
    const t = motivKUplatneni({ zUctu: z, vyslovnyNaZarizeni: !!(cti(KLIC_MOTIVU) ?? cti(KLIC_MOTIVU_STARY)) });
    if (!t) return;
    try { localStorage.setItem(KLIC_MOTIVU_Z_UCTU, t); } catch {}
    setVolba(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, volba, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'), setForcedLight, pouzijZUctu }}>
      {children}
    </ThemeContext.Provider>
  );
}
