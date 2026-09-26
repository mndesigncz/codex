// Úkoly, plánování a nápady — čistá logika pro widgety a nástroje (kolo 69, balík B6a).
//
// Proč zvlášť: tentýž výpočet („co je po termínu", „kolik má kdo aktivních",
// „co se dnes splnilo", počty karet ve sloupcích) kreslí widget na ploše
// a nástroj stránky pod ním. Kdyby si ho každý počítal sám, rozjelo by se
// třeba to, jestli úkol s dnešním termínem je „po termínu" (není), a číslo
// ve widgetu by nesedělo se sekcí seznamu. Soubor je bez Reactu, ať ho
// `npm test` pustí přímo v Node (scripts/testy/k69-b6a.ts).

import { pragueDaySafe } from './pragueTime.ts';

// ---------------------------------------------------------------------------
// Úkoly (GET /api/tasks → pole ve tvaru shape() z app/api/tasks/route.ts)
// ---------------------------------------------------------------------------

export interface PolozkaChecklistu { text: string; done: boolean }

export interface Ukol {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  /** YYYY-MM-DD, nebo null (úkol bez termínu). */
  dueDate: string | null;
  assignedTo: number | null;
  createdBy: number | null;
  /** Úkol pro kohokoli (bez přiřazení). */
  teamTask: boolean;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  completedBy: number | null;
  completedByName: string | null;
  /** ISO čas splnění; null u nesplněných a u starých řádků z doby před sloupcem. */
  completedAt: string | null;
  recurrence: string | null;
  seriesId: string | null;
  checklist: PolozkaChecklistu[];
  source: string | null;
  sourceMeta: { guideId?: number | null; guideTitle?: string | null } | null;
}

const den = (v: unknown): string | null => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : null);
const cisloNeboNull = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Výběr z /api/tasks. Nečekaný tvar (objekt s chybou, HTML) je chyba widgetu,
 * ne prázdný seznam — jinak by výpadek vypadal jako „nic po termínu".
 */
export function vyberUkoly(raw: unknown): Ukol[] {
  if (!Array.isArray(raw)) throw new Error('Úkoly přišly v nečekaném tvaru.');
  return raw.map((t: any) => ({
    id: Number(t?.id),
    title: String(t?.title ?? ''),
    description: t?.description ? String(t.description) : null,
    status: String(t?.status ?? 'pending'),
    priority: String(t?.priority ?? 'medium'),
    dueDate: den(t?.dueDate),
    assignedTo: cisloNeboNull(t?.assignedTo),
    createdBy: cisloNeboNull(t?.createdBy),
    teamTask: t?.assignedTo == null,
    assigneeName: t?.assigneeName ?? null,
    assigneeAvatar: t?.assigneeAvatar ?? null,
    completedBy: cisloNeboNull(t?.completedBy),
    completedByName: t?.completedByName ?? null,
    completedAt: t?.completedAt ? String(t.completedAt) : null,
    recurrence: t?.recurrence ?? null,
    seriesId: t?.seriesId ?? null,
    checklist: Array.isArray(t?.checklist)
      ? t.checklist.map((i: any) => ({ text: String(i?.text ?? ''), done: !!i?.done })).filter((i: PolozkaChecklistu) => i.text)
      : [],
    source: t?.source ?? null,
    sourceMeta: t?.sourceMeta && typeof t.sourceMeta === 'object' ? t.sourceMeta : null,
  })).filter(t => Number.isFinite(t.id));
}

export const jeHotovy = (t: Pick<Ukol, 'status'>) => t.status === 'done';

/** Po termínu = nedokončený a termín byl včera nebo dřív (dnešní termín ještě platí). */
export const jePoTerminu = (t: Pick<Ukol, 'status' | 'dueDate'>, dnes: string) => !jeHotovy(t) && !!t.dueDate && t.dueDate < dnes;

/** „Čí úkoly" — stejné tři rozsahy jako u Úkolů na dnes. */
export type RozsahUkolu = 'moje' | 'moje_a_volne' | 'tym';

export function vRozsahu(ukoly: readonly Ukol[], rozsah: RozsahUkolu, ja: number | null): Ukol[] {
  if (rozsah === 'tym') return [...ukoly];
  const moje = (t: Ukol) => ja != null && t.assignedTo === ja;
  return ukoly.filter(t => (rozsah === 'moje' ? moje(t) : moje(t) || t.assignedTo == null));
}

const podleTerminu = (a: Ukol, b: Ukol) => String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? '')) || a.id - b.id;

