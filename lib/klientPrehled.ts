// Managero client a Akce — čisté výpočty pro widgety a stránky (kolo 69, balík B8).
//
// Bez Reactu a bez fetch: widgety (components/widgety/oblasti/klient.tsx a akce.tsx)
// i nástroje stránek (ClientAdmin, EventsView) čtou tytéž odpovědi API a musí
// z nich spočítat totéž — dnešní rezervace na Přehledu a v Rezervacích, výsledek
// akce ve widgetu a v kartě akce. Kdyby si to každý počítal sám, rozjelo by se to
// (tržba akce s uzávěrkami se dřív v detailu brala z uzávěrky a v seznamu ne).
// Testy: scripts/testy/k69-b8.ts.

import type { ChipTone } from '../components/ui/Chip';
import { czCount, type CzNoun } from './czech.ts';

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cislo = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

// ---------------------------------------------------------------------------
// Rezervace
// ---------------------------------------------------------------------------

export type StavRezervace = 'requested' | 'confirmed' | 'seated' | 'done' | 'declined' | 'cancelled' | 'no_show';

/** Skupina hosta pro štítek u rezervace (Zákazníci › Skupiny): „VIP", „firemní akce". */
export interface SkupinaHosta { nazev: string; barva: string | null }

export interface Rezervace {
  id: number;
  /** Účet hosta (null = zapsaný ručně bez účtu) — otevírá okno Host. */
  hostId: number | null;
  datum: string;
  cas: string;
  host: string;
  /** Jen s zakaznici.kontakty — jinak ho API vůbec nepošle (osobní údaj). */
  email: string | null;
  /** Telefon hosta (z profilu hosta); stejně jako e-mail jen se zakaznici.kontakty. */
  telefon: string | null;
  osob: number;
  stulId: number | null;
  stul: string | null;
  stav: StavRezervace;
  /** Tablet ji nedostane (API ji maže); poznámka hosta patří jen vedení. */
  poznamka: string | null;
  /**
   * Úroveň člena pro štítek u jména (Stříbrný / Zlatý / Platinový host); obyčejný
   * člen štítek nemá (null). Jen se zakaznici.zobrazit — jinak ji API nepošle.
   */
  uroven: { id: string; label: string; ton: ChipTone } | null;
  /** Kolikrát host v podniku byl (0 = jde poprvé); null = není člen nebo divák nesmí vidět. */
  navstev: number | null;
  /** Poslední interní poznámka personálu k hostovi (zakaznici.poznamky, nikdy na tabletu). */
  poznamkaPersonalu: string | null;
  /** Poslední poznámky personálu (nejnovější první) — pro varování „alergie" a okno Host. */
  poznamky: string[];
  /** Skupiny hosta (jen se zakaznici.zobrazit; jinak prázdné). */
  skupiny: SkupinaHosta[];
  /** Kolikrát host nedorazil (null = není člen nebo divák nesmí vidět). */
  nedorazeni: number | null;
  /** Kolik rezervací host v podniku celkem měl (pro „Nedorazil 2× z 9 rezervací"). */
  rezervaciCelkem: number | null;
  /** Kumulovaná útrata hosta (jen se zakaznici.zobrazit). */
  utrata: number | null;
  /** Host na připomínku odpověděl „Potvrdit" (guest_confirmed_at). */
  hostPotvrdil: boolean;
  /**
   * Zapsala ji obsluha (telefon, u dveří): host bez účtu (customer_id NULL), nebo ručně
   * zapsaná a napojená na člena (created_by).
   */
  rucne: boolean;
}

export interface Stul { id: number; nazev: string; mist: number }

/** Co potřebuje okno „Nová rezervace" (API to pošle jen s rezervace.schvalovat). */
export interface NastaveniZapisu { hodiny: Record<string, { open?: string | null; close?: string | null; closed?: boolean }>; maxOsob: number; dniDopredu: number; krok: number }

export interface SeznamRezervaci {
  rezervace: Rezervace[]; stoly: Stul[]; zapis: NastaveniZapisu | null;
  /** Kolik rezervací odpovídá dotazu celkem (Minulé a hledání jsou oříznuté — „Zobrazeno 100 z 240"). */
  celkem: number;
  /** Počty pro pilulky filtru Minulých („Vše · 240", „Nedorazili · 6"); null mimo Minulé. */
  minule: { celkem: number; nedorazeni: number } | null;
}

const STAVY: StavRezervace[] = ['requested', 'confirmed', 'seated', 'done', 'declined', 'cancelled', 'no_show'];

/**
 * Odpověď /api/client/admin/reservations. Nečekaný tvar je chyba widgetu
 * (ErrorState), ne „nikdo nerezervoval" — prázdný seznam by lhal.
 */
