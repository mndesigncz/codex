// Recipes. The UI moved this content into Návody, so this endpoint is only kept
// for older data — but it still has to behave.
//
// SECURITY: recipes has no team column, so it is scoped through the creator's
// team. Previously GET returned every business's recipes, and POST fell back to
// `createdBy = 1` when there was no session, so an unauthenticated request could
// insert rows attributed to a real user.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function caller() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, teamId: (u?.team_id ?? null) as number | null };
}

export async function GET() {
  const me = await caller();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!me.teamId) return NextResponse.json([]);

  try {
    const rows = await sql`
      SELECT r.* FROM recipes r
      JOIN users u ON u.id = r.created_by
      WHERE u.team_id = ${me.teamId}
      ORDER BY r.created_at DESC`;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Recepty se nepodařilo načíst' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await caller();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  try {
    const body = await req.json();
    const name = String(body.name ?? '').trim().slice(0, 200);
    if (!name) return NextResponse.json({ error: 'Název je povinný' }, { status: 400 });

    const description = body.description ? String(body.description).slice(0, 2000) : null;
    const ingredients = typeof body.ingredients === 'string'
      ? body.ingredients
      : JSON.stringify(body.ingredients ?? []);
    const instructions = String(body.instructions ?? '').slice(0, 5000);
    const prepTime = Number.isFinite(Number(body.prepTime)) ? Math.max(0, Number(body.prepTime)) : 5;

    const [row] = await sql`
      INSERT INTO recipes (name, description, ingredients, instructions, prep_time, created_by)
      VALUES (${name}, ${description}, ${ingredients}, ${instructions}, ${prepTime}, ${me.meId})
      RETURNING *`;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Recept se nepodařilo vytvořit' }, { status: 500 });
  }
}
