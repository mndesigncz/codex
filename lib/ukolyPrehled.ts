// Úkoly, plánování a nápady — čistá logika pro widgety a nástroje (kolo 69, balík B6a).
//
// Proč zvlášť: tentýž výpočet („co je po termínu", „kolik má kdo aktivních",
// „co se dnes splnilo", počty karet ve sloupcích) kreslí widget na ploše
// a nástroj stránky pod ním. Kdyby si ho každý počítal sám, rozjelo by se
// třeba to, jestli úkol s dnešním termínem je „po termínu" (není), a číslo
// ve widgetu by nesedělo se sekcí seznamu. Soubor je bez Reactu, ať ho
// `npm test` pustí přímo v Node (scripts/testy/k69-b6a.ts).

import { pragueDaySafe, dayPlus, parseDbTime } from './pragueTime.ts';

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
  /** Kolo 7: „do 14:00" — HH:MM uvnitř dne termínu, nebo null (stačí den). Bez dne nikdy. */
  dueTime?: string | null;
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
  /** ISO čas založení úkolu (starší odpovědi ho nemají). */
  createdAt: string | null;
  recurrence: string | null;
  seriesId: string | null;
  checklist: PolozkaChecklistu[];
  source: string | null;
  sourceMeta: { guideId?: number | null; guideTitle?: string | null } | null;
  /** Dokud není hotový, zamyká uzávěrku dne (jen výskyt s termínem ten den). */
  requireBeforeClosing?: boolean;
  /** Kolo 7: splní se jen s fotkou (server vymáhá — widget ani tablet to neobejdou). */
  requirePhoto?: boolean;
  /** Kolo 7: fotka ze splnění (`/api/upload/<id>`), nebo null. Po vrácení mezi nehotové zůstává. */
  completionPhoto?: string | null;
}

const den = (v: unknown): string | null => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : null);
/** Čas termínu „HH:MM" (00:00–23:59). Jiný tvar je chyba vstupu, ne čas. */
export const CAS_TERMINU = /^([01]\d|2[0-3]):[0-5]\d$/;
/** HH:MM, nebo null — cokoli jiného (i „14:00:00" ze starého zápisu oříznuté na minuty projde). */
export const casNeboNull = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().slice(0, 5) : '';
  return CAS_TERMINU.test(s) ? s : null;
};
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
    // Čas bez dne nemá smysl (do 14:00 kterého dne?) — zahodí se.
    dueTime: den(t?.dueDate) ? casNeboNull(t?.dueTime) : null,
    assignedTo: cisloNeboNull(t?.assignedTo),
    createdBy: cisloNeboNull(t?.createdBy),
    teamTask: t?.assignedTo == null,
    assigneeName: t?.assigneeName ?? null,
    assigneeAvatar: t?.assigneeAvatar ?? null,
    completedBy: cisloNeboNull(t?.completedBy),
    completedByName: t?.completedByName ?? null,
    completedAt: t?.completedAt ? String(t.completedAt) : null,
    createdAt: t?.createdAt ? String(t.createdAt) : null,
    recurrence: t?.recurrence ?? null,
    seriesId: t?.seriesId ?? null,
    checklist: Array.isArray(t?.checklist)
      ? t.checklist.map((i: any) => ({ text: String(i?.text ?? ''), done: !!i?.done })).filter((i: PolozkaChecklistu) => i.text)
      : [],
    source: t?.source ?? null,
    sourceMeta: t?.sourceMeta && typeof t.sourceMeta === 'object' ? t.sourceMeta : null,
    // Bez tohohle by klient příznak zahodil a štítek „Před uzávěrkou" by nikde nesvítil.
    requireBeforeClosing: t?.requireBeforeClosing === true,
    requirePhoto: t?.requirePhoto === true,
    // Jen vlastní adresa nahraného souboru — cizí URL by obrázek načetla odjinud.
    completionPhoto: platnaFotka(t?.completionPhoto) ? t.completionPhoto : null,
  })).filter(t => Number.isFinite(t.id));
}

