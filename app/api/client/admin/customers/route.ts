// Členové podniku: kdo chodí, kolik má bodů a razítek, kdy byl naposledy.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const q = String(new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase();
  // Hledání patří do SQL: filtr v JS až po LIMIT 500 znamenal, že člena za
  // pětistou hranicí nešlo najít a „total" byl zavádějícím způsobem uříznutý.
  // Speciální znaky LIKE (% _ \) escapujeme, ať se text bere doslovně.
  const like = '%' + q.replace(/[\\%_]/g, ch => '\\' + ch) + '%';
  // E-mail hosta je kontakt — vidí ho a hledá podle něj jen ten, kdo smí
  // hostům psát. Jinak by šlo e-mail uhodnout hledáním po písmenech.
  const kontakty = ctx.role.opravneni.has('zakaznici.kontakty');
  const rows = await sql`
    SELECT m.customer_id AS id, us.name, us.email, m.points, m.stamps, m.visits, m.joined_at, m.last_visit_at,
           (SELECT COUNT(*)::int FROM client_reservations r WHERE r.customer_id = m.customer_id AND r.team_id = m.team_id) AS reservations,
           (SELECT COUNT(*)::int FROM client_coupon_claims c WHERE c.customer_id = m.customer_id AND c.team_id = m.team_id AND c.redeemed_at IS NULL) AS open_coupons
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${u.team_id}
      AND (${q} = '' OR LOWER(us.name) LIKE ${like} ESCAPE '\\' OR (${kontakty} AND LOWER(us.email) LIKE ${like} ESCAPE '\\'))
    ORDER BY m.last_visit_at DESC NULLS LAST, m.joined_at DESC LIMIT 500` as any[];
  const [cnt] = await sql`
    SELECT COUNT(*)::int AS total
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${u.team_id}
      AND (${q} = '' OR LOWER(us.name) LIKE ${like} ESCAPE '\\' OR (${kontakty} AND LOWER(us.email) LIKE ${like} ESCAPE '\\'))` as any[];
  const customers = kontakty ? rows : rows.map(({ email: _e, ...r }) => r);
  return NextResponse.json({ customers, total: cnt?.total ?? rows.length });
}
