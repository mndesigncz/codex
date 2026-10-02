// Celá historie jednoho člena po částech: návštěvy, body, útraty, kupony, objednávky a poukazy,
// plus razítka podle kampaní. Každá část se stránkuje zvlášť (offset), ať se okno člena otevře hned
// i u člena s tisíci řádky v deníku.
import { NextRequest, NextResponse } from 'next/server';
import { sql, ensureProfile } from '@/lib/client';
import { tierForMember, tierRulesFromProfile } from '@/lib/clientSlots';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { zajistiSchemaClenu } from '@/lib/clenoveSchema';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const SEKCE = ['navstevy', 'body', 'utraty', 'kupony', 'objednavky', 'poukazy'] as const;
const NA_STRANU = 40;

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiSchemaClenu();
  const q = new URL(req.url).searchParams;
  const cid = parseInt(String(q.get('id')), 10);
  if (!Number.isInteger(cid) || cid <= 0) return NextResponse.json({ error: 'Neplatný člen.' }, { status: 400 });
  const teamId = ctx.teamId;
  const [m] = await sql`SELECT * FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ${cid}` as any[];
  if (!m) return NextResponse.json({ error: 'Tenhle host není členem podniku.' }, { status: 404 });
  const sekce = String(q.get('sekce') ?? '');
  const offset = Math.max(0, Math.min(100000, parseInt(String(q.get('offset') ?? '0'), 10) || 0));

  if (!sekce) {
    // Přehled: čísla ke všem částem a razítka podle kampaní (včetně těch, které už neběží).
    const profil = await ensureProfile(teamId);
    const uroven = tierForMember({ visits: m.visits, spend: m.spend }, tierRulesFromProfile(profil));
    const [c] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE kind = 'visit')::int AS navstevy,
        COUNT(*) FILTER (WHERE kind <> 'visit')::int AS body,
        COUNT(*) FILTER (WHERE kind IN ('manual', 'order') AND note LIKE 'Útrata%')::int AS utraty
      FROM client_loyalty_ledger WHERE team_id = ${teamId} AND customer_id = ${cid}` as any[];
    const [k] = await sql`SELECT COUNT(*)::int AS vsechny, COUNT(*) FILTER (WHERE redeemed_at IS NOT NULL)::int AS uplatnene FROM client_coupon_claims WHERE team_id = ${teamId} AND customer_id = ${cid}` as any[];
    const [o] = await sql`SELECT COUNT(*)::int AS pocet FROM client_orders WHERE team_id = ${teamId} AND customer_id = ${cid}` as any[];
    let poukazy = 0;
    try { const [p] = await sql`SELECT COUNT(*)::int AS pocet FROM client_vouchers WHERE team_id = ${teamId} AND customer_id = ${cid}` as any[]; poukazy = Number(p?.pocet) || 0; } catch { poukazy = 0; }
    const kampane = await sql`
      SELECT c.id, c.name, c.active, c.required_stamps, c.reward_title,
             COALESCE(p.stamps, 0)::int AS stamps, COALESCE(p.completed, 0)::int AS completed,
             p.started_at, p.last_stamp_at, p.last_completed_at
      FROM client_stamp_campaigns c
      LEFT JOIN client_stamp_progress p ON p.campaign_id = c.id AND p.customer_id = ${cid}
      WHERE c.team_id = ${teamId} AND (c.active = TRUE OR p.campaign_id IS NOT NULL)
      ORDER BY c.active DESC, c.position, c.id` as any[];
    return NextResponse.json({
      clen: { points: Number(m.points) || 0, stamps: Number(m.stamps) || 0, visits: Number(m.visits) || 0, spend: Number(m.spend) || 0, credit: Number(m.credit) || 0, joined_at: m.joined_at, last_visit_at: m.last_visit_at, blocked: m.blocked === true, note: m.note ?? null },
      uroven,
      pocty: { navstevy: Number(c?.navstevy) || 0, body: Number(c?.body) || 0, utraty: Number(c?.utraty) || 0, kupony: Number(k?.vsechny) || 0, uplatnene: Number(k?.uplatnene) || 0, objednavky: Number(o?.pocet) || 0, poukazy },
      kampane: kampane.map(r => ({ id: Number(r.id), name: String(r.name), active: r.active === true, required: Number(r.required_stamps) || 0, reward: String(r.reward_title ?? ''), stamps: Number(r.stamps), completed: Number(r.completed), started_at: r.started_at, last_stamp_at: r.last_stamp_at, last_completed_at: r.last_completed_at })),
    });
  }
  if (!(SEKCE as readonly string[]).includes(sekce)) return NextResponse.json({ error: 'Neznámá část historie.' }, { status: 400 });

  let rows: any[] = [];
  if (sekce === 'navstevy') {
    rows = await sql`SELECT created_at AS at, note, ref FROM client_loyalty_ledger WHERE team_id = ${teamId} AND customer_id = ${cid} AND kind = 'visit' ORDER BY created_at DESC, id DESC LIMIT ${NA_STRANU + 1} OFFSET ${offset}` as any[];
  } else if (sekce === 'body') {
    rows = await sql`SELECT created_at AS at, kind, note, delta, credit_delta FROM client_loyalty_ledger WHERE team_id = ${teamId} AND customer_id = ${cid} AND kind <> 'visit' ORDER BY created_at DESC, id DESC LIMIT ${NA_STRANU + 1} OFFSET ${offset}` as any[];
  } else if (sekce === 'utraty') {
    rows = await sql`SELECT created_at AS at, note, delta FROM client_loyalty_ledger WHERE team_id = ${teamId} AND customer_id = ${cid} AND kind IN ('manual', 'order') AND note LIKE 'Útrata%' ORDER BY created_at DESC, id DESC LIMIT ${NA_STRANU + 1} OFFSET ${offset}` as any[];
  } else if (sekce === 'kupony') {
    rows = await sql`
      SELECT cl.claimed_at AS at, cl.redeemed_at, cp.title, cp.kind FROM client_coupon_claims cl JOIN client_coupons cp ON cp.id = cl.coupon_id
      WHERE cl.team_id = ${teamId} AND cl.customer_id = ${cid} ORDER BY cl.claimed_at DESC, cl.id DESC LIMIT ${NA_STRANU + 1} OFFSET ${offset}` as any[];
  } else if (sekce === 'objednavky') {
    rows = await sql`SELECT created_at AS at, total, status FROM client_orders WHERE team_id = ${teamId} AND customer_id = ${cid} ORDER BY created_at DESC, id DESC LIMIT ${NA_STRANU + 1} OFFSET ${offset}` as any[];
  } else {
    try {
      rows = await sql`SELECT created_at AS at, code, value_amount, balance FROM client_vouchers WHERE team_id = ${teamId} AND customer_id = ${cid} ORDER BY created_at DESC, id DESC LIMIT ${NA_STRANU + 1} OFFSET ${offset}` as any[];
    } catch { rows = []; }
  }
  const dalsi = rows.length > NA_STRANU;
  return NextResponse.json({ sekce, polozky: rows.slice(0, NA_STRANU), dalsi, offset: offset + Math.min(rows.length, NA_STRANU) });
}