export const jeHotovy = (t: Pick<Ukol, 'status'>) => t.status === 'done';

// ---------------------------------------------------------------------------
// Stav úkolu při zápisu (kolo 7, R7-4): Čeká → Probíhá → Hotovo jedním slovníkem
// pro vedení, zaměstnance, widget i tablet (dřív „Probíhá" uměl jen zaměstnanec).
// ---------------------------------------------------------------------------

/** Stavy, které jde poslat v PATCH /api/tasks `status` — nic jiného server nezapíše. */
export const STAVY_ZAPISU = ['pending', 'in_progress', 'done'] as const;
export type StavZapisu = typeof STAVY_ZAPISU[number];
export const jeStavZapisu = (v: unknown): v is StavZapisu => (STAVY_ZAPISU as readonly unknown[]).includes(v);

/**
 * Co se zapíše po klepnutí na zaškrtávátko. Odškrtnutí = hotovo; zrušení
 * odškrtnutí vrátí úkol tam, kde byl předtím — rozpracovaný zůstane
 * „Probíhá", ne „Čeká" (jinak by omylem odškrtnutý úkol ztratil, že na něm
 * někdo dělá).
 */
export function stavPoOdskrtnuti(hotovo: boolean, predtim?: string | null): StavZapisu {
  if (hotovo) return 'done';
  return predtim === 'in_progress' ? 'in_progress' : 'pending';
}

// ---------------------------------------------------------------------------
// Čas termínu a výskyty série (kolo 7, R7-4) — sdílí API, formulář a testy
// ---------------------------------------------------------------------------

export type VysledekCasu = { ok: true; cas: string | null } | { ok: false; chyba: string };

/**
 * Čas termínu ze vstupu (POST/PATCH /api/tasks). Prázdno = bez času. Čas jde
 * jen s dnem: „do 14:00" bez data by nikdo nevěděl kterého dne.
 */
export function validujCasTerminu(vstup: unknown, maDen: boolean): VysledekCasu {
  if (vstup == null || vstup === '') return { ok: true, cas: null };
  const cas = typeof vstup === 'string' && CAS_TERMINU.test(vstup.trim()) ? vstup.trim() : null;
  if (!cas) return { ok: false, chyba: 'Čas termínu zadej jako HH:MM (např. 14:00).' };
  if (!maDen) return { ok: false, chyba: 'Čas termínu jde zadat jen s dnem.' };
  return { ok: true, cas };
}

/** Řádek úkolu z databáze — jen sloupce, které se přenáší do dalších výskytů série. */
export interface VzorVyskytu { due_time?: unknown; require_photo?: unknown; completion_photo?: unknown }
export interface DoplnkyVyskytu { due_time: string | null; require_photo: boolean }

/**
 * Co nový výskyt opakovaného úkolu převezme ze vzoru (posledního výskytu).
 * Kolo 7: čas termínu — jinak by „každý den do 10:00" měl čas jen první den —
 * a „splní se jen s fotkou". Fotka ze splnění (completion_photo) se NEpřenáší:
 * patří jednomu dni, zítřejší úklid potřebuje vlastní.
 */
export function doplnkyVyskytu(vzor: VzorVyskytu | null | undefined): DoplnkyVyskytu {
  return { due_time: casNeboNull(vzor?.due_time), require_photo: vzor?.require_photo === true };
}

// ---------------------------------------------------------------------------
// Fotka jako důkaz splnění (kolo 7, R7-4)
// ---------------------------------------------------------------------------

/** Adresa nahraného souboru z POST /api/upload — nic jiného se jako fotka neuloží. */
export const ADRESA_FOTKY = /^\/api\/upload\/[A-Za-z0-9_-]+$/;
export const platnaFotka = (v: unknown): v is string => typeof v === 'string' && ADRESA_FOTKY.test(v);

/** Klepnutí na „hotovo" musí napřed otevřít okno Přilož fotku (úkol ji chce a ještě žádnou nemá). */
export const chceFotku = (u: Pick<Ukol, 'requirePhoto' | 'completionPhoto'>) => u.requirePhoto === true && !u.completionPhoto;

