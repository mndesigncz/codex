// Shared step model for procedures (postupy) and guides (návody).
// Steps are stored as JSON. Historically they were plain strings; we now
// support rich objects { text, minutes, note, emoji } and stay fully
// backward-compatible by normalizing strings on read.

export interface Step {
  text: string;
  minutes: number | null;
  note: string | null;
  emoji: string | null;
  /** How much this step matters for auto-scoring. Default 'normal'. */
  weight: StepWeight;
  /** Override of the minus points when the step isn't done (positive number). */
  penalty: number | null;
  /**
   * Návod, podle kterého se krok dělá.
   *
   * `note` je jedna věta („Nechat nahřát před prvním kafem."). Krok
   * „Vyčistit kávovar" ale potřebuje celý postup — a ten v aplikaci
   * existuje, jen se k němu obsluha za provozu nedostala jinak než přes
   * záložku Návody a hledání.
   */
  guideId: number | null;
  /**
   * Měřená hodnota (kolo 7, HACCP): krok „Změřit teplotu lednice" chce číslo, ne jen
   * fajfku. 'number' = v běhu se zapíše číslo s jednotkou a odškrtnout jde až s ním;
   * mimo rozsah valueMin–valueMax se ukáže varování (neblokuje). Starý krok = null.
   * Nepovinné v typu (parseStep je doplní vždy), ať ručně skládané kroky jinde nemusí nic měnit.
   */
  valueKind?: 'number' | null;
  /** Jednotka u pole (°C, ml, Kč…), nejvýš 8 znaků. */
  valueUnit?: string | null;
  valueMin?: number | null;
  valueMax?: number | null;
}

/** Nejdelší jednotka měřené hodnoty. */
export const MAX_JEDNOTKA = 8;

export type StepWeight = 'minor' | 'normal' | 'key';

export const STEP_WEIGHTS: { id: StepWeight; label: string; plus: number; minus: number; hint: string }[] = [
  { id: 'key', label: 'Klíčový', plus: 2, minus: 3, hint: 'Bez něj směna nedopadla dobře.' },
  { id: 'normal', label: 'Běžný', plus: 1, minus: 1, hint: 'Standardní krok postupu.' },
  { id: 'minor', label: 'Drobný', plus: 0, minus: 0, hint: 'Nice-to-have, neboduje se.' },
];

export function weightSpec(w: StepWeight) {
  return STEP_WEIGHTS.find(x => x.id === w) ?? STEP_WEIGHTS[1];
}

/** Minus points for a missed step: explicit override wins, else by weight. */
export function stepPenalty(s: Step): number {
  if (s.penalty != null && Number.isFinite(s.penalty)) return Math.max(0, Math.round(s.penalty));
  return weightSpec(s.weight).minus;
}

/** Plus points for a done step, by weight. */
export function stepPlus(s: Step): number {
  return weightSpec(s.weight).plus;
}

/**
 * Číslo z pole, jak ho píše člověk: desetinná čárka i tečka, mezery, minus („-1,5").
 * Prázdné nebo nesmysl = null. Pole je textové s inputMode="decimal" (check-decimal-inputs).
 */
export function cisloZTextu(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\s/g, '').replace('−', '-').replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const meze = (v: unknown): number | null => (v == null || v === '' ? null : cisloZTextu(v as any));

/** Měřená hodnota kroku z uloženého JSON — staré kroky (bez valueKind) mají všude null. */
function hodnotaKroku(raw: any): Pick<Step, 'valueKind' | 'valueUnit' | 'valueMin' | 'valueMax'> {
  if (raw?.valueKind !== 'number') return { valueKind: null, valueUnit: null, valueMin: null, valueMax: null };
  const jednotka = raw.valueUnit == null ? '' : String(raw.valueUnit).trim().slice(0, MAX_JEDNOTKA);
  let od = meze(raw.valueMin);
  let po = meze(raw.valueMax);
  // Prohozené meze („od 6 do 2") se srovnají, ať „mimo rozsah" neplatí pro všechno.
  if (od != null && po != null && od > po) [od, po] = [po, od];
  return { valueKind: 'number', valueUnit: jednotka || null, valueMin: od, valueMax: po };
}

