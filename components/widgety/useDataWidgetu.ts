'use client';

// Data widgetů se sdílenou mezipamětí (kolo 68, spec §2.6).
//
// Plocha nese až 40 widgetů a galerie k nim živé náhledy. Kdyby si každý
// volal vlastní fetch, Přehled by po otevření poslal /api/inventory
// třikrát (Docházející zásoby, První kroky, náhled v galerii) a /api/shifts
// dvakrát. Proto jedna mezipaměť v modulu: stejná URL = jeden dotaz pro
// všechny widgety i náhledy, hotová odpověď platí 30 s a reload() ji
// obnoví všem najednou (odškrtnutý úkol se ukáže i ve druhém widgetu).
//
// Chyba se sdílí jen do dalšího reload(): nově připojený widget ji uvidí
// (odpověď je stejná, znovu se ptát by jen zatížilo server), ale první
// „Zkusit znovu" ji zahodí všem. Po návratu do karty, která byla skrytá
// déle než 5 minut, se data obnoví — tablet za barem visí na přehledu celý
// den a ráno by jinak ukazoval včerejšek.
//
// Tvar výsledku je jako u useLoad (data, error, loading, reload, set), aby
// widget šel přepsat z jednoho na druhé bez přemýšlení. Navíc `vypnuto`:
// URL je null (pole bez oprávnění), dotaz se neposílá a obal widgetu na
// takový stav nečeká — jinak by visel na kostře navždy.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { apiMessage, okJson } from '@/lib/api';
import type { LoadState } from '../ui/useLoad';
import { MEZIPAMET_DAT_MS, OBNOVA_PO_NAVRATU_MS } from '@/lib/widgety/konstanty';

export type StavDat<T> = LoadState<T> & {
  /** URL je null: dotaz se neposílá (bez oprávnění, nebo vypnutá část widgetu). */
  vypnuto: boolean;
};

interface Zaznam {
  /** Poslední úspěšná odpověď (surová — `pick` si z ní každý widget vybere sám). */
  raw?: unknown;
  /** Chyba posledního dotazu; ukáže se jen tomu, kdo ještě nemá žádná data. */
  chyba?: string;
  /** Kdy dorazila poslední odpověď nebo chyba (ms); 0 = zastaralé. */
  cas: number;
  /** Rozpracovaný dotaz — další widget se stejnou URL se k němu přidá. */
  bezi?: Promise<void>;
}

// Záznam se při každé změně nahrazuje novým objektem: useSyncExternalStore
// porovnává snímky identitou a jen tak pozná, že se má překreslit.
const zaznamy = new Map<string, Zaznam>();
const posluchaci = new Map<string, Set<() => void>>();

function oznam(url: string) {
  posluchaci.get(url)?.forEach(f => f());
}

function nacti(url: string): Promise<void> {
  const z = zaznamy.get(url);
  if (z?.bezi) return z.bezi;
  const bezi = fetch(url)
    .then(okJson)
    .then(
      raw => { zaznamy.set(url, { raw, cas: Date.now() }); },
      // Selhaný dotaz nechá poslední dobrá data na místě: widget, který je
      // má, je ukazuje dál (a obnoví se příště), chybu uvidí jen ten bez dat.
      e => { zaznamy.set(url, { raw: zaznamy.get(url)?.raw, chyba: apiMessage(e, 'Data se nenačetla.'), cas: Date.now() }); },
    )
    .finally(() => oznam(url));
  zaznamy.set(url, { ...(z ?? { cas: 0 }), bezi });
  oznam(url);
  return bezi;
}

/** Obnoví data pro URL všem widgetům, které je ukazují (po zápisu jinde). */
export function obnovDataWidgetu(url: string): void {
  const z = zaznamy.get(url);
  if (z) zaznamy.set(url, { ...z, chyba: undefined, cas: 0 });
  if (posluchaci.get(url)?.size) void nacti(url);
}

