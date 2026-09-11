// Ruční úprava bodů (omluva, bonus, oprava) a deník člena.
import { NextRequest, NextResponse } from 'next/server';
import { sql, employer, award } from '@/lib/client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const cid = parseInt(String(new URL(req.url).searchParams.get('customerId')), 10);
  const ledger = await sql`SELECT * FROM client_loyalty_ledger WHERE team_id = ${u.team_id} AND customer_id = ${cid} ORDER BY created_at DESC LIMIT 100`;
  return NextResponse.json({ ledger });
}

export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const cid = parseInt(String(b.customerId), 10);
  const delta = Math.max(-100000, Math.min(100000, parseInt(String(b.delta), 10) || 0));
  if (!cid || !delta) return NextResponse.json({ error: 'Kolik bodů a komu?' }, { status: 400 });
  const [m] = await sql`SELECT id FROM client_memberships WHERE customer_id = ${cid} AND team_id = ${u.team_id}`;
  if (!m) return NextResponse.json({ error: 'Tenhle host není členem podniku.' }, { status: 404 });
  const points = await award(u.team_id, cid, delta, 'manual', null, String(b.note ?? '').slice(0, 120) || null);
  return NextResponse.json({ ok: true, points });
}
