// Seznam členů ve správě: dotaz (filtry, řazení, stránkování), export do CSV,
// hledání duplicit, slučování hodnot a hromadné přidání do skupiny z CSV.
// Čistá logika bez databáze (testy: scripts/testy/k81-clenove.ts); SQL je
// v app/api/client/admin/customers a lib/clenoveDb.ts.

import { jeSegment } from './segmenty.ts';
import { ctiKombinaci } from './skupinyPravidla.ts';
import { proHledani } from './hledani.ts';
import { rozeberTabulku, navrhniMapovani, cistiTelefon, MAX_RADKU } from './importKarticka.ts';
import { normalizujEmail, vypadaJakoEmail } from './emailAdresa.ts';

// ---- Dotaz ------------------------------------------------------------------------

export const RAZENI_CLENU: { id: string; label: string }[] = [
  { id: 'aktivita', label: 'Naposledy byli' },
  { id: 'jmeno', label: 'Jméno A až Z' },
  { id: 'body', label: 'Nejvíc bodů' },
  { id: 'navstevy', label: 'Nejvíc návštěv' },
  { id: 'utrata', label: 'Nejvyšší útrata' },
  { id: 'nejnovejsi', label: 'Nejnovější členové' },
  { id: 'nejstarsi', label: 'Nejdéle členové' },
];

export const UROVNE_FILTR = ['bronze', 'silver', 'gold', 'platinum'] as const;

export const STAVY_FILTR: { id: string; label: string }[] = [
  { id: 'blokovani', label: 'Blokovaní' },
  { id: 'souhlas', label: 'Souhlasí se zprávami' },
  { id: 'bez_souhlasu', label: 'Bez souhlasu se zprávami' },
  { id: 'bez_navstevy', label: 'Ještě nebyli u kasy' },
];

export const NA_STRANU = 50;
export const MAX_NA_STRANU = 200;
export const MAX_EXPORT = 5000;
/** Kolik členů smí jedna hromadná akce zasáhnout najednou (větší výběr se posílá po dávkách). */
export const MAX_HROMADNE_AKCE = 500;

export interface DotazClenu {
  q: string;
  razeni: string;
  strana: number;
  naStranu: number;
  uroven: string;
  skupina: number | null;
  /** Segment (quiet:60, birthday:month, …) nebo kombinace `mix:…`. */
  segment: string | null;
  stav: string;
}

type Zdroj = URLSearchParams | Record<string, string | undefined>;
const cti = (p: Zdroj, k: string): string => String((p instanceof URLSearchParams ? p.get(k) : p[k]) ?? '');

/** Parametry adresy → bezpečný dotaz. Neznámé hodnoty se tiše zahodí, nikdy nespadnou do SQL. */
export function dotazClenu(p: Zdroj): DotazClenu {
  const razeni = RAZENI_CLENU.some(r => r.id === cti(p, 'sort')) ? cti(p, 'sort') : 'aktivita';
  const strana = Math.max(1, Math.min(100000, parseInt(cti(p, 'strana'), 10) || 1));
  // `limit` je starší parametr widgetu „Členové klubu“ (pět nejvěrnějších): bere se jako velikost stránky, nejvýš 500.
  const limit = parseInt(cti(p, 'limit'), 10);
  const naStranu = Number.isFinite(limit) && limit > 0 ? Math.min(500, limit) : Math.max(1, Math.min(MAX_NA_STRANU, parseInt(cti(p, 'naStranu'), 10) || NA_STRANU));
  const uroven = (UROVNE_FILTR as readonly string[]).includes(cti(p, 'uroven')) ? cti(p, 'uroven') : '';
  const gid = parseInt(cti(p, 'skupina'), 10);
  const seg = cti(p, 'segment');
  const segment = jeSegment(seg) || ctiKombinaci(seg) ? seg : null;
  const stav = STAVY_FILTR.some(s => s.id === cti(p, 'stav')) ? cti(p, 'stav') : '';
  return { q: cti(p, 'q').trim().slice(0, 80), razeni, strana, naStranu, uroven, skupina: Number.isFinite(gid) && gid > 0 ? gid : null, segment, stav };
}

