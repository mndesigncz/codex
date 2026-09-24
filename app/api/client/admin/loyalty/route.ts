// Ruční úprava bodů (omluva, bonus, oprava) a deník člena.
import { NextRequest, NextResponse } from 'next/server';
import { sql, award, awardCredit, loyaltySummary } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const q = new URL(req.url).searchParams;
  // Bez čísla hosta vrací souhrn celé věrnosti pro přehled záložky.
  const cid = parseInt(String(q.get('customerId')), 10);
  if (!cid) {
    const recent = await sql`
      SELECT l.id, l.delta, l.credit_delta, l.kind, l.note, l.created_at, us.name AS customer_name
      FROM client_loyalty_ledger l JOIN users us ON us.id = l.customer_id
      WHERE l.team_id = ${u.team_id} ORDER BY l.created_at DESC LIMIT 20`;
    // Statistiky za 31 dní (po vzoru Kartičky): po dnech, ať jde vidět rytmus
    // týdne. Vše z dat, která už vedeme — deník, členství, kupony.
    let series: any[] = [];
    try {
      series = await sql`
        WITH days AS (SELECT generate_series(CURRENT_DATE - 30, CURRENT_DATE, '1 day')::date AS d)
        SELECT days.d::text AS day,
          COALESCE((SELECT COUNT(DISTINCT l.customer_id) FROM client_loyalty_ledger l
            WHERE l.team_id = ${u.team_id} AND l.created_at::date = days.d), 0)::int AS active,
          COALESCE((SELECT SUM(l.delta) FROM client_loyalty_ledger l
            WHERE l.team_id = ${u.team_id} AND l.created_at::date = days.d AND l.delta > 0), 0)::int AS points_given,
          COALESCE((SELECT -SUM(l.delta) FROM client_loyalty_ledger l
            WHERE l.team_id = ${u.team_id} AND l.created_at::date = days.d AND l.delta < 0), 0)::int AS points_spent,
          COALESCE((SELECT COUNT(*) FROM client_memberships m
            WHERE m.team_id = ${u.team_id} AND m.joined_at::date = days.d), 0)::int AS new_members,
          COALESCE((SELECT COUNT(*) FROM client_coupon_claims cl
            WHERE cl.team_id = ${u.team_id} AND cl.redeemed_at::date = days.d), 0)::int AS redeemed
        FROM days ORDER BY days.d` as any[];
    } catch { series = []; }
    return NextResponse.json({ summary: await loyaltySummary(u.team_id), recent, series });
  }
  const ledger = await sql`SELECT * FROM client_loyalty_ledger WHERE team_id = ${u.team_id} AND customer_id = ${cid} ORDER BY created_at DESC LIMIT 100`;
  return NextResponse.json({ ledger });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj(['vernost.upravit_body', 'vernost.kredit_upravit']);
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  // Kredit jsou peníze hosta u podniku, body jen odměna — ruční zásah do
  // kreditu je proto samostatné oprávnění.
  const klic = b.what === 'credit' ? 'vernost.kredit_upravit' : 'vernost.upravit_body';
  if (!ctx.role.opravneni.has(klic)) {
    return NextResponse.json({ error: b.what === 'credit' ? 'Upravovat kredit hostů nemáš povoleno.' : 'Upravovat body hostů nemáš povoleno.' }, { status: 403 });
  }
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
