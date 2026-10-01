// Osobní formáty člověka (Nastavení → Jazyk a region): čas, datum, začátek týdne
// a desetinný oddělovač. Čistý modul bez Reactu, aby šel do `npm test`.
//
// Pravidlo: osobní volba přebíjí týmovou (teams.time_format, teams.week_start),
// „auto" znamená „podle podniku / podle jazyka". Peníze a čísla dál řídí
// `teams.locale`, aby majitel a účetní viděli stejnou částku; osobní desetinný
// oddělovač mění jen znak, ne měnu ani seskupení (viz `prepisDesetinny`).
//
// Stav je modulový (jako jazyk v stav.ts): časy se formátují i mimo komponenty
// (dbTimeHM, fmtDatum) a nemá smysl předávat osobní volbu každému volajícímu.
// Zapisuje se jen v prohlížeči; server vždy počítá s výchozím stavem, takže
// první vykreslení na serveru i v prohlížeči je stejné (žádná chyba hydratace)
// a osobní volba se uplatní až po načtení.

export type CasVolba = 'auto' | '24' | '12';
export type DatumVolba = 'auto' | 'dmy' | 'mdy' | 'ymd';
export type TydenVolba = 'auto' | '1' | '0';
export type DesetinnyVolba = 'auto' | ',' | '.';

export interface OsobniFormaty {
  cas: CasVolba;
  datum: DatumVolba;
  tyden: TydenVolba;
  desetinny: DesetinnyVolba;
}

export const VYCHOZI_FORMATY: OsobniFormaty = { cas: 'auto', datum: 'auto', tyden: 'auto', desetinny: 'auto' };

const VOLBY = {
  cas: ['auto', '24', '12'],
  datum: ['auto', 'dmy', 'mdy', 'ymd'],
  tyden: ['auto', '1', '0'],
  desetinny: ['auto', ',', '.'],
} as const;

/** Cokoli z databáze nebo z těla požadavku → platné formáty; neplatná položka se vrátí na „auto". */
export function cistyFormaty(v: unknown): OsobniFormaty {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const vyber = <K extends keyof OsobniFormaty>(k: K): OsobniFormaty[K] => {
    // Číslo 1/0 z JSON (týden) se bere jako řetězec.
    const raw = typeof o[k] === 'number' ? String(o[k]) : o[k];
    return ((VOLBY[k] as readonly unknown[]).includes(raw) ? raw : 'auto') as OsobniFormaty[K];
  };
  return { cas: vyber('cas'), datum: vyber('datum'), tyden: vyber('tyden'), desetinny: vyber('desetinny') };
}

export function jsouVychoziFormaty(f: OsobniFormaty): boolean {
  return f.cas === 'auto' && f.datum === 'auto' && f.tyden === 'auto' && f.desetinny === 'auto';
}

/** Kolik hodin ukazovat: osobní volba, jinak týmová (`teams.time_format`), jinak 24. */
export function ucinneHodiny(osobni: OsobniFormaty, tymovy: '24' | '12' | string | null | undefined): 12 | 24 {
  if (osobni.cas === '12') return 12;
  if (osobni.cas === '24') return 24;
  return tymovy === '12' ? 12 : 24;
}

/** Začátek týdne: 1 = pondělí, 0 = neděle. Osobní volba přebíjí týmovou. */
export function ucinnyZacatekTydne(osobni: OsobniFormaty, tymovy: number | null | undefined): 0 | 1 {
  if (osobni.tyden === '1') return 1;
  if (osobni.tyden === '0') return 0;
  return tymovy === 0 ? 0 : 1;
}

/**
 * Přepíše desetinný oddělovač v už naformátovaném čísle. Zjistí, jaký znak
 * používá locale pro desetinnou čárku a pro seskupení tisíců, a vymění je tak,
 * aby se nikdy nepotkaly dva stejné znaky: `1.500,50` (de) s volbou „." dá
 * `1,500.50`; `1 500,50` (cs, seskupení mezerou) dá `1 500.50`.
 */
