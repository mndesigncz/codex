// „Tresty" — co člověk pokazil a co za to dostal. Zrcadlo „Navíc" (lib/navic.ts).
//
// Proč to je: vedení potřebuje průšvih zapsat tam, kde je vidět — kdo, kdy, co se
// stalo, na které směně nebo uzávěrce — a dát za něj trest, který se propíše do
// bodů a výplaty. Dosud šla jen výtka u položky v hodnocení směny.
//
//  - vedení (tresty.udelit) zapíše prohřešek: člen, den, text, nepovinně směna /
//    uzávěrka / úkol, nepovinně položka ze sazebníku, fotka; trest = body dolů
//    (point_awards kind 'trest', záporné) a/nebo krácení prémie (wage_adjustments
//    source 'trest', záporné). Bez bodů i krácení je to napomenutí;
//  - krácení prémie jde nejvýš do výše NENÁROKOVÝCH prémií člověka za ten měsíc
//    (wage_adjustments source 'premie', ZDROJ_NENAROKOVE_PREMIE): peněžní postihy
//    zaměstnanci zákoník práce zakazuje (§ 346b odst. 1; NS 21 Cdo 3471/2024), krátit
//    nenárokovou prémii ne. Mzda, starší kladné úpravy bez typu, prémie za navíc ani
//    odměny z katalogu se do stropu nepočítají;
//  - člověk dostane oznámení, trest vidí v Odměnách, potvrdí „Beru na vědomí"
//    a může se vyjádřit (i nesouhlasit) — vedení to vidí ve frontě;
//  - vedení trest upraví nebo zruší (body i krácení se vrátí, záznam zůstane);
//  - sazebník: typické prohřešky s body a krácením, vybírá se jedním klepnutím;
//  - návrhy z dat: pozdní příchod a výtka z hodnocení směny → „Dát trest" předvyplněně,
//    nebo zahodit. Manko v uzávěrce trestem NENÍ (spuštění, balík P): za schodek ručí
//    zaměstnanec jen podle dohody o odpovědnosti (§ 252 zákoníku práce), ne pokutou.
//    Druh 'manko' zůstává kvůli starým záznamům, nový trest z manka validace odmítne;
//  - napomenutí v aplikaci není výtka podle § 52 písm. g) zákoníku práce (VETA_VYTKA).
//
// Tenhle soubor je čistá logika bez React a bez DB (testy scripts/testy/k86-tresty.ts).
// Server: app/api/tresty/route.ts, app/api/tresty/[id]/route.ts,
// app/api/tresty/types/route.ts, app/api/tresty/navrhy/route.ts.

export type StavTrestu = 'plati' | 'zruseno';
export const STAVY_TRESTU: readonly StavTrestu[] = ['plati', 'zruseno'];
export const jeStavTrestu = (x: unknown): x is StavTrestu => typeof x === 'string' && (STAVY_TRESTU as readonly string[]).includes(x);

/** Odkud trest vznikl: ručně, nebo z návrhu (pozdní příchod, manko, výtka z hodnocení). */
export type ZdrojTrestu = 'rucne' | 'pozde' | 'manko' | 'vytka';
export const ZDROJE_TRESTU: readonly ZdrojTrestu[] = ['rucne', 'pozde', 'manko', 'vytka'];
export type DruhNavrhu = Exclude<ZdrojTrestu, 'rucne'>;

