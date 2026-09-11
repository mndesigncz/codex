// Stránka podniku pro hosta: profil, otevírací doba, menu, stoly (když se
// objednává), moje členství, moje nadcházející rezervace a kupony k vyzvednutí.

import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug, publicProfile, membership } from '@/lib/client';
import { buildBoard, publicShape } from '@/lib/menu';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function menuFor(teamId: number, menuSlug: string | null) {
  try {
    const [board] = menuSlug
      ? await sql`SELECT * FROM menu_boards WHERE team_id = ${teamId} AND slug = ${menuSlug} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`
      : await sql`SELECT * FROM menu_boards WHERE team_id = ${teamId} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`;
    if (!board) return null;
    const sections = await sql`SELECT id, title, column_no, position FROM menu_sections WHERE board_id = ${board.id} ORDER BY position, id`;
    const items = sections.length
      ? await sql`SELECT id, section_id, name, price, description, sold_out, pos_product_id, position
                  FROM menu_items WHERE section_id = ANY(${(sections as any[]).map(s => Number(s.id))}) ORDER BY position, id`
      : [];
    return publicShape(buildBoard(board, sections as any[], items as any[]));
  } catch { return null; }
}

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const p = await profileBySlug(params.slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const teamId = Number(p.team_id);
  const me = await customer();
  const today = pragueToday();

  const [menu, tables, coupons] = await Promise.all([
    menuFor(teamId, p.menu_slug ?? null),
    p.ordering_on ? sql`SELECT id, name, seats FROM client_tables WHERE team_id = ${teamId} AND active = TRUE ORDER BY position, id` : Promise.resolve([]),
    p.loyalty_on ? sql`SELECT id, title, description, cost_points, kind, valid_until FROM client_coupons
                       WHERE team_id = ${teamId} AND active = TRUE AND kind = 'offer' AND (valid_until IS NULL OR valid_until >= ${today})
                       ORDER BY cost_points, id` : Promise.resolve([]),
  ]);

  let mine: any = null;
  if (me) {
    const m = await membership(me.id, teamId);
    const reservations = await sql`
      SELECT id, date, time, party, note, status, created_at FROM client_reservations
      WHERE team_id = ${teamId} AND customer_id = ${me.id} AND date >= ${today} AND status NOT IN ('cancelled','declined','done')
      ORDER BY date, time`;
    const claims = await sql`
      SELECT cl.id, cl.code, cl.claimed_at, cl.redeemed_at, c.title FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id
      WHERE cl.team_id = ${teamId} AND cl.customer_id = ${me.id} AND cl.redeemed_at IS NULL ORDER BY cl.claimed_at DESC`;
    mine = {
      member: !!m, points: Number(m?.points ?? 0), stamps: Number(m?.stamps ?? 0), visits: Number(m?.visits ?? 0),
      reservations, claims,
    };
  }
  return NextResponse.json({ business: publicProfile(p), menu, tables, coupons, me: mine, signedIn: !!me, today });
}
