// Segmenty příjemců zpráv členům a pravidlo „Chybíš nám“ — čistá logika bez
// databáze (testy: scripts/testy/k80-segmenty.ts). SQL, které členy načte,
// je v lib/broadcasts.ts (segmenty) a lib/reaktivace.ts (automatická zpráva).
//
// Publikum je řetězec v client_broadcasts.audience. Starší hodnoty (all, quiet,
// tier:*, group:N) platí dál; nové segmenty jsou quiet:60, quiet:90,
// birthday:month, near:stamps, near:points a new:14.

import { czCount } from './czech.ts';

export const DEN_MS = 86400000;

/** Kolik razítek smí hostovi chybět, aby byl „blízko odměně“. */
export const BLIZKO_RAZITEK = 2;
/** Blízko kuponu: chybí nejvýš pětina jeho ceny, ale vždy aspoň 10 bodů. */
export const BLIZKO_KUPONU_PODIL = 0.2;
export const BLIZKO_KUPONU_MIN = 10;
/** Nový člen: přidal se před méně než tolika dny. */
export const NOVY_CLEN_DNI = 14;
/** „Chybíš nám“ se posílá jen hostům, kteří právě přestali chodit; starší spáči ji nedostanou. */
export const REAKTIVACE_OKNO_DNI = 14;

export interface SegmentInfo { id: string; label: string; popis: string }

/** Segmenty, které se počítají z členů (úrovně a skupiny řeší SQL zvlášť). */
export const SEGMENTY: SegmentInfo[] = [
  { id: 'quiet', label: 'Nepřišli měsíc a déle', popis: 'Hosté, kteří nebyli aspoň 30 dní. Bez návštěvy se počítá od přidání do klubu.' },
  { id: 'quiet:60', label: 'Nepřišli dva měsíce a déle', popis: 'Hosté, kteří nebyli aspoň 60 dní.' },
  { id: 'quiet:90', label: 'Nepřišli tři měsíce a déle', popis: 'Hosté, kteří nebyli aspoň 90 dní. Poslední šance je vrátit.' },
  { id: 'birthday:month', label: 'Mají narozeniny tento měsíc', popis: 'Hosté, kteří zadali datum narození a slaví v tomto měsíci.' },
  { id: 'near:stamps', label: 'Blízko odměně za razítka', popis: 'Hosté, kterým v aktivní razítkové kampani chybí jedno nebo dvě razítka.' },
  { id: 'near:points', label: 'Blízko kuponu za body', popis: 'Hosté, kterým chybí jen pár bodů na nejbližší kupon.' },
  { id: 'new:14', label: 'Noví členové z posledních dvou týdnů', popis: 'Hosté, kteří se přidali v posledních 14 dnech.' },
];

export function jeSegment(a: string): boolean {
  return SEGMENTY.some(s => s.id === a);
}

/** Člověku srozumitelný název publika (pro historii zpráv). */
export function stitekPublika(a: string, nazevSkupiny?: string | null): string | null {
  if (a === 'selection') return 'vybraní hosté';
  const s = SEGMENTY.find(x => x.id === a);
  if (s) return s.label.charAt(0).toLowerCase() + s.label.slice(1);
  if (a === 'tier:silver') return 'stříbrní a výš';
  if (a === 'tier:gold' || a === 'gold') return 'zlatí hosté';
  if (a === 'tier:platinum') return 'platinoví';
  if (a.startsWith('group:')) return nazevSkupiny ? `skupina ${nazevSkupiny}` : 'skupina';
  return null;
}

export interface ClenSegmentu {
  id: number;
  lastVisitAt: Date | string | null;
  joinedAt: Date | string | null;
  /** YYYY-MM-DD, nebo null, když host datum nezadal. */
  birthday: string | null;
  /** Kolik razítek chybí do nejbližší odměny (jen kampaně, kde už host něco má), nebo null. */
  chybiRazitek: number | null;
  points: number;
}

export interface KontextSegmentu {
  now: Date;
  /** Měsíc 1 až 12 podle pražského času. */
  mesic: number;
  /** Ceny aktivních kuponů za body. */
  cenyKuponu: number[];
}

