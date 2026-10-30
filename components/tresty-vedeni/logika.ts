// „Tresty" pro vedení (kolo 10, balík V) — čistá logika bez Reactu a bez DB.
//
// Co tu je: filtr seznamu týmu (Platné / Nesouhlasí / Zrušené / Vše, člověk), lidé
// ze seznamu, krokovač bodů v okně Dát trest, měsíc z nastavení widgetu, sloučení
// sporných s měsícem, předvolby okna z návrhu, těla POST a PATCH, výběr pozdního
// příchodu k trestu v Docházce a dohledání klíče výtky v návrzích. Testy:
// scripts/testy/k86-tresty-ved.ts. Soubor se importuje relativně s příponou (běží
// i v Node bez `@/`).
import {
  DNI_NAVRHU, DNI_ZPETNE, MAX_BODU, cekaSpor, druhProNavrh, posunDni, seradTresty, textNavrhu,
  type DruhNavrhu, type DruhTrestu, type NavrhTrestu, type Trest,
} from '../../lib/tresty.ts';

/** Filtr stavu v širokém widgetu. */
export type FiltrTrestu = 'plati' | 'spor' | 'zruseno' | 'vse';
export const FILTRY_TRESTU: readonly FiltrTrestu[] = ['plati', 'spor', 'zruseno', 'vse'];
export const jeFiltrTrestu = (x: unknown): x is FiltrTrestu => typeof x === 'string' && (FILTRY_TRESTU as readonly string[]).includes(x);

/** Klíč sessionStorage a událost, kterými se Odměnám říká „otevři část Tresty" (jako u Navíc). */
export const KLIC_CAST_TRESTY = 'managero-odmeny-tresty';
export const UDALOST_CAST_TRESTY = 'odmeny:tresty';
/** Argument pohledu rewards z oznámení, z fronty a z hledání (`?view=rewards&arg=tresty`). */
export const ARG_TRESTY = 'tresty';

/** Krok bodů v okně Dát trest (tlačítka −/+). */
export const KROK_BODU = 5;

/** Kolik návrhů ukáže střední widget (široký všechny). */
export const NAVRHU_M = 3;

/** Patří trest do filtru? Platné = platí (včetně sporných), Nesouhlasí = spor čeká na vedení. */
export function vyhovujeFiltru(t: Pick<Trest, 'status' | 'disputed' | 'disputeHandledAt'>, f: FiltrTrestu): boolean {
  if (f === 'vse') return true;
  if (f === 'zruseno') return t.status === 'zruseno';
  if (f === 'spor') return cekaSpor(t);
  return t.status === 'plati';
}

/** Tresty podle filtru a člověka; `vse` a `null` = bez filtru. */
export function filtrujTresty(items: readonly Trest[], f: { stav?: FiltrTrestu; clovek?: number | null }): Trest[] {
  return items.filter(t => (!f.stav || vyhovujeFiltru(t, f.stav)) && (f.clovek == null || t.userId === f.clovek));
}

/** Kolik trestů je v každém filtru (počty do přepínače). */
export function poctyFiltru(items: readonly Trest[]): Record<FiltrTrestu, number> {
  const p: Record<FiltrTrestu, number> = { plati: 0, spor: 0, zruseno: 0, vse: items.length };
  for (const t of items) {
    if (t.status === 'zruseno') p.zruseno++;
    else p.plati++;
    if (cekaSpor(t)) p.spor++;
  }
  return p;
}

/** Lidé, kteří mají v seznamu trest — pro výběr „Člověk" (podle jména, každý jednou). */
export function lideZTrestu(items: readonly Trest[]): { id: number; jmeno: string; avatar: string | null }[] {
  const mapa = new Map<number, { id: number; jmeno: string; avatar: string | null }>();
  for (const t of items) if (!mapa.has(t.userId)) mapa.set(t.userId, { id: t.userId, jmeno: t.userName, avatar: t.userAvatar });
  return [...mapa.values()].sort((a, b) => a.jmeno.localeCompare(b.jmeno, 'cs'));
}

