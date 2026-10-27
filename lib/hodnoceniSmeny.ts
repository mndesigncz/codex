// Hodnocení směny jako celku (Martin: „u všeho hodnotit i kritizovat přímo směnu, vždy").
//
// Dřív šlo hodnotit jen člověka (shift_reviews = člověk + den). „Celou směnu" znamenalo stejný verdikt
// zkopírovaný každému — pochvala a kritika směny jako takové neměla kam. Tady je směna samostatná věc:
// den + skupina lidí se stejnou směnou v rozvrhu (stejný začátek a konec), nebo celý den. Má hvězdy,
// co bylo dobře, co příště jinak (kritika), štítky, „k nápravě", fotku a volitelný rozpis bodů po lidech.
//
// Body z rozpisu jsou body, ne peníze (zákoník práce § 346b: žádné pokuty, srážky ze mzdy jen dohodou) —
// okno nemá žádné peněžní pole a kritika nic nekrátí. Body se zapisují jako ruční řádky shift_review_items
// (kind 'smena'), takže je zůstatek, žebříček i „Odkud mám body" vidí bez dalšího výpočtu.
//
// Čistý modul (bez databáze a Reactu): testy scripts/testy/hodnoceni-smeny.ts.

/** Klíč směny „celý den" (bez rozvrhu, nebo hodnocení celého dne). */
export const KLIC_DEN = 'den';

/** Body jednomu člověku za směnu: −100…+100 (stejně jako body u položky směny). */
export const BODY_MIN = -100;
export const BODY_MAX = 100;
export const MAX_TEXT = 1000;
export const MAX_OSADKA = 40;

/** Štítky směny — id je stabilní (ukládá se), text se překládá v UI. */
export const STITKY = [
  { id: 'cistota', nazev: 'Čistota' },
  { id: 'rychlost', nazev: 'Rychlost' },
  { id: 'hoste', nazev: 'Obsluha hostů' },
  { id: 'komunikace', nazev: 'Komunikace' },
  { id: 'priprava', nazev: 'Příprava' },
  { id: 'tym', nazev: 'Týmová práce' },
  { id: 'kasa', nazev: 'Uzávěrka a kasa' },
] as const;
export type IdStitku = (typeof STITKY)[number]['id'];
/** Stav štítku: dobře (+) nebo k nápravě (−). Bez štítku = není v mapě. */
export type StavStitku = 'plus' | 'minus';
export type Stitky = Partial<Record<IdStitku, StavStitku>>;

const ID_STITKU = new Set<string>(STITKY.map(s => s.id));

/** Klepnutí na štítek: nic → dobře → k nápravě → nic. */
export function dalsiStavStitku(s: StavStitku | undefined): StavStitku | undefined {
  return s === undefined ? 'plus' : s === 'plus' ? 'minus' : undefined;
}

export const jeDen = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const hm = (v: unknown): string | null => {
  const s = String(v ?? '').slice(0, 5);
  return HM.test(s) ? s : null;
};

/** Klíč směny z času začátku a konce („07:00-15:00"); bez času celý den. */
export function klicSmeny(od: unknown, doo: unknown): string {
  const a = hm(od), b = hm(doo);
  return a && b ? `${a}-${b}` : KLIC_DEN;
}

/** Platný klíč? (`den` nebo `HH:MM-HH:MM`.) */
export function jeKlic(k: unknown): k is string {
  if (k === KLIC_DEN) return true;
  if (typeof k !== 'string') return false;
  const [a, b] = k.split('-');
  return k.length === 11 && !!hm(a) && !!hm(b);
}

export interface RadekRozvrhu {
  employeeId: number;
  jmeno: string;
  avatar?: string | null;
  od: string | null;
  do: string | null;
  /** Název typu směny (Ranní…), když ho rozvrh zná. */
  nazev?: string | null;
}

export interface Clovek { id: number; jmeno: string; avatar: string | null }

export interface SkupinaSmeny {
  klic: string;
  /** Název z typu směny; u celého dne null (UI napíše „Celý den"). */
  nazev: string | null;
  od: string | null;
  do: string | null;
  lide: Clovek[];
}