export const MAX_DELKA_TEXTU = 500;
export const MIN_DELKA_TEXTU = 2;
/** Nejvíc bodů dolů jedním trestem. */
export const MAX_BODU = 500;
/** Nejvyšší krácení prémie jedním trestem (měna podniku). */
export const MAX_KRACENI = 5000;
export const MAX_DELKA_POZNAMKY = 300;
export const MAX_DELKA_VYJADRENI = 500;
export const MAX_DELKA_NAZVU = 80;
/** Vedení smí trest zapsat nejvýš tolik dní zpětně (pak už je to archeologie). */
export const DNI_ZPETNE = 31;
/** Návrhy z dat se hledají za posledních tolik dní. */
export const DNI_NAVRHU = 14;
/** Pozdní příchod je návrh trestu od tolika minut (stejný práh jako docházka a tablet). */
export const PRAH_POZDE_MIN = 10;
/** Manko od téhle částky (měna podniku) se v návrzích připomene větou VETA_MANKO (trest to není). */
export const PRAH_MANKA = 50;
/** Zdroj úpravy mzdy „nenároková prémie" (wage_adjustments.source) — jediný základ stropu krácení. */
export const ZDROJ_NENAROKOVE_PREMIE = 'premie';
/** Věta místo návrhu trestu za manko (bez akce). */
export const VETA_MANKO = 'Manko řeš dohodou o odpovědnosti, ne trestem.';
/** Drobná věta v okně trestu. */
export const VETA_VYTKA = 'Napomenutí v aplikaci není výtka podle § 52 písm. g) zákoníku práce.';
/** Hláška strop 0: proč krátit nejde a jak prémii založit. */
export const VETA_BEZ_PREMIE = 'Krátit jde jen nenárokovou prémii a tenhle měsíc žádná není. Založ ji v Docházce → Prémie a srážky jako „Nenároková prémie“. Starší prémie bez typu se nepočítají.';

export interface Trest {
  id: number;
  userId: number;
  userName: string;
  userAvatar: string | null;
  givenBy: number | null;
  givenByName: string | null;
  day: string;
  shiftId: number | null;
  closingId: number | null;
  taskId: number | null;
  typeId: number | null;
  typeTitle: string | null;
  text: string;
  photoUrl: string | null;
  /** Kolik bodů dolů (kladné číslo; 0 = bez bodů). */
  points: number;
  /** Kolik se krátí z prémie (kladné číslo, měna podniku; 0 = nic). */
  bonusCut: number;
  status: StavTrestu;
  source: ZdrojTrestu;
  sourceKey: string | null;
  seenAt: string | null;
  response: string | null;
  responseAt: string | null;
  /** Člověk s trestem nesouhlasí (vyjádření čeká na vedení). */
  disputed: boolean;
  /** Vedení na vyjádření zareagovalo (nechalo platit nebo zrušilo). */
  disputeHandledAt: string | null;
  cancelledBy: number | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  cancelNote: string | null;
  createdAt: string;
}

/** Položka sazebníku. */
export interface DruhTrestu {
  id: number;
  title: string;
  description: string | null;
  points: number;
  bonusCut: number | null;
  active: boolean;
  createdAt: string;
}

/** Návrh trestu z dat (nic se neuložilo — vedení ho buď udělí, nebo zahodí). */
export interface NavrhTrestu {
  /** Stabilní klíč (`pozde:<time_entry>`, `manko:<closing>`, `vytka:<item>`); po udělení i zahození se už nenabídne. */
  klic: string;
  druh: DruhNavrhu;
  userId: number;
  userName: string;
  userAvatar: string | null;
  day: string;
  closingId: number | null;
  shiftId: number | null;
  /** Pozdní příchod: o kolik minut. */
  minuty: number | null;
  /** Manko: kolik chybělo (kladné číslo, měna podniku). */
  castka: number | null;
  /** Výtka: poznámka z hodnocení. */
  poznamka: string | null;
}

export interface DataTrestu {
  items: Trest[];
  druhy: DruhTrestu[];
  smi: { udelit: boolean; sazebnik: boolean; tym: boolean };
}

// ---------------------------------------------------------------------------
// Čtení odpovědí API (obranně — widget nesmí spadnout na divném tvaru)
// ---------------------------------------------------------------------------

