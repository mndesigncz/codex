import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { produceBatch } from '@/lib/production';
import { resolveActingUser } from '@/lib/kioskActing';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// POST { batches } — „vyrobeno": naskladní dávky a odepíše suroviny.
// Smí každý na směně; na sdíleném tabletu se připíše tomu, kdo ho zrovna používá.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getServerSession(authOptions);
  if (!s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const teamId = u?.team_id as number | null;
  if (!teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 403 });
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const actor = role === 'employer' ? meId : await resolveActingUser(meId, role, teamId, b.actingAs, req);
  try {
    const r = await produceBatch(teamId, id, Number(b.batches) || 1, actor, { taskId: b.taskId ? Number(b.taskId) : null });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    const msg = String(e?.message ?? 'Výroba se nepodařila.');
    return NextResponse.json({ error: msg }, { status: msg.includes('nenalezena') ? 404 : 400 });
  }
}
