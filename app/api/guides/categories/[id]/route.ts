import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { tymyCiselniku } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Kategorie s tímhle id není moje. Když ji ale vidím ze zdrojového podniku
 * organizace (kolo 60), člověk má dostat jinou odpověď než „nenalezena":
 * existuje, jen ji spravuje jiné vedení. Zápis dál míří jen na vlastní řádky.
 */
async function odpovedCiziKategorie(teamId: number, id: number) {
  const tymy = await tymyCiselniku(teamId, 'kategorieNavodu');
  if (tymy.length > 1) {
    const [cizi] = await sql`
      SELECT t.name FROM guide_categories g JOIN teams t ON t.id = g.team_id
      WHERE g.id = ${id} AND g.team_id = ANY(${tymy}) AND g.team_id <> ${teamId}`;
    if (cizi) {
      return NextResponse.json(
        { error: `Tohle spravuje podnik ${String(cizi.name ?? '')} — upraví to jeho vedení.` },
        { status: 403 },
      );
    }
  }
  return NextResponse.json({ error: 'Kategorie nenalezena' }, { status: 404 });
}

// PATCH (navody.kategorie) — rename / reorder
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const c = await pozaduj('navody.kategorie');
  if (jeOdpoved(c)) return c;

  const id = parseInt(params.id);
  const body = await request.json();
  const { name, icon, position } = body;

  const [existing] = await sql`SELECT id FROM guide_categories WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!existing) return odpovedCiziKategorie(c.teamId, id);

  const nextName = name !== undefined && String(name).trim() ? String(name).trim() : null;
  const nextIcon = icon !== undefined ? icon : null;
  const nextPos = position !== undefined ? position : null;

  const [category] = await sql`
    UPDATE guide_categories SET
      name = COALESCE(${nextName}, name),
      icon = COALESCE(${nextIcon}, icon),
      position = COALESCE(${nextPos}, position)
    WHERE id = ${id} AND team_id = ${c.teamId}
    RETURNING id, name, icon, position`;

  return NextResponse.json({ category });
}

// DELETE (navody.kategorie) — remove category, keep guides (null out category_id)
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const c = await pozaduj('navody.kategorie');
  if (jeOdpoved(c)) return c;

  const id = parseInt(params.id);
  const [existing] = await sql`SELECT id FROM guide_categories WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!existing) return odpovedCiziKategorie(c.teamId, id);

  // Záměrně BEZ filtru team_id (kolo 60, jedna ze tří dokumentovaných výjimek):
  // řádek kategorie je o řádek výš ověřený jako můj a id je globální SERIAL,
  // takže `category_id = id` jsou přesně návody, které na ni ukazují — i
  // v ostatních podnicích organizace, které kategorii měly sdílenou. Bez toho
  // by jim zůstal ukazatel do prázdna.
  await sql`UPDATE guides SET category_id = NULL WHERE category_id = ${id}`;
  await sql`DELETE FROM guide_categories WHERE id = ${id} AND team_id = ${c.teamId}`;

  return NextResponse.json({ ok: true });
}
