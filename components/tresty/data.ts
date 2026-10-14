'use client';

// Data „Tresty" pro klienta (kolo 10, balík Z): jedna cesta k /api/tresty pro widget
// Moje tresty, okno DetailTrestu i otevření z oznámení na stránce Odměny.
//
// Proč vlastní obal nad useDataWidgetu (vzor components/navic/data.ts): po potvrzení
// nebo vyjádření se musí obnovit VŠECHNY varianty adresy, které kdo drží, a
// obnovDataWidgetu zná jen přesnou adresu. Každá použitá adresa se tu zapamatuje,
// `obnovTresty()` je obnoví všechny a vyšle UDALOST_TRESTY — na tu poslouchá každý,
// kdo data drží (i okna vedení z balíku V).

import { useEffect } from 'react';
import { obnovDataWidgetu, useDataWidgetu, type StavDat } from '../widgety/useDataWidgetu';
import { UDALOST_TRESTY, vyberDataTrestu, type DataTrestu } from '@/lib/tresty';

const POUZITE = new Set<string>();

/** useDataWidgetu nad /api/tresty, která se po každé změně obnoví sama (obnovTresty / UDALOST_TRESTY). */
export function useDataTresty(url: string | null): StavDat<DataTrestu> {
  if (url) POUZITE.add(url);
  const data = useDataWidgetu<DataTrestu>(url, vyberDataTrestu);
  useEffect(() => {
    if (!url) return;
    const obnov = () => obnovDataWidgetu(url);
    window.addEventListener(UDALOST_TRESTY, obnov);
    return () => window.removeEventListener(UDALOST_TRESTY, obnov);
  }, [url]);
  return data;
}

/** Po potvrzení nebo vyjádření: obnovit všechna data /api/tresty, která kdo drží. */
export function obnovTresty(): void {
  for (const u of POUZITE) obnovDataWidgetu(u);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(UDALOST_TRESTY));
}
