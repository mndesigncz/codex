// Editing a single planning card.
//
// SECURITY: planning_cards has no team column, so ownership is established
// through the creator's team — the same way the list endpoint scopes it.
// Checking only the role would let an employer of one business edit or delete
// another business's card by guessing an id.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function employerTeam() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { status: 401 as const, teamId: null };
  if ((session.user as any).role !== 'employer') return { status: 403 as const, teamId: null };
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { status: 200 as const, teamId: (u?.team_id ?? null) as number | null };
}

/** True when the card was created by a member of this team. */
async function ownedByTeam(id: number, teamId: number) {
  const [row] = await sql`
    SELECT p.id FROM planning_cards p
    JOIN users u ON u.id = p.created_by
    WHERE p.id = ${id} AND u.team_id = ${teamId}`;
  return !!row;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await employerTeam();
  if (me.status === 401) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.status === 403 || !me.teamId) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  try {
    const id = parseInt(params.id);
    if (!(await ownedByTeam(id, me.teamId))) {
      return NextResponse.json({ error: 'Karta nenalezena' }, { status: 404 });
    }

    const body = await req.json();
    // One statement per field — no dynamic SQL assembly.
    if (body.title !== undefined) {
      await sql`UPDATE planning_cards SET title = ${String(body.title).slice(0, 200)} WHERE id = ${id}`;
    }
    if (body.description !== undefined) {
      const d = body.description ? String(body.description).slice(0, 2000) : null;
      await sql`UPDATE planning_cards SET description = ${d} WHERE id = ${id}`;
    }
    if (body.column !== undefined) {
      await sql`UPDATE planning_cards SET "column" = ${String(body.column).slice(0, 40)} WHERE id = ${id}`;
    }
    if (body.position !== undefined) {
      await sql`UPDATE planning_cards SET position = ${Number(body.position) || 0} WHERE id = ${id}`;
    }

    const [card] = await sql`SELECT * FROM planning_cards WHERE id = ${id}`;
    return NextResponse.json(card);
  } catch {
    return NextResponse.json({ error: 'Nepodařilo se upravit kartu' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await employerTeam();
  if (me.status === 401) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.status === 403 || !me.teamId) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  try {
    const id = parseInt(params.id);
    if (!(await ownedByTeam(id, me.teamId))) {
      return NextResponse.json({ error: 'Karta nenalezena' }, { status: 404 });
    }
    await sql`DELETE FROM planning_cards WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Nepodařilo se smazat kartu' }, { status: 500 });
  }
}
