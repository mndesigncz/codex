// Jednotný model období pro grafy a přehledy v celé aplikaci.
//
// Dřív měl každý widget vlastní pár přednastavených voleb (7 dní / 30 dní / tento měsíc…) a nešlo zvolit „od–do",
// jen pondělky nebo půl roku. Tohle je jedno místo, které umí: rychlé volby (dnes, týden, měsíc, 3 měsíce, půl roku, rok),
// vlastní rozmezí, výběr dnů v týdnu, hrubost grafu (den / týden / měsíc) a „předchozí období stejné délky" pro srovnání.
// Čistá logika bez Reactu; UI je components/ui/ObdobiLista, graf components/ui/CasovyGraf.
import { dayPlus, pragueToday } from './pragueTime.ts';

export type PresetObdobi = 'dnes' | 'vcera' | 'tyden' | '7_dni' | 'mesic' | '30_dni' | 'minuly_mesic' | '90_dni' | '180_dni' | '365_dni';
export type IdObdobi = PresetObdobi | 'vlastni';
export type Hrubost = 'auto' | 'den' | 'tyden' | 'mesic';

export interface Obdobi {
  preset: IdObdobi;
  /** „RRRR-MM-DD" včetně. U presetu se přepočítává z dneška (`vyresObdobi`), u `vlastni` platí tohle. */
  od: string;
  do: string;
  /** Jen tyhle dny v týdnu (0 = pondělí … 6 = neděle); prázdné = všechny. */
  dnyTydne: number[];
  hrubost: Hrubost;
}

/** Rychlé volby v pořadí, v jakém je ukazuje lišta (kratší → delší), s krátkým popiskem. */
export const RYCHLE_VOLBY: { id: PresetObdobi; popisek: string }[] = [
  { id: 'dnes', popisek: 'Dnes' },
  { id: '7_dni', popisek: '7 dní' },
  { id: '30_dni', popisek: '30 dní' },
  { id: 'mesic', popisek: 'Měsíc' },
  { id: '90_dni', popisek: '3 měsíce' },
  { id: '180_dni', popisek: '6 měsíců' },
  { id: '365_dni', popisek: 'Rok' },
];

const MAX_DNI = 800;

