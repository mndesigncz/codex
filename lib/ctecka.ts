// Čtečka u kasy: čistá logika (bez prohlížeče a databáze, jde testovat přímo).
//
// Hardwarová čtečka QR a čárových kódů na terminálu se tváří jako klávesnice:
// napíše kód a na konec Enter (nebo Tab). Někdy před kód přidá prefix (id
// symbologie `]Q1`, řídicí znaky STX) a za něj suffix (CR/LF, ETX). Tady se ze
// surového textu udělá kód, rozpozná se druh (karta hosta, kupon, poukaz),
// pozná se dvojitý sken téhož kódu a rychlé psaní čtečky od ručního.

import { rozpoznejQr, KUPON_PREFIX } from './kuponQr.ts';
import { overKod } from './poukazy.ts';
import { czCount } from './czech.ts';

export type DruhKodu = 'karta' | 'kupon' | 'poukaz' | 'prazdny' | 'cizi';

export interface RozpoznanyKod {
  typ: DruhKodu;
  /** Normalizovaný kód: karta ABCD-EFGH, kupon ABC-DEF, poukaz DP-ABCD-2345; jinak prázdné. */
  kod: string;
}

/**
 * Zbaví surový vstup čtečky všeho, co kód není: řídicí znaky (CR, LF, Tab, STX, ETX),
 * identifikátor symbologie na začátku (`]Q1` u QR, `]C1` u Code 128) a okolní mezery.
 */
export function ocistiVstupCtecky(raw: unknown): string {
  let s = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ');
  s = s.trim().slice(0, 300);
  // AIM identifikátor: `]` + písmeno + znak. Skutečný kód s `]` na začátku neexistuje.
  s = s.replace(/^\][A-Za-z][0-9A-Za-z]/, '').trim();
  return s;
}

/**
 * Rozpozná, co čtečka přečetla.
 *  - karta hosta: osm znaků (ABCD-EFGH, i malými, bez pomlčky, s mezerou)
 *  - kupon: `managero:coupon:ABC-DEF` nebo šest znaků
 *  - poukaz: `DP-ABCD-2345` (deset znaků s předponou DP a správným kontrolním znakem)
 *  - cokoli jiného (URL, wifi, cizí QR, krátký šum) je `cizi`, prázdný vstup `prazdny`
 * Osm znaků bez předpony DP je vždy karta, poukaz se bez předpony nepozná.
 */
export function rozpoznejKod(raw: unknown): RozpoznanyKod {
  const s = ocistiVstupCtecky(raw);
  if (!s) return { typ: 'prazdny', kod: '' };
  const jenKod = /^[A-Za-z0-9 -]+$/.test(s);
  if (jenKod && !s.toLowerCase().startsWith(KUPON_PREFIX)) {
    const c = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length === 10 && c.startsWith('DP')) {
      const k = overKod(c);
      return k ? { typ: 'poukaz', kod: k } : { typ: 'cizi', kod: '' };
    }
  }
  const r = rozpoznejQr(s);
  if (r.typ === 'karta') return { typ: 'karta', kod: r.kod.slice(0, 4) + '-' + r.kod.slice(4) };
  if (r.typ === 'kupon') return { typ: 'kupon', kod: r.kod };
  return { typ: r.typ === 'prazdny' ? 'prazdny' : 'cizi', kod: '' };
}

/** Okno, ve kterém se stejný kód přečtený podruhé bere jako dvojitý sken. */
export const OKNO_DVOJITEHO_SKENU_MS = 2000;

/** Je to týž kód jako posledně a přišel do `okno` ms? Pak se druhý sken zahodí. */
export function jeDvojitySken(posledni: { kod: string; cas: number } | null, kod: string, ted: number, okno = OKNO_DVOJITEHO_SKENU_MS): boolean {
  return !!posledni && !!kod && posledni.kod === kod && ted - posledni.cas >= 0 && ted - posledni.cas < okno;
}

/** Nejdelší mezera mezi znaky, kterou ještě píše čtečka (levnější Bluetooth čtečky jsou pomalejší). */
export const MAX_MEZERA_CTECKY_MS = 80;

/**
 * Psal to stroj? Čtečka píše znak po znaku v desítkách milisekund, člověk ve stovkách.
 * `casy` jsou časy stisků v ms; stroj = aspoň `min` znaků a žádná mezera nad `maxMezera`.
 */
export function psalaCtecka(casy: number[], min = 6, maxMezera = MAX_MEZERA_CTECKY_MS): boolean {
  if (casy.length < min) return false;
  for (let i = 1; i < casy.length; i++) if (casy[i] - casy[i - 1] > maxMezera) return false;
  return true;
}

export interface ZaznamHistorie {
  id: number;
  cas: number;
  /** Co se načetlo: jméno hosta, název kuponu, kód poukazu nebo věta o chybě. */
  popis: string;
  ok: boolean;
  /** Normalizovaný kód, kterým jde záznam načíst znovu (jen u úspěšných). */
  kod?: string;
}

/** Nejnovější nahoře, nejvýš `max` záznamů. Nemění vstup. */
export function pridejDoHistorie(hist: ZaznamHistorie[], z: ZaznamHistorie, max = 5): ZaznamHistorie[] {
  return [z, ...hist].slice(0, max);
}

/** Nabídka automatického návratu na „Čekám na další kartu": sekundy, 0 = zůstat u hosta. */
export const NAVRAT_MOZNOSTI = [5, 8, 15, 30, 0] as const;
export const NAVRAT_VYCHOZI_S = 8;

/** Z uložené hodnoty udělá platnou volbu návratu; cokoli jiného je výchozích 8 s. */
export function navratSekundy(raw: unknown): number {
  const n = Number(raw);
  return raw != null && raw !== '' && (NAVRAT_MOZNOSTI as readonly number[]).includes(n) ? n : NAVRAT_VYCHOZI_S;
}

/** Popisek volby návratu. */
export function navratPopisek(s: number): string {
  return s === 0 ? 'Zůstat' : `${s} s`;
}

const dnyPrahy = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });

/** Kdy host naposledy přišel: „poprvé", „dnes", „včera", „před 3 dny" (podle pražského dne). */
export function poslediNavsteva(iso: string | null | undefined, ted: Date = new Date()): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return 'poprvé u nás';
  const dny = Math.round((Date.parse(dnyPrahy(ted) + 'T12:00:00Z') - Date.parse(dnyPrahy(d) + 'T12:00:00Z')) / 86400000);
  if (dny <= 0) return 'dnes';
  if (dny === 1) return 'včera';
  return `před ${czCount(dny, { one: 'dnem', few: 'dny', many: 'dny' })}`;
}
