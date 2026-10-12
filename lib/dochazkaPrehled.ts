// Výpočty nad docházkou a týmem pro widgety a nástroj Docházky (kolo 69, balík B2).
//
// Čisté funkce bez Reactu a bez fetch, aby šly otestovat (scripts/testy/k69-b2.ts)
// a aby widget i nástroj stránky počítaly totéž stejně. Dřív si Docházka
// sčítala hodiny sama (zapomenutý odchod se počítal celý, třicet hodin),
// Domů zaměstnance jinak a profil člena zase jinak — tři různá čísla za
// jednoho člověka a jeden měsíc. Pravidla jsou teď na jednom místě:
//
//  - uzavřený záznam delší než MAX_SHIFT_HOURS (24 h) je zapomenuté
//    odpíchnutí: do hodin ani do mzdy se nepočítá, jen se přizná počtem;
//  - otevřený příchod se počítá do „teď", dokud neběží déle než
//    ZAPOMENUTY_MS (16 h) — pak je to zapomenutý odchod, ne práce;
//  - mzda se zaokrouhluje po záznamu (earnedFor), stejně jako řádky CSV.
//
// Časy z databáze nemají zónu — vždy přes parseDbTime (lib/pragueTime).

import { MAX_SHIFT_HOURS, earnedFor } from './wages.ts';
import { dayPlus, parseDbTime, pragueDayOf, pragueMomentOf } from './pragueTime.ts';
import type { HodnotaDne } from './obdobi.ts';

/**
 * Otevřený příchod delší než tohle je zapomenutý odchod, ne běžící směna —
 * stejná hranice, jakou mají Píchačky (widget) a měl ClockWidget.
 */
export const ZAPOMENUTY_MS = 16 * 3600 * 1000;

/** Bez plánované směny: příchod běžící déle je podezřelý (Docházka to tak hlásila od kola 12). */
export const BEZ_PLANU_MS = 12 * 3600 * 1000;

const MAX_MS = MAX_SHIFT_HOURS * 3600 * 1000;

// ---------------------------------------------------------------------------
// Tvary z API (jen to, co výpočty čtou)
// ---------------------------------------------------------------------------

export interface ZaznamDochazky {
  id?: number | string;
  employeeId?: number | string;
  employeeName?: string | null;
  employeeAvatar?: string | null;
  clockIn: string;
  clockOut: string | null;
  source?: string;
  note?: string | null;
}

export interface ClenRosteru {
  id: number | string;
  name?: string;
  avatar?: string | null;
  openSince?: string | null;
  openEntryId?: number | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  /** Jen s finance.mzdy (celý roster) nebo finance.moje_mzda (vlastní řádek). */
  hourlyRate?: number | null;
}