const cele = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const den = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export function vyberTresty(raw: unknown): Trest[] {
  const pole = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : [];
  const out: Trest[] = [];
  for (const r of pole as Record<string, unknown>[]) {
    const id = cele(r?.id);
    const userId = cele(r?.userId);
    const d = den(r?.day);
    if (!id || !userId || !d) continue;
    out.push({
      id, userId, day: d,
      userName: String(r.userName ?? ''),
      userAvatar: text(r.userAvatar),
      givenBy: cele(r.givenBy),
      givenByName: text(r.givenByName),
      shiftId: cele(r.shiftId),
      closingId: cele(r.closingId),
      taskId: cele(r.taskId),
      typeId: cele(r.typeId),
      typeTitle: text(r.typeTitle),
      text: String(r.text ?? ''),
      photoUrl: text(r.photoUrl),
      points: Math.max(0, cele(r.points) ?? 0),
      bonusCut: Math.max(0, cele(r.bonusCut) ?? 0),
      status: jeStavTrestu(r.status) ? r.status : 'plati',
      source: (ZDROJE_TRESTU as readonly unknown[]).includes(r.source) ? (r.source as ZdrojTrestu) : 'rucne',
      sourceKey: text(r.sourceKey),
      seenAt: text(r.seenAt),
      response: text(r.response),
      responseAt: text(r.responseAt),
      disputed: r.disputed === true,
      disputeHandledAt: text(r.disputeHandledAt),
      cancelledBy: cele(r.cancelledBy),
      cancelledByName: text(r.cancelledByName),
      cancelledAt: text(r.cancelledAt),
      cancelNote: text(r.cancelNote),
      createdAt: String(r.createdAt ?? ''),
    });
  }
  return out;
}

export function vyberDruhy(raw: unknown): DruhTrestu[] {
  const pole = Array.isArray(raw) ? raw : Array.isArray((raw as { types?: unknown })?.types) ? (raw as { types: unknown[] }).types : [];
  const out: DruhTrestu[] = [];
  for (const r of pole as Record<string, unknown>[]) {
    const id = cele(r?.id);
    const title = text(r?.title);
    if (!id || !title) continue;
    out.push({
      id, title,
      description: text(r.description),
      points: Math.max(0, cele(r.points) ?? 0),
      bonusCut: cele(r.bonusCut),
      active: r.active !== false,
      createdAt: String(r.createdAt ?? ''),
    });
  }
  return out;
}

export function vyberNavrhy(raw: unknown): NavrhTrestu[] {
  const pole = Array.isArray(raw) ? raw : Array.isArray((raw as { navrhy?: unknown })?.navrhy) ? (raw as { navrhy: unknown[] }).navrhy : [];
  const out: NavrhTrestu[] = [];
  for (const r of pole as Record<string, unknown>[]) {
    const klic = text(r?.klic);
    const userId = cele(r?.userId);
    const d = den(r?.day);
    const druh = r?.druh;
    if (!klic || !userId || !d || (druh !== 'pozde' && druh !== 'manko' && druh !== 'vytka')) continue;
    out.push({
      klic, druh, userId, day: d,
      userName: String(r.userName ?? ''),
      userAvatar: text(r.userAvatar),
      closingId: cele(r.closingId),
      shiftId: cele(r.shiftId),
      minuty: cele(r.minuty),
      castka: cele(r.castka),
      poznamka: text(r.poznamka),
    });
  }
  return out;
}

export function vyberDataTrestu(raw: unknown): DataTrestu {
  const o = (raw ?? {}) as Record<string, unknown>;
  const smi = (o.smi ?? {}) as Record<string, unknown>;
  return {
    items: vyberTresty(o.items),
    druhy: vyberDruhy(o.druhy),
    smi: { udelit: smi.udelit === true, sazebnik: smi.sazebnik === true, tym: smi.tym === true },
  };
}

// ---------------------------------------------------------------------------
// Validace vstupů (server i klient)
// ---------------------------------------------------------------------------

