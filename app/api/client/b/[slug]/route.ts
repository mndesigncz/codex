// Stránka podniku pro hosta: profil, otevírací doba, menu, stoly (když se
// objednává), moje členství, moje nadcházející rezervace a kupony k vyzvednutí.

import { NextResponse } from 'next/server';
import { normalizePlan } from '@/lib/floorplan';
import { levelFor } from '@/lib/clientSlots';
import { sql, customer, profileBySlug, publicProfile, membership } from '@/lib/client';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Nabídka pro hosta: sekce a položky s tím, co host smí vidět (bez PINu,
 * bez id produktu z pokladny — to si objednávka dohledá podle id položky).
 * Tvar drží stránka hosta i objednávka: sections[].items[].
 */
async function menuFor(teamId: number, menuSlug: string | null) {
  try {
    const [board] = menuSlug
      ? await sql`SELECT id, slug, name, currency FROM menu_boards WHERE team_id = ${teamId} AND slug = ${menuSlug} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`
      : await sql`SELECT id, slug, name, currency FROM menu_boards WHERE team_id = ${teamId} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`;
    if (!board) return null;
    const sections = await sql`SELECT id, title, position FROM menu_sections WHERE board_id = ${board.id} ORDER BY position, id` as any[];
    const items = await sql`
      SELECT i.id, i.section_id, i.name, i.price, i.description, i.sold_out, i.position
      FROM menu_items i JOIN menu_sections s ON s.id = i.section_id
      WHERE s.board_id = ${board.id} ORDER BY i.position, i.id` as any[];
    return {
      slug: board.slug, name: board.name, currency: board.currency ?? 'Kč',
      sections: sections.map(sec => ({
        id: Number(sec.id), title: String(sec.title),
        items: items.filter(i => Number(i.section_id) === Number(sec.id)).map(i => ({
          id: Number(i.id), name: String(i.name), price: Number(i.price) || 0,
          description: i.description ?? '', soldOut: !!i.sold_out,
        })),
      })),
    };
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
    p.ordering_on ? sql`SELECT id, name, seats, map_x, map_y, map_w, map_h, map_shape, map_rot FROM client_tables WHERE team_id = ${teamId} AND active = TRUE ORDER BY position, id` : Promise.resolve([]),
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
    const lvl = levelFor(Number(m?.visits ?? 0));
    mine = {
      member: !!m, points: Number(m?.points ?? 0), stamps: Number(m?.stamps ?? 0), visits: Number(m?.visits ?? 0),
      level: lvl.id, levelLabel: lvl.label,
      reservations, claims,
    };
  }
  // Novinky: poslední rozeslané zprávy členům rovnou na stránce podniku,
  // ať mají co číst i hosté bez zapnutých oznámení.
  let news: any[] = [];
  try { news = await sql`SELECT id, title, body, sent_at FROM client_broadcasts WHERE team_id = ${teamId} ORDER BY sent_at DESC LIMIT 3` as any[]; } catch { news = []; }
  const plan = p.floorplan && p.ordering_on ? normalizePlan(p.floorplan) : null;
  return NextResponse.json({ business: publicProfile(p), menu, tables, plan, coupons, news, me: mine, signedIn: !!me, today });
}
