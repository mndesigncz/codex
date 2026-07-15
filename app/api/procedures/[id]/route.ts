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

// PATCH (employer): update a procedure
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  const [existing] = await sql`SELECT id, team_id FROM procedures WHERE id = ${id}`;
  if (!existing || existing.team_id !== me.teamId) {
    return NextResponse.json({ error: 'Postup nenalezen' }, { status: 404 });
  }

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

  const [updated] = await sql`
    UPDATE procedures
    SET name = ${name}, description = ${description}, icon = ${icon}, color = ${color}, items = ${JSON.stringify(items)}
    WHERE id = ${id}
    RETURNING id, name, description, icon, color, items`;

  return NextResponse.json({ procedure: updated });
}

// DELETE (employer): delete a procedure
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  const [existing] = await sql`SELECT id, team_id FROM procedures WHERE id = ${id}`;
  if (!existing || existing.team_id !== me.teamId) {
    return NextResponse.json({ error: 'Postup nenalezen' }, { status: 404 });
  }

  await sql`DELETE FROM procedures WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
