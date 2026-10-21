'use client';

// Kořen ukázky hosta (/client/demo…). Mock API se instaluje PŘED prvním vykreslením obrazovek
// (initializer useState), ať žádný efekt nestihne zavolat skutečné API; mezipaměť hosta se vynuluje,
// ať ukázka neukáže data skutečného účtu z předchozí obrazovky. Při odchodu se mock odinstaluje.

import { useEffect, useState } from 'react';
import { nainstalujDemoHosta } from '@/lib/klient/demo/mock';
import { vynulujHosta } from './data';
import Domov from './Domov';
import Podniky from './Podniky';
import Odmeny from './Odmeny';
import Aktivita from './Aktivita';
import Profil from './Profil';
import BusinessPage from '../BusinessPage';

let odinstaluj: (() => void) | null = null;

export default function HostDemo({ cesta }: { cesta: string[] }) {
  useState(() => {
    if (typeof window !== 'undefined' && !window.__hostDemo) { vynulujHosta(); odinstaluj = nainstalujDemoHosta(); }
    return true;
  });
  useEffect(() => () => {
    // Odchod z ukázky klientskou navigací: zpět skutečné API a čistá mezipaměť.
    if (!window.location.pathname.startsWith('/client/demo')) { odinstaluj?.(); odinstaluj = null; vynulujHosta(); }
  }, []);
  const [a, b] = cesta;
  if (!a) return <Domov />;
  if (a === 'podniky') return <Podniky />;
  if (a === 'odmeny') return <Odmeny />;
  if (a === 'aktivita') return <Aktivita />;
  if (a === 'profil') return <Profil />;
  if (a === 'p' && b) return <BusinessPage slug={b} />;
  return <Domov />;
}
