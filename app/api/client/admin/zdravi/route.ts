// Zdraví věrnostního programu pro Přehled správy Managero client (kolo 92, audit C §7 a §10).
// Jen z dat, která už máme, nic se neodhaduje:
//  - noví členové za 30 dní a za 30 dní předtím (client_memberships.joined_at);
//  - odměny: kolik kuponů se za 30 dní uplatnilo a kolik se jich vzalo / vydalo (client_coupon_claims);
//  - návrat: z hostů, kteří byli u kasy před 31 až 60 dny, kolik přišlo znovu v posledních 30 dnech
//    (client_loyalty_ledger kind = 'visit'); bez návštěv v tom okně null — žádné vymyšlené procento;
//  - posledních 14 dní po pražských dnech: razítka (client_stamp_events, bez stornovaných),
//    rozdané body (kladné pohyby deníku) a uplatněné kupony.
// Každá část jen s vernost.zobrazit (stejně jako /api/client/admin/loyalty).
import { NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { pragueToday } from '@/lib/pragueTime';
import { dnyZpet } from '@/lib/klientSprava/zdravi';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const t = ctx.teamId;
  const dny = dnyZpet(pragueToday(), 14);
  const od = dny[0];
  const [[clenove], [odmeny], [navrat], razitka, body, uplatneno] = await Promise.all([
    sql`SELECT COUNT(*) FILTER (WHERE joined_at >= NOW() - INTERVAL '30 days')::int AS n30,
               COUNT(*) FILTER (WHERE joined_at >= NOW() - INTERVAL '60 days' AND joined_at < NOW() - INTERVAL '30 days')::int AS predtim30
        FROM client_memberships WHERE team_id = ${t}`,
    sql`SELECT COUNT(*) FILTER (WHERE redeemed_at >= NOW() - INTERVAL '30 days')::int AS uplatneno30,
               COUNT(*) FILTER (WHERE claimed_at >= NOW() - INTERVAL '30 days')::int AS vydano30
        FROM client_coupon_claims WHERE team_id = ${t}`.catch(() => [{ uplatneno30: 0, vydano30: 0 }]),
    sql`WITH drive AS (
          SELECT DISTINCT customer_id FROM client_loyalty_ledger
          WHERE team_id = ${t} AND kind = 'visit' AND created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days'
        )
        SELECT (SELECT COUNT(*) FROM drive)::int AS z,
               (SELECT COUNT(DISTINCT l.customer_id) FROM client_loyalty_ledger l JOIN drive d ON d.customer_id = l.customer_id
                 WHERE l.team_id = ${t} AND l.kind = 'visit' AND l.created_at >= NOW() - INTERVAL '30 days')::int AS vratilo`,
    sql`SELECT day AS den, COALESCE(SUM(delta), 0)::int AS n FROM client_stamp_events
        WHERE team_id = ${t} AND day >= ${od} AND undone_at IS NULL AND delta > 0 GROUP BY day`.catch(() => []),
    sql`SELECT ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague')::date::text AS den, COALESCE(SUM(delta), 0)::int AS n
        FROM client_loyalty_ledger WHERE team_id = ${t} AND delta > 0 AND created_at >= ${od}::date - INTERVAL '1 day'
        GROUP BY 1`,
    sql`SELECT ((redeemed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague')::date::text AS den, COUNT(*)::int AS n
        FROM client_coupon_claims WHERE team_id = ${t} AND redeemed_at >= ${od}::date - INTERVAL '1 day'
        GROUP BY 1`.catch(() => []),
  ]) as any[];
  const mapa = (rows: any[]) => new Map<string, number>(rows.map(r => [String(r.den).slice(0, 10), Number(r.n) || 0]));
  const r = mapa(razitka), b = mapa(body), u = mapa(uplatneno);
  const z = Number(navrat?.z) || 0;
  return NextResponse.json({
    noviClenove: { n30: Number(clenove?.n30) || 0, predtim30: Number(clenove?.predtim30) || 0 },
    odmeny: { uplatneno30: Number(odmeny?.uplatneno30) || 0, vydano30: Number(odmeny?.vydano30) || 0 },
    navrat: z > 0 ? { vratilo: Number(navrat?.vratilo) || 0, z } : null,
    dny: dny.map(den => ({ den, razitek: r.get(den) ?? 0, body: b.get(den) ?? 0, uplatneno: u.get(den) ?? 0 })),
  });
}
