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
  /** Nejvýš tolikrát za den na člověka (null = bez limitu). */
  maxPerDay: number | null;
  createdAt: string;
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

/** Kolikrát už člověk dnes tuhle položku zapsal — proti maxPerDay. */
export function limitNabidkyVycerpan(n: Pick<NabidkaNavic, 'id' | 'maxPerDay'>, dnesniZapisy: readonly Pick<Navic, 'offerId' | 'status'>[]): boolean {
  if (n.maxPerDay == null || n.maxPerDay <= 0) return false;
  const pocet = dnesniZapisy.filter(z => z.offerId === n.id && z.status !== 'odmitnuto').length;
  return pocet >= n.maxPerDay;
}

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
  if (max != null && (max < 1 || max > 50)) return { ok: false, chyba: 'Limit za den musí být 1–50.' };
  return {
    ok: true,
    nabidka: { title, description: popis, points: body ?? 0, bonusCzk: premie && premie > 0 ? premie : null, autoApprove: b.autoApprove === true, active: b.active !== false, validFrom: od, validTo: doD, maxPerDay: max },
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
