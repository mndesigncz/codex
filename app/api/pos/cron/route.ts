// Denní pojistka: i když aplikaci nikdo neotevře, pokladna se ráno dotáhne.
// Projde všechny připojené týmy, vynutí synchronizaci a odpis skladu.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { checkCron } from '@/lib/cronAuth';
import { runFullSync, syncMenu } from '@/lib/posMirror';
import { getConnection } from '@/lib/storyous';
import { poDavkach } from '@/lib/cronDavky';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  const gate = checkCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let teams: any[] = [];
  try { teams = await sql`SELECT team_id FROM pos_connections`; } catch { return NextResponse.json({ ok: true, teams: 0 }); }
  const out: any[] = [];
  // Po dávkách (lib/cronDavky): tři podniky souběžně (Storyous nechceme
  // zahltit), s hlídáním času. Co se nestihne, dotáhne první otevření
  // aplikace (PosTick) nebo zítřejší běh — a odpověď to řekne.
  const davky = await poDavkach(teams, async (t: any) => {
    const teamId = Number(t.team_id);
    try {
      const conn = await getConnection(teamId);
      if (conn) { try { await syncMenu(teamId, conn, true); } catch { /* menu zvlášť */ } }
      const r = await runFullSync(teamId, null, { force: true });
      out.push({ teamId, ...r.bills, writeOff: r.writeOff?.processed ?? null });
    } catch (e) {
      out.push({ teamId, ok: false, error: String((e as any)?.message ?? e).slice(0, 120) });
    }
  }, { soubezne: 3, rozpocetMs: 50_000 });
  if (davky.nestihnuto) console.error('pos/cron: nestihnuto', davky.nestihnuto);
  return NextResponse.json({ ok: true, teams: teams.length, nestihnuto: davky.nestihnuto, results: out });
}