/** Krok bodů: ±5 od aktuální hodnoty, v mezích 0–MAX_BODU; nečíslo se bere jako 0. */
export function krokBodu(aktualni: unknown, smer: 1 | -1): number {
  const n = Number(aktualni);
  const z = Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(MAX_BODU, z + smer * KROK_BODU));
}

/** Měsíc RRRR-MM z nastavení widgetu (`obdobi`: tento / minuly) vůči dnešku. */
export function mesicZNastaveni(obdobi: unknown, dnes: string): string {
  const tento = dnes.slice(0, 7);
  if (obdobi !== 'minuly') return tento;
  const [y, m] = tento.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * Seznam widgetu: tresty vybraného měsíce a k nim VŠECHNY sporné (i ze starších dnů —
 * nesouhlas z 30. 9. nesmí v říjnu zmizet jen proto, že se dívá na „tento měsíc").
 * Každý trest jednou, sporné první (seradTresty).
 */
export function sloucSporne(mesicni: readonly Trest[], platne: readonly Trest[]): Trest[] {
  const mapa = new Map<number, Trest>();
  for (const t of platne) if (cekaSpor(t)) mapa.set(t.id, t);
  for (const t of mesicni) if (!mapa.has(t.id)) mapa.set(t.id, t);
  return seradTresty([...mapa.values()]);
}

/** Předvolby okna Dát trest (props `predvolby`). */
export interface PredvolbyTrestu {
  userId?: number;
  /** Jméno člověka, když je předvybraný (podtitulek okna; bez něj se vybírá z týmu). */
  jmeno?: string;
  day?: string;
  shiftId?: number | null;
  closingId?: number | null;
  taskId?: number | null;
  text?: string;
  typeId?: number | null;
  sourceKey?: string | null;
  points?: number;
  bonusCut?: number;
  /**
   * Druh návrhu (manko z uzávěrky, výtka z hodnocení, pozdní příchod z Docházky): okno samo vybere
   * odpovídající položku sazebníku (druhProNavrh), až se sazebník načte — jen když položka ani body
   * nejsou zadané předem.
   */
  druhNavrhu?: DruhNavrhu;
}

/** Předvolby z návrhu: text z dat, položka sazebníku podle druhu (body a krácení z ní), klíč návrhu. */
export function predvolbyZNavrhu(n: NavrhTrestu, druhy: readonly DruhTrestu[], kc: (x: number) => string, t?: Parameters<typeof textNavrhu>[2]): PredvolbyTrestu {
  const druh = druhProNavrh(druhy, n.druh);
  return {
    userId: n.userId, jmeno: n.userName, day: n.day, shiftId: n.shiftId, closingId: n.closingId,
    text: textNavrhu(n, kc, t), typeId: druh?.id ?? null, sourceKey: n.klic,
    points: druh?.points ?? 0, bonusCut: druh?.bonusCut ?? 0,
  };
}

/** Stav formuláře okna Dát trest (hodnoty polí jako text, jak je drží inputy). */
export interface FormularTrestu {
  userId: string;
  text: string;
  day: string;
  typeId: number | null;
  points: string;
  bonusCut: string;
  photoUrl: string | null;
}

const cislo = (v: string): number => (v === '' ? 0 : Number(v));

/** Tělo POST /api/tresty: body a krácení vždy čísla (0 = nic), vazby z předvoleb, klíč návrhu jen s hodnotou. */
export function teloTrestu(f: FormularTrestu, p: PredvolbyTrestu = {}): Record<string, unknown> {
  return {
    userId: Number(f.userId) || null,
    text: f.text,
    day: f.day,
    typeId: f.typeId,
    points: cislo(f.points),
    bonusCut: cislo(f.bonusCut),
    ...(f.photoUrl ? { photoUrl: f.photoUrl } : {}),
    ...(p.shiftId ? { shiftId: p.shiftId } : {}),
    ...(p.closingId ? { closingId: p.closingId } : {}),
    ...(p.taskId ? { taskId: p.taskId } : {}),
    ...(p.sourceKey ? { sourceKey: p.sourceKey } : {}),
  };
}

/** Tělo PATCH úpravy: jen to, co se proti původnímu trestu změnilo (prázdné = není co uložit). */
export function teloUpravy(f: FormularTrestu, puvodni: Trest): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.text.trim() !== puvodni.text) out.text = f.text;
  if (f.day !== puvodni.day) out.day = f.day;
  if (f.typeId !== puvodni.typeId) out.typeId = f.typeId;
  if (cislo(f.points) !== puvodni.points) out.points = cislo(f.points);
  if (cislo(f.bonusCut) !== puvodni.bonusCut) out.bonusCut = cislo(f.bonusCut);
  if ((f.photoUrl ?? null) !== puvodni.photoUrl) out.photoUrl = f.photoUrl;
  return out;
}

