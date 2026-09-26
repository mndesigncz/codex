// Managero client a Akce — čisté výpočty pro widgety a stránky (kolo 69, balík B8).
//
// Bez Reactu a bez fetch: widgety (components/widgety/oblasti/klient.tsx a akce.tsx)
// i nástroje stránek (ClientAdmin, EventsView) čtou tytéž odpovědi API a musí
// z nich spočítat totéž — dnešní rezervace na Přehledu a v Rezervacích, výsledek
// akce ve widgetu a v kartě akce. Kdyby si to každý počítal sám, rozjelo by se to
// (tržba akce s uzávěrkami se dřív v detailu brala z uzávěrky a v seznamu ne).
// Testy: scripts/testy/k69-b8.ts.

import type { ChipTone } from '../components/ui/Chip';
import { czCount, type CzNoun } from './czech.ts';

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cislo = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

// ---------------------------------------------------------------------------
// Rezervace
// ---------------------------------------------------------------------------

export type StavRezervace = 'requested' | 'confirmed' | 'seated' | 'done' | 'declined' | 'cancelled';

export interface Rezervace {
  id: number;
  datum: string;
  cas: string;
  host: string;
  /** Jen s zakaznici.kontakty — jinak ho API vůbec nepošle (osobní údaj). */
  email: string | null;
  osob: number;
  stulId: number | null;
  stul: string | null;
  stav: StavRezervace;
  /** Tablet ji nedostane (API ji maže); poznámka hosta patří jen vedení. */
  poznamka: string | null;
}

export interface Stul { id: number; nazev: string; mist: number }

export interface SeznamRezervaci { rezervace: Rezervace[]; stoly: Stul[] }

const STAVY: StavRezervace[] = ['requested', 'confirmed', 'seated', 'done', 'declined', 'cancelled'];

/**
 * Odpověď /api/client/admin/reservations. Nečekaný tvar je chyba widgetu
 * (ErrorState), ne „nikdo nerezervoval" — prázdný seznam by lhal.
 */
export function vyberRezervace(raw: any): SeznamRezervaci {
  if (!raw || !Array.isArray(raw.reservations)) throw new Error('Rezervace přišly v nečekaném tvaru.');
  return {
    rezervace: raw.reservations.map((r: any) => ({
      id: Number(r.id),
      datum: String(r.date ?? '').slice(0, 10),
      cas: String(r.time ?? '').slice(0, 5),
      host: text(r.customer_name) ?? 'Host',
      email: text(r.customer_email),
      osob: Math.max(1, cislo(r.party)),
      stulId: r.table_id == null ? null : Number(r.table_id),
      stul: text(r.table_name),
      stav: (STAVY.includes(r.status) ? r.status : 'requested') as StavRezervace,
      poznamka: text(r.note),
    })),
    stoly: seznam(raw.tables).map((t: any) => ({ id: Number(t.id), nazev: String(t.name ?? ''), mist: cislo(t.seats) })),
  };
}

/** Kam smí rezervace ze svého stavu (stejná mapa jako FLOW v API). */
const PRECHODY: Record<string, StavRezervace[]> = {
  requested: ['confirmed', 'declined'],
  confirmed: ['seated', 'declined', 'done'],
  seated: ['done'],
};
export const muzeDo = (z: StavRezervace, na: StavRezervace) => PRECHODY[z]?.includes(na) ?? false;

/** Které oprávnění přechod chce (API kontroluje totéž, tady jen aby tlačítko nesvítilo naprázdno). */
export const klicPrechodu = (na: StavRezervace) => (na === 'confirmed' || na === 'declined' ? 'rezervace.schvalovat' : 'rezervace.usadit');

/**
 * Hlavní krok řádku — jedno tlačítko vpředu, zbytek v „···" (DP §3.6).
 * Jen krok, na který má divák klíč: Barista s rezervace.usadit u požadavku
 * „Potvrdit" nedostane, ale u potvrzené „Usadit" ano.
 */
export function hlavniKrok(stav: StavRezervace, smi: (klic: string) => boolean): { na: StavRezervace; popisek: string } | null {
  const kroky: { na: StavRezervace; popisek: string }[] = [
    { na: 'confirmed', popisek: 'Potvrdit' },
    { na: 'seated', popisek: 'Usadit' },
    { na: 'done', popisek: 'Hotovo' },
  ];
  return kroky.find(k => muzeDo(stav, k.na) && smi(klicPrechodu(k.na))) ?? null;
}

