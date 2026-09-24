// Editing a single planning card.
//
// SECURITY: planning_cards has no team column, so ownership is established
// through the creator's team — the same way the list endpoint scopes it.
// Checking only the permission would let an employer of one business edit or delete
// another business's card by guessing an id.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/** True when the card was created by a member of this team. */
async function ownedByTeam(id: number, teamId: number) {
  const [row] = await sql`
    SELECT p.id FROM planning_cards p
    WHERE p.id = ${id} AND p.team_id = ${teamId}`;
  return !!row;
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await pozaduj('planovani.upravit');
  if (jeOdpoved(me)) return me;

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

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await pozaduj('planovani.upravit');
  if (jeOdpoved(me)) return me;

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
