// One-line audit trail for the writes an employer might later ask about.
// Best-effort by design: an audit failure must never fail the action itself.

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function audit(
  teamId: number | null | undefined,
  userId: number | null | undefined,
  action: string,
  entity?: string,
  entityId?: number | null,
  detail?: string,
) {
  try {
    await sql`
      INSERT INTO audit_log (team_id, user_id, action, entity, entity_id, detail)
      VALUES (${teamId ?? null}, ${userId ?? null}, ${action.slice(0, 60)},
              ${entity ?? null}, ${entityId ?? null}, ${detail ? detail.slice(0, 300) : null})`;
  } catch { /* table missing or db hiccup — the action still happened */ }
}