/** Text: oříznutý, jednotné konce řádků; null = prázdné, false = moc dlouhé nebo moc krátké. */
export function normalizujText(raw: unknown, max = MAX_DELKA_TEXTU): string | null | false {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!t) return null;
  if (t.length > max || t.length < MIN_DELKA_TEXTU) return false;
  return t;
}

/** Poznámka (zrušení, popis položky sazebníku): null = žádná, false = moc dlouhá. */
export function normalizujPoznamku(raw: unknown, max = MAX_DELKA_POZNAMKY): string | null | false {
  if (raw == null) return null;
  if (typeof raw !== 'string') return false;
  const t = raw.replace(/\r\n?/g, '\n').trim();
  if (!t) return null;
  if (t.length > max) return false;
  return t;
}

/** Body dolů: celé číslo 0–MAX_BODU (kladně); null = nezadáno; false = nesmysl. */
export function normalizujBody(raw: unknown): number | null | false {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_BODU || Math.round(n) !== n) return false;
  return n;
}

/** Krácení prémie: celé číslo 0–MAX_KRACENI (kladně); null = nezadáno; false = nesmysl. */
export function normalizujKraceni(raw: unknown): number | null | false {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_KRACENI || Math.round(n) !== n) return false;
  return n;
}

/** Posun dne o N dní (čistě na textu RRRR-MM-DD, UTC). */
export function posunDni(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Den trestu: RRRR-MM-DD, ne v budoucnu, nejvýš DNI_ZPETNE zpětně. */
export function platnyDen(raw: unknown, dnes: string): string | null {
  const d = den(raw);
  if (!d || d > dnes || posunDni(dnes, -DNI_ZPETNE) > d) return null;
  return d;
}

const ADRESA_FOTKY = /^\/api\/upload\/[A-Za-z0-9_-]{6,}$|^https:\/\//;
export const platnaFotka = (v: unknown): v is string => typeof v === 'string' && v.length <= 300 && ADRESA_FOTKY.test(v);

const KLIC_NAVRHU = /^(pozde|manko|vytka):\d{1,10}$/;
export const platnyKlicNavrhu = (v: unknown): v is string => typeof v === 'string' && KLIC_NAVRHU.test(v);
export const druhZKlice = (klic: string): DruhNavrhu | null => (platnyKlicNavrhu(klic) ? (klic.split(':')[0] as DruhNavrhu) : null);

/** Vstup trestu po validaci. */
export interface ZapisTrestu {
  userId: number;
  text: string;
  day: string;
  shiftId: number | null;
  closingId: number | null;
  taskId: number | null;
  typeId: number | null;
  photoUrl: string | null;
  points: number;
  bonusCut: number;
  source: ZdrojTrestu;
  sourceKey: string | null;
}

/**
 * Z těla požadavku udělá platný trest, nebo vrátí chybu (klíč hlášky — překládá
 * se v UI i na serveru). Body a krácení bez zadání = 0 (napomenutí).
 */
export function validujTrest(b: Record<string, unknown>, dnes: string): { ok: true; trest: ZapisTrestu } | { ok: false; chyba: string } {
  const id = (v: unknown): number | null => { const n = cele(v); return n != null && n > 0 ? n : null; };
  const userId = id(b.userId);
  if (!userId) return { ok: false, chyba: 'Vyber, koho se trest týká.' };
  const t = normalizujText(b.text);
  if (t === null) return { ok: false, chyba: 'Napiš, co se stalo.' };
  if (t === false) return { ok: false, chyba: 'Text je moc dlouhý (nejvýš 500 znaků) nebo moc krátký.' };
  const d = platnyDen(b.day ?? dnes, dnes);
  if (!d) return { ok: false, chyba: 'Den nesedí — nejvýš 31 dní zpětně a ne do budoucna.' };
  const body = normalizujBody(b.points);
  if (body === false) return { ok: false, chyba: 'Body musí být celé číslo 0–500.' };
  const kraceni = normalizujKraceni(b.bonusCut);
  if (kraceni === false) return { ok: false, chyba: 'Krácení prémie musí být celé číslo (nejvýš 5 000).' };
  const fotka = b.photoUrl == null || b.photoUrl === '' ? null : platnaFotka(b.photoUrl) ? b.photoUrl : false;
  if (fotka === false) return { ok: false, chyba: 'Fotka má neplatnou adresu.' };
  let sourceKey: string | null = null;
  let source: ZdrojTrestu = 'rucne';
  if (b.sourceKey != null && b.sourceKey !== '') {
    if (!platnyKlicNavrhu(b.sourceKey)) return { ok: false, chyba: 'Návrh trestu nesedí.' };
    // Manko trestem není (§ 346b, § 252 ZP): klíč manko:<uzávěrka> se už nepřijme.
    if (druhZKlice(b.sourceKey) === 'manko') return { ok: false, chyba: VETA_MANKO };
    sourceKey = b.sourceKey;
    source = druhZKlice(b.sourceKey) ?? 'rucne';
  }
  return {
    ok: true,
    trest: {
      userId, text: t, day: d,
      shiftId: id(b.shiftId), closingId: id(b.closingId), taskId: id(b.taskId), typeId: id(b.typeId),
      photoUrl: fotka, points: body ?? 0, bonusCut: kraceni ?? 0, source, sourceKey,
    },
  };
}

/** Vstup položky sazebníku po validaci. */
export interface ZapisDruhu {
  title: string;
  description: string | null;
  points: number;
  bonusCut: number | null;
  active: boolean;
}

export function validujDruh(b: Record<string, unknown>): { ok: true; druh: ZapisDruhu } | { ok: false; chyba: string } {
  const nazev = typeof b.title === 'string' ? b.title.trim() : '';
  if (!nazev) return { ok: false, chyba: 'Napiš název prohřešku.' };
  if (nazev.length > MAX_DELKA_NAZVU) return { ok: false, chyba: 'Název je moc dlouhý (nejvýš 80 znaků).' };
  const popis = normalizujPoznamku(b.description);
  if (popis === false) return { ok: false, chyba: 'Popis je moc dlouhý (nejvýš 300 znaků).' };
  const body = normalizujBody(b.points);
  if (body === false) return { ok: false, chyba: 'Body musí být celé číslo 0–500.' };
  const kraceni = normalizujKraceni(b.bonusCut);
  if (kraceni === false) return { ok: false, chyba: 'Krácení prémie musí být celé číslo (nejvýš 5 000).' };
  return { ok: true, druh: { title: nazev, description: popis, points: body ?? 0, bonusCut: kraceni || null, active: b.active !== false } };
}

// ---------------------------------------------------------------------------
// Pravidla
// ---------------------------------------------------------------------------

/**
 * Kolik jde ještě krátit z prémie za měsíc: nenárokové prémie za měsíc (kladné úpravy
 * se source 'premie') minus to, co už tresty ten měsíc krátily (bez právě upravovaného
 * trestu). Nikdy záporně.
 */
export function stropKraceni(premieMesice: number, uzKraceno: number): number {
  return Math.max(0, Math.round((Number(premieMesice) || 0) - (Number(uzKraceno) || 0)));
}

/** Napomenutí = trest bez bodů i krácení. */
export const jeNapomenuti = (t: Pick<Trest, 'points' | 'bonusCut'>): boolean => !t.points && !t.bonusCut;

/** Platí trest (počítá se do bodů a výplaty)? */
export const platiTrest = (t: Pick<Trest, 'status'>): boolean => t.status === 'plati';

/** Čeká vyjádření „nesouhlasím" na vedení? */
export const cekaSpor = (t: Pick<Trest, 'status' | 'disputed' | 'disputeHandledAt'>): boolean =>
  t.status === 'plati' && t.disputed && !t.disputeHandledAt;

/** Člověk trest ještě nepotvrdil („Beru na vědomí")? */
export const nepotvrzeny = (t: Pick<Trest, 'status' | 'seenAt'>): boolean => t.status === 'plati' && !t.seenAt;

export interface SouhrnTrestu {
  /** Platných trestů (včetně napomenutí). */
  pocet: number;
  napomenuti: number;
  body: number;
  kraceni: number;
  nepotvrzenych: number;
  sporu: number;
  zrusenych: number;
}

/** Souhrn za měsíc (RRRR-MM), nebo za všechno, když měsíc chybí. */
export function souhrnTrestu(items: readonly Trest[], mesic?: string): SouhrnTrestu {
  const s: SouhrnTrestu = { pocet: 0, napomenuti: 0, body: 0, kraceni: 0, nepotvrzenych: 0, sporu: 0, zrusenych: 0 };
  for (const t of items) {
    if (mesic && !t.day.startsWith(mesic)) continue;
    if (t.status === 'zruseno') { s.zrusenych++; continue; }
    s.pocet++;
    if (jeNapomenuti(t)) s.napomenuti++;
    s.body += t.points;
    s.kraceni += t.bonusCut;
    if (!t.seenAt) s.nepotvrzenych++;
    if (cekaSpor(t)) s.sporu++;
  }
  return s;
}

/**
 * Kolikátý platný prohřešek stejného druhu (položky sazebníku) má člověk v měsíci
 * dne `day` — „3. pozdní příchod tento měsíc". Bez položky sazebníku null.
 */
export function poradiOpakovani(items: readonly Trest[], o: { userId: number; typeId: number | null; day: string; bezId?: number }): number | null {
  if (!o.typeId) return null;
  const mesic = o.day.slice(0, 7);
  const pred = items.filter(t => t.id !== o.bezId && t.userId === o.userId && t.typeId === o.typeId && t.status === 'plati' && t.day.startsWith(mesic)).length;
  return pred + 1;
}

/** Řazení: sporné, pak nepotvrzené, pak nejnovější; zrušené na konec. */
export function seradTresty(items: readonly Trest[]): Trest[] {
  const vaha = (t: Trest) => (t.status === 'zruseno' ? 3 : cekaSpor(t) ? 0 : !t.seenAt ? 1 : 2);
  return [...items].sort((a, b) => vaha(a) - vaha(b) || b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));
}

