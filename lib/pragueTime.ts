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

/** HH:MM wall-clock in Prague for an arbitrary timestamp (defaults to now). */
export function pragueHM(d: Date = new Date()): string {
  return hmFmt.format(d);
}
