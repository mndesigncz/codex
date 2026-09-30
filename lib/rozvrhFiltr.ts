// Filtr plánovače rozvrhu — kdo, jaký typ, jen dny s dírou — a přehled
// „Směny podle lidí" (vytížení).
//
// Proč vlastní modul: Martin chtěl na první pohled vidět, kolik má kdo
// směn. Plánovač (components/scheduling/ScheduleBuilder.tsx) to dřív
// neuměl vůbec a widget „Naplánované hodiny" počítá jen uložené směny —
// po vygenerování návrhu tak ukazoval stav, který po uložení nebude platit.
// Tady se počítá z toho, co plánovač právě kreslí (návrh nebo uložené
// směny), a totéž se dá otestovat bez Reactu (scripts/testy/rozvrh-filtr.ts).
//
// Čistý modul: jen řetězce „RRRR-MM-DD" a „HH:MM", žádné `toISOString()`
// (po 22:00 pražského času by posunulo den).

import { czCount, SMENA, type CzNoun } from './czech.ts';
import { delkaSmeny, minutyZ } from './rozvrhPrehled.ts';
import { preloz } from './i18n/core.ts';

/** Překladač věty (jako `t` z useT); bez něj se píše česky. */
export type PrekladVety = (klic: string, hodnoty?: Record<string, string | number | null | undefined>) => string;
const cesky: PrekladVety = (klic, hodnoty) => preloz({}, 'cs', klic, hodnoty);

// ---------------------------------------------------------------------------
// Stav filtru
// ---------------------------------------------------------------------------

export interface FiltrRozvrhu {
  /** Id vybraných lidí; prázdné = všichni. */
  lide: number[];
  /** Názvy vybraných typů směn (jak je plánovač ukazuje); prázdné = všechny. */
  typy: string[];
  /** Jen dny, kdy v obsazení chybí člověk (díra). */
  jenDiry: boolean;
}

export const PRAZDNY_FILTR: FiltrRozvrhu = { lide: [], typy: [], jenDiry: false };

/**
 * Klíč v localStorage. Filtr je pohodlí jednoho plánovače na jednom
 * zařízení (ne sdílený stav), a URL stránky spravuje EmployerLayout —
 * vlastní parametry by mu při přechodu mezi pohledy zmizely nebo překážely.
 * Jeden záznam pro všechny měsíce: „Eva" platí i po přepnutí na další měsíc.
 *
 * Ale zvlášť pro každého přihlášeného a každý podnik: id lidí i názvy typů
 * platí jen v jednom podniku. Se společným klíčem si vedoucí organizace
 * přenesl „Eva · Ranní" do podniku, kde Eva není, a viděl prázdnou mřížku;
 * stejně tak druhý vedoucí na témž počítači zdědil cizí filtr.
 */
export const KLIC_FILTRU = 'managero-rozvrh-filtr';
export const klicFiltru = (uzivatel: string | number | null | undefined, podnik: number | null | undefined): string =>
  `${KLIC_FILTRU}:${uzivatel ?? 'nekdo'}:${podnik ?? 'bez-podniku'}`;
/** Rozbalení přehledu „Směny podle lidí" a zvolené řazení. */
export const KLIC_PREHLEDU = 'managero-rozvrh-prehled-lidi';

export const jeAktivni = (f: FiltrRozvrhu): boolean => f.lide.length > 0 || f.typy.length > 0 || f.jenDiry;

/**
 * Filtr z localStorage (řetězec JSON) nebo z objektu. Cokoli nečitelného
 * = prázdný filtr: rozbitý záznam nesmí nechat plánovač „prázdný".
 */
export function nactiFiltr(raw: unknown): FiltrRozvrhu {
  let v: any = raw;
  if (typeof raw === 'string') {
    try { v = JSON.parse(raw); } catch { return { ...PRAZDNY_FILTR }; }
  }
  if (!v || typeof v !== 'object') return { ...PRAZDNY_FILTR };
  // Jen čísla a číselné řetězce — `Number(true)` je 1 a z rozbitého
  // záznamu by se stal filtr na člověka s id 1.
  const lide = Array.isArray(v.lide)
    ? [...new Set(v.lide
      .filter((x: unknown) => typeof x === 'number' || (typeof x === 'string' && /^\s*\d+\s*$/.test(x)))
      .map(Number).filter((n: number) => Number.isInteger(n) && n > 0))] as number[]
    : [];
  const typy = Array.isArray(v.typy)
    ? [...new Set(v.typy.filter((t: unknown) => typeof t === 'string' && t.trim() !== '').map((t: string) => t.trim()))] as string[]
    : [];
  return { lide, typy, jenDiry: v.jenDiry === true };
}