/** Nedokončené úkoly po termínu, nejstarší termín první. */
export function poTerminu(ukoly: readonly Ukol[], dnes: string): Ukol[] {
  return ukoly.filter(t => jePoTerminu(t, dnes)).sort(podleTerminu);
}

/**
 * Rozdělení seznamu po dnech — sekce nástroje Úkolů (vedení i zaměstnanec).
 * Budoucí výskyty opakovaných úkolů (server jich drží pět dopředu) patří do
 * „Tento týden" a „Později", ne mezi dnešní.
 */
export function rozdelPoDnech(ukoly: readonly Ukol[], dnes: string, zaTyden: string, hotovychNejvys = 30) {
  const nehotove = ukoly.filter(t => !jeHotovy(t));
  const budouci = nehotove.filter(t => t.dueDate && t.dueDate > dnes).sort(podleTerminu);
  return {
    poTerminu: nehotove.filter(t => t.dueDate && t.dueDate < dnes).sort(podleTerminu),
    dnes: nehotove.filter(t => !t.dueDate || t.dueDate === dnes).sort(podleTerminu),
    tentoTyden: budouci.filter(t => t.dueDate! <= zaTyden),
    pozdeji: budouci.filter(t => t.dueDate! > zaTyden),
    hotove: ukoly.filter(jeHotovy).sort((a, b) => podleTerminu(b, a)).slice(0, hotovychNejvys),
  };
}

export interface RadekClovek {
  /** null = úkoly pro kohokoli. */
  id: number | null;
  jmeno: string;
  avatar: string | null;
  /** Nedokončené s termínem do dneška nebo bez termínu — co na člověku leží teď. */
  aktivni: number;
  poTerminu: number;
}

/**
 * Kolik má kdo aktivních a po termínu úkolů. Budoucí výskyty opakovaných
 * úkolů se nepočítají: každá denní série jich má pět dopředu a člověk
 * s jedním denním úkolem by vypadal, že jich má šest.
 * Pořadí: nejdřív kdo má něco po termínu, pak podle počtu aktivních.
 */
export function podleLidi(ukoly: readonly Ukol[], dnes: string): RadekClovek[] {
  const m = new Map<string, RadekClovek>();
  for (const t of ukoly) {
    if (jeHotovy(t) || (t.dueDate && t.dueDate > dnes)) continue;
    const klic = t.assignedTo == null ? 'volne' : String(t.assignedTo);
    const r = m.get(klic) ?? {
      id: t.assignedTo,
      jmeno: t.assignedTo == null ? 'Pro kohokoli' : (t.assigneeName ?? 'Bez jména'),
      avatar: t.assignedTo == null ? null : t.assigneeAvatar,
      aktivni: 0, poTerminu: 0,
    };
    r.aktivni++;
    if (jePoTerminu(t, dnes)) r.poTerminu++;
    m.set(klic, r);
  }
  return [...m.values()].sort((a, b) =>
    // „Pro kohokoli" až za lidmi — widget odpovídá na „kdo má co", ne „co je volné".
    Number(a.id == null) - Number(b.id == null) || b.poTerminu - a.poTerminu || b.aktivni - a.aktivni || a.jmeno.localeCompare(b.jmeno, 'cs'));
}

/**
 * Splněné dnes (pražský den podle completed_at), poslední první. Úkol bez
 * času splnění (stará data) se nepočítá — nevíme, jestli to bylo dnes.
 */
export function splnenoDnes(ukoly: readonly Ukol[], dnes: string): Ukol[] {
  return ukoly
    .filter(t => jeHotovy(t) && t.completedAt && pragueDaySafe(t.completedAt) === dnes)
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
}

/** Týmový úkol (cizí, ne pro kohokoli, ne můj zadaný) — na jeho splnění je potřeba ukoly.plnit. */
export function jeCiziUkol(t: Pick<Ukol, 'assignedTo' | 'createdBy'>, ja: number | null): boolean {
  return t.assignedTo != null && t.assignedTo !== ja && t.createdBy !== ja;
}

// ---------------------------------------------------------------------------
// Plánování (GET /api/planning → pole karet)
// ---------------------------------------------------------------------------

export interface KartaPlanu { id: number; title: string; description: string | null; column: string; position: number }

export const SLOUPCE_PLANU = [
  { id: 'ideas', nazev: 'Nápady' },
  { id: 'in_progress', nazev: 'Rozpracováno' },
  { id: 'review', nazev: 'Ke schválení' },
  { id: 'done', nazev: 'Hotovo' },
] as const;
export type IdSloupce = typeof SLOUPCE_PLANU[number]['id'];