/**
 * Směny dne podle rozvrhu: lidé se stejným začátkem a koncem jsou jedna směna (osádka). Seřazené podle
 * začátku. Na konec přijde „Celý den" se všemi, kdo ten den měli směnu — když je směn víc než jedna,
 * nebo když rozvrh nemá žádnou (hodnotit jde vždycky).
 */
export function skupinySmen(radky: RadekRozvrhu[]): SkupinaSmeny[] {
  const mapa = new Map<string, SkupinaSmeny>();
  const vsichni = new Map<number, Clovek>();
  for (const r of radky) {
    if (!Number.isFinite(r.employeeId)) continue;
    const clovek: Clovek = { id: r.employeeId, jmeno: r.jmeno, avatar: r.avatar ?? null };
    vsichni.set(r.employeeId, clovek);
    const klic = klicSmeny(r.od, r.do);
    let s = mapa.get(klic);
    if (!s) {
      s = { klic, nazev: r.nazev?.trim() || null, od: hm(r.od), do: hm(r.do), lide: [] };
      mapa.set(klic, s);
    }
    if (!s.nazev && r.nazev?.trim()) s.nazev = r.nazev.trim();
    if (!s.lide.some(x => x.id === r.employeeId)) s.lide.push(clovek);
  }
  const razeni = (a: Clovek, b: Clovek) => a.jmeno.localeCompare(b.jmeno, 'cs');
  const smeny = Array.from(mapa.values())
    .filter(s => s.klic !== KLIC_DEN)
    .map(s => ({ ...s, lide: [...s.lide].sort(razeni) }))
    .sort((a, b) => String(a.od).localeCompare(String(b.od)) || String(a.do).localeCompare(String(b.do)));
  if (smeny.length !== 1) smeny.push({ klic: KLIC_DEN, nazev: null, od: null, do: null, lide: Array.from(vsichni.values()).sort(razeni) });
  return smeny;
}

/** Která směna se má v okně vybrat: požadovaná, pak ta s člověkem, pak první. */
export function vychoziSkupina(skupiny: SkupinaSmeny[], o: { klic?: string | null; clovek?: number | null } = {}): string {
  if (o.klic && skupiny.some(s => s.klic === o.klic)) return o.klic;
  if (o.clovek != null) {
    const s = skupiny.find(x => x.klic !== KLIC_DEN && x.lide.some(l => l.id === o.clovek));
    if (s) return s.klic;
  }
  return skupiny[0]?.klic ?? KLIC_DEN;
}

const cele = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};
export const orezBody = (v: unknown): number => Math.max(BODY_MIN, Math.min(BODY_MAX, cele(v)));
const textNeboNull = (v: unknown, max = MAX_TEXT): string | null => {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
  return s ? s : null;
};

export function normalizujStitky(raw: unknown): Stitky {
  const out: Stitky = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (ID_STITKU.has(k) && (v === 'plus' || v === 'minus')) out[k as IdStitku] = v;
  }
  return out;
}

/** Fotka směny: jen soubor nahraný do aplikace (/api/upload/<id>), jako fotky dokladů u uzávěrky. */
export function normalizujFoto(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return /^\/api\/upload\/[A-Za-z0-9_-]+$/.test(s) ? s : null;
}

export interface BodyClena { id: number; body: number; poznamka: string | null }

export interface VstupHodnoceni {
  den: string;
  klic: string;
  nazev: string | null;
  od: string | null;
  do: string | null;
  hvezdy: number;
  dobre: string | null;
  kritika: string | null;
  stitky: Stitky;
  kNaprave: boolean;
  foto: string | null;
  /** Osádka (id lidí) — komu se hodnocení ukáže. */
  osadka: number[];
  /** Body po lidech (jen členové osádky; nula bez poznámky se nezapisuje). */
  body: BodyClena[];
}