/** Změní úprava dopad (body, krácení, den)? Pak člověk trest potvrzuje znovu — okno to řekne předem. */
export const meniDopad = (telo: Record<string, unknown>): boolean => 'points' in telo || 'bonusCut' in telo || 'day' in telo;

/** Krácení v mezích stropu (ze serveru)? Nezadané = 0; strop null = ještě nevíme (nepovolit nic nad 0 nehlídáme). */
export function kraceniVMezich(bonusCut: string, strop: number | null): boolean {
  const n = cislo(bonusCut);
  if (!Number.isInteger(n) || n < 0) return false;
  return strop == null || n <= strop;
}

/** Text chipu sazebníku vybraný chipem: přepsat jde jen prázdný text, nebo název jiné položky. */
export function predvyplnitText(text: string, druhy: readonly Pick<DruhTrestu, 'title'>[]): boolean {
  const t = text.trim();
  return !t || druhy.some(d => d.title === t);
}

/** Pozdní příchod v Docházce (záznam s odchylkou od plánu). */
export interface PozdniPrichod { id: number | string; userId: number | string; den: string; minuty: number }

/**
 * Který pozdní příchod člověka nabídnout k trestu: nejnovější do DNI_ZPETNE dní, který
 * ještě nikdo nevyřídil. Návrhy (GET /api/tresty/navrhy) nesou nevyřízené klíče za
 * DNI_NAVRHU dní — příchod z té doby, který mezi nimi není, už trest má nebo je
 * zahozený. Bez načtených návrhů (null) se bere nejnovější.
 */
export function pozdniKTrestu(prichody: readonly PozdniPrichod[], userId: number | string, dnes: string, navrhy: ReadonlySet<string> | null): PozdniPrichod | null {
  const od = posunDni(dnes, -DNI_ZPETNE);
  const odNavrhu = posunDni(dnes, -DNI_NAVRHU);
  const kandidati = prichody
    .filter(p => String(p.userId) === String(userId) && p.den >= od && p.den <= dnes)
    .filter(p => !navrhy || p.den < odNavrhu || navrhy.has(`pozde:${p.id}`))
    .sort((a, b) => b.den.localeCompare(a.den));
  return kandidati[0] ?? null;
}

/**
 * Klíč návrhu výtky pro položku hodnocení směny. GET /api/shift-reviews id položky
 * (shift_review_items.id) neposílá, takže se dohledá v návrzích: výtka téhož člověka
 * a dne, při víc kandidátech ta se stejnou poznámkou. Jen jednoznačná shoda — jinak
 * null (trest se pak dá bez klíče a návrh zůstane ve widgetu k zahození).
 */
export function klicVytky(navrhy: readonly NavrhTrestu[], o: { userId: number; day: string; poznamka: string | null }): string | null {
  const kandidati = navrhy.filter(n => n.druh === 'vytka' && n.userId === o.userId && n.day === o.day);
  if (kandidati.length === 1) return kandidati[0].klic;
  const pozn = (o.poznamka ?? '').trim();
  if (!pozn) return null;
  const shoda = kandidati.filter(n => (n.poznamka ?? '').trim() === pozn);
  return shoda.length === 1 ? shoda[0].klic : null;
}
