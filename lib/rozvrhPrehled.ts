// Výpočty pro widgety a nástroje stránek Rozvrh, Moje směny a Dostupnost
// (kolo 69, balík B1).
//
// Čistý modul bez Reactu: počítá ho plocha (components/widgety/oblasti/
// rozvrh.tsx a moje-smeny.tsx), nástroje (ScheduleBuilder, MyShifts)
// i jednotkové testy (scripts/testy/k69-b1.ts). Dřív žily tytéž součty
// rozepsané po komponentách a každá je počítala jinak — Moje směny brala
// délku směny z časů, Rozvrh ji nepočítal vůbec a noční směna 22:00–06:00
// vycházela záporně nebo nulou. Tady se počítá jen s řetězci „RRRR-MM-DD"
// a „HH:MM" (žádné `toISOString()`, které po 22:00 pražského času posune
// den do zítřka).

import { dayPlus } from './pragueTime.ts';

// ---------------------------------------------------------------------------
// Předávání mezi widgetem a nástrojem
// ---------------------------------------------------------------------------

/**
 * Widget „Díry v obsazení" žádá o otevření dne v plánovači (Doplnit směnu).
 * Na stránce Rozvrh ho nástroj slyší hned (událost), jinde si žádost počká
 * v sessionStorage, než se nástroj po přechodu připojí — EmployerLayout
 * argument pohledu Rozvrhu nepředává a patří jinému balíku.
 */
export const UDALOST_DEN = 'managero:rozvrh-den';
export const KLIC_DEN = 'managero-rozvrh-den';
/** Widget „Dostupnost týmu" žádá o vyplnění dostupnosti za člověka: hodnota „<id>|<RRRR-MM>". */
export const UDALOST_DOSTUPNOST = 'managero:rozvrh-dostupnost';
export const KLIC_DOSTUPNOST = 'managero-rozvrh-dostupnost';
/**
 * Widget zapsal něco, co mění rozvrh (schválená výměna přepsala směnu,
 * schválené volno blokuje dny). Plánovač se podle toho znovu načte — jinak by
 * nabízel člověka na den, kdy má schválenou dovolenou.
 */
export const UDALOST_ZMENA = 'managero:rozvrh-zmena';

// ---------------------------------------------------------------------------
// Dny, časy a měsíce
// ---------------------------------------------------------------------------

/** Den z databáze nebo JSONu: „2026-09-26" i „2026-09-26T00:00:00.000Z" → „2026-09-26". */
export const den = (v: unknown): string => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : '');
/** „08:00:00" → „08:00". */
export const hm = (t: unknown): string => String(t ?? '').slice(0, 5);

/** „08:30" → 510; neplatný čas → null (ne nula — půlnoc je platný čas). */
export function minutyZ(t: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  return h <= 24 && mi < 60 ? h * 60 + mi : null;
}

/**
 * Délka směny v hodinách. Noční směna (konec ≤ začátek, 22:00–06:00) jde přes
 * půlnoc, takže se k ní přičte den — dřív vycházela záporně. Neznámý čas = 0.
 */
export function delkaSmeny(od: unknown, doCasu: unknown): number {
  const a = minutyZ(od); const b = minutyZ(doCasu);
  if (a == null || b == null) return 0;
  const m = b - a;
  return (m <= 0 ? m + 24 * 60 : m) / 60;
}

