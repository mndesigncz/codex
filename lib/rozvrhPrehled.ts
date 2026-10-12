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

import { dayPlus, parseDbTime, pragueDayOf } from './pragueTime.ts';
import { usek } from './rozvrhDen.ts';

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

/**
 * Čas do pilulky v mřížce: „08–16", „08:30–16", „22–06". Minuty jen tam, kde
 * nejsou nula — na 126 px široké buňce je „08:00–16:00" o třetinu delší a
 * neřekne nic navíc. Neplatný čas = prázdný řetězec.
 */
export function casKratce(od: unknown, doCasu: unknown): string {
  const a = hodinaKratce(od); const b = hodinaKratce(doCasu);
  return a && b ? `${a}–${b}` : a || b;
}

/** „08:00" → „08", „08:30" → „08:30", „8:05" → „08:05"; neplatný čas → „". */
export function hodinaKratce(t: unknown): string {
  const m = minutyZ(t);
  if (m == null) return '';
  const h = String(Math.floor(m / 60)).padStart(2, '0'); const mi = m % 60;
  return mi === 0 ? h : `${h}:${String(mi).padStart(2, '0')}`;
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

/** Od kolikátého dne se plánovač otevírá rovnou na příštím měsíci. */
export const PRAH_PRISTIHO_MESICE = 25;

/**
 * Výchozí měsíc plánovače (kolo 6 UX, nález V02). Dřív vždy příští — majitel
 * 12. října otevřel prázdný listopad, přestože z telefonu nejčastěji kontroluje
 * a zveřejňuje rozvrh, který běží. Teď aktuální, dokud v něm jsou směny po
 * dnešku; po 25. dni (zbytek měsíce už je naplánovaný) a v měsíci, kde po
 * dnešku nic není, příští. `smenyTohoMesice` = null: směny ještě nejsou
 * načtené — začne se aktuálním a rozhodne se po načtení.
 */
export function mesicPlanovace(dnes: string, smenyTohoMesice: readonly { date: unknown }[] | null = null): string {
  const tento = dnes.slice(0, 7);
  if (Number(dnes.slice(8, 10)) > PRAH_PRISTIHO_MESICE) return posunMesice(tento, 1);
  if (smenyTohoMesice == null) return tento;
  return smenyTohoMesice.some(s => den(s.date) > dnes) ? tento : posunMesice(tento, 1);
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
  /** Hodinová sazba (GET /api/schedule jen s finance.mzdy, jinak null; 0 = nenastavená). */
  hourlyRate?: number | null;
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
  /** Mzdový náklad (hodiny × sazba, zaokrouhlený až v součtu); null bez sazby nebo bez finance.mzdy. */
  naklad: number | null;
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
    const c = podle.get(id) ?? { employeeId: id, jmeno: s.employeeName ?? 'Bez jména', avatar: s.employeeAvatar ?? null, hodiny: 0, smen: 0, limit: null, podil: null, naklad: null };
    const h = delkaSmeny(s.startTime, s.endTime);
    c.hodiny += h;
    c.smen += 1;
    // Chybějící sazba není nula: bez ní náklad nevzniká (null), ne „0 Kč".
    if (Number(s.hourlyRate) > 0) c.naklad = (c.naklad ?? 0) + h * Number(s.hourlyRate);
    podle.set(id, c);
  }
  const tym = pravidla?.teamMaxHours != null && pravidla.teamMaxHours > 0 ? Number(pravidla.teamMaxHours) : null;
  const osobni = new Map((pravidla?.members ?? []).map(m => [Number(m.id), m.maxHours]));
  const out = [...podle.values()].map(c => {
    const o = osobni.get(c.employeeId);
    const limit = o === 0 ? null : o != null && o > 0 ? Number(o) : tym;
    return { ...c, hodiny: Math.round(c.hodiny * 100) / 100, limit, podil: limit ? c.hodiny / limit : null, naklad: c.naklad == null ? null : Math.round(c.naklad) };
  });
  return out.sort((a, b) => (b.podil ?? -1) - (a.podil ?? -1) || b.hodiny - a.hodiny || a.jmeno.localeCompare(b.jmeno, 'cs'));
}

