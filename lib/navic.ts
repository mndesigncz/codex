// „Navíc" — co člověk na směně (nebo ten den) udělal nad rámec povinností.
//
// Proč to je: v podniku se každý den dějí věci, které v žádném úkolu ani postupu
// nejsou — někdo vytřel sklad, zaskočil za kolegu, vyřešil reklamaci. Dřív se to
// nikam nezapsalo, vedení to nevidělo a nedalo se za to nic dát. Teď:
//
//  - zaměstnanec zapíše „navíc" (text, den, nepovinně směna / uzávěrka / úkol,
//    nepovinně položka z nabídky, fotka) — z Domů, z Moje směny, při uzávěrce,
//    z tabletu, z úkolu;
//  - vedení vidí frontu („Čeká na tebe"), uzná body nebo prémii (v měně podniku), nebo odmítne
//    s důvodem; uznané body jdou do point_awards (kind 'navic') a tedy do Mého
//    výdělku, žebříčku a profilu, prémie do wage_adjustments (source 'navic');
//  - vedení může vypsat nabídku „Co se dá udělat navíc" s body (a volitelně
//    uznávat automaticky) — zaměstnanec si z ní vybere jedním klepnutím.
//
// Tenhle soubor je čistá logika bez React a bez DB (testy scripts/testy/k85-navic.ts).
// Server: app/api/navic/route.ts, app/api/navic/[id]/route.ts, app/api/navic/offers/route.ts.

export type StavNavic = 'ceka' | 'uznano' | 'odmitnuto';
export const STAVY_NAVIC: readonly StavNavic[] = ['ceka', 'uznano', 'odmitnuto'];
export const jeStavNavic = (x: unknown): x is StavNavic => typeof x === 'string' && (STAVY_NAVIC as readonly string[]).includes(x);

/** Nejdelší text zápisu — jedna dvě věty, ne hlášení. */
export const MAX_DELKA_TEXTU = 500;
export const MIN_DELKA_TEXTU = 2;
/** Nejvíc bodů za jedno „navíc" (ochrana před překlepem 1000 místo 10). */
export const MAX_BODU = 500;
/** Nejvyšší prémie (v měně podniku) za jedno „navíc". */
export const MAX_PREMIE = 5000;
/** Nejdelší důvod odmítnutí / poznámka k uznání. */
export const MAX_DELKA_POZNAMKY = 300;
/** Nejdelší název položky nabídky. */
export const MAX_DELKA_NAZVU = 80;
/** Kolik dní zpětně smí zaměstnanec zapsat „navíc" (den zápisu ≥ dnes − N). */
export const DNI_ZPETNE = 14;

