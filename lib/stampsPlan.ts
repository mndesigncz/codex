// Razítkové kampaně: čistá logika bez databáze (testuje se v scripts/testy/w1-razitka.ts).
//
//  · planAdd       … co se stane, když kampani přibudou razítka (platnost, vypršení,
//                    limity, přebytek). Výsledek je plán; zápis dělá lib/stamps.ts.
//  · sCasem        … optimistický zápis: přečti → spočítej → zapiš jen když se stav
//                    mezitím nezměnil (sloupec rev). Dva souběžné zápisy se nikdy
//                    nepřepíšou absolutní hodnotou z přečteného stavu.
//  · overKampan    … jedna validace pro POST i PATCH (server je pravda, UI jen radí).
//  · rozpadPoDnech … doplní dny bez razítka nulou pro graf statistiky.

import { dayPlus } from './pragueTime.ts';
import { czForm, type CzNoun } from './czech.ts';

export type Stav = 'active' | 'draft' | 'paused' | 'archived';
export const STAVY: Stav[] = ['active', 'draft', 'paused', 'archived'];

/** Pole kampaně, která plán potřebuje. */
export interface PravidloKarty {
  required_stamps: number;
  repeat_mode: string;
  stack_cards: boolean;
  days_to_finish: number;
  max_completions: number;
  daily_cap: number;
  days_of_week: number[];
  hour_from: string | null;
  hour_till: string | null;
}

/** Stav hosta u kampaně (řádek client_stamp_progress). */
export interface StavKarty {
  stamps: number;
  completed: number;
  started_at: Date | null;
  last_stamp_at: Date | null;
  last_completed_at: Date | null;
}

export interface KontextPlanu {
  now: Date;
  /** Kolik razítek host u téhle kampaně dnes (pražský den) už dostal. */
  dnesPripsano: number;
  /** ISO den v týdnu pražského dne: 1 = pondělí … 7 = neděle. */
  dow: number;
  /** HH:MM na pražské zdi. */
  hhmm: string;
  /** Ruční připsání majitelem: obejde okno platnosti, denní strop a pauzu mezi kartami. */
  rucne?: boolean;
}

export type Plan =
  | { ok: false; duvod: string; vyprselo: number }
  | {
    ok: true; pridano: number; zahozeno: number; razitek: number; dokonceni: number;
    zacatekKarty: Date; vyprselo: number; kartaZacala: boolean; dokoncenaZacatek: Date | null;
  };