/**
 * Vyhodí z filtru lidi, o kterých plánovač už nic neví: nejsou v týmu ani
 * nemají směnu v načteném měsíci (odešli, byli smazáni). Bez toho by id
 * zůstalo ve filtru navždy a pás by ukazoval „Člověk 0" bez jména.
 * Vrací tentýž objekt, když není co vyhodit (žádné zbytečné překreslení).
 */
export function procistiFiltr(f: FiltrRozvrhu, zname: ReadonlySet<number>): FiltrRozvrhu {
  const lide = f.lide.filter(id => zname.has(id));
  return lide.length === f.lide.length ? f : { ...f, lide };
}

/** Přidá, nebo (druhým klikem) odebere hodnotu — pilulky pásu jsou přepínače. */
export function prepni<T>(pole: readonly T[], x: T): T[] {
  return pole.includes(x) ? pole.filter(y => y !== x) : [...pole, x];
}

// ---------------------------------------------------------------------------
// Směny a jejich filtrování
// ---------------------------------------------------------------------------

/** Směna, jak ji plánovač kreslí — uložená i navržená v jednom tvaru. */
export interface SmenaFiltru {
  employeeId: number;
  jmeno?: string | null;
  avatar?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  /** Název typu, jak ho vidí plánovač (Ranní, Odpolední, Vlastní…). */
  typ: string;
}

/** Projde směna filtrem lidí a typů? (Dny s dírou řeší `denProjde`.) */
export function projdeSmena(s: { employeeId: number; typ: string }, f: FiltrRozvrhu): boolean {
  if (f.lide.length > 0 && !f.lide.includes(Number(s.employeeId))) return false;
  if (f.typy.length > 0 && !f.typy.includes(s.typ)) return false;
  return true;
}

/** Den projde „Jen dny s dírou"? Bez toho přepínače projde každý. */
export const denProjde = (maDiru: boolean, f: FiltrRozvrhu): boolean => !f.jenDiry || maDiru;

/**
 * Projde směna „Jen dny s dírou"? `denVidet(datum)` říká, jestli mřížka den
 * ukazuje (má díru, nebo ho plánovač právě opravuje). Bez funkce projde vše.
 */
const denSmenyProjde = (s: { date: string }, f: FiltrRozvrhu, denVidet?: (datum: string) => boolean): boolean =>
  !f.jenDiry || !denVidet || denVidet(s.date);

/**
 * Počty pro pilulky lidí. Počítá se pod filtrem TYPŮ a DNŮ (ne lidí):
 * vybraný typ „Ranní" pak u Evy ukáže, kolik má ranních, „jen dny s dírou"
 * kolik jich má v dnech s dírou — pilulka tak říká totéž co mřížka a lišta.
 * Výběr člověka ale ostatním pilulkám počty na nulu srazit nesmí.
 */
