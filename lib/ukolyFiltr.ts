// Úkoly: filtrování, řazení, statistika a podklady pro graf a měsíční kalendář.
//
// Čistá logika bez Reactu (jako ukolyPrehled.ts), ať ji `npm test` pustí přímo v Node
// a ať seznam, počty na záložkách, kalendář i graf počítají totéž. Příklad, který tu
// hlídáme: úkol s dnešním termínem není „po termínu", a proto se nesmí objevit
// v počtu u „Po termínu" na záložce, i když ho seznam ukazuje jako „Dnes".

import { dayPlus } from './pragueTime.ts';
import { pragueDaySafe } from './pragueTime.ts';
import { jeHotovy, jePoTerminu, podleCasuTerminu, type Ukol } from './ukolyPrehled.ts';
import { dnTydne, type HodnotaDne } from './obdobi.ts';

export type StavUkolu = 'vse' | 'po_terminu' | 'dnes' | 'tyden' | 'pozdeji' | 'bez_terminu' | 'hotove';
export const STAVY_UKOLU: readonly StavUkolu[] = ['vse', 'po_terminu', 'dnes', 'tyden', 'pozdeji', 'bez_terminu', 'hotove'];

export type PrioritaUkolu = 'low' | 'medium' | 'high';
export type ZdrojUkolu = 'vse' | 'rucni' | 'vyroba' | 'opakovane' | 'povinne';
export type RazeniUkolu = 'termin' | 'priorita' | 'nazev' | 'nejnovejsi';

export interface FiltrUkolu {
  hledat: string;
  stav: StavUkolu;
  /** Prázdné = všechny priority. */
  priorita: readonly PrioritaUkolu[];
  /** 'all' = všichni, 'volne' = úkoly pro kohokoli, číslo = konkrétní člověk. */
  kdo: number | 'all' | 'volne';
  zdroj: ZdrojUkolu;
  /** Dny v týdnu termínu (0 = pondělí … 6 = neděle); prázdné = všechny. */
  dny: readonly number[];
  razeni: RazeniUkolu;
}

export const VYCHOZI_FILTR: FiltrUkolu = { hledat: '', stav: 'vse', priorita: [], kdo: 'all', zdroj: 'vse', dny: [], razeni: 'termin' };

/** Kolik filtrů je zapnutých mimo stav a člověka (číslo na tlačítku „Filtry"). */
export function pocetFiltru(f: FiltrUkolu): number {
  return (f.priorita.length > 0 ? 1 : 0) + (f.zdroj !== 'vse' ? 1 : 0) + (f.dny.length > 0 ? 1 : 0) + (f.razeni !== 'termin' ? 1 : 0);
}

const normalizuj = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Hledání v názvu, popisu, bodech seznamu a jménu zadaného člověka (bez ohledu na diakritiku). */
export function odpovidaHledani(u: Ukol, hledat: string): boolean {
  const q = normalizuj(hledat.trim());
  if (!q) return true;
  const seno = normalizuj([u.title, u.description ?? '', u.assigneeName ?? '', u.completedByName ?? '', ...u.checklist.map(i => i.text)].join(' \n '));
  return q.split(/\s+/).every(slovo => seno.includes(slovo));
}

/**
 * Kolo 7: dnešní nehotový úkol, jehož čas termínu už minul („do 10:00" a je 10:05).
 * `tedHM` je pražské „HH:MM" z pragueHM() — porovnává se čas na zdi podniku, ne čas
 * prohlížeče. Úkol z minulého dne je „po termínu" (stavUkolu), ne „po čase".
 */
export function poCase(u: Pick<Ukol, 'status' | 'dueDate' | 'dueTime'>, dnes: string, tedHM: string | null | undefined): boolean {
  return !jeHotovy(u) && !!u.dueDate && u.dueDate === dnes && !!u.dueTime && !!tedHM && u.dueTime < tedHM;
}