/** 0 = pondělí … 6 = neděle (poledne UTC, ať se den nepřehoupne podle pásma zařízení). */
export const dnTydne = (d: string): number => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
export const pondeli = (d: string): string => dayPlus(d, -dnTydne(d));
const prvniDenMesice = (d: string) => `${d.slice(0, 7)}-01`;
const posledniDenMesice = (d: string) => {
  const [r, m] = d.split('-').map(Number);
  return `${d.slice(0, 7)}-${String(new Date(Date.UTC(r, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** Rozmezí rychlé volby k danému „dnes". */
export function vyresPreset(p: PresetObdobi, dnes: string = pragueToday()): { od: string; do: string } {
  switch (p) {
    case 'dnes': return { od: dnes, do: dnes };
    case 'vcera': return { od: dayPlus(dnes, -1), do: dayPlus(dnes, -1) };
    case 'tyden': return { od: pondeli(dnes), do: dnes };
    case '7_dni': return { od: dayPlus(dnes, -6), do: dnes };
    case 'mesic': return { od: prvniDenMesice(dnes), do: dnes };
    case '30_dni': return { od: dayPlus(dnes, -29), do: dnes };
    case 'minuly_mesic': { const m = dayPlus(prvniDenMesice(dnes), -1); return { od: prvniDenMesice(m), do: posledniDenMesice(m) }; }
    case '90_dni': return { od: dayPlus(dnes, -89), do: dnes };
    case '180_dni': return { od: dayPlus(dnes, -179), do: dnes };
    case '365_dni': return { od: dayPlus(dnes, -364), do: dnes };
  }
}

export const jeDen = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Období z rychlé volby (s výchozími dny v týdnu a hrubostí). */
export function obdobiZPresetu(p: PresetObdobi, dnes: string = pragueToday()): Obdobi {
  return { preset: p, ...vyresPreset(p, dnes), dnyTydne: [], hrubost: 'auto' };
}

/** Rozmezí, které se opravdu použije: preset se počítá z dneška, vlastní se jen ošetří (obrácené, nesmyslné, moc dlouhé). */
export function platneRozmezi(o: Obdobi, dnes: string = pragueToday()): { od: string; do: string } {
  let od: string; let doD: string;
  if (o.preset !== 'vlastni') ({ od, do: doD } = vyresPreset(o.preset, dnes));
  else { od = jeDen(o.od) ? o.od : dnes; doD = jeDen(o.do) ? o.do : od; }
  if (doD < od) [od, doD] = [doD, od];
  if (pocetDni(od, doD) > MAX_DNI) od = dayPlus(doD, -(MAX_DNI - 1));
  return { od, do: doD };
}

export function pocetDni(od: string, doD: string): number {
  return Math.round((Date.parse(`${doD}T12:00:00Z`) - Date.parse(`${od}T12:00:00Z`)) / 86400000) + 1;
}

/** Dny od–do včetně (strop MAX_DNI). */
export function dnyRozmezi(od: string, doD: string): string[] {
  const out: string[] = [];
  for (let d = od; d <= doD && out.length < MAX_DNI; d = dayPlus(d, 1)) out.push(d);
  return out;
}

/** Hrubost, která se použije: ruční volba, jinak podle délky (do ~6 týdnů dny, do ~7 měsíců týdny, dál měsíce). */
export function hrubostProRozmezi(o: Obdobi, dnu: number): Exclude<Hrubost, 'auto'> {
  if (o.hrubost !== 'auto') return o.hrubost;
  return dnu <= 45 ? 'den' : dnu <= 210 ? 'tyden' : 'mesic';
}

/** Je den mezi vybranými dny v týdnu? Prázdný výběr = ano. */
export const jeVybranyDen = (d: string, dnyTydne: readonly number[]): boolean => dnyTydne.length === 0 || dnyTydne.includes(dnTydne(d));

/** Předchozí období stejné délky bezprostředně před tímhle (pro „proti předchozímu"). */
export function predchoziRozmezi(od: string, doD: string): { od: string; do: string } {
  const n = pocetDni(od, doD);
  return { od: dayPlus(od, -n), do: dayPlus(od, -1) };
}

export interface Slot {
  /** Stabilní klíč slotu: den „RRRR-MM-DD", pondělí týdne nebo „RRRR-MM". */
  klic: string;
  od: string;
  do: string;
  hodnota: number;
  /** Kolik dní s nenulovou hodnotou do slotu přispělo. */
  dnu: number;
}

export interface HodnotaDne { den: string; hodnota: number }

function klicSlotu(d: string, h: Exclude<Hrubost, 'auto'>): string {
  return h === 'den' ? d : h === 'tyden' ? pondeli(d) : d.slice(0, 7);
}

/**
 * Sloty grafu: hodnoty dní sečtené po dni / týdnu (od pondělí) / měsíci. Dny mimo vybrané dny v týdnu se nepočítají
 * a u hrubosti „den" se vynechají. Prázdné sloty uvnitř rozmezí zůstanou (s nulou), ať graf nemá díry.
 */
export function agreguj(hodnoty: readonly HodnotaDne[], od: string, doD: string, h: Exclude<Hrubost, 'auto'>, dnyTydne: readonly number[] = []): Slot[] {
  const mapa = new Map(hodnoty.map(x => [x.den, x.hodnota]));
  const sloty = new Map<string, Slot>();
  for (const d of dnyRozmezi(od, doD)) {
    if (!jeVybranyDen(d, dnyTydne)) continue;
    const k = klicSlotu(d, h);
    const s = sloty.get(k) ?? { klic: k, od: d, do: d, hodnota: 0, dnu: 0 };
    const v = mapa.get(d) ?? 0;
    s.hodnota += v; if (v > 0) s.dnu += 1;
    if (d < s.od) s.od = d; if (d > s.do) s.do = d;
    sloty.set(k, s);
  }
  return [...sloty.values()].sort((a, b) => a.klic.localeCompare(b.klic));
}

export interface Souhrn {
  soucet: number;
  /** Průměr na den s nenulovou hodnotou. */
  prumer: number;
  dnuSHodnotou: number;
  nejlepsi: { den: string; hodnota: number } | null;
  nejhorsi: { den: string; hodnota: number } | null;
}

/** Součet, průměr a krajní dny za vybrané dny rozmezí (budoucí dny a dny bez hodnoty se do průměru nepočítají). */
export function souhrn(hodnoty: readonly HodnotaDne[], od: string, doD: string, dnyTydne: readonly number[] = [], dnes: string = pragueToday()): Souhrn {
  const mapa = new Map(hodnoty.map(x => [x.den, x.hodnota]));
  let soucet = 0; let dnu = 0; let max: Souhrn['nejlepsi'] = null; let min: Souhrn['nejhorsi'] = null;
  for (const d of dnyRozmezi(od, doD)) {
    if (d > dnes || !jeVybranyDen(d, dnyTydne)) continue;
    const v = mapa.get(d) ?? 0;
    soucet += v;
    if (v > 0) {
      dnu += 1;
      if (!max || v > max.hodnota) max = { den: d, hodnota: v };
      if (!min || v < min.hodnota) min = { den: d, hodnota: v };
    }
  }
  return { soucet, prumer: dnu ? Math.round(soucet / dnu) : 0, dnuSHodnotou: dnu, nejlepsi: max, nejhorsi: min };
}

/** Změna v % proti předchozí hodnotě; null, když není s čím srovnávat (nula nebo záporné). */
export const zmenaPct = (ted: number, predtim: number): number | null => (predtim > 0 ? Math.round(((ted - predtim) / predtim) * 100) : null);

// ---- Serializace (uložení volby v prohlížeči) ----

const HRUBOSTI: Hrubost[] = ['auto', 'den', 'tyden', 'mesic'];
const PRESETY = new Set<string>(['dnes', 'vcera', 'tyden', '7_dni', 'mesic', '30_dni', 'minuly_mesic', '90_dni', '180_dni', '365_dni', 'vlastni']);

/** Z uloženého JSONu zpět na platné období; nesmysl → `vychozi`. Uložená hodnota z budoucí verze nesmí shodit stránku. */
export function nactiObdobi(raw: unknown, vychozi: Obdobi): Obdobi {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!o || typeof o !== 'object') return vychozi;
    const preset = PRESETY.has(String((o as any).preset)) ? (o as any).preset as IdObdobi : vychozi.preset;
    const dny = Array.isArray((o as any).dnyTydne) ? [...new Set((o as any).dnyTydne.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() as number[] : [];
    const hrubost = HRUBOSTI.includes((o as any).hrubost) ? (o as any).hrubost as Hrubost : 'auto';
    const od = jeDen((o as any).od) ? (o as any).od : vychozi.od;
    const doD = jeDen((o as any).do) ? (o as any).do : vychozi.do;
    return { preset, od, do: doD, dnyTydne: dny.length === 7 ? [] : dny, hrubost };
  } catch { return vychozi; }
}

export const PRACOVNI_DNY = [0, 1, 2, 3, 4];
export const VIKEND = [5, 6];
