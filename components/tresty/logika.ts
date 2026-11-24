// Čistá logika zaměstnanecké části „Tresty" (kolo 10, balík Z): bez Reactu, aby ji
// pouštěly testy scripts/testy/k86-tresty-z.ts přímo v Node. Smlouva se serverem
// (typy, souhrny, chip stavu, pořadí opakování) je v lib/tresty.ts — tady je jen to,
// co potřebuje widget Moje tresty a okno DetailTrestu: co se ukáže v měsíci, filtr
// Vše / Platné / Zrušené, který trest otevřít z oznámení, sloučení po změně
// a kontrola vyjádření před odesláním.

import { MAX_DELKA_POZNAMKY, MAX_DELKA_VYJADRENI, nepotvrzeny, normalizujText, poradiOpakovani, seradTresty, type Trest } from '../../lib/tresty.ts';
import { ZDROJ_ZASKOK, type SrazkaTrestu } from '../../lib/trestyPenize.ts';

/** Argument pohledu rewards z oznámení (`/employee/shifts?view=rewards&arg=tresty`). */
export const ARG_TRESTY = 'tresty';

/** Filtr ve velkém widgetu. */
export type FiltrTrestu = 'vse' | 'plati' | 'zruseno';
export const FILTRY_TRESTU: readonly FiltrTrestu[] = ['vse', 'plati', 'zruseno'];

/**
 * Co widget v měsíci ukáže: tresty toho měsíce a k nim každý nepotvrzený trest
 * odjinud (z konce minulého měsíce, který člověk ještě neviděl — ten nesmí zmizet
 * jen proto, že se přehouplo datum). Seřazené: sporné, nepotvrzené, nejnovější,
 * zrušené na konec (seradTresty).
 */
export function trestyMesice(items: readonly Trest[], mesic: string): Trest[] {
  return seradTresty(items.filter(t => t.day.startsWith(mesic) || nepotvrzeny(t)));
}

/** Nepotvrzené tresty, nejnovější první (malá karta ukazuje ten první). */
export function nepotvrzene(items: readonly Trest[]): Trest[] {
  return items.filter(nepotvrzeny).sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}

export function filtrujTresty(items: readonly Trest[], f: FiltrTrestu): Trest[] {
  return f === 'vse' ? [...items] : items.filter(t => t.status === f);
}

export function poctyFiltru(items: readonly Trest[]): Record<FiltrTrestu, number> {
  const p: Record<FiltrTrestu, number> = { vse: items.length, plati: 0, zruseno: 0 };
  for (const t of items) p[t.status]++;
  return p;
}

/**
 * Který trest otevřít z oznámení: nejnovější nepotvrzený; když žádný není (oznámení
 * o zrušení vede na stejnou adresu), ten, se kterým se naposled něco stalo
 * (zrušení, jinak udělení). Prázdný seznam = nic.
 */
export function trestKOtevreni(items: readonly Trest[]): Trest | null {
  // Kolo 96: oznámení „Srážka X čeká na tvůj souhlas" vede na stejnou adresu — trest se srážkou
  // k souhlasu má přednost (nejnovější), ať člověk skončí rovnou u dohody.
  const s = kSouhlasu(items)[0];
  if (s) return s.trest;
  const n = nepotvrzene(items)[0];
  if (n) return n;
  const kdy = (t: Trest) => t.cancelledAt ?? t.createdAt ?? t.day;
  return [...items].sort((a, b) => kdy(b).localeCompare(kdy(a)) || b.id - a.id)[0] ?? null;
}

/** Stejný trest po změně (potvrzení, vyjádření): nahradit v seznamu, nebo přidat na začátek. */
export function sloucTrest(items: readonly Trest[], t: Trest): Trest[] {
  return items.some(x => x.id === t.id) ? items.map(x => (x.id === t.id ? t : x)) : [t, ...items];
}

