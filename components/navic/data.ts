'use client';

// Data „Navíc" pro klienta (kolo 9, N1 — balík Z): jedna cesta k /api/navic pro okno,
// widget, Moje směny, uzávěrku i tablet.
//
// Proč vlastní obal nad useDataWidgetu: po zápisu nebo rozhodnutí se musí obnovit
// VŠECHNY varianty adresy (/api/navic, ?month=, ?actingAs=, ?scope=team…) a
// obnovDataWidgetu zná jen přesnou adresu. Tady se každá použitá adresa zapamatuje
// a `obnovNavic()` je obnoví všechny — a k tomu vyšle UDALOST_NAVIC, na kterou
// poslouchá každý, kdo data drží (i okna vedení z balíku V).

import { useEffect } from 'react';
import { obnovDataWidgetu, useDataWidgetu, type StavDat } from '../widgety/useDataWidgetu';
import { UDALOST_NAVIC, vyberDataNavic, vyberUkoly, type DataNavic, type UkolNavic } from '@/lib/navic';

const POUZITE = new Set<string>();

export { urlNavicMine, sloucZapis, urlUkolyZaBody } from './logika';

/** useDataWidgetu nad /api/navic, která se po každé změně obnoví sama (obnovNavic / UDALOST_NAVIC). */
export function useDataNavic(url: string | null): StavDat<DataNavic> {
  if (url) POUZITE.add(url);
  const data = useDataWidgetu<DataNavic>(url, vyberDataNavic);
  useEffect(() => {
    if (!url) return;
    const obnov = () => obnovDataWidgetu(url);
    window.addEventListener(UDALOST_NAVIC, obnov);
    return () => window.removeEventListener(UDALOST_NAVIC, obnov);
  }, [url]);
  return data;
}

/**
 * Dnešní úkoly za body (GET /api/navic/ukoly, kolo 11): widget, sekce v Úkolech, odznak
 * v navigaci, okno Zapsat navíc i tablet čtou tutéž adresu — jeden dotaz na obrazovku.
 * Obnovuje se s každou změnou navíc (zápis splní zábor, „Beru si" mění obsazenost).
 */
export function useUkolyZaBody(url: string | null): StavDat<UkolNavic[]> {
  if (url) POUZITE.add(url);
  const data = useDataWidgetu<UkolNavic[]>(url, vyberUkoly);
  useEffect(() => {
    if (!url) return;
    const obnov = () => obnovDataWidgetu(url);
    window.addEventListener(UDALOST_NAVIC, obnov);
    return () => window.removeEventListener(UDALOST_NAVIC, obnov);
  }, [url]);
  return data;
}

/** Po zápisu, úpravě, smazání nebo rozhodnutí: obnovit všechna data /api/navic, která kdo drží. */
export function obnovNavic(): void {
  for (const u of POUZITE) obnovDataWidgetu(u);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(UDALOST_NAVIC));
}