export interface Navic {
  id: number;
  userId: number;
  userName: string;
  userAvatar: string | null;
  /** Kdo to zapsal: null = sám, jinak id (vedení, tablet za vybraného, kolega). */
  reportedBy: number | null;
  reportedByName: string | null;
  /** RRRR-MM-DD. */
  day: string;
  shiftId: number | null;
  closingId: number | null;
  taskId: number | null;
  offerId: number | null;
  offerTitle: string | null;
  text: string;
  photoUrl: string | null;
  /** Body navržené při zápisu (z nabídky) — vedení je může změnit. */
  pointsProposed: number | null;
  status: StavNavic;
  /** Uznané body (jen u 'uznano'). */
  points: number | null;
  /** Uznaná prémie v měně podniku (jen u uznaného). */
  bonusCzk: number | null;
  decidedBy: number | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

/**
 * Opakování volitelného úkolu (kolo 11): kdy se dá vzít a splnit.
 *  - kdykoli  — každý den, dokud položka platí (termín = den),
 *  - jednou   — jediný termín za celou platnost (kapacita = kolik lidí celkem),
 *  - denne    — každý den (termín = den; rozdíl proti „kdykoli" je jen v popisu pro lidi),
 *  - dny      — vybrané dny v týdnu (recDays 1 = pondělí … 7 = neděle),
 *  - tydne    — jednou za týden (termín = pondělí toho týdne),
 *  - mesicne  — jednou za měsíc (termín = první den měsíce),
 *  - interval — každých N dní od data „platí od" (recInterval).
 */
export type OpakovaniNabidky = 'kdykoli' | 'jednou' | 'denne' | 'dny' | 'tydne' | 'mesicne' | 'interval';
export const OPAKOVANI_NABIDKY: readonly OpakovaniNabidky[] = ['kdykoli', 'jednou', 'denne', 'dny', 'tydne', 'mesicne', 'interval'];
export const jeOpakovani = (x: unknown): x is OpakovaniNabidky => typeof x === 'string' && (OPAKOVANI_NABIDKY as readonly string[]).includes(x);

export interface NabidkaNavic {
  id: number;
  title: string;
  description: string | null;
  points: number;
  bonusCzk: number | null;
  /** Zápis z této položky se uzná sám (bez fronty). */
  autoApprove: boolean;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  /** Nejvýš tolikrát za termín na člověka (null = bez limitu). U „kdykoli" je termín den. */
  maxPerDay: number | null;
  /** Kdy se dá vzít (kolo 11; starší položky = „kdykoli"). */
  recurrence: OpakovaniNabidky;
  /** Dny v týdnu pro „dny" (1 = pondělí … 7 = neděle). */
  recDays: number[];
  /** Každých kolik dní pro „interval". */
  recInterval: number | null;
  /** Kolik lidí ji může v jednom termínu vzít (null = kdokoli). */
  capacity: number | null;
  /** Bez fotky nejde zapsat jako hotové. */
  requirePhoto: boolean;
  /** Komu je určená (prázdné = všem, kdo smí zapisovat navíc). */
  targetUsers: number[];
  createdAt: string;
}

/** Stav člověka u volitelného úkolu v termínu. */
export type StavUkoluNavic = 'volne' | 'vzato' | 'ceka' | 'uznano' | 'odmitnuto' | 'plno';

/** Volitelný úkol pro jeden termín (GET /api/navic/ukoly). */
export interface UkolNavic {
  nabidka: NabidkaNavic;
  /** Klíč termínu (den, pondělí týdne, první den měsíce, nebo „jednou"). */
  termin: string;
  /** Kolik lidí ho v termínu vzalo nebo splnilo (bez odmítnutých). */
  obsazeno: number;
  /** Můj stav (nebo stav vybraného člověka na tabletu). */
  stav: StavUkoluNavic;
  /** Kolikrát jsem ho v termínu už zapsal(a) (bez odmítnutých). */
  mojeZapisy: number;
  /** Id mého posledního zápisu v termínu (k otevření). */
  workId: number | null;
  /** Kdo ho má vzatý nebo hotový (jména — ať se nedělá dvakrát). */
  kdo: { userId: number; name: string; stav: 'vzato' | 'hotovo' }[];
}

/** Odpověď GET /api/navic. */
export interface DataNavic {
  items: Navic[];
  nabidka: NabidkaNavic[];
  /** Co smí volající: uznávat (navic.uznat), spravovat nabídku (navic.nabidka), vidět tým (navic.zobrazit_tym). */
  smi: { uznat: boolean; nabidka: boolean; tym: boolean; zapsat: boolean };
}

// ---------------------------------------------------------------------------
// Výběr z odpovědi (useDataWidgetu) — tolerantní k chybějícím polím
// ---------------------------------------------------------------------------

const cele = (v: unknown): number | null => {
  // null, undefined a prázdný řetězec = chybí (Number(null) je 0, a to by z chybějící vazby udělalo uzávěrku č. 0).
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const den = (v: unknown): string => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : '');
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

export function vyberNavic(raw: unknown): Navic[] {
  const r = raw as { items?: unknown } | null;
  const pole = Array.isArray(r?.items) ? r!.items : Array.isArray(raw) ? raw : [];
  const out: Navic[] = [];
  for (const x of pole as any[]) {
    if (!x || cele(x.id) == null) continue;
    out.push({
      id: cele(x.id)!,
      userId: cele(x.userId) ?? 0,
      userName: String(x.userName ?? ''),
      userAvatar: text(x.userAvatar),
      reportedBy: cele(x.reportedBy),
      reportedByName: text(x.reportedByName),
      day: den(x.day),
      shiftId: cele(x.shiftId),
      closingId: cele(x.closingId),
      taskId: cele(x.taskId),
      offerId: cele(x.offerId),
      offerTitle: text(x.offerTitle),
      text: String(x.text ?? ''),
      photoUrl: text(x.photoUrl),
      pointsProposed: cele(x.pointsProposed),
      status: jeStavNavic(x.status) ? x.status : 'ceka',
      points: cele(x.points),
      bonusCzk: x.bonusCzk == null ? null : cele(x.bonusCzk),
      decidedBy: cele(x.decidedBy),
      decidedByName: text(x.decidedByName),
      decidedAt: text(x.decidedAt),
      decisionNote: text(x.decisionNote),
      createdAt: String(x.createdAt ?? ''),
    });
  }
  return out;
}

export function vyberNabidku(raw: unknown): NabidkaNavic[] {
  const r = raw as { nabidka?: unknown; offers?: unknown } | null;
  const pole = Array.isArray(r?.nabidka) ? r!.nabidka : Array.isArray(r?.offers) ? r!.offers : Array.isArray(raw) ? raw : [];
  const out: NabidkaNavic[] = [];
  for (const x of pole as any[]) {
    if (!x || cele(x.id) == null) continue;
    out.push({
      id: cele(x.id)!,
      title: String(x.title ?? ''),
      description: text(x.description),
      points: Math.max(0, cele(x.points) ?? 0),
      bonusCzk: x.bonusCzk == null ? null : cele(x.bonusCzk),
      autoApprove: x.autoApprove === true,
      active: x.active !== false,
      validFrom: den(x.validFrom) || null,
      validTo: den(x.validTo) || null,
      maxPerDay: cele(x.maxPerDay),
      recurrence: jeOpakovani(x.recurrence) ? x.recurrence : 'kdykoli',
      recDays: Array.isArray(x.recDays) ? x.recDays.map(cele).filter((d: number | null): d is number => d != null && d >= 1 && d <= 7) : [],
      recInterval: cele(x.recInterval),
      capacity: cele(x.capacity),
      requirePhoto: x.requirePhoto === true,
      targetUsers: Array.isArray(x.targetUsers) ? x.targetUsers.map(cele).filter((d: number | null): d is number => d != null && d > 0) : [],
      createdAt: String(x.createdAt ?? ''),
    });
  }
  return out;
}

export function vyberDataNavic(raw: unknown): DataNavic {
  const r = (raw ?? {}) as { smi?: any };
  return {
    items: vyberNavic(raw),
    nabidka: vyberNabidku(raw),
    smi: {
      uznat: r.smi?.uznat === true,
      nabidka: r.smi?.nabidka === true,
      tym: r.smi?.tym === true,
      zapsat: r.smi?.zapsat !== false,
    },
  };
}

// ---------------------------------------------------------------------------
// Validace vstupů (server i klient)
// ---------------------------------------------------------------------------

/** Text zápisu: oříznutý, jednotné konce řádků; null = prázdné, false = moc dlouhé nebo moc krátké. */
export function normalizujText(raw: unknown): string | null | false {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!t) return null;
  if (t.length > MAX_DELKA_TEXTU || t.length < MIN_DELKA_TEXTU) return false;
  return t;
}