/** Do které záložky úkol patří. Hotové mají vlastní; nehotové podle termínu (dnešní termín není po termínu). */
export function stavUkolu(u: Pick<Ukol, 'status' | 'dueDate'>, dnes: string, zaTyden: string): Exclude<StavUkolu, 'vse'> {
  if (jeHotovy(u)) return 'hotove';
  if (!u.dueDate) return 'bez_terminu';
  if (u.dueDate < dnes) return 'po_terminu';
  if (u.dueDate === dnes) return 'dnes';
  return u.dueDate <= zaTyden ? 'tyden' : 'pozdeji';
}

function jeZdroj(u: Ukol, zdroj: ZdrojUkolu): boolean {
  switch (zdroj) {
    case 'vse': return true;
    case 'vyroba': return u.source === 'production';
    case 'opakovane': return !!u.recurrence || !!u.seriesId;
    case 'povinne': return u.requireBeforeClosing === true;
    case 'rucni': return u.source !== 'production';
  }
}

/** Všechny filtry kromě stavu — z výsledku se počítají čísla na záložkách stavu. */
export function filtrujBezStavu(ukoly: readonly Ukol[], f: FiltrUkolu): Ukol[] {
  return ukoly.filter(u => {
    if (f.kdo === 'volne' ? u.assignedTo != null : f.kdo !== 'all' && u.assignedTo !== f.kdo) return false;
    if (f.priorita.length > 0 && !f.priorita.includes(u.priority as PrioritaUkolu)) return false;
    if (!jeZdroj(u, f.zdroj)) return false;
    if (f.dny.length > 0 && !(u.dueDate && f.dny.includes(dnTydne(u.dueDate)))) return false;
    return odpovidaHledani(u, f.hledat);
  });
}

const poradiPriority: Record<string, number> = { high: 0, medium: 1, low: 2 };
// Uvnitř dne podle času termínu (kolo 7), úkol bez času na konec dne.
const podleTerminu = (a: Ukol, b: Ukol) => String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999')) || podleCasuTerminu(a, b) || a.id - b.id;

export function seradUkoly(ukoly: readonly Ukol[], razeni: RazeniUkolu): Ukol[] {
  const kopie = [...ukoly];
  switch (razeni) {
    case 'priorita': return kopie.sort((a, b) => (poradiPriority[a.priority] ?? 1) - (poradiPriority[b.priority] ?? 1) || podleTerminu(a, b));
    case 'nazev': return kopie.sort((a, b) => a.title.localeCompare(b.title, 'cs') || a.id - b.id);
    case 'nejnovejsi': return kopie.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || b.id - a.id);
    case 'termin': return kopie.sort(podleTerminu);
  }
}

export function filtrujUkoly(ukoly: readonly Ukol[], f: FiltrUkolu, dnes: string, zaTyden: string): Ukol[] {
  const zakladni = filtrujBezStavu(ukoly, f);
  const podleStavu = f.stav === 'vse' ? zakladni : zakladni.filter(u => stavUkolu(u, dnes, zaTyden) === f.stav);
  return seradUkoly(podleStavu, f.razeni);
}

export type PoctyStavu = Record<StavUkolu, number>;

/** Počty u záložek stavu při ostatních filtrech („Vše" = všechny úkoly včetně hotových). */
export function poctyStavu(ukoly: readonly Ukol[], f: FiltrUkolu, dnes: string, zaTyden: string): PoctyStavu {
  const p: PoctyStavu = { vse: 0, po_terminu: 0, dnes: 0, tyden: 0, pozdeji: 0, bez_terminu: 0, hotove: 0 };
  for (const u of filtrujBezStavu(ukoly, f)) {
    const s = stavUkolu(u, dnes, zaTyden);
    p[s]++;
    p.vse++;
  }
  return p;
}

// ---------------------------------------------------------------------------
// Statistika a graf
// ---------------------------------------------------------------------------

export type MetrikaUkolu = 'splneno' | 'zalozeno' | 'terminy';