/** Kolik filtrů je zapnutých (kromě hledání) — pro štítek „Filtry (2)“ a tlačítko „Zrušit filtry“. */
export function pocetFiltru(d: Pick<DotazClenu, 'uroven' | 'skupina' | 'segment' | 'stav'>): number {
  return (d.uroven ? 1 : 0) + (d.skupina ? 1 : 0) + (d.segment ? 1 : 0) + (d.stav ? 1 : 0);
}

/** Adresa API pro daný dotaz (jen to, co se liší od výchozího). */
export function adresaDotazu(d: Partial<DotazClenu>, extra: Record<string, string> = {}): string {
  const u = new URLSearchParams();
  if (d.q) u.set('q', d.q);
  if (d.razeni && d.razeni !== 'aktivita') u.set('sort', d.razeni);
  if (d.strana && d.strana > 1) u.set('strana', String(d.strana));
  if (d.naStranu && d.naStranu !== NA_STRANU) u.set('naStranu', String(d.naStranu));
  if (d.uroven) u.set('uroven', d.uroven);
  if (d.skupina) u.set('skupina', String(d.skupina));
  if (d.segment) u.set('segment', d.segment);
  if (d.stav) u.set('stav', d.stav);
  for (const [k, v] of Object.entries(extra)) u.set(k, v);
  const s = u.toString();
  return `/api/client/admin/customers${s ? `?${s}` : ''}`;
}

/** Kolik stran má seznam; prázdný seznam má jednu. */
export function pocetStran(total: number, naStranu: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, naStranu)));
}

/** Hranice úrovně pro filtr: kolik návštěv (nebo útrata) znamená danou úroveň. `do` je horní hranice bez rovnosti. */
export function hraniceUrovne(uroven: string, th: { silver: number; gold: number; platinum: number }): { od: number; do: number | null } | null {
  const plat = th.platinum > 0 ? th.platinum : null;
  if (uroven === 'bronze') return { od: 0, do: th.silver };
  if (uroven === 'silver') return { od: th.silver, do: th.gold };
  if (uroven === 'gold') return { od: th.gold, do: plat };
  if (uroven === 'platinum') return plat ? { od: plat, do: null } : null;
  return null;
}

// ---- Telefon ----------------------------------------------------------------------

/**
 * Telefon ve tvaru +420123456789. Devět číslic bez předvolby se bere jako české číslo,
 * „00“ na začátku jako „+“. Příliš krátké nebo dlouhé číslo dává null.
 */
export function normalizujTelefon(v: unknown): string | null {
  let s = String(v ?? '').trim();
  if (!s) return null;
  const plus = s.startsWith('+');
  let cislice = s.replace(/\D/g, '');
  if (!plus && cislice.startsWith('00')) cislice = cislice.slice(2);
  else if (!plus && cislice.length === 9) cislice = `420${cislice}`;
  else if (!plus && cislice.length < 9) return null;
  return cislice.length >= 9 && cislice.length <= 15 ? `+${cislice}` : null;
}

/** Telefon pro čtení: „+420 777 123 456“. Cizí tvar se nechá, jak je. */
export function telefonCitelne(v: unknown): string {
  const n = normalizujTelefon(v);
  if (!n) return String(v ?? '').trim();
  const m = /^\+420(\d{3})(\d{3})(\d{3})$/.exec(n);
  return m ? `+420 ${m[1]} ${m[2]} ${m[3]}` : n;
}

// ---- CSV --------------------------------------------------------------------------

/**
 * Buňka CSV. Uvozovky se zdvojí a pole se uzavře, když obsahuje oddělovač, uvozovku nebo odřádkování.
 * Text, který by tabulka vzala za vzorec (=, +, -, @ na začátku), dostane apostrof — jinak by jméno
 * „=HYPERLINK(…)“ z hostovského profilu běželo v Excelu správce. Čísla zůstávají čísly.
 */