export function vyberRezervace(raw: any): SeznamRezervaci {
  if (!raw || !Array.isArray(raw.reservations)) throw new Error('Rezervace přišly v nečekaném tvaru.');
  return {
    rezervace: raw.reservations.map((r: any) => ({
      id: Number(r.id),
      hostId: r.customer_id == null || !(Number(r.customer_id) > 0) ? null : Number(r.customer_id),
      datum: String(r.date ?? '').slice(0, 10),
      cas: String(r.time ?? '').slice(0, 5),
      host: text(r.customer_name) ?? 'Host',
      email: text(r.customer_email),
      telefon: text(r.customer_phone),
      osob: Math.max(1, cislo(r.party)),
      stulId: r.table_id == null ? null : Number(r.table_id),
      stul: text(r.table_name),
      stav: (STAVY.includes(r.status) ? r.status : 'requested') as StavRezervace,
      poznamka: text(r.note),
      uroven: urovenHosta(r.customer_level, r.customer_level_label),
      navstev: r.customer_visits == null ? null : Math.max(0, Math.round(cislo(r.customer_visits))),
      poznamkaPersonalu: text(r.staff_note) ?? (Array.isArray(r.staff_notes) ? text(r.staff_notes[0]) : null),
      poznamky: Array.isArray(r.staff_notes) ? r.staff_notes.map((n: unknown) => text(n)).filter((n: string | null): n is string => !!n) : (text(r.staff_note) ? [text(r.staff_note) as string] : []),
      skupiny: seznam(r.customer_groups).map((g: any) => ({ nazev: text(g?.name) ?? '', barva: text(g?.color) })).filter((g: SkupinaHosta) => g.nazev),
      nedorazeni: r.customer_no_shows == null ? null : Math.max(0, Math.round(cislo(r.customer_no_shows))),
      rezervaciCelkem: r.customer_reservations == null ? null : Math.max(0, Math.round(cislo(r.customer_reservations))),
      utrata: r.customer_spend == null ? null : cislo(r.customer_spend),
      hostPotvrdil: !!r.guest_confirmed_at,
      rucne: r.customer_id === null || (r.created_by != null && r.created_by !== ''),
    })),
    stoly: seznam(raw.tables).map((t: any) => ({ id: Number(t.id), nazev: String(t.name ?? ''), mist: cislo(t.seats) })),
    zapis: raw.zapis && typeof raw.zapis === 'object' ? {
      hodiny: raw.zapis.opening_hours && typeof raw.zapis.opening_hours === 'object' ? raw.zapis.opening_hours : {},
      maxOsob: Math.max(1, cislo(raw.zapis.max_party) || 8),
      dniDopredu: Math.max(1, cislo(raw.zapis.lead_days) || 30),
      krok: Math.max(15, cislo(raw.zapis.slot_minutes) || 30),
    } : null,
    celkem: raw.celkem == null ? raw.reservations.length : Math.max(raw.reservations.length, cislo(raw.celkem)),
    minule: raw.pocty && typeof raw.pocty === 'object' ? { celkem: cislo(raw.pocty.celkem), nedorazeni: cislo(raw.pocty.nedorazeni) } : null,
  };
}

/** Odpověď /api/client/admin/reservations?month=RRRR-MM: počet živých rezervací po dnech (tečky v kalendáři). */
export function vyberMesicRezervaci(raw: any): Record<string, number> {
  if (!raw || typeof raw.days !== 'object' || raw.days == null) throw new Error('Kalendář rezervací přišel v nečekaném tvaru.');
  const out: Record<string, number> = {};
  for (const [den, n] of Object.entries(raw.days)) if (/^\d{4}-\d{2}-\d{2}$/.test(den) && cislo(n) > 0) out[den] = Math.round(cislo(n));
  return out;
}

/** Odpověď /api/client/admin/reservations?customer=ID: historie hosta pro detail člena. */
export function vyberRezervaceHosta(raw: any): { celkem: number; nedorazeni: number; probehlo: number; posledni: string | null } {
  if (!raw || typeof raw.souhrn !== 'object' || raw.souhrn == null) throw new Error('Rezervace hosta přišly v nečekaném tvaru.');
  const s = raw.souhrn;
  return { celkem: cislo(s.celkem), nedorazeni: cislo(s.nedorazeni), probehlo: cislo(s.probehlo), posledni: text(s.posledni)?.slice(0, 10) ?? null };
}

/** Slova v poznámce personálu, kvůli kterým se poznámka ukáže u dveří jako varování (alergie, dieta). */
const VAROVNA_SLOVA = /alergi|bezlep|bez lepku|lepek|lepku|vegan|lakt[oó]z|o[řr]ech|celiak|intoleran|diabet|arašíd|arasid|nesnáší|nesmí/i;