export function prepisDesetinny(text: string, locale: string, volba: DesetinnyVolba): string {
  if (volba === 'auto') return text;
  let d = ',';
  let g = '';
  try {
    // Velké číslo, ať se ukáže seskupení i v locale, které u čtyřmístných čísel nesdružuje (pl, es).
    for (const p of new Intl.NumberFormat(locale).formatToParts(1234567.5)) {
      if (p.type === 'decimal') d = p.value;
      else if (p.type === 'group') g = p.value;
    }
  } catch { /* neznámé locale: čárka jako výchozí */ }
  if (d === volba) return text;
  let out = '';
  for (const ch of text) {
    if (ch === d) out += volba;
    else if (g && ch === g && g === volba) out += d;
    else out += ch;
  }
  return out;
}

/** „14:30" nebo „14:30:00" → v zadaném počtu hodin: 24 = „14:30", 12 = „2:30 PM". Nečitelný vstup vrátí beze změny. */
export function hmVTvaru(v: unknown, hodiny: 12 | 24): string {
  const s = String(v ?? '');
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s;
  if (hodiny === 24) return `${m[1].padStart(2, '0')}:${m[2]}`;
  const h = Number(m[1]) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Číselné datum podle zvoleného pořadí. `kratce` = bez roku. */
export function datumVTvaru(r: number, m: number, d: number, volba: Exclude<DatumVolba, 'auto'>, kratce: boolean): string {
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  if (volba === 'dmy') return kratce ? `${d}. ${m}.` : `${d}. ${m}. ${r}`;
  if (volba === 'mdy') return kratce ? `${m}/${d}` : `${m}/${d}/${r}`;
  return kratce ? `${mm}-${dd}` : `${r}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Modulový stav (jen prohlížeč)

let osobni: OsobniFormaty = VYCHOZI_FORMATY;
let tymCas: '24' | '12' = '24';
let tymTyden: 0 | 1 = 1;
const posluchaci = new Set<() => void>();

function oznam() { for (const p of Array.from(posluchaci)) p(); }

export function nastavOsobniFormaty(f: OsobniFormaty): void {
  if (typeof window === 'undefined') return;
  const nove = cistyFormaty(f);
  if (JSON.stringify(nove) === JSON.stringify(osobni)) return;
  osobni = nove;
  oznam();
}

/** Formát času a začátek týdne podniku; volá ho CurrencyProvider po načtení týmu. */
export function nastavTymovyFormat(cas: string | null | undefined, tyden?: number | null): void {
  if (typeof window === 'undefined') return;
  const c: '24' | '12' = cas === '12' ? '12' : '24';
  const t: 0 | 1 = tyden === 0 ? 0 : 1;
  if (c === tymCas && t === tymTyden) return;
  tymCas = c; tymTyden = t;
  oznam();
}

export function osobniFormaty(): OsobniFormaty { return osobni; }
export function aktualniHodiny(): 12 | 24 { return ucinneHodiny(osobni, tymCas); }
export function aktualniDatumVolba(): DatumVolba { return osobni.datum; }

/** Odběr změn (osobní volba nebo formát podniku); I18nProvider podle toho překreslí aplikaci. */
export function posluchejFormaty(fn: () => void): () => void {
  posluchaci.add(fn);
  return () => { posluchaci.delete(fn); };
}

// ---------------------------------------------------------------------------
// Mezipaměť zařízení: osobní formáty se po načtení stránky uplatní hned, ještě než
// odpoví /api/account. Patří ke konkrétnímu účtu, ať je nepřevezme jiný člověk
// na sdíleném telefonu.

export const KLIC_FORMATU = 'managero-formaty';

export function nactiMezipametFormatu(uid: string): OsobniFormaty | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KLIC_FORMATU) : null;
    const c = raw ? JSON.parse(raw) : null;
    return c && c.uid === uid ? cistyFormaty(c.formaty) : null;
  } catch { return null; }
}

export function ulozMezipametFormatu(uid: string, formaty: OsobniFormaty): void {
  try { localStorage.setItem(KLIC_FORMATU, JSON.stringify({ uid, formaty })); } catch { /* soukromé okno */ }
}
