// Shared step model for procedures (postupy) and guides (návody).
// Steps are stored as JSON. Historically they were plain strings; we now
// support rich objects { text, minutes, note, emoji } and stay fully
// backward-compatible by normalizing strings on read.

export interface Step {
  text: string;
  minutes: number | null;
  note: string | null;
  emoji: string | null;
}

export function parseStep(raw: any): Step {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const m = Number(raw.minutes);
    return {
      text: String(raw.text ?? '').trim(),
      minutes: Number.isFinite(m) && m > 0 ? Math.round(m) : null,
      note: raw.note ? String(raw.note).trim() : null,
      emoji: raw.emoji ? String(raw.emoji).trim().slice(0, 4) : null,
    };
  }
  return { text: String(raw ?? '').trim(), minutes: null, note: null, emoji: null };
}

export function parseSteps(items: any): Step[] {
  return Array.isArray(items) ? items.map(parseStep).filter(s => s.text) : [];
}

// Serialize back to storage — omit empty optional fields to keep JSON tidy
// and keep plain-string compatibility when a step carries only text.
export function serializeStep(s: Step): string | Record<string, any> {
  if (!s.minutes && !s.note && !s.emoji) return s.text;
  const out: Record<string, any> = { text: s.text };
  if (s.minutes) out.minutes = s.minutes;
  if (s.note) out.note = s.note;
  if (s.emoji) out.emoji = s.emoji;
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
