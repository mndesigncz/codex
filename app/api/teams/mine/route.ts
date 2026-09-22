// Moje podniky — pro přepínač v hlavičce.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { clenstviUzivatele, organizaceTymu } from '@/lib/tenant';

export const dynamic = 'force-dynamic';
const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((s.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const activeTeamId = u?.team_id != null ? Number(u.team_id) : null;
  const teams = await clenstviUzivatele(meId);
  const org = activeTeamId ? await organizaceTymu(activeTeamId) : null;
  return NextResponse.json({
    activeTeamId,
    teams,
    organization: org ? { id: org.id, name: org.name, isOwner: org.ownerId === meId, settings: org.nastaveni } : null,
  });
}