/** Vyjádření před odesláním — stejná pravidla a hlášky jako server (PATCH response). */
export function validujVyjadreni(raw: string): { ok: true; text: string } | { ok: false; chyba: string } {
  const t = normalizujText(raw, MAX_DELKA_VYJADRENI);
  if (t === null) return { ok: false, chyba: 'Napiš své vyjádření.' };
  if (t === false) return { ok: false, chyba: 'Vyjádření je moc dlouhé (nejvýš 500 znaků) nebo moc krátké.' };
  return { ok: true, text: t };
}

/** Smí člověk u trestu ještě něco udělat? Potvrdit jen nepotvrzený platný, vyjádřit se k platnému. */
export function akceTrestu(t: Pick<Trest, 'status' | 'seenAt'>): { potvrdit: boolean; vyjadrit: boolean } {
  const plati = t.status === 'plati';
  return { potvrdit: plati && !t.seenAt, vyjadrit: plati };
}

/**
 * Kolikátý je tenhle trest stejného druhu (položky sazebníku) v jeho měsíci — „3. v tomto
 * měsíci" v detailu. poradiOpakovani z lib/tresty počítá pro NOVÝ trest (všechny platné
 * v měsíci + 1); u existujícího se počítají jen ty, které přišly před ním. Zrušený
 * a trest bez položky sazebníku null.
 */
export function poradiVMesici(items: readonly Trest[], t: Trest): number | null {
  if (t.status !== 'plati' || !t.typeId) return null;
  const pred = items.filter(x => x.id !== t.id && (x.day < t.day || (x.day === t.day && (x.createdAt < t.createdAt || (x.createdAt === t.createdAt && x.id < t.id)))));
  return poradiOpakovani(pred, { userId: t.userId, typeId: t.typeId, day: t.day });
}

// ---------------------------------------------------------------------------
// Peníze z výplaty (kolo 96, docs/TRESTY-PENIZE.md): srážka k souhlasu, nesouhlas, záskok
// ---------------------------------------------------------------------------

/** Hláška serveru, když se znění dohody mezi zobrazením a souhlasem změnilo (409 + nové `zneni`). */
export const VETA_ZMENENE_ZNENI = 'Znění dohody se mezitím změnilo — přečti si ho znovu.';
/** Hláška délky důvodu nesouhlasu (stejná jako server PATCH /api/tresty/srazky/[id]). */
export const VETA_DLOUHY_DUVOD = 'Vyjádření je moc dlouhé (nejvýš 300 znaků).';

/** Srážka trestu, která čeká na můj souhlas (jen u platného trestu; zrušený trest už nic nechce). */
export function srazkaKSouhlasu(t: Pick<Trest, 'status' | 'penize'>): SrazkaTrestu | null {
  return t.status === 'plati' ? t.penize?.srazky.find(s => s.stav === 'ceka') ?? null : null;
}

/** Všechny srážky čekající na souhlas: nejnovější trest první (stejně jako nepotvrzené). */
export function kSouhlasu(items: readonly Trest[]): { trest: Trest; srazka: SrazkaTrestu }[] {
  const out: { trest: Trest; srazka: SrazkaTrestu }[] = [];
  for (const t of items) {
    if (t.status !== 'plati') continue;
    for (const s of t.penize?.srazky ?? []) if (s.stav === 'ceka') out.push({ trest: t, srazka: s });
  }
  return out.sort((a, b) => b.trest.day.localeCompare(a.trest.day) || b.trest.createdAt.localeCompare(a.trest.createdAt) || b.srazka.id - a.srazka.id);
}

/** Kolik peněz čeká na můj souhlas (součet). */
export const castkaKSouhlasu = (items: readonly Trest[]): number => kSouhlasu(items).reduce((a, x) => a + x.srazka.castka, 0);

/** Důvod nesouhlasu je nepovinný; stejná pravidla a hláška jako server (normalizujPoznamku, 300 znaků). */
export function validujDuvod(raw: string): { ok: true; duvod: string | null } | { ok: false; chyba: string } {
  const t = raw.replace(/\r\n?/g, '\n').trim();
  if (!t) return { ok: true, duvod: null };
  if (t.length > MAX_DELKA_POZNAMKY) return { ok: false, chyba: VETA_DLOUHY_DUVOD };
  return { ok: true, duvod: t };
}

