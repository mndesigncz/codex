'use client';

// Otevření části „Navíc" na stránce Odměny odjinud (kolo 9, balík V): z fronty
// „Čeká na tebe", z widgetu Navíc v týmu na Přehledu, z hledání a z oznámení
// (`?view=rewards&arg=navic`). Stejný postup jako otevriKalendar u Nehodnocených
// směn: když Odměny už stojí na obrazovce, převezmou událost; jinak se volba
// uloží do sessionStorage a přečte se po přechodu. Layout argument pohledu rewards
// nástroji nepředává, proto si ho Odměny čtou z adresy samy (useSearchParams —
// Next drží parametry v kroku i s pushState layoutu, takže hledání „Navíc k uznání"
// z otevřených Odměn část přepne bez obnovení stránky).

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Navigace } from '@/lib/widgety/typy';
import { ARG_NAVIC, KLIC_CAST_NAVIC, UDALOST_CAST_NAVIC } from './logika';

/** Otevře Odměny › Navíc: událost pro otevřenou stránku, jinak sessionStorage a přechod. */
export function otevriCastNavic(nav: Pick<Navigace, 'onNavigate' | 'smiPohled'>): void {
  const detail = { prijato: false };
  window.dispatchEvent(new CustomEvent(UDALOST_CAST_NAVIC, { detail }));
  if (detail.prijato || !nav.smiPohled('rewards')) return;
  try { sessionStorage.setItem(KLIC_CAST_NAVIC, '1'); } catch { /* soukromé okno: otevře se žebříček */ }
  nav.onNavigate('rewards', ARG_NAVIC);
}

/** Stránka Odměny: zavolá `otevri`, když má část Navíc otevřít (adresa, sessionStorage, událost). */
export function useCastNavic(otevri: () => void): void {
  const q = useSearchParams();
  const zAdresy = q?.get('view') === 'rewards' && q.get('arg') === ARG_NAVIC;
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KLIC_CAST_NAVIC)) { sessionStorage.removeItem(KLIC_CAST_NAVIC); otevri(); return; }
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
    window.addEventListener(UDALOST_CAST_NAVIC, prijmi);
    return () => window.removeEventListener(UDALOST_CAST_NAVIC, prijmi);
  }, [otevri]);
}