/** Poznámka k rozhodnutí: null = žádná, false = moc dlouhá. */
export function normalizujPoznamku(raw: unknown): string | null | false {
  if (raw == null) return null;
  if (typeof raw !== 'string') return false;
  const t = raw.replace(/\r\n?/g, '\n').trim();
  if (!t) return null;
  if (t.length > MAX_DELKA_POZNAMKY) return false;
  return t;
}

/** Body: celé číslo 0–MAX_BODU; null = nezadáno; false = nesmysl. */
export function normalizujBody(raw: unknown): number | null | false {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_BODU || Math.round(n) !== n) return false;
  return n;
}

/** Prémie (měna podniku): celé číslo 0–MAX_PREMIE; null = nezadáno; false = nesmysl. */
export function normalizujPremii(raw: unknown): number | null | false {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_PREMIE || Math.round(n) !== n) return false;
  return n;
}

/**
 * Den zápisu: RRRR-MM-DD, ne v budoucnu, ne starší než DNI_ZPETNE (vedení smí
 * libovolně zpětně). Vrací null, když den nesedí.
 */
export function platnyDen(raw: unknown, dnes: string, vedeni: boolean): string | null {
  const d = den(raw);
  if (!d) return null;
  if (d > dnes) return null;
  if (!vedeni && posunDni(dnes, -DNI_ZPETNE) > d) return null;
  return d;
}