// Návrat do karty po dlouhé době: obnovit, co je na obrazovce. Posluchač je
// jeden pro celou aplikaci (modul se načte jednou), ne jeden na widget.
let skrytoOd: number | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { skrytoOd = Date.now(); return; }
    const dlouho = skrytoOd != null && Date.now() - skrytoOd > OBNOVA_PO_NAVRATU_MS;
    skrytoOd = null;
    if (!dlouho) return;
    for (const [url, set] of posluchaci) if (set.size) void nacti(url);
  });
}

const beze = <T,>(raw: unknown) => raw as T;

/**
 * Jako useLoad, jen se sdílenou mezipamětí: stejná URL = jeden dotaz pro
 * všechny widgety i náhledy v galerii.
 *  - `url === null` → nic se neposílá (`vypnuto`), widget na to nečeká;
 *  - rozpracovaný dotaz se sdílí, hotová odpověď platí 30 s;
 *  - `reload()` odpověď obnoví všem (chyba se tím zahodí);
 *  - `set()` přepíše data jen tomuhle widgetu, do další odpovědi serveru;
 *  - `pick` vytáhne z odpovědi, co widget potřebuje; když vyhodí, je to
 *    chyba widgetu (nečekaný tvar), ne prázdno.
 */
export function useDataWidgetu<T>(url: string | null, pick?: (raw: any) => T): StavDat<T> {
  const odebirej = useCallback((f: () => void) => {
    if (!url) return () => {};
    let set = posluchaci.get(url);
    if (!set) { set = new Set(); posluchaci.set(url, set); }
    set.add(f);
    return () => { set!.delete(f); };
  }, [url]);
  const snimek = useCallback(() => (url ? zaznamy.get(url) : undefined), [url]);
  const z = useSyncExternalStore(odebirej, snimek, () => undefined);

  useEffect(() => {
    if (!url) return;
    const zz = zaznamy.get(url);
    const cerstve = !!zz && (zz.raw !== undefined || zz.chyba !== undefined) && Date.now() - zz.cas < MEZIPAMET_DAT_MS;
    if (!cerstve && !zz?.bezi) void nacti(url);
  }, [url]);

  const pickRef = useRef(pick);
  pickRef.current = pick;
  const vybrano = useMemo<{ data: T | null; chyba: string | null }>(() => {
    if (z?.raw === undefined) return { data: null, chyba: null };
    try { return { data: (pickRef.current ?? beze<T>)(z.raw), chyba: null }; }
    catch (e) { return { data: null, chyba: apiMessage(e, 'Data mají nečekaný tvar.') }; }
    // `pick` bývá funkce napsaná přímo v komponentě; vybírá se znovu jen s novou odpovědí.
  }, [z?.raw]);

  // Místní přepis dat (po zápisu z widgetu) platí jen nad odpovědí, ze které vznikl.
  const [mistni, setMistni] = useState<{ zaklad: unknown; data: T } | null>(null);
  const zakladRef = useRef<unknown>(undefined);
  zakladRef.current = z?.raw;
  const vybranoRef = useRef(vybrano);
  vybranoRef.current = vybrano;

  const reload = useCallback(() => { if (url) obnovDataWidgetu(url); }, [url]);
  const set = useCallback((u: T | ((prev: T | null) => T)) => {
    setMistni(prev => {
      const zaklad = zakladRef.current;
      const dosud = prev && prev.zaklad === zaklad ? prev.data : vybranoRef.current.data;
      const data = typeof u === 'function' ? (u as (p: T | null) => T)(dosud) : u;
      return { zaklad, data };
    });
  }, []);

  if (!url) return { data: null, error: null, loading: false, reload, set, vypnuto: true };
  const data = mistni && mistni.zaklad === z?.raw ? mistni.data : vybrano.data;
  const error = vybrano.chyba ?? (data === null ? z?.chyba ?? null : null);
  return { data, error, loading: data === null && error === null, reload, set, vypnuto: false };
}

export default useDataWidgetu;
