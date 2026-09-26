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
}

export type RazeniSouhrnu = 'hodiny' | 'mzda' | 'jmeno';

export function souhrnHodin(entries: readonly ZaznamDochazky[], ted: number, sazby: ReadonlyMap<string, number>): RadekSouhrnu[] {
  const m = new Map<string, RadekSouhrnu>();
  for (const e of entries) {
    const id = String(e.employeeId ?? '');
    if (!id) continue;
    const r = m.get(id) ?? { id, jmeno: e.employeeName ?? 'Neznámý', avatar: e.employeeAvatar ?? null, ms: 0, pocet: 0, bezi: false, vynechano: 0, mzda: null };
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
  celkem: number;
  /** Lidé s odpracovaným časem, ale bez sazby — jejich mzda v součtu chybí. */
  bezSazby: number;
  /** Záznamy vynechané jako zapomenuté odpíchnutí. */
  vynechano: number;
}

export function mzdyZaObdobi(entries: readonly ZaznamDochazky[], ted: number, sazby: ReadonlyMap<string, number>): MzdyObdobi {
  const radky = souhrnHodin(entries, ted, sazby);
  let celkem = 0, bezSazby = 0, vynechano = 0;
  for (const r of radky) {
    vynechano += r.vynechano;
    if (r.mzda == null) { if (r.ms > 0) bezSazby += 1; continue; }
    celkem += r.mzda;
  }
  return { celkem, bezSazby, vynechano };
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
  /** Jak dlouho po plánovaném konci (bez plánu: jak dlouho vůbec) — ms. */
  pres: number;
}

/** Konec dnešní směny jako okamžik; směna přes půlnoc (konec ≤ začátek) končí zítra. */
function konecSmeny(dnes: string, start: string | null | undefined, konec: string | null | undefined): Date | null {
  if (!konec) return null;
  const k = String(konec).slice(0, 5);
  const s = start ? String(start).slice(0, 5) : null;
  const den = s && k <= s ? dayPlus(dnes, 1) : dnes;
  return pragueMomentOf(den, k);
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
}

/**
 * Hodiny a výdělek přihlášeného v měsíci „RRRR-MM" podle dne příchodu (Praha).
 * Vedení dostává záznamy celého týmu — vlastní se vyberou podle id.
 */
export function mujMesic(entries: readonly ZaznamDochazky[], meId: number, mesic: string, ted: number, sazba: number | null): MujMesic {
  const s: MujMesic = { ms: 0, mzda: sazba && sazba > 0 ? 0 : null, bezi: false, zapomenuty: false, vynechano: 0, pocet: 0 };
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