export function pocetPodleLidi(smeny: readonly SmenaFiltru[], f: FiltrRozvrhu, denVidet?: (datum: string) => boolean): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of smeny) {
    if (f.typy.length > 0 && !f.typy.includes(s.typ)) continue;
    if (!denSmenyProjde(s, f, denVidet)) continue;
    const id = Number(s.employeeId);
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

/** Počty pro pilulky typů — pod filtrem LIDÍ (zrcadlo `pocetPodleLidi`). */
export function pocetPodleTypu(smeny: readonly SmenaFiltru[], f: FiltrRozvrhu, denVidet?: (datum: string) => boolean): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of smeny) {
    if (f.lide.length > 0 && !f.lide.includes(Number(s.employeeId))) continue;
    if (!denSmenyProjde(s, f, denVidet)) continue;
    m.set(s.typ, (m.get(s.typ) ?? 0) + 1);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Kdo je v pásu a v přehledu
// ---------------------------------------------------------------------------

export interface ClenFiltru {
  id: number;
  name: string;
  avatar?: string | null;
  /** employee / employer — vedoucí bez směny do přehledu nepatří. */
  role?: string;
}

export interface DostupnostFiltru {
  employeeId: number;
  maxShifts?: number | null;
  /** Dny, kdy nemůže (z formuláře dostupnosti). */
  unavailableDates?: readonly string[] | null;
  /** Den → preference; „off" = ten den nemůže. */
  dayPreferences?: Readonly<Record<string, string>> | null;
}

export interface ClovekPasu {
  id: number;
  jmeno: string;
  /** Krátké jméno na pilulku: křestní, u shody křestních celé. */
  kratce: string;
  avatar: string | null;
  smen: number;
}

/**
 * Kdo patří do filtru: zaměstnanci týmu (i s nulou — „nemá směnu" je
 * informace), vedoucí jen se směnou nebo zadanou dostupností, a každý, kdo
 * má ve vidění směnu, i když v seznamu týmu chybí (náhled bez seznamu
 * týmu, člověk mezitím odešel). Každý jednou — seznam týmu umí vrátit
 * člověka dvakrát (členství + zrcadlo users.team_id).
 */
export function lideFiltru(
  clenove: readonly ClenFiltru[],
  smeny: readonly SmenaFiltru[],
  dostupnost: readonly DostupnostFiltru[] | null = null,
): { id: number; jmeno: string; avatar: string | null }[] {
  const out = new Map<number, { id: number; jmeno: string; avatar: string | null }>();
  const zadali = new Set((dostupnost ?? []).map(d => Number(d.employeeId)));
  const seSmenou = new Set(smeny.map(s => Number(s.employeeId)));
  for (const c of clenove) {
    const id = Number(c.id);
    if (out.has(id)) continue;
    if (c.role && c.role !== 'employee' && !seSmenou.has(id) && !zadali.has(id)) continue;
    out.set(id, { id, jmeno: c.name || 'Bez jména', avatar: c.avatar ?? null });
  }
  for (const s of smeny) {
    const id = Number(s.employeeId);
    if (!out.has(id)) out.set(id, { id, jmeno: s.jmeno || 'Bez jména', avatar: s.avatar ?? null });
  }
  return [...out.values()];
}

/**
 * Krátké jméno na pilulku. Celé jméno na 390 px pás zbytečně natahuje;
 * dvě Evy ale musí jít rozlišit, proto u shody křestních zůstane celé.
 */
export function kratkaJmena(lide: readonly { id: number; jmeno: string }[]): Map<number, string> {
  const krestni = (j: string) => j.trim().split(/\s+/)[0] || j;
  const kolik = new Map<string, number>();
  for (const c of lide) kolik.set(krestni(c.jmeno).toLocaleLowerCase('cs'), (kolik.get(krestni(c.jmeno).toLocaleLowerCase('cs')) ?? 0) + 1);
  return new Map(lide.map(c => [c.id, (kolik.get(krestni(c.jmeno).toLocaleLowerCase('cs')) ?? 0) > 1 ? c.jmeno : krestni(c.jmeno)]));
}

/**
 * Pás lidí: abecedně (česky), ať se dá člověk najít na stejném místě i po
 * úpravě návrhu — řazení podle počtu je v přehledu „Směny podle lidí".
 */
export function lideDoPasu(lide: readonly { id: number; jmeno: string; avatar: string | null }[], pocty: Map<number, number>): ClovekPasu[] {
  const kratce = kratkaJmena(lide);
  return lide
    .map(c => ({ ...c, kratce: kratce.get(c.id) ?? c.jmeno, smen: pocty.get(c.id) ?? 0 }))
    .sort((a, b) => a.jmeno.localeCompare(b.jmeno, 'cs'));
}

export interface TypPasu { nazev: string; barva: string | null; smen: number }

/**
 * Pás typů: nastavené typy v jejich pořadí, za nimi typy, které se ve
 * směnách objevily a nastavené nejsou (Vlastní, smazaný typ). Nastavený typ
 * s nulou zůstává — „Noční: 0" je taky odpověď.
 */
export function typyDoPasu(nastavene: readonly { name: string; color?: string | null }[], pocty: Map<string, number>, vybrane: readonly string[] = []): TypPasu[] {
  const out: TypPasu[] = [];
  const videno = new Set<string>();
  for (const t of nastavene) {
    if (videno.has(t.name)) continue;
    videno.add(t.name);
    out.push({ nazev: t.name, barva: t.color ?? null, smen: pocty.get(t.name) ?? 0 });
  }
  for (const [nazev, n] of pocty) {
    if (videno.has(nazev)) continue;
    videno.add(nazev);
    out.push({ nazev, barva: null, smen: n });
  }
  // Vybraný typ, který v měsíci není ani nastavený (zbyl z jiného měsíce),
  // musí jít odkliknout — jinak by filtr nešel zrušit jinak než celý.
  for (const nazev of vybrane) if (!videno.has(nazev)) { videno.add(nazev); out.push({ nazev, barva: null, smen: 0 }); }
  return out;
}

// ---------------------------------------------------------------------------
// Popis filtru
// ---------------------------------------------------------------------------

const CLOVEK: CzNoun = { one: 'člověk', few: 'lidé', many: 'lidí' };
const TYP: CzNoun = { one: 'typ', few: 'typy', many: 'typů' };
const DALSI: CzNoun = { one: 'další', few: 'další', many: 'dalších' };

/**
 * „Eva Testová · Ranní · jen dny s dírou", „Tereza, Zdeněk · 3 typy",
 * „Tereza a 3 další". Stojí v liště nad mřížkou, ať se na zapnutý filtr
 * nezapomene — jinak by plánovač viděl polovinu měsíce prázdnou a myslel
 * si, že je prázdný. Jména, ne „2 lidé": vybrané pilulky můžou být
 * v posuvném pásu mimo obrazovku a lišta je jediné místo, kde je vidět,
 * KDO je vybraný. `kratce` = krátká jména z pásu (křestní, u shody celá).
 */
export function popisFiltru(f: FiltrRozvrhu, jmena: Map<number, string>, kratce?: Map<number, string>, t: PrekladVety = cesky): string {
  // Sekce slovníku pro kontrolu překladů: useT('rozvrh') (věty z t('…') v tomhle souboru patří do `rozvrh`).
  const casti: string[] = [];
  const kratke = (id: number) => kratce?.get(id) ?? jmena.get(id) ?? null;
  const clovek = (n: number) => t('{n, plural, one {# člověk} few {# lidé} other {# lidí}}', { n });
  if (f.lide.length === 1) casti.push(jmena.get(f.lide[0]) ?? clovek(1));
  else if (f.lide.length > 1) {
    const znama = f.lide.map(kratke);
    if (znama.some(j => j == null)) casti.push(clovek(f.lide.length));
    else if (f.lide.length <= 3) casti.push(znama.join(', '));
    else casti.push(t('{jmeno} a {n, plural, one {# další} few {# další} other {# dalších}}', { jmeno: znama[0], n: f.lide.length - 1 }));
  }
  if (f.typy.length > 0 && f.typy.length <= 2) casti.push(f.typy.join(', '));
  else if (f.typy.length > 2) casti.push(t('{n, plural, one {# typ} few {# typy} other {# typů}}', { n: f.typy.length }));
  if (f.jenDiry) casti.push(t('jen dny s dírou'));
  return casti.join(' · ');
}

/** „14 směn v návrhu" / „3 směny" — kolik toho filtr ukazuje. */
export function popisVysledku(n: number, navrh: boolean, t: PrekladVety = cesky): string {
  return `${t('{n, plural, one {# směna} few {# směny} other {# směn}}', { n })}${navrh ? ` ${t('v návrhu')}` : ''}`;
}

// ---------------------------------------------------------------------------
// Vytížení — „Směny podle lidí"
// ---------------------------------------------------------------------------

/** Sobota nebo neděle (poledne UTC — den neuteče přes pásmo). */
export function jeVikend(datum: string): boolean {
  const d = new Date(`${datum.slice(0, 10)}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

/** Otevírací doba jednoho dne, jak ji plánovač zná (null = zavřeno / neznámá). */
export interface DobaDne { open?: string | null; close?: string | null }

/**
 * Zavírá podnik? Směna končí v čas zavření nebo později. Zavírací čas
 * menší nebo rovný otevíracímu znamená „až zítra" (bar 16:00–02:00) —
 * stejná konvence jako v lib/businessDay.ts. Bez ní vycházela u nočního
 * baru jako zavírací každá denní směna (16:00 ≥ 02:00) a údaj „N× zavírá"
 * byl k ničemu. Konec směny přes půlnoc se posune stejně: 20:00–01:00
 * baru, který zavírá ve 2:00, nezavírá.
 *
 * Bez otevírací doby dne se čas zavření nezná: zavírací je pak jen směna
 * přes půlnoc (noční konec provozu je jediné, co víme jistě).
 */
export function jeZaviraci(s: { startTime: string; endTime: string }, doba: DobaDne | null | undefined): boolean {
  const a = minutyZ(s.startTime); const b0 = minutyZ(s.endTime);
  if (a == null || b0 == null) return false;
  const presPulnoc = b0 <= a;
  const z0 = minutyZ(doba?.close);
  if (z0 == null) return presPulnoc;
  const o = minutyZ(doba?.open);
  // Bez otevíracího času platí aspoň „00:00 = půlnoc", ne začátek dne.
  const zaviraZitra = o != null ? z0 <= o : z0 === 0;
  const z = zaviraZitra ? z0 + 24 * 60 : z0;
  const b = presPulnoc ? b0 + 24 * 60 : b0;
  return b >= z;
}

export type Upozorneni = 'nad_max' | 'bez_smeny' | 'nad_prumerem' | 'pod_prumerem';

export interface RadekVytizeni {
  id: number;
  jmeno: string;
  avatar: string | null;
  smen: number;
  hodiny: number;
  vikend: number;
  zaviraci: number;
  /** Kolik směn si člověk v dostupnosti řekl nejvýš; null = neřekl (nebo dostupnost nevidíme). */
  max: number | null;
  /** Zadal na měsíc dostupnost. */
  zadal: boolean;
  /** Počet směn minus průměr týmu (zaokrouhleno na desetiny). */
  odchylka: number;
  upozorneni: Upozorneni[];
}

export interface Vytizeni {
  radky: RadekVytizeni[];
  /** Průměr směn na člověka, který v měsíci nějakou má. */
  prumer: number;
  /** Nejvyšší hodnota na stupnici pruhů (směny i strop „chce max."). */
  stupnice: number;
  /** Aspoň jeden den měl známou zavírací dobu, nebo byla noční směna — sloupec „zavírá" má smysl. */
  zavreniZname: boolean;
}

/**
 * Výrazná odchylka od průměru: aspoň o dvě směny a o třetinu průměru.
 * „O jednu víc" je v malém týmu šum; „o dvě víc při průměru 12" taky.
 * Srovnává se až od tří lidí se směnou — ve dvou je každý „mimo průměr".
 */
export function vyrazneMimo(smen: number, prumer: number, lidiSeSmenou: number): 'nad' | 'pod' | null {
  if (lidiSeSmenou < 3 || smen === 0) return null;
  const prah = Math.max(2, prumer / 3);
  if (smen - prumer >= prah) return 'nad';
  if (prumer - smen >= prah) return 'pod';
  return null;
}

/**
 * Může člověk v měsíci aspoň jeden den? Kdo si ve formuláři dostupnosti
 * odškrtl všechny dny (nebo má na celý měsíc schválené volno), „nemá směnu"
 * logicky — a upozornění by byl falešný poplach. `dny` = null: nevíme,
 * které dny měsíc má, takže se bere, že může.
 */
export function muzeAsponDen(
  d: DostupnostFiltru,
  dny: readonly string[] | null,
  volno: readonly { employeeId: number; fromDate: string; toDate: string }[] = [],
): boolean {
  if (!dny || dny.length === 0) return true;
  const nemuze = new Set(d.unavailableDates ?? []);
  const jeho = volno.filter(v => Number(v.employeeId) === Number(d.employeeId));
  return dny.some(den => !nemuze.has(den) && d.dayPreferences?.[den] !== 'off'
    && !jeho.some(v => v.fromDate <= den && den <= v.toDate));
}

/**
 * Vytížení lidí v tom, co plánovač právě ukazuje. `doba(datum)` vrátí
 * otevírací dobu dne ({ open, close }) nebo null. `dostupnost` = null, když
 * ji role nevidí: pak nejsou ani stropy „chce max.", ani upozornění „nemá
 * směnu". `dny` a `volno` říkají, jestli člověk bez směny vůbec mohl.
 */
export function vytizeni(
  lide: readonly { id: number; jmeno: string; avatar: string | null }[],
  smeny: readonly SmenaFiltru[],
  dostupnost: readonly DostupnostFiltru[] | null,
  doba: (datum: string) => DobaDne | null,
  kontext: { dny?: readonly string[] | null; volno?: readonly { employeeId: number; fromDate: string; toDate: string }[] } = {},
): Vytizeni {
  const podle = new Map<number, { smen: number; hodiny: number; vikend: number; zaviraci: number }>();
  let zavreniZname = false;
  for (const s of smeny) {
    const id = Number(s.employeeId);
    const c = podle.get(id) ?? { smen: 0, hodiny: 0, vikend: 0, zaviraci: 0 };
    c.smen += 1;
    c.hodiny += delkaSmeny(s.startTime, s.endTime);
    if (jeVikend(s.date)) c.vikend += 1;
    const z = doba(s.date);
    if (z?.close) zavreniZname = true;
    if (jeZaviraci(s, z)) { c.zaviraci += 1; zavreniZname = true; }
    podle.set(id, c);
  }
  const maxPodle = new Map<number, number | null>();
  const muze = new Set<number>();
  for (const d of dostupnost ?? []) {
    const m = Number(d.maxShifts);
    maxPodle.set(Number(d.employeeId), Number.isFinite(m) && m > 0 ? m : null);
    if (muzeAsponDen(d, kontext.dny ?? null, kontext.volno ?? [])) muze.add(Number(d.employeeId));
  }
  const seSmenou = [...podle.values()].filter(c => c.smen > 0);
  const prumer = seSmenou.length ? seSmenou.reduce((n, c) => n + c.smen, 0) / seSmenou.length : 0;

  const radky = lide.map(c => {
    const x = podle.get(c.id) ?? { smen: 0, hodiny: 0, vikend: 0, zaviraci: 0 };
    const zadal = maxPodle.has(c.id);
    const max = maxPodle.get(c.id) ?? null;
    const upozorneni: Upozorneni[] = [];
    if (max != null && x.smen > max) upozorneni.push('nad_max');
    // Jen kdo aspoň jeden den může — celý měsíc „nemůžu" není díra v plánu.
    if (dostupnost && zadal && muze.has(c.id) && x.smen === 0) upozorneni.push('bez_smeny');
    const mimo = vyrazneMimo(x.smen, prumer, seSmenou.length);
    // Nad max. už říká totéž důrazněji — „nad průměrem" by bylo druhé hlášení téže věci.
    if (mimo === 'nad' && !upozorneni.includes('nad_max')) upozorneni.push('nad_prumerem');
    if (mimo === 'pod') upozorneni.push('pod_prumerem');
    return {
      id: c.id, jmeno: c.jmeno, avatar: c.avatar,
      smen: x.smen, hodiny: Math.round(x.hodiny * 100) / 100, vikend: x.vikend, zaviraci: x.zaviraci,
      max, zadal, odchylka: Math.round((x.smen - prumer) * 10) / 10, upozorneni,
    };
  });
  const stupnice = Math.max(1, ...radky.map(r => Math.max(r.smen, r.max ?? 0)));
  return { radky, prumer: Math.round(prumer * 10) / 10, stupnice, zavreniZname };
}

export type RazeniVytizeni = 'smeny' | 'jmeno' | 'odchylka';

/**
 * Řazení přehledu. „Co řešit" (klíč `odchylka`) dá nahoru, co chce pozornost: nad max.,
 * pak bez směny, pak nejdál od průměru. Shoda vždycky podle jména, ať
 * řádky neposkakují.
 */
export function seradVytizeni(radky: readonly RadekVytizeni[], razeni: RazeniVytizeni): RadekVytizeni[] {
  const jmeno = (a: RadekVytizeni, b: RadekVytizeni) => a.jmeno.localeCompare(b.jmeno, 'cs');
  const vaha = (r: RadekVytizeni) => (r.upozorneni.includes('nad_max') ? 2 : r.upozorneni.includes('bez_smeny') ? 1 : 0);
  const kopie = [...radky];
  if (razeni === 'jmeno') return kopie.sort(jmeno);
  if (razeni === 'odchylka') return kopie.sort((a, b) => vaha(b) - vaha(a) || Math.abs(b.odchylka) - Math.abs(a.odchylka) || jmeno(a, b));
  return kopie.sort((a, b) => b.smen - a.smen || b.hodiny - a.hodiny || jmeno(a, b));
}

/** Řazení z localStorage — neznámá hodnota = podle počtu směn. */
export const nactiRazeni = (v: unknown): RazeniVytizeni => (v === 'jmeno' || v === 'odchylka' ? v : 'smeny');
