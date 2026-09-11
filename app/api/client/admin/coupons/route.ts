// Kupony: nabídky za body (kind = offer). Odměny za razítka vznikají samy.
import { NextRequest, NextResponse } from 'next/server';
import { sql, employer } from '@/lib/client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const coupons = await sql`
    SELECT c.*, (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = c.id) AS claimed,
           (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = c.id AND cl.redeemed_at IS NOT NULL) AS redeemed
    FROM client_coupons c WHERE c.team_id = ${u.team_id} AND c.kind = 'offer' ORDER BY c.active DESC, c.cost_points, c.id`;
  return NextResponse.json({ coupons });
}

export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? '').trim().slice(0, 80);
  if (!title) return NextResponse.json({ error: 'Kupon potřebuje název.' }, { status: 400 });
  const cost = Math.max(0, Math.min(100000, parseInt(String(b.cost_points ?? '0'), 10) || 0));
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(String(b.valid_until ?? '')) ? String(b.valid_until) : null;
  const [c] = await sql`
    INSERT INTO client_coupons (team_id, title, description, cost_points, valid_until)
    VALUES (${u.team_id}, ${title}, ${String(b.description ?? '').slice(0, 200)}, ${cost}, ${validUntil}) RETURNING *`;
  return NextResponse.json({ ok: true, coupon: c });
}

export async function PATCH(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  const [cur] = await sql`SELECT * FROM client_coupons WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!cur) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 404 });
  const [c] = await sql`
    UPDATE client_coupons SET
      title = ${b.title != null ? String(b.title).trim().slice(0, 80) || cur.title : cur.title},
      description = ${b.description != null ? String(b.description).slice(0, 200) : cur.description},
      cost_points = ${b.cost_points != null ? Math.max(0, Math.min(100000, parseInt(String(b.cost_points), 10) || 0)) : cur.cost_points},
      active = ${b.active != null ? !!b.active : cur.active},
      valid_until = ${b.valid_until !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(String(b.valid_until ?? '')) ? String(b.valid_until) : null) : cur.valid_until}
    WHERE id = ${id} RETURNING *`;
  return NextResponse.json({ ok: true, coupon: c });
}
