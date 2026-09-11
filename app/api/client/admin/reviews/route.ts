import { NextResponse } from 'next/server';
import { sql, employer } from '@/lib/client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const reviews = await sql`
    SELECT v.id, v.ref, v.rating, v.note, v.created_at, us.name AS customer_name
    FROM client_reviews v JOIN users us ON us.id = v.customer_id
    WHERE v.team_id = ${u.team_id} ORDER BY v.created_at DESC LIMIT 200` as any[];
  const [agg] = await sql`SELECT COUNT(*)::int AS n, ROUND(AVG(rating)::numeric, 2)::float AS avg FROM client_reviews WHERE team_id = ${u.team_id}` as any[];
  const dist = [1, 2, 3, 4, 5].map(r => reviews.filter(x => Number(x.rating) === r).length);
  return NextResponse.json({ reviews, count: Number(agg?.n) || 0, avg: agg?.avg ?? null, dist });
}
