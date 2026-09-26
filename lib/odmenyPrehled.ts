// Výpočty pro widgety a stránky oblasti „Odměny a hodnocení" (kolo 69, balík B7).
//
// Čistý modul bez Reactu: widgety (components/widgety/oblasti/odmeny.tsx) i obě
// stránky (RewardsView, MyRewards) čtou stejné odpovědi /api/rewards,
// /api/rewards/catalog a /api/shift-reviews a tady se z nich vybírá, co se kreslí.
// Hlídají je testy scripts/testy/k69-b7.ts — hlavně to, co se dřív pokazilo:
// „Odkud mám body" ukazovalo počty úkolů jako body, kalendář hodnocení počítal
// jako nehodnocené i směny, které ještě nezačaly, a „Vyměnit" svítilo, i když
// body už držela čekající žádost (server by výměnu odmítl).

import type { CzNoun } from './czech.ts';

export const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
export const VYTKA: CzNoun = { one: 'výtka', few: 'výtky', many: 'výtek' };
export const ZADOST: CzNoun = { one: 'žádost', few: 'žádosti', many: 'žádostí' };
export const NEHODNOCENA_SMENA: CzNoun = { one: 'nehodnocená směna', few: 'nehodnocené směny', many: 'nehodnocených směn' };

/** Widget → nástroj stránky Odměny: otevřít kalendář hodnocení na dni (spec §2.6, jako u uzávěrek). */
export const UDALOST_KALENDAR = 'odmeny:kalendar';
/** Totéž přes sessionStorage, když widget stojí na jiné stránce (Přehled). */
export const KLIC_KALENDAR = 'managero-odmeny-kalendar';

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cele = (x: unknown): number => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : 0);
const text = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);
/** Den z databáze („2026-09-24" i ISO s časem) → „2026-09-24". */
export const denZ = (x: unknown): string => String(x ?? '').slice(0, 10);

// ---------------------------------------------------------------------------
// Úrovně a moje body (/api/rewards)
// ---------------------------------------------------------------------------

export interface Uroven { nazev: string; odBodu: number; vyhody: string }

export interface Rozpad {
  ukoly: number; postupy: number; uzaverky: number;
  zHodnoceni: number; hodnocenychSmen: number; automaticke: number; uPolozek: number; vytek: number;
}

export interface Sazebnik { ukol: number; postup: number; uzaverka: number }

export interface MojeUroven {
  body: number;
  uroven: string;
  index: number;
  vyhody: string;
  dalsi: Uroven | null;
  procento: number;
  vUrovni: number;
  naDalsi: number;
  rozpad: Rozpad;
}

function vyberRozpad(b: any): Rozpad {
  return {
    ukoly: cele(b?.tasks), postupy: cele(b?.procedures), uzaverky: cele(b?.closings),
    zHodnoceni: cele(b?.reviewPoints), hodnocenychSmen: cele(b?.ratedShifts),
    automaticke: cele(b?.autoPoints), uPolozek: cele(b?.itemPoints), vytek: cele(b?.flagged),
  };
}

function vyberUroven(l: any): Uroven {
  return { nazev: String(l?.name ?? ''), odBodu: cele(l?.minPoints), vyhody: String(l?.perks ?? '') };
}

export interface Odmeny {
  urovne: Uroven[];
  sazebnik: Sazebnik;
  /** Vlastní úroveň a body — null jen u tabletu (sdílený účet body nemá). */
  ja: MojeUroven | null;
}

/** Vlastní úroveň, úrovně a sazebník z /api/rewards (od kola 69 i pro toho, kdo má žebříček — N12). */
export function vyberOdmeny(raw: any): Odmeny {
  if (!raw || typeof raw !== 'object') throw new Error('Odměny mají nečekaný tvar.');
  const m = raw.me;
  const pt = raw.points ?? {};
  return {
    urovne: seznam(raw.levels).map(vyberUroven),
    sazebnik: { ukol: cele(pt.task), postup: cele(pt.procedure), uzaverka: cele(pt.closing) },
    ja: m && typeof m === 'object' ? {
      body: cele(m.points),
      uroven: String(m.levelName ?? ''),
      index: cele(m.levelIndex),
      vyhody: String(m.perks ?? ''),
      dalsi: m.next ? vyberUroven(m.next) : null,
      procento: Math.max(0, Math.min(100, cele(m.pctToNext))),
      vUrovni: cele(m.pointsIntoLevel),
      naDalsi: cele(m.pointsForNext),
      rozpad: vyberRozpad(m.breakdown),
    } : null,
  };
}