const DNY = ['', 'po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];

/** „po–pá", „po, st, pá", „denně" — pro hlášku a náhled. */
export function dnyTextem(dny: number[]): string {
  const d = Array.from(new Set(dny.filter(x => x >= 1 && x <= 7))).sort((a, b) => a - b);
  if (!d.length || d.length === 7) return 'denně';
  let souvisle = d.length > 2;
  for (let i = 1; i < d.length; i++) if (d[i] !== d[i - 1] + 1) souvisle = false;
  return souvisle ? `${DNY[d[0]]}–${DNY[d[d.length - 1]]}` : d.map(x => DNY[x]).join(', ');
}

/** Platí kampaň v tenhle den a hodinu? Hodiny přes půlnoc (22:00–02:00) jsou podporované. */
export function platiTed(p: Pick<PravidloKarty, 'days_of_week' | 'hour_from' | 'hour_till'>, dow: number, hhmm: string): { plati: boolean; duvod: string } {
  if (p.days_of_week.length && !p.days_of_week.includes(dow)) {
    return { plati: false, duvod: `Razítka tahle kartička dává jen ${dnyTextem(p.days_of_week)}.` };
  }
  if (p.hour_from && p.hour_till) {
    const od = p.hour_from, do_ = p.hour_till;
    const vOkne = od <= do_ ? (hhmm >= od && hhmm < do_) : (hhmm >= od || hhmm < do_);
    if (!vOkne) return { plati: false, duvod: `Razítka tahle kartička dává jen od ${od} do ${do_}.` };
  }
  return { plati: true, duvod: '' };
}

const REPEAT_DNY: Record<string, number> = { immediately: 0, one_day: 1, one_week: 7, one_month: 30 };
const DEN_MS = 86400000;

/** Vyprší rozdělaná karta? Počítá se od ZAČÁTKU karty (první razítko), ne od posledního. */
export function vyprselaKarta(p: Pick<PravidloKarty, 'days_to_finish'>, s: Pick<StavKarty, 'stamps' | 'started_at'>, now: Date): boolean {
  if (p.days_to_finish <= 0 || s.stamps <= 0 || !s.started_at) return false;
  return (now.getTime() - s.started_at.getTime()) / DEN_MS > p.days_to_finish;
}

/** Kdy karta vyprší (ISO den v UTC jen pro zobrazení hostu), nebo null. */
export function vyprsiKdy(p: Pick<PravidloKarty, 'days_to_finish'>, s: Pick<StavKarty, 'stamps' | 'started_at'>): Date | null {
  if (p.days_to_finish <= 0 || s.stamps <= 0 || !s.started_at) return null;
  return new Date(s.started_at.getTime() + p.days_to_finish * DEN_MS);
}

export const RAZITKO: CzNoun = { one: 'razítko', few: 'razítka', many: 'razítek' };
const jednoRazitko = (n: number) => `${n} ${czForm(n, RAZITKO)}`;

/**
 * Spočítá, co se stane, když host dostane `count` razítek. Nic nezapisuje.
 * `ok:false` = nic se nepřipisuje (důvod je česká věta pro obsluhu), ale karta
 * mohla mezitím vypršet (`vyprselo` > 0) — to se zapíše i tak.
 */
export function planAdd(p: PravidloKarty, s: StavKarty, count: number, k: KontextPlanu): Plan {
  let stamps = s.stamps;
  let vyprselo = 0;
  let zacatek = s.started_at ?? k.now;
  if (vyprselaKarta(p, s, k.now)) { vyprselo = stamps; stamps = 0; zacatek = k.now; }

  const konec = (duvod: string): Plan => ({ ok: false, duvod, vyprselo });
  if (count <= 0) return konec('');

  if (!k.rucne) {
    const okno = platiTed(p, k.dow, k.hhmm);
    if (!okno.plati) return konec(okno.duvod);
  }
  if (p.repeat_mode === 'one_time' && s.completed > 0) return konec('Karta je jednorázová a už byla dokončena.');
  if (p.max_completions > 0 && s.completed >= p.max_completions) {
    return konec(`Host už kartu dokončil ${s.completed}× — víc jich podnik nedává.`);
  }
  const cd = REPEAT_DNY[p.repeat_mode] ?? 0;
  if (!k.rucne && cd > 0 && s.last_completed_at) {
    const od = (k.now.getTime() - s.last_completed_at.getTime()) / DEN_MS;
    if (od < cd) return konec(`Další karta jde sbírat za ${Math.ceil(cd - od)} d.`);
  }

  let pridat = count;
  let zahozeno = 0;
  if (!k.rucne && p.daily_cap > 0) {
    const zbyva = Math.max(0, p.daily_cap - k.dnesPripsano);
    if (zbyva <= 0) return konec(`Denní limit ${jednoRazitko(p.daily_cap)} na hosta je vyčerpaný.`);
    if (pridat > zbyva) { zahozeno += pridat - zbyva; pridat = zbyva; }
  }
  if (!p.stack_cards) {
    const misto = Math.max(0, p.required_stamps - stamps);
    if (pridat > misto) { zahozeno += pridat - misto; pridat = misto; }
  }
  if (pridat <= 0) return konec('Karta je plná.');

  const celkem = stamps + pridat;
  const surove = Math.floor(celkem / p.required_stamps);
  let dokonceni = surove;
  if (p.repeat_mode === 'one_time') dokonceni = Math.min(dokonceni, 1);
  if (p.max_completions > 0) dokonceni = Math.min(dokonceni, p.max_completions - s.completed);
  dokonceni = Math.max(0, dokonceni);

  let zbytek = celkem - dokonceni * p.required_stamps;
  // Poslední povolená karta (jednorázová / limit dokončení): další razítka už nemají kam.
  const konecne = dokonceni > 0 && (p.repeat_mode === 'one_time' || (p.max_completions > 0 && s.completed + dokonceni >= p.max_completions));
  let pridano = pridat;
  if (konecne && zbytek > 0) { zahozeno += zbytek; pridano -= zbytek; zbytek = 0; }

  const kartaZacala = stamps === 0;
  const zacatekKarty = kartaZacala ? k.now : zacatek;
  return {
    ok: true, pridano, zahozeno,
    razitek: zbytek, dokonceni, zacatekKarty: dokonceni > 0 && zbytek > 0 ? k.now : zacatekKarty,
    vyprselo, kartaZacala, dokoncenaZacatek: dokonceni > 0 ? zacatekKarty : null,
  };
}

/** Ruční odebrání razítek: nejníž na nulu, dokončené karty se nevracejí. */
export function planOdebrani(s: Pick<StavKarty, 'stamps'>, kolik: number): { odebrano: number; razitek: number } {
  const o = Math.max(0, Math.min(Math.round(kolik), s.stamps));
  return { odebrano: o, razitek: s.stamps - o };
}

// ---- optimistický zápis --------------------------------------------------------

/**
 * Přečti → spočítej → zapiš jen když se stav nezměnil. `zapis` vrací false, když
 * mezitím někdo zapsal (rev nesedí); pak se začne znovu s čerstvým stavem.
 * Vrací null, když ani po `pokusu` pokusech zápis neprošel (extrémní souběh).
 */
export async function sCasem<S, R>(o: {
  nacti: () => Promise<S>;
  spocitej: (stav: S) => R;
  zapis: (stav: S, plan: R) => Promise<boolean>;
  pokusu?: number;
}): Promise<{ stav: S; plan: R } | null> {
  const max = o.pokusu ?? 8;
  for (let i = 0; i < max; i++) {
    const stav = await o.nacti();
    const plan = o.spocitej(stav);
    if (await o.zapis(stav, plan)) return { stav, plan };
  }
  return null;
}

// ---- validace kampaně (POST i PATCH) -------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const RULES = ['visit', 'products', 'min_value'];
const REPEATS = ['immediately', 'one_day', 'one_week', 'one_month', 'one_time'];

export interface PoleKampane {
  name: string; description: string; conditions: string; status: Stav; active: boolean;
  valid_since: string | null; valid_till: string | null; required_stamps: number;
  rule_type: string; stamp_items: { itemId: number }[]; excluded_items: { itemId: number }[];
  min_value: number | null; min_value_multiple: boolean; one_per_order: boolean;
  reward_title: string; reward_items: { itemId: number }[]; days_to_finish: number; days_to_redeem: number;
  repeat_mode: string; stack_cards: boolean; max_completions: number; daily_cap: number;
  days_of_week: number[]; hour_from: string | null; hour_till: string | null;
}

function odkazy(raw: any): { itemId: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { itemId: number }[] = []; const videno = new Set<number>();
  for (const x of raw) {
    const id = Number(x?.itemId);
    if (Number.isInteger(id) && id > 0 && !videno.has(id)) { videno.add(id); out.push({ itemId: id }); }
  }
  return out.slice(0, 200);
}

/** Celé číslo v mezích, jinak chyba (žádné tiché ořezávání — majitel se má dozvědět, že zadal nesmysl). */
function cele(v: any, min: number, max: number, nazev: string, vychozi: number): number | string {
  if (v === undefined || v === null || v === '') return vychozi;
  const n = Number(v);
  if (!Number.isInteger(n)) return `${nazev}: zadej celé číslo.`;
  if (n < min || n > max) return `${nazev}: povolené je ${min} až ${max}.`;
  return n;
}

/**
 * Přečte a ověří tělo požadavku. Platí pro POST i PATCH. Vrací pole k zápisu,
 * nebo českou větu, co je špatně. `ruleType` products / min_value vyžaduje
 * položky / částku; okno platnosti a hodiny musí dávat smysl.
 */
export function overKampan(b: any): { f: PoleKampane } | { chyba: string } {
  const name = String(b?.name ?? '').trim().slice(0, 120);
  if (!name) return { chyba: 'Zadej název kampaně.' };
  const rule_type = RULES.includes(b?.ruleType) ? b.ruleType : (b?.ruleType == null || b?.ruleType === '' ? 'visit' : '');
  if (!rule_type) return { chyba: 'Neznámé pravidlo razítka.' };
  const repeat_mode = b?.repeatMode == null || b?.repeatMode === '' ? 'immediately' : String(b.repeatMode);
  if (!REPEATS.includes(repeat_mode)) return { chyba: 'Neznámé opakování karty.' };

  const nums: Record<string, number | string> = {
    required_stamps: cele(b?.requiredStamps, 1, 50, 'Razítek do odměny', 10),
    days_to_finish: cele(b?.daysToFinish, 0, 365, 'Dní na nasbírání', 0),
    days_to_redeem: cele(b?.daysToRedeem, 0, 365, 'Dní na uplatnění', 0),
    max_completions: cele(b?.maxCompletions, 0, 1000, 'Limit dokončených karet', 0),
    daily_cap: cele(b?.dailyCap, 0, 50, 'Denní strop razítek', 0),
  };
  for (const v of Object.values(nums)) if (typeof v === 'string') return { chyba: v };

  const od = b?.validSince ? String(b.validSince) : null; const do_ = b?.validTill ? String(b.validTill) : null;
  if ((od && !DATE_RE.test(od)) || (do_ && !DATE_RE.test(do_))) return { chyba: 'Datum platnosti zadej jako rok-měsíc-den.' };
  if (od && do_ && od > do_) return { chyba: 'Kartička nemůže platit „do“ dřív než „od“.' };

  const dny: number[] = [];
  if (b?.daysOfWeek != null) {
    if (!Array.isArray(b.daysOfWeek)) return { chyba: 'Dny v týdnu pošli jako seznam.' };
    for (const x of b.daysOfWeek) {
      const d = Number(x);
      if (!Number.isInteger(d) || d < 1 || d > 7) return { chyba: 'Den v týdnu je číslo 1 (pondělí) až 7 (neděle).' };
      if (!dny.includes(d)) dny.push(d);
    }
    dny.sort((a, c) => a - c);
  }
  const hf = b?.hourFrom ? String(b.hourFrom) : null; const ht = b?.hourTill ? String(b.hourTill) : null;
  if (!!hf !== !!ht) return { chyba: 'Hodiny platnosti vyplň obě („od“ i „do“), nebo žádnou.' };
  if (hf && (!HM_RE.test(hf) || !HM_RE.test(ht!))) return { chyba: 'Hodiny zadej jako HH:MM.' };
  if (hf && hf === ht) return { chyba: 'Hodiny „od“ a „do“ nesmí být stejné.' };

  const stamp_items = odkazy(b?.stampItems);
  if (rule_type === 'products' && !stamp_items.length) return { chyba: 'Vyber položky, za které se razítko připisuje.' };
  let min_value: number | null = null;
  if (b?.minValue != null && b.minValue !== '') {
    const m = Number(b.minValue);
    if (!Number.isFinite(m) || m <= 0 || m > 1000000) return { chyba: 'Minimální útrata musí být kladná částka.' };
    min_value = Math.round(m);
  }
  if (rule_type === 'min_value' && !min_value) return { chyba: 'Zadej minimální útratu pro razítko.' };
  const min_value_multiple = b?.minValueMultiple === true && rule_type === 'min_value';
  const excluded = odkazy(b?.excludedItems);
  if (excluded.length && rule_type !== 'min_value') return { chyba: 'Vyloučené položky se uplatní jen u pravidla „za útratu“ (odečtou se z částky).' };

  const status = (b?.status == null || b?.status === '') ? (b?.active === false ? 'paused' : 'active') : String(b.status);
  if (!STAVY.includes(status as Stav)) return { chyba: 'Neznámý stav kampaně.' };

  return {
    f: {
      name, description: String(b?.description ?? '').trim().slice(0, 200),
      conditions: String(b?.conditions ?? '').trim().slice(0, 600),
      status: status as Stav, active: status === 'active',
      valid_since: od, valid_till: do_,
      required_stamps: nums.required_stamps as number, rule_type, stamp_items, excluded_items: excluded,
      min_value, min_value_multiple, one_per_order: b?.onePerOrder === true && rule_type === 'products',
      reward_title: String(b?.rewardTitle ?? '').trim().slice(0, 160), reward_items: odkazy(b?.rewardItems),
      days_to_finish: nums.days_to_finish as number, days_to_redeem: nums.days_to_redeem as number,
      repeat_mode, stack_cards: b?.stackCards !== false,
      max_completions: nums.max_completions as number, daily_cap: nums.daily_cap as number,
      days_of_week: dny, hour_from: hf, hour_till: ht,
    },
  };
}

// ---- statistika ----------------------------------------------------------------

/** Posledních `dnu` dní po sobě končících `konec` (včetně); chybějící dny jako nuly. */
export function rozpadPoDnech(radky: { den: string; razitek: number; karet: number }[], konec: string, dnu: number): { den: string; razitek: number; karet: number }[] {
  const mapa = new Map(radky.map(r => [r.den, r]));
  const out: { den: string; razitek: number; karet: number }[] = [];
  for (let i = dnu - 1; i >= 0; i--) {
    const den = dayPlus(konec, -i);
    const r = mapa.get(den);
    out.push({ den, razitek: r ? Number(r.razitek) || 0 : 0, karet: r ? Number(r.karet) || 0 : 0 });
  }
  return out;
}

/** Průměrná doba dokončení v dnech (jedno desetinné místo), null bez dokončení. */
export function prumerDnu(doby: number[]): number | null {
  const d = doby.filter(x => Number.isFinite(x) && x >= 0);
  if (!d.length) return null;
  return Math.round((d.reduce((a, b) => a + b, 0) / d.length) * 10) / 10;
}

/** Klíč idempotence: hlavička od UI, jinak otisk akce (pro pětisekundové okno). */
export function otiskAkce(akce: string, b: any): string {
  const casti = [akce, String(Math.round(Number(b?.amount) || 0)), String(b?.billId ?? '')];
  if (Array.isArray(b?.items)) {
    casti.push(b.items.map((i: any) => `${Number(i?.itemId) || 0}x${Math.round(Number(i?.qty) || 0)}`).sort().join(','));
  }
  return casti.join('|').slice(0, 200);
}

/**
 * Jeden krok připisování z účtenky. Hotový krok (z dřívějšího nedokončeného
 * pokusu) se přeskočí; po provedení se zapíše jako hotový, ať ho další pokus
 * nezopakuje. Vrací, zda se krok opravdu provedl.
 */
export async function spustKrok(hotove: Set<string>, nazev: string, fn: () => Promise<void>, zapisHotovo: (nazev: string) => Promise<void>): Promise<boolean> {
  if (hotove.has(nazev)) return false;
  await fn();
  await zapisHotovo(nazev);
  hotove.add(nazev);
  return true;
}
