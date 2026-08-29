import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { sendBackupEmail } from '@/lib/email';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';

/**
 * How each table is narrowed to ONE team. A backup e-mail must only ever
 * contain the recipient's own data — the whole point of the per-team split.
 *   team          … WHERE team_id = $team
 *   user:<col>    … WHERE <col> IN (members of $team)
 *   conversation  … WHERE conversation_id IN (conversations of $team)
 *   scopedBy      … vlastní WHERE fragment pro tabulky, které se k týmu
 *                   dostanou přes víc kroků (menu: board → sekce → položky)
 * Tables where the newest scoping column may not exist yet fall back from
 * `team` to `user:<col>`; if nothing works the table is skipped for that team
 * (omitting data is safe, leaking someone else's is not).
 */
const TABLES: { name: string; team?: boolean; user?: string; conversation?: boolean; scopedBy?: string }[] = [
  { name: 'invitations', team: true },
  { name: 'shifts', user: 'employee_id' },
  { name: 'shift_requests', user: 'employee_id' },
  { name: 'availability_requests', team: true, user: 'employee_id' },
  { name: 'time_entries', team: true, user: 'employee_id' },
  { name: 'time_off_requests', team: true, user: 'employee_id' },
  { name: 'shift_offers', team: true },
  { name: 'shift_reviews', team: true, user: 'employee_id' },
  { name: 'cash_closings', team: true, user: 'created_by' },
  { name: 'inventory_items', team: true },
  { name: 'inventory_categories', team: true },
  { name: 'inventory_log', user: 'user_id' },
  { name: 'inventory_reports', user: 'reported_by' },
  { name: 'conversations', team: true },
  { name: 'conversation_members', conversation: true },
  { name: 'chat_messages', conversation: true },
  { name: 'guide_categories', team: true },
  { name: 'guides', team: true },
  { name: 'procedures', team: true, user: 'created_by' },
  { name: 'procedure_runs', team: true, user: 'user_id' },
  { name: 'tasks', user: 'created_by' },
  { name: 'planning_cards', user: 'created_by' },
  { name: 'daily_reports', user: 'created_by' },
  { name: 'recipes', user: 'created_by' },
  { name: 'announcements', team: true, user: 'author_id' },
  { name: 'suggestions', team: true, user: 'author_id' },
  { name: 'share_links', team: true },
  { name: 'menu_boards', team: true },
  { name: 'menu_sections', scopedBy: 'board_id IN (SELECT id FROM menu_boards WHERE team_id = $1)' },
  { name: 'menu_items', scopedBy: 'section_id IN (SELECT id FROM menu_sections WHERE board_id IN (SELECT id FROM menu_boards WHERE team_id = $1))' },
  { name: 'notifications', user: 'user_id' },
];

// users are exported WITHOUT password_hash; push_subscriptions (auth keys) are never exported.
const USERS_QUERY =
  'SELECT id, name, email, role, avatar, phone, job_title, shift_preference, employer_id, team_id, theme, created_at FROM users WHERE team_id = $1';

/** One team's data, table by table. */
async function dumpTeam(sql: any, teamId: number): Promise<{ dump: Record<string, any[]>; rowCount: number }> {
  const dump: Record<string, any[]> = {};
  let rowCount = 0;
  const put = (name: string, rows: any[]) => { dump[name] = rows; rowCount += rows.length; };

  try {
    put('teams', await sql('SELECT * FROM teams WHERE id = $1', [teamId]));
  } catch { dump['teams'] = []; }
  try {
    put('users', await sql(USERS_QUERY, [teamId]));
  } catch { dump['users'] = []; }

  for (const t of TABLES) {
    let rows: any[] | null = null;
    if (t.team) {
      try { rows = await sql(`SELECT * FROM ${t.name} WHERE team_id = $1`, [teamId]); } catch { rows = null; }
    }
    if (rows === null && t.user) {
      try {
        rows = await sql(
          `SELECT * FROM ${t.name} WHERE ${t.user} IN (SELECT id FROM users WHERE team_id = $1)`,
          [teamId],
        );
      } catch { rows = null; }
    }
    if (rows === null && t.scopedBy) {
      try { rows = await sql(`SELECT * FROM ${t.name} WHERE ${t.scopedBy}`, [teamId]); } catch { rows = null; }
    }
    if (rows === null && t.conversation) {
      try {
        rows = await sql(
          `SELECT * FROM ${t.name} WHERE conversation_id IN (SELECT id FROM conversations WHERE team_id = $1)`,
          [teamId],
        );
      } catch { rows = null; }
    }
    put(t.name, rows ?? []);
  }
  return { dump, rowCount };
}

// Daily backup: exports each team's data to JSON and e-mails it to THAT
// team's employer(s) only, so a copy always lives outside the database and
// nobody ever receives another business's rows.
// Protected: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const secret = process.env.CRON_SECRET;
  const authorized = !secret || auth === `Bearer ${secret}` || key === secret;
  if (!authorized) return NextResponse.json({ error: 'Neautorizováno' }, { status: 401 });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const teams = await sql`SELECT id, name FROM teams ORDER BY id`;
    const stamp = pragueToday(); // název souboru podle dne v Praze, ne v UTC

    let sent = 0, totalRows = 0, teamsBackedUp = 0;
    for (const team of teams as any[]) {
      const employers = await sql`
        SELECT DISTINCT email FROM users
        WHERE role = 'employer' AND team_id = ${team.id} AND email IS NOT NULL`;
      if (!employers.length) continue; // nobody to receive it — skip the work

      const { dump, rowCount } = await dumpTeam(sql, Number(team.id));
      totalRows += rowCount;
      teamsBackedUp++;

      const filename = `managero-backup-${stamp}.json`;
      const json = JSON.stringify(
        { exportedAt: new Date().toISOString(), team: team.name, rowCount, data: dump },
        null, 2,
      );
      for (const e of employers) {
        try { await sendBackupEmail(e.email as string, filename, json); sent++; } catch {}
      }
    }

    return NextResponse.json({ ok: true, teams: teamsBackedUp, rowCount: totalRows, emailedTo: sent });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
