// Výpočty pro widgety a nástroj stránky Uzávěrky (kolo 69, balík B5a).
//
// Čistý modul bez Reactu: počítá ho plocha (components/widgety/oblasti/
// uzaverky.tsx), seznam uzávěrek (ClosingsOverview) i jednotkové testy
// (scripts/testy/k69-b5a.ts). Dřív žily tytéž součty rozepsané přímo
// v ClosingsOverview a každý blok si je spočítal po svém — trend tržeb
// dokonce přes `toISOString()`, takže po 22:00 pražského času padl dnešek
// do zítřka. Tady se počítá jen s řetězci „RRRR-MM-DD".
//
// Proč tu nejsou peníze bez oprávnění: API tržbová pole cizích uzávěrek
// roli bez finance.trzby maže (`trzbaSkryta`). Dřív z toho vyšlo
// undefined → NaN → „0 Kč" a červený „Rozdíl kasy 0 Kč" (nález N3). Každá
// funkce tady takový řádek pozná a výsledek označí `skryto` — widget pak
// číslo nekreslí vůbec, místo aby ukázal nulu.

import { cashDifference, type Closing } from './closing.ts';
import { dayPlus } from './pragueTime.ts';

/** Řádek z GET /api/closings (sdílený typ + pole, která vrací jen seznam). */
export type RadekUzaverky = Closing & {
  approved?: boolean;
  covered_by?: number | null;
  shift_date?: string | null;
  trzbaSkryta?: boolean;
  event_title?: string | null;
};

// ---------------------------------------------------------------------------
// Předávání mezi widgetem a nástrojem
// ---------------------------------------------------------------------------

/**
 * Widget „Chybějící uzávěrky" nebo „Moje uzávěrka" žádá o vyplnění za den.
 * Na stránce s formulářem ho nástroj slyší hned (událost), jinde si žádost
 * počká v sessionStorage, než se nástroj po přechodu na stránku připojí.
 * Layout (EmployerLayout, EmployeeLayout) argument pohledu Uzávěrkám
 * nepředává a patří jinému balíku — proto tahle cesta místo `arg`.
 */
export const UDALOST_VYPLNIT = 'managero:uzaverka-vyplnit';
export const KLIC_VYPLNIT = 'managero-uzaverka-vyplnit';
/** Klepnutí na den v kalendáři: seznam uzávěrek se zúží na ten den. */
export const UDALOST_DEN = 'managero:uzaverky-den';
export const KLIC_DEN = 'managero-uzaverky-den';

// ---------------------------------------------------------------------------
// Dny a období
// ---------------------------------------------------------------------------

/** Obchodní den uzávěrky (směna přes půlnoc patří dni, kdy začala). */
export function denUzaverky(c: { date: string; shift_date?: string | null }): string {
  return String(c.shift_date ?? c.date ?? '').slice(0, 10);
}

/** Uzávěrka „za celou směnu", ne pomocný řádek kolegy, za kterého někdo zavřel. */
export const jeHlavni = (c: { covered_by?: number | null }) => c.covered_by == null;

export type ObdobiSouhrnu = 'tento_mesic' | 'minuly_mesic' | 'vse';

