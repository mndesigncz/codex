// Členové podniku: kdo chodí, kolik má bodů a razítek, kdy byl naposledy.
import { NextRequest, NextResponse } from 'next/server';
import { sql, ensureProfile } from '@/lib/client';
import { tierForMember, tierRulesFromProfile } from '@/lib/clientSlots';
import { efektivniSleva } from '@/lib/slevy';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { maKampane } from '@/lib/stamps';

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
  // Widget „Členové klubu" (kolo 69, B8) chce jen pět nejvěrnějších podle
  // zvoleného řazení — ne 500 řádků, ze kterých by si pět vybral sám.
  // Bez parametrů zůstává pořadí i strop seznamu Zákazníci beze změny.
  const razeni = String(new URL(req.url).searchParams.get('sort') ?? '');
  const strop = Math.min(500, Math.max(1, parseInt(String(new URL(req.url).searchParams.get('limit') ?? '500'), 10) || 500));
  const podleNavstev = razeni === 'navstevy';
  const podleBodu = razeni === 'body';
  const nejnovejsi = razeni === 'nejnovejsi';
  const rows = await sql`
    SELECT m.customer_id AS id, us.name, us.email, m.points, m.stamps, m.visits, m.joined_at, m.last_visit_at,
           COALESCE((to_jsonb(m)->>'spend')::int, 0) AS spend,
           (SELECT COUNT(*)::int FROM client_reservations r WHERE r.customer_id = m.customer_id AND r.team_id = m.team_id) AS reservations,
           (SELECT COUNT(*)::int FROM client_coupon_claims c WHERE c.customer_id = m.customer_id AND c.team_id = m.team_id AND c.redeemed_at IS NULL) AS open_coupons
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${u.team_id}
      AND (${q} = '' OR LOWER(us.name) LIKE ${like} ESCAPE '\\' OR (${kontakty} AND LOWER(us.email) LIKE ${like} ESCAPE '\\'))
    ORDER BY
      CASE WHEN ${podleNavstev} THEN m.visits END DESC NULLS LAST,
      CASE WHEN ${podleBodu} THEN m.points END DESC NULLS LAST,
      CASE WHEN ${nejnovejsi} THEN m.joined_at END DESC NULLS LAST,
      m.last_visit_at DESC NULLS LAST, m.joined_at DESC
    LIMIT ${strop}` as any[];
  const [cnt] = await sql`
    SELECT COUNT(*)::int AS total
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${u.team_id}
      AND (${q} = '' OR LOWER(us.name) LIKE ${like} ESCAPE '\\' OR (${kontakty} AND LOWER(us.email) LIKE ${like} ESCAPE '\\'))` as any[];
  // Úroveň podle režimu podniku a efektivní sleva (nejvyšší z úrovně a slev skupin).
  const pravidla = tierRulesFromProfile(await ensureProfile(u.team_id));
  const ids = rows.map(r => Number(r.id));
  const skupinyBy = new Map<number, { name: string; discount: number }[]>();
  if (ids.length) {
    try {
      const sk = await sql`
        SELECT gm.customer_id, g.name, g.discount_pct FROM client_group_members gm
        JOIN client_groups g ON g.id = gm.group_id AND g.team_id = gm.team_id
        WHERE gm.team_id = ${u.team_id} AND g.discount_pct > 0 AND gm.customer_id = ANY(${ids})` as any[];
      for (const r of sk) {
        const c = Number(r.customer_id);
        if (!skupinyBy.has(c)) skupinyBy.set(c, []);
        skupinyBy.get(c)!.push({ name: String(r.name), discount: Number(r.discount_pct) || 0 });
      }
    } catch { /* před migrací */ }
  }
  // Razítka: s kampaněmi je zdrojem pravdy průběh kampaní, ne staré počítadlo na členství (dvojí počítadlo).
  const razitkaBy = new Map<number, number>();
  if (ids.length) {
    try {
      if (await maKampane(u.team_id)) {
        const sp = await sql`
          SELECT p.customer_id, COALESCE(SUM(p.stamps), 0)::int AS s FROM client_stamp_progress p
          JOIN client_stamp_campaigns c ON c.id = p.campaign_id AND c.active = TRUE
          WHERE p.team_id = ${u.team_id} AND p.customer_id = ANY(${ids}) GROUP BY p.customer_id` as any[];
        for (const r of ids) razitkaBy.set(r, 0);
        for (const r of sp) razitkaBy.set(Number(r.customer_id), Number(r.s) || 0);
      }
    } catch { /* před migrací zůstane počítadlo z členství */ }
  }
  const obohacene = rows.map(r => {
    if (razitkaBy.size) r = { ...r, stamps: razitkaBy.get(Number(r.id)) ?? 0 };
    const t = tierForMember({ visits: r.visits, spend: r.spend }, pravidla);
    const s = efektivniSleva({ uroven: t, skupiny: skupinyBy.get(Number(r.id)) });
    return { ...r, level: t.id, level_label: t.label, discount: s.pct, discount_source: s.zdroj, discount_name: s.nazev };
  });
  const customers = kontakty ? obohacene : obohacene.map(({ email: _e, ...r }) => r);
  return NextResponse.json({ customers, total: cnt?.total ?? rows.length });
}
