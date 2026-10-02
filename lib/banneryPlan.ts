// Bannery: plánování s dny a hodinami (opakování) a jazykové mutace. Čisté funkce bez databáze.
//
// Plán: dny v týdnu (ISO 1 = pondělí … 7 = neděle; prázdný seznam = každý den) a hodiny „od–do“
// (obě, nebo žádná; přes půlnoc je v pořádku: 22:00–02:00). Spolu s „Platí od/do“ to dává opakování:
// „každé pondělí a čtvrtek 16:00–18:00, od 1. 10. do 31. 12.“. Čas se vždy bere pražský.
//
// Mutace: překlad nadpisu a textu do jazyků hosta (en, de, sk, pl). Čeština je původní text banneru.
// Chybí-li překlad v jazyce hosta, vidí hlavní (český) text, nikdy prázdný banner.

import { dnyTextem, platiTed } from './stampsPlan.ts';
import { pragueDayOf, pragueHM } from './pragueTime.ts';

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface PlanBanneru { days_of_week: number[]; hour_from: string | null; hour_till: string | null }
export const BEZ_PLANU: PlanBanneru = { days_of_week: [], hour_from: null, hour_till: null };

/** Plán z formuláře. Chyba = česká věta; neúplné hodiny se odmítnou, ne tiše zahodí. */
export function validujPlan(b: { days_of_week?: unknown; hour_from?: unknown; hour_till?: unknown }): { ok: true; plan: PlanBanneru } | { ok: false; chyba: string } {
  const dny: number[] = [];
  if (b?.days_of_week != null && b.days_of_week !== '') {
    if (!Array.isArray(b.days_of_week)) return { ok: false, chyba: 'Dny v týdnu pošli jako seznam.' };
    for (const x of b.days_of_week) {
      const d = Number(x);
      if (!Number.isInteger(d) || d < 1 || d > 7) return { ok: false, chyba: 'Den v týdnu je číslo 1 (pondělí) až 7 (neděle).' };
      if (!dny.includes(d)) dny.push(d);
    }
    dny.sort((a, c) => a - c);
  }
  const od = String(b?.hour_from ?? '').trim() || null;
  const do_ = String(b?.hour_till ?? '').trim() || null;
  if (!!od !== !!do_) return { ok: false, chyba: 'Hodiny vyplň obě („od“ i „do“), nebo žádnou.' };
  if (od && do_) {
    if (!HM.test(od) || !HM.test(do_)) return { ok: false, chyba: 'Hodiny zadej jako HH:MM.' };
    if (od === do_) return { ok: false, chyba: 'Hodiny „od“ a „do“ nesmí být stejné.' };
  }
  // Sedm dní je totéž co „každý den“: ukládá se prázdný seznam, ať je jedna pravda.
  return { ok: true, plan: { days_of_week: dny.length === 7 ? [] : dny, hour_from: od, hour_till: do_ } };
}

/** Plán z řádku databáze (JSONB může přijít jako text; chybějící sloupec = bez plánu). */
export function planZRadku(r: { days_of_week?: unknown; hour_from?: unknown; hour_till?: unknown } | null | undefined): PlanBanneru {
  let dny: unknown = r?.days_of_week;
  if (typeof dny === 'string') { try { dny = JSON.parse(dny); } catch { dny = []; } }
  const seznam = Array.isArray(dny) ? dny.map(Number).filter(d => Number.isInteger(d) && d >= 1 && d <= 7) : [];
  const od = r?.hour_from ? String(r.hour_from) : null;
  const do_ = r?.hour_till ? String(r.hour_till) : null;
  return { days_of_week: seznam, hour_from: od && do_ ? od : null, hour_till: od && do_ ? do_ : null };
}

/** Má plán nějaké omezení? (Pro popisky a pro to, zda se ptát na čas.) */
export function maPlan(p: PlanBanneru): boolean {
  return p.days_of_week.length > 0 || !!(p.hour_from && p.hour_till);
}

/** Kdy se dívá host: ISO den v týdnu a pražské HH:MM. */
export interface Kdy { dow: number; hhmm: string }

