// Přechod z jiné věrnostní aplikace (Kartička a podobné): čtení tabulky, rozpoznání sloupců
// a převod řádků na členy Managero client. Čisté funkce bez Reactu a bez databáze, ať je pokryje test
// i server (stejné pravidlo běží v prohlížeči před odesláním a na serveru po přijetí).
//
// Proč obecný soubor, a ne přesný formát Kartičky: Kartička formát exportu nezveřejňuje (na webu je jen
// „Přechod od konkurence?“ s kontaktem na podporu). Čte se proto cokoli, co jde uložit jako CSV nebo
// vložit z Excelu (tabulátory), a sloupce se rozpoznávají podle názvu — česky i anglicky, s diakritikou
// i bez. Co se nepozná, nastaví člověk jedním výběrem v náhledu.

import { normalizujEmail, vypadaJakoEmail } from './emailAdresa.ts';
import { platneDatum } from './rozvrhCsv.ts';

export type PoleImportu =
  | 'jmeno' | 'prijmeni' | 'email' | 'telefon' | 'narozeniny'
  | 'razitka' | 'body' | 'kredit' | 'navstevy' | 'posledniNavsteva' | 'skupina' | 'cisloKarty';

export const POLE: readonly { id: PoleImportu; popis: string; napoveda: string }[] = [
  { id: 'email', popis: 'E-mail', napoveda: 'Povinný: podle něj se člen najde a může se přihlásit.' },
  { id: 'jmeno', popis: 'Jméno', napoveda: 'Jméno, nebo celé jméno, když je v jednom sloupci.' },
  { id: 'prijmeni', popis: 'Příjmení', napoveda: 'Připojí se za jméno.' },
  { id: 'telefon', popis: 'Telefon', napoveda: '' },
  { id: 'narozeniny', popis: 'Datum narození', napoveda: 'Kvůli dárku k narozeninám. Musí mít rok.' },
  { id: 'body', popis: 'Body', napoveda: 'Počáteční stav bodů.' },
  { id: 'kredit', popis: 'Kredit / cashback', napoveda: 'V celých korunách (haléře se zaokrouhlí).' },
  { id: 'razitka', popis: 'Razítka', napoveda: 'Počet razítek na rozdělané kartě.' },
  { id: 'navstevy', popis: 'Počet návštěv', napoveda: 'Počítá se do úrovně člena.' },
  { id: 'posledniNavsteva', popis: 'Poslední návštěva', napoveda: '' },
  { id: 'skupina', popis: 'Skupina', napoveda: 'Slevová skupina nebo úroveň; založí se jako skupina členů.' },
  { id: 'cisloKarty', popis: 'Číslo staré karty', napoveda: 'Zapíše se do poznámky v deníku člena.' },
];

/** Rozumná horní mez: chyba v sloupci (telefon místo bodů) nesmí člena obdarovat milionem bodů. */
export const MAX_HODNOTA = 1_000_000;
export const MAX_RADKU = 5000;

// ---- Čtení tabulky ----------------------------------------------------------------

/** Rozdělovač podle první neprázdné řádky mimo uvozovky: tabulátor (vložení z Excelu), pak středník, pak čárka. */
export function poznejRozdelovac(text: string): string {
  const prvni = text.split(/\r?\n/).find(r => r.trim()) ?? '';
  let v = false;
  const n: Record<string, number> = { '\t': 0, ';': 0, ',': 0 };
  for (const ch of prvni) {
    if (ch === '"') v = !v;
    else if (!v && ch in n) n[ch]++;
  }
  return n['\t'] > 0 ? '\t' : n[';'] >= n[','] && n[';'] > 0 ? ';' : n[','] > 0 ? ',' : ';';
}

