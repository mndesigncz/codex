// Kartička u kasy. Obsluha načte QR nebo opíše kód, uvidí, kdo to je a co má,
// a jedním klepnutím dá razítko za návštěvu nebo body za útratu. Razítko
// nejvýš jedno denně; body podle pravidel podniku (bodů za 100 Kč).
import { NextRequest, NextResponse } from 'next/server';
import { tierFor } from '@/lib/clientSlots';
import { sql, teamMember, customerByCard, ensureProfile, join, membership, award, awardCredit, spendCredit, stampVisit, normalizeCardCode } from '@/lib/client';
import { pragueToday, pragueDayOf, parseDbTime } from '@/lib/pragueTime';
import { audit } from '@/lib/audit';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Co obsluha u kasy potřebuje vidět: kdo to je, co má a na co má nárok. */
async function summary(teamId: number, customerId: number, p?: any) {
  const m = await membership(customerId, teamId);
  const claims = await sql`SELECT cl.code, c.title FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id WHERE cl.team_id = ${teamId} AND cl.customer_id = ${customerId} AND cl.redeemed_at IS NULL ORDER BY cl.claimed_at`;
  // Kupony za body, na které host právě teď dosáhne — obsluha je nabídne.
  const points = Number(m?.points ?? 0);
  const affordable = await sql`
    SELECT id, title, cost_points FROM client_coupons
    WHERE team_id = ${teamId} AND active = TRUE AND kind = 'offer' AND cost_points > 0 AND cost_points <= ${points}
    ORDER BY cost_points DESC LIMIT 5`;
  const last = parseDbTime(m?.last_visit_at);
  const visits = Number(m?.visits ?? 0);
  const tier = tierFor(visits, p ? {
    silverAt: Number(p.silver_at), goldAt: Number(p.gold_at),
    memberDiscount: Number(p.member_discount), silverDiscount: Number(p.silver_discount), goldDiscount: Number(p.gold_discount),
  } : null);
  return {
    member: !!m, points, credit: Number(m?.credit ?? 0), stamps: Number(m?.stamps ?? 0), visits,
    levelLabel: tier.label, tier: tier.id, discount: tier.discount,
    nextTierAt: tier.nextAt, nextTierLabel: tier.nextLabel,
    stampedToday: !!last && pragueDayOf(last) === pragueToday(),
    openCoupons: claims, affordable,
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
  // Poslední dnešní účtenky z pokladny: obsluha částku vybere, nemusí ji
  // opisovat. Body a kredit pak sedí s tím, co host opravdu zaplatil.
  let bills: any[] = [];
  try {
    bills = await sql`
      SELECT bill_id, final_price, paid_at FROM pos_bills
      WHERE team_id = ${u.team_id} AND day = ${pragueToday()} AND final_price > 0
      ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 5` as any[];
  } catch { bills = []; }
  return NextResponse.json({
    customer: c, ...(await summary(u.team_id, c.id, p)), bills,
    rules: {
      pointsPer100: Number(p.points_per_100) || 0, stampTarget: Number(p.stamp_target) || 0,
      stampReward: p.stamp_reward, cashbackPct: Number(p.cashback_pct) || 0,
    },
  });
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
    const back = Math.floor(amount * (Number(p.cashback_pct) || 0) / 100);
    if (pts <= 0 && back <= 0) return NextResponse.json({ error: 'Z této částky nevychází žádný bod ani kredit.' }, { status: 400 });
    const parts: string[] = [];
    if (pts > 0) { const points = await award(u.team_id, c.id, pts, 'manual', 'card', `Útrata ${amount} Kč u kasy`); parts.push(`+${pts} bodů (celkem ${points})`); }
    if (back > 0) { const credit = await awardCredit(u.team_id, c.id, back, 'cashback', 'card', `${p.cashback_pct} % z útraty ${amount} Kč`); parts.push(`+${back} Kč kreditu (celkem ${credit})`); }
    msg = `${c.name}: ${parts.join(', ')} za ${amount} Kč.`;
  } else if (action === 'credit') {
    // Host platí kreditem: částka se odečte z jeho peněženky u podniku.
    const amount = Math.max(1, Math.min(100000, Math.round(Number(b.amount) || 0)));
    // Atomicky: odečte se jen když kredit stačí. Dvojklik u kasy tak
    // nepřečerpá zůstatek (dřív GREATEST(0,…) přečerpání jen skrylo).
    const credit = await spendCredit(u.team_id, c.id, amount, 'credit', 'card', `Uplatněno u kasy`);
    if (credit == null) {
      const m = await membership(c.id, u.team_id);
      return NextResponse.json({ error: `${c.name} má kredit jen ${Number(m?.credit ?? 0)} Kč.` }, { status: 409 });
    }
    msg = `${c.name}: uplatněno ${amount} Kč kreditu, zbývá ${credit} Kč.`;
  } else {
    return NextResponse.json({ error: 'Neznámá akce' }, { status: 400 });
  }
  audit(u.team_id, u.id, 'client.card', 'client', c.id, msg);
  return NextResponse.json({ ok: true, message: msg, customer: c, ...(await summary(u.team_id, c.id, p)) });
}