export function vyberKarty(raw: unknown): KartaPlanu[] {
  if (!Array.isArray(raw)) throw new Error('Plánování přišlo v nečekaném tvaru.');
  return raw.map((c: any) => ({
    id: Number(c?.id),
    title: String(c?.title ?? ''),
    description: c?.description ? String(c.description) : null,
    column: String(c?.column ?? 'ideas'),
    position: Number(c?.position) || 0,
  })).filter(c => Number.isFinite(c.id));
}

/** Karty jednoho sloupce v pořadí na tabuli. */
export function kartySloupce(karty: readonly KartaPlanu[], sloupec: string): KartaPlanu[] {
  return karty.filter(c => c.column === sloupec).sort((a, b) => a.position - b.position || a.id - b.id);
}

/**
 * Počty karet ve sloupcích. Karta s neznámým sloupcem (starý import) se
 * počítá do Nápadů — tabule ji tam taky ukáže, jinak by v součtu chyběla.
 */
export function souhrnPlanu(karty: readonly KartaPlanu[]): Record<IdSloupce, number> {
  const out: Record<IdSloupce, number> = { ideas: 0, in_progress: 0, review: 0, done: 0 };
  for (const c of karty) {
    const s = (SLOUPCE_PLANU.some(x => x.id === c.column) ? c.column : 'ideas') as IdSloupce;
    out[s]++;
  }
  return out;
}

/** Sloupec karty na tabuli (neznámý = Nápady, viz souhrnPlanu). */
export const sloupecKarty = (c: Pick<KartaPlanu, 'column'>): IdSloupce =>
  (SLOUPCE_PLANU.some(x => x.id === c.column) ? c.column : 'ideas') as IdSloupce;

// ---------------------------------------------------------------------------
// Nápady (GET /api/suggestions → { suggestions, isEmployer, meId })
// ---------------------------------------------------------------------------

export interface Podnet {
  id: number;
  title: string;
  content: string | null;
  status: string;
  authorId: number | null;
  authorName: string | null;
  authorAvatar: string | null;
  createdAt: string;
  votes: number;
  hasVoted: boolean;
}

export interface DataPodnetu { podnety: Podnet[]; spravuje: boolean; meId: number | null }

export function vyberPodnety(raw: any): DataPodnetu {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.suggestions)) throw new Error('Nápady přišly v nečekaném tvaru.');
  return {
    podnety: raw.suggestions.map((s: any) => ({
      id: Number(s?.id),
      title: String(s?.title ?? ''),
      content: s?.content ? String(s.content) : null,
      status: String(s?.status ?? 'new'),
      authorId: cisloNeboNull(s?.authorId),
      authorName: s?.authorName ?? null,
      authorAvatar: s?.authorAvatar ?? null,
      createdAt: String(s?.createdAt ?? ''),
      votes: Math.max(0, Number(s?.votes) || 0),
      hasVoted: !!s?.hasVoted,
    })).filter((s: Podnet) => Number.isFinite(s.id)),
    spravuje: !!raw.isEmployer,
    meId: typeof raw.meId === 'number' ? raw.meId : null,
  };
}

/** Volba widgetu Nejžádanější nápady (katalog napady.ts). */
export type StavPodnetu = 'nove' | 'naplanovane' | 'vse';
const STAV_API: Record<StavPodnetu, string | null> = { nove: 'new', naplanovane: 'planned', vse: null };

/**
 * Nejvíc hlasů nahoře; při shodě novější. „Vše" znamená živé podněty —
 * hotové a zamítnuté se o hlasy už nepřetahují, tak mezi „nejžádanější" nepatří.
 */
export function nejzadanejsi(podnety: readonly Podnet[], stav: StavPodnetu, kolik = 5): Podnet[] {
  const chci = STAV_API[stav];
  return podnety
    .filter(s => (chci ? s.status === chci : s.status === 'new' || s.status === 'planned'))
    .sort((a, b) => b.votes - a.votes || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, kolik);
}

/** Podněty ve stavu Nový, nejstarší první — čekají nejdéle. */
export function novePodnety(podnety: readonly Podnet[]): Podnet[] {
  return podnety.filter(s => s.status === 'new').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

/** Hlas přepnutý v UI dřív, než odpoví server (a zpět při chybě). */
export function prepniHlas(podnety: readonly Podnet[], id: number): Podnet[] {
  return podnety.map(s => (s.id === id ? { ...s, hasVoted: !s.hasVoted, votes: Math.max(0, s.votes + (s.hasVoted ? -1 : 1)) } : s));
}
