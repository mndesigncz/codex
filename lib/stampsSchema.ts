// Schéma razítek zajištěné při prvním použití (kdyby někdo po nasazení ještě
// neotevřel /api/init). Stejné příkazy jsou v app/api/init/route.ts (blok
// „Úplnost razítek“). Všechno je IF NOT EXISTS, takže opakování nic nerozbije.

import { sql } from './client';

let pripraveno: Promise<void> | null = null;

export function zajistiRazitka(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      // Po jednom příkazu na tabulku (jeden dotaz do databáze místo osmnácti): hostovské stránky čtou kampaně
      // a při studeném startu by jinak zdržely první zobrazení.
      await sql`
        ALTER TABLE client_stamp_campaigns
          ADD COLUMN IF NOT EXISTS max_completions INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS daily_cap INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS valid_days JSONB NOT NULL DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS hour_from TEXT,
          ADD COLUMN IF NOT EXISTS hour_till TEXT,
          ADD COLUMN IF NOT EXISTS excluded_items JSONB NOT NULL DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS stamp_sections JSONB NOT NULL DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS excluded_sections JSONB NOT NULL DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS combinable BOOLEAN NOT NULL DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS draft BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS card_color TEXT,
          ADD COLUMN IF NOT EXISTS card_icon TEXT,
          ADD COLUMN IF NOT EXISTS card_image TEXT`;
      await sql`
        ALTER TABLE client_stamp_progress
          ADD COLUMN IF NOT EXISTS ver INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS expired_stamps INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP`;
      await sql`ALTER TABLE client_coupons ADD COLUMN IF NOT EXISTS campaign_id INTEGER`;
      await sql`
        CREATE TABLE IF NOT EXISTS client_stamp_events (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          campaign_id INTEGER NOT NULL,
          customer_id INTEGER NOT NULL,
          delta INTEGER NOT NULL DEFAULT 0,
          kind TEXT NOT NULL DEFAULT 'visit',
          ref TEXT,
          note TEXT,
          staff_id INTEGER,
          amount NUMERIC(12,2),
          completions INTEGER NOT NULL DEFAULT 0,
          took_days NUMERIC(8,2),
          expired INTEGER NOT NULL DEFAULT 0,
          stamps_before INTEGER,
          completed_before INTEGER,
          started_before TIMESTAMP,
          last_stamp_before TIMESTAMP,
          last_completed_before TIMESTAMP,
          claim_ids JSONB NOT NULL DEFAULT '[]',
          undone_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS client_stamp_events_campaign ON client_stamp_events (team_id, campaign_id, created_at)`;
      await sql`CREATE INDEX IF NOT EXISTS client_stamp_events_customer ON client_stamp_events (team_id, customer_id, created_at)`;
      await sql`
        CREATE TABLE IF NOT EXISTS client_kasa_idem (
          team_id INTEGER NOT NULL,
          idem_key TEXT NOT NULL,
          response JSONB,
          status INTEGER,
          created_at TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (team_id, idem_key)
        )`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}
