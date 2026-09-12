// Kartička u kasy. Obsluha načte QR nebo opíše kód, uvidí, kdo to je a co má,
// a jedním klepnutím dá razítko za návštěvu nebo body za útratu. Razítko
// nejvýš jedno denně; body podle pravidel podniku (bodů za 100 Kč).
import { NextRequest, NextResponse } from 'next/server';
import { levelFor } from '@/lib/clientSlots';
import { sql, teamMember, customerByCard, ensureProfile, join, membership, award, stampVisit, normalizeCardCode } from '@/lib/client';
import { pragueToday, pragueDayOf, parseDbTime } from '@/lib/pragueTime';
import { audit } from '@/lib/audit';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function summary(teamId: number, customerId: number) {
  const m = await membership(customerId, teamId);
  const claims = await sql`SELECT cl.code, c.title FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id WHERE cl.team_id = ${teamId} AND cl.customer_id = ${customerId} AND cl.redeemed_at IS NULL ORDER BY cl.claimed_at`;
  const last = parseDbTime(m?.last_visit_at);
  return {
    member: !!m, points: Number(m?.points ?? 0), stamps: Number(m?.stamps ?? 0), visits: Number(m?.visits ?? 0),
    levelLabel: levelFor(Number(m?.visits ?? 0)).label,
    stampedToday: !!last && pragueDayOf(last) === pragueToday(), openCoupons: claims,
  };
}

export async function GET(req: NextRequest) {
  const u = await teamMember();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const code = normalizeCardCode(String(new URL(req.url).searchParams.get('code') ?? ''));
  if (!code) return NextResponse.json({ error: 'Kód má osm znaků.' }, { status: 400 });
  const c = await customerByCard(code);
  if (!c) return NextResponse.json({ error: 'Takovou kartičku neznáme.' }, { status: 404 });
  const p = await ensureProfile(u.team_id);
  return NextResponse.json({ customer: c, ...(await summary(u.team_id, c.id)), rules: { pointsPer100: Number(p.points_per_100) || 0, stampTarget: Number(p.stamp_target) || 0, stampReward: p.stamp_reward } });
}

export async function POST(req: NextRequest) {
  const u = await teamMember();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const c = await customerByCard(String(b.code ?? ''));
  if (!c) return NextResponse.json({ error: 'Takovou kartičku neznáme.' }, { status: 404 });
  const p = await ensureProfile(u.team_id);
  if (!p.loyalty_on) return NextResponse.json({ error: 'Podnik nemá věrnost zapnutou.' }, { status: 400 });
  await join(c.id, u.team_id);
  const action = String(b.action ?? '');
  let msg = '';
  if (action === 'stamp') {
    const before = await summary(u.team_id, c.id);
    if (before.stampedToday) return NextResponse.json({ error: `${c.name} dnes razítko už má.` }, { status: 409 });
    const r = await stampVisit(u.team_id, c.id, p, 'card');
    msg = r.rewarded ? `${c.name}: razítka kompletní, odměna „${p.stamp_reward}" je v kuponech.` : `${c.name}: razítko ${r.stamps}/${p.stamp_target}.`;
  } else if (action === 'points') {
    const amount = Math.max(0, Math.min(100000, Math.round(Number(b.amount) || 0)));
    const pts = Math.floor(amount / 100) * (Number(p.points_per_100) || 0);
    if (pts <= 0) return NextResponse.json({ error: 'Z této částky nevychází žádný bod.' }, { status: 400 });
    const points = await award(u.team_id, c.id, pts, 'manual', 'card', `Útrata ${amount} Kč u kasy`);
    msg = `${c.name}: +${pts} bodů za ${amount} Kč, celkem ${points}.`;
  } else {
    return NextResponse.json({ error: 'Neznámá akce' }, { status: 400 });
  }
  audit(u.team_id, u.id, 'client.card', 'client', c.id, msg);
  return NextResponse.json({ ok: true, message: msg, customer: c, ...(await summary(u.team_id, c.id)) });
}