/** Součet za den do patičky buňky: počet směn a hodiny (uložené i návrh, co mřížka právě kreslí). */
export function souhrnDne(smeny: readonly { startTime: unknown; endTime: unknown }[]): { smen: number; hodin: number } {
  return { smen: smeny.length, hodin: Math.round(smeny.reduce((n, s) => n + delkaSmeny(s.startTime, s.endTime), 0) * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Týdenní pohled (lidé × dny) — jen čtení, kolo 6 UX
// ---------------------------------------------------------------------------

/** První den týdne, do kterého `den` patří; `zacatek` 1 = pondělí, 0 = neděle (lib/week). */
export function prvniDenTydne(den: string, zacatek: 0 | 1): string {
  const d = new Date(`${den}T12:00:00Z`);
  const poradi = (d.getUTCDay() - zacatek + 7) % 7;
  return dayPlus(den, -poradi);
}

/** Sedm dní od prvního dne týdne. */
export const dnyTydne = (prvni: string): string[] => Array.from({ length: 7 }, (_, i) => dayPlus(prvni, i));

/** První dny týdnů, které zasahují do měsíce „RRRR-MM" (první může být v minulém měsíci). */
export function tydnyMesice(mesic: string, zacatek: 0 | 1): string[] {
  const [y, m] = mesic.split('-').map(Number);
  const posledni = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let t = prvniDenTydne(`${mesic}-01`, zacatek); t <= `${mesic}-${String(posledni).padStart(2, '0')}`; t = dayPlus(t, 7)) out.push(t);
  return out;
}

/**
 * Který týden měsíce ukázat napřed: ten s dneškem, když do měsíce patří,
 * jinak první týden měsíce — první, který v měsíci leží aspoň čtyřmi dny
 * (listopad 2026 začíná nedělí: „26. 10. – 1. 11." by ukázal šest dnů
 * jiného měsíce bez dat a plánovač by hned klepal na šipku).
 */
export function vychoziTyden(mesic: string, dnes: string, zacatek: 0 | 1): string {
  const tydny = tydnyMesice(mesic, zacatek);
  if (dnes.slice(0, 7) === mesic) {
    const sDneskem = tydny.find(t => t <= dnes && dnes <= dayPlus(t, 6));
    if (sDneskem) return sDneskem;
  }
  return tydny.find(t => dnyTydne(t).filter(d => d.slice(0, 7) === mesic).length >= 4) ?? tydny[0];
}

/** Hodiny každého člověka ve vybraných dnech (z délky směn, ne z měsíčního vytížení). */
export function hodinyVeDnech(
  smeny: readonly { employeeId: number; date: string; startTime: unknown; endTime: unknown }[],
  dny: readonly string[],
): Map<number, number> {
  const v = new Set(dny);
  const out = new Map<number, number>();
  for (const s of smeny) {
    if (!v.has(den(s.date))) continue;
    const id = Number(s.employeeId);
    out.set(id, Math.round(((out.get(id) ?? 0) + delkaSmeny(s.startTime, s.endTime)) * 100) / 100);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mzdový náklad plánu (kolo 6 UX) — jen hodiny × sazba, bez poměru k tržbám
// ---------------------------------------------------------------------------

export interface SmenaSeSazbou { employeeId: number; startTime: unknown; endTime: unknown; hourlyRate?: number | null }

/**
 * Naplánované hodiny a mzdový náklad. Sazba chodí z API jen s finance.mzdy
 * (jinak null u všech) — pak `castka` = null a ukáže se jen počet hodin.
 * Směna bez sazby (0/null) se do částky nepočítá: chybějící sazba není nula,
 * ale díra, na kterou upozorňuje `lideBezSazby`.
 */
export function nakladPlanu(smeny: readonly SmenaSeSazbou[]): { hodin: number; castka: number | null } {
  let hodin = 0; let castka = 0; let seSazbou = false;
  for (const s of smeny) {
    const h = delkaSmeny(s.startTime, s.endTime);
    hodin += h;
    if (s.hourlyRate != null) seSazbou = true;
    if (Number(s.hourlyRate) > 0) castka += h * Number(s.hourlyRate);
  }
  return { hodin: Math.round(hodin * 100) / 100, castka: seSazbou ? Math.round(castka) : null };
}

/** Kolik lidí se směnou nemá sazbu (0 nebo null) — má smysl jen s finance.mzdy. */
export function lideBezSazby(smeny: readonly SmenaSeSazbou[]): number {
  const bez = new Set<number>(); const se = new Set<number>();
  for (const s of smeny) (Number(s.hourlyRate) > 0 ? se : bez).add(Number(s.employeeId));
  for (const id of se) bez.delete(id);
  return bez.size;
}

/** Náklad jednoho člověka: hodiny × sazba; null bez sazby. */
export const nakladCloveka = (hodiny: number, sazba: number | null | undefined): number | null =>
  Number(sazba) > 0 ? Math.round(hodiny * Number(sazba)) : null;

export interface DenSDirou {
  den: string;
  /** Úseky otevírací doby, kdy v podniku není nikdo. */
  mezery: { od: string; do: string }[];
  /** Typy směn, které se na den vejdou, ale nikdo na nich není. */
  neobsazeno: string[];
  /**
   * Nikdo neotevře (díra od otevření) — podnik se ten den neotevře. Jinak
   * jde jen o chybějícího druhého člověka. Díra bez úrovně (starší odpověď)
   * se počítá jako povinná.
   */
  povinna: boolean;
}

/**
 * Díry z /api/schedule (gaps + understaffed) po dnech. Jen od dneška: díra
 * včera už nejde doplnit a widget by jí zbytečně strašil.
 */
export function dnySDirou(
  gaps: readonly { date: string; from: string; to: string; uroven?: string }[],
  understaffed: readonly { date: string; shiftTypeName: string }[],
  dnes: string,
): DenSDirou[] {
  const m = new Map<string, DenSDirou>();
  const dej = (d: string) => { let x = m.get(d); if (!x) { x = { den: d, mezery: [], neobsazeno: [], povinna: false }; m.set(d, x); } return x; };
  for (const g of gaps) {
    const d = den(g.date);
    if (!d || d < dnes) continue;
    const x = dej(d);
    x.mezery.push({ od: hm(g.from), do: hm(g.to) });
    if (g.uroven !== 'zadouci') x.povinna = true;
  }
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

export interface Kolega {
  id: number;
  jmeno: string | null;
  avatar: string | null;
  od: string;
  do: string;
  /** Kolik minut spolu stojíte (překryv obou směn). */
  spolu: number;
  /** Kolega má směnu ve stejný čas jako ty, na minutu. */
  stejne: boolean;
}

/**
 * Kdo je s tebou na směně: ostatní z náhledu týmu, kdo ten den stojí aspoň minutu
 * ve stejnou dobu. Noční směna přes půlnoc se počítá (22:00–06:00 se potká s 18:00–23:00),
 * dotyk (jeden končí, druhý začíná) ne. Řazeno podle začátku, pak podle jména.
 */
export function kolegoveKeSmene(
  moje: { date: string; startTime?: string; endTime?: string; start_time?: string; end_time?: string },
  tym: readonly SmenaNahledu[],
): Kolega[] {
  const d = den(moje.date);
  const od = hm(moje.startTime ?? moje.start_time);
  const doC = hm(moje.endTime ?? moje.end_time);
  const mine = usek(od, doC);
  if (!d || !mine) return [];
  const out: Kolega[] = [];
  for (const s of tym) {
    if (s.isMine || den(s.date) !== d) continue;
    const j = usek(hm(s.startTime), hm(s.endTime));
    if (!j) continue;
    const spolu = Math.min(mine.end, j.end) - Math.max(mine.start, j.start);
    if (spolu <= 0) continue;
    out.push({
      id: s.employeeId ?? s.id, jmeno: s.employeeName ?? null, avatar: s.employeeAvatar ?? null,
      od: hm(s.startTime), do: hm(s.endTime), spolu, stejne: hm(s.startTime) === od && hm(s.endTime) === doC,
    });
  }
  return out.sort((a, b) => a.od.localeCompare(b.od) || String(a.jmeno ?? '').localeCompare(String(b.jmeno ?? ''), 'cs'));
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
  /** Instrukce vedení ke směně (kolo 7) — API ji vrací jen u vlastních směn nebo plánovači. */
  note?: string | null;
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
// Připomenutí dostupnosti (kolo 7, R7-1)
// ---------------------------------------------------------------------------

/**
 * Jak často jde lidem připomenout dostupnost — na podnik a měsíc. Dvacet hodin,
 * ne „jednou za den": kdo připomene v 9:12, nemá druhý den v 8:50 narazit na zákaz.
 * POST /api/availability/remind hlídá totéž v SQL (`INTERVAL '20 hours'`).
 */
export const PRIPOMINKA_DOSTUPNOSTI_H = 20;

/** Měsíc, na který jde připomínat: „RRRR-MM" tohoto nebo příštího měsíce (podle `dnes`), jinak null. */
export function mesicProPripominku(v: unknown, dnes: string): string | null {
  const m = String(v ?? '');
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const tento = dnes.slice(0, 7);
  return m === tento || m === posunMesice(tento, 1) ? m : null;
}

/** Brání poslední připomínka další? Jen pro tentýž měsíc a do PRIPOMINKA_DOSTUPNOSTI_H hodin. */
export function pripominkaBlokuje(posledni: { at: Date | null; mesic: string | null | undefined }, mesic: string, ted: Date): boolean {
  if (!posledni.at || posledni.mesic !== mesic) return false;
  const uplynulo = ted.getTime() - posledni.at.getTime();
  return uplynulo >= 0 && uplynulo < PRIPOMINKA_DOSTUPNOSTI_H * 3600_000;
}

/**
 * Komu připomenout: členové podniku, ze kterých widget Dostupnost týmu počítá
 * „Chybí" (vedení i zaměstnanci, ne tablet), bez odevzdané dostupnosti na měsíc
 * a bez toho, kdo připomíná. Pořadí podle vstupu, bez duplicit.
 */
export function komuPripomenout(clenove: readonly number[], odevzdali: readonly number[], meId: number): number[] {
  const hotovo = new Set(odevzdali.map(Number));
  return [...new Set(clenove.map(Number))].filter(id => Number.isFinite(id) && id !== meId && !hotovo.has(id));
}

// ---------------------------------------------------------------------------
// Poznámka ke směně (kolo 7, R7-1)
// ---------------------------------------------------------------------------

/** Nejvýš tolik znaků smí mít poznámka ke směně — jednořádková instrukce („Otevíráš sám, klíče u Petry"). */
export const MAX_POZNAMKA_SMENY = 200;

/**
 * Poznámka ke směně ze vstupu API nebo CSV: ořízne mezery a zalomení na jeden
 * řádek, prázdná → null. Delší než MAX_POZNAMKA_SMENY → false (server odpoví
 * 400; uříznutá instrukce by mohla říkat něco jiného, než vedení napsalo).
 */
export function poznamkaSmeny(v: unknown): string | null | false {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > MAX_POZNAMKA_SMENY ? false : s;
}

// ---------------------------------------------------------------------------
// Dostupnost: týdenní vzor (kolo 7, R7-1)
// ---------------------------------------------------------------------------

/**
 * Stav dne v kalendáři dostupnosti: 'available' (výchozí, neukládá se), 'off',
 * starší 'morning' / 'afternoon', nebo 'type:<id>' podle typů směn podniku.
 */
export type StavDneDostupnosti = string;

const PLATNY_STAV_DNE = (v: unknown): v is string =>
  v === 'morning' || v === 'afternoon' || v === 'off' || (typeof v === 'string' && /^type:\d+$/.test(v));

/**
 * Uložená dostupnost (GET /api/availability?mine=1) → mapa „den → stav" bez
 * výchozích dnů. Denní preference mají přednost, nedostupné dny bez preference
 * jsou 'off'. Neznámé hodnoty se zahodí (stejně jako dřív při načtení v kalendáři).
 */
export function stavyDostupnosti(data: { dayPreferences?: Record<string, unknown> | null; unavailableDates?: readonly unknown[] | null } | null | undefined): Record<string, StavDneDostupnosti> {
  const mapa: Record<string, StavDneDostupnosti> = {};
  for (const [d, v] of Object.entries(data?.dayPreferences ?? {})) if (PLATNY_STAV_DNE(v) && den(d)) mapa[d] = v;
  for (const d of data?.unavailableDates ?? []) { const x = den(d); if (x && !mapa[x]) mapa[x] = 'off'; }
  return mapa;
}

/** Dny měsíce „RRRR-MM" jako „RRRR-MM-DD". */
function dnyMesice(mesic: string): string[] {
  const [y, m] = mesic.split('-').map(Number);
  const pocet = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: pocet }, (_, i) => `${mesic}-${String(i + 1).padStart(2, '0')}`);
}

/** Den v týdnu jako Date.getDay(): 0 = neděle … 6 = sobota (počítá se v UTC, bez hodin zařízení). */
export function denTydne(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
}

/**
 * Klepnutí na hlavičku sloupce (Po–Ne): všem dnům toho dne v týdnu v měsíci nastaví stav.
 * Se štětcem (`stav`) vybraný stav — a když už ho všechny mají, vrátí je na Dostupný
 * (jako druhé klepnutí na den). Bez štětce (`null`) další stav cyklu podle prvního
 * takového dne — stejná logika jako klepnutí na jeden den. Dny před `dnes` se
 * přeskočí (dostupnost na včerejšek nemá smysl a přepsala by odeslané).
 */
export function nastavDenVTydnu(
  stavy: Readonly<Record<string, StavDneDostupnosti>>, mesic: string, den0az6: number,
  stav: StavDneDostupnosti | null, cyklus: readonly StavDneDostupnosti[], dnes: string,
): Record<string, StavDneDostupnosti> {
  const dny = dnyMesice(mesic).filter(d => denTydne(d) === den0az6 && d >= dnes);
  if (!dny.length) return { ...stavy };
  const stavDne = (d: string) => stavy[d] ?? 'available';
  let novy: StavDneDostupnosti;
  if (stav) novy = dny.every(d => stavDne(d) === stav) ? 'available' : stav;
  else { const i = cyklus.indexOf(stavDne(dny[0])); novy = cyklus[(i < 0 ? 0 : i + 1) % Math.max(1, cyklus.length)] ?? 'available'; }
  const out = { ...stavy };
  for (const d of dny) { if (novy === 'available') delete out[d]; else out[d] = novy; }
  return out;
}

/**
 * „Jako minulý měsíc": z minulé dostupnosti vezme pro každý den v týdnu nejčastější
 * ne-výchozí stav (jen když se vyskytl aspoň 2× a jednoznačně — remíza nic nepřenese)
 * a dá ho stejným dnům v týdnu v měsíci `mesic`. Konkrétní data se nepřenášejí
 * (3. listopad není 3. prosinec). Přepíše jen dny bez vlastního stavu, přeskočí dny
 * před `dnes` a stavy, které podnik už nemá (`povolene`, smazaný typ směny).
 *
 * `vzor` je po sloupcích mřížky podle začátku týdne podniku (0 = neděle, 1 = pondělí):
 * vzor[0] je první sloupec — UI z něj skládá větu „Převzato: Po Nemůžu".
 */
export function prevezmiVzor(
  minuly: Parameters<typeof stavyDostupnosti>[0], mesic: string, zacatekTydne: 0 | 1,
  o: { stavajici?: Readonly<Record<string, StavDneDostupnosti>>; dnes?: string; povolene?: readonly StavDneDostupnosti[] } = {},
): { stavy: Record<string, StavDneDostupnosti>; vzor: (StavDneDostupnosti | null)[]; zmeneno: number } {
  const pocty: Map<string, number>[] = Array.from({ length: 7 }, () => new Map());
  for (const [d, st] of Object.entries(stavyDostupnosti(minuly))) {
    if (o.povolene && !o.povolene.includes(st)) continue;
    const m = pocty[denTydne(d)];
    m.set(st, (m.get(st) ?? 0) + 1);
  }
  const poDnech: (StavDneDostupnosti | null)[] = pocty.map(m => {
    const serazene = [...m.entries()].sort((a, b) => b[1] - a[1]);
    if (!serazene.length || serazene[0][1] < 2) return null;
    return serazene[1] && serazene[1][1] === serazene[0][1] ? null : serazene[0][0];
  });
  const stavy: Record<string, StavDneDostupnosti> = { ...(o.stavajici ?? {}) };
  let zmeneno = 0;
  for (const d of dnyMesice(mesic)) {
    const st = poDnech[denTydne(d)];
    if (!st || stavy[d] || (o.dnes && d < o.dnes)) continue;
    stavy[d] = st;
    zmeneno += 1;
  }
  const vzor = Array.from({ length: 7 }, (_, sloupec) => poDnech[(sloupec + zacatekTydne) % 7]);
  return { stavy, vzor, zmeneno };
}

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
  /** Kolik směn má člověk v rozvrhu ve dnech volna (API u čekajících žádostí, kolo 6 UX). */
  conflicts?: number | null;
  /** Důvod rozhodnutí, který vedení napsalo (u zamítnutí ho vidí žadatel; kolo 7). */
  decisionNote?: string | null;
}

/** Směna, která schválenému volnu zůstala v rozvrhu (PATCH /api/timeoff → conflicts[]). */
export interface SmenaVKolizi { date: string; startTime?: string; endTime?: string }

/**
 * Kolik směn v rozvrhu koliduje s žádostí o volno — 0, když API nic
 * neposlalo (starší server). Schválení nic neblokuje; číslo jen varuje,
 * že po schválení zůstane člověk v rozvrhu a plánovač ho musí vyndat.
 */
export function kolizeVolna(z: { conflicts?: number | null }): number {
  const n = Number(z.conflicts);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Souhrn kolizí po schválení (i hromadném): kolik směn zůstalo v rozvrhu
 * a nejbližší den, který má plánovač otevřít. Neplatné dny se přeskočí.
 */
export function souhrnKolizi(seznamy: readonly (readonly SmenaVKolizi[] | null | undefined)[]): { n: number; prvniDen: string | null } {
  let n = 0; let prvniDen: string | null = null;
  for (const s of seznamy) for (const k of s ?? []) {
    const d = den(k.date);
    if (!d) continue;
    n += 1;
    if (!prvniDen || d < prvniDen) prvniDen = d;
  }
  return { n, prvniDen };
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

/** Nejvýš tolik znaků smí mít důvod rozhodnutí o volnu (PATCH /api/timeoff `note`, kolo 7). */
export const MAX_DUVOD_VOLNA = 300;

/**
 * Důvod rozhodnutí o volnu ze vstupu API: ořízne mezery, prázdný → null.
 * Delší než MAX_DUVOD_VOLNA → false: server odpoví 400 a nic potichu neuřízne
 * (žadatel by dostal useknutou větu).
 */
export function duvodVolna(v: unknown): string | null | false {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > MAX_DUVOD_VOLNA ? false : s;
}

/**
 * Text oznámení žadateli po rozhodnutí o volnu: termín („2026-10-03" nebo
 * „2026-10-03 až 2026-10-07"), poznámka, že vedení termín upravilo, a důvod
 * zamítnutí za tečkou („ · Málo lidí, zkus jiný týden"). Důvod jde jen k
 * zamítnutí — u schválení ho UI nenabízí a „schváleno · …" by mátlo.
 */
export function textRozhodnutiVolna(o: { od: string; doDne: string; status: 'approved' | 'rejected' | null; terminUpraven: boolean; duvod?: string | null }): string {
  const termin = o.od === o.doDne ? o.od : `${o.od} až ${o.doDne}`;
  const upraveno = o.terminUpraven && o.status ? ' (termín upraven vedením)' : '';
  const duvod = o.status === 'rejected' && o.duvod ? ` · ${o.duvod}` : '';
  return `${termin}${upraveno}${duvod}`;
}

/**
 * Má být sbalené „Moje žádosti (n)" na Dostupnosti rovnou otevřené? Ano, když
 * nějaká žádost čeká, nebo je zamítnutá a čerstvá (podaná v posledních 14 dnech,
 * nebo termín ještě neproběhl) — důvod zamítnutí má člověk vidět bez hledání.
 * Schválené a staré zamítnuté jsou historie, ty zůstanou sbalené.
 */
export function otevritMojeZadosti(zadosti: readonly { status: string; toDate: string; fromDate?: string; createdAt?: string | null }[], dnes: string): boolean {
  const pred14 = dayPlus(dnes, -14);
  return zadosti.some(z => {
    if (z.status === 'pending') return true;
    if (z.status !== 'rejected') return false;
    const podano = parseDbTime(z.createdAt ?? null);
    return (podano != null && pragueDayOf(podano) >= pred14) || den(z.toDate || z.fromDate) >= dnes;
  });
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
