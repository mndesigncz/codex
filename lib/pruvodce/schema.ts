// Čištění odpovědí průvodce. Všechno, co přijde z prohlížeče, projde tady:
// neznámé klíče se zahodí, hodnoty mimo seznam také, řetězce dostanou strop.
//
// Psané ručně, ne přes zod: výstup je stejně jen „co z toho smíme uložit",
// nikdy chyba. Špatná hodnota jednoho pole nesmí zahodit celý krok, takže
// validátor, který by odmítl celek, by tu jen překážel.
//
// E-maily pozvaných se neukládají (osobní údaje, vznikají v `invitations`),
// ukládá se jen jejich počet. Hesla ani tajemství tu nemají co dělat.

import { CURRENCIES, LOCALES } from '../money.ts';
import type { Cil, KlicPolozky, KrokId, Odpovedi, Onboarding, Pokladna, StavPruvodce, TypPodniku, VelikostTymu, Zeme } from './typy.ts';
import { CILE_ID, KROKY_VSECHNY, POKLADNY, POLOZKY_ID, STAVY, TYPY_ID, VELIKOSTI_TYMU, ZEME_ID } from './typy.ts';
import { cistiDobu } from './predvolby.ts';

/** Strop velikosti uloženého JSONu (bajty); nad ním 413. */
export const MAX_BAJTU = 4096;
export const MAX_NAZEV = 80;
export const MAX_ADRESA = 200;
export const MAX_POZICE = 40;
export const MAX_KASA = 1_000_000;

const JE_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

/** Řetězec oříznutý na délku, bez řídicích znaků a bez e-mailových adres. */
export function cistiText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(JE_EMAIL, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || undefined;
}

const zVyctu = <T extends string>(v: unknown, seznam: readonly T[]): T | undefined =>
  typeof v === 'string' && (seznam as readonly string[]).includes(v) ? (v as T) : undefined;

const jeObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Očistí odpovědi; co nejde poznat, vynechá. */
export function cistiOdpovedi(raw: unknown): Odpovedi {
  if (!jeObjekt(raw)) return {};
  const o: Odpovedi = {};
  const typ = zVyctu<TypPodniku>(raw.typ, TYPY_ID);
  if (typ) o.typ = typ;
  const nazev = cistiText(raw.nazev, MAX_NAZEV);
  if (nazev) o.nazev = nazev;
  const adresa = cistiText(raw.adresa, MAX_ADRESA);
  if (adresa) o.adresa = adresa;
  const zeme = zVyctu<Zeme>(raw.zeme, ZEME_ID);
  if (zeme) o.zeme = zeme;
  if (typeof raw.mena === 'string' && CURRENCIES.some(c => c.code === raw.mena)) o.mena = raw.mena;
  if (typeof raw.formatCisel === 'string' && LOCALES.some(l => l.code === raw.formatCisel)) o.formatCisel = raw.formatCisel;
  if (raw.zacatekTydne === 0 || raw.zacatekTydne === 1) o.zacatekTydne = raw.zacatekTydne;
  if (raw.doba !== undefined) {
    const doba = cistiDobu(raw.doba);
    if (doba) o.doba = doba;
  }
  if (jeObjekt(raw.tym)) {
    const t: NonNullable<Odpovedi['tym']> = {};
    const velikost = zVyctu<VelikostTymu>(raw.tym.velikost, VELIKOSTI_TYMU);
    if (velikost) t.velikost = velikost;
    const pozice = cistiText(raw.tym.pozice, MAX_POZICE);
    if (pozice) t.pozice = pozice;
    const p = Number(raw.tym.pozvanych);
    if (Number.isFinite(p) && p >= 0) t.pozvanych = Math.min(50, Math.floor(p));
    if (Object.keys(t).length) o.tym = t;
  }
  if (Array.isArray(raw.cile)) {
    const cile = CILE_ID.filter(c => (raw.cile as unknown[]).includes(c)) as Cil[];
    o.cile = cile;
  }
  const pokladna = zVyctu<Pokladna>(raw.pokladna, POKLADNY);
  if (pokladna) o.pokladna = pokladna;
  if (typeof raw.tablet === 'boolean') o.tablet = raw.tablet;
  if (raw.hotovostVKase !== undefined && raw.hotovostVKase !== null && raw.hotovostVKase !== '') {
    const h = Number(raw.hotovostVKase);
    if (Number.isFinite(h) && h >= 0 && h <= MAX_KASA) o.hotovostVKase = Math.round(h);
  }
  if (jeObjekt(raw.polozky)) {
    const p: Partial<Record<KlicPolozky, boolean>> = {};
    for (const k of POLOZKY_ID) if (typeof raw.polozky[k] === 'boolean') p[k] = raw.polozky[k] as boolean;
    if (Object.keys(p).length) o.polozky = p;
  }
  if (Array.isArray(raw.preskoceno)) {
    const p = KROKY_VSECHNY.filter(k => (raw.preskoceno as unknown[]).includes(k)) as KrokId[];
    o.preskoceno = p;
  }
  return o;
}

/**
 * Sloučení podle klíčů: nová odpověď přepíše starou jen u klíče, který poslala.
 * `tym` a `polozky` se slučují po polích (krok Tým neposílá `polozky`).
 * `undefined` v nových odpovědích nic nemění; `null` klíč odstraní.
 */
export function slouciOdpovedi(stare: Odpovedi, nove: Odpovedi): Odpovedi {
  const out: Record<string, unknown> = { ...stare };
  for (const [k, v] of Object.entries(nove)) {
    if (v === undefined) continue;
    if ((k === 'tym' || k === 'polozky') && jeObjekt(v) && jeObjekt(out[k])) out[k] = { ...(out[k] as object), ...v };
    else out[k] = v;
  }
  return out as Odpovedi;
}

/** Odpovědi, které autosave smí poslat s klíčem `null` = smazat (vrátit krok na výchozí). */
export function odeberKlice(odpovedi: Odpovedi, raw: unknown): Odpovedi {
  if (!jeObjekt(raw)) return odpovedi;
  const out: Record<string, unknown> = { ...odpovedi };
  for (const [k, v] of Object.entries(raw)) if (v === null && k in out) delete out[k];
  return out as Odpovedi;
}

/** Celý záznam z databáze (nebo odkudkoli) na bezpečný tvar. */
export function cistiOnboarding(raw: unknown): Onboarding | null {
  let r = raw;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch { return null; } }
  if (!jeObjekt(r)) return null;
  const stav = zVyctu<StavPruvodce>(r.stav, STAVY);
  if (!stav) return null;
  const krok = zVyctu<KrokId>(r.krok, KROKY_VSECHNY);
  const iso = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);
  const pouzito: Record<string, string> = {};
  if (jeObjekt(r.pouzito)) {
    for (const [k, v] of Object.entries(r.pouzito)) if (typeof v === 'string' && /^[a-z]{3,12}$/.test(k) && v.length <= 32) pouzito[k] = v;
  }
  return {
    v: 1, stav, ...(krok ? { krok } : {}),
    zacato: iso(r.zacato), upraveno: iso(r.upraveno), dokonceno: iso(r.dokonceno),
    odpovedi: cistiOdpovedi(r.odpovedi), pouzito,
  };
}

/** Velikost záznamu v bajtech (UTF-8). */
export function bajtu(o: unknown): number {
  const s = JSON.stringify(o);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdbff ? (i++, 4) : 3;
  }
  return n;
}

export const jeMalyDost = (o: unknown): boolean => bajtu(o) <= MAX_BAJTU;