/** První poznámka personálu, která je varování pro obsluhu u dveří („alergie na ořechy"); jinak null. */
export function varovaniHosta(poznamky: readonly string[]): string | null {
  return poznamky.find(p => VAROVNA_SLOVA.test(p)) ?? null;
}

/**
 * Nadpis dne: kolik rezervací, kolik osob a kdy je špička (hodina s nejvíc rezervacemi, až od
 * dvou v jedné hodině). Zrušené, nepřijaté a nedorazivší se nepočítají — stůl neobsadí.
 */
export function souhrnDneRezervaci(radky: readonly Pick<Rezervace, 'stav' | 'osob' | 'cas'>[]): { pocet: number; osob: number; spicka: string | null } {
  const zive = radky.filter(r => r.stav !== 'declined' && r.stav !== 'cancelled' && r.stav !== 'no_show');
  const poHodine = new Map<string, number>();
  for (const r of zive) { const h = `${r.cas.slice(0, 2)}:00`; poHodine.set(h, (poHodine.get(h) ?? 0) + 1); }
  let spicka: string | null = null; let max = 1;
  for (const [h, n] of [...poHodine.entries()].sort()) if (n > max) { max = n; spicka = h; }
  return { pocet: zive.length, osob: zive.reduce((s, r) => s + r.osob, 0), spicka };
}

/** Kolik znaků hledání stačí, aby se poslal dotaz (jméno nebo telefon). */
export const HLEDANI_MIN = 2;

/** Čísla z telefonu pro hledání („+420 776 221 004" → „420776221004"); prázdné, když tam žádná nejsou. */
export const cisliceTelefonu = (q: string) => String(q ?? '').replace(/\D/g, '');

/** Štítek úrovně jako v Zákaznících › Členové: stříbro tlumeně, zlato a platina inkoustem, obyčejný člen bez štítku. */
function urovenHosta(id: unknown, label: unknown): Rezervace['uroven'] {
  if (id !== 'silver' && id !== 'gold' && id !== 'platinum') return null;
  return { id, label: text(label) ?? (id === 'silver' ? 'Stříbrný host' : id === 'gold' ? 'Zlatý host' : 'Platinový host'), ton: id === 'silver' ? 'muted' : 'ink' };
}

