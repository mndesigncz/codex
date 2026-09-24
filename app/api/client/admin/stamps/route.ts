// Správa razítkových kampaní. Vedení jich může mít víc vedle sebe — každá
// říká, za co se razítko připisuje, kolik jich je potřeba a co je odměna.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { normalizeItemRefs, shapeCampaign } from '@/lib/stamps';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RULES = ['visit', 'products', 'min_value'];
const REPEATS = ['immediately', 'one_day', 'one_week', 'one_month', 'one_time'];

function fields(b: any) {
  return {
    name: String(b.name ?? '').trim().slice(0, 120),
    description: String(b.description ?? '').trim().slice(0, 200),
    conditions: String(b.conditions ?? '').trim().slice(0, 600),
    active: b.active !== false,
    valid_since: DATE_RE.test(String(b.validSince)) ? b.validSince : null,
    valid_till: DATE_RE.test(String(b.validTill)) ? b.validTill : null,
    required_stamps: Math.min(50, Math.max(1, Math.round(Number(b.requiredStamps) || 10))),
    rule_type: RULES.includes(b.ruleType) ? b.ruleType : 'visit',
    stamp_items: normalizeItemRefs(b.stampItems),
    min_value: Number.isFinite(Number(b.minValue)) && Number(b.minValue) > 0 ? Math.round(Number(b.minValue)) : null,
    min_value_multiple: b.minValueMultiple === true,
    one_per_order: b.onePerOrder === true,
    reward_title: String(b.rewardTitle ?? '').trim().slice(0, 160),
    reward_items: normalizeItemRefs(b.rewardItems),
    days_to_finish: Math.min(365, Math.max(0, Math.round(Number(b.daysToFinish) || 0))),
    days_to_redeem: Math.min(365, Math.max(0, Math.round(Number(b.daysToRedeem) || 0))),
    repeat_mode: REPEATS.includes(b.repeatMode) ? b.repeatMode : 'immediately',
    stack_cards: b.stackCards !== false,
  };
}

/** Jmenné odkazy položek nabídky pro editor (id → jméno) — jedním dotazem. */
async function itemNames(teamId: number, ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  const rows = await sql`
    SELECT mi.id, mi.name FROM menu_items mi
    JOIN menu_sections ms ON ms.id = mi.section_id
    JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${teamId}
    WHERE mi.id = ANY(${ids})`;
  return new Map((rows as any[]).map(r => [Number(r.id), String(r.name)]));
}

export async function GET() {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  try {
    const [rows, stats] = await Promise.all([
      sql`SELECT * FROM client_stamp_campaigns WHERE team_id = ${u.team_id} ORDER BY position, id`,
      sql`
        SELECT campaign_id, COUNT(*)::int AS collectors,
               COALESCE(SUM(stamps), 0)::int AS open_stamps,
               COALESCE(SUM(completed), 0)::int AS completions
        FROM client_stamp_progress WHERE team_id = ${u.team_id} GROUP BY campaign_id`,
    ]);
    const byId = new Map((stats as any[]).map(r => [Number(r.campaign_id), r]));
    const ids = Array.from(new Set((rows as any[]).flatMap(r =>
      [...normalizeItemRefs(r.stamp_items), ...normalizeItemRefs(r.reward_items)].map(x => x.itemId))));
    const names = await itemNames(u.team_id, ids);
    const campaigns = (rows as any[]).map(r => {
      const c = shapeCampaign(r);
      const st = byId.get(c.id);
      return {
        ...c,
        stampItems: c.stamp_items.map(x => ({ itemId: x.itemId, name: names.get(x.itemId) ?? `#${x.itemId}` })),
        rewardItems: c.reward_items.map(x => ({ itemId: x.itemId, name: names.get(x.itemId) ?? `#${x.itemId}` })),
        collectors: Number(st?.collectors) || 0,
        openStamps: Number(st?.open_stamps) || 0,
        completions: Number(st?.completions) || 0,
      };
    });
    return NextResponse.json({ campaigns });
  } catch {
    return NextResponse.json({ campaigns: [], notMigrated: true });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('vernost.kampane');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const f = fields(b);
  if (!f.name) return NextResponse.json({ error: 'Zadej název kampaně.' }, { status: 400 });
  if (f.rule_type === 'products' && !f.stamp_items.length) {
    return NextResponse.json({ error: 'Vyber položky, za které se razítko připisuje.' }, { status: 400 });
  }
  if (f.rule_type === 'min_value' && !f.min_value) {
    return NextResponse.json({ error: 'Zadej minimální útratu pro razítko.' }, { status: 400 });
  }
  const [row] = await sql`
    INSERT INTO client_stamp_campaigns (
      team_id, name, description, conditions, active, valid_since, valid_till,
      required_stamps, rule_type, stamp_items, min_value, min_value_multiple, one_per_order,
      reward_title, reward_items, days_to_finish, days_to_redeem, repeat_mode, stack_cards, position)
    VALUES (
      ${u.team_id}, ${f.name}, ${f.description}, ${f.conditions}, ${f.active}, ${f.valid_since}, ${f.valid_till},
      ${f.required_stamps}, ${f.rule_type}, ${JSON.stringify(f.stamp_items)}::jsonb, ${f.min_value}, ${f.min_value_multiple}, ${f.one_per_order},
      ${f.reward_title}, ${JSON.stringify(f.reward_items)}::jsonb, ${f.days_to_finish}, ${f.days_to_redeem}, ${f.repeat_mode}, ${f.stack_cards},
      (SELECT COALESCE(MAX(position), 0) + 1 FROM client_stamp_campaigns WHERE team_id = ${u.team_id}))
    RETURNING id`;
  return NextResponse.json({ ok: true, id: row.id });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('vernost.kampane');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná kampaň' }, { status: 400 });
  const [cur] = await sql`SELECT id FROM client_stamp_campaigns WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!cur) return NextResponse.json({ error: 'Kampaň nenalezena' }, { status: 404 });
  const f = fields(b);
  if (!f.name) return NextResponse.json({ error: 'Zadej název kampaně.' }, { status: 400 });
  await sql`
    UPDATE client_stamp_campaigns SET
      name = ${f.name}, description = ${f.description}, conditions = ${f.conditions}, active = ${f.active},
      valid_since = ${f.valid_since}, valid_till = ${f.valid_till},
      required_stamps = ${f.required_stamps}, rule_type = ${f.rule_type},
      stamp_items = ${JSON.stringify(f.stamp_items)}::jsonb, min_value = ${f.min_value},
      min_value_multiple = ${f.min_value_multiple}, one_per_order = ${f.one_per_order},
      reward_title = ${f.reward_title}, reward_items = ${JSON.stringify(f.reward_items)}::jsonb,
      days_to_finish = ${f.days_to_finish}, days_to_redeem = ${f.days_to_redeem},
      repeat_mode = ${f.repeat_mode}, stack_cards = ${f.stack_cards}
    WHERE id = ${id} AND team_id = ${u.team_id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('vernost.kampane');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná kampaň' }, { status: 400 });
  // Rozsbíraná razítka mizí s kampaní — editor se předem ptá.
  await sql`DELETE FROM client_stamp_progress WHERE campaign_id = ${id} AND team_id = ${u.team_id}`;
  await sql`DELETE FROM client_stamp_campaigns WHERE id = ${id} AND team_id = ${u.team_id}`;
  return NextResponse.json({ ok: true });
}
