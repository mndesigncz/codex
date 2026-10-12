// Filtry a řazení seznamu uzávěrek (vedení). Čistá logika bez Reactu — okno ji jen volá a testuje se v Node.
//
// Co se dá najít: podle dne, směny, jména (kdo byl na směně i kdo uzávěrku vyplnil), poznámky nebo akce;
// podle stavu (ke schválení / schválené), podle kasy (sedí / manko / přebytek) a podle rozmezí dnů.
// Hledání je bez ohledu na diakritiku a velikost písmen (lib/hledani) a rozumí i dni „5. 10.".
import { obsahujeNekde } from './hledani.ts';
import { denUzaverky, rozdilUzaverky, maSkrytouTrzbu, type RadekUzaverky } from './uzaverkyPrehled.ts';

export type StavFiltr = 'vse' | 'ceka' | 'schvaleno';
export type KasaFiltr = 'vse' | 'sedi' | 'manko' | 'prebytek';
export type Razeni = 'nejnovejsi' | 'nejstarsi' | 'trzba' | 'rozdil';

export interface FiltrUzaverek {
  hledej: string;
  stav: StavFiltr;
  kasa: KasaFiltr;
  /** Štítek směny, nebo '' = všechny. */
  smena: string;
  /** Od dne / do dne včetně („RRRR-MM-DD"), prázdné = bez omezení. */
  od: string;
  do: string;
  razeni: Razeni;
}

export const PRAZDNY_FILTR: FiltrUzaverek = { hledej: '', stav: 'vse', kasa: 'vse', smena: '', od: '', do: '', razeni: 'nejnovejsi' };

/** Kolik filtrů je zapnutých (řazení se nepočítá — nic neskrývá). */
export function pocetFiltru(f: FiltrUzaverek): number {
  return [f.hledej.trim() !== '', f.stav !== 'vse', f.kasa !== 'vse', f.smena !== '', f.od !== '' || f.do !== ''].filter(Boolean).length;
}

const lidiNaSmene = (c: RadekUzaverky): string[] =>
  (c.shiftEmployees ?? []).map(p => p.name).concat(c.author_name ?? []).filter(Boolean) as string[];

/** „2026-10-05" → „5. 10." a „05.10." — aby se našlo i to, co člověk píše z hlavy. */
function tvaryDne(d: string): string[] {
  const [, m, dd] = d.split('-').map(Number);
  return m && dd ? [d, `${dd}. ${m}.`, `${dd}.${m}.`, `${dd}. ${m}`] : [d];
}

/** Kasa: rozdíl proti očekávání; uzávěrka bez tržby (skrytá roli) žádný rozdíl nemá a nikdy „nesedí". */
function odpovidaKase(c: RadekUzaverky, kasa: KasaFiltr): boolean {
  if (kasa === 'vse') return true;
  const d = rozdilUzaverky(c);
  if (d == null) return false;
  return kasa === 'sedi' ? d === 0 : kasa === 'manko' ? d < 0 : d > 0;
}

export function odpovidaFiltru(c: RadekUzaverky, f: FiltrUzaverek): boolean {
  const d = denUzaverky(c);
  if (f.od && d < f.od) return false;
  if (f.do && d > f.do) return false;
  if (f.stav === 'ceka' && c.approved !== false) return false;
  if (f.stav === 'schvaleno' && c.approved === false) return false;
  if (f.smena && (c.shift_label ?? '') !== f.smena) return false;
  if (!odpovidaKase(c, f.kasa)) return false;
  return obsahujeNekde(f.hledej, ...tvaryDne(d), c.shift_label, c.notes, c.event_title, ...lidiNaSmene(c));
}

const trzbaRadku = (c: RadekUzaverky): number | null =>
  c.trzbaSkryta || maSkrytouTrzbu(c) ? null : (Number(c.cash_revenue) || 0) + (Number(c.card_revenue) || 0);