/** Odkaz `tel:` z telefonu, jak ho host napsal („+420 776 221 004" → „tel:+420776221004"); bez číslic null. */
export function odkazTel(telefon: string | null | undefined): string | null {
  const cisla = String(telefon ?? '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return /\d{3,}/.test(cisla) ? `tel:${cisla}` : null;
}

/** Kam smí rezervace ze svého stavu (stejná mapa jako FLOW v API). */
const PRECHODY: Record<string, StavRezervace[]> = {
  requested: ['confirmed', 'declined'],
  confirmed: ['seated', 'declined', 'done', 'no_show'],
  seated: ['done'],
  // Omyl u dveří (nebo host dorazil pozdě): „Nedorazil" jde vrátit na potvrzeno a pak usadit.
  no_show: ['confirmed'],
};
export const muzeDo = (z: StavRezervace, na: StavRezervace) => PRECHODY[z]?.includes(na) ?? false;

/**
 * Které oprávnění přechod chce (API kontroluje totéž, tady jen aby tlačítko nesvítilo naprázdno).
 * Vrácení omylu „Nedorazil" → potvrzeno (`z` = 'no_show') je práce u dveří jako usazení, ne rozhodnutí
 * o kapacitě — kdo smí označit nedorazení, smí ho i vzít zpět.
 */
export const klicPrechodu = (na: StavRezervace, z?: StavRezervace) =>
  ((na === 'confirmed' && z !== 'no_show') || na === 'declined' ? 'rezervace.schvalovat' : 'rezervace.usadit');

/**
 * Kde je v řádku „Nedorazil": po čase rezervace + 30 min (a u minulých dnů) jako tlačítko vedle
 * „Usadit" — jedno klepnutí od dveří; dřív jen v „···" (zpětně). Bez rezervace.usadit nikde.
 */
export function nabidkaNedorazil(r: Pick<Rezervace, 'stav' | 'datum' | 'cas'>, smi: (klic: string) => boolean, naRade: boolean): 'tlacitko' | 'menu' | null {
  if (!muzeDo(r.stav, 'no_show') || !smi(klicPrechodu('no_show'))) return null;
  return naRade ? 'tlacitko' : 'menu';
}

/**
 * Hlavní krok řádku — jedno tlačítko vpředu, zbytek v „···" (DP §3.6).
 * Jen krok, na který má divák klíč: Barista s rezervace.usadit u požadavku
 * „Potvrdit" nedostane, ale u potvrzené „Usadit" ano.
 */
export function hlavniKrok(stav: StavRezervace, smi: (klic: string) => boolean): { na: StavRezervace; popisek: string } | null {
  // „Nedorazil" je uzavřené; vrácení omylu je v „···", ne hlavní krok (jinak by řádek sváděl „Potvrdit").
  if (stav === 'no_show') return null;
  const kroky: { na: StavRezervace; popisek: string }[] = [
    { na: 'confirmed', popisek: 'Potvrdit' },
    { na: 'seated', popisek: 'Usadit' },
    { na: 'done', popisek: 'Hotovo' },
  ];
  return kroky.find(k => muzeDo(stav, k.na) && smi(klicPrechodu(k.na))) ?? null;
}

/** Tón stavu rezervace pro Chip (stav, ne kategorie: pět tónů, DP §2.1). */
export const TON_REZERVACE: Record<StavRezervace, ChipTone> = {
  requested: 'wait', confirmed: 'ok', seated: 'ok', done: 'muted', declined: 'muted', cancelled: 'muted', no_show: 'bad',
};

/** Dnešek pro widget S: kolik dnes přijde a kolik čeká na potvrzení (zrušené, odmítnuté a nedorazivší se nepočítají). */
export function souhrnDne(rez: Rezervace[]): { dnes: number; ceka: number; osob: number } {
  const plati = rez.filter(r => r.stav !== 'declined' && r.stav !== 'cancelled' && r.stav !== 'no_show');
  return {
    dnes: plati.length,
    ceka: plati.filter(r => r.stav === 'requested').length,
    osob: plati.reduce((s, r) => s + r.osob, 0),
  };
}

/** Pořadí pro dnešní seznam: čeká na potvrzení → ostatní živé podle času → proběhlé a zrušené na konci. */
export function seradDnes(rez: Rezervace[]): Rezervace[] {
  const vaha = (s: StavRezervace) => (s === 'requested' ? 0 : s === 'confirmed' || s === 'seated' ? 1 : 2);
  return [...rez].sort((a, b) => vaha(a.stav) - vaha(b.stav) || a.cas.localeCompare(b.cas));
}

/** Rezervace po dnech (Rezervace → Nadcházející/Minulé). Pořadí dnů zachová z API. */
export function poDnech(rez: Rezervace[]): [string, Rezervace[]][] {
  const m = new Map<string, Rezervace[]>();
  for (const r of rez) { const d = m.get(r.datum); if (d) d.push(r); else m.set(r.datum, [r]); }
  return [...m.entries()];
}

// ---------------------------------------------------------------------------
// Objednávky od stolu — historie (Client › Objednávky › Historie)
// ---------------------------------------------------------------------------
//
// Fronta ukazuje jen poslední tři hodiny; majitel večer chce vědět, kolik objednávek
// od stolu přišlo, za kolik a kolik jich obsluha nepřijala. Součet je jen z hotových
// a jmenuje se „Od stolu celkem" — skutečná tržba podniku je z pokladny (Finance).

export type StavObjednavky = 'new' | 'confirmed' | 'done' | 'declined';
export const STAVY_OBJEDNAVEK: StavObjednavky[] = ['new', 'confirmed', 'done', 'declined'];

/** Nejdelší období historie v jednom dotazu (čtvrt roku). */
export const MAX_DNI_HISTORIE = 92;

export interface ObjednavkaHistorie {
  id: number;
  /** Čas z databáze (UTC bez zóny) — zobrazit jen přes dbTimeHM/dbTimeDayHM. */
  vytvoreno: string;
  upraveno: string | null;
  /** Ve stejných jednotkách jako příjem u obsluhy (cena z menu, smí mít haléře → usePrice). */
  castka: number;
  stav: StavObjednavky;
  stul: string | null;
  host: string;
  polozky: { nazev: string; pocet: number }[];
}

export interface SouhrnObjednavek { pocet: number; soucet: number; prumer: number | null; neprijato: number; hotovych: number }

/** Počet, součet a průměr jen z hotových (nepřijaté a rozpracované by součet nafoukly), počet nepřijatých. */
export function souhrnObjednavek(objednavky: readonly { castka: number; stav: string }[]): SouhrnObjednavek {
  const hotove = objednavky.filter(o => o.stav === 'done');
  const soucet = Math.round(hotove.reduce((s, o) => s + cislo(o.castka), 0) * 100) / 100;
  return {
    pocet: objednavky.length,
    soucet,
    prumer: hotove.length ? Math.round((soucet / hotove.length) * 100) / 100 : null,
    neprijato: objednavky.filter(o => o.stav === 'declined').length,
    hotovych: hotove.length,
  };
}

/**
 * Období historie z dotazu (?from=&to=, RRRR-MM-DD). Bez parametrů dnešek; obrácené
 * pořadí se prohodí; delší než MAX_DNI_HISTORIE je chyba (ne tiché uříznutí).
 */
export function obdobiHistorie(from: unknown, to: unknown, dnes: string): { od: string; do: string } | { chyba: string } {
  const den = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) ? v : null);
  const f = from == null || from === '' ? null : den(from);
  const t = to == null || to === '' ? null : den(to);
  if ((from != null && from !== '' && !f) || (to != null && to !== '' && !t)) return { chyba: 'Období má tvar RRRR-MM-DD.' };
  let od = f ?? t ?? dnes;
  let doo = t ?? f ?? dnes;
  if (od > doo) [od, doo] = [doo, od];
  const dni = Math.round((Date.parse(`${doo}T12:00:00Z`) - Date.parse(`${od}T12:00:00Z`)) / 86_400_000) + 1;
  if (dni > MAX_DNI_HISTORIE) return { chyba: `Období může mít nejvýš ${MAX_DNI_HISTORIE} dní.` };
  return { od, do: doo };
}