/** Tresty k uzávěrce: s closingId, nebo téhož dne u lidí z té směny. */
export function trestyKUzaverce(items: readonly Trest[], uzaverka: { id: number; day: string; lide: readonly number[] }): Trest[] {
  return items.filter(t => t.closingId === uzaverka.id || (t.closingId == null && t.day === uzaverka.day && uzaverka.lide.includes(t.userId)));
}

/** Chip stavu (text je klíč k překladu). */
export function stavTrestu(t: Pick<Trest, 'status' | 'seenAt' | 'disputed' | 'disputeHandledAt' | 'points' | 'bonusCut'>): { tone: 'wait' | 'ok' | 'bad' | 'muted'; text: string } {
  if (t.status === 'zruseno') return { tone: 'muted', text: 'Zrušeno' };
  if (cekaSpor(t)) return { tone: 'wait', text: 'Nesouhlasí' };
  if (!t.seenAt) return { tone: 'bad', text: 'Nepotvrzeno' };
  return { tone: 'muted', text: 'Vzato na vědomí' };
}

/** Trest do věty: body dolů a krácení prémie, nebo „Napomenutí" (měna přes formátovač podniku). */
export function trestText(t: Pick<Trest, 'points' | 'bonusCut'>, kc: (n: number) => string): string {
  const casti: string[] = [];
  if (t.points) casti.push(`−${t.points} b`);
  if (t.bonusCut) casti.push(`krácení ${kc(t.bonusCut)}`);
  return casti.length ? casti.join(' · ') : 'Napomenutí';
}

