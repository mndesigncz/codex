// Za co host dostává body mimo kasu: nastavení a připsání za rezervaci. Čistá logika je v lib/bodyZdroje.ts.
//
// Sloupce se zajišťují i tady (ADD COLUMN IF NOT EXISTS při prvním použití), ať nastavení funguje dřív, než někdo
// po nasazení otevře /api/init; stejné příkazy jsou v app/api/init/route.ts.
// Body za rezervaci se nejdřív „zaberou“ (UPDATE ... WHERE points_awarded = 0 RETURNING) a teprve pak připíšou:
// dvojklik na „Proběhlo“ ani opakované uzavření nepřipíše body dvakrát; při chybě se zábor vrátí.

import { sql, award } from './client';
import { audit } from './audit';
import { zdrojeZProfilu, type ZdrojeBodu } from './bodyZdroje';

let pripraveno: Promise<void> | null = null;

export function zajistiBodyZdroje(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_orders BOOLEAN NOT NULL DEFAULT TRUE`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_per_reservation INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_reservations ADD COLUMN IF NOT EXISTS points_awarded INTEGER NOT NULL DEFAULT 0`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

export async function nactiZdroje(teamId: number): Promise<ZdrojeBodu> {
  try {
    await zajistiBodyZdroje();
    const [r] = await sql`SELECT points_orders, points_per_reservation FROM client_profiles WHERE team_id = ${teamId}`;
    return zdrojeZProfilu(r);
  } catch { return zdrojeZProfilu(null); }
}

/** Uloží nastavení (už ověřené normalizujZdroje) a zapíše do historie změn. False = podnik nemá profil. */
export async function ulozZdroje(teamId: number, userId: number, z: ZdrojeBodu): Promise<boolean> {
  await zajistiBodyZdroje();
  const rows = await sql`UPDATE client_profiles SET points_orders = ${z.objednavky}, points_per_reservation = ${z.zaRezervaci} WHERE team_id = ${teamId} RETURNING team_id` as any[];
  if (!rows.length) return false;
  await audit(teamId, userId, 'klient.body.zdroje', 'client_profile', teamId,
    `body za objednávky ${z.objednavky ? 'ano' : 'ne'}, za rezervaci ${z.zaRezervaci || 'žádné'}`);
  return true;
}

/**
 * Připíše hostovi body za rezervaci, která proběhla (nastavení podniku). Jednou za rezervaci.
 * Vrací počet připsaných bodů (0 = nic: nastavení je 0, body už byly připsány, nebo rezervace není hostova).
 */
export async function pripisBodyZaRezervaci(teamId: number, reservationId: number, customerId: number): Promise<number> {
  let body = 0;
  try { body = (await nactiZdroje(teamId)).zaRezervaci; } catch { return 0; }
  if (body <= 0) return 0;
  const zabrano = await sql`
    UPDATE client_reservations SET points_awarded = ${body}
    WHERE id = ${reservationId} AND team_id = ${teamId} AND customer_id = ${customerId} AND points_awarded = 0
    RETURNING id` as any[];
  if (!zabrano.length) return 0;
  try {
    await award(teamId, customerId, body, 'visit', `res:${reservationId}`, 'Rezervace proběhla');
  } catch (e) {
    await sql`UPDATE client_reservations SET points_awarded = 0 WHERE id = ${reservationId} AND team_id = ${teamId}`.catch(() => {});
    throw e;
  }
  return body;
}
