'use client';

// Kdo stojí u tabletu (kolo 11, balík Z) — pro widget „Úkoly za body" na Směně tabletu.
//
// Proč vlastní malé úložiště a ne useKioskShift(): KioskShiftGate táhne bcrypt, offline
// frontu a celý rozpis — widget oblasti Úkoly se stahuje i u zaměstnanců a vedení, kde by
// to byla zbytečná váha, a useKioskShift() mimo provider vyhodí chybu. Provider tabletu
// (KioskShiftProvider) sem zapíše vybraného člověka a funkci „zeptej se, kdo jsi";
// mimo tablet tu je null a widget se ptá za sebe.

import { useSyncExternalStore } from 'react';

export interface OsobaTabletu { id: number; jmeno: string }

interface Stav {
  osoba: OsobaTabletu | null;
  /** Zeptá se, kdo u tabletu stojí (PersonPicker); null = výběr zavřený. */
  vyzadej: (() => Promise<OsobaTabletu | null>) | null;
}

let stav: Stav = { osoba: null, vyzadej: null };
const posluchaci = new Set<() => void>();

/** Zapíše provider tabletu při každé změně vybraného člověka (a null při odpojení). */
export function nastavOsobuTabletu(osoba: OsobaTabletu | null, vyzadej: Stav['vyzadej']): void {
  if (stav.osoba?.id === osoba?.id && stav.osoba?.jmeno === osoba?.jmeno && stav.vyzadej === vyzadej) return;
  stav = { osoba, vyzadej };
  for (const f of posluchaci) f();
}

const odebirej = (f: () => void) => { posluchaci.add(f); return () => { posluchaci.delete(f); }; };
const snimek = () => stav;
const PRAZDNY: Stav = { osoba: null, vyzadej: null };

/** Vybraný člověk u tabletu; mimo tablet `{ osoba: null, vyzadej: null }`. */
export function useOsobaTabletu(): Stav {
  return useSyncExternalStore(odebirej, snimek, () => PRAZDNY);
}