/** Odpověď GET /api/client/admin/orders. Nečekaný tvar je chyba (ErrorState), ne „žádné objednávky". */
export function vyberHistoriiObjednavek(raw: any): { objednavky: ObjednavkaHistorie[]; souhrn: SouhrnObjednavek; celkem: number } {
  if (!raw || !Array.isArray(raw.orders)) throw new Error('Objednávky přišly v nečekaném tvaru.');
  const objednavky: ObjednavkaHistorie[] = raw.orders.map((o: any) => ({
    id: Number(o.id),
    vytvoreno: String(o.createdAt ?? ''),
    upraveno: o.updatedAt ? String(o.updatedAt) : null,
    castka: cislo(o.total),
    stav: (STAVY_OBJEDNAVEK.includes(o.status) ? o.status : 'new') as StavObjednavky,
    stul: text(o.tableName),
    host: text(o.customerName) ?? 'Host',
    polozky: seznam(o.polozky).map((l: any) => ({ nazev: String(l?.nazev ?? l?.name ?? '').trim(), pocet: Math.max(1, Math.round(cislo(l?.pocet ?? l?.count) || 1)) })).filter((l: { nazev: string }) => l.nazev),
  }));
  const s = raw.souhrn && typeof raw.souhrn === 'object' ? raw.souhrn : null;
  return {
    objednavky,
    souhrn: s ? { pocet: cislo(s.pocet), soucet: cislo(s.soucet), prumer: s.prumer == null ? null : cislo(s.prumer), neprijato: cislo(s.neprijato), hotovych: cislo(s.hotovych) } : souhrnObjednavek(objednavky),
    celkem: raw.celkem == null ? objednavky.length : cislo(raw.celkem),
  };
}

/**
 * Za kolik minut se s objednávkou pohnulo. Sloupec „přijato v" nemáme — updated_at je čas
 * poslední změny stavu: u „Připravuje se" přijetí, u „Hotovo" vyřízení. Nová a nečitelné → null.
 */
export function dobaObjednavky(o: Pick<ObjednavkaHistorie, 'vytvoreno' | 'upraveno' | 'stav'>, naDatum: (v: string) => Date | null): { co: 'prijato' | 'hotovo' | 'odmitnuto'; minut: number } | null {
  if (o.stav === 'new' || !o.upraveno) return null;
  const a = naDatum(o.vytvoreno), b = naDatum(o.upraveno);
  if (!a || !b) return null;
  const minut = Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
  return { co: o.stav === 'confirmed' ? 'prijato' : o.stav === 'done' ? 'hotovo' : 'odmitnuto', minut };
}

/** „2× Matcha latte, 1× Sencha" — položky zkráceně pro meta řádek. */
export const polozkyKratce = (polozky: readonly { nazev: string; pocet: number }[]) => polozky.map(l => `${l.pocet}× ${l.nazev}`).join(', ');

// ---------------------------------------------------------------------------
// Hodnocení
// ---------------------------------------------------------------------------

export interface Recenze {
  id: number; hvezdy: number; poznamka: string | null; kdy: string; host: string; zdroj: 'objednavka' | 'rezervace';
  /** Odpověď podniku hostovi (host ji vidí v Moje stránka) a kdo ji napsal. */
  odpoved: string | null;
  odpovedel: string | null;
  /** Čas odpovědi z databáze (UTC bez zóny) — zobrazit jen přes dbTimeDayHM. */
  odpovedenoKdy: string | null;
  /** Označeno jako vyřízené (slabé hodnocení probrané se směnou, host odškodněný…). */
  vyrizeno: boolean;
}