/** Posun dne o N dní (čistě na textu RRRR-MM-DD, UTC). */
export function posunDni(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Je položka nabídky dnes platná (aktivní a v intervalu)? */
export function nabidkaPlatna(n: Pick<NabidkaNavic, 'active' | 'validFrom' | 'validTo'>, dnes: string): boolean {
  if (!n.active) return false;
  if (n.validFrom && n.validFrom > dnes) return false;
  if (n.validTo && n.validTo < dnes) return false;
  return true;
}

/** Kolikrát už člověk v termínu (u „kdykoli" dnes) tuhle položku zapsal — proti maxPerDay. */
export function limitNabidkyVycerpan(n: Pick<NabidkaNavic, 'id' | 'maxPerDay'>, dnesniZapisy: readonly Pick<Navic, 'offerId' | 'status'>[]): boolean {
  if (n.maxPerDay == null || n.maxPerDay <= 0) return false;
  const pocet = dnesniZapisy.filter(z => z.offerId === n.id && z.status !== 'odmitnuto').length;
  return pocet >= n.maxPerDay;
}

// ---------------------------------------------------------------------------
// Volitelné úkoly (kolo 11): termín, rozsah, dostupnost
// ---------------------------------------------------------------------------

/** Den v týdnu podle ISO (1 = pondělí … 7 = neděle) pro RRRR-MM-DD. */
export function denVTydnu(d: string): number {
  const w = new Date(`${d}T12:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Pondělí týdne, do kterého den patří. */
export function pondeli(d: string): string {
  return posunDni(d, 1 - denVTydnu(d));
}

/** Počet dní mezi dvěma dny (b − a). */
function rozdilDni(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/**
 * Klíč termínu, do kterého den patří — nebo null, když se úkol ten den vzít nedá
 * (vypnutý, mimo platnost, jiný den v týdnu, mimo interval).
 */
export function terminNabidky(n: Pick<NabidkaNavic, 'active' | 'validFrom' | 'validTo' | 'recurrence' | 'recDays' | 'recInterval'>, d: string): string | null {
  if (!nabidkaPlatna(n, d)) return null;
  switch (n.recurrence) {
    case 'jednou': return 'jednou';
    case 'dny': return n.recDays.includes(denVTydnu(d)) ? d : null;
    case 'tydne': return pondeli(d);
    case 'mesicne': return `${d.slice(0, 7)}-01`;
    case 'interval': {
      if (!n.validFrom || !n.recInterval) return null;
      const r = rozdilDni(n.validFrom, d);
      return r >= 0 && r % n.recInterval === 0 ? d : null;
    }
    default: return d;
  }
}

/** Dny, které termín pokrývá (zápisy v tomhle rozsahu se počítají do kapacity a limitu). */
export function rozsahTerminu(n: Pick<NabidkaNavic, 'recurrence' | 'validFrom' | 'validTo'>, termin: string): { od: string; do: string } {
  if (n.recurrence === 'jednou' || termin === 'jednou') return { od: n.validFrom ?? '0000-01-01', do: n.validTo ?? '9999-12-31' };
  if (n.recurrence === 'tydne') return { od: termin, do: posunDni(termin, 6) };
  if (n.recurrence === 'mesicne') return { od: termin, do: `${termin.slice(0, 7)}-31` };
  return { od: termin, do: termin };
}

/** Je úkol určený tomuhle člověku? (prázdný seznam = všem.) */
export const urcenoPro = (n: Pick<NabidkaNavic, 'targetUsers'>, userId: number): boolean => !n.targetUsers.length || n.targetUsers.includes(userId);

/**
 * Stav úkolu pro člověka v termínu: z jeho zápisů a záborů, obsazenosti a kapacity.
 * `zapisy` = jeho zápisy z téhle položky v rozsahu termínu, `vzato` = má zábor
 * („Beru si"), `obsazeno` = kolik různých lidí ho v termínu vzalo nebo splnilo.
 */
export function stavUkolu(o: {
  zapisy: readonly Pick<Navic, 'status'>[]; vzato: boolean; obsazeno: number; capacity: number | null; maxPerDay: number | null;
}): StavUkoluNavic {
  const platne = o.zapisy.filter(z => z.status !== 'odmitnuto');
  const limit = o.maxPerDay ?? null;
  // Splnil(a) to už tolikrát, kolik smí → stav posledního zápisu.
  if (platne.length && (limit == null ? true : platne.length >= limit)) {
    return platne.some(z => z.status === 'ceka') ? 'ceka' : 'uznano';
  }
  if (o.vzato) return 'vzato';
  if (o.capacity != null && o.obsazeno >= o.capacity && !platne.length) return 'plno';
  // Jen odmítnuté zápisy: jde to zkusit znovu, UI ukáže, že minule neprošlo.
  if (o.zapisy.length && !platne.length) return 'odmitnuto';
  return 'volne';
}

/** Dá se úkol vzít nebo zapsat? */
export const lzeVzit = (s: StavUkoluNavic): boolean => s === 'volne' || s === 'odmitnuto';

/** Klíč popisu opakování k překladu v UI (+ parametry). */
export function popisOpakovani(n: Pick<NabidkaNavic, 'recurrence' | 'recDays' | 'recInterval'>): { klic: string; n?: number; dny?: number[] } {
  switch (n.recurrence) {
    case 'jednou': return { klic: 'Jednorázově' };
    case 'denne': return { klic: 'Každý den' };
    case 'dny': return { klic: 'Vybrané dny', dny: n.recDays };
    case 'tydne': return { klic: 'Jednou týdně' };
    case 'mesicne': return { klic: 'Jednou měsíčně' };
    case 'interval': return { klic: 'Každých {n} dní', n: n.recInterval ?? 0 };
    default: return { klic: 'Kdykoli' };
  }
}

/** Seřadit úkoly: k vzetí nahoře (nejvíc bodů první), pak moje rozdělané, hotové a plné dole. */
export function seradUkoly(u: readonly UkolNavic[]): UkolNavic[] {
  const vaha = (s: StavUkoluNavic) => (s === 'vzato' ? 0 : s === 'volne' || s === 'odmitnuto' ? 1 : s === 'ceka' ? 2 : s === 'uznano' ? 3 : 4);
  return [...u].sort((a, b) => vaha(a.stav) - vaha(b.stav) || b.nabidka.points - a.nabidka.points || a.nabidka.title.localeCompare(b.nabidka.title, 'cs'));
}

export function vyberUkoly(raw: unknown): UkolNavic[] {
  const r = raw as { ukoly?: unknown } | null;
  const pole = Array.isArray(r?.ukoly) ? r!.ukoly : Array.isArray(raw) ? raw : [];
  const out: UkolNavic[] = [];
  for (const x of pole as any[]) {
    const [n] = vyberNabidku([x?.nabidka]);
    if (!n || typeof x?.termin !== 'string') continue;
    const stavy: StavUkoluNavic[] = ['volne', 'vzato', 'ceka', 'uznano', 'odmitnuto', 'plno'];
    out.push({
      nabidka: n,
      termin: x.termin,
      obsazeno: Math.max(0, cele(x.obsazeno) ?? 0),
      stav: stavy.includes(x.stav) ? x.stav : 'volne',
      mojeZapisy: Math.max(0, cele(x.mojeZapisy) ?? 0),
      workId: cele(x.workId),
      kdo: Array.isArray(x.kdo) ? x.kdo.filter((k: any) => cele(k?.userId)).map((k: any) => ({ userId: cele(k.userId)!, name: String(k.name ?? ''), stav: k.stav === 'hotovo' ? 'hotovo' : 'vzato' })) : [],
    });
  }
  return out;
}

export const URL_UKOLY_NAVIC = '/api/navic/ukoly';

/** Jaké rozhodnutí je dovolené: čekající jde uznat i odmítnout; uznané jde ještě odmítnout (vrátí body); odmítnuté jde uznat. */
export function prechodDovolen(ze: StavNavic, na: StavNavic): boolean {
  if (ze === na) return false;
  if (na === 'ceka') return false;
  return true;
}

/** Při uznání musí být aspoň něco: body nebo prémie (nebo výslovně 0 bodů = „uznáno bez odměny"). */
export function uznaniPlatne(body: number | null, premie: number | null): boolean {
  return body != null || premie != null;
}

/** Vstup zápisu po validaci. */
export interface ZapisNavic {
  text: string;
  day: string;
  shiftId: number | null;
  closingId: number | null;
  taskId: number | null;
  offerId: number | null;
  photoUrl: string | null;
}

const ADRESA_FOTKY = /^\/api\/upload\/[A-Za-z0-9_-]{6,}$|^https:\/\//;
export const platnaFotkaNavic = (v: unknown): v is string => typeof v === 'string' && v.length <= 300 && ADRESA_FOTKY.test(v);

/**
 * Z těla požadavku udělá platný zápis, nebo vrátí chybu (klíč hlášky — překládá
 * se v UI i na serveru přes t()).
 */
export function validujZapis(b: Record<string, unknown>, dnes: string, vedeni: boolean): { ok: true; zapis: ZapisNavic } | { ok: false; chyba: string } {
  const t = normalizujText(b.text);
  if (t === null) return { ok: false, chyba: 'Napiš, co bylo navíc.' };
  if (t === false) return { ok: false, chyba: 'Text je moc dlouhý (nejvýš 500 znaků) nebo moc krátký.' };
  const d = platnyDen(b.day ?? dnes, dnes, vedeni);
  if (!d) return { ok: false, chyba: vedeni ? 'Den nesedí (nesmí být v budoucnu).' : 'Den nesedí — zapsat jde nejvýš 14 dní zpětně a ne do budoucna.' };
  const id = (v: unknown): number | null => { const n = cele(v); return n != null && n > 0 ? n : null; };
  const fotka = b.photoUrl == null || b.photoUrl === '' ? null : platnaFotkaNavic(b.photoUrl) ? b.photoUrl : false;
  if (fotka === false) return { ok: false, chyba: 'Fotka má neplatnou adresu.' };
  return { ok: true, zapis: { text: t, day: d, shiftId: id(b.shiftId), closingId: id(b.closingId), taskId: id(b.taskId), offerId: id(b.offerId), photoUrl: fotka } };
}

/** Vstup položky nabídky po validaci. */
export interface ZapisNabidky {
  title: string;
  description: string | null;
  points: number;
  bonusCzk: number | null;
  autoApprove: boolean;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  maxPerDay: number | null;
  recurrence: OpakovaniNabidky;
  recDays: number[];
  recInterval: number | null;
  capacity: number | null;
  requirePhoto: boolean;
  targetUsers: number[];
}

export function validujNabidku(b: Record<string, unknown>): { ok: true; nabidka: ZapisNabidky } | { ok: false; chyba: string } {
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) return { ok: false, chyba: 'Napiš název (co se má udělat).' };
  if (title.length > MAX_DELKA_NAZVU) return { ok: false, chyba: 'Název je moc dlouhý (nejvýš 80 znaků).' };
  const popis = normalizujPoznamku(b.description);
  if (popis === false) return { ok: false, chyba: 'Popis je moc dlouhý (nejvýš 300 znaků).' };
  const body = normalizujBody(b.points ?? 0);
  if (body === false) return { ok: false, chyba: 'Body musí být celé číslo 0–500.' };
  const premie = normalizujPremii(b.bonusCzk);
  if (premie === false) return { ok: false, chyba: 'Prémie musí být celé číslo (nejvýš 5 000).' };
  const od = b.validFrom == null || b.validFrom === '' ? null : den(b.validFrom) || false;
  const doD = b.validTo == null || b.validTo === '' ? null : den(b.validTo) || false;
  if (od === false || doD === false) return { ok: false, chyba: 'Platnost má špatný tvar data.' };
  if (od && doD && od > doD) return { ok: false, chyba: 'Platnost „od" je po „do".' };
  const max = b.maxPerDay == null || b.maxPerDay === '' ? null : cele(b.maxPerDay);
  if (max != null && (max < 1 || max > 50)) return { ok: false, chyba: 'Limit na člověka musí být 1–50.' };
  const opak: OpakovaniNabidky = b.recurrence == null || b.recurrence === '' ? 'kdykoli' : jeOpakovani(b.recurrence) ? b.recurrence : ('x' as OpakovaniNabidky);
  if (!jeOpakovani(opak)) return { ok: false, chyba: 'Neznámé opakování.' };
  const dny = Array.isArray(b.recDays) ? [...new Set(b.recDays.map(cele).filter((d): d is number => d != null && d >= 1 && d <= 7))].sort((x, y) => x - y) : [];
  if (opak === 'dny' && !dny.length) return { ok: false, chyba: 'Vyber aspoň jeden den v týdnu.' };
  const interval = b.recInterval == null || b.recInterval === '' ? null : cele(b.recInterval);
  if (opak === 'interval' && (interval == null || interval < 2 || interval > 90)) return { ok: false, chyba: 'Interval musí být 2–90 dní.' };
  if (opak === 'interval' && !od) return { ok: false, chyba: 'U opakování po dnech vyplň, od kdy se počítá (platí od).' };
  const kapacita = b.capacity == null || b.capacity === '' ? null : cele(b.capacity);
  if (kapacita != null && (kapacita < 1 || kapacita > 50)) return { ok: false, chyba: 'Kolik lidí ji může vzít: 1–50.' };
  const komu = Array.isArray(b.targetUsers) ? [...new Set(b.targetUsers.map(cele).filter((d): d is number => d != null && d > 0))] : [];
  if (komu.length > 200) return { ok: false, chyba: 'Moc vybraných lidí.' };
  return {
    ok: true,
    nabidka: {
      title, description: popis, points: body ?? 0, bonusCzk: premie && premie > 0 ? premie : null, autoApprove: b.autoApprove === true, active: b.active !== false,
      validFrom: od, validTo: doD, maxPerDay: max,
      recurrence: opak, recDays: opak === 'dny' ? dny : [], recInterval: opak === 'interval' ? interval : null,
      capacity: kapacita, requirePhoto: b.requirePhoto === true, targetUsers: komu,
    },
  };
}

// ---------------------------------------------------------------------------
// Souhrny pro widgety a profily
// ---------------------------------------------------------------------------

export interface SouhrnNavic {
  /** Čekající zápisy (k rozhodnutí). */
  ceka: number;
  /** Uznané zápisy v období. */
  uznano: number;
  odmitnuto: number;
  /** Součet uznaných bodů v období. */
  body: number;
  /** Součet uznaných prémií (měna podniku) v období. */
  premie: number;
}

/** Souhrn zápisů za měsíc (RRRR-MM) — nebo za vše, když měsíc chybí. */
export function souhrnNavic(items: readonly Navic[], mesic?: string): SouhrnNavic {
  const s: SouhrnNavic = { ceka: 0, uznano: 0, odmitnuto: 0, body: 0, premie: 0 };
  for (const z of items) {
    if (mesic && !z.day.startsWith(mesic)) continue;
    if (z.status === 'ceka') s.ceka++;
    else if (z.status === 'odmitnuto') s.odmitnuto++;
    else { s.uznano++; s.body += z.points ?? 0; s.premie += z.bonusCzk ?? 0; }
  }
  return s;
}

/** Zápisy jednoho dne (pro uzávěrku, směnu, tablet). */
export const zapisyDne = (items: readonly Navic[], d: string): Navic[] => items.filter(z => z.day === d);

/** Zápisy k uzávěrce: přímo svázané, nebo ze dne uzávěrky od lidí z její osádky. */
export function zapisyKUzaverce(items: readonly Navic[], uzaverka: { id: number; day: string; lide: readonly number[] }): Navic[] {
  return items.filter(z => z.closingId === uzaverka.id || (z.closingId == null && z.day === uzaverka.day && uzaverka.lide.includes(z.userId)));
}

/** Řazení: čekající první (nejstarší nahoře), pak uznané a odmítnuté od nejnovějšího. */
export function seradNavic(items: readonly Navic[]): Navic[] {
  const vaha = (s: StavNavic) => (s === 'ceka' ? 0 : 1);
  return [...items].sort((a, b) => vaha(a.status) - vaha(b.status)
    || (a.status === 'ceka' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
}

/** Tón chipu stavu (Chip tone) a klíč textu — překlad dělá UI. */
export function stavNavic(s: StavNavic): { tone: 'wait' | 'ok' | 'bad'; text: string } {
  if (s === 'ceka') return { tone: 'wait', text: 'Čeká na uznání' };
  if (s === 'uznano') return { tone: 'ok', text: 'Uznáno' };
  return { tone: 'bad', text: 'Odmítnuto' };
}

/** Krátký popis odměny k uznanému zápisu: „+20 b", prémie podle měny podniku, obojí s tečkou, nebo „bez odměny". */
export function odmenaText(z: Pick<Navic, 'points' | 'bonusCzk'>, kc: (n: number) => string): string {
  const casti: string[] = [];
  if (z.points) casti.push(`+${z.points} b`);
  if (z.bonusCzk) casti.push(kc(z.bonusCzk));
  return casti.length ? casti.join(' · ') : 'bez odměny';
}

// ---------------------------------------------------------------------------
// Adresy a události
// ---------------------------------------------------------------------------

export const URL_NAVIC = '/api/navic';
export const URL_NABIDKA_NAVIC = '/api/navic/offers';
/** Po zápisu nebo rozhodnutí: obnovit všechna data /api/navic (obnovDataWidgetu s předponou). */
export const UDALOST_NAVIC = 'navic:zmena';

export interface FiltrNavic {
  /** mine = jen moje (výchozí pro zaměstnance), team = celý podnik (navic.zobrazit_tym). */
  scope?: 'mine' | 'team';
  status?: StavNavic | 'vse';
  /** RRRR-MM (výchozí: posledních 60 dní). */
  mesic?: string;
  userId?: number;
  day?: string;
  closingId?: number;
  shiftId?: number;
}

export function urlNavic(f: FiltrNavic = {}): string {
  const q = new URLSearchParams();
  if (f.scope) q.set('scope', f.scope);
  if (f.status && f.status !== 'vse') q.set('status', f.status);
  if (f.mesic) q.set('month', f.mesic);
  if (f.userId) q.set('userId', String(f.userId));
  if (f.day) q.set('day', f.day);
  if (f.closingId) q.set('closingId', String(f.closingId));
  if (f.shiftId) q.set('shiftId', String(f.shiftId));
  const s = q.toString();
  return s ? `${URL_NAVIC}?${s}` : URL_NAVIC;
}

/** Text oznámení vedení o novém zápisu a zaměstnanci o rozhodnutí. */
export function oznameniNovyZapis(jmeno: string, text: string): { title: string; body: string } {
  return { title: `${jmeno} zapsal(a) navíc`, body: text.length > 90 ? `${text.slice(0, 89)}…` : text };
}
export function oznameniRozhodnuti(z: Pick<Navic, 'status' | 'points' | 'bonusCzk' | 'text' | 'decisionNote'>, kc: (n: number) => string): { title: string; body: string } {
  const kratce = z.text.length > 60 ? `${z.text.slice(0, 59)}…` : z.text;
  if (z.status === 'uznano') return { title: `Navíc uznáno: ${odmenaText(z, kc)}`, body: kratce };
  return { title: 'Navíc neuznáno', body: z.decisionNote ? `${kratce} — ${z.decisionNote}` : kratce };
}
