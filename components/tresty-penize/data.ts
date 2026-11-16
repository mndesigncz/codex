'use client';

// Data a akce „Tresty a peníze" pro UI (kolo 96, kontrakt docs/TRESTY-PENIZE.md). Sdílené pro obě sady
// UI (vedení i zaměstnanec + výplaty) — UI ho jen používá, nemění. Akce vrací odpověď serveru, nebo
// vyhodí ApiError s větou serveru (zobrazit přes apiMessage / prelozHlaskuTrestu); po úspěchu obnoví
// tresty (UDALOST_TRESTY), srážky i výplaty, ať se změna propíše do všech widgetů bez obnovení stránky.

import { useEffect } from 'react';
import { okJson } from '@/lib/api';
import { UDALOST_TRESTY, URL_TRESTY } from '@/lib/tresty';
import {
  URL_ODMENY_DAVKA, URL_SLOZKA, URL_SRAZKY, URL_VYBER_LIDI, jeStavSrazky, vyberSlozku,
  type DruhSrazky, type NastaveniSlozky, type StavSrazky,
} from '@/lib/trestyPenize';
import { obnovDataWidgetu, useDataWidgetu, type StavDat } from '../widgety/useDataWidgetu';

// ---------------------------------------------------------------------------
// Tvary odpovědí
// ---------------------------------------------------------------------------

/** Řádek GET /api/tresty/srazky. */
export interface RadekSrazky {
  id: number; penaltyId: number; userId: number; userName: string; userAvatar: string | null;
  druh: DruhSrazky; castka: number; splatky: number; stav: StavSrazky; day: string; text: string; trestPlati: boolean;
  nesouhlasDuvod: string | null; nesouhlasAt: string | null; souhlasAt: string | null; createdAt: string | null;
}

export function vyberSrazky(raw: unknown): RadekSrazky[] {
  const pole = Array.isArray((raw as { items?: unknown } | null)?.items) ? (raw as { items: Record<string, unknown>[] }).items : [];
  const t = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return pole.filter(r => Number(r?.id) > 0 && jeStavSrazky(r?.stav)).map(r => ({
    id: Number(r.id), penaltyId: Number(r.penaltyId), userId: Number(r.userId), userName: String(r.userName ?? ''), userAvatar: t(r.userAvatar),
    druh: r.druh === 'nahrada' ? 'nahrada' : 'srazka', castka: Math.round(Number(r.castka) || 0), splatky: Math.max(1, Number(r.splatky) || 1),
    stav: r.stav as StavSrazky, day: String(r.day ?? '').slice(0, 10), text: String(r.text ?? ''), trestPlati: r.trestPlati !== false,
    nesouhlasDuvod: t(r.nesouhlasDuvod), nesouhlasAt: t(r.nesouhlasAt), souhlasAt: t(r.souhlasAt), createdAt: t(r.createdAt),
  }));
}

/** GET /api/tresty/vyber: lidé podniku, kdo byl na směně dne a na uzávěrce. */
export interface VyberLidi { day: string; lide: { id: number; name: string; avatar: string | null; role: string; jobTitle: string | null }[]; smena: number[]; uzaverka: number[] }

