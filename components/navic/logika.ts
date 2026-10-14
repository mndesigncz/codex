// Čistá logika klientských kusů „Navíc" (kolo 9, N1 — balík Z): bez Reactu, aby ji
// mohly pouštět testy scripts/testy/k85-navic-z.ts přímo v Node. Smlouva se serverem
// (typy, validace, souhrny) je v lib/navic.ts — tady je jen to, co potřebuje UI:
// adresy vlastních dat, sloučení zápisu do seznamu, počet zápisů ke směně, popisek
// pilulky nabídky a součet prémií za „navíc" v Mém výdělku.

import { URL_NAVIC, URL_UKOLY_NAVIC, lzeVzit, type NabidkaNavic, type Navic, type StavUkoluNavic, type UkolNavic } from '../../lib/navic.ts';

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

// ---------------------------------------------------------------------------
// Úkoly za body (kolo 11, balík Z): čistá logika seznamu „Za body navíc"
// ---------------------------------------------------------------------------

/** Argument pohledu Úkoly z oznámení a odkazů: posune na sekci „Za body navíc" a zvýrazní ji. */
export const ARG_ZA_BODY = 'za-body';

/** Adresa dnešních úkolů za body (GET /api/navic/ukoly); na tabletu za vybraného člověka. */
export function urlUkolyZaBody(actingAs?: number | null): string {
  return actingAs ? `${URL_UKOLY_NAVIC}?actingAs=${actingAs}` : URL_UKOLY_NAVIC;
}

/** Akce řádku podle stavu: „Beru si" (zábor), „Hotovo" (zápis s offerId), „Vrátit" (uvolnit zábor). */
export type AkceUkolu = 'vzit' | 'hotovo' | 'vratit';

/**
 * Které akce řádek nabídne. S kapacitou se úkol nejdřív bere („Beru si"), ať ho nedělají dva —
 * pak „Hotovo" nebo „Vrátit". Bez kapacity (kdokoli) rovnou „Hotovo". Po odchodu ze směny
 * (tablet) už se nic nebere: jen „Hotovo" — zapsat, co člověk udělal.
 */
export function akceUkolu(u: Pick<UkolNavic, 'stav'> & { nabidka: Pick<NabidkaNavic, 'capacity'> }, poOdchodu = false): AkceUkolu[] {
  const s: StavUkoluNavic = u.stav;
  if (s === 'vzato') return poOdchodu ? ['hotovo'] : ['hotovo', 'vratit'];
  if (!lzeVzit(s)) return [];
  if (poOdchodu || u.nabidka.capacity == null) return ['hotovo'];
  return ['vzit'];
}

/** Kolik úkolů si člověk dnes může vzít (volné a „zkus znovu") — odznak u Úkolů v navigaci. */
export const pocetKVzeti = (ukoly: readonly Pick<UkolNavic, 'stav'>[]): number => ukoly.filter(u => lzeVzit(u.stav)).length;

/** Souhrn malé karty: kolik je k vzetí a nejvýš kolik bodů z nich jde dnes dostat („až +60 b"). */
export function souhrnZaBody(ukoly: readonly UkolNavic[]): { kVzeti: number; body: number; prvni: UkolNavic | null } {
  const k = ukoly.filter(u => lzeVzit(u.stav));
  return { kVzeti: k.length, body: k.reduce((a, u) => a + u.nabidka.points, 0), prvni: k[0] ?? null };
}

/** Volná místa v termínu („1 z 2 volné"); bez kapacity null. */
export function volnaMista(u: Pick<UkolNavic, 'obsazeno'> & { nabidka: Pick<NabidkaNavic, 'capacity'> }): { volno: number; z: number } | null {
  if (u.nabidka.capacity == null) return null;
  return { volno: Math.max(0, u.nabidka.capacity - u.obsazeno), z: u.nabidka.capacity };
}

/** Kdo další úkol má (bez mě): kdo ho bere a kdo už ho udělal — jména, ať se nedělá dvakrát. */
export function ostatni(u: Pick<UkolNavic, 'kdo' | 'stav'>, ja: number | null): { berou: string[]; hotovo: string[] } {
  const jini = u.kdo.filter(k => k.userId !== ja && k.name);
  return { berou: jini.filter(k => k.stav === 'vzato').map(k => k.name), hotovo: jini.filter(k => k.stav === 'hotovo').map(k => k.name) };
}

/** Úkoly, které jsou dnes plné (stav „plno") — pilulky nabídky v okně Zapsat navíc je vypnou s „Obsazeno". */
export const obsazeneNabidky = (ukoly: readonly Pick<UkolNavic, 'stav' | 'nabidka'>[]): Set<number> => new Set(ukoly.filter(u => u.stav === 'plno').map(u => u.nabidka.id));

/** Krátké jméno do chipu „Bere Eva": jen křestní (na 320 px se „Bere Eva Svobodová, Jakub Horák" nevejde). */
export const krestni = (jmeno: string): string => jmeno.trim().split(/\s+/)[0] ?? jmeno;

/** Fotka povinná a chybí → zápis se neodešle (stejné pravidlo hlídá server 400). */
export const chybiPovinnaFotka = (n: Pick<NabidkaNavic, 'requirePhoto'> | null | undefined, fotka: string | null): boolean => !!n?.requirePhoto && !fotka;
