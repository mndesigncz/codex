// Seznam členů: filtry, řazení, stránkování, pravidla dynamických skupin a CSV.
// Čistá logika bez databáze (testy: scripts/testy/k81-clenove.ts). Členy načítá
// lib/clenoveDb.ts jedním dotazem a tady se z nich vybírá, takže seznam, export,
// hromadné akce i dynamické skupiny rozhodují o členství stejnou funkcí.

import { dnuOd } from './segmenty.ts';
import { proHledani } from './hledani.ts';
import { czCount } from './czech.ts';

/** Člen tak, jak ho vrací dotaz (jen to, podle čeho se filtruje a řadí). */
export interface ClenFiltrovany {
  id: number;
  name: string;
  email?: string | null;
  /** YYYY-MM-DD, nebo null, když host datum nezadal. */
  birthday?: string | null;
  points: number;
  stamps: number;
  visits: number;
  spend: number;
  credit?: number;
  joined_at: Date | string | null;
  last_visit_at: Date | string | null;
  open_coupons: number;
  /** id úrovně (bronze, silver, gold, platinum). */
  level?: string;
}

export interface FiltrClenu {
  q: string;
  level: string;
  /** Skupina (id), nebo 0 = bez omezení. */
  group: number;
  /** Nepřišel aspoň N dní, nebo 0 = bez omezení. */
  quietDays: number;
  birthdayMonth: boolean;
  openCoupon: boolean;
  /** Útrata aspoň X (celé jednotky měny), nebo 0 = bez omezení. */
  spendOver: number;
}

export const PRAZDNY_FILTR: FiltrClenu = { q: '', level: '', group: 0, quietDays: 0, birthdayMonth: false, openCoupon: false, spendOver: 0 };

export const UROVNE_ID = ['bronze', 'silver', 'gold', 'platinum'] as const;
export const MAX_NEAKTIVNI_DNI = 3650;
export const MAX_UTRATA_FILTR = 100_000_000;
export const STRANKA_VYCHOZI = 50;
export const STRANKA_MAX = 200;
/** Strop hromadné akce nad celým filtrem (jeden člen = jeden zápis). */
export const HROMADNA_MAX = 2000;
/** Víc bodů v jedné hromadné akci nerozdáš: překlep v bonusu nesmí vyprázdnit rozpočet věrnosti. */
export const BONUS_CELKEM_MAX = 1_000_000;

type Zdroj = URLSearchParams | Record<string, unknown>;
const cti = (z: Zdroj, k: string): unknown => (z instanceof URLSearchParams ? z.get(k) : z[k]);
const celeCislo = (v: unknown, max: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};
const jeAno = (v: unknown) => v === true || v === '1' || v === 'true' || v === 'ano';

/** Filtr z URL nebo těla požadavku. Nesmyslné hodnoty se tiše zahodí (= bez omezení). */
export function normalizujFiltr(z: Zdroj): FiltrClenu {
  const level = String(cti(z, 'level') ?? '');
  return {
    q: String(cti(z, 'q') ?? '').trim().slice(0, 80),
    level: (UROVNE_ID as readonly string[]).includes(level) ? level : '',
    group: celeCislo(cti(z, 'group'), 2_000_000_000),
    quietDays: celeCislo(cti(z, 'quietDays'), MAX_NEAKTIVNI_DNI),
    birthdayMonth: jeAno(cti(z, 'birthdayMonth')),
    openCoupon: jeAno(cti(z, 'openCoupon')),
    spendOver: celeCislo(cti(z, 'spendOver'), MAX_UTRATA_FILTR),
  };
}

/** Filtr jako parametry adresy (jen to, co je nastavené). */
export function filtrNaParametry(f: FiltrClenu): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.level) p.set('level', f.level);
  if (f.group) p.set('group', String(f.group));
  if (f.quietDays) p.set('quietDays', String(f.quietDays));
  if (f.birthdayMonth) p.set('birthdayMonth', '1');
  if (f.openCoupon) p.set('openCoupon', '1');
  if (f.spendOver) p.set('spendOver', String(f.spendOver));
  return p;
}

