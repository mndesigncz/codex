// Schéma razítkových kampaní a integrity připisování u kasy (balík W1).
//
// Stejné příkazy jsou v app/api/init/route.ts (blok „W1 — razítka"); odtud je čte
// kontrola SQL. Tady se spustí jednou za studený start, ať kampaně a kasa fungují
// i dřív, než někdo po nasazení otevře /api/init.

import { sql } from './client';

let pripraveno: Promise<void> | null = null;

export function zajistiRazitka(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      // Kampaň: stav (koncept / běží / pozastaveno / archiv), limity a okna platnosti.
      await sql`ALTER TABLE client_stamp_campaigns ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`;
      await sql`ALTER TABLE client_stamp_campaigns ADD COLUMN IF NOT EXISTS max_completions INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_stamp_campaigns ADD COLUMN IF NOT EXISTS daily_cap INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_stamp_campaigns ADD COLUMN IF NOT EXISTS days_of_week JSONB NOT NULL DEFAULT '[]'`;
      await sql`ALTER TABLE client_stamp_campaigns ADD COLUMN IF NOT EXISTS hour_from TEXT`;
      await sql`ALTER TABLE client_stamp_campaigns ADD COLUMN IF NOT EXISTS hour_till TEXT`;
      await sql`ALTER TABLE client_stamp_campaigns ADD COLUMN IF NOT EXISTS excluded_items JSONB NOT NULL DEFAULT '[]'`;
      // Dřív vypnutá kampaň = active FALSE; teď je to stav „pozastaveno". Idempotentní.
      await sql`UPDATE client_stamp_campaigns SET status = 'paused' WHERE active = FALSE AND status = 'active'`;
      // Průběh hosta: rev hlídá souběžné zápisy, expired_* je zpráva o propadlé kartě.
      await sql`ALTER TABLE client_stamp_progress ADD COLUMN IF NOT EXISTS rev INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_stamp_progress ADD COLUMN IF NOT EXISTS expired_count INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_stamp_progress ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP`;
      await sql`ALTER TABLE client_stamp_progress ADD COLUMN IF NOT EXISTS day_of TEXT`;
      await sql`ALTER TABLE client_stamp_progress ADD COLUMN IF NOT EXISTS day_stamps INTEGER NOT NULL DEFAULT 0`;
      // Deník razítek: každý přírůstek, ruční úprava, storno a propadnutí. Z něj se bere denní strop,
      // statistika, storno poslední akce a idempotence (ref je na kampaň a hosta jedinečný).
      await sql`
        CREATE TABLE IF NOT EXISTS client_stamp_events (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          campaign_id INTEGER NOT NULL,
          customer_id INTEGER NOT NULL,
          kind TEXT NOT NULL,
          delta INTEGER NOT NULL DEFAULT 0,
          completions INTEGER NOT NULL DEFAULT 0,
          before_stamps INTEGER NOT NULL DEFAULT 0,
          before_completed INTEGER NOT NULL DEFAULT 0,
          card_started_at TIMESTAMP,
          before_started_at TIMESTAMP,
          ref TEXT,
          reason TEXT,
          staff_id INTEGER,
          day TEXT NOT NULL,
          undone_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS client_stamp_events_member ON client_stamp_events (campaign_id, customer_id, id)`;
      await sql`CREATE INDEX IF NOT EXISTS client_stamp_events_day ON client_stamp_events (team_id, campaign_id, day)`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS client_stamp_events_ref ON client_stamp_events (campaign_id, customer_id, ref) WHERE ref IS NOT NULL AND kind = 'earn'`;
      // Kupon za plnou kartu ví, ze které kampaně a z které události vzešel.
      await sql`ALTER TABLE client_coupons ADD COLUMN IF NOT EXISTS campaign_id INTEGER`;
      await sql`ALTER TABLE client_coupons ADD COLUMN IF NOT EXISTS stamp_event_id INTEGER`;
      // Deník věrnosti: kdo to u kasy připsal.
      await sql`ALTER TABLE client_loyalty_ledger ADD COLUMN IF NOT EXISTS staff_id INTEGER`;
      // Guard účtenky: done_at prázdné = připisování se rozběhlo a nedoběhlo; kroky už hotové se při opakování přeskočí.
      // Starým řádkům dá výchozí NOW() hodnotu „hotovo".
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS done_at TIMESTAMP DEFAULT NOW()`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS kroky TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS staff_id INTEGER`;
      // Idempotence akcí u kasy: klíč z UI a pětisekundový otisk stejné akce téhož hosta.
      await sql`
        CREATE TABLE IF NOT EXISTS client_scan_actions (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          customer_id INTEGER NOT NULL,
          staff_id INTEGER,
          action TEXT NOT NULL,
          idem_key TEXT,
          fingerprint TEXT NOT NULL,
          bucket BIGINT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS client_scan_actions_key ON client_scan_actions (team_id, idem_key) WHERE idem_key IS NOT NULL`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS client_scan_actions_fp ON client_scan_actions (team_id, customer_id, fingerprint, bucket)`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}
