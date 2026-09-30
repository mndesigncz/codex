// Jádro překladače: bez Reactu, bez Next, bez načítání souborů. Dostane
// slovníky a vrátí text, takže se dá celé otestovat v `npm test`.
//
// Česká věta je klíč: `t('Uložit')`. Čeština proto nemá slovník a nic
// nenačítá; ostatní jazyky hledají větu ve svém slovníku a když ji nenajdou,
// zkusí náhradní jazyk (de/pl → en) a nakonec vrátí českou větu samotnou.
// Text se nikdy neztratí a nikdy nespadne.
//
// Zprávy umí dvě věci, obě ve stylu ICU, jen v malé verzi:
//   {jmeno}                              vložení hodnoty
//   {n, plural, one {# položka} few {# položky} other {# položek}}
// `#` je číslo naformátované pro locale jazyka, `=0 {žádná}` je přesná shoda
// a má přednost před kategorií. Větvení jen plural, žádný vnořený select.
// Hodnoty se vkládají jako prostý text; HTML a React si escapují sami,
// překlad proto nikdy neprochází přes dangerouslySetInnerHTML.
//
// Klíč s kontextem: stejné slovo, dva významy → `t('Sklad', {}, 'nav')` hledá
// ve slovníku `Sklad|nav`. Klíč s id (katalogy, alergeny) má tvar `#id`.

import { LOCALE_PRO_JAZYK, retezJazyku, type Jazyk } from './config.ts';
import { vyberTvar } from './plural.ts';

export type Slovnik = Record<string, string>;
export type Hodnoty = Record<string, string | number | null | undefined>;
/** Slovníky po jazycích; chybějící jazyk = bez překladu. */
export type Slovniky = Partial<Record<Jazyk, Slovnik>>;

// ---------------------------------------------------------------------------
// Parser zprávy

type Uzel =
  | { druh: 'text'; text: string }
  | { druh: 'arg'; jmeno: string; zdroj: string }
  | { druh: 'cislo' }
  | { druh: 'plural'; jmeno: string; vetve: Record<string, Uzel[]>; zdroj: string };

const cacheParseru = new Map<string, Uzel[]>();

/** Najde `}` odpovídající `{` na pozici `od` (vnořené závorky se počítají). -1 = nenalezeno. */
function uzaviraci(s: string, od: number): number {
  let hloubka = 0;
  for (let i = od; i < s.length; i++) {
    if (s[i] === '{') hloubka++;
    else if (s[i] === '}') { hloubka--; if (hloubka === 0) return i; }
  }
  return -1;
}

function parsuj(s: string, vVetvi: boolean): Uzel[] {
  const out: Uzel[] = [];
  let text = '';
  const vyplav = () => { if (text) { out.push({ druh: 'text', text }); text = ''; } };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '#' && vVetvi) { vyplav(); out.push({ druh: 'cislo' }); continue; }
    if (c !== '{') { text += c; continue; }
    const konec = uzaviraci(s, i);
    if (konec < 0) { text += c; continue; } // osamocená závorka = obyčejný znak
    const vnitrek = s.slice(i + 1, konec);
    const zdroj = s.slice(i, konec + 1);
    const m = /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*(?:,\s*plural\s*,([\s\S]*))?$/u.exec(vnitrek);
    if (!m) { text += zdroj; i = konec; continue; } // {neco jineho} zůstane, jak je
    vyplav();
    if (m[2] === undefined) out.push({ druh: 'arg', jmeno: m[1], zdroj });
    else {
      const vetve = parsujVetve(m[2]);
      out.push(vetve ? { druh: 'plural', jmeno: m[1], vetve, zdroj } : { druh: 'text', text: zdroj });
    }
    i = konec;
  }
  vyplav();
  return out;
}

/** `one {# položka} few {...} =0 {žádná}` → mapa selektor → uzly. null = nesmysl. */
function parsujVetve(s: string): Record<string, Uzel[]> | null {
  const vetve: Record<string, Uzel[]> = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    const zac = i;
    while (i < s.length && !/[\s{]/.test(s[i])) i++;
    const selektor = s.slice(zac, i);
    while (i < s.length && /\s/.test(s[i])) i++;
    if (!selektor || s[i] !== '{') return null;
    const konec = uzaviraci(s, i);
    if (konec < 0) return null;
    vetve[selektor] = parsuj(s.slice(i + 1, konec), true);
    i = konec + 1;
  }
  return Object.keys(vetve).length && ('other' in vetve || 'many' in vetve) ? vetve : null;
}

function uzly(zprava: string): Uzel[] {
  let u = cacheParseru.get(zprava);
  if (!u) {
    u = parsuj(zprava, false);
    if (cacheParseru.size > 4000) cacheParseru.clear();
    cacheParseru.set(zprava, u);
  }
  return u;
}

// ---------------------------------------------------------------------------
// Sázení

const formatyCisel = new Map<string, Intl.NumberFormat>();
function formatCisla(jazyk: Jazyk, n: number): string {
  let f = formatyCisel.get(jazyk);
  if (!f) { f = new Intl.NumberFormat(LOCALE_PRO_JAZYK[jazyk]); formatyCisel.set(jazyk, f); }
  return f.format(n);
}

