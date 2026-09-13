// Ruční úprava bodů (omluva, bonus, oprava) a deník člena.
import { NextRequest, NextResponse } from 'next/server';
import { sql, employer, award, awardCredit, loyaltySummary } from '@/lib/client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const q = new URL(req.url).searchParams;
  // Bez čísla hosta vrací souhrn celé věrnosti pro přehled záložky.
  const cid = parseInt(String(q.get('customerId')), 10);
  if (!cid) {
    const recent = await sql`
      SELECT l.id, l.delta, l.credit_delta, l.kind, l.note, l.created_at, us.name AS customer_name
      FROM client_loyalty_ledger l JOIN users us ON us.id = l.customer_id
      WHERE l.team_id = ${u.team_id} ORDER BY l.created_at DESC LIMIT 20`;
    return NextResponse.json({ summary: await loyaltySummary(u.team_id), recent });
  }
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
  const note = String(b.note ?? '').slice(0, 120) || null;
  // Stejným koncovým bodem se dá upravit i kredit — obsluha ho u kasy odečítá.
  if (b.what === 'credit') {
    const credit = await awardCredit(u.team_id, cid, delta, 'credit', null, note);
    return NextResponse.json({ ok: true, credit });
  }
  const points = await award(u.team_id, cid, delta, 'manual', null, note);
  return NextResponse.json({ ok: true, points });
}
