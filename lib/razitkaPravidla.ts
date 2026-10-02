// Razítkové kampaně: čistá pravidla bez databáze, která doplňují plán připsání
// z lib/stampsPlan.ts (testují se přímo).
//
// Tady je: kdy jde sbírat další karta (kalendářní den a měsíc, pražský), kolik
// razítek dá účtenka (položky, kategorie, vyloučené položky), která z kampaní
// účtenku dostane, když se nesmí kombinovat, jak kartu vidí host (vzhled, okno
// platnosti, vypršení, skončené kartičky) a CSV exporty. Zápis do databáze je
// v lib/stamps.ts.

import { dayPlus, pragueToday } from './pragueTime.ts';
import { csvPole } from './poukazy.ts';

export type PravidloRazitka = 'visit' | 'products' | 'min_value';
export type OpakovaniKarty = 'immediately' | 'one_day' | 'one_week' | 'one_month' | 'one_time';

export interface Odkaz { itemId: number }
export interface OdkazSekce { sectionId: number }

/** Co z kampaně pravidla potřebují (StampCampaign z lib/stamps.ts je splňuje). */
export interface PravidloKampane {
  required_stamps: number;
  stack_cards: boolean;
  repeat_mode: OpakovaniKarty;
  days_to_finish: number;
  max_completions: number;
  daily_cap: number;
  days_of_week: number[];
  hour_from: string | null;
  hour_till: string | null;
}

export interface PrubehKarty {
  stamps: number;
  completed: number;
  started_at: Date | null;
  last_completed_at: Date | null;
}

export const DNY_TYDNE = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

const DEN_MS = 86400000;

// ---- Krátké pomocné formáty ---------------------------------------------------------

/** `2026-11-01` → `1. 11. 2026`. */
export function czDatum(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : d;
}

/** `8:00` / `08:00:00` → `08:00`; nesmysl → null. */
export function platnyHM(v: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

export function normalizujDny(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<number>();
  for (const x of raw) { const n = Math.round(Number(x)); if (n >= 1 && n <= 7) set.add(n); }
  return Array.from(set).sort((a, b) => a - b);
}

export function normalizujSekce(raw: unknown): OdkazSekce[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => ({ sectionId: Number(x?.sectionId) })).filter(x => Number.isFinite(x.sectionId) && x.sectionId > 0).slice(0, 100);
}

// ---- Platnost v čase -------------------------------------------------------------------

/** Lidský popis okna: „Po–Pá, 14:00–18:00“. Prázdný řetězec = platí vždy. */
export function popisOkna(c: Pick<PravidloKampane, 'days_of_week' | 'hour_from' | 'hour_till'>): string {
  const dny = normalizujDny(c.days_of_week);
  const casti: string[] = [];
  if (dny.length && dny.length < 7) {
    // Souvislé úseky: [1,2,3,4,5] → Po–Pá, [1,3] → Po, St.
    const out: string[] = [];
    let i = 0;
    while (i < dny.length) {
      let j = i;
      while (j + 1 < dny.length && dny[j + 1] === dny[j] + 1) j++;
      out.push(j - i >= 2 ? `${DNY_TYDNE[dny[i] - 1]}–${DNY_TYDNE[dny[j] - 1]}` : dny.slice(i, j + 1).map(d => DNY_TYDNE[d - 1]).join(', '));
      i = j + 1;
    }
    casti.push(out.join(', '));
  }
  if (c.hour_from && c.hour_till && c.hour_from !== c.hour_till) casti.push(`${c.hour_from}–${c.hour_till}`);
  return casti.join(', ');
}
// ---- Další karta (kalendářně) --------------------------------------------------------------

/**
 * Od kterého pražského dne jde sbírat další karta po dokončení té předchozí.
 * Po dni = od následujícího kalendářního dne, po měsíci = od 1. dne dalšího
 * měsíce (ne „za 30 dní“), po týdnu = o 7 dní později. Bez omezení → null.
 */
export function dalsiKartaOd(mode: OpakovaniKarty, posledniDokonceni: Date | null): string | null {
  if (!posledniDokonceni || mode === 'immediately' || mode === 'one_time') return null;
  const den = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(posledniDokonceni);
  if (mode === 'one_day') return dayPlus(den, 1);
  if (mode === 'one_week') return dayPlus(den, 7);
  const [r, m] = den.split('-').map(Number);
  return m === 12 ? `${r + 1}-01-01` : `${r}-${String(m + 1).padStart(2, '0')}-01`;
}

// ---- Stav karty pro hosta a výpisy (bez zápisu) ---------------------------------------------

export interface StavKartyHosta {
  /** Razítka, která host opravdu má (po případném vypršení). */
  stamps: number;
  /** Rozdělaná karta už vypršela, razítka propadla (propadnou při dalším razítku). */
  vyprsela: boolean;
  vyprselaRazitek: number;
  /** Do kdy musí kartu dosbírat (pražský den), jinak razítka propadnou. */
  dosbiratDo: string | null;
  /** Kolik dní zbývá na dosbírání (0 = dnes naposledy). */
  zbyvaDni: number | null;
  /** Od kdy jde sbírat další kartu (po cooldownu). */
  dalsiKartaOd: string | null;
  /** Víc dokončených karet už host sbírat nemůže. */
  hotovoNavzdy: boolean;
}

