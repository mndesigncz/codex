// Denní pojistka: i když aplikaci nikdo neotevře, pokladna se ráno dotáhne.
// Projde všechny připojené týmy, vynutí synchronizaci a odpis skladu.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { checkCron } from '@/lib/cronAuth';
import { runFullSync, syncMenu } from '@/lib/posMirror';
import { getConnection } from '@/lib/storyous';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  const gate = checkCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let teams: any[] = [];
  try { teams = await sql`SELECT team_id FROM pos_connections`; } catch { return NextResponse.json({ ok: true, teams: 0 }); }
  const out: any[] = [];
  for (const t of teams) {
    const teamId = Number(t.team_id);
    try {
      const conn = await getConnection(teamId);
      if (conn) { try { await syncMenu(teamId, conn, true); } catch { /* menu zvlášť */ } }
      const r = await runFullSync(teamId, null, { force: true });
      out.push({ teamId, ...r.bills, writeOff: r.writeOff?.processed ?? null });
    } catch (e) {
      out.push({ teamId, ok: false, error: String((e as any)?.message ?? e).slice(0, 120) });
    }
  }
  return NextResponse.json({ ok: true, teams: teams.length, results: out });
}