export interface Hodnoceni {
  pocet: number;
  prumer: number | null;
  /** Počet hodnocení s 1…5 hvězdami (index 0 = jedna hvězda). */
  rozlozeni: [number, number, number, number, number];
  posledni: Recenze[];
}

export function vyberHodnoceni(raw: any): Hodnoceni {
  if (!raw || !Array.isArray(raw.reviews)) throw new Error('Hodnocení přišla v nečekaném tvaru.');
  const d = seznam(raw.dist);
  const avg = raw.avg == null ? null : Number(raw.avg);
  return {
    pocet: cislo(raw.count),
    prumer: avg == null || !Number.isFinite(avg) ? null : avg,
    rozlozeni: [0, 1, 2, 3, 4].map(i => cislo(d[i])) as Hodnoceni['rozlozeni'],
    posledni: raw.reviews.map((v: any) => ({
      id: Number(v.id),
      hvezdy: Math.min(5, Math.max(1, Math.round(cislo(v.rating)))),
      poznamka: text(v.note),
      kdy: String(v.created_at ?? ''),
      host: text(v.customer_name) ?? 'Host',
      zdroj: String(v.ref ?? '').startsWith('ord:') ? 'objednavka' : 'rezervace',
      odpoved: text(v.reply),
      odpovedel: text(v.replied_by_name),
      odpovedenoKdy: v.replied_at ? String(v.replied_at) : null,
      vyrizeno: !!v.resolved_at,
    })),
  };
}

/** Nejdelší odpověď hostovi na hodnocení. */
export const ODPOVED_MAX = 1000;

export type FiltrHodnoceni = 'vse' | 'slabe' | 'komentar' | 'nevyrizene';
export const FILTRY_HODNOCENI: { id: FiltrHodnoceni; popisek: string }[] = [
  { id: 'vse', popisek: 'Vše' },
  { id: 'slabe', popisek: '1–2 ★' },
  { id: 'komentar', popisek: 'S komentářem' },
  { id: 'nevyrizene', popisek: 'Nevyřízené' },
];

/** Slabé hodnocení (1–2 ★), na které podnik zatím neodpověděl ani ho neoznačil jako vyřízené. */
export const jeNevyrizene = (v: Pick<Recenze, 'hvezdy' | 'odpoved' | 'vyrizeno'>) => v.hvezdy <= 2 && !v.vyrizeno && !v.odpoved;

/** Hodnocení podle filtru a období (období podle pražského dne z `kdy`, dodá volající přes `den`). */
export function filtrujHodnoceni(seznam: readonly Recenze[], filtr: FiltrHodnoceni, obdobi: { od: string; do: string } | null, den: (kdy: string) => string): Recenze[] {
  return seznam.filter(v => {
    if (filtr === 'slabe' && v.hvezdy > 2) return false;
    if (filtr === 'komentar' && !v.poznamka) return false;
    if (filtr === 'nevyrizene' && !jeNevyrizene(v)) return false;
    if (obdobi) { const d = den(v.kdy); if (!d || d < obdobi.od || d > obdobi.do) return false; }
    return true;
  });
}

/** Počty na pilulky filtru (v rámci zvoleného období), ať je vidět, kam má cenu klikat. */
export function poctyHodnoceni(seznam: readonly Recenze[]): Record<FiltrHodnoceni, number> {
  return {
    vse: seznam.length,
    slabe: seznam.filter(v => v.hvezdy <= 2).length,
    komentar: seznam.filter(v => !!v.poznamka).length,
    nevyrizene: seznam.filter(jeNevyrizene).length,
  };
}

