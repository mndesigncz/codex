// Co se z odpovědí průvodce doopravdy založí. Čistá funkce bez databáze:
// dostane odpovědi a stav podniku (co už v něm je) a vrátí seznam operací,
// každou buď k provedení, nebo přeskočenou i s důvodem.
//
// Pravidla, na kterých průvodce stojí (a která hlídá test):
//  - jen přidává: nikdy nemaže, nepřepisuje nic, co člověk nastavil jinak,
//  - opakované spuštění nevytvoří duplicity (ledger `pouzito` + dedupe podle
//    názvu),
//  - vypnutá položka ve Shrnutí se nevytvoří,
//  - přeskočený krok nic neudělá,
//  - prázdné odpovědi dají prázdný plán, žádný pád.

import type { Doba, KlicOperace, Odpovedi, Tarif } from './typy.ts';
import { ZEME } from './typy.ts';
import { KATEGORIE_SKLADU, POSTUPY, navrhniSmeny, vychoziDoba, type NavrhPostupu, type NavrhSmeny } from './predvolby.ts';
import { sestavPrehled } from './widgety.ts';
import type { VychoziPolozka } from '../widgety/typy.ts';

/** Co v podniku už je — průvodce se podle toho rozhoduje, co přidat. */
export interface StavPodniku {
  nazev: string;
  tarif: Tarif;
  /** `teams.opening_hours` je prázdné (`{}`), API ho čte jako 08–20 denně. */
  openingHoursPrazdne: boolean;
  maxDniNull: boolean;
  drawerFloatNull: boolean;
  typySmen: string[];
  kategorieSkladu: string[];
  postupy: string[];
  /** Řádek rozložení Přehledu: žádný / vytvořil ho průvodce / upravil ho člověk. */
  prehled: 'zadny' | 'pruvodce' | 'jiny';
}

export interface DataPodniku {
  nazev?: string; adresa?: string; zeme?: string; mena?: string; formatCisel?: string; zacatekTydne?: 0 | 1; typ?: string;
}

interface ZakladOperace { nazev: string; hash: string; poznamka?: string }
export type Operace = ZakladOperace & (
  | { stav: 'preskocit'; klic: KlicOperace }
  | { stav: 'provest'; klic: 'podnik'; podnik: DataPodniku }
  | { stav: 'provest'; klic: 'doba'; doba: Doba }
  | { stav: 'provest'; klic: 'smeny'; smeny: NavrhSmeny[] }
  | { stav: 'provest'; klic: 'pravidla'; maxDni: number }
  | { stav: 'provest'; klic: 'sklad'; kategorie: string[] }
  | { stav: 'provest'; klic: 'postupy'; postupy: NavrhPostupu[] }
  | { stav: 'provest'; klic: 'prehled'; prehled: VychoziPolozka[] }
  | { stav: 'provest'; klic: 'kasa'; hotovost: number }
);

export const NAZVY_OPERACI: Record<KlicOperace, string> = {
  podnik: 'Nastavení podniku', doba: 'Otevírací doba', smeny: 'Typy směn', pravidla: 'Pravidla rozvrhu',
  sklad: 'Kategorie skladu', postupy: 'Postupy', prehled: 'Přehled', kasa: 'Hotovost v kase',
};

/** Poznámky přeskočených operací a pevné věty výsledku. Vstup pro překlad na serveru i pro kontrolu slovníků. */
export const POZNAMKY = {
  hotovoNastavene: 'Už je nastavené.',
  hotovoNastavena: 'Už je nastavená.',
  dobaMate: 'Otevírací dobu už máte nastavenou, nechali jsme ji.',
  smenyZalozene: 'Už jsou založené.',
  smenyMate: 'Typy směn už máte, nechali jsme je.',
  smenyStejne: 'Stejné typy směn už jsou založené.',
  pravidloMate: 'Pravidlo už máte nastavené, nechali jsme ho.',
  kategorieStejne: 'Stejné kategorie už máte.',
  postupyStejne: 'Postupy se stejným názvem už máte.',
  prehledUpraveny: 'Přehled už máte upravený, nechali jsme ho.',
  prehledHotovy: 'Už je složený.',
  kasaMate: 'Hotovost v kase už máte nastavenou, nechali jsme ji.',
  adresaNejde: 'Adresu a zemi se zatím uložit nepodařilo, doplníš je v Nastavení.',
  zalozeniSelhalo: 'Založení selhalo.',
  rucne: 'Nastavíš to ručně: {kde}.',
  prehledZmenen: 'Přehled se mezitím změnil jinde.',
} as const;