/** Kolik bodů ještě chybí do další úrovně (nikdy záporně). */
export const zbyvaDoDalsi = (u: Pick<MojeUroven, 'vUrovni' | 'naDalsi'>): number => Math.max(0, u.naDalsi - u.vUrovni);

export interface RadekBodu { klic: string; nazev: string; body: number; pocet: number | null; ikona: string }

/**
 * „Odkud mám body": body po zdrojích. Rozpad ze serveru nese u úkolů, postupů
 * a uzávěrek POČTY (body = počet × sazba), u hodnocení už body — dřív se
 * ukazovaly počty jako body a součet nesouhlasil s celkem nahoře.
 */
export function odkudBody(r: Rozpad, s: Sazebnik): RadekBodu[] {
  return [
    { klic: 'ukoly', nazev: 'Úkoly', body: r.ukoly * s.ukol, pocet: r.ukoly, ikona: 'check' },
    { klic: 'postupy', nazev: 'Postupy', body: r.postupy * s.postup, pocet: r.postupy, ikona: 'clipboard' },
    { klic: 'uzaverky', nazev: 'Uzávěrky', body: r.uzaverky * s.uzaverka, pocet: r.uzaverky, ikona: 'receipt' },
    { klic: 'hodnoceni', nazev: 'Z hodnocení směn', body: r.zHodnoceni + r.automaticke, pocet: r.hodnocenychSmen, ikona: 'star' },
    // Body u položek jsou i odečtené odměny (záporné řádky ledgeru) — patří do součtu, jinak nesedí s celkem.
    { klic: 'polozky', nazev: 'U položek a za odměny', body: r.uPolozek, pocet: null, ikona: 'gift' },
  ];
}

// ---------------------------------------------------------------------------
// Hodnocení mých směn (/api/rewards → reviews, items)
// ---------------------------------------------------------------------------

export interface PolozkaHodnoceni { druh: string; id: number; nazev: string; body: number; poznamka: string | null; vytka: boolean }

export interface DenHodnoceni {
  den: string;
  hvezdy: number;
  body: number;
  automaticke: number;
  poznamka: string | null;
  vytka: boolean;
  videno: boolean;
  celaSmena: boolean;
  /** Je v ten den celkové hodnocení směny (ne jen hodnocení položek)? */
  maHodnoceni: boolean;
  polozky: PolozkaHodnoceni[];
}

/**
 * Dny zpětné vazby: celkové hodnocení směny a k němu všechno, co vedení ten
 * den označilo u úkolů, postupů a uzávěrky. Den jen s položkami (bez
 * celkového hodnocení) se ukáže taky. Odečet za odměnu (druh `redemption`)
 * není zpětná vazba — do dnů nepatří.
 */
export function dnyHodnoceni(raw: any): DenHodnoceni[] {
  const mapa = new Map<string, DenHodnoceni>();
  const den = (d: string): DenHodnoceni => {
    let x = mapa.get(d);
    if (!x) {
      x = { den: d, hvezdy: 0, body: 0, automaticke: 0, poznamka: null, vytka: false, videno: true, celaSmena: false, maHodnoceni: false, polozky: [] };
      mapa.set(d, x);
    }
    return x;
  };
  for (const r of seznam(raw?.reviews)) {
    const d = denZ(r?.work_date);
    if (!d) continue;
    const x = den(d);
    x.maHodnoceni = true;
    x.hvezdy = Math.max(0, Math.min(5, cele(r.rating)));
    x.body = cele(r.points);
    x.automaticke = cele(r.autoPoints);
    x.poznamka = text(r.note);
    x.vytka = x.vytka || r.flagged === true;
    x.videno = !!r.seen_at || !('seen_at' in r);
    x.celaSmena = r.scope === 'shift';
  }
  for (const it of seznam(raw?.items)) {
    const d = denZ(it?.work_date);
    if (!d || it?.kind === 'redemption') continue;
    const x = den(d);
    const vytka = it.flagged === true;
    x.polozky.push({ druh: String(it.kind ?? ''), id: cele(it.refId), nazev: String(it.label ?? 'Hodnocení'), body: cele(it.points), poznamka: text(it.note), vytka });
    x.vytka = x.vytka || vytka;
  }
  return Array.from(mapa.values()).sort((a, b) => b.den.localeCompare(a.den));
}