/** Tón stavu rezervace pro Chip (stav, ne kategorie: pět tónů, DP §2.1). */
export const TON_REZERVACE: Record<StavRezervace, ChipTone> = {
  requested: 'wait', confirmed: 'ok', seated: 'ok', done: 'muted', declined: 'muted', cancelled: 'muted',
};

/** Dnešek pro widget S: kolik dnes přijde a kolik čeká na potvrzení (zrušené a odmítnuté se nepočítají). */
export function souhrnDne(rez: Rezervace[]): { dnes: number; ceka: number; osob: number } {
  const plati = rez.filter(r => r.stav !== 'declined' && r.stav !== 'cancelled');
  return {
    dnes: plati.length,
    ceka: plati.filter(r => r.stav === 'requested').length,
    osob: plati.reduce((s, r) => s + r.osob, 0),
  };
}

/** Pořadí pro dnešní seznam: čeká na potvrzení → ostatní živé podle času → proběhlé a zrušené na konci. */
export function seradDnes(rez: Rezervace[]): Rezervace[] {
  const vaha = (s: StavRezervace) => (s === 'requested' ? 0 : s === 'confirmed' || s === 'seated' ? 1 : 2);
  return [...rez].sort((a, b) => vaha(a.stav) - vaha(b.stav) || a.cas.localeCompare(b.cas));
}

/** Rezervace po dnech (Rezervace → Nadcházející/Minulé). Pořadí dnů zachová z API. */
export function poDnech(rez: Rezervace[]): [string, Rezervace[]][] {
  const m = new Map<string, Rezervace[]>();
  for (const r of rez) { const d = m.get(r.datum); if (d) d.push(r); else m.set(r.datum, [r]); }
  return [...m.entries()];
}

// ---------------------------------------------------------------------------
// Hodnocení
// ---------------------------------------------------------------------------

export interface Recenze { id: number; hvezdy: number; poznamka: string | null; kdy: string; host: string; zdroj: 'objednavka' | 'rezervace' }

export interface Hodnoceni {
  pocet: number;
  prumer: number | null;
  /** Počet hodnocení s 1…5 hvězdami (index 0 = jedna hvězda). */
  rozlozeni: [number, number, number, number, number];
  posledni: Recenze[];
}

export function vyberHodnoceni(raw: any): Hodnoceni {
  if (!raw || !Array.isArray(raw.reviews)) throw new Error('Hodnocení přišla v nečekaném tvaru.');
  const d = seznam(raw.dist);
  const avg = raw.avg == null ? null : Number(raw.avg);
  return {
    pocet: cislo(raw.count),
    prumer: avg == null || !Number.isFinite(avg) ? null : avg,
    rozlozeni: [0, 1, 2, 3, 4].map(i => cislo(d[i])) as Hodnoceni['rozlozeni'],
    posledni: raw.reviews.map((v: any) => ({
      id: Number(v.id),
      hvezdy: Math.min(5, Math.max(1, Math.round(cislo(v.rating)))),
      poznamka: text(v.note),
      kdy: String(v.created_at ?? ''),
      host: text(v.customer_name) ?? 'Host',
      zdroj: String(v.ref ?? '').startsWith('ord:') ? 'objednavka' : 'rezervace',
    })),
  };
}

