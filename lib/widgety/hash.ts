// Stálé „náhodné" hodnoty a id instancí (kolo 68).
//
// Vlnění v režimu úprav potřebuje u každé karty jinou fázi a délku kmitu,
// jinak se sousedé kývou v zákrytu. Náhoda by se ale měnila při každém
// překreslení, mezi serverem a klientem i v testech — proto se hodnota
// odvozuje z id instance hashem (FNV-1a): vypadá náhodně a je pořád stejná.
//
// Tady jsou i id instancí: výchozí položky mají id odvozené z widgetu
// (sklad.dochazi → sklad-dochazi), takže je první osobní kopie zachová.

import { VLNENI } from './konstanty.ts';

/** Tvar id instance: malá písmena, číslice a pomlčka. */
export const TVAR_ID = /^[a-z0-9-]{1,40}$/;

/** FNV-1a (32 bitů, bez znaménka) nad kódovými jednotkami řetězce. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Fáze kmitu v ms (0–519); v CSS jde jako záporné animation-delay. */
export function fazeKyvu(instance: string): number {
  return hash32(instance) % VLNENI.fazeMs;
}

/** Délka jednoho kmitu v ms: 260 × (0,92 … 1,08), tedy 239–281. */
export function delkaKyvu(instance: string): number {
  const h = hash32(instance);
  return Math.round(VLNENI.kmitMs * (1 - VLNENI.rozptyl + ((h >>> 9) % 17) / 100));
}

/**
 * Úhel vlnění ve stupních podle velikosti karty: roh se má vychýlit o 2,3 px,
 * tedy asin(2,3 / polovina úhlopříčky), v mezích 0,15–1,2°. Malý widget na
 * telefonu (170 × 136) vyjde na strop, velký na monitoru kolem 0,25°.
 */
export function uhelKyvu(sirka: number, vyska: number): number {
  const pul = Math.hypot(sirka, vyska) / 2;
  if (!(pul > VLNENI.rohPx)) return VLNENI.uhelMax;
  const uhel = (Math.asin(VLNENI.rohPx / pul) * 180) / Math.PI;
  return Math.min(VLNENI.uhelMax, Math.max(VLNENI.uhelMin, uhel));
}

/** Id výchozí položky z id widgetu: 'sklad.dochazi' → 'sklad-dochazi', druhý výskyt 'sklad-dochazi-2'. */
export function idZWidgetu(widget: string, poradi = 1): string {
  const zaklad = widget.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'widget';
  const pripona = poradi > 1 ? `-${poradi}` : '';
  return zaklad.slice(0, 40 - pripona.length) + pripona;
}

/**
 * Nové id pro položku, jejíž id chybí, má špatný tvar nebo se opakuje:
 * osm znaků [a-z0-9]. Odvozené hashem, ne náhodou — stejná uložená data
 * dají při každém čtení stejná id a klient nemusí přeskládávat klíče.
 */
export function nahradniId(widget: string, poradi: number, obsazene: ReadonlySet<string>): string {
  for (let sul = 0; ; sul++) {
    const id = hash32(`${widget}#${poradi}#${sul}`).toString(36).padStart(8, '0').slice(-8);
    if (!obsazene.has(id)) return id;
  }
}
