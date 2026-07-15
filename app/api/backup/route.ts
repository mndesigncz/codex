import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { sendBackupEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

// Business-data tables only. Never export credential material.
const TABLES = [
  'teams', 'invitations', 'shifts', 'shift_requests', 'availability_requests',
  'inventory_items', 'inventory_categories', 'inventory_log', 'inventory_reports',
  'conversations', 'conversation_members', 'chat_messages',
  'guide_categories', 'guides', 'procedures', 'procedure_runs',
  'tasks', 'planning_cards', 'daily_reports', 'recipes', 'notifications',
];
// users are exported WITHOUT password_hash; push_subscriptions (auth keys) are never exported.
const USERS_QUERY =
  'SELECT id, name, email, role, avatar, phone, job_title, shift_preference, employer_id, team_id, theme, created_at FROM users';

// Daily backup: exports every table to JSON and e-mails it to the employer(s)
// so a copy of the data always lives OUTSIDE the database.
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
    const dump: Record<string, any[]> = {};
    let rowCount = 0;
    // users first, without password hashes
    try {
      const u = await sql(USERS_QUERY);
      dump['users'] = u as any[];
      rowCount += (u as any[]).length;
    } catch { dump['users'] = []; }
    for (const t of TABLES) {
      try {
        const rows = await sql(`SELECT * FROM ${t}`);
        dump[t] = rows as any[];
        rowCount += (rows as any[]).length;
      } catch {
        dump[t] = [];
      }
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `pangea-backup-${stamp}.json`;
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), rowCount, data: dump }, null, 2);

    // Send to every employer (owners of the data)
    const employers = await sql`SELECT DISTINCT email FROM users WHERE role = 'employer'`;
    let sent = 0;
    for (const e of employers) {
      try { await sendBackupEmail(e.email as string, filename, json); sent++; } catch {}
    }

    return NextResponse.json({ ok: true, rowCount, emailedTo: sent });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