/** Výchozí text trestu z návrhu (vedení ho může přepsat). */
type PrelozText = (klic: string, hodnoty?: Record<string, string | number>) => string;
/** Bez `t` (testy, server) česky: jen dosadí {parametry}. */
const cesky: PrelozText = (klic, hodnoty) => klic.replace(/\{(\w+)\}/g, (_, k: string) => String(hodnoty?.[k] ?? ''));

/** Předvyplněný text trestu z návrhu. V okně vždy s `t`: text se uloží a člověk ho čte v jazyce, ve kterém ho vedení zadalo. */
export function textNavrhu(n: Pick<NavrhTrestu, 'druh' | 'minuty' | 'castka' | 'poznamka'>, kc: (n: number) => string, t: PrelozText = cesky): string {
  if (n.druh === 'pozde') return t('Pozdní příchod o {minuty} min.', { minuty: n.minuty ?? 0 });
  if (n.druh === 'manko') return t('Manko v uzávěrce {castka}.', { castka: kc(n.castka ?? 0) });
  return n.poznamka ? t('Výtka z hodnocení směny: {poznamka}', { poznamka: n.poznamka }) : t('Výtka z hodnocení směny.');
}

/** Položka sazebníku, která návrhu nejspíš odpovídá (podle názvu); jinak null. */
export function druhProNavrh(druhy: readonly DruhTrestu[], druh: DruhNavrhu): DruhTrestu | null {
  const vzor = druh === 'pozde' ? /pozd/i : druh === 'manko' ? /manko|kas/i : /výtk|vytk|hodnocen/i;
  return druhy.find(d => d.active && vzor.test(d.title)) ?? null;
}

