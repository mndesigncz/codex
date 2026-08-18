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
}

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

export function parseStep(raw: any): Step {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const m = Number(raw.minutes);
    const pen = Number(raw.penalty);
    return {
      text: String(raw.text ?? '').trim(),
      minutes: Number.isFinite(m) && m > 0 ? Math.round(m) : null,
      note: raw.note ? String(raw.note).trim() : null,
      emoji: raw.emoji ? String(raw.emoji).trim().slice(0, 4) : null,
      weight: raw.weight === 'key' || raw.weight === 'minor' ? raw.weight : 'normal',
      penalty: Number.isFinite(pen) && pen >= 0 ? Math.round(pen) : null,
    };
  }
  return { text: String(raw ?? '').trim(), minutes: null, note: null, emoji: null, weight: 'normal', penalty: null };
}

export function parseSteps(items: any): Step[] {
  return Array.isArray(items) ? items.map(parseStep).filter(s => s.text) : [];
}

// Serialize back to storage — omit empty optional fields to keep JSON tidy
// and keep plain-string compatibility when a step carries only text.
export function serializeStep(s: Step): string | Record<string, any> {
  const plainWeight = !s.weight || s.weight === 'normal';
  if (!s.minutes && !s.note && !s.emoji && plainWeight && s.penalty == null) return s.text;
  const out: Record<string, any> = { text: s.text };
  if (s.minutes) out.minutes = s.minutes;
  if (s.note) out.note = s.note;
  if (s.emoji) out.emoji = s.emoji;
  if (!plainWeight) out.weight = s.weight;
  if (s.penalty != null) out.penalty = s.penalty;
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
  const fmt = (d: Date) => d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const end = new Date(start.getTime() + min * 60000);
  return `${fmt(start)} – ${fmt(end)}`;
}
