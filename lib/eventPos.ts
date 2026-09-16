// Okno akce v pokladně: kolik se namarkovalo mezi startem a koncem akce.
// Sdílí to detail akce (/api/events/[id]/pos) i denní uzávěrka (rozpis
// event_breakdown). Výjezd s vlastním terminálem čte JINOU provozovnu
// (events.pos_place_id) — tržby dvou kas se tak nemíchají.

import { billsInRange, type PosConnection } from './storyous';
import { dayPlus } from './pragueTime';

/** ISO čas účtenky → „HH:MM" v Praze. */
export function pragueHM(iso: string): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  } catch { return '00:00'; }
}

export interface EventWindow { revenue: number; bills: number; from: string | null; till: string | null; }

/** Bez konce se bere start + 4 hodiny; bez začátku celý obchodní den. */
export function windowOf(startTime: string | null, endTime: string | null): { from: string | null; till: string | null } {
  const from = startTime ? String(startTime).slice(0, 5) : null;
  const till = endTime
    ? String(endTime).slice(0, 5)
    : from ? `${String(Math.min(23, parseInt(from) + 4)).padStart(2, '0')}${from.slice(2)}` : null;
  return { from, till };
}

export async function eventWindowFromPos(
  conn: PosConnection,
  ev: { date: string; startTime: string | null; endTime: string | null; posPlaceId?: string | null },
  maxPages = 40,
): Promise<EventWindow> {
  // Jiná provozovna = stejné přihlášení, jiný place v cestě.
  const useConn = ev.posPlaceId ? { ...conn, placeId: ev.posPlaceId } : conn;
  const { from, till } = windowOf(ev.startTime, ev.endTime);
  let revenue = 0, bills = 0;
  await billsInRange(useConn, ev.date, dayPlus(ev.date, 2), (b) => {
    if (b.day !== ev.date || b.deleted || b.refunded) return;
    if (from) {
      const hm = pragueHM(b.paidAt ?? b.createdAt);
      if (hm < from || (till != null && hm > till)) return;
    }
    revenue += Number(b.finalPrice) || 0;
    bills++;
  }, maxPages);
  return { revenue: Math.round(revenue), bills, from, till };
}
