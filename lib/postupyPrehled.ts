// Postupy — čistá logika pro widgety a nástroj stránky Postupy (kolo 69, balík B6b).
//
// Bez Reactu a bez databáze, ať ji hlídají jednotkové testy (scripts/testy/k69-b6b.ts)
// a ať se widgety a nástroj stránky shodnou na tom, co je „povinné dnes", „poslední
// průběh" nebo „připomínka dnes". Dřív si to každé místo počítalo samo: ReminderWatcher
// měl vlastní výpočet času připomínky, uzávěrka vlastní seznam povinných postupů
// a karta postupu hledala poslední běh podle NÁZVU (přejmenovaný postup o historii přišel).
//
// Relativní importy s příponou: `npm test` pouští .ts přímo v Node.

import { parseSteps } from './steps.ts';

/** Postup, jak ho vrací GET /api/procedures (jen pole, která tu potřebujeme). */
export interface PostupApi {
  id: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  items?: unknown;
  approved?: boolean;
  submittedBy?: number | null;
  remindAt?: string | null;
  remindDays?: number[] | null;
  remindAnchor?: string | null;
  requireBeforeClosing?: boolean;
}

export interface OteviraciDoba { open: string; close: string; closed: boolean }

export interface DataPostupu {
  postupy: PostupApi[];
  maSmenuDnes: boolean;
  oteviraciDoba: OteviraciDoba;
}

/** Průběh z GET /api/procedures/runs (tým, vlastní i ?today=team mají stejná jména sloupců). */
export interface PrubehApi {
  id: number;
  procedure_id?: number | null;
  procedure_name?: string | null;
  procedure_icon?: string | null;
  user_id?: number | null;
  user_name?: string | null;
  user_avatar?: string | null;
  status?: string | null;
  total_items?: number | null;
  checked_items?: unknown;
  skipped_items?: unknown;
  skip_reasons?: unknown;
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
}

/** Událost, kterou widget požádá nástroj stránky o otevření detailu postupu (bez navigace). */
export const UDALOST_OTEVRIT_POSTUP = 'postupy:otevrit';
export const URL_POSTUPY = '/api/procedures';
export const URL_PRUBEHY = '/api/procedures/runs';
export const URL_PRUBEHY_DNES = '/api/procedures/runs?today=team';

const pole = (v: unknown): number[] => (Array.isArray(v) ? v.filter(x => Number.isInteger(x)) as number[] : []);

/**
 * Vybere z odpovědi /api/procedures, co widgety a nástroj potřebují. Nečekaný tvar
 * je chyba (widget ukáže ErrorState), ne prázdný seznam — podle „povinných postupů"
 * se zavírá podnik a „žádné nejsou" po výpadku by byla lež.
 */
export function vyberPostupy(raw: any): DataPostupu {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.procedures)) throw new Error('Postupy přišly v nečekaném tvaru.');
  const oh = raw.openingToday;
  return {
    postupy: raw.procedures.filter((p: any) => p && Number.isFinite(Number(p.id))).map((p: any) => ({ ...p, id: Number(p.id), name: String(p.name ?? '') })),
    maSmenuDnes: raw.hasShiftToday === true,
    oteviraciDoba: oh && typeof oh === 'object'
      ? { open: String(oh.open ?? '08:00'), close: String(oh.close ?? '20:00'), closed: oh.closed === true }
      : { open: '08:00', close: '20:00', closed: false },
  };
}

export function vyberPrubehy(raw: any): PrubehApi[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.runs)) throw new Error('Průběhy postupů přišly v nečekaném tvaru.');
  return raw.runs;
}

/** Schválený = spustitelný. Návrh (approved === false) nikdo nespouští. */
export const jeSchvaleny = (p: PostupApi) => p.approved !== false;

/** Návrhy ke schválení (API je vrací jen tomu, kdo smí schvalovat). */
export function navrhyPostupu(postupy: readonly PostupApi[]): PostupApi[] {
  return postupy.filter(p => p.approved === false);
}

export interface PovinnyDnes {
  id: number;
  nazev: string;
  ikona: string;
  hotovo: boolean;
  /** Kdo ho dnes dokončil (poslední dokončení), když je hotový. */
  kdo: string | null;
}

/**
 * Povinné postupy před uzávěrkou a jestli je dnes někdo z týmu dokončil.
 * Páruje se podle ID postupu, ne podle názvu (přejmenování nesmí hotový postup „odhotovit").
 * Čekající jdou nahoru — to je to, co ještě brání uzávěrce.
 */
