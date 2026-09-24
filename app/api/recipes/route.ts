// Recipes. The UI moved this content into Návody, so this endpoint is only kept
// for older data — but it still has to behave.
//
// SECURITY: recipes has no team column, so it is scoped through the creator's
// team. Previously GET returned every business's recipes, and POST fell back to
// `createdBy = 1` when there was no session, so an unauthenticated request could
// insert rows attributed to a real user.
//
// Kolo 67: čtení `navody.zobrazit`, zápis `navody.vytvorit` (obsah se
// přesunul do Návodů, tak i klíče). Zápis dřív hlídalo jen přihlášení, takže
// recept založil i tablet nebo host s podnikem; žádné UI ho nevolá, takže
// Barista ani Kiosk o nic nepřijdou.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function caller(klic: string) {
  const c = await pozaduj(klic);
  if (jeOdpoved(c)) return c;
  return { meId: c.meId, teamId: c.teamId };
}

export async function GET() {
  const me = await caller('navody.zobrazit');
  if (jeOdpoved(me)) return me;

  try {
    const rows = await sql`
      SELECT r.* FROM recipes r
      WHERE r.team_id = ${me.teamId}
      ORDER BY r.created_at DESC`;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Recepty se nepodařilo načíst' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await caller('navody.vytvorit');
  if (jeOdpoved(me)) return me;

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
      INSERT INTO recipes (name, description, ingredients, instructions, prep_time, created_by, team_id)
      VALUES (${name}, ${description}, ${ingredients}, ${instructions}, ${prepTime}, ${me.meId}, ${me.teamId})
      RETURNING *`;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Recept se nepodařilo vytvořit' }, { status: 500 });
  }
}
