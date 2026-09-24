import { NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { pragueDayOf, parseDbTime } from '@/lib/pragueTime';

/** Pražský den hodnocení; prázdný, když čas z databáze nedává smysl. */
const dayOf = (v: any) => { const t = parseDbTime(v); return t ? pragueDayOf(t) : ''; };
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export async function GET() {
  const ctx = await pozaduj('zakaznici.recenze');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const reviews = await sql`
    SELECT v.id, v.ref, v.rating, v.note, v.created_at, us.name AS customer_name
    FROM client_reviews v JOIN users us ON us.id = v.customer_id
    WHERE v.team_id = ${u.team_id} ORDER BY v.created_at DESC LIMIT 200` as any[];
  const [agg] = await sql`SELECT COUNT(*)::int AS n, ROUND(AVG(rating)::numeric, 2)::float AS avg FROM client_reviews WHERE team_id = ${u.team_id}` as any[];
  const dist = [1, 2, 3, 4, 5].map(r => reviews.filter(x => Number(x.rating) === r).length);

  // Kdo ten den obsluhoval. Slabé hodnocení bez jména směny se nedá s nikým
  // probrat — a dobré hodnocení se nedá nikomu pochválit. Bere se z docházky,
  // ne z rozvrhu: rozhoduje, kdo opravdu přišel.
  const days = Array.from(new Set(reviews.map(r => dayOf(r.created_at)).filter(Boolean)));
  const crew: Record<string, { name: string; avatar: string }[]> = {};
  if (days.length) {
    try {
      const rows = await sql`
        SELECT to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') AS day,
               us.name, us.avatar
        FROM time_entries te JOIN users us ON us.id = te.employee_id
        WHERE te.team_id = ${u.team_id}
          AND to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ANY(${days})
        GROUP BY 1, us.name, us.avatar
        ORDER BY 1` as any[];
      for (const r of rows) (crew[String(r.day)] ||= []).push({ name: String(r.name), avatar: String(r.avatar ?? '👤') });
    } catch { /* bez docházky se hodnocení zobrazí samo o sobě */ }
  }
  for (const r of reviews) r.crew = crew[dayOf(r.created_at)] ?? [];

  return NextResponse.json({ reviews, count: Number(agg?.n) || 0, avg: agg?.avg ?? null, dist });
}
