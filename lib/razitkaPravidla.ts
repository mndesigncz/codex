// Razítkové kampaně: čistá pravidla bez databáze (testují se přímo).
//
// Tady je všechno, co o razítku rozhoduje: platí kampaň právě teď (den v týdnu,
// hodiny, noční okno), vešlo by se razítko pod denní strop, vypršela rozdělaná
// karta, kdy jde sbírat další karta (kalendářní den a měsíc, pražský), kolik
// razítek dá účtenka (položky, kategorie, vyloučené položky) a která z kampaní
// účtenku dostane, když se nesmí kombinovat. Zápis do databáze je v lib/stamps.ts.

import { dayPlus, pragueToday, pragueDayOf, parseDbTime } from './pragueTime.ts';
import { csvPole } from './poukazy.ts';
import { czForm, type CzNoun } from './czech.ts';

const KARTA: CzNoun = { one: 'kartu', few: 'karty', many: 'karet' };
const RAZITKO_GEN: CzNoun = { one: 'razítka', few: 'razítek', many: 'razítek' };

export type PravidloRazitka = 'visit' | 'products' | 'min_value';
export type OpakovaniKarty = 'immediately' | 'one_day' | 'one_week' | 'one_month' | 'one_time';
export type StavKampane = 'draft' | 'archived' | 'paused' | 'scheduled' | 'ended' | 'live';

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
  valid_days: number[];
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

