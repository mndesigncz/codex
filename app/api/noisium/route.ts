import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { createNoisiumProject, bezpecnaZakladna } from '@/lib/noisium';

export const dynamic = 'force-dynamic';

// Token integrace je citlivý — připojit a odpojit smí jen integrace.spravovat.
// Stav připojení (bez tokenu) potřebuje i plánovací tabule, proto ho vidí
// i ten, kdo vidí plánování.
async function ctx(klic: string | string[]) {
  const c = await pozaduj(klic);
  if (jeOdpoved(c)) return c;
  const sql = neon(process.env.DATABASE_URL!);
  return { sql, meId: c.meId, teamId: c.teamId };
}

// GET — connection status (never returns the token)
export async function GET() {
  const c = await ctx(['integrace.spravovat', 'planovani.zobrazit']);
  if (jeOdpoved(c)) return c;
  const [t] = await c.sql`SELECT name, noisium_project_id, noisium_token FROM teams WHERE id = ${c.teamId}`;
  return NextResponse.json({
    connected: !!t?.noisium_token,
    projectId: t?.noisium_project_id ?? null,
    teamName: t?.name ?? null,
  });
}

// POST — connect: validate token by creating a project named after the team
export async function POST(request: Request) {
  const c = await ctx('integrace.spravovat');
  if (jeOdpoved(c)) return c;
  const { token, baseUrl } = await request.json();
  if (!token || typeof token !== 'string') return NextResponse.json({ error: 'Chybí API token' }, { status: 400 });

  const [team] = await c.sql`SELECT name, noisium_project_id FROM teams WHERE id = ${c.teamId}`;
  try {
    if (baseUrl) bezpecnaZakladna(String(baseUrl));
    // Reuse existing project if already created, else create a new one named after the team
    let projectId = team?.noisium_project_id as string | null;
    if (!projectId) {
      const project = await createNoisiumProject(baseUrl ?? null, token, team.name, `Úkoly z Managero — ${team.name}`);
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
  const c = await ctx('integrace.spravovat');
  if (jeOdpoved(c)) return c;
  {
    await c.sql`UPDATE teams SET noisium_token = NULL, noisium_project_id = NULL, noisium_base_url = NULL WHERE id = ${c.teamId}`;
  }
  return NextResponse.json({ ok: true, connected: false });
}