/** Průměr česky s desetinnou čárkou („4,6"); API posílá tečku a dřív se tak i vypsala. */
export const prumerCesky = (n: number | null) => (n == null ? '–' : n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

// ---------------------------------------------------------------------------
// Členové klubu
// ---------------------------------------------------------------------------

export type RazeniClenu = 'navstevy' | 'body' | 'nejnovejsi';
export const RAZENI_CLENU: RazeniClenu[] = ['navstevy', 'body', 'nejnovejsi'];

export interface Clen { id: number; jmeno: string; body: number; navstev: number; clenOd: string; naposledy: string | null }

export function vyberCleny(raw: any): { clenove: Clen[]; celkem: number } {
  if (!raw || !Array.isArray(raw.customers)) throw new Error('Členové přišli v nečekaném tvaru.');
  const clenove = raw.customers.map((c: any) => ({
    id: Number(c.id),
    jmeno: text(c.name) ?? 'Host',
    body: cislo(c.points),
    navstev: cislo(c.visits),
    clenOd: String(c.joined_at ?? '').slice(0, 10),
    naposledy: c.last_visit_at ? String(c.last_visit_at).slice(0, 10) : null,
  }));
  return { clenove, celkem: raw.total == null ? clenove.length : cislo(raw.total) };
}

/** Nejvěrnější podle zvoleného řazení — stejné pořadí jako ORDER BY v API (?sort=), kdyby API vrátilo neseřazené. */
export function nejvernejsi(clenove: Clen[], razeni: RazeniClenu, kolik = 5): Clen[] {
  const cmp: Record<RazeniClenu, (a: Clen, b: Clen) => number> = {
    navstevy: (a, b) => b.navstev - a.navstev || b.body - a.body,
    body: (a, b) => b.body - a.body || b.navstev - a.navstev,
    nejnovejsi: (a, b) => b.clenOd.localeCompare(a.clenOd),
  };
  return [...clenove].sort(cmp[razeni]).slice(0, kolik);
}

// ---------------------------------------------------------------------------
// Věrnost za 30 dní
// ---------------------------------------------------------------------------

export interface Vernost30 {
  rozdano: number;
  utraceno: number;
  noviClenove: number;
  kuponu: number;
  /** Aktivní hosté po dnech (kdo dostal nebo utratil body) — pro graf L. */
  poDnech: { den: string; aktivnich: number }[];
}

/**
 * Souhrn z /api/client/admin/loyalty. Rozdané a utracené body bere ze souhrnu
 * (server je sčítá z deníku za 30 dní), kupony a nové členy sečte z řady po
 * dnech — souhrn má kupony jen „celkem od začátku", což by za 30 dní lhalo.
 */
export function vyberVernost(raw: any): Vernost30 {
  if (!raw || typeof raw.summary !== 'object' || raw.summary == null) throw new Error('Věrnost přišla v nečekaném tvaru.');
  const s = raw.summary;
  const rada = seznam(raw.series).slice(-30);
  const soucet = (k: string) => rada.reduce((n, d) => n + cislo(d?.[k]), 0);
  return {
    rozdano: s.pointsGiven30 != null ? cislo(s.pointsGiven30) : soucet('points_given'),
    utraceno: s.pointsSpent30 != null ? cislo(s.pointsSpent30) : soucet('points_spent'),
    noviClenove: rada.length ? soucet('new_members') : cislo(s.newMembers30),
    kuponu: soucet('redeemed'),
    poDnech: rada.map(d => ({ den: String(d?.day ?? '').slice(0, 10), aktivnich: cislo(d?.active) })),
  };
}

// ---------------------------------------------------------------------------
// Souhrn Clientu (N13) a Propojení
// ---------------------------------------------------------------------------

export interface KrokPropojeni {
  id: 'zapnuto' | 'menu' | 'stoly' | 'pokladna' | 'poloha' | 'vernost';
  hotovo: boolean;
  popisek: string;
  /** Záložka Clientu, kde se krok nastaví. */
  zalozka: 'settings' | 'tables' | 'loyalty';
  /** Kdo ho smí nastavit (katalog klient.propojeni, pole akce:nastavit). */
  klic: string;
}

const STUL: CzNoun = { one: 'stůl', few: 'stoly', many: 'stolů' };
const SPAROVANY: CzNoun = { one: 'spárovaný', few: 'spárované', many: 'spárovaných' };

/** Kontrolní seznam „Propojení Clientu" ze `setup` v /api/client/admin/summary. */
export function krokyPropojeni(setup: any, mena = 'Kč'): KrokPropojeni[] {
  const su = setup && typeof setup === 'object' ? setup : {};
  const stolu = cislo(su.tables);
  const sparovano = cislo(su.tablesPaired);
  return [
    { id: 'zapnuto', hotovo: !!su.enabled, popisek: su.enabled ? 'Stránka pro hosty je zapnutá' : 'Zapnout stránku pro hosty', zalozka: 'settings', klic: 'klient.nastaveni' },
    { id: 'menu', hotovo: !!su.menu, popisek: su.menu ? 'Hosté vidí nabídku z Menu' : 'Vybrat menu pro hosty', zalozka: 'settings', klic: 'klient.nastaveni' },
    {
      id: 'stoly', hotovo: stolu > 0, zalozka: 'tables', klic: 'stoly.upravit',
      popisek: stolu > 0 ? `${czCount(stolu, STUL)}${sparovano ? `, ${czCount(sparovano, SPAROVANY)} s pokladnou` : ''}` : 'Přidat stoly pro rezervace a objednávky',
    },
    { id: 'pokladna', hotovo: !!su.pos, popisek: su.pos ? 'Pokladna napojená, objednávky jdou na stůl v kase' : 'Napojit pokladnu', zalozka: 'tables', klic: 'stoly.upravit' },
    { id: 'poloha', hotovo: !!su.location, popisek: su.location ? 'Poloha podniku nastavená' : 'Nastavit polohu podniku pro ochranu objednávek', zalozka: 'settings', klic: 'klient.nastaveni' },
    {
      id: 'vernost', hotovo: !!su.loyaltyOn, zalozka: 'loyalty', klic: 'vernost.pravidla',
      popisek: su.loyaltyOn ? `Věrnost běží: ${cislo(su.pointsPer100)} b. za 100 ${mena}` : 'Zapnout věrnost',
    },
  ];
}

/**
 * N13: /api/client/admin/summary posílal všechno každému s klient.prehled.
 * Teď každé číslo jen s jeho klíčem; bez klíče je pole `null` (ne 0 —
 * nula by říkala „nic nečeká", i když divák jen nesmí vidět).
 */
export function souhrnPodleOpravneni<T extends Record<string, unknown>>(souhrn: T, ma: (klic: string) => boolean): T {
  const out: Record<string, unknown> = { ...souhrn };
  if (!ma('rezervace.zobrazit')) out.reservations = null;
  if (!ma('objednavky.zobrazit')) out.orders = null;
  if (!ma('zakaznici.recenze')) out.reviews = null;
  // Odznak „k vyřízení" sčítá jen to, co divák vidí.
  const rq = (out.reservations as { requested?: number } | null)?.requested ?? 0;
  const on = (out.orders as { new?: number } | null)?.new ?? 0;
  out.attention = rq + on;
  return out as T;
}

// ---------------------------------------------------------------------------
// Akce
// ---------------------------------------------------------------------------

export interface BodChecklistu { text: string; done: boolean }

export interface AkceSouhrn {
  id: number;
  nazev: string;
  datum: string;
  zacatek: string | null;
  stav: string;
  checklist: BodChecklistu[];
  /** null = divák nemá akce.finance (API čísla nepošle), nebo nic zapsáno. */
  trzba: number | null;
  naklady: number | null;
  uzaverek: number;
}

export function vyberAkceSouhrn(raw: any): AkceSouhrn[] {
  if (!raw || !Array.isArray(raw.events)) throw new Error('Akce přišly v nečekaném tvaru.');
  return raw.events.map((e: any) => {
    const uzaverek = cislo(e.closingsCount);
    // Tržbu akce s uzávěrkou nese uzávěrka (jako detail akce v EventsView).
    const trzba = uzaverek > 0 && e.closingsTotal != null ? cislo(e.closingsTotal) : e.revenue == null ? null : cislo(e.revenue);
    return {
      id: Number(e.id),
      nazev: text(e.title) ?? 'Akce',
      datum: String(e.date ?? '').slice(0, 10),
      zacatek: typeof e.startTime === 'string' && e.startTime ? e.startTime.slice(0, 5) : null,
      stav: String(e.status ?? 'planned'),
      checklist: seznam(e.checklist).map((c: any) => ({ text: String(c?.text ?? '').trim(), done: c?.done === true })).filter(c => c.text),
      trzba,
      naklady: e.costs == null ? null : cislo(e.costs),
      uzaverek,
    };
  });
}

const podleData = (a: AkceSouhrn, b: AkceSouhrn) => a.datum.localeCompare(b.datum) || (a.zacatek ?? '').localeCompare(b.zacatek ?? '');

/** Nejbližší nadcházející akce, která má co připravit (checklist). Zrušené ne. */
export function akceKPriprave(akce: AkceSouhrn[], dnes: string): AkceSouhrn | null {
  return akce.filter(a => a.datum >= dnes && a.stav !== 'cancelled' && a.checklist.length > 0).sort(podleData)[0] ?? null;
}

/**
 * Poslední proběhlá akce (datum před dneškem nebo stav „proběhla"), a to ta,
 * u které je co vyúčtovat: bez tržby i nákladů by widget ukázal „0 Kč",
 * což není výsledek, ale chybějící zápis.
 */
export function posledniProbehla(akce: AkceSouhrn[], dnes: string): AkceSouhrn | null {
  const probehle = akce.filter(a => a.stav !== 'cancelled' && (a.datum < dnes || a.stav === 'done'));
  return [...probehle].sort((a, b) => -podleData(a, b)).find(a => a.trzba != null || a.naklady != null) ?? null;
}

/** Výsledek akce = tržba − náklady; null, když není zapsané ani jedno. */
export function vysledekAkce(a: Pick<AkceSouhrn, 'trzba' | 'naklady'>): number | null {
  if (a.trzba == null && a.naklady == null) return null;
  return (a.trzba ?? 0) - (a.naklady ?? 0);
}

/** Checklist s přepnutým bodem — PATCH /api/events/{id} bere celý seznam. */
export function prepniBod(checklist: BodChecklistu[], index: number): BodChecklistu[] {
  return checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
}