/** Hodnota pro každý den rozmezí: kolik úkolů se v ten den splnilo / založilo / mělo termín. */
export function ukolyPoDnech(ukoly: readonly Ukol[], od: string, doD: string, metrika: MetrikaUkolu): HodnotaDne[] {
  const m = new Map<string, number>();
  for (const u of ukoly) {
    const den = metrika === 'splneno' ? (jeHotovy(u) && u.completedAt ? pragueDaySafe(u.completedAt) : '')
      : metrika === 'zalozeno' ? (u.createdAt ? pragueDaySafe(u.createdAt) : '')
      : (u.dueDate ?? '');
    if (den && den >= od && den <= doD) m.set(den, (m.get(den) ?? 0) + 1);
  }
  const out: HodnotaDne[] = [];
  for (let d = od, n = 0; d <= doD && n < 800; d = dayPlus(d, 1), n++) out.push({ den: d, hodnota: m.get(d) ?? 0 });
  return out;
}

export interface StatistikaUkolu {
  splneno: number;
  zalozeno: number;
  /** Úkoly s termínem v rozmezí, které jsou hotové / všechny takové. */
  sTerminem: number;
  hotoveZNich: number;
  /** Podíl splněných z těch, jejichž termín už nastal (0–100), nebo null, když nic takového není. */
  uspesnostPct: number | null;
  /** Splněné v termínu nebo dřív / splněné s termínem (0–100), nebo null. */
  vTerminuPct: number | null;
  poTerminu: number;
}

export function statistikaUkolu(ukoly: readonly Ukol[], od: string, doD: string, dnes: string): StatistikaUkolu {
  let splneno = 0; let zalozeno = 0; let sTerminem = 0; let hotoveZNich = 0; let nastalo = 0; let nastaloHotovo = 0;
  let splnenoSTerminem = 0; let vTerminu = 0; let poTerminu = 0;
  for (const u of ukoly) {
    const sp = jeHotovy(u) && u.completedAt ? pragueDaySafe(u.completedAt) : '';
    const za = u.createdAt ? pragueDaySafe(u.createdAt) : '';
    if (sp && sp >= od && sp <= doD) {
      splneno++;
      if (u.dueDate) { splnenoSTerminem++; if (sp <= u.dueDate) vTerminu++; }
    }
    if (za && za >= od && za <= doD) zalozeno++;
    if (u.dueDate && u.dueDate >= od && u.dueDate <= doD) {
      sTerminem++;
      if (jeHotovy(u)) hotoveZNich++;
      if (u.dueDate <= dnes) { nastalo++; if (jeHotovy(u)) nastaloHotovo++; }
      if (jePoTerminu(u, dnes)) poTerminu++;
    }
  }
  return {
    splneno, zalozeno, sTerminem, hotoveZNich, poTerminu,
    uspesnostPct: nastalo > 0 ? Math.round((nastaloHotovo / nastalo) * 100) : null,
    vTerminuPct: splnenoSTerminem > 0 ? Math.round((vTerminu / splnenoSTerminem) * 100) : null,
  };
}

export interface RadekSplneni { id: number | null; jmeno: string; splneno: number; aktivni: number; poTerminu: number }

/** Kdo kolik splnil v rozmezí a kolik mu zbývá (podle toho, komu úkol patří; „kdokoli" podle toho, kdo ho splnil). */
export function splneniPodleLidi(ukoly: readonly Ukol[], od: string, doD: string, dnes: string): RadekSplneni[] {
  const m = new Map<string, RadekSplneni>();
  const radek = (id: number | null, jmeno: string) => {
    const k = String(id ?? 'volne');
    let r = m.get(k); if (!r) { r = { id, jmeno, splneno: 0, aktivni: 0, poTerminu: 0 }; m.set(k, r); }
    return r;
  };
  for (const u of ukoly) {
    if (jeHotovy(u)) {
      const sp = u.completedAt ? pragueDaySafe(u.completedAt) : '';
      if (!sp || sp < od || sp > doD) continue;
      const id = u.completedBy ?? u.assignedTo;
      radek(id, u.completedByName ?? u.assigneeName ?? 'Bez jména').splneno++;
    } else if (!u.dueDate || u.dueDate <= dnes) {
      const r = radek(u.assignedTo, u.assignedTo == null ? 'Pro kohokoli' : (u.assigneeName ?? 'Bez jména'));
      r.aktivni++;
      if (jePoTerminu(u, dnes)) r.poTerminu++;
    }
  }
  return [...m.values()].sort((a, b) => b.splneno - a.splneno || b.aktivni - a.aktivni || a.jmeno.localeCompare(b.jmeno, 'cs'));
}