/** Průběh hosta z řádku client_stamp_progress (expired_count = propadlá razítka z naposledy vypršelé karty). */
export interface PrubehHosta { stamps: number; completed: number; started_at: Date | null; last_completed_at: Date | null; expired_count?: number }

export function stavKartyHosta(c: PravidloKampane, p: PrubehHosta | null, now: Date = new Date(), dnes = pragueToday()): StavKartyHosta {
  const stamps = p?.stamps ?? 0;
  const completed = p?.completed ?? 0;
  let vyprsela = false; let vyprselaRazitek = 0; let dosbiratDo: string | null = null; let zbyva: number | null = null;
  if (c.days_to_finish > 0 && stamps > 0 && p?.started_at) {
    const konec = new Date(p.started_at.getTime() + c.days_to_finish * DEN_MS);
    const konecDen = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(konec);
    dosbiratDo = konecDen;
    vyprsela = now.getTime() - p.started_at.getTime() > c.days_to_finish * DEN_MS;
    if (vyprsela) vyprselaRazitek = stamps;
    zbyva = vyprsela ? 0 : Math.max(0, Math.round((new Date(`${konecDen}T12:00:00Z`).getTime() - new Date(`${dnes}T12:00:00Z`).getTime()) / DEN_MS));
  }
  // Karta, která už vypršela a byla při čtení vynulována, si zprávu nese v expired_count.
  if (!vyprsela && (p?.expired_count ?? 0) > 0 && stamps === 0) { vyprsela = true; vyprselaRazitek = p!.expired_count!; }
  const od = dalsiKartaOd(c.repeat_mode, p?.last_completed_at ?? null);
  const hotovoNavzdy = (c.repeat_mode === 'one_time' && completed > 0) || (c.max_completions > 0 && completed >= c.max_completions);
  return {
    stamps: vyprsela ? 0 : stamps, vyprsela, vyprselaRazitek, dosbiratDo, zbyvaDni: zbyva,
    dalsiKartaOd: od && dnes < od ? od : null, hotovoNavzdy,
  };
}

// ---- Karta tak, jak ji vidí host ---------------------------------------------------------------

/** Pole kampaně, ze kterých se skládá karta pro hosta (StampCampaign je splňuje). */
export interface KampanProHosta extends PravidloKampane {
  id: number; name: string; description: string; conditions: string; reward_title: string;
  rule_type: PravidloRazitka; card_color: string | null; card_icon: string | null; card_image: string | null;
  valid_till: string | null;
}

/**
 * Karta pro hosta: jen data (čísla, data, příznaky), žádné věty. Věty skládá
 * hostovská komponenta přes t(), aby se přeložily do jazyka hosta.
 */
export function kartaProHosta(c: KampanProHosta, p: PrubehHosta | null, odmenaPolozky: string[], now: Date = new Date(), dnes = pragueToday()) {
  const st = stavKartyHosta(c, p, now, dnes);
  const dny = normalizujDny(c.days_of_week);
  const maHodiny = !!(c.hour_from && c.hour_till && c.hour_from !== c.hour_till);
  return {
    id: c.id, name: c.name, description: c.description, conditions: c.conditions,
    required: c.required_stamps, reward: c.reward_title, rewardItems: odmenaPolozky, ruleType: c.rule_type,
    stamps: st.stamps, completed: p?.completed ?? 0,
    color: c.card_color, icon: c.card_icon, image: c.card_image,
    okno: (dny.length > 0 && dny.length < 7) || maHodiny ? { days: dny.length < 7 ? dny : [], from: maHodiny ? c.hour_from : null, till: maHodiny ? c.hour_till : null } : null,
    expired: st.vyprsela, expiredStamps: st.vyprselaRazitek, finishBy: st.dosbiratDo, daysLeft: st.zbyvaDni,
    nextCardFrom: st.dalsiKartaOd, finishedForever: st.hotovoNavzdy, validTill: c.valid_till,
    limit: c.repeat_mode === 'one_time' ? 1 : c.max_completions,
  };
}

export type KartaHosta = ReturnType<typeof kartaProHosta>;

// ---- Kolik razítek dá účtenka --------------------------------------------------------------

/** Řádek účtenky přepsaný na položku nabídky (nebo bez ní, když ji pokladna nezná). */
export interface RadekUctu { itemId: number | null; sectionId: number | null; qty: number; /** Cena řádku celkem, když ji pokladna řekla. */ price: number | null }

export interface PravidloZaPolozky {
  rule_type: PravidloRazitka;
  stamp_items: Odkaz[]; stamp_sections: OdkazSekce[];
  excluded_items: Odkaz[]; excluded_sections: OdkazSekce[];
  min_value: number | null; min_value_multiple: boolean; one_per_order: boolean;
}