export type VysledekDukazu = { ok: true; foto: string | null } | { ok: false; chyba: string };

/**
 * Serverová brána PATCH status: úkol s require_photo se bez fotky nesplní —
 * ani z widgetu, ani z tabletu (UI jen otevře okno, vymáhá to tahle funkce).
 * Uložená fotka z dřívějška stačí (vrácení mezi nehotové ji nemaže).
 */
export function validujDukaz({ pozadovana, ulozena, vstup, hotovo }: { pozadovana: boolean; ulozena: unknown; vstup: unknown; hotovo: boolean }): VysledekDukazu {
  const poslana = vstup == null || vstup === '' ? null : vstup;
  if (poslana != null && !platnaFotka(poslana)) return { ok: false, chyba: 'Fotka není platná — nahraj ji prosím znovu.' };
  if (hotovo && pozadovana && poslana == null && !platnaFotka(ulozena)) return { ok: false, chyba: 'U tohoto úkolu je potřeba fotka.' };
  return { ok: true, foto: hotovo ? poslana : null };
}

/** Tělo push oznámení o novém úkolu: „Objednat pečivo · dnes do 10:00". Bez času jen název. */
export function textOznameniUkolu(nazev: string, termin: string | null, cas: string | null, dnes: string): string {
  if (!cas || !termin) return nazev;
  if (termin === dnes) return `${nazev} · dnes do ${cas}`;
  if (termin === dayPlus(dnes, 1)) return `${nazev} · zítra do ${cas}`;
  return `${nazev} · ${Number(termin.slice(8, 10))}. ${Number(termin.slice(5, 7))}. do ${cas}`;
}

/** Po termínu = nedokončený a termín byl včera nebo dřív (dnešní termín ještě platí). */
export const jePoTerminu = (t: Pick<Ukol, 'status' | 'dueDate'>, dnes: string) => !jeHotovy(t) && !!t.dueDate && t.dueDate < dnes;

/** „Čí úkoly" — stejné tři rozsahy jako u Úkolů na dnes. */
export type RozsahUkolu = 'moje' | 'moje_a_volne' | 'tym';

export function vRozsahu(ukoly: readonly Ukol[], rozsah: RozsahUkolu, ja: number | null): Ukol[] {
  if (rozsah === 'tym') return [...ukoly];
  const moje = (t: Ukol) => ja != null && t.assignedTo === ja;
  return ukoly.filter(t => (rozsah === 'moje' ? moje(t) : moje(t) || t.assignedTo == null));
}

/** Uvnitř jednoho dne podle času termínu; úkol bez času patří na konec dne. */
export const podleCasuTerminu = (a: Pick<Ukol, 'dueTime'>, b: Pick<Ukol, 'dueTime'>) =>
  String(a.dueTime ?? '99:99').localeCompare(String(b.dueTime ?? '99:99'));
const podleTerminu = (a: Ukol, b: Ukol) => String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? '')) || podleCasuTerminu(a, b) || a.id - b.id;

/** Povinný úkol na dnešek (zamyká dnešní uzávěrku). */
export const jePovinnyDnes = (t: Pick<Ukol, 'requireBeforeClosing' | 'dueDate' | 'status'>, dnes: string) =>
  t.requireBeforeClosing === true && t.dueDate === dnes && !jeHotovy(t);

/** V sekci „Dnes" jdou povinné úkoly nahoru — dokud nejsou hotové, uzávěrka dne nepůjde odeslat. */
export const povinnePrvni = <T extends Pick<Ukol, 'requireBeforeClosing' | 'dueDate' | 'status'>>(dnes: string) =>
  (a: T, b: T) => Number(jePovinnyDnes(b, dnes)) - Number(jePovinnyDnes(a, dnes));

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
    dnes: nehotove.filter(t => !t.dueDate || t.dueDate === dnes)
      .sort((a, b) => povinnePrvni<Ukol>(dnes)(a, b) || podleTerminu(a, b)),
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
// Formulář úkolu (TaskManager) — kolo 7: sdílený tvar, protože ho jako koncept
// zapisuje i Plánování („Založit úkol z karty"). lib/draft (slouceni) z konceptu
// vezme jen klíče a typy, které tenhle tvar zná — jinak by se nic neobnovilo.
// ---------------------------------------------------------------------------