/** Kolik podmínek je zapnutých (bez hledání textu): pro štítek „Filtry (2)". */
export function pocetFiltru(f: FiltrClenu): number {
  return [f.level, f.group, f.quietDays, f.birthdayMonth, f.openCoupon, f.spendOver].filter(Boolean).length;
}

export interface KontextFiltru {
  now: Date;
  /** Měsíc 1 až 12 podle pražského času. */
  mesic: number;
  /** Skupiny hosta (id) — jen když se filtruje podle skupiny. */
  skupinyHosta?: (id: number) => ReadonlySet<number> | undefined;
  /** Smí volající hledat podle e-mailu? */
  hledatEmail?: boolean;
}

/** Neaktivní N dní: od poslední návštěvy (bez ní od přidání; bez obojího vždy). Stejné pravidlo jako segment „quiet". */
export function jeNeaktivni(c: Pick<ClenFiltrovany, 'last_visit_at' | 'joined_at'>, dni: number, now: Date): boolean {
  if (dni <= 0) return true;
  const odkdy = dnuOd(c.last_visit_at, now) ?? dnuOd(c.joined_at, now);
  return odkdy == null || odkdy >= dni;
}

export function maNarozeninyVMesici(birthday: string | null | undefined, mesic: number): boolean {
  const m = /^\d{4}-(\d{2})-\d{2}/.exec(String(birthday ?? ''));
  return !!m && parseInt(m[1], 10) === mesic;
}

export function splnujeFiltr(c: ClenFiltrovany, f: FiltrClenu, k: KontextFiltru): boolean {
  if (f.q) {
    const d = proHledani(f.q);
    const jmeno = proHledani(c.name).includes(d);
    const mail = !!k.hledatEmail && proHledani(c.email).includes(d);
    if (!jmeno && !mail) return false;
  }
  if (f.level && (c.level ?? 'bronze') !== f.level) return false;
  if (f.group && !k.skupinyHosta?.(c.id)?.has(f.group)) return false;
  if (f.quietDays && !jeNeaktivni(c, f.quietDays, k.now)) return false;
  if (f.birthdayMonth && !maNarozeninyVMesici(c.birthday, k.mesic)) return false;
  if (f.openCoupon && !(Number(c.open_coupons) > 0)) return false;
  if (f.spendOver && !(Number(c.spend) >= f.spendOver)) return false;
  return true;
}

export type RazeniClenu = 'posledni' | 'jmeno' | 'body' | 'navstevy' | 'utrata' | 'nejnovejsi' | 'neaktivni';
export const RAZENI: { id: RazeniClenu; label: string }[] = [
  { id: 'posledni', label: 'Naposledy u nás' },
  { id: 'neaktivni', label: 'Nejdéle nebyli' },
  { id: 'jmeno', label: 'Jméno A až Z' },
  { id: 'body', label: 'Nejvíc bodů' },
  { id: 'navstevy', label: 'Nejvíc návštěv' },
  { id: 'utrata', label: 'Nejvyšší útrata' },
  { id: 'nejnovejsi', label: 'Nově přidaní' },
];

export function normalizujRazeni(v: unknown): RazeniClenu {
  const s = String(v ?? '');
  // Staré hodnoty widgetu „Členové klubu" (kolo 69) zůstávají platné.
  return RAZENI.some(r => r.id === s) ? (s as RazeniClenu) : 'posledni';
}

const cas = (v: unknown): number => {
  if (v == null || v === '') return 0;
  const t = v instanceof Date ? v.getTime() : new Date(String(v).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? '' : 'Z')).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** Stabilní řazení; shoda se řeší podle jména a id, ať stránky po sobě nepřeskakují řádky. */
