'use client';

// Data „trestů" pro okna, sekce a widgety vedení (kolo 10, balík V): sdílená
// mezipaměť widgetů (useDataWidgetu) + obnova po každé změně.
//
// `obnovDataWidgetu` obnovuje jen přesnou adresu, a /api/tresty se čte s různými
// filtry (tým za měsíc, platné kvůli sporům, den uzávěrky, člověk v profilu). Po
// změně se proto navíc vyšle UDALOST_TRESTY (lib/tresty) a každý háček tady si svou
// adresu obnoví sám — stejnou událost posílá i zaměstnanec (balík Z), takže jeho
// „Nesouhlasím" se do fronty vedení propíše bez obnovení stránky.

import { useEffect } from 'react';
import {
  UDALOST_TRESTY, URL_DRUHY_TRESTU, URL_NAVRHY_TRESTU, URL_TRESTY, vyberDataTrestu, vyberDruhy, vyberNavrhy,
  type DataTrestu, type DruhTrestu, type NavrhTrestu,
} from '@/lib/tresty';
import { obnovDataWidgetu, useDataWidgetu, type StavDat } from '../widgety/useDataWidgetu';

const URL_ODMENY = '/api/rewards';
/** Fronta „Čeká na tebe" a sporné ve widgetu čtou tutéž adresu (ZDROJE_FRONT.tresty). */
export const URL_TRESTY_PLATNE = '/api/tresty?scope=team&status=plati';

/** Odpověď GET /api/tresty/types: položky sazebníku a jestli je divák smí měnit. */
export interface DataSazebniku { druhy: DruhTrestu[]; smiSpravovat: boolean }
export const vyberDataSazebniku = (raw: unknown): DataSazebniku => ({
  druhy: vyberDruhy(raw),
  smiSpravovat: (raw as { smi?: { sazebnik?: unknown } } | null)?.smi?.sazebnik === true,
});

/** Strop krácení z GET /api/tresty?strop=1: kolik jde ještě krátit, prémie za měsíc, už kráceno. */
export interface StropKraceni { strop: number; premie: number; uzKraceno: number }
export const vyberStrop = (raw: unknown): StropKraceni => {
  const o = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  return { strop: n(o.strop), premie: n(o.premie), uzKraceno: n(o.uzKraceno) };
};
export const urlStropu = (userId: number, day: string, bez?: number | null): string =>
  `${URL_TRESTY}?strop=1&userId=${userId}&day=${day}${bez ? `&bez=${bez}` : ''}`;

/** Po každé změně: obnovit tresty, sazebník, návrhy i body (trest jde do point_awards → žebříček, profil). */
export function obnovTresty(): void {
  obnovDataWidgetu(URL_TRESTY);
  obnovDataWidgetu(URL_TRESTY_PLATNE);
  obnovDataWidgetu(URL_DRUHY_TRESTU);
  obnovDataWidgetu(URL_NAVRHY_TRESTU);
  obnovDataWidgetu(URL_ODMENY);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(UDALOST_TRESTY));
}

/** Obnova vlastní adresy na UDALOST_TRESTY (změna odjinud, rozhodnutí v jiném okně). */
function useObnovaNaUdalost(url: string | null, reload: () => void): void {
  useEffect(() => {
    if (!url) return;
    const f = () => reload();
    window.addEventListener(UDALOST_TRESTY, f);
    return () => window.removeEventListener(UDALOST_TRESTY, f);
  }, [url, reload]);
}

/** GET /api/tresty s filtrem (urlTresty); null = neptat se (bez oprávnění). */
export function useTresty(url: string | null): StavDat<DataTrestu> {
  const d = useDataWidgetu(url, vyberDataTrestu);
  useObnovaNaUdalost(url, d.reload);
  return d;
}

/** GET /api/tresty/types; null = neptat se. */
export function useSazebnik(url: string | null): StavDat<DataSazebniku> {
  const d = useDataWidgetu(url, vyberDataSazebniku);
  useObnovaNaUdalost(url, d.reload);
  return d;
}

/** GET /api/tresty/navrhy (jen tresty.udelit); null = neptat se. */
export function useNavrhyTrestu(zapnuto: boolean): StavDat<NavrhTrestu[]> {
  const url = zapnuto ? URL_NAVRHY_TRESTU : null;
  const d = useDataWidgetu(url, vyberNavrhy);
  useObnovaNaUdalost(url, d.reload);
  return d;
}

/** Strop krácení pro člověka a den (jen tresty.udelit); null = neptat se. */
export function useStropKraceni(url: string | null): StavDat<StropKraceni> {
  return useDataWidgetu(url, vyberStrop);
}
