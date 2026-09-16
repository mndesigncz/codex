// Kupony: nabídky za body (kind = offer) v plné síle — výhoda (% / Kč / X+Y),
// cílení na úrovně a skupiny, limity, časová okna, 18+, uvítací kupony.
// Odměny za razítka (kind = stamps) vznikají samy z plných karet.
import { NextRequest, NextResponse } from 'next/server';
import { sql, employer } from '@/lib/client';
import { BENEFITS, shapeCoupon } from '@/lib/coupons';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIERS = ['bronze', 'silver', 'gold', 'platinum'];

function fields(b: any) {
  const pos = (v: any, max: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? Math.min(max, n) : null;
  };
  const days = Array.isArray(b.daysOfWeek)
    ? Array.from(new Set(b.daysOfWeek.map((x: any) => Math.round(Number(x))).filter((n: number) => n >= 1 && n <= 7))).sort()
    : [];
  return {
    title: String(b.title ?? '').trim().slice(0, 80),
    description: String(b.description ?? '').trim().slice(0, 200),
    cost_points: Math.max(0, Math.min(100000, Math.round(Number(b.costPoints ?? b.cost_points)) || 0)),
    active: b.active !== false,
    benefit_kind: (BENEFITS as readonly string[]).includes(b.benefitKind) ? b.benefitKind : 'text',
    percent_off: pos(b.percentOff, 100),
    amount_off: pos(b.amountOff, 100000),
    xy_buy: pos(b.xyBuy, 50),
    xy_free: pos(b.xyFree, 50),
    min_order_value: pos(b.minOrderValue, 100000),
    target_tiers: Array.isArray(b.targetTiers) ? b.targetTiers.map(String).filter((t: string) => TIERS.includes(t)).slice(0, 4) : [],
    target_groups: Array.isArray(b.targetGroups) ? b.targetGroups.map((x: any) => Math.round(Number(x))).filter((n: number) => n > 0).slice(0, 50) : [],
    per_customer: Math.max(0, Math.min(100, Math.round(Number(b.perCustomer)) || 0)),
    cooldown_days: Math.max(0, Math.min(365, Math.round(Number(b.cooldownDays)) || 0)),
    days_of_week: days.length && days.length < 7 ? days : null,
    hour_from: HM_RE.test(String(b.hourFrom)) ? String(b.hourFrom) : null,
    hour_till: HM_RE.test(String(b.hourTill)) ? String(b.hourTill) : null,
    adult_only: b.adultOnly === true,
    welcome: b.welcome === true,
    valid_since: DATE_RE.test(String(b.validSince)) ? String(b.validSince) : null,
    valid_until: DATE_RE.test(String(b.validUntil ?? b.valid_until)) ? String(b.validUntil ?? b.valid_until) : null,
  };
}

function checkBenefit(f: ReturnType<typeof fields>): string | null {
  if (!f.title) return 'Kupon potřebuje název.';
  if (f.benefit_kind === 'percent' && !f.percent_off) return 'Zadej, kolik procent slevy kupon dává.';
  if (f.benefit_kind === 'amount' && !f.amount_off) return 'Zadej slevu v korunách.';
  if (f.benefit_kind === 'xy' && !f.xy_buy) return 'Zadej, kolik kusů host kupuje (X z X+Y).';
  if (f.hour_from && f.hour_till && f.hour_from >= f.hour_till) return 'Hodiny „od" musí být před „do".';
  return null;
}

export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const rows = await sql`
    SELECT c.*, (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = c.id) AS claimed,
           (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = c.id AND cl.redeemed_at IS NOT NULL) AS redeemed
    FROM client_coupons c WHERE c.team_id = ${u.team_id} AND c.kind = 'offer' ORDER BY c.active DESC, c.cost_points, c.id`;
  let groups: any[] = [];
  try {
    groups = await sql`
      SELECT g.id, g.name, (SELECT COUNT(*)::int FROM client_group_members gm WHERE gm.group_id = g.id) AS members
      FROM client_groups g WHERE g.team_id = ${u.team_id} ORDER BY g.name, g.id` as any[];
  } catch { groups = []; }
  const groupName = new Map((groups as any[]).map((g: any) => [Number(g.id), String(g.name)]));
  const coupons = (rows as any[]).map(r => ({
    ...shapeCoupon(r),
    claimed: Number(r.claimed) || 0, redeemed: Number(r.redeemed) || 0,
    targetGroupNames: (shapeCoupon(r).targetGroups).map(id => groupName.get(id) ?? `#${id}`),
  }));
  return NextResponse.json({ coupons, groups });
}

