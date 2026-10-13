// Denní připsání automatických bodů (kolo 8, R8-3) — volá cron /api/init.
// Rozhodnutí jsou v lib/automatickeBody.ts (testy k84-tym), tady jen čtení a zápis.
//
// Idempotentní: každé připsání nese auto_key (narozeniny:2026, vyroci:2026,
// dochvilnost:<pondělí týdne>) a unikátní index point_awards_auto_key zaručí,
// že opakovaný běh téhož dne nic nerozdá dvakrát (ON CONFLICT DO NOTHING).

import { sql } from './client';
import { notifyUser } from './push';
import { pragueToday, pragueDayOf, pragueHM, parseDbTime } from './pragueTime';
import {
  dochvilniZaTyden, duvodAuto, klicAuto, minulyTyden, nastaveniAuto, oslavy, zpozdeniMin, type ClenOslavy, type DruhAuto,
} from './automatickeBody';

/** Členové podniku (lidé, ne tablet) s narozeninami a dnem nástupu. */
export async function clenoveProOslavy(teamId: number): Promise<ClenOslavy[]> {
  try {
    const rows = await sql`
      SELECT u.id, u.name, u.avatar, u.birthday, m.created_at AS nastup
      FROM team_members m JOIN users u ON u.id = m.user_id
      WHERE m.team_id = ${teamId} AND m.role IN ('employee', 'employer')`;
    return (rows as any[]).map(r => ({
      id: Number(r.id), name: String(r.name ?? ''), avatar: r.avatar ?? null,
      birthday: r.birthday ?? null,
      nastup: r.nastup ? (parseDbTime(r.nastup) ? pragueDayOf(parseDbTime(r.nastup)!) : String(r.nastup).slice(0, 10)) : null,
    }));
  } catch { return []; }
}

async function pripis(teamId: number, userId: number, body: number, duvod: string, klic: string): Promise<boolean> {
  if (body <= 0) return false;
  const rows = await sql`
    INSERT INTO point_awards (team_id, user_id, points, reason, given_by, kind, auto_key)
    VALUES (${teamId}, ${userId}, ${body}, ${duvod}, NULL, 'auto', ${klic})
    ON CONFLICT (team_id, user_id, auto_key) WHERE auto_key IS NOT NULL DO NOTHING
    RETURNING id`;
  return rows.length > 0;
}

/** Příchody minulého týdne k plánované směně téhož dne (pražský den příchodu), po lidech. */
async function prichodyTydne(teamId: number, od: string, doDne: string) {
  const rows = await sql`
    SELECT te.employee_id, te.clock_in, s.start_time
    FROM time_entries te
    JOIN LATERAL (
      SELECT start_time FROM shifts s
      WHERE s.employee_id = te.employee_id AND s.team_id = ${teamId}
        AND s.auto_created IS NOT TRUE AND s.type <> 'auto'
        AND s.date = to_char(te.clock_in AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD')
      ORDER BY s.start_time ASC LIMIT 1
    ) s ON TRUE
    WHERE te.team_id = ${teamId}
      AND te.clock_in >= ${`${od}T00:00:00`}::timestamp - INTERVAL '3 hours'
      AND te.clock_in < ${`${doDne}T23:59:59`}::timestamp + INTERVAL '3 hours'`;
  return (rows as any[]).map(r => {
    const d = parseDbTime(r.clock_in);
    const den = d ? pragueDayOf(d) : null;
    if (!d || !den || den < od || den > doDne) return { employeeId: Number(r.employee_id), pozdeMin: null };
    return { employeeId: Number(r.employee_id), pozdeMin: zpozdeniMin(pragueHM(d), String(r.start_time ?? '')) };
  });
}

/** Jeden denní průchod přes všechny podniky. Vrací počty připsání po druzích. */
export async function pripisAutomatickeBody(dnes = pragueToday()): Promise<Record<DruhAuto, number>> {
  const n: Record<DruhAuto, number> = { dochvilnost: 0, vyroci: 0, narozeniny: 0 };
  let tymy: any[] = [];
  try { tymy = await sql`SELECT id, points_config FROM teams`; } catch { return n; }
  const tyden = minulyTyden(dnes);
  for (const t of tymy) {
    const teamId = Number(t.id);
    const a = nastaveniAuto(t.points_config);
    if (!a.dochvilnost.zap && !a.vyroci.zap && !a.narozeniny.zap) continue;
    try {
      if (a.vyroci.zap || a.narozeniny.zap) {
        for (const o of oslavy(await clenoveProOslavy(teamId), dnes, 0)) {
          const p = a[o.druh];
          if (!p.zap || p.body <= 0) continue;
          const duvod = duvodAuto(o.druh, o.roky);
          if (!(await pripis(teamId, o.id, p.body, duvod, klicAuto(o.druh, dnes.slice(0, 4))))) continue;
          n[o.druh]++;
          notifyUser(o.id, { title: duvod, body: `+${p.body} bodů od podniku. Díky, že jsi s námi.`, type: 'success', link: '/employee/shifts?view=rewards' }).catch(() => {});
        }
      }
      if (a.dochvilnost.zap && a.dochvilnost.body > 0) {
        for (const id of dochvilniZaTyden(await prichodyTydne(teamId, tyden.od, tyden.do))) {
          if (!(await pripis(teamId, id, a.dochvilnost.body, duvodAuto('dochvilnost'), klicAuto('dochvilnost', tyden.klic)))) continue;
          n.dochvilnost++;
          notifyUser(id, { title: 'Týden bez pozdního příchodu', body: `+${a.dochvilnost.body} bodů za dochvilnost minulý týden.`, type: 'success', link: '/employee/shifts?view=rewards' }).catch(() => {});
        }
      }
    } catch { /* další podnik; chyba v jednom nesmí zastavit ostatní */ }
  }
  return n;
}
