'use client';

// Otevření části „Tresty" na stránce Odměny odjinud (kolo 10, balík V): z fronty
// „Čeká na tebe" (nesouhlasy), z widgetu Tresty v týmu na Přehledu, z hledání
// a z oznámení (`?view=rewards&arg=tresty`). Stejný postup jako u části Navíc
// (components/navic-vedeni/cast.ts): když Odměny už stojí na obrazovce, převezmou
// událost; jinak se volba uloží do sessionStorage a přečte se po přechodu. Argument
// pohledu si Odměny čtou z adresy samy (useSearchParams).

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Navigace } from '@/lib/widgety/typy';
import { ARG_TRESTY, KLIC_CAST_TRESTY, UDALOST_CAST_TRESTY } from './logika';

/** Otevře Odměny › Tresty: událost pro otevřenou stránku, jinak sessionStorage a přechod. */
export function otevriCastTresty(nav: Pick<Navigace, 'onNavigate' | 'smiPohled'>): void {
  const detail = { prijato: false };
  window.dispatchEvent(new CustomEvent(UDALOST_CAST_TRESTY, { detail }));
  if (detail.prijato || !nav.smiPohled('rewards')) return;
  try { sessionStorage.setItem(KLIC_CAST_TRESTY, '1'); } catch { /* soukromé okno: otevře se žebříček */ }
  nav.onNavigate('rewards', ARG_TRESTY);
}

/** Stránka Odměny: zavolá `otevri`, když má část Tresty otevřít (adresa, sessionStorage, událost). */
export function useCastTresty(otevri: () => void): void {
  const q = useSearchParams();
  const zAdresy = q?.get('view') === 'rewards' && q.get('arg') === ARG_TRESTY;
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KLIC_CAST_TRESTY)) { sessionStorage.removeItem(KLIC_CAST_TRESTY); otevri(); return; }
    } catch { /* soukromé okno */ }
    if (zAdresy) otevri();
    // Nová adresa (nový objekt parametrů) = nový hluboký odkaz; `otevri` je stabilní callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, zAdresy]);
  useEffect(() => {
    const prijmi = (e: Event) => {
      const d = (e as CustomEvent<{ prijato: boolean }>).detail;
      if (d) d.prijato = true;
      otevri();
    };
    window.addEventListener(UDALOST_CAST_TRESTY, prijmi);
    return () => window.removeEventListener(UDALOST_CAST_TRESTY, prijmi);
  }, [otevri]);
}
