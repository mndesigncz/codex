// Úrovně podle útraty a slevové skupiny — zápis a čtení v databázi.
// Čisté funkce jsou v lib/clientSlots.ts (tierFor) a lib/slevy.ts (efektivniSleva).
//
// Sloupce se zajišťují i tady (ADD COLUMN IF NOT EXISTS při prvním použití),
// ať věrnost funguje dřív, než někdo po nasazení otevře /api/init. Stejné
// příkazy jsou v app/api/init/route.ts (blok „Kolo 74“); odtud je čte kontrola SQL.
//
// Útrata člena (client_memberships.spend) jsou celé jednotky měny podniku,
// kumulované za celou dobu. Plní se tam, kde se věrnost připisuje z peněz:
// z účtenky (guard client_bill_awards), z částky u kasy a z hotové objednávky.
// Chyba tady nikdy neshodí připsání bodů — útrata je doplněk, ne podmínka.

import { sql } from './client';
import { efektivniSleva, type EfektivniSleva, type SlevaSkupiny } from './slevy';
import { celaUtrata, MAX_UTRATA, type Tier } from './clientSlots';

let pripraveno: Promise<void> | null = null;

/** Zajistí sloupce pro útratu, režim úrovní a slevu skupin. Jednou za studený start. */
export function zajistiUrovne(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`ALTER TABLE client_memberships ADD COLUMN IF NOT EXISTS spend INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS tier_by TEXT NOT NULL DEFAULT 'visits'`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS silver_spend INTEGER NOT NULL DEFAULT 5000`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS gold_spend INTEGER NOT NULL DEFAULT 15000`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS platinum_spend INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS discount_pct INTEGER NOT NULL DEFAULT 0`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

/** Připíše útratu členovi. Vrací novou kumulovanou útratu, nebo null, když se zápis nepovedl. */
export async function pripisUtratu(teamId: number, customerId: number, castka: unknown): Promise<number | null> {
  const n = celaUtrata(castka);
  if (n <= 0) return null;
  try {
    await zajistiUrovne();
    const [m] = await sql`
      UPDATE client_memberships SET spend = LEAST(2000000000, spend + ${n})
      WHERE customer_id = ${customerId} AND team_id = ${teamId}
      RETURNING spend`;
    return m ? Number(m.spend) : null;
  } catch (e) {
    console.error('[urovne] útrata se nezapsala', e);
    return null;
  }
}

/** Ruční úprava útrata (±). Pod nulu nejde. Vrací novou útratu, nebo null, když člen není. */
export async function upravUtratu(teamId: number, customerId: number, delta: number): Promise<number | null> {
  await zajistiUrovne();
  const d = Math.max(-MAX_UTRATA, Math.min(MAX_UTRATA, Math.round(Number(delta) || 0)));
  const [m] = await sql`
    UPDATE client_memberships SET spend = LEAST(2000000000, GREATEST(0, spend + ${d}))
    WHERE customer_id = ${customerId} AND team_id = ${teamId}
    RETURNING spend`;
  return m ? Number(m.spend) : null;
}

/**
 * Jednorázové dopočtení útraty z toho, co o penězích víme přesně: hotové objednávky
 * od stolu a účtenky, které věrnost připsaly (client_bill_awards × pos_bills).
 * Mění jen členy s nulovou útratou — ruční úpravy a už započtená útrata zůstanou.
 * Útrata zadaná u kasy ručně („points" s částkou) se zpětně zjistit nedá, nikde se neukládala.
 */
export async function dopocitejUtratu(teamId: number): Promise<number> {
  await zajistiUrovne();
  const rows = await sql`
    WITH zdroj AS (
      SELECT o.customer_id, o.total::numeric AS castka FROM client_orders o
      WHERE o.team_id = ${teamId} AND o.status = 'done'
      UNION ALL
      SELECT a.customer_id, b.final_price AS castka FROM client_bill_awards a
      JOIN pos_bills b ON b.team_id = a.team_id AND b.bill_id = a.bill_id
      WHERE a.team_id = ${teamId}
    ), soucet AS (
      SELECT customer_id, LEAST(2000000000, ROUND(SUM(castka)))::int AS spend FROM zdroj GROUP BY customer_id
    )
    UPDATE client_memberships m SET spend = s.spend
    FROM soucet s
    WHERE m.team_id = ${teamId} AND m.customer_id = s.customer_id AND m.spend = 0 AND s.spend > 0
    RETURNING m.customer_id` as any[];
  return rows.length;
}

/** Slevy skupin, ve kterých člen je (jen s nenulovou slevou). Před migrací prázdné. */
export async function slevySkupinClena(teamId: number, customerId: number): Promise<SlevaSkupiny[]> {
  try {
    const rows = await sql`
      SELECT g.name, g.discount_pct FROM client_group_members gm
      JOIN client_groups g ON g.id = gm.group_id AND g.team_id = gm.team_id
      WHERE gm.team_id = ${teamId} AND gm.customer_id = ${customerId} AND g.discount_pct > 0
      ORDER BY g.discount_pct DESC, g.name` as any[];
    return rows.map(r => ({ name: String(r.name), discount: Number(r.discount_pct) || 0 }));
  } catch { return []; }
}

/** Efektivní sleva člena: nejvyšší z úrovně a skupin (nikdy součet). */
export async function slevaClena(teamId: number, customerId: number, tier: Pick<Tier, 'discount' | 'label'>): Promise<EfektivniSleva> {
  return efektivniSleva({ uroven: tier, skupiny: await slevySkupinClena(teamId, customerId) });
}