/**
 * Peníze trestu pro zaměstnance (detail): krácení, srážky / náhrady a záskok BEZ jmen kolegů
 * (kontrakt: zaměstnanec vidí jen, že částka přejde kolegům, a kolik). Zrušené srážky jen
 * u zrušeného trestu (přeškrtnuté) — u platného by strašily.
 */
export interface PenizeProZamestnance {
  kraceni: number;
  srazky: SrazkaTrestu[];
  /** Kolik z trestu přejde kolegům (plán platných převodů); null = nic / zůstává podniku. */
  kolegum: number | null;
  /** Kolik už kolegům opravdu přešlo. */
  preslo: number;
  /** Kolik se strhne celkem, až bude všechno uplatněné (krácení + srážky čekající i uplatněné). */
  celkem: number;
}

export function penizeProZamestnance(t: Pick<Trest, 'status' | 'penize' | 'bonusCut'>): PenizeProZamestnance | null {
  const p = t.penize;
  const kraceni = p ? p.kraceni : t.bonusCut;
  const srazky = (p?.srazky ?? []).filter(s => s.stav !== 'zruseno' || t.status === 'zruseno');
  if (!kraceni && srazky.length === 0) return null;
  const plati = (p?.zaskok.prevody ?? []).filter(v => v.stav === 'plati');
  const kolegum = p && p.zaskok.komu !== 'podnik' ? plati.reduce((a, v) => a + v.castka, 0) : 0;
  return {
    kraceni, srazky, kolegum: kolegum > 0 ? kolegum : null, preslo: plati.reduce((a, v) => a + v.preslo, 0),
    celkem: kraceni + srazky.filter(s => s.stav === 'ceka' || s.stav === 'uplatneno').reduce((a, s) => a + s.castka, 0),
  };
}

/**
 * Souhrn peněz měsíce pro widget: napomenutí = platný trest bez bodů, bez krácení a bez živé srážky
 * (lib souhrnTrestu srážky nezná a trest jen se srážkou by počítal jako napomenutí); `srazky` = součet
 * srážek a náhrad platných trestů, které čekají nebo se strhávají (nesouhlas a zrušené ne).
 */
export function souhrnPenezMesice(items: readonly Trest[], mesic: string): { napomenuti: number; srazky: number } {
  let napomenuti = 0, srazky = 0;
  for (const t of items) {
    if (t.status !== 'plati' || !t.day.startsWith(mesic)) continue;
    const zive = (t.penize?.srazky ?? []).filter(s => s.stav === 'ceka' || s.stav === 'uplatneno');
    srazky += zive.reduce((a, s) => a + s.castka, 0);
    if (!t.points && !t.bonusCut && !(t.penize?.srazky ?? []).some(s => s.stav !== 'zruseno')) napomenuti++;
  }
  return { napomenuti, srazky };
}

/** Přijatý záskok (úprava mzdy se `source` zaskok): za co a kolik — bez cizích jmen (poznámka nese jen text trestu). */
export interface PrijatyZaskok { id: number; den: string; castka: number; zaCo: string; oprava: boolean }

const OPRAVA = / \(oprava za uzavřené období\)$/;

export function prijateZaskoky(
  upravy: readonly { id: number; userId: number | string; day: string; amount: number; note?: string | null; source?: string | null }[],
  meId: number, mesic?: string,
): PrijatyZaskok[] {
  return upravy
    .filter(u => u.source === ZDROJ_ZASKOK && Number(u.userId) === meId && (!mesic || String(u.day).slice(0, 7) === mesic))
    .map(u => {
      const note = String(u.note ?? '');
      return { id: Number(u.id), den: String(u.day).slice(0, 10), castka: Math.round(Number(u.amount) || 0), zaCo: note.replace(OPRAVA, '').replace(/^Záskok:\s*/, '').trim(), oprava: OPRAVA.test(note) };
    })
    .filter(z => z.castka !== 0)
    .sort((a, b) => b.den.localeCompare(a.den) || b.id - a.id);
}
