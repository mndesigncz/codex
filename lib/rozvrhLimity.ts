// Zákonné a smluvní limity rozvrhu (kolo 8, balík R8-3): odpočinek mezi směnami,
// nejdelší směna a hodiny za týden. Čistá logika bez Reactu a bez databáze —
// plánovač z ní kreslí chipy u směn a souhrn „3 varování", okno dne větu
// s „Přesto přidat", generátor (lib/rozvrhGenerator.ts) jí hlídá kandidáty.
//
// Deputy tomu říká „stress profile" (max hours per shift / week, gap between
// shifts) a porušení jen hlásí; stejně tady: varování, ne zámek. Vedení ví, proč
// v sobotu zavírá a v neděli otvírá tentýž člověk — jen to má vidět dřív než
// inspektorát. Zákonné výchozí: 11 h odpočinku (§ 90 ZP), 12 h na směnu (§ 83),
// 40 h týdně (§ 79); každý limit jde vypnout (null).

export interface LimityRozvrhu {
  /** Nejméně hodin mezi koncem jedné a začátkem další směny; null = nehlídá se. */
  minRestHours: number | null;
  /** Nejvíc hodin na jednu směnu; null = nehlídá se. */
  maxShiftHours: number | null;
  /** Nejvíc hodin za kalendářní týden; null = nehlídá se. */
  maxWeekHours: number | null;
}

export const BEZ_LIMITU: LimityRozvrhu = { minRestHours: null, maxShiftHours: null, maxWeekHours: null };
/** Zákonné výchozí hodnoty pro nabídku v Pravidlech (předvyplnit, ne vnutit). */
export const ZAKONNE_LIMITY: LimityRozvrhu = { minRestHours: 11, maxShiftHours: 12, maxWeekHours: 40 };

const cele = (v: unknown, min: number, max: number): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(max, Math.max(min, n));
};

/** Vyčištěné limity z těla požadavku nebo řádku teams (NULL = vypnuto; nesmysl = vypnuto). */
export function vycistiLimity(raw: unknown): LimityRozvrhu {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    minRestHours: cele(r.minRestHours ?? r.min_rest_hours, 1, 24),
    maxShiftHours: cele(r.maxShiftHours ?? r.max_shift_hours, 1, 24),
    maxWeekHours: cele(r.maxWeekHours ?? r.max_week_hours, 1, 168),
  };
}

export interface SmenaLimitu {
  /** Klíč, pod kterým plánovač směnu kreslí (id uložené, složený klíč návrhu). */
  klic: string;
  employeeId: number;
  date: string;
  startTime: string;
  endTime: string;
}

export type DruhVarovani = 'odpocinek' | 'smena' | 'tyden';

export interface VarovaniSmeny {
  klic: string;
  employeeId: number;
  date: string;
  druh: DruhVarovani;
  /** Skutečná hodnota (hodiny odpočinku, délka směny, hodiny v týdnu), zaokrouhlená na desetiny. */
  hodnota: number;
  limit: number;
}

const toMin = (hm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm ?? ''));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 24 || mi > 59 ? null : h * 60 + mi;
};
const denIndex = (date: string): number | null => {
  const t = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 86_400_000) : null;
};
const des = (n: number) => Math.round(n * 10) / 10;

/** Den v týdnu 0 = pondělí … 6 = neděle. */
const dnTydne = (date: string): number => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
/** Klíč týdne (jeho první den) podle začátku týdne podniku: 1 = pondělí, 0 = neděle. */
export function klicTydne(date: string, zacatek: 0 | 1): string {
  const poradi = zacatek === 1 ? dnTydne(date) : (dnTydne(date) + 1) % 7;
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - poradi);
  return d.toISOString().slice(0, 10);
}

interface Usek extends SmenaLimitu { od: number; do: number; hodin: number }

function useky(smeny: readonly SmenaLimitu[]): Usek[] {
  const out: Usek[] = [];
  for (const s of smeny) {
    const d = denIndex(s.date), a = toMin(s.startTime), b = toMin(s.endTime);
    if (d == null || a == null || b == null) continue;
    const od = d * 1440 + a;
    // Noční směna (konec ≤ začátek) jde přes půlnoc.
    const doM = od + (b <= a ? b + 1440 - a : b - a);
    out.push({ ...s, od, do: doM, hodin: (doM - od) / 60 });
  }
  return out.sort((x, y) => x.od - y.od || x.do - y.do || x.klic.localeCompare(y.klic));
}

/**
 * Varování nad směnami (uložené i navržené dohromady): u každé směny, která limit
 * poruší. Odpočinek se připisuje té pozdější ze dvou příliš blízkých směn (ta
 * „přišla po příliš krátké pauze"); překryv (kolize) se tu neřeší — hlídá ho
 * okno dne. Týdenní strop dostane směna, kterou se týden přehoupne, a každá další
 * v tom týdnu — číslo je celkový součet týdne, ať je vidět, o kolik to přetéká.
 */
