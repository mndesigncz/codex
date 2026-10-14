'use client';

// Data „navíc" pro okna a sekce vedení (kolo 9, balík V): sdílená mezipaměť
// widgetů (useDataWidgetu) + obnova po zápisu nebo rozhodnutí.
//
// `obnovDataWidgetu` obnovuje jen přesnou adresu, a /api/navic se čte s různými
// filtry (tým za měsíc, jen čekající, den uzávěrky, člověk v profilu). Po změně
// se proto navíc vyšle UDALOST_NAVIC (lib/navic) a každý háček tady si svou
// adresu obnoví sám — stejnou událost posílají i okna zaměstnance (balík Z),
// takže zápis z telefonu se do fronty vedení propíše bez obnovení stránky.

import { useEffect } from 'react';
import { UDALOST_NAVIC, URL_NABIDKA_NAVIC, URL_NAVIC, vyberDataNavic, vyberNabidku, type DataNavic, type NabidkaNavic } from '@/lib/navic';
import { obnovDataWidgetu, useDataWidgetu, type StavDat } from '../widgety/useDataWidgetu';

const URL_ODMENY = '/api/rewards';

/** Odpověď GET /api/navic/offers pro správu nabídky: položky i vypnuté/prošlé, a jestli je divák smí měnit. */
export interface DataNabidky { nabidka: NabidkaNavic[]; smiSpravovat: boolean }
export const vyberDataNabidky = (raw: unknown): DataNabidky => ({ nabidka: vyberNabidku(raw), smiSpravovat: (raw as { smi?: { nabidka?: unknown } } | null)?.smi?.nabidka === true });

/** Po každé změně: obnovit zápisy, nabídku i body (uznání jde do point_awards → žebříček, profil). */
export function obnovNavic(): void {
  obnovDataWidgetu(URL_NAVIC);
  obnovDataWidgetu(URL_NABIDKA_NAVIC);
  obnovDataWidgetu(URL_ODMENY);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(UDALOST_NAVIC));
}

/** Obnova vlastní adresy na UDALOST_NAVIC (zápis odjinud, rozhodnutí v jiném okně). */
function useObnovaNaUdalost(url: string | null, reload: () => void): void {
  useEffect(() => {
    if (!url) return;
    const f = () => reload();
    window.addEventListener(UDALOST_NAVIC, f);
    return () => window.removeEventListener(UDALOST_NAVIC, f);
  }, [url, reload]);
}

/** GET /api/navic s filtrem (urlNavic); null = neptat se (bez oprávnění). */
export function useNavic(url: string | null): StavDat<DataNavic> {
  const d = useDataWidgetu(url, vyberDataNavic);
  useObnovaNaUdalost(url, d.reload);
  return d;
}

/** GET /api/navic/offers; null = neptat se. */
export function useNabidkaNavic(url: string | null): StavDat<DataNabidky> {
  const d = useDataWidgetu(url, vyberDataNabidky);
  useObnovaNaUdalost(url, d.reload);
  return d;
}
