import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function currentUser() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const id = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${id}`;
  return { id, role, teamId: u?.team_id as number | null };
}

// GET: list the team's procedures
export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!me.teamId) return NextResponse.json({ procedures: [] });

  const procedures = await sql`
    SELECT id, name, description, icon, color, items
    FROM procedures
    WHERE team_id = ${me.teamId}
    ORDER BY created_at ASC`;

  return NextResponse.json({ procedures });
}

// POST (employer): create a procedure
export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!me.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const description = body.description ? String(body.description).trim() : null;
  const icon = body.icon ? String(body.icon) : 'check';
  const color = body.color ? String(body.color) : 'lime';
  const items: string[] = Array.isArray(body.items)
    ? body.items.map((s: any) => String(s).trim()).filter((s: string) => s.length > 0)
    : [];

  if (!name) return NextResponse.json({ error: 'Zadejte název postupu' }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: 'Přidejte alespoň jeden krok' }, { status: 400 });

  const [created] = await sql`
    INSERT INTO procedures (team_id, name, description, icon, color, items, created_by)
    VALUES (${me.teamId}, ${name}, ${description}, ${icon}, ${color}, ${JSON.stringify(items)}, ${me.id})
    RETURNING id, name, description, icon, color, items`;

  return NextResponse.json({ procedure: created });
}
