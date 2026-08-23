// A shift is a span of time, not a calendar day. Night shifts run past midnight,
// so "what happened on this shift" can never be answered by comparing date
// strings — a closing filed at 00:40 belongs to the shift that started at 18:00
// the day before. Everything that attributes work to a shift goes through here.

import { pragueMomentOf, dayPlus } from '@/lib/pragueTime';

export interface ShiftRow {
  id?: number;
  employee_id?: number;
  date?: string;
  start_time?: string | null;
  end_time?: string | null;
  type?: string | null;
}

export interface ShiftWindow {
  /** Absolute start of the shift (or the day, when times are unknown). */
  start: Date;
  /** Absolute end, already rolled to the next day for night shifts. */
  end: Date;
  /** Calendar days the window touches, e.g. ['2026-08-20','2026-08-21']. */
  days: string[];
  /** True when the shift ends on the day after it starts. */
  overnight: boolean;
}

/** Work often spills past the planned end — closing up, last checklist. */
const GRACE_AFTER_MS = 3 * 3600 * 1000;
const GRACE_BEFORE_MS = 60 * 60 * 1000;

/** The whole calendar day in Prague, used when a shift has no usable times. */
export function dayWindow(date: string): ShiftWindow {
  const start = pragueMomentOf(date, '00:00');
  const end = pragueMomentOf(dayPlus(date, 1), '00:00');
  return {
    start: start ?? new Date(`${date}T00:00:00Z`),
    end: end ?? new Date(`${date}T23:59:59Z`),
    days: [date],
    overnight: false,
  };
}

/** Absolute span of one shift row; null when its times can't be read. */
export function windowOf(row: ShiftRow, date?: string): ShiftWindow | null {
  const day = row.date ?? date;
  if (!day || !row.start_time || !row.end_time) return null;
  const start = pragueMomentOf(day, String(row.start_time));
  let end = pragueMomentOf(day, String(row.end_time));
  if (!start || !end) return null;
  // 18:00–02:00 means the end is tomorrow. Equal times mean a full day.
  const overnight = String(row.end_time).slice(0, 5) <= String(row.start_time).slice(0, 5);
  if (overnight) end = pragueMomentOf(dayPlus(day, 1), String(row.end_time)) ?? end;
  return {
    start, end,
    days: overnight ? [day, dayPlus(day, 1)] : [day],
    overnight,
  };
}

/**
 * The span covering everything a person did on their shift(s) that day. With no
 * usable shift rows it falls back to the calendar day, so unplanned days keep
 * behaving exactly as before.
 */
export function shiftSpanFor(rows: ShiftRow[], date: string): ShiftWindow {
  const windows = rows.map(r => windowOf(r, date)).filter(Boolean) as ShiftWindow[];
  if (!windows.length) return dayWindow(date);
  const start = new Date(Math.min(...windows.map(w => w.start.getTime())));
  const end = new Date(Math.max(...windows.map(w => w.end.getTime())));
  const days = Array.from(new Set(windows.flatMap(w => w.days))).sort();
  return { start, end, days, overnight: windows.some(w => w.overnight) };
}

/** The span widened by the grace periods — what actually counts as "on shift". */
export function graceSpan(w: ShiftWindow): { from: Date; to: Date } {
  return {
    from: new Date(w.start.getTime() - GRACE_BEFORE_MS),
    to: new Date(w.end.getTime() + GRACE_AFTER_MS),
  };
}

/** Does an instant fall inside the shift (grace included)? */
export function coveredBy(w: ShiftWindow, at: Date | string | null | undefined): boolean {
  if (!at) return false;
  const t = at instanceof Date ? at.getTime() : new Date(at).getTime();
  if (Number.isNaN(t)) return false;
  const { from, to } = graceSpan(w);
  return t >= from.getTime() && t <= to.getTime();
}

/** Two shifts are "the same shift" when their spans overlap in real time. */
export function shiftsOverlap(a: ShiftRow, b: ShiftRow, date: string): boolean {
  const wa = windowOf(a, date), wb = windowOf(b, date);
  if (!wa || !wb) return true; // unknown times: can't tell them apart
  return wa.start < wb.end && wb.start < wa.end;
}