/** Tabulka z textu CSV/TSV: uvozovky, zdvojené uvozovky a odřádkování uvnitř pole, BOM. */
export function rozeberTabulku(text: string): { hlavicka: string[]; radky: string[][]; rozdelovac: string } {
  const src = text.replace(/^﻿/, '');
  const rozdelovac = poznejRozdelovac(src);
  const radky: string[][] = [];
  let pole: string[] = [], cur = '', v = false;
  const konecPole = () => { pole.push(cur); cur = ''; };
  const konecRadku = () => { konecPole(); if (pole.some(x => x.trim() !== '')) radky.push(pole.map(x => x.trim())); pole = []; };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (v) {
      if (ch === '"' && src[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') v = false;
      else cur += ch;
    } else if (ch === '"') v = true;
    else if (ch === rozdelovac) konecPole();
    else if (ch === '\n') konecRadku();
    else if (ch === '\r') { if (src[i + 1] !== '\n') konecRadku(); }
    else cur += ch;
  }
  if (cur !== '' || pole.length) konecRadku();
  const [hlavicka = [], ...telo] = radky;
  return { hlavicka, radky: telo, rozdelovac };
}

// ---- Rozpoznání sloupců -----------------------------------------------------------

/** Název sloupce bez diakritiky, mezer a interpunkce: „Datum narození“ → „datumnarozeni“. */
export function klicSloupce(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const SYNONYMA: Record<PoleImportu, string[]> = {
  email: ['email', 'mail', 'emailovaadresa', 'epost', 'emailzakaznika'],
  jmeno: ['jmeno', 'name', 'firstname', 'krestnijmeno', 'celejmeno', 'fullname', 'zakaznik', 'jmenoaprijmeni', 'prijmeniajmeno', 'clen'],
  prijmeni: ['prijmeni', 'lastname', 'surname'],
  telefon: ['telefon', 'tel', 'mobil', 'phone', 'telefonnicislo', 'cislotelefonu', 'mobilnitelefon'],
  narozeniny: ['narozeniny', 'datumnarozeni', 'narozen', 'narozeni', 'birthday', 'birthdate', 'dob', 'datumnarozeniny'],
  body: ['body', 'pocetbodu', 'points', 'bodovystav', 'stavbodu', 'zustatekbodu'],
  kredit: ['kredit', 'cashback', 'zustatek', 'penezenka', 'credit', 'balance', 'zustatekkreditu', 'stavkreditu', 'zustatekcashbacku'],
  razitka: ['razitka', 'pocetrazitek', 'stamps', 'razitko', 'stavrazitek'],
  navstevy: ['navstevy', 'pocetnavstev', 'visits', 'pocetnakupu', 'nakupy', 'pocettransakci', 'transakce'],
  posledniNavsteva: ['posledninavsteva', 'lastvisit', 'posledninakup', 'datumposledninavstevy', 'naposledy', 'posledniaktivita'],
  skupina: ['skupina', 'slevovaskupina', 'group', 'uroven', 'tier', 'level', 'stupen', 'status', 'kategorie'],
  cisloKarty: ['cislokarty', 'karta', 'kartaid', 'card', 'cardnumber', 'kod', 'cislokarticky', 'cisloclena', 'id', 'cisloclenstvi'],
};

/**
 * Navrhne, který sloupec je které pole. Nejdřív přesná shoda názvu, potom shoda části názvu
 * („Počet razítek celkem“ → razítka); jeden sloupec nikdy nepatří dvěma polím.
 */
export function navrhniMapovani(hlavicka: string[]): Partial<Record<PoleImportu, number>> {
  const klice = hlavicka.map(klicSloupce);
  const out: Partial<Record<PoleImportu, number>> = {};
  const pouzite = new Set<number>();
  const pole = Object.keys(SYNONYMA) as PoleImportu[];
  for (const f of pole) {
    const i = klice.findIndex((k, idx) => !pouzite.has(idx) && SYNONYMA[f].includes(k));
    if (i >= 0) { out[f] = i; pouzite.add(i); }
  }
  for (const f of pole) {
    if (out[f] !== undefined) continue;
    const i = klice.findIndex((k, idx) => !pouzite.has(idx) && k.length >= 4 && SYNONYMA[f].some(s => s.length >= 4 && (k.includes(s) || s.includes(k))));
    if (i >= 0) { out[f] = i; pouzite.add(i); }
  }
  return out;
}

// ---- Hodnoty ----------------------------------------------------------------------

/** „1 250,50 Kč“, „12,5“, „1.250“ → číslo; nečitelné → null. Tisícové oddělovače se poznají podle třech číslic za nimi. */
export function parseCislo(v: unknown): number | null {
  let s = String(v ?? '').replace(/[ \s]/g, '').replace(/(kč|czk|eur|€|bodů|bodu|b\.)/gi, '').trim();
  if (s === '') return null;
  if (!/^[+-]?[\d.,]+$/.test(s)) return null;
  const posledniC = s.lastIndexOf(','), posledniT = s.lastIndexOf('.');
  if (posledniC >= 0 && posledniT >= 0) {
    // Oba znaky: ten pozdější je desetinný, druhý tisícový.
    const des = posledniC > posledniT ? ',' : '.';
    s = s.split(des === ',' ? '.' : ',').join('').replace(des, '.');
  } else if (posledniC >= 0 || posledniT >= 0) {
    const zn = posledniC >= 0 ? ',' : '.';
    const casti = s.split(zn);
    // „1.250“ a „1,250“ se třemi číslicemi a víc výskyty = tisícový oddělovač, „12,5“ = desetinná čárka.
    if (casti.length > 2 || (casti[1]?.length === 3 && casti[0].replace(/\D/g, '').length <= 3 && casti[0] !== '0' && casti[0] !== '')) s = casti.join('');
    else s = casti.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Datum jako `RRRR-MM-DD` z „5. 3. 1990“, „05.03.1990“, „1990-03-05“, „5/3/1990“, ISO s časem; bez roku nebo neexistující → null. */
export function parseDatum(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  let r: number, mm: number, d: number;
  if (m) { r = +m[1]; mm = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})(?:[T\s].*)?$/.exec(s))) { d = +m[1]; mm = +m[2]; r = +m[3]; }
  else return null;
  const iso = `${String(r).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return platneDatum(iso) ? iso : null;
}

/** Telefon bez mezer a závorek; „+420 777 123 456“ → „+420777123456“. Příliš krátké nebo dlouhé → null. */
export function cistiTelefon(v: unknown): string | null {
  const s = String(v ?? '').replace(/[^\d+]/g, '');
  const cislice = s.replace(/\D/g, '');
  return cislice.length >= 7 && cislice.length <= 15 ? s : null;
}

// ---- Převod řádků -----------------------------------------------------------------

export interface RadekImportu {
  radek: number;
  jmeno: string;
  email: string;
  telefon: string | null;
  narozeniny: string | null;
  razitka: number;
  body: number;
  kredit: number;
  navstevy: number;
  posledniNavsteva: string | null;
  skupina: string | null;
  cisloKarty: string | null;
}

export interface ChybaRadku { radek: number; duvod: string; hodnota?: string }
export interface VysledekRozboru { radky: RadekImportu[]; chyby: ChybaRadku[]; upozorneni: { radek: number; text: string }[] }

export type Mapovani = Partial<Record<PoleImportu, number>>;

/**
 * Z tabulky udělá členy. Řádek bez platného e-mailu se přeskočí (e-mail je klíč účtu), stejný e-mail
 * podruhé v souboru taky; nečitelné číslo nebo datum řádek nezahodí, jen se nezapíše a ohlásí se
 * v upozornění — člen o body nepřijde kvůli jednomu překlepu v kolonce s telefonem.
 */
export function prevedRadky(radky: string[][], mapovani: Mapovani): VysledekRozboru {
  const chyby: ChybaRadku[] = [];
  const upozorneni: { radek: number; text: string }[] = [];
  const out: RadekImportu[] = [];
  const videno = new Map<string, number>();
  const bunka = (r: string[], f: PoleImportu): string => {
    const i = mapovani[f];
    return i === undefined ? '' : (r[i] ?? '').trim();
  };
  radky.forEach((r, idx) => {
    const radek = idx + 2; // 1 je hlavička
    if (out.length >= MAX_RADKU) { if (out.length === MAX_RADKU && !chyby.some(c => c.duvod.startsWith('Soubor má víc'))) chyby.push({ radek, duvod: `Soubor má víc než ${MAX_RADKU} členů; zbytek přeskočen. Rozdělte ho na více souborů.` }); return; }
    const email = normalizujEmail(bunka(r, 'email'));
    if (!email) { chyby.push({ radek, duvod: 'Chybí e-mail.' }); return; }
    if (!vypadaJakoEmail(email)) { chyby.push({ radek, duvod: 'E-mail nevypadá správně.', hodnota: email.slice(0, 60) }); return; }
    const jiz = videno.get(email);
    if (jiz) { chyby.push({ radek, duvod: `Stejný e-mail už je na řádku ${jiz}.`, hodnota: email }); return; }
    videno.set(email, radek);

    const cele = (f: PoleImportu): number => {
      const hrube = bunka(r, f);
      if (!hrube) return 0;
      const n = parseCislo(hrube);
      if (n === null) { upozorneni.push({ radek, text: `${POLE.find(p => p.id === f)?.popis ?? f}: „${hrube.slice(0, 30)}“ není číslo, zapsáno 0.` }); return 0; }
      if (n < 0) { upozorneni.push({ radek, text: `${POLE.find(p => p.id === f)?.popis ?? f}: záporná hodnota ${hrube.slice(0, 20)}, zapsáno 0.` }); return 0; }
      if (n > MAX_HODNOTA) { upozorneni.push({ radek, text: `${POLE.find(p => p.id === f)?.popis ?? f}: hodnota ${hrube.slice(0, 20)} je nad ${MAX_HODNOTA} (milion), zapsáno 0.` }); return 0; }
      if (f === 'kredit' && n !== Math.round(n)) upozorneni.push({ radek, text: `Kredit ${hrube.slice(0, 20)} zaokrouhlen na celé koruny.` });
      return Math.round(n);
    };

    const jm = [bunka(r, 'jmeno'), bunka(r, 'prijmeni')].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const nar = bunka(r, 'narozeniny');
    const narIso = nar ? parseDatum(nar) : null;
    if (nar && !narIso) upozorneni.push({ radek, text: `Datum narození „${nar.slice(0, 20)}“ se nepodařilo přečíst (potřebuje den, měsíc i rok), nezapsáno.` });
    const posl = bunka(r, 'posledniNavsteva');
    const poslIso = posl ? parseDatum(posl) : null;
    if (posl && !poslIso) upozorneni.push({ radek, text: `Poslední návštěva „${posl.slice(0, 20)}“ se nepodařilo přečíst, nezapsáno.` });
    const tel = bunka(r, 'telefon');
    const telC = tel ? cistiTelefon(tel) : null;
    if (tel && !telC) upozorneni.push({ radek, text: `Telefon „${tel.slice(0, 20)}“ nevypadá správně, nezapsán.` });

    out.push({
      radek,
      jmeno: (jm || email.split('@')[0]).slice(0, 80),
      email,
      telefon: telC,
      narozeniny: narIso,
      razitka: cele('razitka'),
      body: cele('body'),
      kredit: cele('kredit'),
      navstevy: cele('navstevy'),
      posledniNavsteva: poslIso,
      skupina: bunka(r, 'skupina').slice(0, 60) || null,
      cisloKarty: bunka(r, 'cisloKarty').slice(0, 40) || null,
    });
  });
  return { radky: out, chyby, upozorneni };
}

/** Souhrn pro náhled: kolik členů, součty a skupiny, které se založí. */
export function souhrnImportu(radky: RadekImportu[]) {
  const skupiny = new Map<string, number>();
  for (const r of radky) if (r.skupina) skupiny.set(r.skupina, (skupiny.get(r.skupina) ?? 0) + 1);
  return {
    clenu: radky.length,
    body: radky.reduce((a, r) => a + r.body, 0),
    kredit: radky.reduce((a, r) => a + r.kredit, 0),
    razitka: radky.reduce((a, r) => a + r.razitka, 0),
    sRazitky: radky.filter(r => r.razitka > 0).length,
    skupiny: [...skupiny.entries()].map(([nazev, pocet]) => ({ nazev, pocet })).sort((a, b) => b.pocet - a.pocet),
  };
}

/** Chyby jako CSV ke stažení, ať je co opravit a nahrát znovu. */
export function chybyJakoCsv(chyby: ChybaRadku[]): string {
  const p = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return ['radek;duvod;hodnota', ...chyby.map(c => [String(c.radek), p(c.duvod), p(c.hodnota ?? '')].join(';'))].join('\n');
}

/**
 * Řádek z těla požadavku: API je volatelné i mimo náš formulář, takže se nevěří ničemu (typy, meze, e-mail).
 * Neplatný řádek vrátí null; čísla se ořežou do mezí a zaokrouhlí.
 */
export function ocistiRadek(raw: any, poradi: number): RadekImportu | null {
  if (!raw || typeof raw !== 'object') return null;
  const email = normalizujEmail(raw.email);
  if (!email || !vypadaJakoEmail(email) || email.length > 120) return null;
  const cele = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(MAX_HODNOTA, Math.max(0, n)) : 0; };
  const text = (v: unknown, max: number) => { const s = String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); return s || null; };
  const datum = (v: unknown) => { const s = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) && platneDatum(s) ? s : null; };
  const tel = text(raw.telefon, 20);
  return {
    radek: Number.isFinite(Number(raw.radek)) ? Math.round(Number(raw.radek)) : poradi,
    jmeno: text(raw.jmeno, 80) ?? email.split('@')[0],
    email,
    telefon: tel && cistiTelefon(tel) ? cistiTelefon(tel) : null,
    narozeniny: datum(raw.narozeniny),
    razitka: cele(raw.razitka), body: cele(raw.body), kredit: cele(raw.kredit), navstevy: cele(raw.navstevy),
    posledniNavsteva: datum(raw.posledniNavsteva),
    skupina: text(raw.skupina, 60),
    cisloKarty: text(raw.cisloKarty, 40),
  };
}