/** Průměr česky s desetinnou čárkou („4,6"); API posílá tečku a dřív se tak i vypsala. */
export const prumerCesky = (n: number | null) => (n == null ? '–' : n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

// ---------------------------------------------------------------------------
// Členové klubu
// ---------------------------------------------------------------------------

export type RazeniClenu = 'navstevy' | 'body' | 'nejnovejsi';
export const RAZENI_CLENU: RazeniClenu[] = ['navstevy', 'body', 'nejnovejsi'];

export interface Clen { id: number; jmeno: string; body: number; navstev: number; clenOd: string; naposledy: string | null }

export function vyberCleny(raw: any): { clenove: Clen[]; celkem: number } {
  if (!raw || !Array.isArray(raw.customers)) throw new Error('Členové přišli v nečekaném tvaru.');
  const clenove = raw.customers.map((c: any) => ({
    id: Number(c.id),
    jmeno: text(c.name) ?? 'Host',
    body: cislo(c.points),
    navstev: cislo(c.visits),
    clenOd: String(c.joined_at ?? '').slice(0, 10),
    naposledy: c.last_visit_at ? String(c.last_visit_at).slice(0, 10) : null,
  }));
  return { clenove, celkem: raw.total == null ? clenove.length : cislo(raw.total) };
}

/** Nejvěrnější podle zvoleného řazení — stejné pořadí jako ORDER BY v API (?sort=), kdyby API vrátilo neseřazené. */
export function nejvernejsi(clenove: Clen[], razeni: RazeniClenu, kolik = 5): Clen[] {
  const cmp: Record<RazeniClenu, (a: Clen, b: Clen) => number> = {
    navstevy: (a, b) => b.navstev - a.navstev || b.body - a.body,
    body: (a, b) => b.body - a.body || b.navstev - a.navstev,
    nejnovejsi: (a, b) => b.clenOd.localeCompare(a.clenOd),
  };
  return [...clenove].sort(cmp[razeni]).slice(0, kolik);
}

// ---------------------------------------------------------------------------
// Věrnost za 30 dní
// ---------------------------------------------------------------------------

export interface Vernost30 {
  rozdano: number;
  utraceno: number;
  noviClenove: number;
  kuponu: number;
  /** Aktivní hosté po dnech (kdo dostal nebo utratil body) — pro graf L. */
  poDnech: { den: string; aktivnich: number }[];
}

/**
 * Souhrn z /api/client/admin/loyalty. Rozdané a utracené body bere ze souhrnu
 * (server je sčítá z deníku za 30 dní), kupony a nové členy sečte z řady po
 * dnech — souhrn má kupony jen „celkem od začátku", což by za 30 dní lhalo.
 */
export function vyberVernost(raw: any): Vernost30 {
  if (!raw || typeof raw.summary !== 'object' || raw.summary == null) throw new Error('Věrnost přišla v nečekaném tvaru.');
  const s = raw.summary;
  const rada = seznam(raw.series).slice(-30);
  const soucet = (k: string) => rada.reduce((n, d) => n + cislo(d?.[k]), 0);
  return {
    rozdano: s.pointsGiven30 != null ? cislo(s.pointsGiven30) : soucet('points_given'),
    utraceno: s.pointsSpent30 != null ? cislo(s.pointsSpent30) : soucet('points_spent'),
    noviClenove: rada.length ? soucet('new_members') : cislo(s.newMembers30),
    kuponu: soucet('redeemed'),
    poDnech: rada.map(d => ({ den: String(d?.day ?? '').slice(0, 10), aktivnich: cislo(d?.active) })),
  };
}

// ---------------------------------------------------------------------------
// Souhrn Clientu (N13) a Propojení
// ---------------------------------------------------------------------------

export interface KrokPropojeni {
  id: 'zapnuto' | 'menu' | 'stoly' | 'pokladna' | 'poloha' | 'vernost';
  hotovo: boolean;
  popisek: string;
  /** Záložka Clientu, kde se krok nastaví. */
  zalozka: 'settings' | 'tables' | 'loyalty';
  /** Kdo ho smí nastavit (katalog klient.propojeni, pole akce:nastavit). */
  klic: string;
}

const STUL: CzNoun = { one: 'stůl', few: 'stoly', many: 'stolů' };
const SPAROVANY: CzNoun = { one: 'spárovaný', few: 'spárované', many: 'spárovaných' };

/** Kontrolní seznam „Propojení Clientu" ze `setup` v /api/client/admin/summary. */
export function krokyPropojeni(setup: any, mena = 'Kč'): KrokPropojeni[] {
  const su = setup && typeof setup === 'object' ? setup : {};
  const stolu = cislo(su.tables);
  const sparovano = cislo(su.tablesPaired);
  return [
    { id: 'zapnuto', hotovo: !!su.enabled, popisek: su.enabled ? 'Stránka pro hosty je zapnutá' : 'Zapnout stránku pro hosty', zalozka: 'settings', klic: 'klient.nastaveni' },
    { id: 'menu', hotovo: !!su.menu, popisek: su.menu ? 'Hosté vidí nabídku z Menu' : 'Vybrat menu pro hosty', zalozka: 'settings', klic: 'klient.nastaveni' },
    {
      id: 'stoly', hotovo: stolu > 0, zalozka: 'tables', klic: 'stoly.upravit',
      popisek: stolu > 0 ? `${czCount(stolu, STUL)}${sparovano ? `, ${czCount(sparovano, SPAROVANY)} s pokladnou` : ''}` : 'Přidat stoly pro rezervace a objednávky',
    },
    { id: 'pokladna', hotovo: !!su.pos, popisek: su.pos ? 'Pokladna napojená, objednávky jdou na stůl v kase' : 'Napojit pokladnu', zalozka: 'tables', klic: 'stoly.upravit' },
    { id: 'poloha', hotovo: !!su.location, popisek: su.location ? 'Poloha podniku nastavená' : 'Nastavit polohu podniku pro ochranu objednávek', zalozka: 'settings', klic: 'klient.nastaveni' },
    {
      id: 'vernost', hotovo: !!su.loyaltyOn, zalozka: 'loyalty', klic: 'vernost.pravidla',
      popisek: su.loyaltyOn ? `Věrnost běží: ${cislo(su.pointsPer100)} b. za 100 ${mena}` : 'Zapnout věrnost',
    },
  ];
}

/**
 * N13: /api/client/admin/summary posílal všechno každému s klient.prehled.
 * Teď každé číslo jen s jeho klíčem; bez klíče je pole `null` (ne 0 —
 * nula by říkala „nic nečeká", i když divák jen nesmí vidět).
 */
export function souhrnPodleOpravneni<T extends Record<string, unknown>>(souhrn: T, ma: (klic: string) => boolean): T {
  const out: Record<string, unknown> = { ...souhrn };
  if (!ma('rezervace.zobrazit')) out.reservations = null;
  if (!ma('objednavky.zobrazit')) out.orders = null;
  if (!ma('zakaznici.recenze')) out.reviews = null;
  // Odznak „k vyřízení" sčítá jen to, co divák vidí.
  const rq = (out.reservations as { requested?: number } | null)?.requested ?? 0;
  const on = (out.orders as { new?: number } | null)?.new ?? 0;
  out.attention = rq + on;
  return out as T;
}

// ---------------------------------------------------------------------------
// Akce
// ---------------------------------------------------------------------------

export interface BodChecklistu { text: string; done: boolean }

export interface AkceSouhrn {
  id: number;
  nazev: string;
  datum: string;
  zacatek: string | null;
  stav: string;
  checklist: BodChecklistu[];
  /** null = divák nemá akce.finance (API čísla nepošle), nebo nic zapsáno. */
  trzba: number | null;
  naklady: number | null;
  uzaverek: number;
}

export function vyberAkceSouhrn(raw: any): AkceSouhrn[] {
  if (!raw || !Array.isArray(raw.events)) throw new Error('Akce přišly v nečekaném tvaru.');
  return raw.events.map((e: any) => {
    const uzaverek = cislo(e.closingsCount);
    // Tržbu akce s uzávěrkou nese uzávěrka (jako detail akce v EventsView).
    const trzba = uzaverek > 0 && e.closingsTotal != null ? cislo(e.closingsTotal) : e.revenue == null ? null : cislo(e.revenue);
    return {
      id: Number(e.id),
      nazev: text(e.title) ?? 'Akce',
      datum: String(e.date ?? '').slice(0, 10),
      zacatek: typeof e.startTime === 'string' && e.startTime ? e.startTime.slice(0, 5) : null,
      stav: String(e.status ?? 'planned'),
      checklist: seznam(e.checklist).map((c: any) => ({ text: String(c?.text ?? '').trim(), done: c?.done === true })).filter(c => c.text),
      trzba,
      naklady: e.costs == null ? null : cislo(e.costs),
      uzaverek,
    };
  });
}

const podleData = (a: AkceSouhrn, b: AkceSouhrn) => a.datum.localeCompare(b.datum) || (a.zacatek ?? '').localeCompare(b.zacatek ?? '');

/** Nejbližší nadcházející akce, která má co připravit (checklist). Zrušené ne. */
export function akceKPriprave(akce: AkceSouhrn[], dnes: string): AkceSouhrn | null {
  return akce.filter(a => a.datum >= dnes && a.stav !== 'cancelled' && a.checklist.length > 0).sort(podleData)[0] ?? null;
}

/**
 * Poslední proběhlá akce (datum před dneškem nebo stav „proběhla"), a to ta,
 * u které je co vyúčtovat: bez tržby i nákladů by widget ukázal „0 Kč",
 * což není výsledek, ale chybějící zápis.
 */
export function posledniProbehla(akce: AkceSouhrn[], dnes: string): AkceSouhrn | null {
  const probehle = akce.filter(a => a.stav !== 'cancelled' && (a.datum < dnes || a.stav === 'done'));
  return [...probehle].sort((a, b) => -podleData(a, b)).find(a => a.trzba != null || a.naklady != null) ?? null;
}

/** Výsledek akce = tržba − náklady; null, když není zapsané ani jedno. */
export function vysledekAkce(a: Pick<AkceSouhrn, 'trzba' | 'naklady'>): number | null {
  if (a.trzba == null && a.naklady == null) return null;
  return (a.trzba ?? 0) - (a.naklady ?? 0);
}

/** Checklist s přepnutým bodem — PATCH /api/events/{id} bere celý seznam. */
export function prepniBod(checklist: BodChecklistu[], index: number): BodChecklistu[] {
  return checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
}