/** Tělo POST /api/hodnoceni-smeny → čistý vstup, nebo chyba (česká věta pro hlášku). */
export function normalizujVstup(b: any): { ok: true; v: VstupHodnoceni } | { ok: false; chyba: string } {
  if (!b || typeof b !== 'object') return { ok: false, chyba: 'Chybí data hodnocení.' };
  if (!jeDen(b.den)) return { ok: false, chyba: 'Chybí den směny.' };
  const klic = jeKlic(b.klic) ? b.klic : KLIC_DEN;
  const osadka = Array.from(new Set((Array.isArray(b.osadka) ? b.osadka : [])
    .map((n: unknown) => cele(n)).filter((n: number) => n > 0))).slice(0, MAX_OSADKA) as number[];
  const vOsadce = new Set(osadka);
  const body: BodyClena[] = [];
  for (const x of Array.isArray(b.body) ? b.body : []) {
    const id = cele(x?.id);
    if (!vOsadce.has(id) || body.some(y => y.id === id)) continue;
    const pts = orezBody(x?.body);
    const poznamka = textNeboNull(x?.poznamka, 500);
    if (pts === 0 && !poznamka) continue;
    body.push({ id, body: pts, poznamka });
  }
  const [od, doo] = klic === KLIC_DEN ? [null, null] : klic.split('-');
  const v: VstupHodnoceni = {
    den: b.den, klic,
    nazev: textNeboNull(b.nazev, 60),
    od, do: doo,
    hvezdy: Math.max(0, Math.min(5, cele(b.hvezdy))),
    dobre: textNeboNull(b.dobre),
    kritika: textNeboNull(b.kritika),
    stitky: normalizujStitky(b.stitky),
    kNaprave: b.kNaprave === true,
    foto: normalizujFoto(b.foto),
    osadka, body,
  };
  if (!jeCoUlozit(v)) return { ok: false, chyba: 'Dej hvězdy, napiš co bylo dobře nebo co příště jinak, nebo označ štítek.' };
  return { ok: true, v };
}

/** Má hodnocení obsah? (Prázdné okno se neukládá — zaměstnanci by dostali oznámení o ničem.) */
export function jeCoUlozit(v: Pick<VstupHodnoceni, 'hvezdy' | 'dobre' | 'kritika' | 'stitky' | 'kNaprave' | 'foto' | 'body'>): boolean {
  return v.hvezdy > 0 || !!v.dobre || !!v.kritika || Object.keys(v.stitky).length > 0 || v.kNaprave || !!v.foto || v.body.some(x => x.body !== 0);
}

/** Osobní poznámka v oznámení: „ · Pro tebe: …" (zkrácená, ať se vejde do push). */
export function textPoznamkyProClena(poznamka: string | null | undefined, max = 120): string {
  const p = (poznamka ?? '').trim().replace(/\s+/g, ' ');
  if (!p) return '';
  return ` · Pro tebe: „${p.length > max ? `${p.slice(0, max - 1)}…` : p}“`;
}

/** Tón hodnocení pro oznámení a štítek: pochvala, kritika, nebo obojí. */
export function tonHodnoceni(v: Pick<VstupHodnoceni, 'hvezdy' | 'dobre' | 'kritika' | 'stitky' | 'kNaprave'>): 'pochvala' | 'kritika' | 'smisene' {
  const minus = v.kNaprave || !!v.kritika || Object.values(v.stitky).includes('minus') || (v.hvezdy > 0 && v.hvezdy <= 2);
  const plus = !!v.dobre || Object.values(v.stitky).includes('plus') || v.hvezdy >= 4;
  return minus && plus ? 'smisene' : minus ? 'kritika' : 'pochvala';
}

export interface ZmenaBodu { id: number; pred: number; po: number }

/**
 * Zpětná změna uloženého hodnocení: komu se změní body (náhled před uložením). Kdo z osádky vypadl,
 * přijde o své body (po = 0).
 */
export function zmenyBodu(puvodni: { id: number; body: number }[], nove: { id: number; body: number }[]): ZmenaBodu[] {
  const pred = new Map(puvodni.map(x => [x.id, x.body]));
  const po = new Map(nove.map(x => [x.id, x.body]));
  const ids = Array.from(new Set([...pred.keys(), ...po.keys()]));
  return ids
    .map(id => ({ id, pred: pred.get(id) ?? 0, po: po.get(id) ?? 0 }))
    .filter(z => z.pred !== z.po)
    .sort((a, b) => a.id - b.id);
}

/** Součet změn (náhled „celkem −3 b"). */
export const soucetZmen = (z: ZmenaBodu[]): number => z.reduce((s, x) => s + (x.po - x.pred), 0);