export function povinneDnes(postupy: readonly PostupApi[], dnesniBehy: readonly PrubehApi[]): PovinnyDnes[] {
  const hotove = new Map<number, string | null>();
  for (const r of dnesniBehy) {
    if (r.status !== 'completed' || r.procedure_id == null) continue;
    if (!hotove.has(Number(r.procedure_id))) hotove.set(Number(r.procedure_id), r.user_name ? String(r.user_name) : null);
  }
  return postupy
    .filter(p => p.requireBeforeClosing === true && jeSchvaleny(p))
    .map(p => ({ id: p.id, nazev: p.name, ikona: p.icon || 'check', hotovo: hotove.has(p.id), kdo: hotove.get(p.id) ?? null }))
    .sort((a, b) => Number(a.hotovo) - Number(b.hotovo));
}

export interface RadekPrubehu {
  id: number;
  postupId: number | null;
  nazev: string;
  kdo: string;
  kdoId: number | null;
  avatar: string | null;
  /** Kdy skončil (nebo začal, když ještě běží) — surový čas z DB. */
  kdy: string | null;
  hotovo: boolean;
  sekund: number | null;
  celkem: number;
  odskrtano: number;
  /** Kroky, které nejsou odškrtnuté ani přeskočené s důvodem — „nedokončeno". */
  nedokonceno: number;
}

const casPrubehu = (r: PrubehApi) => String(r.completed_at || r.started_at || '');

/** Poslední průběhy, nejnovější nahoře, nejvýš `pocet`. */
export function posledniPrubehy(behy: readonly PrubehApi[], pocet: number): RadekPrubehu[] {
  return [...behy]
    .sort((a, b) => casPrubehu(b).localeCompare(casPrubehu(a)))
    .slice(0, Math.max(0, pocet))
    .map(r => {
      const odsk = pole(r.checked_items).length;
      const celkem = Math.max(0, Number(r.total_items) || 0);
      return {
        id: Number(r.id),
        postupId: r.procedure_id != null ? Number(r.procedure_id) : null,
        nazev: String(r.procedure_name ?? 'Postup'),
        kdo: String(r.user_name ?? ''),
        kdoId: r.user_id != null ? Number(r.user_id) : null,
        avatar: r.user_avatar ?? null,
        kdy: casPrubehu(r) || null,
        hotovo: r.status === 'completed',
        sekund: r.duration_seconds != null && Number.isFinite(Number(r.duration_seconds)) ? Number(r.duration_seconds) : null,
        celkem,
        odskrtano: odsk,
        // Stejně jako dřív na kartě průběhu: chybí = celkem − odškrtnuté (přeskočené se počítají jako nesplněné).
        nedokonceno: Math.max(0, celkem - odsk),
      };
    });
}

/** Poslední DOKONČENÍ postupu podle ID (karta „Spustit postup", řádek nástroje). */
export function posledniDokonceni(behy: readonly PrubehApi[], postupId: number): PrubehApi | null {
  let nej: PrubehApi | null = null;
  for (const r of behy) {
    if (r.status !== 'completed' || Number(r.procedure_id) !== postupId) continue;
    if (!nej || casPrubehu(r) > casPrubehu(nej)) nej = r;
  }
  return nej;
}

