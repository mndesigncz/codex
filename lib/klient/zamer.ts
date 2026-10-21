// Záměr hosta u kasy: host si v „U kasy“ přibalí připravenou odměnu (claim kuponu, který už drží —
// odměna za plnou kartu razítek, vyměněný kupon za body, kupon z kampaně) k příštímu načtení
// karty v podniku. Čtečka (SPRÁVA) ho přečte přes `zamerHosta` a ukáže jako hlavní akci;
// uplatnění jde existující cestou (POST /api/client/admin/redeem s `code`), čímž se claim
// označí `redeemed_at` a záměr tím sám zanikne. Kontrakt: …/klient/kontrakt-ctecka.md.
//
// Pravidla:
//  · jeden záměr na hosta a podnik (PK customer_id, team_id), PUT ho přepíše;
//  · platí ZAMER_PLATNOST_MIN minut (host si ho zapne u stolu, platí ještě u placení);
//  · neplatný je, když claim mezitím uplatnil někdo jiný nebo vypršel (valid_until).

import { sql } from '../client';
import { benefitLabel } from '../coupons';
import { menaPodniku } from '../menaPodniku';
import { pragueToday } from '../pragueTime';
import { zajistiHosta } from './schema';

export const ZAMER_PLATNOST_MIN = 120;

export interface ZamerHosta {
  /** client_coupon_claims.id */
  claimId: number;
  /** Kód claimu (ABC-DEF) — čtečka ho pošle do /api/client/admin/redeem. */
  code: string;
  title: string;
  /** Výhoda větou („−20 %“, „Káva zdarma“), nebo null. */
  benefit: string | null;
  /** Odměna za plnou kartu razítek. */
  fromStamps: boolean;
  validUntil: string | null;
  /** ISO čas, kdy si host odměnu přibalil a do kdy záměr platí. */
  createdAt: string;
  expiresAt: string;
}

const iso = (v: any) => (v instanceof Date ? v.toISOString() : new Date(String(v).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? '' : 'Z')).toISOString());

/** Platný záměr hosta v podniku, nebo null. Volá čtečka po načtení karty (GET staff/scan). */
export async function zamerHosta(teamId: number, customerId: number): Promise<ZamerHosta | null> {
  try { await zajistiHosta(); } catch { return null; }
  const rows = await sql`
    SELECT z.claim_id, z.created_at, z.expires_at, cl.code, c.title, c.kind, c.valid_until,
           c.benefit_kind, c.percent_off, c.amount_off, c.xy_buy, c.xy_free,
           (SELECT mi.name FROM menu_items mi WHERE mi.id = c.menu_item_id) AS menu_item_name
    FROM client_host_zamery z
    JOIN client_coupon_claims cl ON cl.id = z.claim_id AND cl.customer_id = z.customer_id AND cl.team_id = z.team_id
    JOIN client_coupons c ON c.id = cl.coupon_id
    WHERE z.team_id = ${teamId} AND z.customer_id = ${customerId}
      AND z.expires_at > NOW() AND cl.redeemed_at IS NULL` as any[];
  const r = rows[0];
  if (!r) return null;
  if (r.valid_until && String(r.valid_until).slice(0, 10) < pragueToday()) return null;
  const mena = await menaPodniku(teamId);
  return {
    claimId: Number(r.claim_id), code: String(r.code), title: String(r.title),
    benefit: benefitLabel(r, mena.money) || null, fromStamps: r.kind === 'stamps',
    validUntil: r.valid_until ?? null, createdAt: iso(r.created_at), expiresAt: iso(r.expires_at),
  };
}

/** Všechny platné záměry hosta (pro jeho obrazovku U kasy): teamId → claimId + expiresAt. */
export async function zameryHosta(customerId: number): Promise<{ teamId: number; claimId: number; expiresAt: string }[]> {
  await zajistiHosta();
  const rows = await sql`
    SELECT z.team_id, z.claim_id, z.expires_at FROM client_host_zamery z
    JOIN client_coupon_claims cl ON cl.id = z.claim_id AND cl.redeemed_at IS NULL
    WHERE z.customer_id = ${customerId} AND z.expires_at > NOW()` as any[];
  return rows.map(r => ({ teamId: Number(r.team_id), claimId: Number(r.claim_id), expiresAt: iso(r.expires_at) }));
}

/**
 * Host přibalí odměnu. Claim musí patřit jemu a podniku a nesmí být uplatněný.
 * Vrací chybu větou, nebo null.
 */
export async function nastavZamer(customerId: number, teamId: number, claimId: number): Promise<string | null> {
  await zajistiHosta();
  const [cl] = await sql`
    SELECT cl.id, cl.redeemed_at, c.valid_until FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id
    WHERE cl.id = ${claimId} AND cl.customer_id = ${customerId} AND cl.team_id = ${teamId}`;
  if (!cl) return 'Takovou odměnu nemáš.';
  if (cl.redeemed_at) return 'Odměna už je uplatněná.';
  if (cl.valid_until && String(cl.valid_until).slice(0, 10) < pragueToday()) return 'Odměně skončila platnost.';
  await sql`
    INSERT INTO client_host_zamery (customer_id, team_id, claim_id, created_at, expires_at)
    VALUES (${customerId}, ${teamId}, ${claimId}, NOW(), NOW() + make_interval(mins => ${ZAMER_PLATNOST_MIN}::int))
    ON CONFLICT (customer_id, team_id) DO UPDATE SET claim_id = EXCLUDED.claim_id, created_at = NOW(), expires_at = EXCLUDED.expires_at`;
  return null;
}

/** Host záměr zruší (přepínač vypnul). */
export async function zrusZamer(customerId: number, teamId: number): Promise<void> {
  await zajistiHosta();
  await sql`DELETE FROM client_host_zamery WHERE customer_id = ${customerId} AND team_id = ${teamId}`;
}

/**
 * Úklid po uplatnění (volitelné pro čtečku — záměr zanikne i sám, protože claim má redeemed_at).
 * Bezpečné volat vždy po úspěšném uplatnění claimu.
 */
export async function splnenoZamer(teamId: number, customerId: number): Promise<void> {
  try { await zajistiHosta(); await sql`DELETE FROM client_host_zamery WHERE customer_id = ${customerId} AND team_id = ${teamId}`; } catch { /* záměr zanikne i sám */ }
}
