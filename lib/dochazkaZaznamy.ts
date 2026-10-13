// Záznamy docházky (nástroj vedení, kolo 8, R8-2) — čistá logika bez Reactu, ať ji hlídá
// `npm test` (scripts/testy/k84-dochazka.ts) a komponenta components/employer/Attendance.tsx jen kreslí.
//
// Co tu je a proč:
//  - řádek seznamu: záznam před pauzou a záznam po ní (source 'break', break_after) se spojí do jednoho
//    řádku „9:02 – 17:31 · pauza 30 min" — dva nesouvisející řádky bez vysvětlení Martina mátly;
//  - pásy filtru s počty („Eva · 12", „Barista · 41") a „Jen k ověření" (zapomenutý odchod, pozdě, dřív,
//    poznámka ze samoobsluhy, nad 24 h, mimo podnik) — DESIGN „Filtrovací pás";
//  - souhrn vybraného člověka (hodiny, směny, pozdě, pauzy) a sloupce CSV navíc (Pauza, Poloha);
//  - zámek období (payroll_locks): popis období pro hlášku „Září je uzavřené — otevři ho ve Výplatní listině",
//    tutéž větu říká server (409) i nástroj.
//
// Relativní importy s příponou: `npm test` pouští .ts přímo v Node.

import { parseDbTime, pragueDayOf } from './pragueTime.ts';
import { denZamcen, jeOtevrenaPauza, rozeberZaznam, type DruhZaznamu, type PlanZaznamu, type ZamekObdobi, type ZaznamDochazky } from './dochazkaPrehled.ts';
import type { StavPolohy } from './geoPichani.ts';

/** Záznam z GET /api/attendance (vedení) i s tím, co přibylo v kole 8: poloha, offline, pauza. */
export interface ZaznamSeStavem extends ZaznamDochazky {
  geoStatus?: StavPolohy | null;
  geoDistanceM?: number | null;
  offline?: boolean | null;
}

/** Jeden řádek seznamu: směna s pauzami jako jeden kus. */
export interface RadekZaznamu<T extends ZaznamSeStavem = ZaznamSeStavem> {
  /** Záznam, podle kterého se řádek jmenuje: první část směny (před pauzou), nebo jediný. */
  hlavni: T;
  /** Všechny části v pořadí (první = hlavní); u směny bez pauzy jedna. */
  casti: T[];
  /** Příchod první části a odchod poslední (null = běží nebo na pauze). */
  clockIn: string;
  clockOut: string | null;
  /** Součet pauz (ms) — mezery mezi částmi; běžící pauza se nepočítá. */
  pauzaMs: number;
  /** Poslední část je otevřená pauza (odchod = příchod): člověk je právě na pauze. */
  naPauze: boolean;
  /** Od kdy pauza běží (příchod otevřené pauzy). */
  pauzaOd: string | null;
  /** Druh podle poslední skutečné části (běží / zapomenutý / hotový…), délka a započitatelný čas za celou směnu. */
  druh: DruhZaznamu;
  ms: number;
  delka: number;
}

const MAX_MEZERA_PAUZY_MS = 12 * 3600_000;

/**
 * Spojí záznamy jedné směny kolem pauz do řádků. Záznam po pauze ukazuje na ten před ní (`breakAfter`);
 * bez odkazu (starší API) se vezme nejbližší předchozí uzavřený záznam téhož člověka do 12 h. Řetězí se
 * i víc pauz za den (A → B → C). Pořadí řádků = pořadí hlavních záznamů ve vstupu (API řadí od nejnovějšího).
 */
