'use client';

// Cesty hosta. Skutečná aplikace žije na /client…, ukázka bez databáze na /client/demo…
// (stejné obrazovky, API odpovídá z paměti — lib/klient/demo). Odkazy v obrazovkách hosta
// se skládají přes `useCesta()`, ať ukázka nikdy neodskočí do skutečné aplikace.
//
//   /client/me            → /client/demo              (Karta, domov)
//   /client/me/<x>        → /client/demo/<x>          (odmeny, aktivita, profil)
//   /client               → /client/demo/podniky      (Podniky)
//   /client/<slug>?…      → /client/demo/p/<slug>?…   (stránka podniku)
//   /client/login, …      → /client/demo              (ukázka je přihlášená vždy)

import { createContext, useCallback, useContext } from 'react';

const HostCesty = createContext<{ demo: boolean }>({ demo: false });

export const DEMO_ZAKLAD = '/client/demo';
const SYSTEMOVE = new Set(['me', 'login', 'register', 'odhlasit', 'zapomenute-heslo', 'nove-heslo', 'demo']);

export function naDemo(cesta: string): string {
  const [cista, dotaz = ''] = cesta.split('?');
  const q = dotaz ? `?${dotaz}` : '';
  if (cista === '/client/me') return DEMO_ZAKLAD + q;
  if (cista.startsWith('/client/me/')) return DEMO_ZAKLAD + cista.slice('/client/me'.length) + q;
  if (cista === '/client' || cista === '/client/') return `${DEMO_ZAKLAD}/podniky${q}`;
  const m = /^\/client\/([^/]+)(\/.*)?$/.exec(cista);
  if (m && !SYSTEMOVE.has(m[1])) return `${DEMO_ZAKLAD}/p/${m[1]}${m[2] ?? ''}${q}`;
  if (m && SYSTEMOVE.has(m[1])) return DEMO_ZAKLAD;
  return cesta;
}

export function HostCestyProvider({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  return <HostCesty.Provider value={{ demo }}>{children}</HostCesty.Provider>;
}

export function useJeDemo(): boolean { return useContext(HostCesty).demo; }

/** Převod skutečné cesty hosta na cestu v ukázce (mimo ukázku beze změny). */
export function useCesta(): (cesta: string) => string {
  const { demo } = useContext(HostCesty);
  return useCallback((c: string) => (demo ? naDemo(c) : c), [demo]);
}

/** Cesta v ukázce zpátky na skutečnou (kvůli aktivní položce doku). */
export function zDema(cesta: string): string {
  if (!cesta.startsWith(DEMO_ZAKLAD)) return cesta;
  const zbytek = cesta.slice(DEMO_ZAKLAD.length);
  if (!zbytek || zbytek === '/') return '/client/me';
  if (zbytek === '/podniky') return '/client';
  if (zbytek.startsWith('/p/')) return `/client/${zbytek.slice(3)}`;
  return `/client/me${zbytek}`;
}
