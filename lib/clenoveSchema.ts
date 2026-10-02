// Sloupce a tabulky pro skupiny, členy, zprávy a automatizace (kolo 81).
//
// Stejné příkazy jsou v app/api/init/route.ts (blok „Kolo 81“; odtud je čte kontrola SQL). Tady se
// spustí jednou za studený start, ať všechno funguje i dřív, než někdo po nasazení otevře /api/init.

import { sql } from './client';

let pripraveno: Promise<void> | null = null;

export function zajistiSchemaClenu(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS description TEXT`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS color TEXT`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS rule TEXT`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS discount_pct INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_memberships ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`ALTER TABLE client_memberships ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP`;
      await sql`ALTER TABLE client_memberships ADD COLUMN IF NOT EXISTS note TEXT`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS channels TEXT NOT NULL DEFAULT 'push'`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS coupon_id INTEGER`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS promo_code TEXT`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS audience_ids JSONB`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS prijemci JSONB`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS push_count INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS email_sent INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS email_failed INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS no_consent INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS email_total INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS email_pos INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS link_kind TEXT`;
      await sql`
        CREATE TABLE IF NOT EXISTS client_automatizace (
          team_id INTEGER NOT NULL,
          kind TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT FALSE,
          config JSONB NOT NULL DEFAULT '{}'::jsonb,
          enabled_at TIMESTAMP,
          updated_at TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (team_id, kind)
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS client_automatizace_log (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          kind TEXT NOT NULL,
          customer_id INTEGER NOT NULL,
          ref TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'odeslano',
          channels TEXT,
          note TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE (team_id, kind, customer_id, ref)
        )`;
      await sql`CREATE INDEX IF NOT EXISTS client_automatizace_log_team ON client_automatizace_log (team_id, created_at)`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}