export function seradCleny<T extends ClenFiltrovany>(rows: T[], razeni: RazeniClenu): T[] {
  const klic: Record<RazeniClenu, (c: T) => number> = {
    // Hosté bez návštěvy až za ty, kdo už byli.
    posledni: c => (cas(c.last_visit_at) ? -cas(c.last_visit_at) : Number.MAX_SAFE_INTEGER),
    neaktivni: c => (cas(c.last_visit_at) || cas(c.joined_at)),
    jmeno: () => 0,
    body: c => -(Number(c.points) || 0),
    navstevy: c => -(Number(c.visits) || 0),
    utrata: c => -(Number(c.spend) || 0),
    nejnovejsi: c => -(cas(c.joined_at)),
  };
  const f = klic[razeni];
  return rows.slice().sort((a, b) => {
    const d = f(a) - f(b);
    if (d !== 0) return d;
    return String(a.name).localeCompare(String(b.name), 'cs') || a.id - b.id;
  });
}

export interface Stranka<T> { rows: T[]; total: number; offset: number; hasMore: boolean; nextOffset: number | null }

/** Výřez stránky. Neplatný offset nebo limit se opraví, strop stránky je STRANKA_MAX. */
export function strankuj<T>(rows: T[], offsetRaw: unknown, limitRaw: unknown): Stranka<T> {
  const limit = Math.min(STRANKA_MAX, Math.max(1, Math.floor(Number(limitRaw)) || STRANKA_VYCHOZI));
  const offset = Math.max(0, Math.floor(Number(offsetRaw)) || 0);
  const out = rows.slice(offset, offset + limit);
  const konec = offset + out.length;
  const hasMore = konec < rows.length;
  return { rows: out, total: rows.length, offset, hasMore, nextOffset: hasMore ? konec : null };
}

// ---- Dynamické skupiny ------------------------------------------------------------

export interface PravidlaSkupiny {
  /** Nepřišli aspoň N dní. */
  quietDays?: number;
  /** Celková útrata aspoň X. */
  spendOver?: number;
  /** Mají narozeniny tento měsíc. */
  birthdayMonth?: boolean;
}

/** Pravidla z těla požadavku; bez jediné platné podmínky null (= ruční skupina). */
export function normalizujPravidla(raw: unknown): PravidlaSkupiny | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: PravidlaSkupiny = {};
  const q = celeCislo(r.quietDays, MAX_NEAKTIVNI_DNI);
  if (q) out.quietDays = q;
  const s = celeCislo(r.spendOver, MAX_UTRATA_FILTR);
  if (s) out.spendOver = s;
  if (jeAno(r.birthdayMonth)) out.birthdayMonth = true;
  return Object.keys(out).length ? out : null;
}

/** Zkontroluje pravidla z formuláře a vrátí českou chybu, nebo null. */
export function chybaPravidel(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'object') return 'Pravidla skupiny jsou ve špatném tvaru.';
  const r = raw as Record<string, unknown>;
  const q = r.quietDays, s = r.spendOver;
  if (q !== undefined && q !== null && q !== '' && !(Number(q) >= 1 && Number(q) <= MAX_NEAKTIVNI_DNI)) return `Počet dní bez návštěvy musí být od 1 do ${MAX_NEAKTIVNI_DNI}.`;
  if (s !== undefined && s !== null && s !== '' && !(Number(s) >= 1 && Number(s) <= MAX_UTRATA_FILTR)) return 'Útrata musí být kladné číslo.';
  return normalizujPravidla(raw) ? null : 'Zapni aspoň jedno pravidlo, jinak by skupina nebyla nikdy naplněná.';
}

export function patriDoPravidel(c: ClenFiltrovany, p: PravidlaSkupiny, k: Pick<KontextFiltru, 'now' | 'mesic'>): boolean {
  return splnujeFiltr(c, { ...PRAZDNY_FILTR, quietDays: p.quietDays ?? 0, spendOver: p.spendOver ?? 0, birthdayMonth: !!p.birthdayMonth }, k);
}

export function vyberPodlePravidel<T extends ClenFiltrovany>(clenove: T[], p: PravidlaSkupiny, k: Pick<KontextFiltru, 'now' | 'mesic'>): number[] {
  return clenove.filter(c => patriDoPravidel(c, p, k)).map(c => c.id);
}