export function varovaniLimitu(smeny: readonly SmenaLimitu[], limity: LimityRozvrhu, zacatek: 0 | 1 = 1): VarovaniSmeny[] {
  const out: VarovaniSmeny[] = [];
  if (limity.minRestHours == null && limity.maxShiftHours == null && limity.maxWeekHours == null) return out;
  const poLidech = new Map<number, Usek[]>();
  for (const u of useky(smeny)) {
    const arr = poLidech.get(u.employeeId) ?? [];
    arr.push(u);
    poLidech.set(u.employeeId, arr);
  }
  for (const [employeeId, list] of poLidech) {
    const tydny = new Map<string, number>();
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (limity.maxShiftHours != null && u.hodin > limity.maxShiftHours + 1e-9) {
        out.push({ klic: u.klic, employeeId, date: u.date, druh: 'smena', hodnota: des(u.hodin), limit: limity.maxShiftHours });
      }
      if (limity.minRestHours != null && i > 0) {
        // Nejpozdější konec ze všech předchozích — při dvou směnách v jednom dni rozhoduje ta, co končí později.
        const konecPred = Math.max(...list.slice(0, i).map(x => x.do));
        const mezera = (u.od - konecPred) / 60;
        if (mezera >= 0 && mezera < limity.minRestHours - 1e-9) {
          out.push({ klic: u.klic, employeeId, date: u.date, druh: 'odpocinek', hodnota: des(mezera), limit: limity.minRestHours });
        }
      }
      if (limity.maxWeekHours != null) {
        const k = klicTydne(u.date, zacatek);
        const soucet = (tydny.get(k) ?? 0) + u.hodin;
        tydny.set(k, soucet);
        if (soucet > limity.maxWeekHours + 1e-9) {
          const celyTyden = list.filter(x => klicTydne(x.date, zacatek) === k).reduce((n, x) => n + x.hodin, 0);
          out.push({ klic: u.klic, employeeId, date: u.date, druh: 'tyden', hodnota: des(celyTyden), limit: limity.maxWeekHours });
        }
      }
    }
  }
  return out;
}

/** Varování seskupená podle klíče směny (chip u pilulky). */
export function varovaniPodleSmeny(varovani: readonly VarovaniSmeny[]): Map<string, VarovaniSmeny[]> {
  const m = new Map<string, VarovaniSmeny[]>();
  for (const v of varovani) m.set(v.klic, [...(m.get(v.klic) ?? []), v]);
  return m;
}

/** Souhrn pro lištu nad mřížkou: celkem, po druzích a první den s varováním (kam skočit). */
export function souhrnVarovani(varovani: readonly VarovaniSmeny[]): { celkem: number; odpocinek: number; smena: number; tyden: number; prvniDen: string | null } {
  const s = { celkem: varovani.length, odpocinek: 0, smena: 0, tyden: 0, prvniDen: null as string | null };
  for (const v of varovani) {
    s[v.druh]++;
    if (s.prvniDen == null || v.date < s.prvniDen) s.prvniDen = v.date;
  }
  return s;
}

/**
 * Co by nová směna porušila: rozdíl varování před ní a s ní (i varování, které kvůli
 * ní dopadne na jinou směnu téhož člověka — třeba ranní po přidané noční). Pro okno
 * dne: věta s vysvětlením a „Přesto přidat".
 */
export function varovaniNoveSmeny(
  nova: Omit<SmenaLimitu, 'klic'>, existujici: readonly SmenaLimitu[], limity: LimityRozvrhu, zacatek: 0 | 1 = 1,
): VarovaniSmeny[] {
  const moje = existujici.filter(s => s.employeeId === nova.employeeId);
  const pred = new Set(varovaniLimitu(moje, limity, zacatek).map(v => `${v.klic}|${v.druh}`));
  return varovaniLimitu([...moje, { ...nova, klic: 'nova' }], limity, zacatek).filter(v => !pred.has(`${v.klic}|${v.druh}`));
}

/**
 * Pro generátor: smí člověk s už přidělenými směnami dostat další (date, od–do)?
 * Stejná pravidla jako varování — generátor limity dodrží, ruční plánovač je jen hlásí.
 */
export function smenaVLimitech(
  nova: Omit<SmenaLimitu, 'klic'>, prideleneCloveka: readonly Omit<SmenaLimitu, 'klic'>[], limity: LimityRozvrhu, zacatek: 0 | 1 = 1,
): boolean {
  if (limity.minRestHours == null && limity.maxShiftHours == null && limity.maxWeekHours == null) return true;
  return varovaniNoveSmeny(nova, prideleneCloveka.map((s, i) => ({ ...s, klic: `p${i}` })), limity, zacatek).length === 0;
}