/** Počty založených věcí (plurály se vybírají v jazyce majitele). */
export const POCTY = {
  smeny: '{n, plural, one {# typ směny} few {# typy směn} other {# typů směn}}',
  sklad: '{n, plural, one {# kategorie} few {# kategorie} other {# kategorií}}',
  postupy: '{n, plural, one {# postup} few {# postupy} other {# postupů}}',
  prehled: '{n, plural, one {# widget} few {# widgety} other {# widgetů}}',
} as const;

/** Kam v aplikaci to jde nastavit ručně, když se operace nepovedla. */
export const KDE_V_NASTAVENI: Record<KlicOperace, string> = {
  podnik: 'Nastavení → Tým → Provoz podniku', doba: 'Rozvrh → Nastavení → Otevírací doba', smeny: 'Rozvrh → Nastavení → Typy směn',
  pravidla: 'Rozvrh → Nastavení → Pravidla', sklad: 'Sklad → Kategorie', postupy: 'Postupy', prehled: 'Přehled → Upravit stránku',
  kasa: 'Nastavení → Tým → Provoz podniku',
};

/** Otisk vstupu operace (FNV-1a, 32 bit): stejný vstup = stejný otisk, ledger pozná opakování. */
export function otisk(v: unknown): string {
  const s = JSON.stringify(v) ?? '';
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const male = (s: string) => s.trim().toLocaleLowerCase('cs');
const zapnuto = (o: Odpovedi, k: keyof NonNullable<Odpovedi['polozky']>) => o.polozky?.[k] !== false;

/** Předvolba země doplní měnu, formát a začátek týdne, které člověk sám nezadal. */
export function dataPodniku(o: Odpovedi): DataPodniku {
  const p = o.zeme ? ZEME[o.zeme] : null;
  const d: DataPodniku = {};
  if (o.nazev) d.nazev = o.nazev;
  if (o.adresa) d.adresa = o.adresa;
  if (o.zeme) d.zeme = o.zeme;
  const mena = o.mena ?? p?.mena;
  if (mena) d.mena = mena;
  const format = o.formatCisel ?? p?.locale;
  if (format) d.formatCisel = format;
  const tyden = o.zacatekTydne ?? p?.zacatekTydne;
  if (tyden === 0 || tyden === 1) d.zacatekTydne = tyden;
  if (o.typ) d.typ = o.typ;
  return d;
}

export type Prekladac = (cs: string) => string;
const beze: Prekladac = cs => cs;

/**
 * `pr` přeloží české výchozí názvy (směny, kategorie, postupy) do jazyka majitele:
 * do databáze jdou v jeho jazyce. Otisky (ledger) se počítají z českého zdroje, ať
 * změna jazyka neznehodnotí „už je založeno"; dedupe podle názvu zná český i přeložený tvar.
 */
export function sestavPlan(o: Odpovedi, stav: StavPodniku, pouzito: Record<string, string> = {}, pr: Prekladac = beze): Operace[] {
  const plan: Operace[] = [];
  const presk = (klic: KlicOperace, hash: string, poznamka: string): Operace => ({ klic, nazev: NAZVY_OPERACI[klic], hash, stav: 'preskocit', poznamka });
  const uz = (klic: KlicOperace, hash: string) => pouzito[klic] === hash;
  const krok = (k: NonNullable<Odpovedi['preskoceno']>[number]) => !o.preskoceno?.includes(k);
  const cile = o.cile ?? [];

  // --- podnik (jen pole, která člověk vyplnil) ---
  const dp = krok('podnik') || krok('typ') ? dataPodniku(o) : {};
  if (Object.keys(dp).length) {
    const h = otisk(dp);
    plan.push(uz('podnik', h) ? presk('podnik', h, POZNAMKY.hotovoNastavene) : { klic: 'podnik', nazev: NAZVY_OPERACI.podnik, hash: h, stav: 'provest', podnik: dp });
  }

  // --- otevírací doba ---
  if (o.doba && krok('doba')) {
    const h = otisk(o.doba);
    if (uz('doba', h)) plan.push(presk('doba', h, POZNAMKY.hotovoNastavena));
    // Doba, kterou člověk nastavil sám, se nepřepisuje. Přepsat smíme jen
    // prázdnou nebo tu, kterou tu dříve nastavil průvodce (má záznam v ledgeru).
    else if (!stav.openingHoursPrazdne && !pouzito.doba) plan.push(presk('doba', h, POZNAMKY.dobaMate));
    else plan.push({ klic: 'doba', nazev: NAZVY_OPERACI.doba, hash: h, stav: 'provest', doba: o.doba });
  }

  // --- typy směn (z doby a typu) ---
  if ((o.typ || o.doba) && zapnuto(o, 'smeny') && (krok('typ') || krok('doba'))) {
    const navrh = navrhniSmeny(o.typ, o.doba ?? (o.typ ? vychoziDoba(o.typ) : undefined));
    const h = otisk(navrh);
    const existuji = new Set(stav.typySmen.map(male));
    const jeTam = (n: string) => existuji.has(male(n)) || existuji.has(male(pr(n)));
    const nove = navrh.filter(s => !jeTam(s.name)).map(s => ({ ...s, name: pr(s.name) }));
    if (!navrh.length) { /* všechny dny zavřeno: není z čeho */ }
    else if (uz('smeny', h)) plan.push(presk('smeny', h, POZNAMKY.smenyZalozene));
    // Podnik, který už nějaké typy směn má, si je poskládal sám.
    else if (stav.typySmen.length > 0) plan.push(presk('smeny', h, POZNAMKY.smenyMate));
    else if (!nove.length) plan.push(presk('smeny', h, POZNAMKY.smenyStejne));
    else plan.push({ klic: 'smeny', nazev: NAZVY_OPERACI.smeny, hash: h, stav: 'provest', smeny: nove });
  }

  // --- pravidla rozvrhu ---
  if (cile.includes('rozvrh') && zapnuto(o, 'pravidla')) {
    const h = otisk({ maxDni: 6 });
    if (uz('pravidla', h)) plan.push(presk('pravidla', h, POZNAMKY.hotovoNastavene));
    else if (!stav.maxDniNull) plan.push(presk('pravidla', h, POZNAMKY.pravidloMate));
    else plan.push({ klic: 'pravidla', nazev: NAZVY_OPERACI.pravidla, hash: h, stav: 'provest', maxDni: 6 });
  }

  // --- kategorie skladu ---
  if (cile.includes('sklad') && o.typ && zapnuto(o, 'sklad')) {
    const nazvy = KATEGORIE_SKLADU[o.typ];
    const h = otisk(nazvy);
    const existuji = new Set(stav.kategorieSkladu.map(male));
    const nove = nazvy.filter(n => !existuji.has(male(n)) && !existuji.has(male(pr(n)))).map(x => pr(x));
    if (uz('sklad', h) && !nove.length) plan.push(presk('sklad', h, POZNAMKY.smenyZalozene));
    else if (!nove.length) plan.push(presk('sklad', h, POZNAMKY.kategorieStejne));
    else plan.push({ klic: 'sklad', nazev: NAZVY_OPERACI.sklad, hash: h, stav: 'provest', kategorie: nove });
  }

  // --- postupy ---
  if (cile.includes('provoz') && o.typ && zapnuto(o, 'postupy')) {
    const navrh = POSTUPY[o.typ];
    const h = otisk(navrh.map(p => p.name));
    const existuji = new Set(stav.postupy.map(male));
    const nove = navrh.filter(p => !existuji.has(male(p.name)) && !existuji.has(male(pr(p.name))))
      .map(p => ({ name: pr(p.name), description: pr(p.description), kroky: p.kroky.map(x => pr(x)) }));
    if (!nove.length) plan.push(presk('postupy', h, uz('postupy', h) ? POZNAMKY.smenyZalozene : POZNAMKY.postupyStejne));
    else plan.push({ klic: 'postupy', nazev: NAZVY_OPERACI.postupy, hash: h, stav: 'provest', postupy: nove });
  }

  // --- Přehled ---
  if (cile.length > 0 && krok('cile') && zapnuto(o, 'prehled')) {
    const polozky = sestavPrehled({ cile, velikostTymu: o.tym?.velikost, pokladna: o.pokladna, tarif: stav.tarif });
    const h = otisk(polozky);
    if (stav.prehled === 'jiny') plan.push(presk('prehled', h, POZNAMKY.prehledUpraveny));
    else if (stav.prehled === 'pruvodce' && uz('prehled', h)) plan.push(presk('prehled', h, POZNAMKY.prehledHotovy));
    else plan.push({ klic: 'prehled', nazev: NAZVY_OPERACI.prehled, hash: h, stav: 'provest', prehled: polozky });
  }

  // --- hotovost v kase ---
  if (cile.includes('uzaverky') && krok('kasa') && typeof o.hotovostVKase === 'number' && o.hotovostVKase > 0) {
    const h = otisk({ k: o.hotovostVKase });
    if (uz('kasa', h)) plan.push(presk('kasa', h, POZNAMKY.hotovoNastavena));
    else if (!stav.drawerFloatNull) plan.push(presk('kasa', h, POZNAMKY.kasaMate));
    else plan.push({ klic: 'kasa', nazev: NAZVY_OPERACI.kasa, hash: h, stav: 'provest', hotovost: o.hotovostVKase });
  }
  return plan;
}

/** Přehled pro Shrnutí: názvy, které se vytvoří (kvůli řádkům s přepínači). */
export interface RadekShrnuti { klic: 'smeny' | 'sklad' | 'postupy' | 'prehled' | 'pravidla'; nazev: string; popis: string; /** Jednotlivé názvy (česky), ať je UI přeloží každý zvlášť. */ polozky: string[] }

export function radkyShrnuti(o: Odpovedi): RadekShrnuti[] {
  const out: RadekShrnuti[] = [];
  const cile = o.cile ?? [];
  if (o.typ || o.doba) {
    const s = navrhniSmeny(o.typ, o.doba ?? (o.typ ? vychoziDoba(o.typ) : undefined));
    if (s.length) out.push({ klic: 'smeny', nazev: 'Typy směn', popis: s.map(x => x.name).join(', '), polozky: s.map(x => x.name) });
  }
  if (cile.includes('rozvrh')) out.push({ klic: 'pravidla', nazev: 'Pravidla rozvrhu', popis: 'Nejvýš šest dní v řadě', polozky: [] });
  if (cile.includes('sklad') && o.typ) out.push({ klic: 'sklad', nazev: 'Kategorie skladu', popis: KATEGORIE_SKLADU[o.typ].join(', '), polozky: KATEGORIE_SKLADU[o.typ] });
  if (cile.includes('provoz') && o.typ) out.push({ klic: 'postupy', nazev: 'Postupy', popis: POSTUPY[o.typ].map(p => p.name).join(', '), polozky: POSTUPY[o.typ].map(p => p.name) });
  return out;
}

/**
 * Doporučení tarifu ve finále, bez tlaku: Max kvůli hostům a napojení pokladny,
 * Pro kvůli tabletu nebo většímu týmu, jinak stačí Zdarma. Jen věta a štítek
 * v „Co dál", nic se neotevírá ani nezapíná.
 */
export function doporucenyTarif(o: Odpovedi): Tarif {
  if (o.cile?.includes('hoste') || o.pokladna === 'storyous') return 'max';
  if (o.tablet === true || o.tym?.velikost === 'stredni' || o.tym?.velikost === 'velky' || o.cile?.includes('finance')) return 'pro';
  return 'zdarma';
}