/** Čas z databáze (TIMESTAMP bez pásma je v UTC). Neplatný nebo prázdný vstup dá null. */
export function casZDb(v: Date | string | null | undefined): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v);
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Celé dny od času do teď (nikdy záporné). */
export function dnuOd(v: Date | string | null | undefined, now: Date): number | null {
  const d = casZDb(v);
  if (!d) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / DEN_MS));
}

/** Je hostovi dost blízko k některému kuponu, na který ještě nemá body? */
export function blizkoKuponu(points: number, ceny: number[]): boolean {
  const p = Math.max(0, Number(points) || 0);
  const dalsi = ceny.filter(c => c > p).sort((a, b) => a - b)[0];
  if (dalsi == null) return false;
  const limit = Math.max(BLIZKO_KUPONU_MIN, Math.round(dalsi * BLIZKO_KUPONU_PODIL));
  return dalsi - p <= limit;
}

/** Patří člen do segmentu? Neznámý segment nepatří nikomu. */
export function patriDoSegmentu(seg: string, c: ClenSegmentu, k: KontextSegmentu): boolean {
  if (seg === 'quiet' || seg === 'quiet:60' || seg === 'quiet:90') {
    const dni = seg === 'quiet' ? 30 : parseInt(seg.slice(6), 10);
    // Host bez návštěvy se měří od přidání; bez obojího (stará data) je spáč.
    const odkdy = dnuOd(c.lastVisitAt, k.now) ?? dnuOd(c.joinedAt, k.now);
    return odkdy == null || odkdy >= dni;
  }
  if (seg === 'birthday:month') {
    const m = /^\d{4}-(\d{2})-\d{2}/.exec(String(c.birthday ?? ''));
    return !!m && parseInt(m[1], 10) === k.mesic;
  }
  if (seg === 'near:stamps') return c.chybiRazitek != null && c.chybiRazitek >= 1 && c.chybiRazitek <= BLIZKO_RAZITEK;
  if (seg === 'near:points') return blizkoKuponu(c.points, k.cenyKuponu);
  if (seg === 'new:14') {
    const d = dnuOd(c.joinedAt, k.now);
    return d != null && d < NOVY_CLEN_DNI;
  }
  return false;
}

export function vyberClenu(seg: string, clenove: ClenSegmentu[], k: KontextSegmentu): number[] {
  return clenove.filter(c => patriDoSegmentu(seg, c, k)).map(c => c.id);
}

export function spoctiSegmenty(clenove: ClenSegmentu[], k: KontextSegmentu): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of SEGMENTY) out[s.id] = vyberClenu(s.id, clenove, k).length;
  return out;
}

/**
 * „Chybíš nám“: host už aspoň jednou přišel, od poslední návštěvy uplynulo
 * aspoň `dni` dní (přesně N dní už stačí) a méně než dni + okno. Dnešní návštěva,
 * host bez návštěvy a vypnuté pravidlo (dni <= 0) dávají false.
 */
export function maDostatChybisNam(posledniNavsteva: Date | string | null | undefined, dni: number, now: Date): boolean {
  const n = Math.floor(Number(dni) || 0);
  if (n <= 0) return false;
  const d = dnuOd(posledniNavsteva, now);
  if (d == null) return false;
  return d >= n && d < n + REAKTIVACE_OKNO_DNI;
}

/** Klíč do deníku: jedna zpráva na jednu odmlku, tedy na jednu poslední návštěvu. */
export function refChybisNam(posledniNavsteva: Date | string): string {
  const d = casZDb(posledniNavsteva);
  return `react:${d ? d.toISOString().slice(0, 10) : 'neznamy'}`;
}

/** Text oznámení „Chybíš nám“. */
export function textChybisNam(nazev: string, dni: number, body: number): { title: string; body: string } {
  const dnu = czCount(dni, { one: 'den', few: 'dny', many: 'dní' });
  return {
    title: `Chybíš nám, ${nazev}`,
    body: body > 0
      ? `Už je to ${dnu}. Přijď se podívat, na kartičce na tebe čeká ${czCount(body, { one: 'bod', few: 'body', many: 'bodů' })} navíc.`
      : `Už je to ${dnu}. Přijď se podívat, rádi tě zase uvidíme.`,
  };
}
