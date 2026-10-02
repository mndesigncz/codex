// Společné drobnosti nových obrazovek členů, skupin, zpráv a automatizací:
// volání API s poctivou chybou, skloňování a datum po česku.

import { type CzNoun } from '@/lib/czech';
import { pragueDaySafe, dbTimeDayHM } from '@/lib/pragueTime';
import { fmtCislo } from '@/lib/i18n/format';
import { ulozZAdresy, ulozSoubor, HLASKA_NEJDE_ULOZIT } from '@/lib/stahni';

export type Hlaska = (text: string, ton?: 'ok' | 'bad') => void;

export const CLEN: CzNoun = { one: 'člen', few: 'členové', many: 'členů' };
export const CLENA: CzNoun = { one: 'člena', few: 'členy', many: 'členů' };
export const CLENOVI: CzNoun = { one: 'členovi', few: 'členům', many: 'členům' };
export const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
export const NAVSTEVA: CzNoun = { one: 'návštěva', few: 'návštěvy', many: 'návštěv' };
export const RADEK: CzNoun = { one: 'řádek', few: 'řádky', many: 'řádků' };
export const EMAIL: CzNoun = { one: 'e-mail', few: 'e-maily', many: 'e-mailů' };
export const DEN: CzNoun = { one: 'den', few: 'dny', many: 'dní' };

const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

/** Volání API: chybu serveru vrátí jako Error se zprávou, kterou server napsal; výpadek sítě jako srozumitelnou větu. */
export async function j(url: string, init?: RequestInit): Promise<any> {
  let r: Response;
  try { r = await fetch(url, init ? { headers: JSON_HLAVICKA, ...init } : undefined); }
  catch { throw new Error('Bez připojení. Zkontroluj internet a zkus to znovu.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nepovedlo se. Zkus to znovu.');
  return d;
}

/** Číslo po česku s mezerou mezi tisíci („1 250“). */
export const cislo = (n: number): string => fmtCislo(Number(n) || 0, { locale: 'cs-CZ' });

/** Čas z pole datetime-local („2026-10-05T14:30“) jako pražské „5. 10. 14:30“. */
export const casZPole = (v: string): string => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : dbTimeDayHM(d.toISOString()); };

/** Datum z databáze česky i s rokem („11. 2. 2026"), přes pražský den. */
export function denCesky(v: unknown): string {
  const d = pragueDaySafe(v);
  return d ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : '–';
}

/** Stáhne soubor z adresy (CSV exporty) a řekne výsledek větou pro hlášku; v obalu aplikace jde přes sdílecí list. */
export async function stahniZAdresy(url: string, nazev: string): Promise<{ ok: boolean; zprava: string }> {
  const r = await ulozZAdresy(url, nazev);
  return r === 'nejde' ? { ok: false, zprava: HLASKA_NEJDE_ULOZIT } : { ok: true, zprava: r === 'sdileno' ? 'Soubor je připravený ke sdílení.' : 'Soubor se stáhl.' };
}

/** Uloží vlastní text (např. seznam nenalezených řádků) jako soubor. */
export async function ulozCsv(nazev: string, obsah: string): Promise<{ ok: boolean; zprava: string }> {
  const r = await ulozSoubor(nazev, obsah, 'text/csv;charset=utf-8');
  return r === 'nejde' ? { ok: false, zprava: HLASKA_NEJDE_ULOZIT } : { ok: true, zprava: 'Soubor se stáhl.' };
}