export function mesicPred(mesic: string, o = 1): string {
  const [y, m] = mesic.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - o, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function vObdobi(den: string, obdobi: ObdobiSouhrnu, dnes: string): boolean {
  if (!den) return false;
  if (obdobi === 'vse') return true;
  const mesic = obdobi === 'tento_mesic' ? dnes.slice(0, 7) : mesicPred(dnes.slice(0, 7));
  return den.slice(0, 7) === mesic;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const skryty = (c: RadekUzaverky) => c.trzbaSkryta === true || c.cash_revenue == null || c.closing_cash == null;

// ---------------------------------------------------------------------------
// Souhrn (čtyři čísla z bývalých dlaždic)
// ---------------------------------------------------------------------------

export interface Souhrn {
  pocet: number;
  hotove: number;
  kartou: number;
  trzba: number;
  spropitne: number;
  vyplaceno: number;
  odvedeno: number;
  rozdil: number;
  /** Aspoň jedna uzávěrka přišla bez tržby — čísla by lhala, widget je nekreslí. */
  skryto: boolean;
}

export function souhrnUzaverek(radky: readonly RadekUzaverky[], obdobi: ObdobiSouhrnu, dnes: string): Souhrn {
  const s: Souhrn = { pocet: 0, hotove: 0, kartou: 0, trzba: 0, spropitne: 0, vyplaceno: 0, odvedeno: 0, rozdil: 0, skryto: false };
  for (const c of radky) {
    if (!vObdobi(denUzaverky(c), obdobi, dnes)) continue;
    if (skryty(c)) { s.skryto = true; continue; }
    // Výplata kolegy „za kterého se zavřelo" z kasy opravdu odešla — počítá
    // se i u pomocného řádku. Tržba a rozdíl u něj jsou fantom (nuly).
    s.vyplaceno += num(c.self_payout);
    s.odvedeno += num(c.cash_removed) + num(c.final_removal);
    if (!jeHlavni(c)) continue;
    s.pocet++;
    s.hotove += num(c.cash_revenue);
    s.kartou += num(c.card_revenue);
    s.spropitne += num(c.tips);
    s.rozdil += cashDifference(c);
  }
  s.trzba = s.hotove + s.kartou;
  return s;
}

// ---------------------------------------------------------------------------
// Rozdíl pokladny
// ---------------------------------------------------------------------------

export interface DenSRozdilem { den: string; rozdil: number; autor: string | null }
export interface RozdilKasy {
  soucet: number;
  absolutne: number;
  /** Dny, kde součet rozdílů přesáhl práh (v absolutní hodnotě), nejnovější první. */
  dny: DenSRozdilem[];
  porovnano: number;
  skryto: boolean;
}

export function rozdilKasy(radky: readonly RadekUzaverky[], obdobi: '7_dni' | 'tento_mesic', prah: number, dnes: string): RozdilKasy {
  const od = obdobi === '7_dni' ? dayPlus(dnes, -6) : `${dnes.slice(0, 7)}-01`;
  const poDnech = new Map<string, { rozdil: number; autori: Set<string> }>();
  let skryto = false;
  for (const c of radky) {
    const den = denUzaverky(c);
    if (!jeHlavni(c) || den < od || den > dnes) continue;
    if (skryty(c)) { skryto = true; continue; }
    const d = poDnech.get(den) ?? { rozdil: 0, autori: new Set<string>() };
    const r = cashDifference(c);
    d.rozdil += r;
    if (r !== 0 && c.author_name) d.autori.add(c.author_name);
    poDnech.set(den, d);
  }
  let soucet = 0, absolutne = 0;
  const dny: DenSRozdilem[] = [];
  for (const [den, d] of poDnech) {
    soucet += d.rozdil;
    absolutne += Math.abs(d.rozdil);
    if (Math.abs(d.rozdil) > Math.max(0, prah)) dny.push({ den, rozdil: d.rozdil, autor: [...d.autori].join(', ') || null });
  }
  dny.sort((a, b) => b.den.localeCompare(a.den));
  return { soucet, absolutne, dny, porovnano: poDnech.size, skryto };
}

// ---------------------------------------------------------------------------
// Trendy tržeb
// ---------------------------------------------------------------------------

export interface Trendy {
  tentoTyden: number;
  minulyTyden: number;
  /** Změna v % proti stejným dnům minulého týdne; null, když minulý týden nic neutržil. */
  zmena: number | null;
  /** 0 = pondělí … 6 = neděle */
  nejsilnejsiDen: number;
  prumerNejsilnejsiho: number;
  rekordDen: string;
  rekord: number;
  skryto: boolean;
}

/** Den v týdnu (0 = pondělí) z „RRRR-MM-DD" — v UTC, ať nerozhoduje pásmo prohlížeče. */
export function denVTydnu(den: string): number {
  const [y, m, d] = den.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * Tento týden (od pondělí do dneška) proti stejně dlouhému úseku minulého
 * týdne, nejsilnější den v týdnu podle průměru a rekordní den. Méně než
 * čtyři dny s tržbou = null (trend z tří čísel je náhoda, ne trend).
 */
export function trendyTrzeb(radky: readonly RadekUzaverky[], dnes: string): Trendy | null {
  const poDnech = new Map<string, number>();
  let skryto = false;
  for (const c of radky) {
    if (!jeHlavni(c)) continue;
    if (skryty(c)) { skryto = true; continue; }
    const den = denUzaverky(c);
    if (den) poDnech.set(den, (poDnech.get(den) ?? 0) + num(c.cash_revenue) + num(c.card_revenue));
  }
  if (skryto && poDnech.size === 0) return { tentoTyden: 0, minulyTyden: 0, zmena: null, nejsilnejsiDen: 0, prumerNejsilnejsiho: 0, rekordDen: '', rekord: 0, skryto: true };
  if (poDnech.size < 4) return null;
  const idx = denVTydnu(dnes);
  const pondeli = dayPlus(dnes, -idx);
  const soucet = (od: string, dni: number) => {
    let s = 0;
    for (let i = 0; i < dni; i++) s += poDnech.get(dayPlus(od, i)) ?? 0;
    return s;
  };
  const tentoTyden = soucet(pondeli, idx + 1);
  const minulyTyden = soucet(dayPlus(pondeli, -7), idx + 1);
  const sumy = new Array(7).fill(0), pocty = new Array(7).fill(0);
  for (const [den, v] of poDnech) { const w = denVTydnu(den); sumy[w] += v; pocty[w]++; }
  let nejsilnejsiDen = 0, prumerNejsilnejsiho = 0;
  for (let i = 0; i < 7; i++) {
    const p = pocty[i] ? sumy[i] / pocty[i] : 0;
    if (p > prumerNejsilnejsiho) { prumerNejsilnejsiho = p; nejsilnejsiDen = i; }
  }
  let rekordDen = '', rekord = 0;
  for (const [den, v] of poDnech) if (v > rekord) { rekord = v; rekordDen = den; }
  return {
    tentoTyden, minulyTyden,
    zmena: minulyTyden > 0 ? ((tentoTyden - minulyTyden) / minulyTyden) * 100 : null,
    nejsilnejsiDen, prumerNejsilnejsiho: Math.round(prumerNejsilnejsiho), rekordDen, rekord, skryto,
  };
}

export const DNY_V_TYDNU = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];

// ---------------------------------------------------------------------------
// Fronty: chybějící a ke schválení
// ---------------------------------------------------------------------------

export interface ClovekNaSmene { id: number; name: string; avatar?: string | null }
export interface ChybejiciDen { date: string; employees: ClovekNaSmene[] }

/**
 * Dny bez uzávěrky. Server je od kola 69 vrací jen do včerejška (N9) a dnešek
 * zvlášť (`missingToday`); filtr na „< dnes" tu zůstává i tak — starší
 * odpověď ze sdílené mezipaměti nebo zastaralý server by jinak rozsvítil
 * běžící směnu jako chybějící uzávěrku.
 */
export function chybejiciDny(raw: { missingClosings?: unknown; missingToday?: unknown }, dnes: string, vcetneDneska: boolean): { dny: ChybejiciDen[]; dnes: ChybejiciDen | null } {
  const tvar = (x: any): ChybejiciDen | null => {
    if (!x || typeof x !== 'object' || typeof x.date !== 'string') return null;
    const employees = Array.isArray(x.employees)
      ? x.employees.filter((e: any) => e && typeof e.name === 'string').map((e: any) => ({ id: Number(e.id), name: String(e.name), avatar: e.avatar ?? null }))
      : [];
    return { date: x.date.slice(0, 10), employees };
  };
  const vse = (Array.isArray(raw.missingClosings) ? raw.missingClosings : []).map(tvar).filter((x): x is ChybejiciDen => !!x);
  const dny = vse.filter(d => d.date < dnes).sort((a, b) => b.date.localeCompare(a.date));
  const dnesni = tvar(raw.missingToday) ?? vse.find(d => d.date === dnes) ?? null;
  return { dny, dnes: vcetneDneska && dnesni && dnesni.date === dnes ? dnesni : null };
}

/** Uzávěrky odeslané bez směny, které čekají na schválení (pomocné řádky nikdy). */
export function keSchvaleni(radky: readonly RadekUzaverky[]): RadekUzaverky[] {
  return radky.filter(c => c.approved === false && jeHlavni(c))
    .sort((a, b) => denUzaverky(b).localeCompare(denUzaverky(a)));
}

/** Rozdíl kasy jedné uzávěrky, nebo null, když ho role nesmí vidět (bez tržby ho nejde spočítat). */
export function rozdilUzaverky(c: RadekUzaverky): number | null {
  return skryty(c) || !jeHlavni(c) ? null : cashDifference(c);
}

// ---------------------------------------------------------------------------
// Kalendář
// ---------------------------------------------------------------------------

export interface DenKalendare {
  onShift: { id: number; name: string; avatar: string | null; hadClosing?: boolean }[];
  closedBy: { id: number; name: string; avatar: string | null }[];
  hasClosing: boolean;
  missing: boolean;
  revenue?: number;
}
export type StavDne = 'hotovo' | 'chybi' | 'ceka' | 'nic';

/** Hotovo = někdo zavřel; chybí = pracovalo se, den skončil a uzávěrka není; čeká = dnešek (nebo budoucí) bez uzávěrky. */
export function stavDne(den: DenKalendare | undefined, datum: string, dnes: string): StavDne {
  if (!den) return 'nic';
  if (den.hasClosing) return 'hotovo';
  if (!den.onShift?.length) return 'nic';
  return datum < dnes ? 'chybi' : 'ceka';
}

/** Buňky měsíce (null = výplň před 1. a po posledním dni), týden začíná `zacatek` (0 = neděle, 1 = pondělí). */
export function bunkyMesice(mesic: string, zacatek: number): (string | null)[] {
  const [y, m] = mesic.split('-').map(Number);
  const prvni = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const pred = (prvni - zacatek + 7) % 7;
  const dni = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: (string | null)[] = Array.from({ length: pred }, () => null);
  for (let d = 1; d <= dni; d++) out.push(`${mesic}-${String(d).padStart(2, '0')}`);
  while (out.length % 7) out.push(null);
  return out;
}

// ---------------------------------------------------------------------------
// Moje uzávěrky
// ---------------------------------------------------------------------------

/** Vlastní uzávěrky (autor já), nejnovější první. Kdo vidí všechny, dostane ze seznamu jen své. */
export function mojeUzaverky(radky: readonly RadekUzaverky[], meId: number | null): RadekUzaverky[] {
  return radky
    .filter(c => meId == null || Number(c.created_by) === meId)
    .sort((a, b) => denUzaverky(b).localeCompare(denUzaverky(a)) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
}