/** Pravidla česky: „Nepřišli 60 dní a déle · útrata nad 2 000 Kč · narozeniny tento měsíc". */
export function popisPravidel(p: PravidlaSkupiny | null | undefined, money: (n: number) => string): string {
  if (!p) return '';
  const out: string[] = [];
  if (p.quietDays) out.push(`nepřišli ${czCount(p.quietDays, { one: 'den', few: 'dny', many: 'dní' })} a déle`);
  if (p.spendOver) out.push(`útrata od ${money(p.spendOver)}`);
  if (p.birthdayMonth) out.push('narozeniny tento měsíc');
  const t = out.join(' · ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---- Barva skupiny ----------------------------------------------------------------

export const BARVY_SKUPIN = [
  { id: 'sage', label: 'Zelená', tone: 'ok' },
  { id: 'amber', label: 'Jantarová', tone: 'wait' },
  { id: 'sky', label: 'Modrá', tone: 'info' },
  { id: 'rose', label: 'Červená', tone: 'bad' },
  { id: 'ink', label: 'Tmavá', tone: 'ink' },
  { id: 'slate', label: 'Šedá', tone: 'muted' },
] as const;
export type BarvaSkupiny = typeof BARVY_SKUPIN[number]['id'];

export function normalizujBarvu(v: unknown): BarvaSkupiny | null {
  const s = String(v ?? '');
  return BARVY_SKUPIN.some(b => b.id === s) ? (s as BarvaSkupiny) : null;
}

export function tonBarvy(v: unknown): 'ok' | 'wait' | 'info' | 'bad' | 'ink' | 'muted' {
  return BARVY_SKUPIN.find(b => b.id === v)?.tone ?? 'muted';
}

// ---- CSV --------------------------------------------------------------------------

/**
 * Buňka CSV. Uvozovky tam, kde by bez nich soubor rozbil oddělovač nebo řádek.
 * Text začínající = + - @ (nebo tabulátorem) by Excel vzal za vzorec; jméno hosta si
 * volí host sám, takže se před něj dává apostrof (CSV injection).
 */
export function bunkaCsv(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface RadekExportu {
  name: string;
  email?: string | null;
  level_label?: string;
  points: number;
  credit?: number;
  stamps: number;
  visits: number;
  spend: number;
  joined: string;
  lastVisit: string;
  groups?: string;
}

/** CSV se středníkem (český Excel) a BOM (diakritika). E-mail a kredit jen když je volající smí vidět. */
export function sestavCsvClenu(rows: RadekExportu[], sEmailem: boolean, sKreditem = true): string {
  const hlavicka = ['jméno', ...(sEmailem ? ['e-mail'] : []), 'úroveň', 'body', ...(sKreditem ? ['kredit'] : []), 'razítka', 'návštěvy', 'útrata', 'člen od', 'naposledy', 'skupiny'];
  const radky = rows.map(r => [
    r.name, ...(sEmailem ? [r.email ?? ''] : []), r.level_label ?? '', r.points, ...(sKreditem ? [r.credit ?? 0] : []), r.stamps, r.visits, r.spend, r.joined, r.lastVisit, r.groups ?? '',
  ].map(bunkaCsv).join(';'));
  return '﻿' + [hlavicka.map(bunkaCsv).join(';'), ...radky].join('\r\n') + '\r\n';
}

// ---- Hromadné akce ----------------------------------------------------------------

/** Akce nad výběrem, které řeší tenhle endpoint. Kupon vybraným jde přes okno posílání kuponů (coupons/send). */
export const HROMADNE_AKCE = ['group', 'points', 'message'] as const;
export type HromadnaAkce = typeof HROMADNE_AKCE[number];

/** Bonus bodů hromadně: celé číslo 1 až 10 000 (záporné odečítání dělá jen úprava jednoho hosta). */
export function chybaBonusu(delta: unknown): string | null {
  const n = Number(delta);
  if (!Number.isInteger(n) || n < 1) return 'Bonus musí být celé kladné číslo bodů.';
  if (n > 10_000) return 'Bonus může být nejvýš 10 000 bodů na hosta.';
  return null;
}

/** Klíč pokusu z prohlížeče (dvojklik, opakované odeslání): jen bezpečné znaky a rozumná délka. */
export function normalizujKlicAkce(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : null;
}