export function parseStep(raw: any): Step {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const m = Number(raw.minutes);
    const pen = Number(raw.penalty);
    const g = Number(raw.guideId);
    return {
      text: String(raw.text ?? '').trim(),
      minutes: Number.isFinite(m) && m > 0 ? Math.round(m) : null,
      note: raw.note ? String(raw.note).trim() : null,
      emoji: raw.emoji ? String(raw.emoji).trim().slice(0, 4) : null,
      weight: raw.weight === 'key' || raw.weight === 'minor' ? raw.weight : 'normal',
      penalty: Number.isFinite(pen) && pen >= 0 ? Math.round(pen) : null,
      guideId: Number.isFinite(g) && g > 0 ? Math.round(g) : null,
      ...hodnotaKroku(raw),
    };
  }
  return { text: String(raw ?? '').trim(), minutes: null, note: null, emoji: null, weight: 'normal', penalty: null, guideId: null, valueKind: null, valueUnit: null, valueMin: null, valueMax: null };
}

/**
 * Naměřené hodnoty průběhu, jak je pošle klient: jen konečná čísla (i „4,2" jako text),
 * klíče = indexy kroků 0 … total−1; zbytek se zahodí. Na tři desetinná místa, |n| ≤ 1 000 000.
 */
export function normalizujHodnoty(raw: unknown, total: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const max = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{1,4}$/.test(k)) continue;
    const i = Number(k);
    if (i >= max) continue;
    const n = cisloZTextu(v);
    if (n == null || Math.abs(n) > 1_000_000) continue;
    out[String(i)] = Math.round(n * 1000) / 1000;
  }
  return out;
}

/** „4,2 °C" — číslo podle jazyka (formátovač dodá volající), jednotka za mezerou. */
export function hodnotaSJednotkou(n: number, jednotka: string | null, cislo: (n: number) => string): string {
  return jednotka ? `${cislo(n)} ${jednotka}` : cislo(n);
}

/** Rozsah kroku bez slov (nepotřebuje překlad): „2–6 °C", „≥ 2 °C", „≤ 6 °C"; bez mezí null. */
export function rozsahKroku(s: Pick<Step, 'valueMin' | 'valueMax' | 'valueUnit'>, cislo: (n: number) => string): string | null {
  const j = s.valueUnit ? ` ${s.valueUnit}` : '';
  if (s.valueMin != null && s.valueMax != null) return `${cislo(s.valueMin)}–${cislo(s.valueMax)}${j}`;
  if (s.valueMin != null) return `≥ ${cislo(s.valueMin)}${j}`;
  if (s.valueMax != null) return `≤ ${cislo(s.valueMax)}${j}`;
  return null;
}

/** Je hodnota mimo rozsah kroku? Chybějící mez se nehlídá; bez hodnoty nebo bez měření = false. */
export function mimoRozsah(s: Pick<Step, 'valueKind' | 'valueMin' | 'valueMax'>, hodnota: number | null | undefined): boolean {
  if (s.valueKind !== 'number' || hodnota == null || !Number.isFinite(hodnota)) return false;
  if (s.valueMin != null && hodnota < s.valueMin) return true;
  if (s.valueMax != null && hodnota > s.valueMax) return true;
  return false;
}

export function parseSteps(items: any): Step[] {
  return Array.isArray(items) ? items.map(parseStep).filter(s => s.text) : [];
}

// Serialize back to storage — omit empty optional fields to keep JSON tidy
// and keep plain-string compatibility when a step carries only text.
export function serializeStep(s: Step): string | Record<string, any> {
  const plainWeight = !s.weight || s.weight === 'normal';
  const meri = s.valueKind === 'number';
  if (!s.minutes && !s.note && !s.emoji && plainWeight && s.penalty == null && s.guideId == null && !meri) return s.text;
  const out: Record<string, any> = { text: s.text };
  if (s.minutes) out.minutes = s.minutes;
  if (s.note) out.note = s.note;
  if (s.emoji) out.emoji = s.emoji;
  if (!plainWeight) out.weight = s.weight;
  if (s.penalty != null) out.penalty = s.penalty;
  if (s.guideId != null) out.guideId = s.guideId;
  if (meri) {
    out.valueKind = 'number';
    if (s.valueUnit) out.valueUnit = s.valueUnit;
    if (s.valueMin != null) out.valueMin = s.valueMin;
    if (s.valueMax != null) out.valueMax = s.valueMax;
  }
  return out;
}

// Normalize arbitrary client input into tidy storable steps (strings or objects).
export function sanitizeSteps(input: any): (string | Record<string, any>)[] {
  return parseSteps(input).map(serializeStep);
}

export function totalMinutes(steps: Step[]): number {
  return steps.reduce((a, s) => a + (s.minutes || 0), 0);
}

export function fmtMinutes(min: number): string {
  if (min <= 0) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// "9:00 – 9:42" style range from a start Date plus total minutes.
export function timeRange(start: Date, min: number): string {
  const fmt = (d: Date) => d.toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' });
  const end = new Date(start.getTime() + min * 60000);
  return `${fmt(start)} – ${fmt(end)}`;
}