/** ISO den v týdnu (1 = pondělí … 7 = neděle) pro pražský den `YYYY-MM-DD`. */
export function isoDen(den: string): number {
  const d = new Date(`${den}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Pražský den v týdnu a hodina v daném okamžiku. */
export function kdyTed(now: Date = new Date()): Kdy {
  return { dow: isoDen(pragueDayOf(now)), hhmm: pragueHM(now) };
}

/**
 * Sedí plán na tenhle okamžik? Hodiny přes půlnoc patří ke dni, ve kterém začaly:
 * pondělí 22:00–02:00 platí v pondělí od 22:00 a v úterý do 02:00.
 */
export function planSedi(p: PlanBanneru, kdy: Kdy): boolean {
  const { hour_from: od, hour_till: do_ } = p;
  const preMidnight = !!(od && do_ && od > do_);
  if (preMidnight && p.days_of_week.length && kdy.hhmm < do_!) {
    // Ranní konec okna, které začalo včera: počítá se včerejší den.
    const vcera = kdy.dow === 1 ? 7 : kdy.dow - 1;
    return p.days_of_week.includes(vcera);
  }
  return platiTed(p, kdy.dow, kdy.hhmm).plati;
}

/** Věta do editoru: „po, st, pá 16:00–18:00“, „denně od 08:00 do 12:00“, nebo prázdné bez omezení. */
export function popisPlanu(p: PlanBanneru): string {
  if (!maPlan(p)) return '';
  const dny = p.days_of_week.length ? dnyTextem(p.days_of_week) : 'denně';
  const hodiny = p.hour_from && p.hour_till ? ` ${p.hour_from}–${p.hour_till}` : '';
  return `${dny}${hodiny}`;
}

// ---- Jazykové mutace ---------------------------------------------------------------------------

/** Jazyky, do kterých jde banner přeložit (čeština je původní text). */
export const JAZYKY_BANNERU = ['en', 'de', 'sk', 'pl'] as const;
export type JazykBanneru = typeof JAZYKY_BANNERU[number];
export const JAZYK_BANNERU_NAZEV: Record<JazykBanneru, string> = { en: 'Angličtina', de: 'Němčina', sk: 'Slovenština', pl: 'Polština' };
export type PrekladyBanneru = Partial<Record<JazykBanneru, { title: string; text: string }>>;

/**
 * Překlady z formuláře. Jazyk bez nadpisu se zahodí (text bez nadpisu nemá smysl); nadpis max. 80 a text 300
 * znaků jako u původního. Neznámý jazyk je chyba (překlep v klíči by jinak tiše zmizel).
 */
export function validujPreklady(raw: unknown): { ok: true; preklady: PrekladyBanneru } | { ok: false; chyba: string } {
  if (raw == null || raw === '') return { ok: true, preklady: {} };
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return { ok: false, chyba: 'Překlady banneru nejsou platné.' }; } }
  if (typeof v !== 'object' || Array.isArray(v) || v === null) return { ok: false, chyba: 'Překlady banneru nejsou platné.' };
  const out: PrekladyBanneru = {};
  for (const [j, hodnota] of Object.entries(v as Record<string, any>)) {
    if (!(JAZYKY_BANNERU as readonly string[]).includes(j)) return { ok: false, chyba: `Neznámý jazyk překladu: ${j.slice(0, 8)}.` };
    const title = String(hodnota?.title ?? '').trim().slice(0, 80);
    const text = String(hodnota?.text ?? '').trim().slice(0, 300);
    if (!title && !text) continue;
    if (!title) return { ok: false, chyba: `Překlad (${JAZYK_BANNERU_NAZEV[j as JazykBanneru].toLowerCase()}) potřebuje nadpis, nebo ho celý smaž.` };
    out[j as JazykBanneru] = { title, text };
  }
  return { ok: true, preklady: out };
}

/** Překlady z řádku databáze (JSONB nebo text). Chyba = bez překladů. */
export function prekladyZRadku(v: unknown): PrekladyBanneru {
  const r = validujPreklady(v);
  if (r.ok) return r.preklady;
  // Poškozený řádek se nesmí propsat hostovi: použije se jen to, co projde po jazycích.
  const out: PrekladyBanneru = {};
  let obj: any = v;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { return {}; } }
  if (!obj || typeof obj !== 'object') return {};
  for (const j of JAZYKY_BANNERU) {
    const one = validujPreklady({ [j]: obj[j] });
    if (one.ok && one.preklady[j]) out[j] = one.preklady[j];
  }
  return out;
}

/** Nadpis a text pro jazyk hosta; bez překladu (nebo pro češtinu) původní. */
export function textProJazyk(b: { title: string; text: string }, preklady: PrekladyBanneru, jazyk: string | null | undefined): { title: string; text: string } {
  const p = jazyk ? (preklady as Record<string, { title: string; text: string } | undefined>)[jazyk] : undefined;
  return p && p.title ? { title: p.title, text: p.text } : { title: b.title, text: b.text };
}

/** Kolik jazyků má banner přeloženo (pro štítek v seznamu editoru). */
export function pocetPrekladu(preklady: PrekladyBanneru): number {
  return Object.keys(preklady).length;
}
