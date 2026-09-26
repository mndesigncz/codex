'use client';

// Klientský registr widgetů (kolo 68, spec §2.5).
//
// Metadata (název, velikosti, oprávnění) jsou v lib/widgety/katalog — ta
// potřebuje i server. Komponenty jsou po oblastech v ./oblasti/<oblast>.tsx
// a stahují se líně: Přehled stáhne jen oblasti, které na něm opravdu jsou
// (kolo 39 — první obrazovka nemá nést všech 122 widgetů). Každá oblast má
// vlastní soubor, takže balíky kola 69 nesahají do stejného místa a tenhle
// soubor se po kole 68 nemění.

import { lazy, type LazyExoticComponent } from 'react';
import type { DefiniceWidgetu, IdOblasti, KomponentaWidgetu, MoznostNastaveni, PoleNastaveni, Smi, Tarif } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { staciTarif } from '@/lib/widgety/rozlozeni';
import { Chybi } from './Widget';

type ModulOblasti = { KOMPONENTY: Record<string, KomponentaWidgetu> };

const OBLASTI: Record<IdOblasti, () => Promise<ModulOblasti>> = {
  obecne: () => import('./oblasti/obecne'),
  trzby: () => import('./oblasti/trzby'),
  uzaverky: () => import('./oblasti/uzaverky'),
  finance: () => import('./oblasti/finance'),
  dochazka: () => import('./oblasti/dochazka'),
  rozvrh: () => import('./oblasti/rozvrh'),
  'moje-smeny': () => import('./oblasti/moje-smeny'),
  sklad: () => import('./oblasti/sklad'),
  receptury: () => import('./oblasti/receptury'),
  menu: () => import('./oblasti/menu'),
  ukoly: () => import('./oblasti/ukoly'),
  planovani: () => import('./oblasti/planovani'),
  napady: () => import('./oblasti/napady'),
  postupy: () => import('./oblasti/postupy'),
  navody: () => import('./oblasti/navody'),
  odmeny: () => import('./oblasti/odmeny'),
  akce: () => import('./oblasti/akce'),
  klient: () => import('./oblasti/klient'),
  tym: () => import('./oblasti/tym'),
  organizace: () => import('./oblasti/organizace'),
};

const line = new Map<string, LazyExoticComponent<KomponentaWidgetu>>();

/**
 * Líná komponenta widgetu. Pro stejné id a pokus je to vždy tatáž komponenta
 * (jinak by se widget při každém překreslení plochy připojil znovu).
 * `pokus` založí novou: React.lazy si pamatuje i nepovedený import, takže
 * „Zkusit znovu" po výpadku sítě musí dostat čerstvou línou komponentu.
 * Oblast, která pro id komponentu nemá, vrátí `Chybi`.
 */
export function lineWidget(id: string, pokus = 0): LazyExoticComponent<KomponentaWidgetu> {
  const klic = `${id}#${pokus}`;
  let komponenta = line.get(klic);
  if (!komponenta) {
    komponenta = lazy(async () => {
      const def = widget(id);
      if (!def) return { default: Chybi as KomponentaWidgetu };
      const modul = await OBLASTI[def.oblast]();
      return { default: modul.KOMPONENTY[id] ?? (Chybi as KomponentaWidgetu) };
    });
    line.set(klic, komponenta);
  }
  return komponenta;
}

/**
 * Po načtení rozložení stáhnout oblasti, které na ploše jsou — souběžně
 * s daty widgetů, ne až po nich. Chyba se tu jen spolkne: projeví se
 * v konkrétním widgetu (pojistka se „Zkusit znovu"), ne na celé ploše.
 */
export function predstahni(widgety: readonly string[]): void {
  const oblasti = new Set<IdOblasti>();
  for (const w of widgety) {
    const def = widget(w);
    if (def) oblasti.add(def.oblast);
  }
  for (const o of oblasti) OBLASTI[o]().catch(() => {});
}

// ---------------------------------------------------------------------------
// Co se dá u widgetu nastavit (menu „Nastavit widget", okno nastavení)
// ---------------------------------------------------------------------------

/**
 * Pole nastavení, která divák vidí: bez oprávnění nebo tarifu se pole
 * v UI neukáže (spec §2.3) — fronta „odměny" v „Čeká na tebe" pro roli
 * bez odmeny.schvalovat neexistuje, ani když ji má uloženou.
 */
export function viditelnaPole(def: DefiniceWidgetu | undefined, smi: Smi, tarif: Tarif): PoleNastaveni[] {
  return (def?.nastaveni ?? []).filter(p =>
    (!p.opravneni || smi(p.opravneni)) && (!p.tarif || staciTarif(p.tarif, tarif))
    // Výběr, ze kterého po oprávněních nezbyla žádná volba, nemá co nabídnout.
    && !((p.typ === 'vyber' || p.typ === 'vicevyber') && !viditelneMoznosti(p.moznosti, smi).length));
}

/** Volby výběru, na které divák má (volba bez `opravneni` vždy). */
export function viditelneMoznosti(moznosti: readonly MoznostNastaveni[], smi: Smi): MoznostNastaveni[] {
  return moznosti.filter(m => !m.opravneni || smi(m.opravneni));
}

/** Má smysl „Nastavit widget"? Jen když je co nastavit — pole schématu, nebo víc velikostí. */
export function maCoNastavit(def: DefiniceWidgetu | undefined, smi: Smi, tarif: Tarif): boolean {
  return !!def && (def.velikosti.length > 1 || viditelnaPole(def, smi, tarif).length > 0);
}
