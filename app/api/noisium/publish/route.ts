import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { createNoisiumTask } from '@/lib/noisium';

export const dynamic = 'force-dynamic';

// POST { cardId } — publish a planning card as a task in the team's Noisium project.
export async function POST(request: Request) {
  const s = await getServerSession(authOptions);
  if (!s?.user || (s.user as any).role !== 'employer') {
    return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  }
  const meId = parseInt((s.user as any).id);
  const sql = neon(process.env.DATABASE_URL!);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const teamId = u?.team_id;
  if (!teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });

  const [team] = await sql`SELECT noisium_token, noisium_project_id, noisium_base_url FROM teams WHERE id = ${teamId}`;
  if (!team?.noisium_token || !team?.noisium_project_id) {
    return NextResponse.json({ error: 'Noisium není připojen. Připoj ho v Nastavení týmu.' }, { status: 400 });
  }

  const { cardId } = await request.json();
  const [card] = await sql`SELECT id, title, description, "column" FROM planning_cards WHERE id = ${cardId}`;
  if (!card) return NextResponse.json({ error: 'Karta nenalezena' }, { status: 404 });

  try {
    const task = await createNoisiumTask(team.noisium_base_url, team.noisium_token, String(team.noisium_project_id), {
      title: card.title,
      description: card.description,
      column: card.column,
    });
    const taskId = String(task?.id ?? task?.taskId ?? '');
    if (taskId) {
      try { await sql`UPDATE planning_cards SET noisium_task_id = ${taskId} WHERE id = ${card.id}`; } catch {}
    }
    return NextResponse.json({ ok: true, taskId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Publikování do Noisium selhalo.' }, { status: 400 });
  }
}