// ---------------------------------------------------------------------------
// Měsíční kalendář
// ---------------------------------------------------------------------------

export interface BunkaMesice {
  /** null = prázdná buňka mimo měsíc. */
  den: string | null;
  celkem: number;
  hotovo: number;
  poTerminu: number;
  dnes: boolean;
}

/**
 * Týdny měsíce `YYYY-MM` s počtem úkolů podle termínu. `zacatekTydne` 1 = pondělí, 0 = neděle.
 * Buňky před prvním a po posledním dni měsíce jsou prázdné, ať mřížka drží sedm sloupců.
 */
export function kalendarUkolu(ukoly: readonly Ukol[], mesic: string, dnes: string, zacatekTydne: 0 | 1 = 1): BunkaMesice[][] {
  const [r, m] = mesic.split('-').map(Number);
  if (!r || !m) return [];
  const prvni = `${mesic}-01`;
  const posledni = `${mesic}-${String(new Date(r, m, 0).getDate()).padStart(2, '0')}`;
  const poDnech = new Map<string, Ukol[]>();
  for (const u of ukoly) if (u.dueDate && u.dueDate >= prvni && u.dueDate <= posledni) {
    const a = poDnech.get(u.dueDate) ?? []; a.push(u); poDnech.set(u.dueDate, a);
  }
  const posun = (dnTydne(prvni) - (zacatekTydne === 1 ? 0 : 6) + 7) % 7; // dnTydne: 0 = pondělí
  const radky: BunkaMesice[][] = [];
  for (let zacatek = dayPlus(prvni, -posun); zacatek <= posledni; zacatek = dayPlus(zacatek, 7)) {
    radky.push(Array.from({ length: 7 }, (_, i) => {
      const d = dayPlus(zacatek, i);
      if (d < prvni || d > posledni) return { den: null, celkem: 0, hotovo: 0, poTerminu: 0, dnes: false };
      const u = poDnech.get(d) ?? [];
      return { den: d, celkem: u.length, hotovo: u.filter(jeHotovy).length, poTerminu: u.filter(x => jePoTerminu(x, dnes)).length, dnes: d === dnes };
    }));
  }
  return radky;
}

/** Úkoly s termínem v daný den (hotové nakonec). */
export function ukolyDne(ukoly: readonly Ukol[], den: string): Ukol[] {
  return ukoly.filter(u => u.dueDate === den).sort((a, b) => Number(jeHotovy(a)) - Number(jeHotovy(b)) || (poradiPriority[a.priority] ?? 1) - (poradiPriority[b.priority] ?? 1) || a.id - b.id);
}

/** Podíl hotových bodů kontrolního seznamu (0–100), nebo null, když úkol seznam nemá. */
export function postupChecklistu(u: Pick<Ukol, 'checklist'>): number | null {
  const n = u.checklist.length;
  return n === 0 ? null : Math.round((u.checklist.filter(i => i.done).length / n) * 100);
}

// ---------------------------------------------------------------------------
// Předání z widgetu: klepnutí na „Po termínu" otevře Úkoly rovnou na záložce Po termínu
// ---------------------------------------------------------------------------

export type PohledUkolu = 'list' | 'week' | 'month' | 'prehled';
export interface PredaniUkolu { stav?: StavUkolu; pohled?: PohledUkolu; /** Otevřít rovnou detail úkolu (z globálního hledání). */ ukolId?: number }
export const KLIC_PREDANI_UKOLU = 'managero-ukoly-predani';
export const UDALOST_PREDANI_UKOLU = 'managero:predani-ukolu';