export function prazdnyFormularUkolu() {
  return {
    title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '', recurrence: '', checklist: [] as PolozkaChecklistu[],
    // „do 14:00" — HH:MM, jen s termínem (pole je bez data zamčené).
    dueTime: '',
    // Komu při zakládání (víc lidí = úkol každému zvlášť); prázdné = kdokoli.
    // Úprava zůstává na jednom člověku (`assignedTo`).
    komu: [] as string[],
    // Úkol zamyká uzávěrku dne, dokud není hotový (tasks.require_before_closing).
    requireBeforeClosing: false,
    // Splní se jen s fotkou (tasks.require_photo) — okno Přilož fotku u odškrtnutí.
    requirePhoto: false,
  };
}
export type FormularUkolu = ReturnType<typeof prazdnyFormularUkolu>;

/** Koncept úkolu z karty Plánování: název a popis karty, zbytek prázdný formulář. */
export function konceptUkoluZKarty(karta: Pick<KartaPlanu, 'title' | 'description'>): FormularUkolu {
  return { ...prazdnyFormularUkolu(), title: karta.title.slice(0, 200), description: karta.description ?? '' };
}

// ---------------------------------------------------------------------------
// Plánování (GET /api/planning → pole karet)
// ---------------------------------------------------------------------------

export interface KartaPlanu {
  id: number; title: string; description: string | null; column: string; position: number;
  /** Kolo 7: kdo kartu založil (GET /api/planning LEFT JOIN users) — null u smazaného autora a staré odpovědi. */
  autor: string | null;
  autorAvatar: string | null;
  /** Kdy karta vznikla (created_at), nebo null. */
  vytvoreno: string | null;
}

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
    autor: c?.author_name ? String(c.author_name) : null,
    autorAvatar: c?.author_avatar ? String(c.author_avatar) : null,
    vytvoreno: c?.created_at ? String(c.created_at) : null,
  })).filter(c => Number.isFinite(c.id));
}

export type StariKarty =
  | { druh: 'ted' }
  | { druh: 'min' | 'h' | 'den' | 'tyden' | 'mesic' | 'rok'; n: number }
  /** Čas chybí nebo je nečitelný — patka stáří nepíše. */
  | { druh: 'nevim' };

/**
 * Jak dlouho karta leží („před 3 dny", „před 2 týdny") — patka karty v Plánování.
 * Čas z databáze přes parseDbTime (TIMESTAMP bez zóny je UTC). Na rozdíl od
 * relativniCas v lib/poznamky.ts nepřejde po týdnu na datum: u karty je právě
 * stáří ta informace („v Rozpracováno leží dva měsíce"). Budoucí čas (hodiny
 * serveru napřed) je „právě teď".
 */
export function stariKarty(vytvoreno: string | null | undefined, ted: number = Date.now()): StariKarty {
  const d = parseDbTime(vytvoreno ?? null);
  if (!d) return { druh: 'nevim' };
  const min = Math.floor((ted - d.getTime()) / 60000);
  if (min < 1) return { druh: 'ted' };
  if (min < 60) return { druh: 'min', n: min };
  const h = Math.floor(min / 60);
  if (h < 24) return { druh: 'h', n: h };
  const dny = Math.floor(h / 24);
  if (dny < 14) return { druh: 'den', n: dny };
  if (dny < 60) return { druh: 'tyden', n: Math.floor(dny / 7) };
  if (dny < 365) return { druh: 'mesic', n: Math.floor(dny / 30) };
  return { druh: 'rok', n: Math.floor(dny / 365) };
}

/** Křestní jméno do úzké patky karty („Eva" z „Eva Testová"). */
export const krestniJmeno = (jmeno: string | null | undefined): string => String(jmeno ?? '').trim().split(/\s+/)[0] ?? '';

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
