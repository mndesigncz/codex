// Čistá logika klientských kusů „Navíc" (kolo 9, N1 — balík Z): bez Reactu, aby ji
// mohly pouštět testy scripts/testy/k85-navic-z.ts přímo v Node. Smlouva se serverem
// (typy, validace, souhrny) je v lib/navic.ts — tady je jen to, co potřebuje UI:
// adresy vlastních dat, sloučení zápisu do seznamu, počet zápisů ke směně, popisek
// pilulky nabídky a součet prémií za „navíc" v Mém výdělku.

import { URL_NAVIC, type NabidkaNavic, type Navic } from '../../lib/navic.ts';

/** Adresa vlastních zápisů (posledních 60 dní); na tabletu za vybraného člověka, nebo za měsíc RRRR-MM. */
export function urlNavicMine(actingAs?: number | null, mesic?: string): string {
  const q = new URLSearchParams();
  if (mesic) q.set('month', mesic);
  if (actingAs) q.set('actingAs', String(actingAs));
  const s = q.toString();
  return s ? `${URL_NAVIC}?${s}` : URL_NAVIC;
}

/** Stejný zápis po změně: nahradit v seznamu, nebo přidat na začátek. */
export function sloucZapis(items: readonly Navic[], z: Navic): Navic[] {
  return items.some(x => x.id === z.id) ? items.map(x => (x.id === z.id ? z : x)) : [z, ...items];
}

/**
 * Kolik zápisů „navíc" patří ke směně: podle shiftId, nebo podle dne, když zápis směnu
 * nenese (zapsaný z Domů nebo z úkolu). Odmítnuté se nepočítají — chip „navíc: 2" říká,
 * co k té směně platí. GET ?shiftId= po jedné směně by byl drahý; počítá se z jedné
 * odpovědi vlastních zápisů za 60 dní.
 */
export function pocetNavicKeSmene(items: readonly Pick<Navic, 'shiftId' | 'day' | 'status'>[], smena: { id?: number | null; date: string }): number {
  const den = String(smena.date ?? '').slice(0, 10);
  return items.filter(z => z.status !== 'odmitnuto' && ((smena.id != null && smena.id > 0 && z.shiftId === smena.id) || (z.shiftId == null && z.day === den))).length;
}

/** Popisek položky nabídky do pilulky: „Vytřít sklad · 20 b · 300 Kč" (měna přes formátovač podniku). */
export function popisekNabidky(n: Pick<NabidkaNavic, 'title' | 'points' | 'bonusCzk'>, money: (n: number) => string): string {
  const casti = [n.title];
  if (n.points > 0) casti.push(`${n.points} b`);
  if (n.bonusCzk) casti.push(money(n.bonusCzk));
  return casti.join(' · ');
}

/** Odměna položky nabídky nebo zápisu do věty: „+20 b · 300 Kč"; bez bodů i prémie prázdné. */
export function odmenaKratce(x: { points: number | null; bonusCzk: number | null }, money: (n: number) => string): string {
  const casti: string[] = [];
  if (x.points) casti.push(`+${x.points} b`);
  if (x.bonusCzk) casti.push(money(x.bonusCzk));
  return casti.join(' · ');
}

/** Prémie za uznané „navíc" v Mém výdělku (wage_adjustments source 'navic', jen kladné): počet a částka. */
export function premieZaNavic(upravy: readonly { source?: string | null; amount: number | string }[]): { pocet: number; castka: number } {
  const n = upravy.filter(u => u.source === 'navic' && Number(u.amount) > 0);
  return { pocet: n.length, castka: n.reduce((a, u) => a + Number(u.amount), 0) };
}

/**
 * Předvyplnit text názvem položky nabídky? Jen když je pole prázdné, nebo v něm je
 * jen název jiné položky — co člověk napsal sám, se klepnutím na pilulku nepřepíše.
 */
export function predvyplnitText(text: string, nabidka: readonly Pick<NabidkaNavic, 'title'>[]): boolean {
  const t = text.trim();
  return !t || nabidka.some(n => n.title === t);
}