export function bunkaCsv(v: unknown): string {
  if (v == null) return '';
  let s = typeof v === 'number' ? String(v) : String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface RadekExportu {
  id: number; name: string; email?: string | null; phone?: string | null;
  points: number; stamps: number; visits: number; spend: number;
  level_label?: string | null; joined_at?: string | null; last_visit_at?: string | null;
  blocked?: boolean; note?: string | null; novinky?: boolean;
}

/** CSV členů pro Excel: středník, BOM, CRLF. Kontakty jen když je smí vidět ten, kdo exportuje. */
export function csvClenu(radky: RadekExportu[], volby: { kontakty: boolean; denCesky: (v: unknown) => string }): string {
  const hlavicka = ['Jméno', ...(volby.kontakty ? ['E-mail', 'Telefon'] : []), 'Body', 'Razítka', 'Návštěvy', 'Útrata', 'Úroveň', 'Člen od', 'Naposledy', 'Blokovaný', 'Souhlas se zprávami', 'Poznámka'];
  const telo = radky.map(r => [
    r.name, ...(volby.kontakty ? [r.email ?? '', r.phone ? telefonCitelne(r.phone) : ''] : []),
    r.points, r.stamps, r.visits, r.spend, r.level_label ?? '', volby.denCesky(r.joined_at), r.last_visit_at ? volby.denCesky(r.last_visit_at) : '',
    r.blocked ? 'ano' : 'ne', r.novinky ? 'ano' : 'ne', r.note ?? '',
  ]);
  return '﻿' + [hlavicka, ...telo].map(r => r.map(bunkaCsv).join(';')).join('\r\n') + '\r\n';
}

// ---- Duplicity --------------------------------------------------------------------

export interface KandidatDuplicity {
  id: number; name: string; email?: string | null; phone?: string | null;
  joined_at?: string | null; points?: number; visits?: number;
}

export type DuvodDuplicity = 'telefon' | 'email' | 'jmeno';
export interface SkupinaDuplicit { duvod: DuvodDuplicity; klic: string; ids: number[] }

/** E-mail bez „+štítku“ a u Gmailu bez teček: jan.novak+kavarna@gmail.com a jannovak@gmail.com jsou jedna schránka. */
export function klicEmailu(v: unknown): string | null {
  const e = normalizujEmail(v);
  if (!vypadaJakoEmail(e)) return null;
  let [lokal, domena] = e.split('@');
  lokal = lokal.split('+')[0];
  if (domena === 'googlemail.com') domena = 'gmail.com';
  if (domena === 'gmail.com') lokal = lokal.replace(/\./g, '');
  return lokal ? `${lokal}@${domena}` : null;
}

/** Jméno bez diakritiky a na pořadí slov nezáleží („Novák Jan“ = „jan novak“). Jedno slovo nestačí. */
export function klicJmena(v: unknown): string | null {
  const slova = proHledani(v).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return slova.length >= 2 ? slova.sort().join(' ') : null;
}

const SILA: Record<DuvodDuplicity, number> = { telefon: 3, email: 2, jmeno: 1 };

/**
 * Členové, kteří vypadají jako jeden člověk: stejný telefon, stejná e-mailová schránka, nebo stejné
 * jméno (to je nejslabší důvod — dva Jan Novákové existují). Skupiny se překrývají přes společného
 * člena, takže každý člen je nejvýš v jedné. Nejsilnější důvod skupiny je první v seznamu.
 */
export function najdiDuplicity(clenove: KandidatDuplicity[]): SkupinaDuplicit[] {
  const otec = new Map<number, number>();
  const najdi = (x: number): number => { let r = x; while (otec.get(r) !== r) r = otec.get(r)!; otec.set(x, r); return r; };
  for (const c of clenove) otec.set(c.id, c.id);
  const duvody = new Map<number, { duvod: DuvodDuplicity; klic: string }[]>();
  const zapis = (druh: DuvodDuplicity, klicFn: (c: KandidatDuplicity) => string | null) => {
    const by = new Map<string, number[]>();
    for (const c of clenove) { const k = klicFn(c); if (k) by.set(k, [...(by.get(k) ?? []), c.id]); }
    for (const [k, ids] of by) {
      if (ids.length < 2) continue;
      for (let i = 1; i < ids.length; i++) otec.set(najdi(ids[i]), najdi(ids[0]));
      for (const id of ids) duvody.set(id, [...(duvody.get(id) ?? []), { duvod: druh, klic: k }]);
    }
  };
  zapis('telefon', c => normalizujTelefon(c.phone));
  zapis('email', c => klicEmailu(c.email));
  zapis('jmeno', c => klicJmena(c.name));
  const skupiny = new Map<number, number[]>();
  for (const c of clenove) { if (!duvody.has(c.id)) continue; const r = najdi(c.id); skupiny.set(r, [...(skupiny.get(r) ?? []), c.id]); }
  const out: SkupinaDuplicit[] = [];
  for (const ids of skupiny.values()) {
    if (ids.length < 2) continue;
    const vse = ids.flatMap(id => duvody.get(id) ?? []);
    const nej = vse.sort((a, b) => SILA[b.duvod] - SILA[a.duvod])[0];
    // Nejstarší člen (nejnižší id) první: ten je přirozený „hlavní“.
    out.push({ duvod: nej.duvod, klic: nej.klic, ids: ids.sort((a, b) => a - b) });
  }
  return out.sort((a, b) => SILA[b.duvod] - SILA[a.duvod] || a.ids[0] - b.ids[0]);
}

// ---- Slučování --------------------------------------------------------------------

export interface HodnotyClena {
  points: number; stamps: number; visits: number; spend: number; credit: number;
  joined_at: string | null; last_visit_at: string | null; note: string | null;
}

const casMs = (v: string | null | undefined): number => {
  if (!v) return NaN;
  const t = new Date(String(v).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? '' : 'Z')).getTime();
  return t;
};