/** „Stejně všem": stejné body každému v osádce (poznámky zůstávají). */
export function stejneVsem(osadka: number[], body: number, stavajici: BodyClena[] = []): BodyClena[] {
  const b = orezBody(body);
  return osadka.map(id => ({ id, body: b, poznamka: stavajici.find(x => x.id === id)?.poznamka ?? null }));
}

/** Popisek směny pro oznámení a seznamy: „Ranní 07:00–15:00", „07:00–15:00", nebo null (celý den). */
export function popisSmeny(s: { nazev: string | null; od: string | null; do: string | null }): string | null {
  const cas = s.od && s.do ? `${s.od}–${s.do}` : '';
  const t = [s.nazev ?? '', cas].filter(Boolean).join(' ');
  return t || null;
}

/** Odkaz, který otevře okno hodnocení směny (oznámení po uzávěrce). */
export function odkazHodnoceni(den: string, klic?: string | null): string {
  const q = new URLSearchParams({ hodnotitSmenu: den });
  if (klic && klic !== KLIC_DEN) q.set('smena', klic);
  return `/employer/overview?${q.toString()}`;
}

/** Hodnocení, jak ho vidí člen osádky: celé hodnocení směny, ale z bodů jen svoje. */
export interface HodnoceniProClena {
  id: number;
  den: string;
  klic: string;
  nazev: string | null;
  od: string | null;
  do: string | null;
  hvezdy: number;
  dobre: string | null;
  kritika: string | null;
  stitky: Stitky;
  kNaprave: boolean;
  foto: string | null;
  mojeBody: number;
  mojePoznamka: string | null;
  videno: boolean;
  /** Kolik lidí bylo na směně. */
  lidi: number;
  /** Jména kolegů z osádky (Martin: zaměstnanec vidí, s kým na směně byl) — bez jejich bodů a poznámek. */
  kolegove: string[];
}

/** Pohled člena: z rozpisu bodů jen jeho řádek. Člen mimo osádku hodnocení nedostane (null). */
export function proClena(radek: {
  id: number; den: string; klic: string; nazev: string | null; od: string | null; do: string | null; hvezdy: number;
  dobre: string | null; kritika: string | null; stitky: unknown; kNaprave: boolean; foto: string | null;
  osadka: number[]; videli: number[]; body: { id: number; body: number; poznamka: string | null }[];
}, clen: number, jmena: ReadonlyMap<number, string> = new Map()): HodnoceniProClena | null {
  if (!radek.osadka.includes(clen)) return null;
  const moje = radek.body.find(x => x.id === clen);
  return {
    id: radek.id, den: radek.den, klic: radek.klic, nazev: radek.nazev, od: radek.od, do: radek.do,
    hvezdy: radek.hvezdy, dobre: radek.dobre, kritika: radek.kritika, stitky: normalizujStitky(radek.stitky),
    kNaprave: radek.kNaprave, foto: radek.foto,
    mojeBody: moje?.body ?? 0, mojePoznamka: moje?.poznamka ?? null,
    videno: radek.videli.includes(clen), lidi: radek.osadka.length,
    // Z ostatních jen jméno (body a osobní poznámky kolegů zůstávají jim a vedení).
    kolegove: radek.osadka.filter(id => id !== clen).map(id => jmena.get(id)).filter((j): j is string => !!j),
  };
}

// ---------------------------------------------------------------------------
// Otevření okna odkudkoli (jako otevriDen v lib/denUdalost): HodnoceniSmenyHost na ploše poslouchá.
// ---------------------------------------------------------------------------

export const UDALOST_HODNOTIT_SMENU = 'managero:hodnotit-smenu';

export interface DetailHodnoceniSmeny { den: string; klic?: string | null; clovek?: number | null }

export function otevriHodnoceniSmeny(den: string, o: { klic?: string | null; clovek?: number | null } = {}): void {
  if (typeof window === 'undefined' || !jeDen(den)) return;
  window.dispatchEvent(new CustomEvent<DetailHodnoceniSmeny>(UDALOST_HODNOTIT_SMENU, { detail: { den, klic: o.klic ?? null, clovek: o.clovek ?? null } }));
}
