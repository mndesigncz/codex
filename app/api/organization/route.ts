// Nastavení organizace — čte každý člen, mění jen její vlastník.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { organizaceTymu } from '@/lib/tenant';
import { normalizujNastaveni } from '@/lib/organizace';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role: String((s.user as any).role ?? ''), teamId: u?.team_id != null ? Number(u.team_id) : null };
}

export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ organization: null });
  const org = await organizaceTymu(c.teamId);
  if (!org) return NextResponse.json({ organization: null });
  let teams: any[] = [];
  try {
    teams = await sql`SELECT id, name FROM teams WHERE organization_id = ${org.id} ORDER BY name`;
  } catch { /* před migrací */ }
  return NextResponse.json({
    organization: { id: org.id, name: org.name, isOwner: org.ownerId === c.meId, settings: org.nastaveni, teams },
  });
}

export async function PATCH(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejsi v žádném podniku.' }, { status: 400 });
  const org = await organizaceTymu(c.teamId);
  if (!org) return NextResponse.json({ error: 'Podnik není v organizaci.' }, { status: 404 });
  if (org.ownerId !== c.meId) return NextResponse.json({ error: 'Nastavení organizace mění jen její vlastník.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const nastaveni = normalizujNastaveni({ ...org.nastaveni, ...(b.settings ?? {}) });
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 80) : org.name;
  await sql`UPDATE organizations SET name = ${name}, settings = ${JSON.stringify(nastaveni)}::jsonb WHERE id = ${org.id}`;
  audit(c.teamId, c.meId, 'organization.settings', 'organization', org.id, JSON.stringify(nastaveni));
  return NextResponse.json({ ok: true, organization: { id: org.id, name, settings: nastaveni } });
}
