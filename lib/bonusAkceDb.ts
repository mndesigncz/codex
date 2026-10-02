// Bonusové akce v databázi: tabulka pravidel a „co platí právě teď".
// Čistá logika je v lib/bonusAkce.ts.
//
// Tabulka se zajišťuje i tady (CREATE TABLE IF NOT EXISTS při prvním použití),
// ať akce jdou založit dřív, než někdo po nasazení otevře /api/init. Stejný
// příkaz je v app/api/init/route.ts (blok „Kolo 73“).
//
// Čtení při připisování je fail-open: když tabulka není nebo dotaz selže,
// platí „žádný bonus" a body se připíšou jako dřív.

import { sql } from './client';
import { tvarPravidla, vyberBonus, prazskeTed, ZADNY_BONUS, type Bonus, type BonusPravidlo } from './bonusAkce';

let pripraveno: Promise<void> | null = null;

/** Zajistí tabulku bonusových akcí. Jednou za studený start. */
export function zajistiBonusAkce(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS client_bonus_rules (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          multiplier NUMERIC(5,2) NOT NULL DEFAULT 1,
          stamp_bonus INTEGER NOT NULL DEFAULT 0,
          days_of_week JSONB NOT NULL DEFAULT '[]',
          hour_from INTEGER NOT NULL DEFAULT 0,
          hour_till INTEGER NOT NULL DEFAULT 24,
          valid_since TEXT,
          valid_till TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS client_bonus_rules_team ON client_bonus_rules (team_id)`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

/** Všechna pravidla podniku (i vypnutá) pro správu. */
export async function bonusPravidla(teamId: number): Promise<BonusPravidlo[]> {
  await zajistiBonusAkce();
  const rows = await sql`SELECT * FROM client_bonus_rules WHERE team_id = ${teamId} ORDER BY active DESC, id` as any[];
  return rows.map(tvarPravidla);
}

/** Bonus, který v podniku platí v daný okamžik (výchozí teď). Chyba = žádný bonus. */
export async function aktivniBonus(teamId: number, at: Date = new Date()): Promise<Bonus> {
  try {
    const rows = await sql`SELECT * FROM client_bonus_rules WHERE team_id = ${teamId} AND active = TRUE` as any[];
    if (!rows.length) return ZADNY_BONUS;
    return vyberBonus(rows.map(tvarPravidla), prazskeTed(at));
  } catch { return ZADNY_BONUS; }
}
