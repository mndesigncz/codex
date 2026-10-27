// Schéma hostovské části (přestavba Managero client): záměr hosta u kasy, indexy živé odezvy
// a schránka. Stejné příkazy jsou v app/api/init/route.ts (blok „Host (přestavba Managero client)“);
// odtud je čte kontrola SQL. Tady běží jednou za studený start, ať host funguje i dřív,
// než někdo po nasazení otevře /api/init.

import { sql } from '../client';

let pripraveno: Promise<void> | null = null;

export function zajistiHosta(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS client_host_zamery (
          customer_id INTEGER NOT NULL,
          team_id INTEGER NOT NULL,
          claim_id INTEGER NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP NOT NULL,
          PRIMARY KEY (customer_id, team_id)
        )`;
      await sql`CREATE INDEX IF NOT EXISTS client_ledger_customer_time ON client_loyalty_ledger (customer_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS client_coupon_claims_customer_redeemed ON client_coupon_claims (customer_id, redeemed_at)`;
      await sql`CREATE INDEX IF NOT EXISTS client_stamp_events_customer_time ON client_stamp_events (customer_id, created_at DESC)`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS host_aktivita_videno TIMESTAMP`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS phone TEXT`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}
