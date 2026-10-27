'use client';

// Data hosta sdílená mezi obrazovkami (Karta, U kasy, Odměny, Profil, dok): jedna mezipaměť
// odpovědí /api/client/me a /api/client/card, ať přepnutí v doku nečeká na síť a QR je u kasy
// hned. Čerstvost: obrazovka si o data řekne při každém zobrazení; starší než 20 s se stáhnou
// znovu na pozadí (stará data zůstávají vidět). Po akci (razítko, rezervace, kód) volá obrazovka
// `obnovHosta()`.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { okJson } from '@/lib/api';
import { ulozKartu } from '@/lib/offlineKarta';

type Stav<T> = { data: T | null; chyba: string; at: number; bezi: Promise<void> | null };

function vytvor<T>(url: string, poNacteni?: (d: T) => void) {
  let s: Stav<T> = { data: null, chyba: '', at: 0, bezi: null };
  const posluchaci = new Set<() => void>();
  const zmen = (x: Partial<Stav<T>>) => { s = { ...s, ...x }; posluchaci.forEach(f => f()); };
  const nacti = (): Promise<void> => {
    if (s.bezi) return s.bezi;
    const p = fetch(url, { cache: 'no-store' }).then(okJson).then((d: T) => {
      zmen({ data: d, chyba: '', at: Date.now(), bezi: null });
      poNacteni?.(d);
    }).catch((e: any) => { zmen({ chyba: String(e?.message || 'chyba'), bezi: null, at: Date.now() }); });
    s = { ...s, bezi: p };
    return p;
  };
  return {
    odebirej: (f: () => void) => { posluchaci.add(f); return () => { posluchaci.delete(f); }; },
    stav: () => s,
    nacti,
    vynuluj: () => { s = { data: null, chyba: '', at: 0, bezi: null }; posluchaci.forEach(f => f()); },
    nastav: (d: T) => zmen({ data: d, at: Date.now() }),
  };
}

const ME = vytvor<any>('/api/client/me');
// Karta se uloží i do telefonu: bez připojení ji ukáže offline stránka (lib/offlineKarta.ts).
// V ukázce (/client/demo) se nic neukládá — vymyšlená karta nesmí přepsat skutečnou offline kartu.
const KARTA = vytvor<any>('/api/client/card', d => { if (d?.code && !(typeof window !== 'undefined' && (window as any).__hostDemo)) ulozKartu(d); });

const STARE_MS = 20_000;

function useZdroj<T>(z: ReturnType<typeof vytvor<T>>, zapnuto = true) {
  const s = useSyncExternalStore(z.odebirej, z.stav, z.stav);
  useEffect(() => {
    if (!zapnuto) return;
    if (!s.data || Date.now() - s.at > STARE_MS) void z.nacti();
    // Jen při zobrazení obrazovky; stav níž se mění po každém načtení.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zapnuto]);
  const obnov = useCallback(() => z.nacti(), [z]);
  return { data: s.data as T | null, chyba: s.data ? '' : s.chyba, obnov };
}

/** Odpověď /api/client/me (členství, kupony, rezervace, objednávky, poukazy, profil). */
export function useHostMe(zapnuto = true) { return useZdroj(ME, zapnuto); }
/** Karta hosta: { code, name, svg, wallet }. */
export function useKartaHosta(zapnuto = true) { return useZdroj(KARTA, zapnuto); }

/** Po akci, která mění body, razítka nebo kupony. */
export function obnovHosta(): Promise<void> { return ME.nacti(); }
/** Ukázka bez databáze startuje s prázdnou mezipamětí (jinak by ukazovala data skutečného účtu). */
export function vynulujHosta(): void { ME.vynuluj(); KARTA.vynuluj(); }

/** Odpočet, který se po minutě znovu vykreslí (věty „platí ještě 3 dny“, „Dobré odpoledne“). */
export function useTed(krokMs = 60_000): Date {
  const [ted, setTed] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setTed(new Date()), krokMs); return () => clearInterval(i); }, [krokMs]);
  return ted;
}