/** Hodnoty po sloučení: čísla se sečtou, „člen od“ je dřívější, „naposledy“ pozdější, poznámky se spojí. */
export function slouceniHodnot(hlavni: HodnotyClena, duplicita: HodnotyClena): HodnotyClena {
  const dd = (a: string | null, b: string | null, nejdriv: boolean): string | null => {
    const ta = casMs(a), tb = casMs(b);
    if (Number.isNaN(ta)) return Number.isNaN(tb) ? null : b;
    if (Number.isNaN(tb)) return a;
    return (nejdriv ? ta <= tb : ta >= tb) ? a : b;
  };
  const poznamky = [hlavni.note, duplicita.note].map(x => (x ?? '').trim()).filter(Boolean);
  const unikatni = poznamky.filter((p, i) => poznamky.indexOf(p) === i);
  return {
    points: hlavni.points + duplicita.points,
    stamps: hlavni.stamps + duplicita.stamps,
    visits: hlavni.visits + duplicita.visits,
    spend: hlavni.spend + duplicita.spend,
    credit: hlavni.credit + duplicita.credit,
    joined_at: dd(hlavni.joined_at, duplicita.joined_at, true),
    last_visit_at: dd(hlavni.last_visit_at, duplicita.last_visit_at, false),
    note: unikatni.length ? unikatni.join(' | ').slice(0, 500) : null,
  };
}

/** Věta pro potvrzení slučování: co se sečte. */
export function popisSlouceni(h: HodnotyClena, d: HodnotyClena): string {
  return `Body ${h.points} + ${d.points}, návštěvy ${h.visits} + ${d.visits}`;
}

// ---- Přidání do skupiny z CSV -------------------------------------------------------

export interface RadekSkupiny { radek: number; email: string | null; telefon: string | null; jmeno: string | null }

/**
 * Rozebere vložený text nebo soubor CSV pro přidání členů do skupiny. Hlavička se pozná podle názvů
 * sloupců (E-mail, Telefon, Jméno); bez hlavičky se každá buňka posoudí zvlášť: s @ je e-mail, samé
 * číslice telefon, jinak jméno. Řádky bez použitelného údaje se hlásí v `prazdne`.
 */