// ---------------------------------------------------------------------------
// Adresy, události, oznámení
// ---------------------------------------------------------------------------

export const URL_TRESTY = '/api/tresty';
export const URL_DRUHY_TRESTU = '/api/tresty/types';
export const URL_NAVRHY_TRESTU = '/api/tresty/navrhy';
/** Událost okna po každé změně trestů — widgety a seznamy se přenačtou. */
export const UDALOST_TRESTY = 'tresty:zmena';

export interface FiltrTrestu {
  scope?: 'mine' | 'team';
  status?: StavTrestu;
  month?: string;
  userId?: number;
  day?: string;
  closingId?: number;
  shiftId?: number;
}

export function urlTresty(f: FiltrTrestu = {}): string {
  const q = new URLSearchParams();
  if (f.scope === 'team') q.set('scope', 'team');
  if (f.status) q.set('status', f.status);
  if (f.month) q.set('month', f.month);
  if (f.userId) q.set('userId', String(f.userId));
  if (f.day) q.set('day', f.day);
  if (f.closingId) q.set('closingId', String(f.closingId));
  if (f.shiftId) q.set('shiftId', String(f.shiftId));
  const s = q.toString();
  return s ? `${URL_TRESTY}?${s}` : URL_TRESTY;
}

export function oznameniTrest(t: Pick<Trest, 'points' | 'bonusCut' | 'text'>, kc: (n: number) => string): { title: string; body: string } {
  return { title: jeNapomenuti(t) ? 'Napomenutí' : `Trest: ${trestText(t, kc)}`, body: t.text.slice(0, 140) };
}

export function oznameniZruseni(t: Pick<Trest, 'text' | 'cancelNote'>): { title: string; body: string } {
  return { title: 'Trest zrušen', body: (t.cancelNote || t.text).slice(0, 140) };
}

export function oznameniVyjadreni(jmeno: string, nesouhlas: boolean, vyjadreni: string): { title: string; body: string } {
  return { title: nesouhlas ? `${jmeno} nesouhlasí s trestem` : `${jmeno} se vyjádřil(a) k trestu`, body: vyjadreni.slice(0, 140) };
}