/** Filtr a řazení; chybějící hodnota (skrytá tržba, žádný rozdíl) jde vždy na konec. Nemění vstup. */
export function filtrujUzaverky<T extends RadekUzaverky>(radky: readonly T[], f: FiltrUzaverek): T[] {
  const out = radky.filter(c => odpovidaFiltru(c, f));
  const den = (c: T) => denUzaverky(c);
  const naKonec = (a: number | null, b: number | null, vzestupne: boolean) =>
    a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : vzestupne ? a - b : b - a;
  return out.sort((a, b) => {
    switch (f.razeni) {
      case 'nejstarsi': return den(a).localeCompare(den(b)) || a.id - b.id;
      case 'trzba': return naKonec(trzbaRadku(a), trzbaRadku(b), false) || den(b).localeCompare(den(a));
      case 'rozdil': return naKonec(rozdilUzaverky(a) == null ? null : Math.abs(rozdilUzaverky(a)!), rozdilUzaverky(b) == null ? null : Math.abs(rozdilUzaverky(b)!), false) || den(b).localeCompare(den(a));
      default: return den(b).localeCompare(den(a)) || b.id - a.id;
    }
  });
}

/** Různé štítky směn v datech (pro výběr „Směna"), podle abecedy. */
export function stitkySmen(radky: readonly RadekUzaverky[]): string[] {
  return [...new Set(radky.map(c => (c.shift_label ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));
}

/** Jména lidí z uzávěrek (návrhy v hledání), nejčastější první, nejvýš `n`. */
export function jmenaZUzaverek(radky: readonly RadekUzaverky[], n = 6): string[] {
  const m = new Map<string, number>();
  for (const c of radky) for (const j of new Set(lidiNaSmene(c))) m.set(j, (m.get(j) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'cs')).slice(0, n).map(x => x[0]);
}

/** Poslední den měsíce „RRRR-MM" jako „RRRR-MM-DD" (v UTC, ať nerozhoduje pásmo). */
function konecMesice(mesic: string): string {
  const [y, m] = mesic.split('-').map(Number);
  return `${mesic}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/**
 * Jméno souboru exportu podle toho, co je právě vidět: měsíc z MonthNav, rozmezí Od/Do z Filtrů
 * (zužuje v rámci měsíce), nebo obojí. „uzaverky-2026-10.csv", „uzaverky-2026-10-03_2026-10-12.csv",
 * „uzaverky-od-2026-09-01.csv", bez omezení „uzaverky.csv". Rozmezí mimo měsíc = prázdný průnik,
 * soubor se pak jmenuje podle měsíce (seznam je prázdný a export se stejně nenabídne).
 */
export function nazevExportuUzaverek(zaklad: string, mesic: string | null, od = '', doD = ''): string {
  let a = od, b = doD;
  if (mesic) {
    const zac = `${mesic}-01`, kon = konecMesice(mesic);
    a = a && a > zac ? a : zac;
    b = b && b < kon ? b : kon;
    if ((a === zac && b === kon) || a > b) return `${zaklad}-${mesic}.csv`;
  }
  if (a && b) return a === b ? `${zaklad}-${a}.csv` : `${zaklad}-${a}_${b}.csv`;
  if (a) return `${zaklad}-od-${a}.csv`;
  if (b) return `${zaklad}-do-${b}.csv`;
  return `${zaklad}.csv`;
}

/** Popisek období do souhrnu exportu pro účetní: „2026-10", „2026-10-03 – 2026-10-12", „od …", „vše". */
export function popisObdobiExportu(mesic: string | null, od = '', doD = ''): string {
  const jmeno = nazevExportuUzaverek('x', mesic, od, doD).replace(/^x-?/, '').replace(/\.csv$/, '');
  if (!jmeno) return 'vše'; // i18n-ok (CSV pro účetní zůstává česky)
  if (jmeno.startsWith('od-')) return `od ${jmeno.slice(3)}`; // i18n-ok (CSV pro účetní zůstává česky)
  if (jmeno.startsWith('do-')) return `do ${jmeno.slice(3)}`; // i18n-ok (CSV pro účetní zůstává česky)
  return jmeno.replace('_', ' – ');
}