/** Délka průběhu „m:ss" (tabulková čísla, jak ji ukazoval seznam průběhů). */
export function delka(sekund: number | null): string {
  if (sekund == null || !Number.isFinite(sekund) || sekund < 0) return '';
  const m = Math.floor(sekund / 60);
  const s = Math.round(sekund % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface PreskocenyKrok {
  postupId: number | null;
  postup: string;
  krok: string;
  index: number;
  pocet: number;
  /** Nejčastější důvod (id z SKIP_REASONS), nebo null. */
  duvod: string | null;
  lide: string[];
}

/**
 * Nejčastěji přeskakované kroky za posledních `dni` dní (počítáno od `dnes`, YYYY-MM-DD).
 * Text kroku se bere z aktuálního postupu (průběh ukládá jen index); krok, který už
 * v postupu není, se ukáže jako „Krok N" — i ten je kandidát na rozhovor.
 * API vrací posledních 50 průběhů, delší období tedy nanejvýš tolik.
 */
export function preskoceneKroky(
  behy: readonly PrubehApi[], postupy: readonly PostupApi[], dni: number, dnes: string,
): PreskocenyKrok[] {
  const od = posunDen(dnes, -(Math.max(1, dni) - 1));
  const kroky = new Map<number, string[]>();
  for (const p of postupy) kroky.set(p.id, parseSteps(p.items).map(s => s.text));
  const mapa = new Map<string, PreskocenyKrok & { duvody: Map<string, number> }>();
  for (const r of behy) {
    const den = String(r.completed_at || r.started_at || '').slice(0, 10);
    if (!den || den < od || den > dnes) continue;
    const duvody = r.skip_reasons && typeof r.skip_reasons === 'object' && !Array.isArray(r.skip_reasons) ? r.skip_reasons as Record<string, any> : {};
    for (const i of pole(r.skipped_items)) {
      const pid = r.procedure_id != null ? Number(r.procedure_id) : null;
      const klic = `${pid ?? r.procedure_name}:${i}`;
      let z = mapa.get(klic);
      if (!z) {
        const text = pid != null ? kroky.get(pid)?.[i] : undefined;
        z = { postupId: pid, postup: String(r.procedure_name ?? 'Postup'), krok: text || `Krok ${i + 1}`, index: i, pocet: 0, duvod: null, lide: [], duvody: new Map() };
        mapa.set(klic, z);
      }
      z.pocet += 1;
      const d = duvody[String(i)]?.reason;
      if (typeof d === 'string' && d) z.duvody.set(d, (z.duvody.get(d) ?? 0) + 1);
      const kdo = r.user_name ? String(r.user_name) : '';
      if (kdo && !z.lide.includes(kdo)) z.lide.push(kdo);
    }
  }
  return [...mapa.values()]
    .map(({ duvody, ...z }) => ({ ...z, duvod: [...duvody.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null }))
    .sort((a, b) => b.pocet - a.pocet || a.postup.localeCompare(b.postup, 'cs') || a.index - b.index);
}

/** YYYY-MM-DD posunuté o `o` dní (kalendářně, bez časové zóny). */
export function posunDen(den: string, o: number): string {
  const d = new Date(`${den}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + o);
  return d.toISOString().slice(0, 10);
}

/** Den v týdnu podle remind_days: 0 = pondělí … 6 = neděle. */
export function denTydne(den: string): number {
  return (new Date(`${den}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** Čas připomínky dnes: pevný, nebo otevření/zavření podle dnešní otevírací doby; null = dnes ne. */
export function casPripominky(p: PostupApi, oh: OteviraciDoba): string | null {
  if (p.remindAnchor === 'open') return oh.closed ? null : oh.open;
  if (p.remindAnchor === 'close') return oh.closed ? null : oh.close;
  return p.remindAt && /^\d{2}:\d{2}$/.test(p.remindAt) ? p.remindAt : null;
}

export interface PripominkaDnes {
  id: number;
  nazev: string;
  cas: string;
  kotva: 'time' | 'open' | 'close';
  /** Čas už dnes minul (podle `ted` HH:MM). */
  minula: boolean;
}

/**
 * Které schválené postupy mají dnes připomínku a kdy — stejné pravidlo jako
 * ReminderWatcher (dny v týdnu, kotva k otevírací době, zavřeno = nic).
 */
export function pripominkyDnes(postupy: readonly PostupApi[], oh: OteviraciDoba, den: string, ted: string): PripominkaDnes[] {
  const dt = denTydne(den);
  const out: PripominkaDnes[] = [];
  for (const p of postupy) {
    if (!jeSchvaleny(p)) continue;
    const cas = casPripominky(p, oh);
    if (!cas) continue;
    const dny = Array.isArray(p.remindDays) ? p.remindDays : [];
    if (dny.length > 0 && !dny.includes(dt)) continue;
    const kotva = p.remindAnchor === 'open' || p.remindAnchor === 'close' ? p.remindAnchor : 'time';
    out.push({ id: p.id, nazev: p.name, cas, kotva, minula: cas < ted });
  }
  return out.sort((a, b) => a.cas.localeCompare(b.cas) || a.nazev.localeCompare(b.nazev, 'cs'));
}

/** Krátký popis spouštěče připomínky do řádku postupu. */
export function popisPripominky(p: PostupApi): string | null {
  if (p.remindAnchor === 'open') return 'Při otevření';
  if (p.remindAnchor === 'close') return 'Při zavření';
  return p.remindAt ? `V ${p.remindAt}` : null;
}
