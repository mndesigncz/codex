// Shared-tablet attribution: the kiosk session may act on behalf of the
// person currently using the tablet, so completed tasks, procedure runs or
// messages land on their account instead of the anonymous tablet user.
//
// SECURITY: the impersonation is honoured ONLY when
//   1. the session role is 'kiosk',
//   2. the target user belongs to the same team,
//   3. the target is currently clocked in (open time entry).
// Anything else silently falls back to the session user.

import { neon } from '@neondatabase/serverless';
import { jeClenem } from './tenant';

const sql = neon(process.env.DATABASE_URL!);

const ACTING_COOKIE = 'managero-kiosk-acting';
const ACTING_COOKIE_OLD = 'pangea-kiosk-acting';

// The client mirrors the active person into a cookie so even shared components
// that build their own request bodies attribute correctly.
export function actingIdFromCookie(req: Request): number | null {
  const header = req.headers.get('cookie') ?? '';
  const m = header.match(new RegExp(`(?:^|;\\s*)${ACTING_COOKIE}=(\\d+)`))
    ?? header.match(new RegExp(`(?:^|;\\s*)${ACTING_COOKIE_OLD}=(\\d+)`));
  if (!m) return null;
  const id = parseInt(m[1], 10);
  return Number.isFinite(id) ? id : null;
}

export async function resolveActingUser(
  meId: number,
  role: string,
  teamId: number | null,
  explicit: unknown,
  req?: Request,
): Promise<number> {
  if (role !== 'kiosk' || !teamId) return meId;

  let candidate: number | null = null;
  const parsed = parseInt(String(explicit ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) candidate = parsed;
  if (candidate == null && req) candidate = actingIdFromCookie(req);
  if (candidate == null) return meId;

  try {
    // Kolo 62: příslušnost podle členství nebo zrcadla (tablet helper
    // vyloučí sám). Otevřený příchod musí být z TOHOHLE podniku — kdo je
    // odpíchnutý v podniku B, nesmí přes tablet v A jednat za sebe; NULL jsou
    // řádky z doby před sloupcem team_id.
    if (!(await jeClenem(candidate, teamId))) return meId;
    const [row] = await sql`
      SELECT 1 AS ok FROM time_entries te
      WHERE te.employee_id = ${candidate} AND te.clock_out IS NULL
        AND (te.team_id = ${teamId} OR te.team_id IS NULL)
      LIMIT 1`;
    return row ? candidate : meId;
  } catch {
    return meId;
  }
}
