import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { createNoisiumProject } from '@/lib/noisium';

export const dynamic = 'force-dynamic';

async function ctx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const sql = neon(process.env.DATABASE_URL!);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { sql, meId, role, teamId: u?.team_id as number | undefined };
}

// GET — connection status (never returns the token)
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ connected: false });
  const [t] = await c.sql`SELECT name, noisium_project_id, noisium_token FROM teams WHERE id = ${c.teamId}`;
  return NextResponse.json({
    connected: !!t?.noisium_token,
    projectId: t?.noisium_project_id ?? null,
    teamName: t?.name ?? null,
  });
}

// POST — connect: validate token by creating a project named after the team
export async function POST(request: Request) {
  const c = await ctx();
  if (!c || c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!c.teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });
  const { token, baseUrl } = await request.json();
  if (!token || typeof token !== 'string') return NextResponse.json({ error: 'Chybí API token' }, { status: 400 });

  const [team] = await c.sql`SELECT name, noisium_project_id FROM teams WHERE id = ${c.teamId}`;
  try {
    // Reuse existing project if already created, else create a new one named after the team
    let projectId = team?.noisium_project_id as string | null;
    if (!projectId) {
      const project = await createNoisiumProject(baseUrl ?? null, token, team.name, `Úkoly z Pangea — ${team.name}`);
      projectId = String(project?.id ?? project?.projectId ?? '');
      if (!projectId) throw new Error('Noisium nevrátilo ID projektu.');
    }
    await c.sql`UPDATE teams SET noisium_token = ${token}, noisium_project_id = ${projectId}, noisium_base_url = ${baseUrl ?? null} WHERE id = ${c.teamId}`;
    return NextResponse.json({ ok: true, connected: true, projectId, projectName: team.name });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Připojení k Noisium selhalo. Zkontroluj token.' }, { status: 400 });
  }
}

// DELETE — disconnect (clears the stored token)
export async function DELETE() {
  const c = await ctx();
  if (!c || c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (c.teamId) {
    await c.sql`UPDATE teams SET noisium_token = NULL, noisium_project_id = NULL, noisium_base_url = NULL WHERE id = ${c.teamId}`;
  }
  return NextResponse.json({ ok: true, connected: false });
}
