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
import { dayPlus, parseDbTime, pragueDayOf, pragueHM, pragueMomentOf } from './pragueTime.ts';
import { jeSvatek, jeVikend } from './svatky.ts';
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
  /** Plánovaná směna, ke které záznam patří (GET vedení, kolo 7): „HH:MM[:SS]" a její den „RRRR-MM-DD". */
  planStart?: string | null;
  planEnd?: string | null;
  planDate?: string | null;
  /** Kdo záznam naposledy ručně upravil nebo přidal (time_entries.updated_by) a kdy. */
  updatedBy?: number | string | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
  /** Záznam po pauze (kolo 8): id záznamu, který pauze předcházel — délka pauzy = tenhle příchod − jeho odchod. */
  breakAfter?: number | string | null;
}

export interface ClenRosteru {
  id: number | string;
  name?: string;
  avatar?: string | null;
  openSince?: string | null;
  openEntryId?: number | null;
  /** Začátek běžící směny — první příchod před pauzami (kolo 93; po „Konec pauzy" je openSince konec pauzy). */
  shiftSince?: string | null;
  /** Skončené pauzy běžící směny v ms. */
  breakMs?: number | null;
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
  /** Počet směn v období, i nezapočtených; směna s pauzou (dva záznamy) je jedna (pokracovaniPoPauze). */
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
  /** Příplatky za víkend, noc a svátek (kolo 8) — jen se sazbou a s `doplnky.priplatky`, jinak 0. */
  priplatky: number;
  /** Rozpad příplatků v ms (jen s `doplnky.priplatky`). */
  priplatkyMs: { vikend: number; noc: number; svatek: number };
  /** K výplatě: mzda + příplatky + prémie − srážky; null, když není sazba a žádná úprava. */
  vyplata: number | null;
  /** Součet délek plánovaných směn záznamů (ms); 0 bez plánu nebo bez `doplnky.plan`. */
  planMs: number;
  /** Kolikrát přišel o víc než PRAH_POZDE_MIN po začátku plánované směny (jen s `doplnky.plan`). */
  pozde: number;
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
  /** Plán proti skutečnosti (kolo 7): sečíst délky plánovaných směn a pozdní příchody ze záznamů (planStart/planEnd z API). */
  plan?: boolean;
  /** Příplatky za víkend, noc a svátek (kolo 8): pravidla podniku; počítá se jen u lidí se sazbou. */
  priplatky?: PravidlaPriplatku | null;
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

export type RazeniSouhrnu = 'hodiny' | 'mzda' | 'jmeno' | 'pozde';

export function souhrnHodin(entries: readonly ZaznamDochazky[], ted: number, sazby: ReadonlyMap<string, number>, doplnky: DoplnkySouhrnu = {}): RadekSouhrnu[] {
  const { spropitne, upravy, lide, plan, priplatky } = doplnky;
  const m = new Map<string, RadekSouhrnu>();
  const novy = (id: string, jmeno: string, avatar: string | null): RadekSouhrnu =>
    ({ id, jmeno, avatar, ms: 0, pocet: 0, bezi: false, vynechano: 0, mzda: null, spropitne: spropitne ? spropitne.get(id) ?? 0 : null, upravy: upravy?.get(id) ?? 0, priplatky: 0, priplatkyMs: { vikend: 0, noc: 0, svatek: 0 }, vyplata: null, planMs: 0, pozde: 0 });
  const plany = plan ? odchylkyZaznamu(entries, ted) : null;
  // Směna s pauzou jsou dva záznamy — počítá se jednou (záznam po pauze jen pokračuje).
  const pokracovani = pokracovaniPoPauze(entries);
  for (const e of entries) {
    const id = String(e.employeeId ?? '');
    if (!id) continue;
    const r = m.get(id) ?? novy(id, e.employeeName ?? 'Neznámý', e.employeeAvatar ?? null);
    const z = rozeberZaznam(e, ted);
    if (!pokracovani.has(String(e.id ?? ''))) r.pocet += 1;
    if (z.druh === 'zapomenuty' || z.druh === 'dlouhy') r.vynechano += 1;
    r.ms += z.ms;
    if (z.druh === 'bezi') r.bezi = true;
    const sazba = sazby.get(id);
    if (sazba) {
      r.mzda = (r.mzda ?? 0) + earnedFor(z.ms, sazba);
      // Příplatky po záznamu (zaokrouhlené jako mzda — účetní sečte řádky), rozpad v ms pro „So/Ne 14 h · noc 3 h".
      if (priplatky) {
        const p = priplatkyZaznamu(e, ted, sazba, priplatky);
        r.priplatky += p.castka;
        r.priplatkyMs.vikend += p.vikendMs; r.priplatkyMs.noc += p.nocMs; r.priplatkyMs.svatek += p.svatekMs;
      }
    }
    if (!r.avatar && e.employeeAvatar) r.avatar = e.employeeAvatar;
    const p = plany?.get(String(e.id ?? ''));
    if (p) {
      r.planMs += p.planMs;
      if (p.pozdeMin != null) r.pozde += 1;
    }
    m.set(id, r);
  }
  // Prémie bez odpíchnuté směny (bonus za akci, srážka za manko) patří do výplaty, i když člověk v období nepracoval.
  for (const [id, castka] of upravy ?? []) {
    if (m.has(id) || !castka) continue;
    const kdo = lide?.get(id);
    if (!kdo) continue;
    m.set(id, novy(id, kdo.jmeno, kdo.avatar));
  }
  for (const r of m.values()) r.vyplata = r.mzda == null ? (r.upravy ? r.upravy : null) : r.mzda + r.priplatky + r.upravy;
  return [...m.values()];
}

export function seradSouhrn(radky: readonly RadekSouhrnu[], razeni: RazeniSouhrnu): RadekSouhrnu[] {
  const r = [...radky];
  if (razeni === 'jmeno') return r.sort((a, b) => a.jmeno.localeCompare(b.jmeno, 'cs'));
  if (razeni === 'mzda') return r.sort((a, b) => (b.mzda ?? -1) - (a.mzda ?? -1) || b.ms - a.ms);
  // Kdo chodí pozdě (kolo 7): nejvíc pozdních příchodů nahoře, při shodě víc hodin.
  if (razeni === 'pozde') return r.sort((a, b) => b.pozde - a.pozde || b.ms - a.ms || a.jmeno.localeCompare(b.jmeno, 'cs'));
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
 *
 * Kolo 8 (pravidla dýška): `kontext` nese pravidla podniku — rovným dílem, nebo podle hodin s váhou pozice, a kdo se
 * nedělí (vedení, dokud není „Dělit i s vedením"). Pravidla platí od `platiOd`; starší uzávěrky se dělí postaru, aby se
 * minulé měsíce nepřepočítaly potichu. Bez kontextu je výpočet přesně ten z kola 69.
 */
export function spropitneZaObdobi(
  closings: readonly UzaverkaSpropitne[], entries: readonly ZaznamDochazky[], ted: number, od: string, doD: string, dnyTydne: readonly number[] = [],
  kontext: KontextDyska | null = null,
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
    // Pravidla platí až od zvoleného dne; vyloučení (vedení) se z dělení vyřadí — a když nezbyde nikdo, dýško není komu připsat.
    const pravidla = kontext && (!kontext.pravidla.platiOd || den >= kontext.pravidla.platiOd) ? kontext : null;
    if (pravidla && pravidla.pravidla.vylouceni.length) {
      const vyl = new Set(pravidla.pravidla.vylouceni.map(String));
      smena = smena.filter(id => !vyl.has(id));
    }
    if (smena.length === 0) { out.nerozdeleno += tips; continue; }
    const ms = hodiny.get(den);
    const vahy = vahyDyska(smena, id => ms?.get(id) ?? 0, pravidla);
    const soucet = vahy.reduce((a, b) => a + b, 0);
    smena.forEach((id, i) => pripis(den, id, soucet > 0 ? (tips * vahy[i]) / soucet : tips / smena.length));
  }
  return out;
}

/** Váhy lidí na směně podle metody: hodiny (výchozí), rovným dílem, nebo hodiny × váha pozice (bez hodin jen váha pozice). */
function vahyDyska(smena: readonly string[], hodiny: (id: string) => number, kontext: KontextDyska | null): number[] {
  const metoda = kontext?.pravidla.metoda ?? 'hodiny';
  if (metoda === 'rovne') return smena.map(() => 1);
  if (metoda === 'vaha' && kontext) {
    const h = smena.map(hodiny);
    const maHodiny = h.some(x => x > 0);
    return smena.map((id, i) => (maHodiny ? h[i] : 1) * vahaPozice(kontext, id));
  }
  return smena.map(hodiny);
}

/** Váha pozice člověka (0–2); pozice bez nastavení i člověk bez pozice mají 1. */
export function vahaPozice(kontext: KontextDyska, id: string): number {
  const pozice = kontext.pozice?.get(String(id));
  const v = pozice != null ? kontext.pravidla.vahy[pozice] : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(2, Math.max(0, v)) : 1;
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
  const pokracovani = pokracovaniPoPauze(entries ?? []);
  const out: RadekDne[] = [];
  for (const r of roster) {
    const id = String(r.id);
    const otevreny = parseDbTime(r.openSince);
    const maPlan = !!r.shiftStart;
    if (!maPlan && !otevreny) continue;
    const plan = maPlan ? `${String(r.shiftStart).slice(0, 5)}–${String(r.shiftEnd ?? '').slice(0, 5)}` : null;
    const zaznamy = dnesni.get(id) ?? [];
    // Poslední příchod dne — záznam po pauze není příchod (pokračuje směnu), bere se příchod směny před ním.
    const posledni = zaznamy.filter(z => !pokracovani.has(String(z.id ?? ''))).map(z => parseDbTime(z.clockIn)).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
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
    // Příchod směny: po pauze první příchod (shiftSince), ne konec pauzy.
    out.push({ id, jmeno: r.name ?? 'Bez jména', avatar: r.avatar ?? null, plan, stav, prichod: (otevreny ? parseDbTime(r.shiftSince ?? null) ?? otevreny : null) ?? posledni });
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
  const pokracovani = pokracovaniPoPauze(entries);
  for (const e of entries) {
    if (Number(e.employeeId) !== meId) continue;
    const od = parseDbTime(e.clockIn);
    if (!od || pragueDayOf(od).slice(0, 7) !== mesic) continue;
    const z = rozeberZaznam(e, ted);
    if (z.druh === 'vadny') continue;
    if (!pokracovani.has(String(e.id ?? ''))) s.pocet += 1;
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

// ---------------------------------------------------------------------------
// Plán proti skutečnosti (kolo 7, balík R7-2)
// ---------------------------------------------------------------------------

/**
 * Pozdní příchod a dřívější odchod se tvrdí až nad tolik minut. Stejný práh jako tablet
 * (PRAH_POZDE_MIN v lib/kioskPrehled.ts) a push „Pozdní příchod" v POST /api/attendance.
 * Zopakovaný, ne importovaný: kioskPrehled importuje odsud a import opačným směrem by
 * udělal kruh. Kdo mění jedno, změní obojí.
 */
export const PRAH_POZDE_MIN = 10;
/** „Směna začíná za…" v Píchačkách nejvýš tolik před začátkem (jako tablet: BRZY_MAX_MS). */
export const PRED_ZACATKEM_MS = 3 * 3600_000;
/** Dál od plánu se odchylka netvrdí — to už není ta směna (jako tablet: MAX_ODCHYLKA_MS). */
export const MAX_ODCHYLKA_MS = 12 * 3600_000;

const hm5 = (v: string | null | undefined) => String(v ?? '').slice(0, 5);
const jeDen = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export interface OdchylkaOdPlanu {
  /** O kolik minut přišel po začátku směny (nad práh), jinak null. */
  pozdeMin: number | null;
  /** O kolik minut odešel před koncem směny (nad práh), jinak null — u otevřeného záznamu vždy null. */
  drivMin: number | null;
}

/**
 * O kolik záznam ujel od plánované směny. `den` je den směny (planDate z API), bez něj
 * den příchodu. Konec přes půlnoc (konec ≤ začátek) je druhý den — konecSmeny. Do deseti
 * minut včetně se nic netvrdí (PRAH_POZDE_MIN), nad dvanáct hodin taky ne: to už je
 * jiná směna, ne zpoždění. Otevřený záznam odchod nemá, takže ani „dřív".
 */
export function odchylkaOdPlanu({ clockIn, clockOut, planStart, planEnd, den }: {
  clockIn: string | Date | null | undefined; clockOut?: string | Date | null; planStart?: string | null; planEnd?: string | null; den?: string | null;
}): OdchylkaOdPlanu {
  const out: OdchylkaOdPlanu = { pozdeMin: null, drivMin: null };
  const od = parseDbTime(clockIn ?? null);
  if (!od || !planStart) return out;
  const d = jeDen(den) ? den : pragueDayOf(od);
  const zacatek = pragueMomentOf(d, hm5(planStart));
  if (zacatek) {
    const r = od.getTime() - zacatek.getTime();
    const min = Math.round(r / 60000);
    if (r > 0 && r <= MAX_ODCHYLKA_MS && min > PRAH_POZDE_MIN) out.pozdeMin = min;
  }
  const odchod = parseDbTime(clockOut ?? null);
  const konec = konecSmeny(d, planStart, planEnd);
  if (odchod && konec) {
    const r = konec.getTime() - odchod.getTime();
    const min = Math.round(r / 60000);
    if (r > 0 && r <= MAX_ODCHYLKA_MS && min > PRAH_POZDE_MIN) out.drivMin = min;
  }
  return out;
}

export interface PlanZaznamu extends OdchylkaOdPlanu {
  /** Délka plánované směny (ms) — jen u prvního záznamu směny, ať se přestávka nepočítá jako druhá směna. */
  planMs: number;
  /** Odpracováno − plán v minutách za celou směnu (u prvního záznamu); null bez plánu nebo dokud směna běží. */
  rozdilMin: number | null;
}

/**
 * Odchylky od plánu pro všechny záznamy naráz (klíč = id záznamu). Záznamy jedné směny
 * (přestávka = odchod a nový příchod) se posuzují spolu: pozdě se počítá jen u prvního
 * příchodu, dřív jen u posledního odchodu a délka plánu jen jednou. Bez toho by návrat
 * z oběda ve 12:30 na směnu od osmi hlásil „+270 min pozdě" a plán se sečetl dvakrát.
 */
export function odchylkyZaznamu(entries: readonly ZaznamDochazky[], ted: number = Date.now()): Map<string, PlanZaznamu> {
  const skupiny = new Map<string, { e: ZaznamDochazky; od: Date; den: string }[]>();
  for (const e of entries) {
    if (e.id == null || !e.planStart) continue;
    const od = parseDbTime(e.clockIn);
    if (!od) continue;
    const den = jeDen(e.planDate) ? e.planDate : pragueDayOf(od);
    const k = `${e.employeeId ?? ''}|${den}|${hm5(e.planStart)}|${hm5(e.planEnd)}`;
    skupiny.set(k, [...(skupiny.get(k) ?? []), { e, od, den }]);
  }
  const out = new Map<string, PlanZaznamu>();
  for (const sk of skupiny.values()) {
    sk.sort((a, b) => a.od.getTime() - b.od.getTime());
    const { e: prvni, den } = sk[0];
    const posledni = sk[sk.length - 1].e;
    const zacatek = pragueMomentOf(den, hm5(prvni.planStart));
    const konec = konecSmeny(den, prvni.planStart, prvni.planEnd);
    const planMs = zacatek && konec ? Math.max(0, konec.getTime() - zacatek.getTime()) : 0;
    const rozbory = sk.map(x => rozeberZaznam(x.e, ted));
    const uzavrene = rozbory.every(z => z.druh === 'hotovy');
    const odpracovano = rozbory.reduce((a, z) => a + z.ms, 0);
    sk.forEach(({ e }, i) => {
      const o = odchylkaOdPlanu({ clockIn: e.clockIn, clockOut: e.clockOut, planStart: e.planStart, planEnd: e.planEnd, den });
      out.set(String(e.id), {
        pozdeMin: i === 0 ? o.pozdeMin : null,
        drivMin: e === posledni ? o.drivMin : null,
        planMs: i === 0 ? planMs : 0,
        rozdilMin: i === 0 && uzavrene && planMs > 0 ? Math.round((odpracovano - planMs) / 60000) : null,
      });
    });
  }
  return out;
}

/**
 * Sloupce CSV k plánu a ruční úpravě (pro účetní): Plán od, Plán do, Odchylka (min),
 * Poznámka, Upravil. Odchylka = odpracováno − plán za směnu (7shifts „Variance"),
 * se znaménkem; u druhého záznamu téže směny prázdná, ať se nesčítá dvakrát.
 */
export function csvPlanAUprava(e: ZaznamDochazky, p: PlanZaznamu | undefined): string[] {
  return [
    e.planStart ? hm5(e.planStart) : '',
    e.planEnd ? hm5(e.planEnd) : '',
    p?.rozdilMin != null ? String(p.rozdilMin) : '',
    String(e.note ?? '').trim(),
    e.updatedBy != null && e.updatedBy !== '' ? String(e.updatedByName ?? '').trim() : '',
  ];
}

/** Směna z rozvrhu pro Píchačky (GET /api/attendance, větev zaměstnance). */
export interface SmenaPichacek { shiftStart: string; shiftEnd: string; shiftDate: string }

/**
 * Kterou směnu ukázat v Píchačkách: dnešní první, ale noční směna ze včerejška
 * (konec ≤ začátek), která ještě neskončila — nebo ke které patří otevřený příchod —
 * má přednost. Ve 0:30 je barman pořád na sobotní noční, ne „dnes bez směny"
 * (DESIGN „Příchod po půlnoci patří včerejšku").
 */
export function vyberSmenuPichacek(
  smeny: readonly { date: string; start_time: string; end_time: string }[], dnes: string, ted: number, openSince?: string | Date | null,
): SmenaPichacek | null {
  const vcera = dayPlus(dnes, -1);
  const od = parseDbTime(openSince ?? null);
  for (const s of smeny) {
    if (String(s.date).slice(0, 10) !== vcera || !s.start_time || !s.end_time || hm5(s.end_time) > hm5(s.start_time)) continue;
    const zacatek = pragueMomentOf(vcera, hm5(s.start_time));
    const konec = konecSmeny(vcera, s.start_time, s.end_time);
    if (!zacatek || !konec) continue;
    const prichodPatri = !!od && od.getTime() >= zacatek.getTime() - PRED_ZACATKEM_MS && od.getTime() < konec.getTime();
    if (ted < konec.getTime() || prichodPatri) return { shiftStart: hm5(s.start_time), shiftEnd: hm5(s.end_time), shiftDate: vcera };
  }
  const dnesni = smeny.filter(s => String(s.date).slice(0, 10) === dnes && s.start_time).sort((a, b) => hm5(a.start_time).localeCompare(hm5(b.start_time)))[0];
  return dnesni ? { shiftStart: hm5(dnesni.start_time), shiftEnd: hm5(dnesni.end_time), shiftDate: dnes } : null;
}

export type StavPichacek = { druh: 'zacina'; min: number } | { druh: 'pozde'; min: number };

/**
 * Píchačky proti rozvrhu. Před příchodem: „Směna začíná za…" nejvýš tři hodiny předem.
 * Po příchodu: zpoždění proti začátku směny, jen nad deset minut (stejný práh jako tablet
 * a Docházka). `dnes` je den směny (shiftDate z API, i včerejšek u noční), takže příchod
 * ve 0:30 na směnu od 22:00 je +150 min, ne „o 21 h dřív".
 */
export function zpozdeniPichacek(dnes: string, shiftStart: string | null | undefined, openSince: string | Date | null | undefined, ted: number): StavPichacek | null {
  if (!shiftStart || !jeDen(dnes)) return null;
  const zacatek = pragueMomentOf(dnes, hm5(shiftStart));
  if (!zacatek) return null;
  const od = parseDbTime(openSince ?? null);
  if (od) {
    const r = od.getTime() - zacatek.getTime();
    const min = Math.round(r / 60000);
    return r > 0 && r <= MAX_ODCHYLKA_MS && min > PRAH_POZDE_MIN ? { druh: 'pozde', min } : null;
  }
  const za = zacatek.getTime() - ted;
  return za > 0 && za <= PRED_ZACATKEM_MS ? { druh: 'zacina', min: Math.ceil(za / 60000) } : null;
}

// ---------------------------------------------------------------------------
// Moje docházka po dnech (kolo 7, widget dochazka.moje_zaznamy)
// ---------------------------------------------------------------------------

export interface DenMojeDochazky {
  /** Pražský den příchodu „RRRR-MM-DD". */
  den: string;
  /** Příchody a odchody dne, od nejstaršího. */
  useky: { od: Date; do: Date | null }[];
  /** Započitatelný čas dne — stejná pravidla jako Odpracováno (mujMesic). */
  ms: number;
  bezi: boolean;
  /** Otevřený příchod déle než 16 h. */
  zapomenuty: boolean;
  /** Uzavřený záznam nad 24 h (nepočítá se). */
  dlouhy: boolean;
  /** Ručně přidaný (source 'manual') nebo upravený vedením (updatedBy). */
  rucne: boolean;
  poznamky: string[];
  /** Pauzy dne (kolo 8): součet mezer před záznamy se zdrojem 'break' (pauzyZeZaznamu). */
  pauzyMs: number;
}

/**
 * Vlastní docházka měsíce „RRRR-MM" po dnech, nejnovější den první. Jeden řádek na den
 * (přestávka nedělá z dne dva), součet `ms` je přesně číslo z Odpracováno — stejný
 * filtr (den příchodu v Praze) i stejná pravidla (zapomenutý ani nad 24 h se nepočítá).
 */
export function radkyMojeDochazky(entries: readonly ZaznamDochazky[], meId: number, mesic: string, ted: number): { dny: DenMojeDochazky[]; ms: number; pocet: number } {
  const dny = new Map<string, DenMojeDochazky>();
  let ms = 0, pocet = 0;
  const pauzy = pauzyZeZaznamu(entries);
  const pokracovani = pokracovaniPoPauze(entries);
  for (const e of entries) {
    if (Number(e.employeeId) !== meId) continue;
    const od = parseDbTime(e.clockIn);
    if (!od) continue;
    const den = pragueDayOf(od);
    if (den.slice(0, 7) !== mesic) continue;
    const z = rozeberZaznam(e, ted);
    if (z.druh === 'vadny') continue;
    if (!pokracovani.has(String(e.id ?? ''))) pocet += 1;
    ms += z.ms;
    const r = dny.get(den) ?? { den, useky: [], ms: 0, bezi: false, zapomenuty: false, dlouhy: false, rucne: false, poznamky: [], pauzyMs: 0 };
    r.useky.push({ od, do: parseDbTime(e.clockOut) });
    r.ms += z.ms;
    r.pauzyMs += pauzy.get(String(e.id ?? '')) ?? 0;
    if (z.druh === 'bezi') r.bezi = true;
    if (z.druh === 'zapomenuty') r.zapomenuty = true;
    if (z.druh === 'dlouhy') r.dlouhy = true;
    if (e.source === 'manual' || (e.updatedBy != null && e.updatedBy !== '')) r.rucne = true;
    const pozn = String(e.note ?? '').trim();
    if (pozn && !r.poznamky.includes(pozn)) r.poznamky.push(pozn);
    dny.set(den, r);
  }
  const out = [...dny.values()].sort((a, b) => b.den.localeCompare(a.den));
  for (const d of out) d.useky.sort((a, b) => a.od.getTime() - b.od.getTime());
  return { dny: out, ms, pocet };
}

/** Oříznutý seznam, který to řekne (DESIGN „Ořezané seznamy"): prvních `strop` a kolik zbylo. */
export function orizniSeznam<T>(polozky: readonly T[], strop: number): { zobrazene: T[]; dalsich: number } {
  const n = Math.max(0, Math.floor(strop));
  return { zobrazene: polozky.slice(0, n), dalsich: Math.max(0, polozky.length - n) };
}

// ---------------------------------------------------------------------------
// Výplaty (kolo 8, R8-1): pravidla dýška, příplatky, z kasy a doplatit, smlouvy, pauza
// ---------------------------------------------------------------------------
//
// Co tu je a proč:
//  - pravidla dýška (PravidlaDyska) — spropitneZaObdobi je dostane jako kontext; Finance, profil
//    i Výplatní listina tak dělí dýško stejně, a od stejného dne (platiOd);
//  - příplatky (priplatkyZaznamu) — záznam se rozloží po úsecích na víkend / noc / svátek, úsek
//    přes půlnoc se dělí; částka se zaokrouhlí po záznamu jako mzda (lib/wages);
//  - doplatit = mzda + příplatky + dýško + prémie − z kasy − už vyplaceno: dvojí výplata byla
//    skutečný peněžní bug („Moje výplata dnes" z uzávěrky se nikde neodečítala);
//  - smlouvy (DPP 300 h/rok, hranice odvodů) a pauza (dva záznamy, druhý se zdrojem 'break').

const jeDenRRRR = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const cisloNebo = (v: unknown, vychozi: number, min: number, max: number): number => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : vychozi;
};

// ---- Dýško ----

export type MetodaDyska = 'hodiny' | 'rovne' | 'vaha';

export interface PravidlaDyska {
  metoda: MetodaDyska;
  /** Váha pozice (job_title → 0–2) u metody 'vaha'; pozice bez záznamu má 1. */
  vahy: Record<string, number>;
  /** Id lidí, kteří se nedělí (vedení, dokud podnik nezapne „Dělit i s vedením"). Server je dosadí podle rolí. */
  vylouceni: string[];
  /** Dělit i s vedením (uloženo v podniku; `vylouceni` z toho server odvodí). */
  sVedenim: boolean;
  /** Od kterého dne pravidlo platí; starší uzávěrky se dělí postaru (null = odjakživa). */
  platiOd: string | null;
}

export const VYCHOZI_PRAVIDLA_DYSKA: PravidlaDyska = { metoda: 'hodiny', vahy: {}, vylouceni: [], sVedenim: true, platiOd: null };

/** Pravidla + pozice lidí (id → job_title) pro váhy. */
export interface KontextDyska { pravidla: PravidlaDyska; pozice?: ReadonlyMap<string, string> | null }

/** Pravidla z JSONB podniku (nebo z těla PUT) — vždy úplný a bezpečný tvar; nesmysl se zahodí na výchozí. */
export function normalizujPravidlaDyska(raw: unknown): PravidlaDyska {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const metoda: MetodaDyska = r.metoda === 'rovne' || r.metoda === 'vaha' ? r.metoda : 'hodiny';
  const vahy: Record<string, number> = {};
  if (r.vahy && typeof r.vahy === 'object') {
    for (const [k, v] of Object.entries(r.vahy as Record<string, unknown>).slice(0, 40)) {
      const pozice = String(k).trim().slice(0, 60);
      if (pozice) vahy[pozice] = Math.round(cisloNebo(v, 1, 0, 2) * 100) / 100;
    }
  }
  const vylouceni = Array.isArray(r.vylouceni) ? [...new Set(r.vylouceni.map(x => String(x)).filter(x => /^\d+$/.test(x)))].slice(0, 200) : [];
  return { metoda, vahy, vylouceni, sVedenim: r.sVedenim !== false, platiOd: jeDenRRRR(r.platiOd) ? r.platiOd : null };
}

// ---- Příplatky ----

export interface PravidlaPriplatku {
  vikend: boolean; vikendPct: number;
  noc: boolean; nocPct: number; nocOd: string; nocDo: string;
  svatek: boolean; svatekPct: number;
}

/** Výchozí podle zákoníku práce (§ 115–118, 126): So/Ne +10 %, noc 22–6 +10 %, svátek +100 %. Hodnoty jdou změnit. */
export const VYCHOZI_PRAVIDLA_PRIPLATKU: PravidlaPriplatku = { vikend: true, vikendPct: 10, noc: true, nocPct: 10, nocOd: '22:00', nocDo: '06:00', svatek: true, svatekPct: 100 };

const hmNebo = (v: unknown, vychozi: string) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : vychozi);

export function normalizujPravidlaPriplatku(raw: unknown): PravidlaPriplatku {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const V = VYCHOZI_PRAVIDLA_PRIPLATKU;
  return {
    vikend: r.vikend !== false, vikendPct: Math.round(cisloNebo(r.vikendPct, V.vikendPct, 0, 200)),
    noc: r.noc !== false, nocPct: Math.round(cisloNebo(r.nocPct, V.nocPct, 0, 200)), nocOd: hmNebo(r.nocOd, V.nocOd), nocDo: hmNebo(r.nocDo, V.nocDo),
    svatek: r.svatek !== false, svatekPct: Math.round(cisloNebo(r.svatekPct, V.svatekPct, 0, 300)),
  };
}

/** Žádný příplatek zapnutý — Výplatní listina pak sloupec ani neukáže. */
export function priplatkyVypnute(p: PravidlaPriplatku): boolean {
  return !(p.vikend && p.vikendPct > 0) && !(p.noc && p.nocPct > 0) && !(p.svatek && p.svatekPct > 0);
}

export interface RozpadPriplatku { vikendMs: number; nocMs: number; svatekMs: number; castka: number }

/** Je „HH:MM" v nočním okně od–do (okno přes půlnoc: 22:00–06:00)? */
export function jeNoc(hm: string, nocOd: string, nocDo: string): boolean {
  if (nocOd === nocDo) return false;
  return nocOd > nocDo ? hm >= nocOd || hm < nocDo : hm >= nocOd && hm < nocDo;
}

/**
 * Rozpad jednoho záznamu na víkendové, noční a sváteční minuty a příplatek v penězích. Jde po úsecích mezi
 * hranicemi (půlnoc, začátek a konec noci v pražském čase), takže noční směna přes půlnoc ze soboty na neděli
 * dostane sobotu i neděli správně. Příplatky se sčítají (sobotní noc = víkend + noc), jako v zákoníku.
 * Zapomenutý a nad 24 h záznam má 0 (rozeberZaznam), stejně jako ve mzdě.
 */
export function priplatkyZaznamu(e: Pick<ZaznamDochazky, 'clockIn' | 'clockOut'>, ted: number, sazba: number, pravidla: PravidlaPriplatku, svatek: (den: string) => boolean = jeSvatek): RozpadPriplatku {
  const out: RozpadPriplatku = { vikendMs: 0, nocMs: 0, svatekMs: 0, castka: 0 };
  const z = rozeberZaznam(e, ted);
  const od = parseDbTime(e.clockIn);
  if (!od || z.ms <= 0 || !(sazba > 0)) return out;
  const konec = od.getTime() + z.ms;
  let t = od.getTime();
  for (let krok = 0; t < konec && krok < 400; krok++) {
    const d = new Date(t);
    const den = pragueDayOf(d);
    const hm = pragueHM(d);
    const hranice = [pragueMomentOf(den, pravidla.nocOd), pragueMomentOf(den, pravidla.nocDo), pragueMomentOf(dayPlus(den, 1), '00:00')]
      .map(x => x?.getTime() ?? Infinity).filter(x => x > t);
    const dalsi = Math.min(konec, ...hranice);
    const ms = dalsi - t;
    if (pravidla.vikend && jeVikend(den)) out.vikendMs += ms;
    if (pravidla.noc && jeNoc(hm, pravidla.nocOd, pravidla.nocDo)) out.nocMs += ms;
    if (pravidla.svatek && svatek(den)) out.svatekMs += ms;
    t = dalsi;
  }
  const h = (ms: number) => ms / 3600_000;
  out.castka = Math.round(sazba * (h(out.vikendMs) * pravidla.vikendPct + h(out.nocMs) * pravidla.nocPct + h(out.svatekMs) * pravidla.svatekPct) / 100);
  return out;
}

// ---- Smlouvy ----

export type TypSmlouvy = 'HPP' | 'DPC' | 'DPP' | 'OSVC';
export const TYPY_SMLUV: readonly TypSmlouvy[] = ['HPP', 'DPC', 'DPP', 'OSVC'];
/** Roční strop hodin u jednoho zaměstnavatele na DPP (§ 75 zákoníku práce). */
export const LIMIT_DPP_HODIN = 300;

export function normalizujSmlouvu(raw: unknown): TypSmlouvy | null {
  return raw === 'HPP' || raw === 'DPC' || raw === 'DPP' || raw === 'OSVC' ? raw : null;
}

/** Název smlouvy pro Chip („DPČ" má háček, v databázi je bez něj). */
export function nazevSmlouvy(typ: TypSmlouvy): string {
  return typ === 'DPC' ? 'DPČ' : typ === 'OSVC' ? 'OSVČ' : typ;
}

export interface StavLimitu { odpracovanoH: number; limitH: number; pct: number; ton: 'ok' | 'wait' | 'bad' }

/** „Letos 262 / 300 h": od 85 % oranžově (wait), nad 100 % červeně (bad). Bez limitu (jiná smlouva) null. */
export function stavLimituHodin(odpracovanoMs: number, limitH: number | null | undefined): StavLimitu | null {
  if (!(Number(limitH) > 0)) return null;
  const odpracovanoH = Math.round(odpracovanoMs / 360_000) / 10;
  const pct = (odpracovanoH / Number(limitH)) * 100;
  return { odpracovanoH, limitH: Number(limitH), pct, ton: pct > 100 ? 'bad' : pct >= 85 ? 'wait' : 'ok' };
}

/** Hrubý výdělek z DPP za měsíc nad hranicí, od které se odvádí pojištění (hranici zadává podnik, mění se ročně). */
export function nadHraniciOdvodu(hruba: number, hranice: number | null | undefined, typ: TypSmlouvy | null | undefined): boolean {
  return typ === 'DPP' && Number(hranice) > 0 && hruba > Number(hranice);
}

// ---- Z kasy, vyplaceno, doplatit ----

/** Záznam o výplatě (payroll_payments), jak ho vrací GET /api/payroll. */
export interface Vyplata { id: number; amount: number; method: 'hotove' | 'ucet' | string | null; paidAt: string; od: string; do: string; note?: string | null }

/** Zamčené období (payroll_locks). */
export interface ZamekObdobi { id: number; od: string; do: string; lockedAt?: string | null; lockedBy?: number | null }

/** Výplata z kasy zapsaná v uzávěrce („Moje výplata dnes"). */
export interface VyplataZKasy { id: number; den: string; castka: number; kdo?: string | null }

/** Člověk, jak ho vrací GET /api/payroll (vedení). Peníze jen s finance.mzdy (jinak null / prázdné). */
export interface PayrollClovek {
  id: number | string; name?: string | null; avatar?: string | null; jobTitle?: string | null;
  contractType?: TypSmlouvy | null; contractHoursYear?: number | null;
  /** Odpracováno letos (ms, uzavřené záznamy do 24 h) — kvůli stropu DPP. */
  hodinyLetosMs?: number;
  zKasy?: number | null; zKasyPocet?: number; uzaverky?: VyplataZKasy[];
  vyplaceno?: number | null; vyplaty?: Vyplata[];
}

export interface CastkyVyplaty { mzda: number | null; priplatky: number; spropitne: number | null; upravy: number; zKasy: number; vyplaceno: number }

/** Kolik ještě doplatit: hrubá mzda + příplatky + dýško + prémie − srážky − co už odešlo z kasy − co je označené jako vyplacené. */
export function doplatit(c: CastkyVyplaty): number {
  return Math.round((c.mzda ?? 0) + c.priplatky + (c.spropitne ?? 0) + c.upravy - c.zKasy - c.vyplaceno);
}

export type StavVyplaty = 'vyplaceno' | 'ceka' | 'nic';

export interface RadekVyplaty extends RadekSouhrnu {
  pozice: string | null;
  smlouva: TypSmlouvy | null;
  limitHodin: number | null;
  hodinyLetosMs: number;
  zKasy: number;
  zKasyPocet: number;
  uzaverky: VyplataZKasy[];
  vyplaceno: number;
  vyplaty: Vyplata[];
  /** Hrubá mzda s příplatky a prémiemi (bez dýška) — hranice odvodů z DPP se posuzuje z ní. */
  hruba: number;
  doplatit: number;
  stav: StavVyplaty;
}

/**
 * Řádky Výplatní listiny: souhrn hodin (hodiny, mzda, dýško, prémie) spojený s tím, co ví server
 * (z kasy, vyplaceno, smlouva). Lidé bez záznamu v období, ale s výplatou z kasy, dostanou řádek taky —
 * jinak by se peníze, které odešly, ztratily ze součtu.
 */
export function vyplatniListina(radky: readonly RadekSouhrnu[], lide: readonly PayrollClovek[]): RadekVyplaty[] {
  const podle = new Map(lide.map(l => [String(l.id), l]));
  const out = new Map<string, RadekVyplaty>();
  const slozit = (r: RadekSouhrnu, l: PayrollClovek | undefined): RadekVyplaty => {
    const zKasy = Math.round(Number(l?.zKasy) || 0);
    const vyplaceno = Math.round(Number(l?.vyplaceno) || 0);
    const hruba = (r.mzda ?? 0) + r.priplatky + r.upravy;
    const d = doplatit({ mzda: r.mzda, priplatky: r.priplatky, spropitne: r.spropitne, upravy: r.upravy, zKasy, vyplaceno });
    const maCo = r.ms > 0 || r.upravy !== 0 || (r.spropitne ?? 0) > 0 || zKasy > 0;
    return {
      ...r,
      pozice: l?.jobTitle ?? null, smlouva: normalizujSmlouvu(l?.contractType), limitHodin: Number(l?.contractHoursYear) > 0 ? Number(l?.contractHoursYear) : null,
      hodinyLetosMs: Number(l?.hodinyLetosMs) || 0,
      zKasy, zKasyPocet: Number(l?.zKasyPocet) || (l?.uzaverky?.length ?? 0), uzaverky: l?.uzaverky ?? [],
      vyplaceno, vyplaty: l?.vyplaty ?? [], hruba, doplatit: d,
      stav: vyplaceno > 0 ? 'vyplaceno' : maCo ? 'ceka' : 'nic',
    };
  };
  for (const r of radky) out.set(r.id, slozit(r, podle.get(r.id)));
  for (const l of lide) {
    const id = String(l.id);
    if (out.has(id) || !((Number(l.zKasy) || 0) > 0 || (Number(l.vyplaceno) || 0) > 0)) continue;
    out.set(id, slozit({ id, jmeno: String(l.name ?? ''), avatar: l.avatar ?? null, ms: 0, pocet: 0, bezi: false, vynechano: 0, mzda: null, spropitne: null, upravy: 0, priplatky: 0, priplatkyMs: { vikend: 0, noc: 0, svatek: 0 }, vyplata: null, planMs: 0, pozde: 0 }, l));
  }
  return [...out.values()];
}

export type RazeniListiny = 'jmeno' | 'hodiny' | 'mzda' | 'doplatit' | 'spropitne' | 'zKasy' | 'pocet';

export function seradListinu(radky: readonly RadekVyplaty[], klic: RazeniListiny, sestupne: boolean): RadekVyplaty[] {
  const r = [...radky];
  const cislo = (x: RadekVyplaty): number => klic === 'hodiny' ? x.ms : klic === 'mzda' ? x.mzda ?? -1 : klic === 'doplatit' ? x.doplatit : klic === 'spropitne' ? x.spropitne ?? -1 : klic === 'zKasy' ? x.zKasy : x.pocet;
  r.sort((a, b) => {
    if (klic === 'jmeno') return a.jmeno.localeCompare(b.jmeno, 'cs') * (sestupne ? -1 : 1);
    return (cislo(b) - cislo(a)) * (sestupne ? 1 : -1) || a.jmeno.localeCompare(b.jmeno, 'cs');
  });
  return r;
}

export interface SoucetListiny { ms: number; planMs: number; pocet: number; mzda: number; priplatky: number; spropitne: number; upravy: number; zKasy: number; vyplaceno: number; doplatit: number; bezSazby: number }

export function soucetListiny(radky: readonly RadekVyplaty[]): SoucetListiny {
  const s: SoucetListiny = { ms: 0, planMs: 0, pocet: 0, mzda: 0, priplatky: 0, spropitne: 0, upravy: 0, zKasy: 0, vyplaceno: 0, doplatit: 0, bezSazby: 0 };
  for (const r of radky) {
    s.ms += r.ms; s.planMs += r.planMs; s.pocet += r.pocet; s.mzda += r.mzda ?? 0; s.priplatky += r.priplatky; s.spropitne += r.spropitne ?? 0;
    s.upravy += r.upravy; s.zKasy += r.zKasy; s.vyplaceno += r.vyplaceno; s.doplatit += r.doplatit;
    if (r.mzda == null && r.ms > 0) s.bezSazby += 1;
  }
  return s;
}

/** „H:MM" pro CSV (účetní sčítá sloupec) — stejný tvar jako Export CSV Docházky. */
export function hMM(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * CSV pro účetní: jeden řádek na člověka (sloupce listiny) a řádek Celkem. Hlavička česky — soubor jde
 * účetní, ne zaměstnanci; měna jako symbol v hlavičce sloupce, čísla holá, ať je Excel sečte.
 */
export function csvVyplatniListiny(radky: readonly RadekVyplaty[], o: { od: string; do: string; symbol: string; sazby?: ReadonlyMap<string, number>; priplatky: boolean; spropitne: boolean; smlouvy: boolean }): string[][] {
  const s = o.symbol;
  const hlava = ['Jméno', 'Pozice', ...(o.smlouvy ? ['Smlouva'] : []), 'Směny', 'Hodiny', 'Plán', `Sazba (${s})`, `Mzda (${s})`, ...(o.priplatky ? [`Příplatky (${s})`] : []), ...(o.spropitne ? [`Spropitné (${s})`] : []), `Prémie a srážky (${s})`, `Z kasy (${s})`, `Vyplaceno (${s})`, `Doplatit (${s})`, 'Stav', 'Období'];
  const cislo = (n: number | null | undefined) => (n == null ? '' : String(Math.round(n)));
  const stav = (r: RadekVyplaty) => r.stav === 'vyplaceno' ? `vyplaceno ${r.vyplaty.map(v => v.paidAt).filter(Boolean).join(', ')}`.trim() : r.stav === 'ceka' ? 'čeká' : '';
  const radek = (r: RadekVyplaty) => [
    r.jmeno, r.pozice ?? '', ...(o.smlouvy ? [r.smlouva ? nazevSmlouvy(r.smlouva) : ''] : []), String(r.pocet), hMM(r.ms), r.planMs > 0 ? hMM(r.planMs) : '',
    cislo(o.sazby?.get(r.id) ?? null), cislo(r.mzda), ...(o.priplatky ? [cislo(r.priplatky)] : []), ...(o.spropitne ? [cislo(r.spropitne)] : []),
    cislo(r.upravy), cislo(r.zKasy), cislo(r.vyplaceno), cislo(r.doplatit), stav(r), `${o.od} – ${o.do}`,
  ];
  const c = soucetListiny(radky);
  const celkem = ['Celkem', '', ...(o.smlouvy ? [''] : []), String(c.pocet), hMM(c.ms), c.planMs > 0 ? hMM(c.planMs) : '', '', cislo(c.mzda), ...(o.priplatky ? [cislo(c.priplatky)] : []), ...(o.spropitne ? [cislo(c.spropitne)] : []), cislo(c.upravy), cislo(c.zKasy), cislo(c.vyplaceno), cislo(c.doplatit), '', ''];
  return [hlava, ...radky.map(radek), celkem];
}

/** Buňky → text CSV se středníkem a BOM pro Excel (stejně jako Export CSV Docházky). */
export function csvText(radky: readonly string[][]): string {
  return '﻿' + radky.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
}

/** Je období <od, do> celé uvnitř některého zámku? Zamčené období se v UI neupravuje (tvrdé odmítnutí patří API docházky). */
export function obdobiZamceno(zamky: readonly ZamekObdobi[], od: string, doD: string): ZamekObdobi | null {
  return zamky.find(z => z.od <= od && z.do >= doD) ?? null;
}

/** Je den uvnitř některého zámku? */
export function denZamcen(zamky: readonly ZamekObdobi[], den: string): boolean {
  return zamky.some(z => z.od <= den && z.do >= den);
}

export interface MesicVyplaty { mesic: string; od: string; do: string; vyplaceno: number; vyplaty: Vyplata[]; zamceno: boolean; bezi: boolean }

/**
 * Pás měsíců pro Můj výdělek (nejnovější první): tento měsíc „běží", starší s tím, co je označené jako vyplacené
 * (součet výplat, jejichž období leží v měsíci) a jestli je měsíc uzavřený.
 */
export function mesiceVyplat(dnes: string, vyplaty: readonly Vyplata[], zamky: readonly ZamekObdobi[], pocet = 4): MesicVyplaty[] {
  const out: MesicVyplaty[] = [];
  let [r, m] = [Number(dnes.slice(0, 4)), Number(dnes.slice(5, 7))];
  for (let i = 0; i < Math.max(1, pocet); i++) {
    const mesic = `${r}-${String(m).padStart(2, '0')}`;
    const od = `${mesic}-01`;
    const doD = dayPlus(`${m === 12 ? r + 1 : r}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
    const v = vyplaty.filter(x => x.od >= od && x.do <= doD);
    out.push({ mesic, od, do: doD, vyplaceno: v.reduce((a, x) => a + (Number(x.amount) || 0), 0), vyplaty: v, zamceno: !!obdobiZamceno(zamky, od, doD), bezi: i === 0 });
    if (m === 1) { m = 12; r -= 1; } else m -= 1;
  }
  return out;
}

// ---- Pauza ----

/** Po tolika hodinách práce bez pauzy se při odchodu ptáme „Měl/a jsi pauzu?" (zákoník: 30 min nejdéle po 6 h). */
export const POVINNA_PAUZA_PO_MS = 6 * 3600_000;
export const PAUZA_MIN = 30;

/**
 * Pauzy ze záznamů: záznam se zdrojem 'break' je záznam PO pauze; délka pauzy je mezera mezi odchodem záznamu
 * před ní (`breakAfter`, nebo — API ho zatím neposílá — nejbližší předchozí odchod téhož člověka) a jeho příchodem.
 * Klíč = id záznamu po pauze (řádek dne si ji přičte). Otevřená (ještě běžící) pauza se nepočítá.
 */
export function pauzyZeZaznamu(entries: readonly ZaznamDochazky[]): Map<string, number> {
  const podleId = mapaPodleId(entries);
  const out = new Map<string, number>();
  for (const e of entries) {
    if (e.source !== 'break' || e.id == null || jeOtevrenaPauza(e)) continue;
    const ms = delkaPauzyPred(e, zaznamPredPauzou(entries, e, podleId));
    if (ms > 0) out.set(String(e.id), ms);
  }
  return out;
}

/** Nejdelší mezera, kterou ještě bereme jako pauzu (jako server: otevřená pauza platí 12 h). */
const MAX_PAUZA_MS = 12 * 3600_000;
/** Pojistka proti zacyklení řetězu záznamů (break_after ukazující do kruhu). */
const MAX_CLANKU = 24;

function mapaPodleId<T extends ZaznamDochazky>(entries: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const e of entries) if (e.id != null) m.set(String(e.id), e);
  return m;
}

/**
 * Záznam před pauzou k záznamu po ní (source 'break'): podle `breakAfter`, nebo — API ho dřív neposílalo —
 * nejbližší předchozí odchod téhož člověka do 12 h. U jiného zdroje undefined.
 */
export function zaznamPredPauzou<T extends ZaznamDochazky>(entries: readonly T[], e: T, podleId: ReadonlyMap<string, T> = mapaPodleId(entries)): T | undefined {
  if (e.source !== 'break') return undefined;
  const pred = e.breakAfter != null ? podleId.get(String(e.breakAfter)) : undefined;
  if (pred && pred !== e) return pred;
  const doD = parseDbTime(e.clockIn);
  if (!doD) return undefined;
  let nej: { e: T; od: number } | null = null;
  for (const x of entries) {
    if (x === e || String(x.employeeId ?? '') !== String(e.employeeId ?? '')) continue;
    const odchod = parseDbTime(x.clockOut);
    if (!odchod || odchod.getTime() > doD.getTime() || doD.getTime() - odchod.getTime() > MAX_PAUZA_MS) continue;
    // Nulová otevřená pauza (příchod = odchod) není záznam před pauzou.
    if (jeOtevrenaPauza(x)) continue;
    if (!nej || odchod.getTime() > nej.od) nej = { e: x, od: odchod.getTime() };
  }
  return nej?.e;
}

/** Délka skončené pauzy před záznamem `e` (mezera od odchodu `pred`); 0, když nedává smysl. */
function delkaPauzyPred(e: ZaznamDochazky, pred: ZaznamDochazky | undefined): number {
  if (!pred || jeOtevrenaPauza(e)) return 0;
  const od = parseDbTime(pred.clockOut ?? null), doD = parseDbTime(e.clockIn);
  if (!od || !doD) return 0;
  const ms = doD.getTime() - od.getTime();
  return ms > 0 && ms < MAX_PAUZA_MS ? ms : 0;
}

/**
 * Ids záznamů, které jen POKRAČUJÍ směnu po pauze (záznam po pauze, jehož záznam před pauzou je v seznamu),
 * a otevřených pauz (nulová délka). Počty směn je nepočítají: směna s pauzou je jedna směna, ne dvě.
 * Záznam po pauze bez záznamu před ní v seznamu (ten padl do jiného období) se počítá jako směna období.
 */
export function pokracovaniPoPauze(entries: readonly ZaznamDochazky[]): Set<string> {
  const podleId = mapaPodleId(entries);
  const out = new Set<string>();
  for (const e of entries) {
    if (e.source !== 'break' || e.id == null) continue;
    if (jeOtevrenaPauza(e) || zaznamPredPauzou(entries, e, podleId)) out.add(String(e.id));
  }
  return out;
}

export interface SmenaClena<T extends ZaznamDochazky = ZaznamDochazky> {
  /** Záznam, který teď běží (odchod zavře jeho), nebo otevřená pauza. */
  zaznam: T;
  /** Právě běží pauza. */
  naPauze: boolean;
  /** Od kdy běží pauza (jen na pauze). */
  pauzaOd: Date | null;
  /** Začátek směny: první příchod před všemi pauzami. */
  zacatek: Date;
  /** Součet skončených pauz směny (běžící pauza ne). */
  pauzyMs: number;
  /** Odpracováno ve směně do `ted` — bez pauz, stejná pravidla jako hodiny (rozeberZaznam). */
  odpracovanoMs: number;
  /** Záznamy směny od prvního (příchod) po běžící. */
  casti: T[];
}

/**
 * Běžící směna člověka i s pauzami. Pauza v databázi je mezera mezi dvěma záznamy (záznam po pauze má zdroj
 * 'break' a `breakAfter`), takže po „Konec pauzy" běží záznam, jehož příchod je konec pauzy. Píchačky a tablet
 * z něj dřív ukazovaly „Příchod 12:30" se stopkami od nuly — jako novou směnu. Tady se řetěz projde zpátky
 * k prvnímu příchodu: začátek směny, skončené pauzy a odpracovaný čas bez nich. Otevřená pauza platí 12 h
 * (jako server). Bez běžící směny ani pauzy null.
 */
export function smenaClena<T extends ZaznamDochazky>(entries: readonly T[], employeeId: number | string, ted: number): SmenaClena<T> | null {
  const kdo = String(employeeId);
  let bezi: { e: T; od: number } | null = null;
  for (const e of entries) {
    if (String(e.employeeId ?? '') !== kdo) continue;
    const od = parseDbTime(e.clockIn)?.getTime();
    if (od == null) continue;
    const pauza = jeOtevrenaPauza(e);
    if (e.clockOut && !pauza) continue;
    if (pauza && ted - od > MAX_PAUZA_MS) continue;
    if (!bezi || od > bezi.od) bezi = { e, od };
  }
  if (!bezi) return null;
  const podleId = mapaPodleId(entries);
  const casti: T[] = [bezi.e];
  let pauzyMs = 0;
  let cur = bezi.e;
  for (let i = 0; i < MAX_CLANKU; i++) {
    const pred = zaznamPredPauzou(entries, cur, podleId);
    if (!pred || casti.includes(pred)) break;
    pauzyMs += delkaPauzyPred(cur, pred);
    casti.unshift(pred);
    cur = pred;
  }
  const naPauze = jeOtevrenaPauza(bezi.e);
  const zacatek = parseDbTime(casti[0].clockIn) ?? new Date(bezi.od);
  const odpracovanoMs = casti.reduce((a, x) => a + rozeberZaznam(x, ted).ms, 0);
  return { zaznam: bezi.e, naPauze, pauzaOd: naPauze ? new Date(bezi.od) : null, zacatek, pauzyMs, odpracovanoMs, casti };
}

/** Řádek rosteru s běžící směnou (GET /api/attendance): příchod běžícího záznamu, začátek směny a pauzy. */
export interface SmenaVRosteru {
  openSince?: string | Date | null;
  /** Začátek směny (první příchod před pauzami); starší server ho neposílá. */
  shiftSince?: string | Date | null;
  /** Skončené pauzy směny v ms. */
  breakMs?: number | null;
  /** Běžící pauza od (na pauze je openSince null). */
  breakSince?: string | Date | null;
}

/**
 * Odpracováno v běžící směně z řádku rosteru (Píchačky vedení, tablet): od začátku směny do teď — na pauze do
 * začátku pauzy — bez skončených pauz. Bez `shiftSince` (starší server) od příchodu běžícího záznamu.
 */
export function odpracovanoVeSmene(r: SmenaVRosteru, ted: number): number {
  const prichod = parseDbTime(r.openSince ?? null);
  const pauzaOd = !prichod ? parseDbTime(r.breakSince ?? null) : null;
  const od = parseDbTime(r.shiftSince ?? null) ?? prichod;
  if (!od || (!prichod && !pauzaOd)) return 0;
  const konec = pauzaOd ? pauzaOd.getTime() : ted;
  return Math.max(0, konec - od.getTime() - Math.max(0, Number(r.breakMs) || 0));
}

export interface StavPauzy {
  /** Právě běží pauza: dnešní záznam se zdrojem 'break' s odchodem rovným příchodu (server ho při „Konec pauzy" otevře). */
  naPauze: boolean;
  /** Od kdy pauza běží (příchod toho záznamu), jinak null. */
  pauzaOd: Date | null;
  /** Odpracováno dnes (ms, uzavřené i běžící záznamy dne). */
  dnesMs: number;
  /** Dnes už nějaká dokončená pauza byla. */
  melPauzu: boolean;
  /** Při odchodu se zeptat „Měl/a jsi pauzu?": víc než 6 h bez pauzy. */
  zeptatSe: boolean;
}

/**
 * Pauza v databázi (kolo 8): „Pauza" zavře běžící záznam a založí záznam po pauze se zdrojem 'break'
 * a `breakAfter`, zatím s odchodem rovným příchodu (nulová délka — do hodin ani do mzdy se nikde
 * nepočítá, rozeberZaznam ji má za vadnou). „Konec pauzy" mu posune příchod na teď a odchod smaže,
 * takže od té chvíle je to obyčejný běžící záznam. Hodiny se tím nemění: pauza je mezera mezi záznamy.
 */
export function jeOtevrenaPauza(e: Pick<ZaznamDochazky, 'clockIn' | 'clockOut' | 'source'>): boolean {
  if (e.source !== 'break' || !e.clockOut) return false;
  const od = parseDbTime(e.clockIn), doD = parseDbTime(e.clockOut);
  return !!od && !!doD && od.getTime() === doD.getTime();
}

/** Stav pauzy pro Píchačky z vlastních záznamů dne (den příchodu v Praze = `dnes`). */
export function stavPauzy(entries: readonly ZaznamDochazky[], meId: number, dnes: string, ted: number): StavPauzy {
  let dnesMs = 0, melPauzu = false, naPauze = false, pauzaOd: Date | null = null;
  for (const e of entries) {
    if (Number(e.employeeId) !== meId) continue;
    const od = parseDbTime(e.clockIn);
    if (!od || pragueDayOf(od) !== dnes) continue;
    if (jeOtevrenaPauza(e)) { naPauze = true; pauzaOd = od; continue; }
    if (e.source === 'break') melPauzu = true;
    dnesMs += rozeberZaznam(e, ted).ms;
  }
  return { naPauze, pauzaOd, dnesMs, melPauzu, zeptatSe: !melPauzu && !naPauze && dnesMs > POVINNA_PAUZA_PO_MS };
}

/**
 * Doplnění pauzy při odchodu („Ano, 30 min"): směna se rozdělí v polovině na dva záznamy s mezerou `minut`.
 * Vrátí konec prvního a začátek druhého záznamu; u směny kratší než dvojnásobek pauzy se nedělí (null).
 */
export function rozdelProPauzu(od: Date, ted: number, minut: number = PAUZA_MIN): { konecA: Date; zacatekB: Date } | null {
  const delka = ted - od.getTime();
  const pauza = minut * 60_000;
  if (delka <= pauza * 2) return null;
  const stred = od.getTime() + delka / 2;
  return { konecA: new Date(stred - pauza / 2), zacatekB: new Date(stred + pauza / 2) };
}
