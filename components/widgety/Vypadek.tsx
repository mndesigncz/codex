'use client';

// Výpadek jednou lištou (audit 2026-10 V01, průřez 4).
//
// Když spadne server nebo wifi, nenačte se každý widget zvlášť — a Přehled pak
// ukázal osm stejných karet „Widget se nenačetl / Zkusit znovu" pod sebou. Stěna
// chyb říká jednu věc osmkrát a schová i to, co se načetlo. Vzor Linear / Notion:
// jedna lišta nahoře („Nejsme připojení — zkusíme to znovu"), widgety bez dat jen
// ztlumené s krátkou větou, opakování samo (návrat spojení, každých 30 s) i tlačítkem.
//
// Chyba jednoho dotazu zůstává chybou jeho widgetů (vlastní ErrorState se Zkusit znovu) —
// jeden endpoint často krmí dva widgety (Tržba po dnech a Průměrná účtenka z /api/pos/daily).
// Lišta je až od tří nenačtených widgetů, nebo hned, když prohlížeč hlásí offline.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui';
import { Icon } from '../Icons';
import { useT } from '@/lib/i18n/client';

/** Od kolika nenačtených widgetů je to „výpadek" (jedna lišta) místo chyby jednoho widgetu. */
export const PRAH_VYPADKU = 3;
const OPAKOVAT_MS = 30_000;

interface KontextVypadku {
  /** Widget hlásí svou chybu (`reload`), nebo že je v pořádku (`null`). */
  nahlas: (klic: string, reload: (() => void) | null) => void;
  /** Je víc nenačtených widgetů najednou → ukazuje se lišta, widgety jsou ztlumené. */
  hromadny: boolean;
  pocet: number;
  zkusitVse: () => void;
}

const VypadekCtx = createContext<KontextVypadku | null>(null);

export function useVypadekPlochy(): KontextVypadku | null {
  return useContext(VypadekCtx);
}

export function VypadekProvider({ children }: { children: React.ReactNode }) {
  const chyby = useRef(new Map<string, () => void>());
  const [pocet, setPocet] = useState(0);
  const nahlas = useCallback((klic: string, reload: (() => void) | null) => {
    const m = chyby.current;
    if (reload) m.set(klic, reload); else m.delete(klic);
    setPocet(m.size);
  }, []);
  const zkusitVse = useCallback(() => { for (const r of [...chyby.current.values()]) r(); }, []);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const f = () => setOffline(typeof navigator !== 'undefined' && navigator.onLine === false);
    f();
    window.addEventListener('online', f);
    window.addEventListener('offline', f);
    return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); };
  }, []);
  const hromadny = pocet >= PRAH_VYPADKU || (offline && pocet > 0);

  // Samo znovu: hned po návratu spojení a pak každých 30 s, dokud výpadek trvá.
  useEffect(() => {
    if (!hromadny) return;
    const naOnline = () => zkusitVse();
    window.addEventListener('online', naOnline);
    const t = setInterval(zkusitVse, OPAKOVAT_MS);
    return () => { window.removeEventListener('online', naOnline); clearInterval(t); };
  }, [hromadny, zkusitVse]);

  const hodnota = useMemo(() => ({ nahlas, hromadny, pocet, zkusitVse }), [nahlas, hromadny, pocet, zkusitVse]);
  return <VypadekCtx.Provider value={hodnota}>{children}</VypadekCtx.Provider>;
}

/** Jedna lišta nad mřížkou, jen při hromadném výpadku. */
export function ListaVypadku() {
  const t = useT('widgety');
  const v = useVypadekPlochy();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const f = () => setOffline(typeof navigator !== 'undefined' && navigator.onLine === false);
    f();
    window.addEventListener('online', f);
    window.addEventListener('offline', f);
    return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); };
  }, []);
  if (!v?.hromadny) return null;
  return (
    <div className="note note-wait flex items-center gap-3" role="status" data-lista-vypadku="">
      <Icon name="warning" size={18} className="shrink-0" />
      <p className="min-w-0 flex-1 text-pretty">
        <span className="font-semibold">{offline ? t('Nejsi připojený k internetu.') : t('Nejsme připojení k serveru.')}</span>{' '}
        {t('{n, plural, one {# widget se nenačetl} few {# widgety se nenačetly} other {# widgetů se nenačetlo}} — zkusíme to znovu sami.', { n: v.pocet })}
      </p>
      <Button size="sm" variant="secondary" icon="refresh" className="shrink-0" onClick={v.zkusitVse}>{t('Zkusit znovu')}</Button>
    </div>
  );
}
