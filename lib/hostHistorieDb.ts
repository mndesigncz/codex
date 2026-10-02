// Historie hosta: body, razítka, kredit a kupony jedním časovým seznamem (nejnovější nahoře).
//
// Zdroje: deník bodů (client_loyalty_ledger), odměny za dokončené razítkové karty (kupony druhu `stamps`)
// a uplatněné kupony. Kupon za body se ukáže jednou, řádkem deníku (s názvem kuponu), ne podruhé jako „vzatý“.
// Host NIKDY nedostane interní poznámku podniku (`note`) ani `ref` deníku; vrací se jen druh záznamu,
// čísla a název kuponu. Upozornění na propadnutí (řádek bez bodů) se do historie nedostává.
// Stránkování: strana + velikost (na straně nejvýš 50), „další“ se pozná o jeden řádek navíc.

import { sql } from './client';
import { typZaznamu, stranaHistorie, type TypZaznamu } from './hostPrehled';

export interface PolozkaHistorie {
  key: string;
  typ: TypZaznamu;
  /** ISO čas; zobrazení v pražské zóně řeší klient. */
  at: string;
  points: number;
  credit: number;
  title: string | null;
  business: string;
  slug: string | null;
  currency: string;
}

export async function historieHosta(customerId: number, o: { teamId?: number | null; strana?: unknown; naStranu?: unknown }): Promise<{ polozky: PolozkaHistorie[]; dalsi: boolean; strana: number; naStranu: number }> {
  const { strana, naStranu, offset } = stranaHistorie(o.strana, o.naStranu);
  const tym = o.teamId != null && Number.isInteger(o.teamId) ? o.teamId : null;
  const rows = await sql`
    SELECT x.src, x.id, to_char(x.at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, x.kind, x.delta, x.credit_delta, x.title, x.team_id,
           p.slug, COALESCE(NULLIF(t.share_theme->>'businessName', ''), t.name) AS business, t.currency
    FROM (
      SELECT 'l' AS src, l.id, l.created_at AS at, l.kind, l.delta, l.credit_delta, c.title, l.team_id
      FROM client_loyalty_ledger l
      LEFT JOIN client_coupon_claims cl ON l.kind = 'coupon' AND cl.code = l.ref AND cl.customer_id = l.customer_id
      LEFT JOIN client_coupons c ON c.id = cl.coupon_id
      WHERE l.customer_id = ${customerId} AND (${tym}::int IS NULL OR l.team_id = ${tym})
        AND (l.delta <> 0 OR l.credit_delta <> 0 OR l.kind = 'visit')
      UNION ALL
      SELECT 's', cl.id, cl.claimed_at, 'reward', 0, 0, c.title, cl.team_id
      FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id
      WHERE cl.customer_id = ${customerId} AND c.kind <> 'offer' AND (${tym}::int IS NULL OR cl.team_id = ${tym})
      UNION ALL
      SELECT 'u', cl.id, cl.redeemed_at, 'used', 0, 0, c.title, cl.team_id
      FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id
      WHERE cl.customer_id = ${customerId} AND cl.redeemed_at IS NOT NULL AND (${tym}::int IS NULL OR cl.team_id = ${tym})
    ) x
    LEFT JOIN client_profiles p ON p.team_id = x.team_id
    LEFT JOIN teams t ON t.id = x.team_id
    ORDER BY x.at DESC, x.src, x.id DESC
    LIMIT ${naStranu + 1} OFFSET ${offset}` as any[];
  const polozky = rows.slice(0, naStranu).map((r): PolozkaHistorie => ({
    key: `${r.src}${r.id}`,
    typ: typZaznamu({ src: String(r.src), kind: String(r.kind), delta: Number(r.delta) || 0, credit_delta: Number(r.credit_delta) || 0 }),
    at: String(r.at),
    points: Number(r.delta) || 0,
    credit: Number(r.credit_delta) || 0,
    title: r.title ? String(r.title) : null,
    business: String(r.business ?? ''),
    slug: r.slug ?? null,
    currency: String(r.currency ?? 'CZK'),
  }));
  return { polozky, dalsi: rows.length > naStranu, strana, naStranu };
}