/** „stav:po_terminu" / „pohled:week" / „ukol:42" (to, co widget nebo hledání nese v `arg`); neznámé hodnoty se zahodí. */
export function rozborPredani(arg: string | null | undefined): PredaniUkolu {
  const id = /^ukol:(\d+)$/.exec(String(arg ?? ''));
  if (id) return { ukolId: Number(id[1]) };
  const m = /^(stav|pohled):([a-z_]+)$/.exec(String(arg ?? ''));
  if (!m) return {};
  if (m[1] === 'stav') return (STAVY_UKOLU as readonly string[]).includes(m[2]) ? { stav: m[2] as StavUkolu } : {};
  return ['list', 'week', 'month', 'prehled'].includes(m[2]) ? { pohled: m[2] as PohledUkolu } : {};
}

const PLATNOST_PREDANI_MS = 6000;

/**
 * Zapamatuje předání pro Úkoly (otevřou se po přechodu) a oznámí ho už otevřeným Úkolům. Platí pár vteřin a nemaže se
 * při přečtení: plocha si nástroj po načtení rozložení odmontuje a připojí znovu, a ten druhý by o předání nevěděl.
 */
export function predejUkolum(arg: string | undefined): void {
  if (!arg || typeof window === 'undefined') return;
  try { sessionStorage.setItem(KLIC_PREDANI_UKOLU, JSON.stringify({ arg, cas: Date.now() })); } catch { /* soukromé okno: otevře se bez předání */ }
  window.dispatchEvent(new CustomEvent(UDALOST_PREDANI_UKOLU, { detail: arg }));
}

/** Čerstvé předání uložené `predejUkolum`, nebo null. */
export function cerstvePredani(): string | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KLIC_PREDANI_UKOLU) ?? 'null');
    return v && typeof v.arg === 'string' && Date.now() - Number(v.cas) < PLATNOST_PREDANI_MS ? v.arg : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Rychlé přidání úkolu jedním řádkem („Objednat mléko zítra", „Umýt okna v pátek")
// ---------------------------------------------------------------------------

// Jen celá slova (včetně pádu „v neděli", „ve středu", „v sobotu"): zkratky po, út, st, ne bývají jiná slova.
const DNY_SLOVA: Record<string, number> = {
  pondeli: 0, utery: 1, streda: 2, stredu: 2, ctvrtek: 3, patek: 4, sobota: 5, sobotu: 5, nedele: 6, nedeli: 6,
};
const bezDiakritiky = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Z řádku „Objednat mléko zítra" udělá název a termín. Datum se čte jen z konce řádku: „dnes", „zítra", „pozítří",
 * „v pátek" / „pátek" (nejbližší takový den po dnešku), „za 3 dny". Bez data je to dnes. Řádek, který je jen datum
 * („zítra"), zůstane názvem — nic se neztratí.
 */
export function rozborRychlehoUkolu(radek: string, dnes: string): { title: string; dueDate: string } {
  const slova = radek.trim().split(/\s+/).filter(Boolean);
  const vrat = (pocet: number, den: string) => ({ title: slova.slice(0, slova.length - pocet).join(' ').trim(), dueDate: den });
  const hotovo = (r: { title: string; dueDate: string }) => (r.title ? r : { title: radek.trim(), dueDate: dnes });
  const posl = bezDiakritiky(slova.at(-1) ?? '');
  const pred = bezDiakritiky(slova.at(-2) ?? '');
  if (slova.length > 1) {
    if (posl === 'dnes') return hotovo(vrat(1, dnes));
    if (posl === 'zitra') return hotovo(vrat(1, dayPlus(dnes, 1)));
    if (posl === 'pozitri') return hotovo(vrat(1, dayPlus(dnes, 2)));
    if (posl in DNY_SLOVA) {
      const cil = DNY_SLOVA[posl];
      const rozdil = ((cil - dnTydne(dnes) + 7) % 7) || 7;
      return hotovo(vrat(pred === 'v' || pred === 've' ? 2 : 1, dayPlus(dnes, rozdil)));
    }
    const za = /^\d{1,3}$/.test(pred) && slova.length > 3 && bezDiakritiky(slova.at(-3) ?? '') === 'za' && /^(den|dny|dni|dnu)$/.test(posl);
    if (za) return hotovo(vrat(3, dayPlus(dnes, Number(pred))));
  }
  return { title: radek.trim(), dueDate: dnes };
}
