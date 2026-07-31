import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { normalizeScale } from '@/lib/packaging';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const teamId = u?.team_id ?? null;
  return { meId, role, teamId };
}

// PATCH (employer): rename and/or reorder a category.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  const [cat] = await sql`
    SELECT * FROM inventory_categories WHERE id = ${id} AND team_id = ${me.teamId}`;
  if (!cat) return NextResponse.json({ error: 'Kategorie nenalezena' }, { status: 404 });

  const body = await request.json();
  const name = body.name !== undefined ? String(body.name).trim() : cat.name;
  if (!name) return NextResponse.json({ error: 'Název kategorie je povinný' }, { status: 400 });
  const position = body.position !== undefined ? Number(body.position) : cat.position;

  const oldName = cat.name as string;
  await sql`
    UPDATE inventory_categories
    SET name = ${name}, position = ${position}
    WHERE id = ${id} AND team_id = ${me.teamId}`;

  // Items reference the category by name, so a rename has to follow through or
  // they would be orphaned into a category that no longer exists.
  if (name !== oldName) {
    try {
      await sql`UPDATE inventory_items SET category = ${name} WHERE team_id = ${me.teamId} AND category = ${oldName}`;
    } catch { /* best-effort */ }
  }

  // Packaging settings — each guarded so a pending migration degrades quietly.
  if (body.tracksOpen !== undefined || body.contentUnit !== undefined
      || body.defaultPackageSize !== undefined || body.scale !== undefined) {
    const tracksOpen = body.tracksOpen !== undefined ? body.tracksOpen === true : cat.tracks_open === true;
    const contentUnit = body.contentUnit !== undefined
      ? (body.contentUnit ? String(body.contentUnit).slice(0, 12) : null)
      : (cat.content_unit ?? null);
    const rawSize = body.defaultPackageSize !== undefined ? Number(body.defaultPackageSize) : Number(cat.default_package_size);
    const defaultSize = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : null;
    const scale = body.scale !== undefined ? normalizeScale(body.scale) : normalizeScale(cat.scale);
    try {
      await sql`
        UPDATE inventory_categories
        SET tracks_open = ${tracksOpen}, content_unit = ${contentUnit},
            default_package_size = ${defaultSize}, scale = ${JSON.stringify(scale)}::jsonb
        WHERE id = ${id} AND team_id = ${me.teamId}`;
    } catch {
      return NextResponse.json({ error: 'Nastavení balení není dostupné — spusť /api/init.' }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE (employer): remove the category option. Items keep their category string.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  await sql`DELETE FROM inventory_categories WHERE id = ${id} AND team_id = ${me.teamId}`;

  return NextResponse.json({ ok: true });
}