/** Body dne celkem: hodnocení + automatické + položky. */
export const bodyDne = (d: DenHodnoceni): number => d.body + d.automaticke + d.polozky.reduce((s, p) => s + p.body, 0);

// ---------------------------------------------------------------------------
// Žebříček a výtky (/api/rewards → standings)
// ---------------------------------------------------------------------------

export interface Poradi {
  id: number;
  jmeno: string;
  avatar: string | null;
  body: number;
  uroven: string;
  index: number;
  dalsi: string | null;
  procento: number;
  zbyva: number;
  vytek: number;
  /** Výtky, které člověk ještě nepotvrdil („Beru na vědomí"). */
  nepotvrzenych: number;
  kHodnoceni: number;
  nejstarsiKHodnoceni: string | null;
  rozpad: Rozpad;
}

/** Žebříček z /api/rewards; bez oprávnění na žebříček server `standings` nepošle → prázdno. */
export function vyberPoradi(raw: any): Poradi[] {
  if (!raw || typeof raw !== 'object') throw new Error('Žebříček má nečekaný tvar.');
  return seznam(raw.standings).map((s: any) => ({
    id: cele(s.id),
    jmeno: String(s.name ?? ''),
    avatar: typeof s.avatar === 'string' && s.avatar ? s.avatar : null,
    body: cele(s.points),
    uroven: String(s.levelName ?? ''),
    index: cele(s.levelIndex),
    dalsi: s.next?.name ? String(s.next.name) : null,
    procento: Math.max(0, Math.min(100, cele(s.pctToNext))),
    zbyva: Math.max(0, cele(s.pointsForNext) - cele(s.pointsIntoLevel)),
    vytek: cele(s.flagged),
    nepotvrzenych: cele(s.flaggedUnseen),
    kHodnoceni: cele(s.pending),
    nejstarsiKHodnoceni: s.oldestPending ? denZ(s.oldestPending) : null,
    rozpad: vyberRozpad(s.breakdown),
  })).sort((a, b) => b.body - a.body);
}

export interface VytkyTymu { celkem: number; nepotvrzenych: number; lide: Poradi[] }

/** Kdo má výtky: nejdřív ti s nepotvrzenými, pak podle počtu. */
export function vytkyTymu(p: Poradi[]): VytkyTymu {
  const lide = p.filter(x => x.vytek > 0)
    .sort((a, b) => b.nepotvrzenych - a.nepotvrzenych || b.vytek - a.vytek || a.jmeno.localeCompare(b.jmeno, 'cs'));
  return {
    celkem: lide.reduce((s, x) => s + x.vytek, 0),
    nepotvrzenych: lide.reduce((s, x) => s + x.nepotvrzenych, 0),
    lide,
  };
}

// ---------------------------------------------------------------------------
// Nehodnocené směny (/api/shift-reviews?month)
// ---------------------------------------------------------------------------

export interface DenKHodnoceni { den: string; ceka: number; lidi: number }
export interface Nehodnocene { celkem: number; nejstarsi: string | null; dny: DenKHodnoceni[] }

/**
 * Nehodnocené směny v měsíci. Měsíční soupiska nese i naplánované směny, které
 * ještě nebyly — ty se hodnotit nedají, takže jen dny do dneška (dnešek ano:
 * Ohodnotit směny nabízí i Dnes).
 */