export function radkyZaznamu<T extends ZaznamSeStavem>(entries: readonly T[], ted: number): RadekZaznamu<T>[] {
  const podleId = new Map<string, T>();
  for (const e of entries) if (e.id != null) podleId.set(String(e.id), e);
  // Pro každý záznam po pauze najdi předchůdce; klíč = id předchůdce → záznam po pauze.
  const dalsi = new Map<string, T>();
  const spotrebovane = new Set<T>();
  for (const e of entries) {
    if (e.source !== 'break') continue;
    const doD = parseDbTime(e.clockIn);
    if (!doD) continue;
    let pred: T | undefined = e.breakAfter != null ? podleId.get(String(e.breakAfter)) : undefined;
    if (pred === e) pred = undefined;
    if (!pred) {
      let nej: { e: T; od: number } | null = null;
      for (const x of entries) {
        if (x === e || String(x.employeeId ?? '') !== String(e.employeeId ?? '')) continue;
        const odchod = parseDbTime(x.clockOut);
        if (!odchod || odchod.getTime() > doD.getTime() || doD.getTime() - odchod.getTime() > MAX_MEZERA_PAUZY_MS) continue;
        if (jeOtevrenaPauza(x)) continue;
        if (!nej || odchod.getTime() > nej.od) nej = { e: x, od: odchod.getTime() };
      }
      pred = nej?.e;
    }
    if (!pred || pred.id == null || dalsi.has(String(pred.id))) continue;
    dalsi.set(String(pred.id), e);
    spotrebovane.add(e);
  }
  const out: RadekZaznamu<T>[] = [];
  for (const e of entries) {
    if (spotrebovane.has(e)) continue;
    const casti: T[] = [e];
    let posledni = e;
    const videno = new Set<T>([e]);
    while (posledni.id != null) {
      const n = dalsi.get(String(posledni.id));
      if (!n || videno.has(n)) break;
      casti.push(n); videno.add(n); posledni = n;
    }
    const naPauze = jeOtevrenaPauza(posledni);
    const skutecne = naPauze ? casti.slice(0, -1) : casti;
    let pauzaMs = 0;
    for (let i = 1; i < skutecne.length; i++) {
      const a = parseDbTime(skutecne[i - 1].clockOut), b = parseDbTime(skutecne[i].clockIn);
      if (a && b && b.getTime() > a.getTime()) pauzaMs += b.getTime() - a.getTime();
    }
    const rozbory = skutecne.map(x => rozeberZaznam(x, ted));
    const konec = skutecne[skutecne.length - 1] ?? e;
    const druh = rozbory.length ? rozbory[rozbory.length - 1].druh : 'vadny';
    out.push({
      hlavni: e, casti, clockIn: e.clockIn,
      clockOut: naPauze ? null : konec.clockOut,
      pauzaMs, naPauze, pauzaOd: naPauze ? posledni.clockIn : null,
      druh,
      ms: rozbory.reduce((a, z) => a + z.ms, 0),
      delka: rozbory.reduce((a, z) => a + z.delka, 0),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Co je k ověření
// ---------------------------------------------------------------------------

export interface PriznakyRadku {
  zapomenuty: boolean;
  pozdeMin: number | null;
  drivMin: number | null;
  /** Poznámka ze samoobsluhy (bez ruční úpravy) — vedoucí má zkontrolovat. */
  poznamka: boolean;
  upraveno: boolean;
  dlouhy: boolean;
  mimoPodnik: boolean;
  bezPolohy: boolean;
  uPodniku: boolean;
  offline: boolean;
  pauza: boolean;
  /** Pauza začala a nikdo ji neukončil (déle než 12 h) — server už ji nenajde, vedoucí ji má dořešit. */
  pauzaBezKonce: boolean;
}

/** Po tolika hodinách je otevřená pauza „neukončená" (stejné okno, v jakém ji server ještě umí ukončit). */
export const PAUZA_BEZ_KONCE_MS = 12 * 3600_000;

const maUpravu = (e: ZaznamDochazky) => e.updatedBy != null && e.updatedBy !== '';

/** Stav řádku z jeho částí a z odchylek od plánu (lib/dochazkaPrehled.odchylkyZaznamu, klíč = id záznamu). */
export function priznakyRadku(r: RadekZaznamu, plany: ReadonlyMap<string, PlanZaznamu>, ted: number): PriznakyRadku {
  const o = plany.get(String(r.hlavni.id));
  const pauzaOd = parseDbTime(r.pauzaOd);
  const posledniPlan = r.casti.length > 1 ? plany.get(String(r.casti[r.casti.length - 1].id)) : undefined;
  const upraveno = r.casti.some(maUpravu);
  return {
    zapomenuty: r.druh === 'zapomenuty',
    pozdeMin: o?.pozdeMin ?? null,
    drivMin: posledniPlan?.drivMin ?? o?.drivMin ?? null,
    poznamka: !upraveno && r.casti.some(c => !!String(c.note ?? '').trim()),
    upraveno,
    dlouhy: r.druh === 'dlouhy',
    mimoPodnik: r.casti.some(c => c.geoStatus === 'far'),
    bezPolohy: r.hlavni.geoStatus === 'missing',
    uPodniku: r.hlavni.geoStatus === 'ok',
    offline: r.casti.some(c => c.offline === true),
    pauza: r.pauzaMs > 0 || r.naPauze,
    pauzaBezKonce: r.naPauze && !!pauzaOd && ted - pauzaOd.getTime() > PAUZA_BEZ_KONCE_MS,
  };
}

/** Řádek patří do „Jen k ověření": něco v něm vedoucí má posoudit, než jde do mzdy. */
export function kOvereni(p: PriznakyRadku): boolean {
  return p.zapomenuty || p.pozdeMin != null || p.drivMin != null || p.poznamka || p.dlouhy || p.mimoPodnik || p.pauzaBezKonce;
}

// ---------------------------------------------------------------------------
// Pásy filtru s počty
// ---------------------------------------------------------------------------

export interface PolozkaPasu { id: string; nazev: string; avatar?: string | null; pocet: number }

export interface FiltrZaznamu {
  /** id člověka ('' = všichni). */
  clovek: string;
  /** Pozice ('' = všechny; 'bez' = lidé bez pozice). */
  pozice: string;
  jenKOvereni: boolean;
}

export const BEZ_POZICE = 'bez';
export const VYCHOZI_FILTR: FiltrZaznamu = { clovek: '', pozice: '', jenKOvereni: false };

/** Lidé s počtem směn (řádků) v období, nejvíc směn nahoře; jméno z řádku (API ho nese), avatar z rosteru. */
export function pasLidi(radky: readonly RadekZaznamu[], roster: readonly { id: number | string; name?: string; avatar?: string | null }[]): PolozkaPasu[] {
  const m = new Map<string, PolozkaPasu>();
  for (const r of radky) {
    const id = String(r.hlavni.employeeId ?? '');
    if (!id) continue;
    const z = m.get(id);
    if (z) { z.pocet++; continue; }
    const clen = roster.find(x => String(x.id) === id);
    m.set(id, { id, nazev: r.hlavni.employeeName || clen?.name || `#${id}`, avatar: r.hlavni.employeeAvatar ?? clen?.avatar ?? null, pocet: 1 });
  }
  return [...m.values()].sort((a, b) => b.pocet - a.pocet || a.nazev.localeCompare(b.nazev, 'cs'));
}

/** Pozice (team_members.job_title) s počtem směn; lidé bez pozice pod klíčem BEZ_POZICE (název doplní UI). */
export function pasPozic(radky: readonly RadekZaznamu[], pozice: ReadonlyMap<string, string>): PolozkaPasu[] {
  const m = new Map<string, PolozkaPasu>();
  for (const r of radky) {
    const id = String(r.hlavni.employeeId ?? '');
    const p = (pozice.get(id) ?? '').trim();
    const k = p || BEZ_POZICE;
    const z = m.get(k);
    if (z) z.pocet++;
    else m.set(k, { id: k, nazev: p, pocet: 1 });
  }
  return [...m.values()].sort((a, b) => (a.id === BEZ_POZICE ? 1 : 0) - (b.id === BEZ_POZICE ? 1 : 0) || b.pocet - a.pocet || a.nazev.localeCompare(b.nazev, 'cs'));
}

/** Pozice z rosteru (id → job_title). */
export function poziceZRosteru(roster: readonly { id: number | string; jobTitle?: string | null }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of roster) if (r.jobTitle && String(r.jobTitle).trim()) m.set(String(r.id), String(r.jobTitle).trim());
  return m;
}

/** Řádky po filtru (člověk, pozice, jen k ověření) a hledání podle jména (`obsahuje` z lib/hledani, předané zvenčí). */
export function filtrujRadky<T extends ZaznamSeStavem>(
  radky: readonly RadekZaznamu<T>[], f: FiltrZaznamu, pozice: ReadonlyMap<string, string>,
  priznaky: (r: RadekZaznamu<T>) => PriznakyRadku, hledani?: (r: RadekZaznamu<T>) => boolean,
): RadekZaznamu<T>[] {
  return radky.filter(r => {
    const id = String(r.hlavni.employeeId ?? '');
    if (f.clovek && id !== f.clovek) return false;
    if (f.pozice) {
      const p = (pozice.get(id) ?? '').trim();
      if (f.pozice === BEZ_POZICE ? !!p : p !== f.pozice) return false;
    }
    if (f.jenKOvereni && !kOvereni(priznaky(r))) return false;
    if (hledani && !hledani(r)) return false;
    return true;
  });
}

/** Přepnutí pilulky: druhý klik na tutéž hodnotu filtr ruší (DESIGN „Filtrovací pás"). */
export function prepniHodnotu(soucasna: string, nova: string): string {
  return soucasna === nova ? '' : nova;
}

// ---------------------------------------------------------------------------
// Souhrn vybraného člověka / období
// ---------------------------------------------------------------------------

export interface SouhrnRadku { ms: number; smen: number; pozde: number; pauzaMs: number; kOvereni: number; offline: number }

export function souhrnRadku(radky: readonly RadekZaznamu[], plany: ReadonlyMap<string, PlanZaznamu>, ted: number): SouhrnRadku {
  const out: SouhrnRadku = { ms: 0, smen: 0, pozde: 0, pauzaMs: 0, kOvereni: 0, offline: 0 };
  for (const r of radky) {
    const p = priznakyRadku(r, plany, ted);
    out.ms += r.ms; out.smen++; out.pauzaMs += r.pauzaMs;
    if (p.pozdeMin != null) out.pozde++;
    if (kOvereni(p)) out.kOvereni++;
    if (p.offline) out.offline++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// CSV navíc (účetní; česky jako zbytek exportu)
// ---------------------------------------------------------------------------

/** „30" (minuty pauzy), prázdné bez pauzy. */
export function csvPauzaMin(r: RadekZaznamu): string {
  return r.pauzaMs > 0 ? String(Math.round(r.pauzaMs / 60000)) : '';
}

/** „u podniku 40 m" / „mimo podnik 1200 m" / „bez polohy" / prázdné (neověřovalo se). */
export function csvPoloha(e: ZaznamSeStavem): string {
  if (e.geoStatus === 'far') return `mimo podnik${e.geoDistanceM != null ? ` ${e.geoDistanceM} m` : ''}`;
  if (e.geoStatus === 'ok') return `u podniku${e.geoDistanceM != null ? ` ${e.geoDistanceM} m` : ''}`;
  if (e.geoStatus === 'missing') return 'bez polohy';
  return '';
}

// ---------------------------------------------------------------------------
// Zámek období
// ---------------------------------------------------------------------------

/** Zámek, do kterého den spadá (první nalezený). */
export function zamekDne(zamky: readonly ZamekObdobi[], den: string): ZamekObdobi | null {
  if (!denZamcen(zamky, den)) return null;
  return zamky.find(z => z.od <= den && z.do >= den) ?? null;
}

/** Den (Praha) příchodu záznamu, nebo null u nečitelného času. */
export function denZaznamuPraha(clockIn: string | Date | null | undefined): string | null {
  const d = parseDbTime(clockIn ?? null);
  return d ? pragueDayOf(d) : null;
}

const posledniDenMesice = (mesic: string): string => {
  const [r, m] = [Number(mesic.slice(0, 4)), Number(mesic.slice(5, 7))];
  const d = new Date(Date.UTC(m === 12 ? r + 1 : r, m === 12 ? 0 : m, 1, 12));
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};

/** Zámek přesně na kalendářní měsíc → „RRRR-MM", jinak null (hláška pak řekne rozmezí dnů). */
export function mesicZamku(z: Pick<ZamekObdobi, 'od' | 'do'>): string | null {
  const mesic = z.od.slice(0, 7);
  return z.od.endsWith('-01') && z.do === posledniDenMesice(mesic) ? mesic : null;
}

const MESICE_CS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const denCs = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

/**
 * Hláška serveru (česky, jako ostatní chyby API) pro 409 u zamčeného období:
 * „Září 2026 je uzavřené ve výplatách — otevři ho ve Výplatní listině."
 */
export function hlaskaZamku(z: Pick<ZamekObdobi, 'od' | 'do'>): string {
  const mesic = mesicZamku(z);
  const nazev = mesic
    ? `${MESICE_CS[Number(mesic.slice(5, 7)) - 1]} ${mesic.slice(0, 4)}`
    : `období ${denCs(z.od)} – ${denCs(z.do)} ${z.do.slice(0, 4)}`;
  return `${nazev.charAt(0).toUpperCase()}${nazev.slice(1)} je uzavřené ve výplatách — otevři ho ve Výplatní listině.`;
}