export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const f = fields(b);
  const bad = checkBenefit(f);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const [c] = await sql`
    INSERT INTO client_coupons (
      team_id, title, description, cost_points, active, benefit_kind, percent_off, amount_off,
      xy_buy, xy_free, min_order_value, target_tiers, target_groups, per_customer, cooldown_days,
      days_of_week, hour_from, hour_till, adult_only, welcome, valid_since, valid_until)
    VALUES (
      ${u.team_id}, ${f.title}, ${f.description}, ${f.cost_points}, ${f.active}, ${f.benefit_kind}, ${f.percent_off}, ${f.amount_off},
      ${f.xy_buy}, ${f.xy_free}, ${f.min_order_value}, ${JSON.stringify(f.target_tiers)}::jsonb, ${JSON.stringify(f.target_groups)}::jsonb, ${f.per_customer}, ${f.cooldown_days},
      ${f.days_of_week ? JSON.stringify(f.days_of_week) : null}::jsonb, ${f.hour_from}, ${f.hour_till}, ${f.adult_only}, ${f.welcome}, ${f.valid_since}, ${f.valid_until})
    RETURNING *`;
  return NextResponse.json({ ok: true, coupon: shapeCoupon(c) });
}

export async function PATCH(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  const [cur] = await sql`SELECT * FROM client_coupons WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!cur) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 404 });
  // Rychlé přepnutí aktivity nechá zbytek kuponu na pokoji.
  if (b.title === undefined && b.active !== undefined) {
    const [c] = await sql`UPDATE client_coupons SET active = ${!!b.active} WHERE id = ${id} RETURNING *`;
    return NextResponse.json({ ok: true, coupon: shapeCoupon(c) });
  }
  const f = fields(b);
  const bad = checkBenefit(f);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const [c] = await sql`
    UPDATE client_coupons SET
      title = ${f.title}, description = ${f.description}, cost_points = ${f.cost_points}, active = ${f.active},
      benefit_kind = ${f.benefit_kind}, percent_off = ${f.percent_off}, amount_off = ${f.amount_off},
      xy_buy = ${f.xy_buy}, xy_free = ${f.xy_free}, min_order_value = ${f.min_order_value},
      target_tiers = ${JSON.stringify(f.target_tiers)}::jsonb, target_groups = ${JSON.stringify(f.target_groups)}::jsonb,
      per_customer = ${f.per_customer}, cooldown_days = ${f.cooldown_days},
      days_of_week = ${f.days_of_week ? JSON.stringify(f.days_of_week) : null}::jsonb,
      hour_from = ${f.hour_from}, hour_till = ${f.hour_till},
      adult_only = ${f.adult_only}, welcome = ${f.welcome},
      valid_since = ${f.valid_since}, valid_until = ${f.valid_until}
    WHERE id = ${id} RETURNING *`;
  return NextResponse.json({ ok: true, coupon: shapeCoupon(c) });
}

export async function DELETE(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatný kupon' }, { status: 400 });
  // Neuplatněné kódy hostů by smazáním přestaly jít uplatnit — takový kupon
  // se jen vypíná. Smazat jde, až když nikdo nic nedrží.
  const [open] = await sql`
    SELECT COUNT(*)::int AS n FROM client_coupon_claims
    WHERE coupon_id = ${id} AND team_id = ${u.team_id} AND redeemed_at IS NULL`;
  if (Number(open?.n) > 0) {
    return NextResponse.json({ error: `Hosté drží ${open.n} neuplatněných kódů — kupon vypni, nemaž.` }, { status: 409 });
  }
  await sql`DELETE FROM client_coupons WHERE id = ${id} AND team_id = ${u.team_id} AND kind = 'offer'`;
  return NextResponse.json({ ok: true });
}