/** Hodiny do textu: „8", „7,5". */
export function hodinyText(h: number): string {
  const r = Math.round(h * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
}

/** „RRRR-MM" posunutý o `o` měsíců (UTC na 1. dni — přelom roku ani délka měsíce nevadí). */
export function posunMesice(mesic: string, o: number): string {
  const [y, m] = mesic.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + o, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** „2026-09-28" → „pondělí 28. září" (poledne UTC, ať den neuteče přes pásmo ani letní čas). */
export function denVetou(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** Krátce do řádku: „Dnes", „Zítra", jinak „po 28. 9.". */
export function denKratce(d: string, dnes: string): string {
  if (d === dnes) return 'Dnes';
  if (d === dayPlus(dnes, 1)) return 'Zítra';
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' });
}

/** Rozsah volna: „3. 10. 2026", „3. 10. – 7. 10. 2026", přes rok celé obě. */
export function rozsahVolna(od: string, doDne: string): string {
  const f = (d: string, rok: boolean) => new Date(`${d}T12:00:00Z`).toLocaleDateString('cs-CZ', rok
    ? { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }
    : { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
  if (!doDne || od === doDne) return f(od, true);
  if (od.slice(0, 4) === doDne.slice(0, 4)) return `${f(od, false)} – ${f(doDne, true)}`;
  return `${f(od, true)} – ${f(doDne, true)}`;
}

/** Počet dní volna včetně obou krajů. */
export function dnuVolna(od: string, doDne: string): number {
  const a = Date.parse(`${od}T12:00:00Z`); const b = Date.parse(`${doDne || od}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 86400000) + 1 : 1;
}

export const TYP_VOLNA: Record<string, string> = { vacation: 'Dovolená', sick: 'Nemoc', other: 'Jiné' };

// ---------------------------------------------------------------------------
// Rozvrh (vedení)
// ---------------------------------------------------------------------------

export interface SmenaRozvrhu {
  id?: number;
  employeeId: number;
  employeeName?: string | null;
  employeeAvatar?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  type?: string | null;
}

export interface HodinyClovek {
  employeeId: number;
  jmeno: string;
  avatar: string | null;
  hodiny: number;
  smen: number;
  /** Strop hodin z pravidel generátoru (osobní přednost před týmovým); null = bez stropu nebo nevíme. */
  limit: number | null;
  /** hodiny / limit (1 = na stropu); null bez limitu. */
  podil: number | null;
}

export interface PravidlaHodin {
  teamMaxHours?: number | null;
  members?: { id: number; maxHours?: number | null }[];
}

/**
 * Kolik hodin má kdo v měsíci naplánováno a jak blízko je stropu z pravidel
 * generátoru. Osobní výjimka 0 znamená „bez omezení" (jako v Pravidlech).
 * Pořadí: nejblíž stropu nahoře, pak podle hodin.
 */
export function hodinyLidi(smeny: readonly SmenaRozvrhu[], mesic: string, pravidla: PravidlaHodin | null): HodinyClovek[] {
  const podle = new Map<number, HodinyClovek>();
  for (const s of smeny) {
    if (den(s.date).slice(0, 7) !== mesic) continue;
    const id = Number(s.employeeId);
    const c = podle.get(id) ?? { employeeId: id, jmeno: s.employeeName ?? 'Bez jména', avatar: s.employeeAvatar ?? null, hodiny: 0, smen: 0, limit: null, podil: null };
    c.hodiny += delkaSmeny(s.startTime, s.endTime);
    c.smen += 1;
    podle.set(id, c);
  }
  const tym = pravidla?.teamMaxHours != null && pravidla.teamMaxHours > 0 ? Number(pravidla.teamMaxHours) : null;
  const osobni = new Map((pravidla?.members ?? []).map(m => [Number(m.id), m.maxHours]));
  const out = [...podle.values()].map(c => {
    const o = osobni.get(c.employeeId);
    const limit = o === 0 ? null : o != null && o > 0 ? Number(o) : tym;
    return { ...c, hodiny: Math.round(c.hodiny * 100) / 100, limit, podil: limit ? c.hodiny / limit : null };
  });
  return out.sort((a, b) => (b.podil ?? -1) - (a.podil ?? -1) || b.hodiny - a.hodiny || a.jmeno.localeCompare(b.jmeno, 'cs'));
}

export interface DenSDirou {
  den: string;
  /** Úseky otevírací doby, kdy v podniku není nikdo. */
  mezery: { od: string; do: string }[];
  /** Typy směn, které se na den vejdou, ale nikdo na nich není. */
  neobsazeno: string[];
}

/**
 * Díry z /api/schedule (gaps + understaffed) po dnech. Jen od dneška: díra
 * včera už nejde doplnit a widget by jí zbytečně strašil.
 */
export function dnySDirou(
  gaps: readonly { date: string; from: string; to: string }[],
  understaffed: readonly { date: string; shiftTypeName: string }[],
  dnes: string,
): DenSDirou[] {
  const m = new Map<string, DenSDirou>();
  const dej = (d: string) => { let x = m.get(d); if (!x) { x = { den: d, mezery: [], neobsazeno: [] }; m.set(d, x); } return x; };
  for (const g of gaps) { const d = den(g.date); if (d && d >= dnes) dej(d).mezery.push({ od: hm(g.from), do: hm(g.to) }); }
  for (const u of understaffed) {
    const d = den(u.date);
    if (d && d >= dnes && u.shiftTypeName && !dej(d).neobsazeno.includes(u.shiftTypeName)) dej(d).neobsazeno.push(u.shiftTypeName);
  }
  return [...m.values()].sort((a, b) => a.den.localeCompare(b.den));
}

/** Věta o díře: „Nikdo 14:00–16:00 · neobsazeno Odpolední". */
export function popisDiry(d: DenSDirou): string {
  const casti: string[] = [];
  if (d.mezery.length) casti.push(`nikdo ${d.mezery.map(g => `${g.od}–${g.do}`).join(', ')}`);
  if (d.neobsazeno.length) casti.push(`neobsazeno ${d.neobsazeno.join(', ')}`);
  const t = casti.join(' · ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export interface DenPoptavky { den: string; rezervaci: number; hostu: number }

/** Nejvytíženější dny podle rezervací (od dneška), nejvíc hostů nahoře. */
export function poptavkaTop(demand: Record<string, { reservations?: number; guests?: number }> | null | undefined, dnes: string, n = 5): DenPoptavky[] {
  return Object.entries(demand ?? {})
    .map(([d, v]) => ({ den: den(d), rezervaci: Number(v?.reservations) || 0, hostu: Number(v?.guests) || 0 }))
    .filter(x => x.den && x.den >= dnes && x.hostu > 0)
    .sort((a, b) => b.hostu - a.hostu || b.rezervaci - a.rezervaci || a.den.localeCompare(b.den))
    .slice(0, n);
}

// ---------------------------------------------------------------------------
// Náhled týmu a vlastní směny
// ---------------------------------------------------------------------------

export interface SmenaNahledu {
  id: number;
  employeeId?: number;
  employeeName?: string | null;
  employeeAvatar?: string | null;
  date: string;
  startTime?: string;
  endTime?: string;
  typeLabel?: string | null;
  typeColor?: string | null;
  isMine?: boolean;
}

/** Směny týmu po dnech od dneška na `dni` dní (včetně dneška), v každém dni podle začátku. */
export function tymPoDnech<T extends SmenaNahledu>(smeny: readonly T[], dnes: string, dni: number): { den: string; smeny: T[] }[] {
  const posledni = dayPlus(dnes, Math.max(0, dni - 1));
  const m = new Map<string, T[]>();
  for (const s of smeny) {
    const d = den(s.date);
    if (!d || d < dnes || d > posledni) continue;
    const l = m.get(d) ?? []; l.push(s); m.set(d, l);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, l]) => ({ den: d, smeny: l.sort((a, b) => hm(a.startTime).localeCompare(hm(b.startTime)) || String(a.employeeName ?? '').localeCompare(String(b.employeeName ?? ''), 'cs')) }));
}

export interface MojeSmena {
  id: number;
  date: string;
  startTime?: string;
  endTime?: string;
  start_time?: string;
  end_time?: string;
  type?: string;
  typeLabel?: string | null;
  typeColor?: string | null;
  /** Hodnocení směny (1–5) — API ho vrací jen u vlastních směn. */
  rating?: number | null;
}

const odS = (s: MojeSmena) => hm(s.startTime ?? s.start_time);
const doS = (s: MojeSmena) => hm(s.endTime ?? s.end_time);

/**
 * Tři čísla Mých směn. Odpracované = směny do včerejška (dnešní ještě běží
 * nebo teprve bude), v hodinách z časů směny — dřív se tu hádalo 8 h na směnu.
 */
export function mojeCisla(smeny: readonly MojeSmena[], dnes: string): { nadchazejici: number; odpracovanoH: number; minulych: number; celkem: number } {
  let nadchazejici = 0; let minulych = 0; let odpracovanoH = 0;
  for (const s of smeny) {
    const d = den(s.date);
    if (!d) continue;
    if (d >= dnes) nadchazejici += 1;
    else { minulych += 1; odpracovanoH += delkaSmeny(odS(s), doS(s)); }
  }
  return { nadchazejici, odpracovanoH: Math.round(odpracovanoH * 100) / 100, minulych, celkem: nadchazejici + minulych };
}

/** Nadcházející směny (od dneška), nejbližší první. */
export function nadchazejiciSmeny<T extends MojeSmena>(smeny: readonly T[], dnes: string): T[] {
  return smeny.filter(s => den(s.date) >= dnes).sort((a, b) => den(a.date).localeCompare(den(b.date)) || odS(a).localeCompare(odS(b)));
}

/** Minulé směny (do včerejška), nejnovější první. */
export function minuleSmeny<T extends MojeSmena>(smeny: readonly T[], dnes: string): T[] {
  return smeny.filter(s => { const d = den(s.date); return !!d && d < dnes; })
    .sort((a, b) => den(b.date).localeCompare(den(a.date)) || odS(b).localeCompare(odS(a)));
}

/** Popisek typu směny; `auto` a `custom` jsou technické hodnoty, do věty nepatří. */
export function popisekTypu(s: { type?: string | null; typeLabel?: string | null }): string {
  if (s.type === 'event') return 'Akce';
  const t = s.typeLabel ?? s.type ?? '';
  return ({ auto: 'Mimo rozvrh', custom: 'Směna', morning: 'Ranní', afternoon: 'Odpolední', flexible: 'Vlastní' } as Record<string, string>)[t] ?? (t || 'Směna');
}

// Typ směny nese kategorie (cat-dot-1…6), ne stavová barva: „ranní" není
// „v pořádku". Barvy, které si podnik u typu vybírá (ScheduleBuilder,
// COLORS), se mapují na nejbližší kategorii.
const KATEGORIE_BARVY: Record<string, number> = {
  '#c8f542': 1, '#3b82f6': 2, '#0a84ff': 2, '#8b5cf6': 3, '#f59e0b': 4, '#14b8a6': 5, '#ec4899': 6, '#f43f5e': 6,
};
/** Barva typu směny → kategorie 1–6 (null = šedá tečka). */
export const kategorieBarvy = (barva: unknown): number | null => KATEGORIE_BARVY[String(barva ?? '').toLowerCase()] ?? null;

// ---------------------------------------------------------------------------
// Volno a výměny
// ---------------------------------------------------------------------------

export interface ZadostVolna {
  id: number;
  employeeId?: number | string;
  employeeName?: string | null;
  employeeAvatar?: string | null;
  fromDate: string;
  toDate: string;
  type: string;
  note?: string | null;
  status: 'pending' | 'approved' | 'rejected' | string;
}

/**
 * Fronta vedení: čekající (nejstarší termín první) a schválené volno, které
 * ještě neskončilo (nejbližší první). Zamítnuté a proběhlé jsou historie.
 */
export function zadostiVolna<T extends ZadostVolna>(zadosti: readonly T[], dnes: string): { cekajici: T[]; schvalene: T[]; vyrizene: T[] } {
  const f = (a: T, b: T) => den(a.fromDate).localeCompare(den(b.fromDate));
  return {
    cekajici: zadosti.filter(z => z.status === 'pending').sort(f),
    schvalene: zadosti.filter(z => z.status === 'approved' && den(z.toDate || z.fromDate) >= dnes).sort(f),
    vyrizene: zadosti.filter(z => z.status !== 'pending' && !(z.status === 'approved' && den(z.toDate || z.fromDate) >= dnes))
      .sort((a, b) => den(b.fromDate).localeCompare(den(a.fromDate))),
  };
}

export interface NabidkaSmeny {
  id: number;
  shiftId?: number;
  offeredBy: number;
  claimedBy: number | null;
  status: string;
  note?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  offeredByName?: string | null;
  offeredByAvatar?: string | null;
  claimedByName?: string | null;
  claimedByAvatar?: string | null;
}

/**
 * Burza po skupinách: co čeká na schválení vedení (převzaté), volné směny
 * kolegů (k převzetí), moje nabídky a co si beru já. Minulé směny do burzy
 * nepatří (převzít včerejšek nejde) — kromě fronty ke schválení: převzetí,
 * které vedení nestihlo rozhodnout, by jinak viselo „čeká" navždy.
 */
export function rozdelBurzu<T extends NabidkaSmeny>(nabidky: readonly T[], meId: number | null, dnes: string) {
  const aktualni = nabidky.filter(o => den(o.date) >= dnes);
  return {
    keSchvaleni: nabidky.filter(o => o.status === 'claimed'),
    volne: aktualni.filter(o => o.status === 'open' && o.offeredBy !== meId),
    moje: aktualni.filter(o => o.offeredBy === meId && (o.status === 'open' || o.status === 'claimed')),
    beru: aktualni.filter(o => o.claimedBy === meId && o.status === 'claimed'),
  };
}
