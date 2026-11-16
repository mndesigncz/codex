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
import { ApiError, okJson, statusMessage } from '@/lib/api';
import { URL_SRAZKY, jeStavSrazky, type StavSrazky } from '@/lib/trestyPenize';
import { obnovPenize } from '../tresty-penize/data';

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

// ---------------------------------------------------------------------------
// Souhlas se srážkou (kolo 96, docs/TRESTY-PENIZE.md 4.5)
// ---------------------------------------------------------------------------

export type VysledekSouhlasu =
  | { ok: true; stav: StavSrazky; odDne: string | null }
  /** 409: znění se mezitím změnilo — `zneni` je nové, ukázat a nechat potvrdit znovu. */
  | { ok: false; zneni: string; chyba: string };

/**
 * „Souhlasím se srážkou": stejné volání jako `souhlasSeSrazkou` (components/tresty-penize/data), jen 409
 * se změněným zněním neskončí výjimkou — tělo odpovědi nese nové `zneni` a to se má hned ukázat
 * (ApiError z okJson extra pole odpovědi nenese). Ostatní chyby vyhodí ApiError s větou serveru.
 * Po každé odpovědi se obnoví tresty, srážky i výplaty (obnovPenize).
 */
export async function souhlasimSeSrazkou(id: number, zneni: string): Promise<VysledekSouhlasu> {
  const r = await fetch(`${URL_SRAZKY}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ souhlas: true, zneni }) });
  if (r.status === 409) {
    let telo: { error?: unknown; zneni?: unknown } | null = null;
    try { telo = await r.json(); } catch { /* chybová odpověď nemusí být JSON */ }
    obnovPenize();
    const veta = typeof telo?.error === 'string' && telo.error ? telo.error : statusMessage(409);
    if (typeof telo?.zneni === 'string' && telo.zneni.trim()) return { ok: false, zneni: telo.zneni, chyba: veta };
    throw new ApiError(409, veta);
  }
  const d = await okJson(r);
  obnovPenize();
  return { ok: true, stav: jeStavSrazky(d?.srazka?.stav) ? d.srazka.stav : 'uplatneno', odDne: typeof d?.srazka?.odDne === 'string' ? d.srazka.odDne : null };
}
