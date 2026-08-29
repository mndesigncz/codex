// The business day runs on Europe/Prague wall clock; the server and DB run on
// UTC. Every "what day is it" for shifts, closings and attendance must go
// through these helpers — new Date().toISOString() flips to the wrong day
// between midnight and ~2:00 Prague time.

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
});
const hmFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** YYYY-MM-DD in Prague, optionally shifted by whole days. */
export function pragueToday(offsetDays = 0): string {
  return dayFmt.format(new Date(Date.now() + offsetDays * 86400000));
}

/** YYYY-MM-DD in Prague for an arbitrary timestamp. */
export function pragueDayOf(d: Date): string {
  return dayFmt.format(d);
}

/** Same as pragueDayOf, but a malformed timestamp yields '' instead of
 *  throwing — one bad row must never take a whole screen down with it. */
export function pragueDaySafe(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isNaN(d.getTime()) ? '' : dayFmt.format(d);
}

/** HH:MM wall-clock in Prague for an arbitrary timestamp (defaults to now). */
export function pragueHM(d: Date = new Date()): string {
  return hmFmt.format(d);
}

/** Hodina 0–23 podle pražských hodin na zdi. Řezat 11.–13. znak z ISO řetězce
 *  by dalo hodinu v UTC — špičku v 19:00 by to v létě ukázalo v 17:00. */
export function pragueHourOf(d: Date): number | null {
  if (Number.isNaN(d.getTime())) return null;
  const h = parseInt(hmFmt.format(d).slice(0, 2), 10);
  return Number.isFinite(h) ? h : null;
}

/** Current Prague UTC offset as "+01:00" / "+02:00" (DST-aware). */
function offsetAt(at: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Prague', timeZoneName: 'longOffset',
  }).formatToParts(at);
  const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  const off = tz.replace('GMT', '');
  return /^[+-]\d{2}:\d{2}$/.test(off) ? off : '+01:00';
}

/** A Prague wall-clock "HH:MM" on a given YYYY-MM-DD as an absolute instant. */
export function pragueMomentOf(dateStr: string, hhmm: string): Date | null {
  const t = String(hhmm ?? '').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(t)) return null;
  const guess = new Date(`${dateStr}T${t}:00+01:00`);
  if (Number.isNaN(guess.getTime())) return null;
  const d = new Date(`${dateStr}T${t}:00${offsetAt(guess)}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD shifted by whole days. */
export function dayPlus(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
