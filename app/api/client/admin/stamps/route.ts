// Správa razítkových kampaní. Vedení jich může mít víc vedle sebe — každá
// říká, za co se razítko připisuje, kolik jich je potřeba a co je odměna.
// POST i PATCH procházejí stejnou validací (overKampan v lib/stampsPlan.ts).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { normalizeItemRefs, shapeCampaign } from '@/lib/stamps';
import { zajistiRazitka } from '@/lib/stampsSchema';
import { overKampan } from '@/lib/stampsPlan';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

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

async function sectionNames(teamId: number, ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  const rows = await sql`
    SELECT ms.id, ms.title FROM menu_sections ms
    JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${teamId}
    WHERE ms.id = ANY(${ids})`;
  return new Map((rows as any[]).map(r => [Number(r.id), String(r.title)]));
}

const cislo = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const q = req.nextUrl.searchParams;
  const dnes = pragueToday();
  try {
    await zajistiRazitka();
    const [rows, stats, odmeny] = await Promise.all([
      sql`SELECT * FROM client_stamp_campaigns WHERE team_id = ${u.team_id} ORDER BY position, id`,
      sql`
        SELECT campaign_id, COUNT(*)::int AS collectors,
               COALESCE(SUM(stamps), 0)::int AS open_stamps,
               COALESCE(SUM(completed), 0)::int AS completions
        FROM client_stamp_progress WHERE team_id = ${u.team_id} GROUP BY campaign_id`,
      sql`
        SELECT c.campaign_id, COUNT(*)::int AS vydano, COUNT(*) FILTER (WHERE cl.redeemed_at IS NOT NULL)::int AS uplatneno
        FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id
        WHERE cl.team_id = ${u.team_id} AND c.campaign_id IS NOT NULL GROUP BY c.campaign_id`,
    ]);
    const byId = new Map((stats as any[]).map(r => [Number(r.campaign_id), r]));
    const odmenyBy = new Map((odmeny as any[]).map(r => [Number(r.campaign_id), r]));
    const ids = Array.from(new Set((rows as any[]).flatMap(r =>
      [...normalizeItemRefs(r.stamp_items), ...normalizeItemRefs(r.reward_items), ...normalizeItemRefs(r.excluded_items)].map(x => x.itemId))));
    const names = await itemNames(u.team_id, ids);
    const campaigns = (rows as any[]).map(r => {
      const c = shapeCampaign(r);
      const st = byId.get(c.id); const od = odmenyBy.get(c.id);
      return {
        ...c,
        stampItems: c.stamp_items.map(x => ({ itemId: x.itemId, name: names.get(x.itemId) ?? `#${x.itemId}` })),
        rewardItems: c.reward_items.map(x => ({ itemId: x.itemId, name: names.get(x.itemId) ?? `#${x.itemId}` })),
        excludedItems: c.excluded_items.map(x => ({ itemId: x.itemId, name: names.get(x.itemId) ?? `#${x.itemId}` })),
        collectors: Number(st?.collectors) || 0,
        openStamps: Number(st?.open_stamps) || 0,
        completions: Number(st?.completions) || 0,
        rewardsIssued: Number(od?.vydano) || 0,
        rewardsRedeemed: Number(od?.uplatneno) || 0,
      };
    });
    return NextResponse.json({ campaigns, today: dnes });
  } catch {
    return NextResponse.json({ campaigns: [], notMigrated: true });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('vernost.kampane');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const v = overKampan(b);
  if ('chyba' in v) return NextResponse.json({ error: v.chyba }, { status: 400 });
  const f = v.f;
  await zajistiRazitka();
  const [row] = await sql`
    INSERT INTO client_stamp_campaigns (
      team_id, name, description, conditions, active, status, valid_since, valid_till,
      required_stamps, rule_type, stamp_items, excluded_items, min_value, min_value_multiple, one_per_order,
      reward_title, reward_items, days_to_finish, days_to_redeem, repeat_mode, stack_cards,
      max_completions, daily_cap, days_of_week, hour_from, hour_till, position)
    VALUES (
      ${u.team_id}, ${f.name}, ${f.description}, ${f.conditions}, ${f.active}, ${f.status}, ${f.valid_since}, ${f.valid_till},
      ${f.required_stamps}, ${f.rule_type}, ${JSON.stringify(f.stamp_items)}::jsonb, ${JSON.stringify(f.excluded_items)}::jsonb, ${f.min_value}, ${f.min_value_multiple}, ${f.one_per_order},
      ${f.reward_title}, ${JSON.stringify(f.reward_items)}::jsonb, ${f.days_to_finish}, ${f.days_to_redeem}, ${f.repeat_mode}, ${f.stack_cards},
      ${f.max_completions}, ${f.daily_cap}, ${JSON.stringify(f.days_of_week)}::jsonb, ${f.hour_from}, ${f.hour_till},
      (SELECT COALESCE(MAX(position), 0) + 1 FROM client_stamp_campaigns WHERE team_id = ${u.team_id}))
    RETURNING id`;
  audit(u.team_id, u.id, 'client.stamps.create', 'client', Number(row.id), f.name);
  return NextResponse.json({ ok: true, id: row.id });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('vernost.kampane');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná kampaň' }, { status: 400 });
  await zajistiRazitka();
  const [cur] = await sql`SELECT id, status FROM client_stamp_campaigns WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!cur) return NextResponse.json({ error: 'Kampaň nenalezena' }, { status: 404 });
  // Stejná validace jako u POST. Když klient stav nepošle, kampaň si ponechá stávající.
  const v = overKampan({ ...b, status: b.status ?? (b.active === undefined ? cur.status : undefined) });
  if ('chyba' in v) return NextResponse.json({ error: v.chyba }, { status: 400 });
  const f = v.f;
  await sql`
    UPDATE client_stamp_campaigns SET
      name = ${f.name}, description = ${f.description}, conditions = ${f.conditions}, active = ${f.active}, status = ${f.status},
      valid_since = ${f.valid_since}, valid_till = ${f.valid_till},
      required_stamps = ${f.required_stamps}, rule_type = ${f.rule_type},
      stamp_items = ${JSON.stringify(f.stamp_items)}::jsonb, excluded_items = ${JSON.stringify(f.excluded_items)}::jsonb, min_value = ${f.min_value},
      min_value_multiple = ${f.min_value_multiple}, one_per_order = ${f.one_per_order},
      reward_title = ${f.reward_title}, reward_items = ${JSON.stringify(f.reward_items)}::jsonb,
      days_to_finish = ${f.days_to_finish}, days_to_redeem = ${f.days_to_redeem},
      repeat_mode = ${f.repeat_mode}, stack_cards = ${f.stack_cards},
      max_completions = ${f.max_completions}, daily_cap = ${f.daily_cap}, days_of_week = ${JSON.stringify(f.days_of_week)}::jsonb,
      hour_from = ${f.hour_from}, hour_till = ${f.hour_till}
    WHERE id = ${id} AND team_id = ${u.team_id}`;
  audit(u.team_id, u.id, 'client.stamps.update', 'client', id, f.name);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('vernost.kampane');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná kampaň' }, { status: 400 });
  await zajistiRazitka();
  const [c] = await sql`SELECT name FROM client_stamp_campaigns WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!c) return NextResponse.json({ error: 'Kampaň nenalezena' }, { status: 404 });
  // Rozsbíraná razítka mizí s kampaní — editor se předem ptá. Vydané kupony zůstávají, jen bez vazby na kampaň.
  await sql`DELETE FROM client_stamp_progress WHERE campaign_id = ${id} AND team_id = ${u.team_id}`;
  await sql`DELETE FROM client_stamp_events WHERE campaign_id = ${id} AND team_id = ${u.team_id}`;
  await sql`UPDATE client_coupons SET campaign_id = NULL WHERE campaign_id = ${id} AND team_id = ${u.team_id}`;
  await sql`DELETE FROM client_stamp_campaigns WHERE id = ${id} AND team_id = ${u.team_id}`;
  audit(u.team_id, u.id, 'client.stamps.delete', 'client', id, String(c.name));
  return NextResponse.json({ ok: true });
}