/** Je řádek vyloučený z kampaně (položka nebo celá kategorie)? */
export function jeVyloucen(c: Pick<PravidloZaPolozky, 'excluded_items' | 'excluded_sections'>, r: RadekUctu): boolean {
  if (r.itemId != null && c.excluded_items.some(x => x.itemId === r.itemId)) return true;
  if (r.sectionId != null && c.excluded_sections.some(x => x.sectionId === r.sectionId)) return true;
  return false;
}

/** Počítá se řádek do razítek „za položky“ (vybraná položka nebo kategorie, a není vyloučený)? */
export function davaRazitko(c: PravidloZaPolozky, r: RadekUctu): boolean {
  if (jeVyloucen(c, r)) return false;
  if (r.itemId != null && c.stamp_items.some(x => x.itemId === r.itemId)) return true;
  if (r.sectionId != null && c.stamp_sections.some(x => x.sectionId === r.sectionId)) return true;
  return false;
}

/**
 * Počet razítek z účtu pro kampaň „za položky“ nebo „za útratu“. Útrata se
 * snižuje o vyloučené řádky, jen když pokladna řekla jejich cenu (jinak nelze
 * poznat, o kolik) — o tom informuje `bezCeny`.
 */
export function spocitejRazitka(c: PravidloZaPolozky, uct: { total: number; radky: RadekUctu[] }): { count: number; utrata: number; bezCeny: boolean } {
  if (c.rule_type === 'products') {
    let n = 0;
    for (const r of uct.radky) if (davaRazitko(c, r)) n += Math.max(0, Math.round(r.qty));
    if (c.one_per_order) n = Math.min(n, 1);
    return { count: n, utrata: uct.total, bezCeny: false };
  }
  if (c.rule_type === 'min_value') {
    let utrata = uct.total; let bezCeny = false;
    for (const r of uct.radky) {
      if (!jeVyloucen(c, r)) continue;
      if (r.price == null) { bezCeny = true; continue; }
      utrata -= r.price;
    }
    utrata = Math.max(0, utrata);
    const min = Math.max(1, Number(c.min_value) || 0);
    const n = utrata >= min ? (c.min_value_multiple ? Math.floor(utrata / min) : 1) : 0;
    return { count: n, utrata, bezCeny };
  }
  return { count: 0, utrata: uct.total, bezCeny: false };
}

// ---- Kombinovatelnost -------------------------------------------------------------------------

/**
 * Která z kampaní dostane účtenku. Kampaň „nekombinovat“ si účtenku bere sama:
 * vyhraje první taková podle pořadí (position) a ostatní nedostanou nic.
 * Kombinovatelné kampaně se sčítají. Vstup musí být seřazený podle pořadí.
 */
export function vyberKampane<T extends { combinable: boolean }>(zasahy: { c: T; count: number }[]): { vybrane: { c: T; count: number }[]; vynechane: { c: T; count: number }[] } {
  const hity = zasahy.filter(z => z.count > 0);
  const sama = hity.find(z => z.c.combinable === false);
  if (!sama) return { vybrane: hity, vynechane: [] };
  return { vybrane: [sama], vynechane: hity.filter(z => z !== sama) };
}

// ---- Validace kampaně (jedna pro POST i PATCH) ----------------------------------------------------

export const BARVA_RE = /^#[0-9a-fA-F]{6}$/;
export const IKONY_KARTY = ['star', 'cup', 'gift', 'leaf', 'fire', 'award', 'coins', 'sparkle', 'music', 'sun', 'tag', 'card'] as const;


// ---- Souhrn a CSV --------------------------------------------------------------------------------

export interface RadekExportu { host: string; email: string; razitka: number; dokonceno: number; zacatek: string; posledniRazitko: string; posledniDokonceni: string; vypraselo: number }

/** CSV se středníkem a BOM (český Excel), s hlavičkou. */
export function razitkaCsv(radky: RadekExportu[]): string {
  const hlavicka = ['host', 'e-mail', 'razítek na kartě', 'dokončených karet', 'karta začala', 'poslední razítko', 'poslední dokončení', 'propadlých razítek'];
  const out = [hlavicka.join(';')];
  for (const r of radky) out.push([r.host, r.email, r.razitka, r.dokonceno, r.zacatek, r.posledniRazitko, r.posledniDokonceni, r.vypraselo].map(csvPole).join(';'));
  return '﻿' + out.join('\r\n') + '\r\n';
}

export interface RadekUdalosti { datum: string; host: string; zmena: number; druh: string; poznamka: string; obsluha: string; castka: number | null }

export function udalostiCsv(radky: RadekUdalosti[]): string {
  const out = [['datum', 'host', 'změna razítek', 'druh', 'poznámka', 'obsluha', 'částka'].join(';')];
  for (const r of radky) out.push([r.datum, r.host, r.zmena, r.druh, r.poznamka, r.obsluha, r.castka ?? ''].map(csvPole).join(';'));
  return '﻿' + out.join('\r\n') + '\r\n';
}

/** Popis druhu změny razítek pro výpis a CSV. */
export const DRUH_UDALOSTI: Record<string, string> = {
  earn: 'Návštěva / účtenka / částka', manual: 'Ručně', expire: 'Propadnutí karty',
};