/** Sazby podle id člověka; bez sazby nebo s nulou člověk v mapě není. */
export function sazbyZRosteru(roster: readonly ClenRosteru[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of roster) {
    const s = Number(r.hourlyRate);
    if (Number.isFinite(s) && s > 0) m.set(String(r.id), s);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Jeden záznam
// ---------------------------------------------------------------------------

export type DruhZaznamu = 'hotovy' | 'bezi' | 'zapomenuty' | 'dlouhy' | 'vadny';

/**
 * Kolik záznam „platí" a proč. `ms` je čas, který se počítá do hodin
 * (u zapomenutého a dlouhého 0), `delka` skutečná délka pro zobrazení.
 */
export function rozeberZaznam(e: Pick<ZaznamDochazky, 'clockIn' | 'clockOut'>, ted: number): { druh: DruhZaznamu; ms: number; delka: number } {
  const od = parseDbTime(e.clockIn);
  if (!od) return { druh: 'vadny', ms: 0, delka: 0 };
  if (!e.clockOut) {
    const d = Math.max(0, ted - od.getTime());
    return d > ZAPOMENUTY_MS ? { druh: 'zapomenuty', ms: 0, delka: d } : { druh: 'bezi', ms: d, delka: d };
  }
  const konec = parseDbTime(e.clockOut);
  if (!konec) return { druh: 'vadny', ms: 0, delka: 0 };
  const d = konec.getTime() - od.getTime();
  if (d <= 0) return { druh: 'vadny', ms: 0, delka: 0 };
  if (d >= MAX_MS) return { druh: 'dlouhy', ms: 0, delka: d };
  return { druh: 'hotovy', ms: d, delka: d };
}

// ---------------------------------------------------------------------------
// Souhrn hodin po lidech
// ---------------------------------------------------------------------------

export interface RadekSouhrnu {
  id: string;
  jmeno: string;
  avatar: string | null;
  /** Započitatelný čas (bez zapomenutých a nad 24 h). */
  ms: number;
  /** Počet záznamů (směn) v období, i těch nezapočtených. */
  pocet: number;
  bezi: boolean;
  /** Zapomenutý odchod nebo záznam nad 24 h — v hodinách chybí. */
  vynechano: number;
  /** Hrubá mzda; null = bez sazby (nebo sazby nejsou vidět). */
  mzda: number | null;
  /** Podíl na spropitném z uzávěrek (spropitneZaObdobi); null = dýška nejsou k dispozici. */
  spropitne: number | null;
  /** Prémie (+) a srážky (−) za období (wage_adjustments), sečtené. */
  upravy: number;
  /** K výplatě: mzda + prémie − srážky; null, když není sazba a žádná úprava. */
  vyplata: number | null;
}

/** Prémie nebo srážka k mzdě (GET /api/attendance → adjustments). Částka: + prémie, − srážka. */
export interface UpravaMzdy {
  id: number;
  userId: number | string;
  /** Den „RRRR-MM-DD", ke kterému patří (období, výplata). */
  day: string;
  amount: number;
  note?: string | null;
  /** 'manual' (vedení) nebo 'reward' (schválená odměna z katalogu). */
  source?: string | null;
}

/** Úpravy v rozmezí dnů (a volitelně jen vybrané dny v týdnu: 0 = po … 6 = ne). */
export function upravyVRozmezi(upravy: readonly UpravaMzdy[], od: string, doD: string, dnyTydne: readonly number[] = []): UpravaMzdy[] {
  return upravy.filter(u => {
    const d = String(u.day ?? '').slice(0, 10);
    if (!d || d < od || d > doD) return false;
    return dnyTydne.length === 0 || dnyTydne.includes((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7);
  });
}

/** Součet úprav po lidech (id → částka). */
export function upravyPoLidech(upravy: readonly UpravaMzdy[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of upravy) {
    const id = String(u.userId ?? '');
    if (!id) continue;
    m.set(id, (m.get(id) ?? 0) + (Number(u.amount) || 0));
  }
  return m;
}

export interface DoplnkySouhrnu {
  /** Podíl na spropitném po lidech (spropitneZaObdobi). */
  spropitne?: ReadonlyMap<string, number> | null;
  /** Prémie a srážky po lidech (upravyPoLidech). */
  upravy?: ReadonlyMap<string, number> | null;
  /** Jména lidí, kteří mají úpravu, ale v období nic neodpíchli — řádek vznikne i bez záznamu. */
  lide?: ReadonlyMap<string, { jmeno: string; avatar: string | null }>;
}

/** Den (pražský), do kterého záznam patří: den příchodu; null u záznamu bez čitelného příchodu. */
export function denZaznamu(e: Pick<ZaznamDochazky, 'clockIn'>): string | null {
  const od = parseDbTime(e.clockIn);
  return od ? pragueDayOf(od) : null;
}

/** Záznamy, jejichž den příchodu leží v rozmezí (a případně v jednom z vybraných dnů v týdnu: 0 = po … 6 = ne). */
export function zaznamyVRozmezi<T extends Pick<ZaznamDochazky, 'clockIn'>>(entries: readonly T[], od: string, doD: string, dnyTydne: readonly number[] = []): T[] {
  return entries.filter(e => {
    const d = denZaznamu(e);
    if (!d || d < od || d > doD) return false;
    return dnyTydne.length === 0 || dnyTydne.includes((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7);
  });
}

/** Odpracované hodiny po dnech rozmezí (dny bez záznamu = 0); stejná pravidla jako souhrn (zapomenuté odchody se nepočítají). */
export function hodinyPoDnech(entries: readonly ZaznamDochazky[], ted: number, od: string, doD: string): HodnotaDne[] {
  const m = new Map<string, number>();
  for (const e of entries) {
    const d = denZaznamu(e);
    if (!d || d < od || d > doD) continue;
    m.set(d, (m.get(d) ?? 0) + rozeberZaznam(e, ted).ms);
  }
  const out: HodnotaDne[] = [];
  for (let d = od, n = 0; d <= doD && n < 800; d = dayPlus(d, 1), n++) out.push({ den: d, hodnota: Math.round(((m.get(d) ?? 0) / 3600000) * 10) / 10 });
  return out;
}

export type RazeniSouhrnu = 'hodiny' | 'mzda' | 'jmeno';

export function souhrnHodin(entries: readonly ZaznamDochazky[], ted: number, sazby: ReadonlyMap<string, number>, doplnky: DoplnkySouhrnu = {}): RadekSouhrnu[] {
  const { spropitne, upravy, lide } = doplnky;
  const m = new Map<string, RadekSouhrnu>();
  const novy = (id: string, jmeno: string, avatar: string | null): RadekSouhrnu =>
    ({ id, jmeno, avatar, ms: 0, pocet: 0, bezi: false, vynechano: 0, mzda: null, spropitne: spropitne ? spropitne.get(id) ?? 0 : null, upravy: upravy?.get(id) ?? 0, vyplata: null });
  for (const e of entries) {
    const id = String(e.employeeId ?? '');
    if (!id) continue;
    const r = m.get(id) ?? novy(id, e.employeeName ?? 'Neznámý', e.employeeAvatar ?? null);
    const z = rozeberZaznam(e, ted);
    r.pocet += 1;
    if (z.druh === 'zapomenuty' || z.druh === 'dlouhy') r.vynechano += 1;
    r.ms += z.ms;
    if (z.druh === 'bezi') r.bezi = true;
    const sazba = sazby.get(id);
    if (sazba) r.mzda = (r.mzda ?? 0) + earnedFor(z.ms, sazba);
    if (!r.avatar && e.employeeAvatar) r.avatar = e.employeeAvatar;
    m.set(id, r);
  }
  // Prémie bez odpíchnuté směny (bonus za akci, srážka za manko) patří do výplaty, i když člověk v období nepracoval.
  for (const [id, castka] of upravy ?? []) {
    if (m.has(id) || !castka) continue;
    const kdo = lide?.get(id);
    if (!kdo) continue;
    m.set(id, novy(id, kdo.jmeno, kdo.avatar));
  }
  for (const r of m.values()) r.vyplata = r.mzda == null ? (r.upravy ? r.upravy : null) : r.mzda + r.upravy;
  return [...m.values()];
}

export function seradSouhrn(radky: readonly RadekSouhrnu[], razeni: RazeniSouhrnu): RadekSouhrnu[] {
  const r = [...radky];
  if (razeni === 'jmeno') return r.sort((a, b) => a.jmeno.localeCompare(b.jmeno, 'cs'));
  if (razeni === 'mzda') return r.sort((a, b) => (b.mzda ?? -1) - (a.mzda ?? -1) || b.ms - a.ms);
  return r.sort((a, b) => b.ms - a.ms || a.jmeno.localeCompare(b.jmeno, 'cs'));
}

/** „12 h 05 min", „45 min" — délka pro řádek souhrnu. */
export function hodinyMinuty(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(min / 60);
  return h === 0 ? `${min} min` : `${h} h ${String(min % 60).padStart(2, '0')} min`;
}

// ---------------------------------------------------------------------------
// Mzdy za období a podíl na tržbách
// ---------------------------------------------------------------------------

export interface MzdyObdobi {
  /** Mzdy (hodiny × sazba) + prémie − srážky. */
  celkem: number;
  /** Lidé s odpracovaným časem, ale bez sazby — jejich mzda v součtu chybí. */
  bezSazby: number;
  /** Záznamy vynechané jako zapomenuté odpíchnutí. */
  vynechano: number;
  /** Prémie a srážky v součtu (součást `celkem`). */
  upravy: number;
}

export function mzdyZaObdobi(entries: readonly ZaznamDochazky[], ted: number, sazby: ReadonlyMap<string, number>, upravy: readonly UpravaMzdy[] = []): MzdyObdobi {
  const radky = souhrnHodin(entries, ted, sazby);
  let celkem = 0, bezSazby = 0, vynechano = 0;
  for (const r of radky) {
    vynechano += r.vynechano;
    if (r.mzda == null) { if (r.ms > 0) bezSazby += 1; continue; }
    celkem += r.mzda;
  }
  const u = upravy.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  return { celkem: celkem + u, bezSazby, vynechano, upravy: u };
}

/** Uzávěrka, jak ji vrací GET /api/closings (jen pole, která tržby potřebují). */
export interface UzaverkaTrzby {
  date: string;
  shift_date?: string | null;
  covered_by?: number | null;
  cash_revenue?: number | string | null;
  card_revenue?: number | string | null;
  trzbaSkryta?: boolean;
}

/**
 * Tržby (hotově + kartou) z hlavních uzávěrek, jejichž den směny leží v <od, do>.
 * Pomocný řádek kolegy „za kterého se zavřelo" má tržbu nulovou (fantom) —
 * počítá se jen hlavní. `skryto` = aspoň jedna uzávěrka přišla bez tržby
 * (role bez finance.trzby) a součet by lhal.
 */
export function trzbyZaObdobi(closings: readonly UzaverkaTrzby[], od: string, doDne: string): { trzby: number; pocet: number; skryto: boolean } {
  let trzby = 0, pocet = 0, skryto = false;
  for (const c of closings) {
    const den = String(c.shift_date ?? c.date ?? '').slice(0, 10);
    if (!den || den < od || den > doDne) continue;
    if (c.covered_by != null) continue;
    if (c.trzbaSkryta) { skryto = true; continue; }
    trzby += (Number(c.cash_revenue) || 0) + (Number(c.card_revenue) || 0);
    pocet += 1;
  }
  return { trzby, pocet, skryto };
}

// ---------------------------------------------------------------------------
// Spropitné po lidech (z uzávěrek, podle hodin na směně)
// ---------------------------------------------------------------------------

/** Uzávěrka, jak ji vrací GET /api/closings — jen pole, která dělení spropitného potřebuje. */
export interface UzaverkaSpropitne extends UzaverkaTrzby {
  tips?: number | string | null;
  shiftEmployees?: readonly { id: number | string }[] | null;
  created_by?: number | string | null;
}

export interface SpropitneObdobi {
  /** Podíl po lidech za celé období (id → částka). */
  poLidech: Map<string, number>;
  /** Podíl po dnech a lidech („RRRR-MM-DD|id" → částka) — pro export po záznamech. */
  poDnech: Map<string, number>;
  celkem: number;
  /** Spropitné uzávěrek bez známé směny ani autora — není komu připsat. */
  nerozdeleno: number;
  /** Aspoň jedna uzávěrka přišla bez tržby (role bez finance.trzby) — součet by lhal. */
  skryto: boolean;
}

/**
 * Spropitné z hlavních uzávěrek v rozmezí rozpočítané mezi lidi na směně — „tip pool podle hodin" (7shifts, Toast):
 * dýško uzávěrky se dělí mezi její `shiftEmployees` podle času, který ten den odpracovali (záznamy docházky);
 * bez záznamů rovným dílem. Uzávěrka bez směny jde autorovi; bez autora zůstane v `nerozdeleno`.
 */
export function spropitneZaObdobi(
  closings: readonly UzaverkaSpropitne[], entries: readonly ZaznamDochazky[], ted: number, od: string, doD: string, dnyTydne: readonly number[] = [],
): SpropitneObdobi {
  // Odpracovaný čas po dnech a lidech — stejná pravidla jako souhrn (zapomenuté odchody 0).
  const hodiny = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const d = denZaznamu(e);
    const id = String(e.employeeId ?? '');
    if (!d || !id) continue;
    const den = hodiny.get(d) ?? new Map<string, number>();
    den.set(id, (den.get(id) ?? 0) + rozeberZaznam(e, ted).ms);
    hodiny.set(d, den);
  }
  const out: SpropitneObdobi = { poLidech: new Map(), poDnech: new Map(), celkem: 0, nerozdeleno: 0, skryto: false };
  const pripis = (den: string, id: string, castka: number) => {
    out.poLidech.set(id, (out.poLidech.get(id) ?? 0) + castka);
    out.poDnech.set(`${den}|${id}`, (out.poDnech.get(`${den}|${id}`) ?? 0) + castka);
  };
  for (const c of closings) {
    const den = String(c.shift_date ?? c.date ?? '').slice(0, 10);
    if (!den || den < od || den > doD) continue;
    if (dnyTydne.length > 0 && !dnyTydne.includes((new Date(`${den}T12:00:00Z`).getUTCDay() + 6) % 7)) continue;
    if (c.covered_by != null) continue;
    if (c.trzbaSkryta) { out.skryto = true; continue; }
    const tips = Number(c.tips) || 0;
    if (tips <= 0) continue;
    out.celkem += tips;
    let smena = [...new Set((c.shiftEmployees ?? []).map(p => String(p.id)).filter(Boolean))];
    if (smena.length === 0 && c.created_by != null) smena = [String(c.created_by)];
    if (smena.length === 0) { out.nerozdeleno += tips; continue; }
    const ms = hodiny.get(den);
    const vahy = smena.map(id => ms?.get(id) ?? 0);
    const soucet = vahy.reduce((a, b) => a + b, 0);
    smena.forEach((id, i) => pripis(den, id, soucet > 0 ? (tips * vahy[i]) / soucet : tips / smena.length));
  }
  return out;
}

/** Období „posledních N dní" jako pražské dny <od, do> včetně dneška. */
export function obdobiDni(dni: number, dnes: string): { od: string; do: string } {
  return { od: dayPlus(dnes, -(Math.max(1, dni) - 1)), do: dnes };
}

/** Podíl mezd na tržbách v procentech, nebo null, když tržby nejsou. */
export function podilMezd(mzdy: number, trzby: number): number | null {
  return trzby > 0 ? (mzdy / trzby) * 100 : null;
}

// ---------------------------------------------------------------------------
// Otevřené příchody (zapomenuté odchody)
// ---------------------------------------------------------------------------

export interface OtevrenyPrichod {
  id: string;
  jmeno: string;
  avatar: string | null;
  od: Date;
  openEntryId: number | null;
  /** Plánovaný konec směny „HH:MM", nebo null bez plánu. */
  planDo: string | null;
  /** Plánovaný konec jako okamžik (i přes půlnoc) — návrh času odchodu v „Ukončit". */
  planKonec: Date | null;
  /** Jak dlouho po plánovaném konci (bez plánu: jak dlouho vůbec) — ms. */
  pres: number;
}

/** Konec dnešní směny jako okamžik; směna přes půlnoc (konec ≤ začátek) končí zítra. */
export function konecSmeny(dnes: string, start: string | null | undefined, konec: string | null | undefined): Date | null {
  if (!konec) return null;
  const k = String(konec).slice(0, 5);
  const s = start ? String(start).slice(0, 5) : null;
  const den = s && k <= s ? dayPlus(dnes, 1) : dnes;
  return pragueMomentOf(den, k);
}

/**
 * Návrh času odchodu při ručním ukončení zapomenutého příchodu: plánovaný konec
 * směny (i přes půlnoc), pokud leží mezi příchodem a teď a ne dál než 24 h od
 * příchodu (dnešní plán se nesmí přilepit ke včerejšímu zapomenutému příchodu).
 * Jinak (bez plánu, směna ještě běží) teď — budoucí odchod by nedával smysl.
 * Proč jedna funkce pro widgety i nástroj Docházky: kdo odešel v 16:00 a vedoucí
 * ho zavírá v 19:00, nesmí mít ve mzdě tři hodiny navíc — a to, zda se zeptá
 * widget, nebo seznam záznamů, na tom nemá záležet.
 */
export function navrhOdchodu(od: Date, konec: Date | null, ted: number): { cas: Date; zPlanu: boolean } {
  if (konec && konec.getTime() > od.getTime() && konec.getTime() <= ted && konec.getTime() - od.getTime() <= 24 * 3600_000) return { cas: konec, zPlanu: true };
  return { cas: new Date(ted), zPlanu: false };
}

/**
 * Kdo je napíchnutý déle, než měl: plánovaná směna už skončila (a příchod
 * byl před jejím koncem), nebo bez plánu běží příchod déle než 12 h.
 * Server zapomenuté odchody v noci zavírá sám (autoCloseEntry) — widget
 * upozorní dřív, dokud to jde opravit podle paměti.
 */
export function otevrenePrichody(roster: readonly ClenRosteru[], ted: number, dnes: string): OtevrenyPrichod[] {
  const out: OtevrenyPrichod[] = [];
  for (const r of roster) {
    const od = parseDbTime(r.openSince);
    if (!od) continue;
    const konec = konecSmeny(dnes, r.shiftStart, r.shiftEnd);
    let pres: number | null = null;
    if (konec && od.getTime() < konec.getTime() && pragueDayOf(od) >= dayPlus(dnes, -1)) {
      if (ted > konec.getTime()) pres = ted - konec.getTime();
    } else if (ted - od.getTime() > BEZ_PLANU_MS) {
      pres = ted - od.getTime();
    }
    if (pres == null) continue;
    out.push({
      id: String(r.id), jmeno: r.name ?? 'Bez jména', avatar: r.avatar ?? null, od,
      openEntryId: r.openEntryId ?? null,
      planDo: konec && od.getTime() < konec.getTime() ? String(r.shiftEnd).slice(0, 5) : null,
      planKonec: konec && od.getTime() < konec.getTime() ? konec : null,
      pres,
    });
  }
  return out.sort((a, b) => b.pres - a.pres);
}

// ---------------------------------------------------------------------------
// Dnes v podniku (plán proti skutečnosti)
// ---------------------------------------------------------------------------

export type StavDne = 'na_smene' | 'odesel' | 'nedorazil' | 'ceka' | 'po_smene' | 'bez_planu';

export interface RadekDne {
  id: string;
  jmeno: string;
  avatar: string | null;
  plan: string | null;
  stav: StavDne;
  /** Čas příchodu „HH:MM" (běžící nebo dnešní poslední), pokud je známý. */
  prichod: Date | null;
}

/**
 * Kdo má dnes směnu a jak to s ním je. `entries` jsou dnešní záznamy
 * (jen s dochazka.zobrazit — tablet je nemá); bez nich nevíme, kdo už
 * odešel, a tak člověk bez otevřeného příchodu po konci směny není
 * „nedorazil", ale neutrální „po směně". Po začátku směny bez příchodu =
 * `nedorazil` (oranžově).
 */
export function dnesVPodniku(roster: readonly ClenRosteru[], entries: readonly ZaznamDochazky[] | null, ted: number, dnes: string): RadekDne[] {
  const dnesni = new Map<string, ZaznamDochazky[]>();
  for (const e of entries ?? []) {
    const od = parseDbTime(e.clockIn);
    if (!od || pragueDayOf(od) !== dnes) continue;
    const k = String(e.employeeId ?? '');
    dnesni.set(k, [...(dnesni.get(k) ?? []), e]);
  }
  const out: RadekDne[] = [];
  for (const r of roster) {
    const id = String(r.id);
    const otevreny = parseDbTime(r.openSince);
    const maPlan = !!r.shiftStart;
    if (!maPlan && !otevreny) continue;
    const plan = maPlan ? `${String(r.shiftStart).slice(0, 5)}–${String(r.shiftEnd ?? '').slice(0, 5)}` : null;
    const zaznamy = dnesni.get(id) ?? [];
    const posledni = zaznamy.map(z => parseDbTime(z.clockIn)).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    let stav: StavDne;
    if (otevreny) stav = maPlan ? 'na_smene' : 'bez_planu';
    else if (zaznamy.length > 0) stav = 'odesel';
    else {
      const zacatek = pragueMomentOf(dnes, String(r.shiftStart).slice(0, 5));
      const konec = konecSmeny(dnes, r.shiftStart, r.shiftEnd);
      if (zacatek && ted < zacatek.getTime()) stav = 'ceka';
      else if (entries == null && konec && ted > konec.getTime()) stav = 'po_smene';
      else stav = 'nedorazil';
    }
    out.push({ id, jmeno: r.name ?? 'Bez jména', avatar: r.avatar ?? null, plan, stav, prichod: otevreny ?? posledni });
  }
  const PORADI: Record<StavDne, number> = { nedorazil: 0, na_smene: 1, bez_planu: 2, ceka: 3, odesel: 4, po_smene: 5 };
  return out.sort((a, b) => PORADI[a.stav] - PORADI[b.stav] || (a.plan ?? '').localeCompare(b.plan ?? '') || a.jmeno.localeCompare(b.jmeno, 'cs'));
}

// ---------------------------------------------------------------------------
// Vlastní měsíc (Odpracováno, Můj výdělek)
// ---------------------------------------------------------------------------

export interface MujMesic {
  ms: number;
  /** Hrubý výdělek; null bez sazby. */
  mzda: number | null;
  bezi: boolean;
  zapomenuty: boolean;
  /** Uzavřené záznamy nad 24 h (nepočítají se). */
  vynechano: number;
  pocet: number;
  /** Prémie a srážky měsíce (wage_adjustments) — k výdělku navíc. */
  upravy: number;
}

/**
 * Hodiny a výdělek přihlášeného v měsíci „RRRR-MM" podle dne příchodu (Praha).
 * Vedení dostává záznamy celého týmu — vlastní se vyberou podle id.
 */
export type VolbaMesice = 'tento' | 'minuly';

/**
 * Měsíc pro Můj výdělek / Odpracováno podle volby widgetu a kolik dní zpět si
 * od API vyžádat (od 1. dne měsíce do dneška včetně, +1 jako dřív). Minulý
 * měsíc na 31. = až 62 dní; API zaměstnance posílá 70.
 */
export function obdobiMesice(dnes: string, volba: VolbaMesice): { mesic: string; dni: number } {
  const [r, m] = [Number(dnes.slice(0, 4)), Number(dnes.slice(5, 7))];
  const mesic = volba === 'minuly' ? `${m === 1 ? r - 1 : r}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}` : dnes.slice(0, 7);
  const od = Date.UTC(Number(mesic.slice(0, 4)), Number(mesic.slice(5, 7)) - 1, 1);
  const do_ = Date.UTC(r, m - 1, Number(dnes.slice(8, 10)));
  return { mesic, dni: Math.round((do_ - od) / 86400000) + 2 };
}

/** Vlastní prémie a srážky v měsíci, nejnovější první (seznam v Mém výdělku). */
export function mojeUpravyMesice(upravy: readonly UpravaMzdy[], meId: number, mesic: string): UpravaMzdy[] {
  return upravy.filter(u => Number(u.userId) === meId && String(u.day ?? '').slice(0, 7) === mesic)
    .sort((a, b) => String(b.day).localeCompare(String(a.day)) || b.id - a.id);
}

export function mujMesic(entries: readonly ZaznamDochazky[], meId: number, mesic: string, ted: number, sazba: number | null, upravy: readonly UpravaMzdy[] = []): MujMesic {
  const s: MujMesic = { ms: 0, mzda: sazba && sazba > 0 ? 0 : null, bezi: false, zapomenuty: false, vynechano: 0, pocet: 0, upravy: 0 };
  for (const u of upravy) {
    if (Number(u.userId) !== meId || String(u.day ?? '').slice(0, 7) !== mesic) continue;
    s.upravy += Number(u.amount) || 0;
  }
  for (const e of entries) {
    if (Number(e.employeeId) !== meId) continue;
    const od = parseDbTime(e.clockIn);
    if (!od || pragueDayOf(od).slice(0, 7) !== mesic) continue;
    const z = rozeberZaznam(e, ted);
    if (z.druh === 'vadny') continue;
    s.pocet += 1;
    if (z.druh === 'zapomenuty') { s.zapomenuty = true; continue; }
    if (z.druh === 'dlouhy') { s.vynechano += 1; continue; }
    if (z.druh === 'bezi') s.bezi = true;
    s.ms += z.ms;
    if (s.mzda != null && sazba) s.mzda += earnedFor(z.ms, sazba);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Tým: pozvánky, role, chybějící sazby
// ---------------------------------------------------------------------------

export interface Pozvanka { id: number; email: string; status: string; created_at?: string; job_title?: string | null; token?: string | null }

/** Čekající pozvánky, nejstarší první (ty nejspíš zapadly). */
export function cekajiciPozvanky(p: readonly Pozvanka[]): Pozvanka[] {
  return p.filter(x => x.status === 'pending').sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
}

export interface RadekRole { klic: string; nazev: string; pocet: number; vlastni: boolean }

/**
 * Role s počtem lidí z GET /api/roles. Role tabletu (typ kiosk) se nepřiděluje
 * lidem, v přehledu by jen strašila nulou. Prázdné role se nevypisují, jen počtem.
 */
export function roleSPocty(system: readonly any[], vlastni: readonly any[]): { radky: RadekRole[]; prazdnych: number } {
  const vse: RadekRole[] = [
    ...system.filter(r => r?.typ !== 'kiosk').map(r => ({ klic: `k:${r.klic}`, nazev: String(r.nazev ?? r.klic), pocet: Number(r.pocet) || 0, vlastni: false })),
    ...vlastni.filter(r => r?.typ !== 'kiosk').map(r => ({ klic: `id:${r.id}`, nazev: String(r.nazev ?? ''), pocet: Number(r.pocet) || 0, vlastni: true })),
  ];
  const radky = vse.filter(r => r.pocet > 0).sort((a, b) => b.pocet - a.pocet || a.nazev.localeCompare(b.nazev, 'cs'));
  return { radky, prazdnych: vse.length - radky.length };
}

export interface ClenTymu { id: number; name?: string; avatar?: string | null; role?: string; hourly_rate?: number | null; job_title?: string | null }

/**
 * Kdo nemá hodinovou sazbu. Sazby posílá /api/teams jen s finance.mzdy —
 * `null` znamená „nevidím", ne „nemá", a takový člen se nepočítá. Vlastník
 * se vynechává: podnik mu zpravidla neplatí hodinovou mzdu a widget by
 * u každého podniku navždy svítil jeho jménem. Tablet (role kiosk) taky.
 */
export function bezSazby(members: readonly ClenTymu[], ownerId: number | null): ClenTymu[] {
  return members
    .filter(m => m.role !== 'kiosk' && m.id !== ownerId && m.hourly_rate != null && !(Number(m.hourly_rate) > 0))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'cs'));
}