export function vyberVyberLidi(raw: unknown): VyberLidi {
  const o = (raw ?? {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter(n => Number.isFinite(n) && n > 0) : []);
  return {
    day: String(o.day ?? ''),
    lide: (Array.isArray(o.lide) ? o.lide as Record<string, unknown>[] : []).filter(l => Number(l?.id) > 0).map(l => ({
      id: Number(l.id), name: String(l.name ?? ''), avatar: typeof l.avatar === 'string' ? l.avatar : null, role: String(l.role ?? ''), jobTitle: typeof l.jobTitle === 'string' ? l.jobTitle : null,
    })),
    smena: ids(o.smena), uzaverka: ids(o.uzaverka),
  };
}

// ---------------------------------------------------------------------------
// Adresy a háčky
// ---------------------------------------------------------------------------

export const urlSrazek = (o: { scope?: 'mine' | 'team'; stav?: StavSrazky; userId?: number } = {}): string => {
  const q = new URLSearchParams();
  if (o.scope === 'team') q.set('scope', 'team');
  if (o.stav) q.set('stav', o.stav);
  if (o.userId) q.set('userId', String(o.userId));
  const s = q.toString();
  return s ? `${URL_SRAZKY}?${s}` : URL_SRAZKY;
};
export const urlVyberu = (day: string, closingId?: number | null): string => `${URL_VYBER_LIDI}?day=${day}${closingId ? `&closingId=${closingId}` : ''}`;
export const urlSlozky = (userId: number): string => `${URL_SLOZKA}?userId=${userId}`;

const POUZITE = new Set<string>();

function useObnova(url: string | null, reload: () => void): void {
  useEffect(() => {
    if (!url) return;
    const f = () => reload();
    window.addEventListener(UDALOST_TRESTY, f);
    return () => window.removeEventListener(UDALOST_TRESTY, f);
  }, [url, reload]);
}

/** GET /api/tresty/srazky (fronta „čeká na souhlas" / „nesouhlasí", vlastní srážky); null = neptat se. */
export function useSrazky(url: string | null): StavDat<RadekSrazky[]> {
  if (url) POUZITE.add(url);
  const d = useDataWidgetu(url, vyberSrazky);
  useObnova(url, d.reload);
  return d;
}

/** GET /api/tresty/vyber pro hromadný výběr a záskok; null = neptat se. */
export function useVyberLidi(url: string | null): StavDat<VyberLidi> {
  return useDataWidgetu(url, vyberVyberLidi);
}

/** GET /api/payroll/slozka?userId= (finance.mzdy); null = neptat se. */
export function useSlozka(url: string | null): StavDat<NastaveniSlozky | null> {
  const d = useDataWidgetu(url, (raw: unknown) => vyberSlozku((raw as { slozka?: unknown } | null)?.slozka));
  useObnova(url, d.reload);
  return d;
}

/** Po každé změně peněz: tresty, srážky, výplaty (payroll, docházka s úpravami mzdy). */
export function obnovPenize(): void {
  for (const u of POUZITE) obnovDataWidgetu(u);
  obnovDataWidgetu(URL_TRESTY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UDALOST_TRESTY));
    window.dispatchEvent(new CustomEvent(UDALOST_VYPLATY));
  }
}
/** Událost pro výplatní listinu, Můj výdělek a profil člena: peníze se změnily, přenačíst /api/payroll a /api/attendance. */
export const UDALOST_VYPLATY = 'vyplaty:zmena';

// ---------------------------------------------------------------------------
// Akce
// ---------------------------------------------------------------------------

async function posli(url: string, method: string, telo?: unknown): Promise<any> {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(telo === undefined ? {} : { body: JSON.stringify(telo) }) });
  const out = await okJson(r);
  obnovPenize();
  return out;
}

/** Zaměstnanec souhlasí se srážkou: `zneni` přesně z item.penize.srazky[].zneni (409 = znění se změnilo, nové v chybě). */
export const souhlasSeSrazkou = (id: number, zneni: string) => posli(`${URL_SRAZKY}/${id}`, 'PATCH', { souhlas: true, zneni });
/** Zaměstnanec nesouhlasí (nepovinně proč, do 300 znaků). */
export const nesouhlasSeSrazkou = (id: number, duvod?: string) => posli(`${URL_SRAZKY}/${id}`, 'PATCH', { nesouhlas: true, duvod: duvod ?? null });
/** Vedení: zrušit srážku. */
export const zrusSrazku = (id: number, note?: string) => posli(`${URL_SRAZKY}/${id}`, 'PATCH', { status: 'zruseno', note: note ?? null });
/** Vedení: snížit srážku (zvýšit nejde). */
export const snizSrazku = (id: number, castka: number) => posli(`${URL_SRAZKY}/${id}`, 'PATCH', { castka });
/** Vedení: po nesouhlasu požádat znovu. */
export const znovuOSouhlas = (id: number) => posli(`${URL_SRAZKY}/${id}`, 'PATCH', { znovu: true });
/** Nastavit nenárokovou složku člena (finance.sazby_upravit); typ null = zrušit. */
export const ulozSlozku = (userId: number, slozka: NastaveniSlozky | null) =>
  posli(URL_SLOZKA, 'PUT', slozka ? { userId, typ: slozka.typ, hodnota: slozka.hodnota, vSazbe: slozka.vSazbe } : { userId, typ: null });
/** Hromadná odměna v penězích (finance.mzdy). */
export const hromadnaOdmena = (o: { userIds: number[]; castka: number; rozpocitat?: boolean; day?: string; text: string; nenarokova?: boolean }) =>
  posli(URL_ODMENY_DAVKA, 'POST', o);
/** Vzít hromadnou odměnu zpět. */
export const vezmiOdmenuZpet = (batchId: number) => posli(`${URL_ODMENY_DAVKA}?batchId=${batchId}`, 'DELETE');