export function nehodnocene(raw: any, dnes: string): Nehodnocene {
  const dny = seznam(raw?.days)
    .map((d: any) => ({ den: denZ(d?.date), ceka: cele(d?.pending), lidi: seznam(d?.staff).length }))
    .filter(d => d.den && d.den <= dnes && d.ceka > 0)
    .sort((a, b) => a.den.localeCompare(b.den));
  return { celkem: dny.reduce((s, d) => s + d.ceka, 0), nejstarsi: dny[0]?.den ?? null, dny };
}

/** „2026-09" posunuté o měsíc zpět (bez Date — přechod roku je jen aritmetika). */
export function minulyMesic(mesic: string): string {
  const [y, m] = mesic.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Katalog odměn a žádosti (/api/rewards/catalog)
// ---------------------------------------------------------------------------

export interface Odmena { id: number; nazev: string; ikona: string | null; cena: number; aktivni: boolean; zOrganizace: boolean; sdileno: boolean; spravuje: string | null }
export interface Zadost {
  id: number; odmena: number | null; nazev: string; cena: number; stav: 'pending' | 'approved' | 'declined';
  clovek: number; jmeno: string | null; avatar: string | null; kdy: string | null;
}
export interface Katalog { odmeny: Odmena[]; zadosti: Zadost[] }

export function vyberKatalog(raw: any): Katalog {
  if (!raw || typeof raw !== 'object') throw new Error('Katalog odměn má nečekaný tvar.');
  return {
    odmeny: seznam(raw.catalog).map((r: any) => ({
      id: cele(r.id), nazev: String(r.title ?? ''), ikona: text(r.icon), cena: Math.max(0, cele(r.cost)),
      aktivni: r.active !== false, zOrganizace: r.zOrganizace === true, sdileno: r.sdileno === true, spravuje: text(r.spravuje),
    })),
    zadosti: seznam(raw.redemptions).map((r: any) => ({
      id: cele(r.id), odmena: r.reward_id == null ? null : cele(r.reward_id), nazev: String(r.title ?? ''), cena: cele(r.cost),
      stav: r.status === 'approved' ? 'approved' : r.status === 'declined' ? 'declined' : 'pending',
      clovek: cele(r.employee_id), jmeno: text(r.employee_name), avatar: text(r.employee_avatar), kdy: r.created_at ? String(r.created_at) : null,
    })),
  };
}

export interface NabidkaOdmeny extends Odmena {
  /** Mám na ni volné body (celkem − čekající žádosti)? */
  dosahnu: boolean;
  chybi: number;
  /** Už o ni žádám a čeká na vedení. */
  ceka: boolean;
}

/**
 * Co si můžu vybrat. Volné body = body − čekající žádosti (tak počítá server
 * při výměně i schválení); dřív „Vyměnit" svítilo i na body, které už držela
 * jiná žádost, a server výměnu odmítl. Žádosti vedení (odmeny.schvalovat)
 * nesou celý tým — počítají se jen moje.
 */
export function nabidka(k: Katalog, body: number, ja: number | null): { volne: number; odmeny: NabidkaOdmeny[]; moje: Zadost[] } {
  const moje = k.zadosti.filter(z => ja != null && z.clovek === ja);
  const volne = body - moje.filter(z => z.stav === 'pending').reduce((s, z) => s + z.cena, 0);
  const odmeny = k.odmeny.filter(o => o.aktivni).map(o => {
    const ceka = moje.some(z => z.stav === 'pending' && z.odmena === o.id);
    return { ...o, dosahnu: volne >= o.cena, chybi: Math.max(0, o.cena - volne), ceka };
  });
  return { volne, odmeny, moje };
}

/** Čekající žádosti týmu (fronta ke schválení), nejstarší první. */
export const cekajiciZadosti = (k: Katalog): Zadost[] =>
  k.zadosti.filter(z => z.stav === 'pending').sort((a, b) => String(a.kdy ?? '').localeCompare(String(b.kdy ?? '')) || a.id - b.id);
