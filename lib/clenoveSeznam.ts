// Správa členů: telefon, hledání duplicit, slučování hodnot a hromadné přidání do skupiny
// z CSV. Filtry, řazení, stránkování a export seznamu jsou v lib/clenoveFiltr.ts.
// Čistá logika bez databáze (testy: scripts/testy/k81-sprava-clenu.ts); SQL je
// v app/api/client/admin/customers a lib/clenoveDb.ts.

import { proHledani } from './hledani.ts';
import { bunkaCsv } from './clenoveFiltr.ts';
import { rozeberTabulku, navrhniMapovani, cistiTelefon, MAX_RADKU } from './importKarticka.ts';
import { normalizujEmail, vypadaJakoEmail } from './emailAdresa.ts';

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
// Samotné sloučení (součty, přesun deníku, kuponů, razítek a poznámek) dělá SQL v lib/clenoveDb.ts › slucClena.

/** Věta pro potvrzení slučování: co se sečte. */
export function popisSlouceni(h: { points: number; visits: number }, d: { points: number; visits: number }): string {
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
