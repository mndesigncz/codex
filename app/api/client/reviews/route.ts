// Hodnocení po návštěvě: host dá hvězdy a pár slov k hotové rezervaci nebo
// objednávce. Jedno hodnocení na jednu návštěvu.
import { NextRequest, NextResponse } from 'next/server';
import { sql, customer } from '@/lib/client';
import { notifyTeamEmployers } from '@/lib/client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Co host ještě nehodnotil: hotové návštěvy za posledních 14 dní. */
export async function GET() {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const pending = await sql`
    SELECT x.ref, x.team_id, x.when_at, x.kind, p.slug, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS business
    FROM (
      SELECT 'res:' || r.id AS ref, r.team_id, r.updated_at AS when_at, 'reservation' AS kind FROM client_reservations r
        WHERE r.customer_id = ${me.id} AND r.status = 'done' AND r.updated_at > NOW() - INTERVAL '14 days'
      UNION ALL
      SELECT 'ord:' || o.id, o.team_id, o.updated_at, 'order' FROM client_orders o
        WHERE o.customer_id = ${me.id} AND o.status = 'done' AND o.updated_at > NOW() - INTERVAL '14 days'
    ) x
    JOIN client_profiles p ON p.team_id = x.team_id JOIN teams t ON t.id = x.team_id
    WHERE NOT EXISTS (SELECT 1 FROM client_reviews v WHERE v.customer_id = ${me.id} AND v.ref = x.ref)
    ORDER BY x.when_at DESC LIMIT 5`;
  return NextResponse.json({ pending });
}

export async function POST(req: NextRequest) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const ref = String(b.ref ?? '');
  const rating = Math.max(1, Math.min(5, parseInt(String(b.rating), 10) || 0));
  const note = String(b.note ?? '').trim().slice(0, 500) || null;
  const m = ref.match(/^(res|ord):(\d+)$/);
  if (!m || !rating) return NextResponse.json({ error: 'Chybí hodnocení.' }, { status: 400 });
  const [row] = m[1] === 'res'
    ? await sql`SELECT team_id FROM client_reservations WHERE id = ${Number(m[2])} AND customer_id = ${me.id} AND status = 'done'`
    : await sql`SELECT team_id FROM client_orders WHERE id = ${Number(m[2])} AND customer_id = ${me.id} AND status = 'done'`;
  if (!row) return NextResponse.json({ error: 'Tuhle návštěvu nejde hodnotit.' }, { status: 404 });
  try {
    await sql`INSERT INTO client_reviews (team_id, customer_id, ref, rating, note) VALUES (${row.team_id}, ${me.id}, ${ref}, ${rating}, ${note})`;
  } catch { return NextResponse.json({ error: 'Už jsi hodnotil.' }, { status: 409 }); }
  if (rating <= 2) {
    await notifyTeamEmployers(Number(row.team_id), { title: `Hodnocení ${rating}/5 od hosta`, body: `${me.name}${note ? `: „${note}"` : ''}`, link: '/employer/overview?mode=client&tab=customers', type: 'info' });
  }
  return NextResponse.json({ ok: true });
}