export function radkyProSkupinu(text: string): { radky: RadekSkupiny[]; prazdne: number[]; zkraceno: boolean } {
  const { hlavicka, radky, rozdelovac } = rozeberTabulku(text);
  const mapa = navrhniMapovani(hlavicka);
  const maHlavicku = mapa.email !== undefined || mapa.telefon !== undefined || mapa.jmeno !== undefined;
  const vsechny = maHlavicku ? radky : [hlavicka, ...radky].filter(r => r.length);
  const zkraceno = vsechny.length > MAX_RADKU;
  const out: RadekSkupiny[] = [];
  const prazdne: number[] = [];
  vsechny.slice(0, MAX_RADKU).forEach((r, i) => {
    const cislo = i + (maHlavicku ? 2 : 1);
    let email: string | null = null, telefon: string | null = null, jmeno: string | null = null;
    if (maHlavicku) {
      const bunka = (idx: number | undefined) => (idx === undefined ? '' : (r[idx] ?? '').trim());
      const e = normalizujEmail(bunka(mapa.email));
      email = vypadaJakoEmail(e) ? e : null;
      telefon = normalizujTelefon(bunka(mapa.telefon));
      const jm = [bunka(mapa.jmeno), bunka(mapa.prijmeni)].filter(Boolean).join(' ');
      jmeno = jm || null;
    } else {
      for (const b of r) {
        const t = b.trim();
        if (!t) continue;
        if (t.includes('@')) { const e = normalizujEmail(t); if (!email && vypadaJakoEmail(e)) email = e; }
        else if (/^[+\d\s()-]+$/.test(t) && cistiTelefon(t)) { telefon = telefon ?? normalizujTelefon(t); }
        else jmeno = jmeno ?? t;
      }
    }
    if (!email && !telefon && !jmeno) prazdne.push(cislo);
    else out.push({ radek: cislo, email, telefon, jmeno });
  });
  void rozdelovac;
  return { radky: out, prazdne, zkraceno };
}

export interface CilovyClen { id: number; name: string; email?: string | null; phone?: string | null }

export interface SparovaniSkupiny {
  nalezeno: { radek: number; id: number; name: string; podle: 'email' | 'telefon' | 'jmeno' }[];
  nenalezeno: { radek: number; hodnota: string; duvod: string }[];
}

/**
 * Spáruje řádky s členy podniku: e-mail, pak telefon, pak celé jméno (jen když je jednoznačné).
 * Nikdo se nezakládá — kdo není člen, je v `nenalezeno` s důvodem. Jeden člen se přidá nejvýš jednou.
 */
export function sparujSClenyPodniku(radky: RadekSkupiny[], clenove: CilovyClen[]): SparovaniSkupiny {
  const poEmailu = new Map<string, CilovyClen>();
  const poTelefonu = new Map<string, CilovyClen[]>();
  const poJmenu = new Map<string, CilovyClen[]>();
  for (const c of clenove) {
    const k = normalizujEmail(c.email);
    if (k) poEmailu.set(k, c);
    const t = normalizujTelefon(c.phone);
    if (t) poTelefonu.set(t, [...(poTelefonu.get(t) ?? []), c]);
    const j = proHledani(c.name).replace(/\s+/g, ' ');
    if (j) poJmenu.set(j, [...(poJmenu.get(j) ?? []), c]);
  }
  const videno = new Set<number>();
  const nalezeno: SparovaniSkupiny['nalezeno'] = [];
  const nenalezeno: SparovaniSkupiny['nenalezeno'] = [];
  for (const r of radky) {
    let c: CilovyClen | undefined; let podle: 'email' | 'telefon' | 'jmeno' | null = null;
    let duvod = 'Není členem podniku.';
    if (r.email && poEmailu.has(r.email)) { c = poEmailu.get(r.email); podle = 'email'; }
    if (!c && r.telefon) {
      const shody = poTelefonu.get(r.telefon) ?? [];
      if (shody.length === 1) { c = shody[0]; podle = 'telefon'; }
      else if (shody.length > 1) duvod = 'Telefon má víc členů, napiš e-mail.';
    }
    if (!c && r.jmeno) {
      const shody = poJmenu.get(proHledani(r.jmeno).replace(/\s+/g, ' ')) ?? [];
      if (shody.length === 1) { c = shody[0]; podle = 'jmeno'; }
      else if (shody.length > 1) duvod = 'Jméno má víc členů, napiš e-mail nebo telefon.';
    }
    if (!c || !podle) { nenalezeno.push({ radek: r.radek, hodnota: r.email ?? r.telefon ?? r.jmeno ?? '', duvod }); continue; }
    if (videno.has(c.id)) continue;
    videno.add(c.id);
    nalezeno.push({ radek: r.radek, id: c.id, name: c.name, podle });
  }
  return { nalezeno, nenalezeno };
}

/** CSV s řádky, které se nepodařilo spárovat (ke stažení a opravě). */
export function csvNenalezenych(n: SparovaniSkupiny['nenalezeno']): string {
  return '﻿' + [['Řádek', 'Údaj', 'Důvod'], ...n.map(x => [x.radek, x.hodnota, x.duvod])].map(r => r.map(bunkaCsv).join(';')).join('\r\n') + '\r\n';
}