function sazej(u: Uzel[], h: Hodnoty, jazyk: Jazyk, cislo: number | null): string {
  let s = '';
  for (const n of u) {
    if (n.druh === 'text') s += n.text;
    else if (n.druh === 'cislo') s += cislo === null ? '#' : formatCisla(jazyk, cislo);
    else if (n.druh === 'arg') {
      const v = h[n.jmeno];
      s += v === undefined || v === null ? n.zdroj : String(v);
    } else {
      const raw = h[n.jmeno];
      const cis = typeof raw === 'number' ? raw : raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
      if (!Number.isFinite(cis)) {
        // Bez čísla nejde vybrat tvar: ukáže se „ostatní" a `#` zůstane vidět.
        const vetev = n.vetve.other ?? n.vetve.many ?? [];
        s += sazej(vetev, h, jazyk, null);
        continue;
      }
      // Selektory `=0` se porovnávají s číslem, ne s jeho zápisem („1,5").
      const tvary: Record<string, string> = {};
      for (const [sel, vetev] of Object.entries(n.vetve)) tvary[sel] = '\u0000' + sel;
      const zvoleny = vyberTvar(jazyk, cis, tvary).slice(1);
      const vetev = n.vetve[zvoleny] ?? n.vetve.other ?? n.vetve.many ?? [];
      s += sazej(vetev, h, jazyk, cis);
    }
  }
  return s;
}

/** Dosadí hodnoty a vybere tvary. Bez závorek vrátí zprávu beze změny (rychlá cesta). */
export function formatuj(zprava: string, hodnoty: Hodnoty | undefined, jazyk: Jazyk): string {
  if (zprava.indexOf('{') < 0) return zprava;
  return sazej(uzly(zprava), hodnoty ?? {}, jazyk, null);
}

// ---------------------------------------------------------------------------
// Překlad

/** Klíč ve slovníku: s kontextem je to `věta|ctx`. */
export function klicSKontextem(klic: string, ctx?: string): string {
  return ctx ? `${klic}|${ctx}` : klic;
}

/**
 * Přeloží českou větu do jazyka. Hledá v jazyce a jeho náhradách (`de` → `en`),
 * a když nenajde nic, vrátí českou větu. Výsledek se vždy sází pravidly jazyka,
 * ve kterém se překlad našel (anglická náhrada má anglické plurály).
 */
export function preloz(slovniky: Slovniky, jazyk: Jazyk, klic: string, hodnoty?: Hodnoty, ctx?: string): string {
  if (jazyk !== 'cs') {
    const hledany = klicSKontextem(klic, ctx);
    for (const j of retezJazyku(jazyk)) {
      const nalezeno = slovniky[j]?.[hledany];
      if (typeof nalezeno === 'string' && nalezeno !== '') return formatuj(nalezeno, hodnoty, j);
    }
  }
  return formatuj(klic, hodnoty, 'cs');
}

/**
 * Text podle id (katalogy, které id už mají: alergeny, navigace). Nenajde-li
 * se, vrátí se `cs`, tedy česká hodnota z katalogu.
 */
export function prelozId(slovniky: Slovniky, jazyk: Jazyk, id: string, cs: string, hodnoty?: Hodnoty): string {
  if (jazyk !== 'cs') {
    for (const j of retezJazyku(jazyk)) {
      const nalezeno = slovniky[j]?.[`#${id}`];
      if (typeof nalezeno === 'string' && nalezeno !== '') return formatuj(nalezeno, hodnoty, j);
    }
  }
  return formatuj(cs, hodnoty, 'cs');
}

/** Slovník jazyka po sloučení sekcí. Pozdější sekce přepisují dřívější (klíče jsou stejně jedinečné věty). */
export function slouci(...slovniky: (Slovnik | undefined)[]): Slovnik {
  return Object.assign({}, ...slovniky.filter(Boolean));
}

// ---------------------------------------------------------------------------
// Pomocné funkce pro kontrolu slovníků (scripts/check-i18n.mjs)

/** Jména použitá ve zprávě: `{a}`, `{n, plural, …}` i `{x}` uvnitř větví. Seřazená, bez duplicit. */
export function jmenaVeZprave(zprava: string): string[] {
  const nalezena = new Set<string>();
  const projdi = (u: Uzel[]) => {
    for (const n of u) {
      if (n.druh === 'arg') nalezena.add(n.jmeno);
      else if (n.druh === 'plural') { nalezena.add(n.jmeno); for (const v of Object.values(n.vetve)) projdi(v); }
    }
  };
  projdi(uzly(zprava));
  return Array.from(nalezena).sort();
}

/** Selektory všech plural bloků ve zprávě (pro kontrolu, že jazyk má potřebné tvary). */
export function pluralSelektory(zprava: string): string[][] {
  const bloky: string[][] = [];
  const projdi = (u: Uzel[]) => {
    for (const n of u) if (n.druh === 'plural') { bloky.push(Object.keys(n.vetve)); for (const v of Object.values(n.vetve)) projdi(v); }
  };
  projdi(uzly(zprava));
  return bloky;
}