/** Den v týdnu 1 (pondělí) až 7 (neděle) pro pražské datum RRRR-MM-DD. */
export function denVTydnu(den: string): number {
  const x = new Date(`${den}T12:00:00Z`).getUTCDay();
  return x === 0 ? 7 : x;
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
export function popisOkna(c: Pick<PravidloKampane, 'valid_days' | 'hour_from' | 'hour_till'>): string {
  const dny = normalizujDny(c.valid_days);
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

/**
 * Smí se teď razítko dát? Den v týdnu (1 = pondělí) a hodiny jsou pražské.
 * Okno přes půlnoc (22:00–02:00) platí večer i ráno; stejné „od“ a „do“ znamená celý den.
 */
export function platiTed(c: Pick<PravidloKampane, 'valid_days' | 'hour_from' | 'hour_till'>, now: Date = new Date(), dnes = pragueToday(), hm?: string): { ok: boolean; proc?: string } {
  const dny = normalizujDny(c.valid_days);
  const cas = hm ?? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const od = platnyHM(c.hour_from), doo = platnyHM(c.hour_till);
  const okDen = dny.length === 0 || dny.length === 7 || dny.includes(denVTydnu(dnes));
  let okHodiny = true;
  if (od && doo && od !== doo) okHodiny = od < doo ? (cas >= od && cas < doo) : (cas >= od || cas < doo);
  if (okDen && okHodiny) return { ok: true };
  return { ok: false, proc: `Kartička razítko dává jen ${popisOkna(c) || 'v jiném čase'}.` };
}

// ---- Stav kampaně ----------------------------------------------------------------------

export interface RadekStavu { active: boolean; draft?: boolean; archived_at?: unknown; valid_since: string | null; valid_till: string | null }

/** Koncept / archiv / pozastaveno / naplánováno / skončila / běží — v tomhle pořadí důležitosti. */
export function stavKampane(c: RadekStavu, dnes: string): StavKampane {
  if (c.archived_at) return 'archived';
  if (c.draft) return 'draft';
  if (!c.active) return 'paused';
  if (c.valid_since && c.valid_since > dnes) return 'scheduled';
  if (c.valid_till && c.valid_till < dnes) return 'ended';
  return 'live';
}

export const STAV_POPISEK: Record<StavKampane, string> = {
  draft: 'Koncept', archived: 'Archiv', paused: 'Pozastaveno', scheduled: 'Naplánováno', ended: 'Skončila', live: 'Běží',
};

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

// ---- Plán připsání razítek -----------------------------------------------------------------

export interface PlanPripsani {
  /** Proč se nepřipsalo nic (srozumitelně pro obsluhu). */
  skipped?: string;
  /** Kolik razítek se opravdu připsalo. */
  added: number;
  /** Razítek na kartě po připsání. */
  rest: number;
  completions: number;
  /** Razítka, která se nevešla (karta bez přenosu, poslední povolená karta, denní strop). */
  lost: number;
  /** Rozdělaná karta vypršela: tolik razítek propadlo. */
  expiredCount: number;
  /** Od kdy běží aktuální karta. */
  startedAt: Date;
  /** Doba sbírání dokončené karty ve dnech (jen při dokončení). */
  tookDays: number | null;
  /** Proč se část razítek nepřipsala (pro hlášku). */
  lostWhy?: string;
}

/**
 * Z aktuálního průběhu a počtu razítek spočítá, co se stane. Žádný zápis:
 * lib/stamps.ts výsledek zapíše tak, aby souběžné připsání nic nepřepsalo.
 * `dnesRazitek` = kolik razítek host na kampani dnes (pražský den) už dostal.
 */
export function planPripsani(c: PravidloKampane, cur: PrubehKarty, count: number, now: Date, dnesRazitek = 0, dnes = pragueDayOf(now)): PlanPripsani {
  const prazdny = (skipped?: string): PlanPripsani => ({ skipped, added: 0, rest: cur.stamps, completions: 0, lost: 0, expiredCount: 0, startedAt: cur.started_at ?? now, tookDays: null });
  const req = Math.max(1, c.required_stamps);
  if (count <= 0) return prazdny();
  if (c.repeat_mode === 'one_time' && cur.completed > 0) return prazdny('Karta je jednorázová a už byla dokončena.');
  if (c.max_completions > 0 && cur.completed >= c.max_completions) {
    return prazdny(`Host už dokončil nejvýš ${c.max_completions} ${czForm(c.max_completions, KARTA)}.`);
  }
  const od = dalsiKartaOd(c.repeat_mode, cur.last_completed_at);
  if (od && dnes < od) return prazdny(`Další karta jde sbírat od ${czDatum(od)}.`);

  let stamps = cur.stamps;
  let started = cur.started_at ?? now;
  let expiredCount = 0;
  // Rozdělaná karta vypršela (počítá se od začátku karty, ne od posledního razítka).
  if (c.days_to_finish > 0 && stamps > 0 && cur.started_at && (now.getTime() - cur.started_at.getTime()) / DEN_MS > c.days_to_finish) {
    expiredCount = stamps; stamps = 0;
  }
  if (stamps === 0) started = now;

  let lost = 0; let lostWhy: string | undefined;
  let povoleno = count;
  if (c.daily_cap > 0) {
    const misto = Math.max(0, c.daily_cap - Math.max(0, dnesRazitek));
    if (misto === 0) return { ...prazdny(`Dnešní strop ${c.daily_cap} ${czForm(c.daily_cap, RAZITKO_GEN)} na hosta je vyčerpaný.`), expiredCount: 0 };
    if (povoleno > misto) { lost += povoleno - misto; lostWhy = `Denní strop ${c.daily_cap} razítek na hosta.`; povoleno = misto; }
  }
  let toAdd = povoleno;
  if (!c.stack_cards) {
    const room = Math.max(0, req - stamps);
    if (toAdd > room) { lost += toAdd - room; lostWhy = lostWhy ?? 'Karta se nepřelévá do další, přebytek razítek se nepřipíše.'; toAdd = room; }
  }
  const total = stamps + toAdd;
  let completions = Math.floor(total / req);
  if (!c.stack_cards) completions = Math.min(completions, 1);
  if (c.repeat_mode === 'one_time') completions = Math.min(completions, 1);
  if (c.max_completions > 0) completions = Math.min(completions, c.max_completions - cur.completed);
  let rest = completions > 0 ? total - completions * req : total;
  const posledni = (c.repeat_mode === 'one_time' && completions >= 1) || (c.max_completions > 0 && cur.completed + completions >= c.max_completions && completions > 0);
  if (posledni && rest > 0) { lost += rest; lostWhy = lostWhy ?? 'Je to poslední povolená karta, zbytek razítek se nepřipíše.'; rest = 0; }
  // Přebytek nad kartu při omezeném počtu dokončení (completions seříznuté) se nesmí hromadit.
  if (rest >= req) { const nad = rest - (req - 1); lost += nad; lostWhy = lostWhy ?? 'Víc razítek než se vejde na kartu.'; rest = req - 1; }
  const tookDays = completions > 0 ? Math.max(0, Math.round(((now.getTime() - started.getTime()) / DEN_MS) * 100) / 100) : null;
  if (completions > 0 && rest > 0) started = now; // zbytek je už nová karta
  return { added: toAdd, rest, completions, lost, expiredCount, startedAt: started, tookDays, lostWhy };
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

export function stavKartyHosta(c: PravidloKampane, p: { stamps: number; completed: number; started_at: Date | null; last_completed_at: Date | null } | null, now: Date = new Date(), dnes = pragueToday()): StavKartyHosta {
  const stamps = p?.stamps ?? 0;
  const completed = p?.completed ?? 0;
  let vyprsela = false; let dosbiratDo: string | null = null; let zbyva: number | null = null;
  if (c.days_to_finish > 0 && stamps > 0 && p?.started_at) {
    const konec = new Date(p.started_at.getTime() + c.days_to_finish * DEN_MS);
    const konecDen = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(konec);
    dosbiratDo = konecDen;
    vyprsela = now.getTime() - p.started_at.getTime() > c.days_to_finish * DEN_MS;
    zbyva = vyprsela ? 0 : Math.max(0, Math.round((new Date(`${konecDen}T12:00:00Z`).getTime() - new Date(`${dnes}T12:00:00Z`).getTime()) / DEN_MS));
  }
  const od = dalsiKartaOd(c.repeat_mode, p?.last_completed_at ?? null);
  const hotovoNavzdy = (c.repeat_mode === 'one_time' && completed > 0) || (c.max_completions > 0 && completed >= c.max_completions);
  return {
    stamps: vyprsela ? 0 : stamps, vyprsela, vyprselaRazitek: vyprsela ? stamps : 0, dosbiratDo, zbyvaDni: zbyva,
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
export function kartaProHosta(c: KampanProHosta, p: { stamps: number; completed: number; started_at: Date | null; last_completed_at: Date | null } | null, odmenaPolozky: string[], now: Date = new Date(), dnes = pragueToday()) {
  const st = stavKartyHosta(c, p, now, dnes);
  const dny = normalizujDny(c.valid_days);
  const maHodiny = !!(c.hour_from && c.hour_till && c.hour_from !== c.hour_till);
  return {
    id: c.id, name: c.name, description: c.description, conditions: c.conditions,
    required: c.required_stamps, reward: c.reward_title, rewardItems: odmenaPolozky, ruleType: c.rule_type,
    stamps: st.stamps, completed: p?.completed ?? 0,
    color: c.card_color, icon: c.card_icon, image: c.card_image,
    okno: (dny.length > 0 && dny.length < 7) || maHodiny ? { days: dny.length < 7 ? dny : [], from: maHodiny ? c.hour_from : null, till: maHodiny ? c.hour_till : null } : null,
    expired: st.vyprsela, expiredStamps: st.vyprselaRazitek, finishBy: st.dosbiratDo, daysLeft: st.zbyvaDni,
    nextCardFrom: st.dalsiKartaOd, finishedForever: st.hotovoNavzdy, validTill: c.valid_till,
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RULES: PravidloRazitka[] = ['visit', 'products', 'min_value'];
const REPEATS: OpakovaniKarty[] = ['immediately', 'one_day', 'one_week', 'one_month', 'one_time'];
const BARVA_RE = /^#[0-9a-fA-F]{6}$/;
export const IKONY_KARTY = ['star', 'cup', 'gift', 'leaf', 'fire', 'award', 'coins', 'sparkle', 'music', 'sun', 'tag', 'card'] as const;

function refs(raw: any): Odkaz[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => ({ itemId: Number(x?.itemId) })).filter(x => Number.isFinite(x.itemId) && x.itemId > 0).slice(0, 200);
}

export interface PoleKampane {
  name: string; description: string; conditions: string; active: boolean; draft: boolean;
  valid_since: string | null; valid_till: string | null;
  required_stamps: number; rule_type: PravidloRazitka;
  stamp_items: Odkaz[]; stamp_sections: OdkazSekce[]; excluded_items: Odkaz[]; excluded_sections: OdkazSekce[];
  min_value: number | null; min_value_multiple: boolean; one_per_order: boolean;
  reward_title: string; reward_items: Odkaz[];
  days_to_finish: number; days_to_redeem: number; repeat_mode: OpakovaniKarty; stack_cards: boolean;
  max_completions: number; daily_cap: number; valid_days: number[]; hour_from: string | null; hour_till: string | null;
  combinable: boolean; card_color: string | null; card_icon: string | null; card_image: string | null;
}

/** Hranice čísel a slovníky v jednom: server ořízne, co klient nastavil mimo rozsah. */
export function polePole(b: any): PoleKampane {
  const cislo = (v: any, min: number, max: number, vychozi: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : vychozi;
  };
  const hmOd = platnyHM(b.hourFrom), hmDo = platnyHM(b.hourTill);
  const obrazek = typeof b.cardImage === 'string' ? b.cardImage.trim().slice(0, 500) : '';
  return {
    name: String(b.name ?? '').trim().slice(0, 120),
    description: String(b.description ?? '').trim().slice(0, 200),
    conditions: String(b.conditions ?? '').trim().slice(0, 600),
    // Koncept je vždy i vypnutý: starší kód, který zná jen `active`, ho tak nikdy nebere za běžící kampaň.
    active: b.draft === true ? false : b.active !== false,
    draft: b.draft === true,
    valid_since: DATE_RE.test(String(b.validSince)) ? b.validSince : null,
    valid_till: DATE_RE.test(String(b.validTill)) ? b.validTill : null,
    required_stamps: cislo(b.requiredStamps, 1, 50, 10),
    rule_type: RULES.includes(b.ruleType) ? b.ruleType : 'visit',
    stamp_items: refs(b.stampItems), stamp_sections: normalizujSekce(b.stampSections),
    excluded_items: refs(b.excludedItems), excluded_sections: normalizujSekce(b.excludedSections),
    min_value: Number.isFinite(Number(b.minValue)) && Number(b.minValue) > 0 ? Math.min(1000000, Math.round(Number(b.minValue))) : null,
    min_value_multiple: b.minValueMultiple === true,
    one_per_order: b.onePerOrder === true,
    reward_title: String(b.rewardTitle ?? '').trim().slice(0, 160),
    reward_items: refs(b.rewardItems),
    days_to_finish: cislo(b.daysToFinish, 0, 365, 0),
    days_to_redeem: cislo(b.daysToRedeem, 0, 365, 0),
    repeat_mode: REPEATS.includes(b.repeatMode) ? b.repeatMode : 'immediately',
    stack_cards: b.stackCards !== false,
    max_completions: cislo(b.maxCompletions, 0, 1000, 0),
    daily_cap: cislo(b.dailyCap, 0, 50, 0),
    valid_days: normalizujDny(b.validDays),
    hour_from: hmOd && hmDo ? hmOd : null, hour_till: hmOd && hmDo ? hmDo : null,
    combinable: b.combinable !== false,
    card_color: BARVA_RE.test(String(b.cardColor ?? '')) ? String(b.cardColor).toLowerCase() : null,
    card_icon: (IKONY_KARTY as readonly string[]).includes(b.cardIcon) ? String(b.cardIcon) : null,
    card_image: /^(https:\/\/|\/api\/client\/img\/)/.test(obrazek) ? obrazek : null,
  };
}

/** Chyba pro obsluhu, nebo null. Stejná pravidla pro založení i úpravu. */
export function overKampan(f: PoleKampane, b: any = {}): string | null {
  if (!f.name) return 'Zadej název kampaně.';
  if (f.rule_type === 'products' && !f.stamp_items.length && !f.stamp_sections.length) return 'Vyber položky nebo kategorie, za které se razítko připisuje.';
  if (f.rule_type === 'min_value' && !f.min_value) return 'Zadej minimální útratu pro razítko.';
  if (f.valid_since && f.valid_till && f.valid_since > f.valid_till) return 'Konec platnosti je dřív než začátek.';
  if (b.hourFrom && !b.hourTill || !b.hourFrom && b.hourTill) return 'Vyplň hodiny od i do, nebo obojí nech prázdné.';
  if ((b.hourFrom && !platnyHM(b.hourFrom)) || (b.hourTill && !platnyHM(b.hourTill))) return 'Hodiny zadej jako 14:00.';
  if (b.cardImage && !f.card_image) return 'Obrázek karty musí být odkaz začínající na https://.';
  return null;
}

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
  visit: 'Návštěva', bill: 'Účtenka', manual: 'Ručně', storno: 'Storno', bulk: 'Hromadně', points: 'Částka u kasy',
};

/** Průměr dní na dokončení (z hodnot dnů), na jedno desetinné místo, nebo null. */
export function prumerDni(dny: number[]): number | null {
  const ok = dny.filter(d => Number.isFinite(d) && d >= 0);
  if (!ok.length) return null;
  return Math.round((ok.reduce((a, b) => a + b, 0) / ok.length) * 10) / 10;
}

/** Čas z databáze bezpečně na Date. */
export const dbCas = parseDbTime;
