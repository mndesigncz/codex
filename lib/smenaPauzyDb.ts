// Běžící směna s pauzami z databáze — pro GET a POST /api/attendance a frontu tabletu (/api/attendance/sync).
//
// Pauza je mezera mezi dvěma záznamy (záznam po pauze: source 'break', break_after = záznam před ní). Po „Konec
// pauzy" běží záznam, jehož příchod je konec pauzy — kdo bral jeho příchod jako začátek směny, ukázal po pauze
// novou směnu („Příchod 12:30" a stopky od nuly). Řetěz pauz skládá čistá funkce lib/dochazkaPrehled.smenaClena;
// tady se jen načtou záznamy lidí za poslední den a půl (směna nad 20 h se stejně zavírá jako zapomenutá).

import { neon } from '@neondatabase/serverless';
import { smenaClena, type SmenaClena, type ZaznamDochazky } from './dochazkaPrehled';

const sql = neon(process.env.DATABASE_URL!);

/** Záznamy lidí v podniku za posledních 40 h (NULL team_id = řádky z doby před sloupcem). Před migrací bez break_after. */
async function zaznamyKolemSmeny(teamId: number, ids: readonly number[]): Promise<ZaznamDochazky[]> {
  if (!ids.length) return [];
  try {
    return (await sql`
      SELECT id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut", source, break_after AS "breakAfter"
      FROM time_entries
      WHERE employee_id = ANY(${ids as number[]}) AND (team_id = ${teamId} OR team_id IS NULL)
        AND clock_in >= NOW() - INTERVAL '40 hours'
      ORDER BY clock_in ASC`) as ZaznamDochazky[];
  } catch {
    try {
      return (await sql`
        SELECT id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut", source
        FROM time_entries
        WHERE employee_id = ANY(${ids as number[]}) AND (team_id = ${teamId} OR team_id IS NULL)
          AND clock_in >= NOW() - INTERVAL '40 hours'
        ORDER BY clock_in ASC`) as ZaznamDochazky[];
    } catch { return []; }
  }
}

/** Běžící směny (i na pauze) lidí podle id; kdo není na směně, v mapě není. Výpadek databáze = prázdná mapa. */
export async function smenyClenu(teamId: number, ids: readonly number[], ted: number = Date.now()): Promise<Map<number, SmenaClena>> {
  const out = new Map<number, SmenaClena>();
  const zaznamy = await zaznamyKolemSmeny(teamId, ids);
  for (const id of ids) {
    const s = smenaClena(zaznamy, id, ted);
    if (s) out.set(id, s);
  }
  return out;
}

/** Řádek rosteru: začátek směny (ISO), skončené pauzy (ms) a běžící pauza. Bez směny nuly. */
export function poleRosteru(s: SmenaClena | undefined): { shiftSince: string | null; breakMs: number } {
  return s ? { shiftSince: s.zacatek.toISOString(), breakMs: s.pauzyMs } : { shiftSince: null, breakMs: 0 };
}
