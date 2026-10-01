// Společné typy a pomocníci průvodce přechodem z Kartičky (components/client/ImportKartickaOkno.tsx).
// Serverový lib/importKartickaDb.ts se sem netahá jako hodnota (je v něm databáze), jen jako typy.

import type { NahledDavky, VysledekDavky, ZaznamImportu } from '@/lib/importKartickaDb';
import type { Mapovani, PoleImportu, ChybaRadku, RadekImportu } from '@/lib/importKarticka';
import { fmtCislo } from '@/lib/i18n/format';

export type { NahledDavky, VysledekDavky, ZaznamImportu, Mapovani, PoleImportu, ChybaRadku, RadekImportu };

/** Stejná hodnota jako MAX_DAVKA v lib/importKartickaDb.ts (tam ji nelze importovat, je to serverový soubor). */
export const MAX_DAVKA = 500;

export type Hlaska = (text: string, ton?: 'ok' | 'bad') => void;

/** Chyba odpovědi s HTTP stavem, ať jde poznat 403 (chybí oprávnění). */
export class ChybaApi extends Error {
  status: number;
  constructor(zprava: string, status: number) { super(zprava); this.status = status; }
}

/** Jeden fetch pro celý průvodce: relace se posílá vždy, chyba z odpovědi (`error`) jde člověku. */
export async function j<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init.headers ?? {}) } : init?.headers,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ChybaApi(String(d?.error || (r.status === 403 ? 'Na tohle nemáte oprávnění.' : 'Nepovedlo se.')), r.status);
  return d as T;
}

export const zprava = (e: unknown, nahradni = 'Nepovedlo se.'): string => (e instanceof Error && e.message ? e.message : nahradni);

/** „1 840" s pevnou mezerou jako oddělovačem tisíců. */
export const cislo = (n: number): string => fmtCislo(n, { locale: 'cs' });

export type StavNacteni<T> =
  | { stav: 'nic' }
  | { stav: 'nacita' }
  | { stav: 'ok'; data: T }
  | { stav: 'chyba'; zprava: string; status?: number };

/** Volby importu z kroku Náhled. */
export interface Volby {
  existujici: 'preskocit' | 'nastavit';
  /** '' = razítka se nepřenášejí, 'nova' = založit novou kampaň, jinak id existující kampaně. */
  kampan: string;
  novaPocet: string;
  novaOdmena: string;
  skupiny: boolean;
}

export interface KampanRazitek { id: number; name: string; required_stamps?: number; active?: boolean }

export const VYCHOZI_VOLBY: Volby = { existujici: 'preskocit', kampan: '', novaPocet: '10', novaOdmena: '', skupiny: true };

export const NAZEV_NOVE_KAMPANE = 'Karta z Kartičky';

/** Součty za všechny dávky dohromady. */
export interface SoucetImportu {
  noveUcty: number; novaClenstvi: number; aktualizovano: number; preskoceno: number;
  razitkaZapsana: number; razitkaBezKampane: number; plneKarty: number; zarazenoDoSkupin: number;
  chyby: { radek: number; duvod: string }[];
}

export const PRAZDNY_SOUCET: SoucetImportu = {
  noveUcty: 0, novaClenstvi: 0, aktualizovano: 0, preskoceno: 0, razitkaZapsana: 0, razitkaBezKampane: 0, plneKarty: 0, zarazenoDoSkupin: 0, chyby: [],
};

export function pricti(s: SoucetImportu, v: VysledekDavky): SoucetImportu {
  return {
    noveUcty: s.noveUcty + (v.noveUcty || 0),
    novaClenstvi: s.novaClenstvi + (v.novaClenstvi || 0),
    aktualizovano: s.aktualizovano + (v.aktualizovano || 0),
    preskoceno: s.preskoceno + (v.preskoceno || 0),
    razitkaZapsana: s.razitkaZapsana + (v.razitkaZapsana || 0),
    razitkaBezKampane: s.razitkaBezKampane + (v.razitkaBezKampane || 0),
    plneKarty: s.plneKarty + (v.plneKarty || 0),
    zarazenoDoSkupin: s.zarazenoDoSkupin + (v.zarazenoDoSkupin || 0),
    chyby: [...s.chyby, ...(Array.isArray(v.chyby) ? v.chyby : [])],
  };
}
