import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

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

// GET: list the team's custom categories ordered by position.
export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  // Newest column set first, then progressively older ones, so a database that
  // has not run the latest /api/init still lists categories instead of 500ing.
  // Columns the query didn't select simply come back undefined below.
  const attempts = [
    () => sql`
      SELECT id, name, position, parent_id, tracks_open, content_unit, default_package_size, threshold_unit, scale
      FROM inventory_categories WHERE team_id = ${me.teamId} ORDER BY position ASC, name ASC`,
    () => sql`
      SELECT id, name, position, parent_id, tracks_open, content_unit, default_package_size, scale
      FROM inventory_categories WHERE team_id = ${me.teamId} ORDER BY position ASC, name ASC`,
    () => sql`
      SELECT id, name, position, tracks_open, content_unit, default_package_size, scale
      FROM inventory_categories WHERE team_id = ${me.teamId} ORDER BY position ASC, name ASC`,
    () => sql`
      SELECT id, name, position
      FROM inventory_categories WHERE team_id = ${me.teamId} ORDER BY position ASC, name ASC`,
  ];

  let rows: any[] = [];
  for (const attempt of attempts) {
    try { rows = await attempt(); break; } catch { /* try the next-oldest shape */ }
  }

  return NextResponse.json(rows.map((r: any) => ({
    id: r.id, name: r.name, position: r.position,
    parentId: r.parent_id != null ? Number(r.parent_id) : null,
    tracksOpen: r.tracks_open === true,
    contentUnit: r.content_unit ?? null,
    defaultPackageSize: r.default_package_size != null ? Number(r.default_package_size) : null,
    thresholdUnit: r.threshold_unit === 'content' ? 'content' : 'package',
    scale: r.scale ?? null,
  })));
}

// POST (employer): create a new custom category.
export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const body = await request.json();
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Název kategorie je povinný' }, { status: 400 });

  const [existing] = await sql`
    SELECT id FROM inventory_categories
    WHERE team_id = ${me.teamId} AND lower(name) = lower(${name})`;
  if (existing) return NextResponse.json({ ok: true, id: existing.id });

  // A subcategory may only hang off a root category of the same team, which is
  // what keeps the tree exactly one level deep.
  let parentId: number | null = null;
  if (body.parentId != null && body.parentId !== '') {
    const candidate = Number(body.parentId);
    if (Number.isFinite(candidate)) {
      try {
        const [p] = await sql`
          SELECT id FROM inventory_categories
          WHERE id = ${candidate} AND team_id = ${me.teamId} AND parent_id IS NULL`;
        if (!p) return NextResponse.json({ error: 'Nadřazená kategorie neexistuje' }, { status: 400 });
        parentId = candidate;
      } catch {
        return NextResponse.json({ error: 'Podkategorie nejsou dostupné — spusť /api/init.' }, { status: 400 });
      }
    }
  }

  // Position is counted within the parent so each level orders independently.
  if (parentId == null) {
    let next = 0;
    try {
      const [r] = await sql`
        SELECT COALESCE(MAX(position), -1) + 1 AS next
        FROM inventory_categories WHERE team_id = ${me.teamId} AND parent_id IS NULL`;
      next = r.next;
    } catch {
      const [r] = await sql`
        SELECT COALESCE(MAX(position), -1) + 1 AS next
        FROM inventory_categories WHERE team_id = ${me.teamId}`;
      next = r.next;
    }
    const [row] = await sql`
      INSERT INTO inventory_categories (team_id, name, position)
      VALUES (${me.teamId}, ${name}, ${next})
      RETURNING id`;
    return NextResponse.json({ ok: true, id: row.id });
  }

  const [{ next }] = await sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next
    FROM inventory_categories WHERE team_id = ${me.teamId} AND parent_id = ${parentId}`;
  const [row] = await sql`
    INSERT INTO inventory_categories (team_id, name, position, parent_id)
    VALUES (${me.teamId}, ${name}, ${next}, ${parentId})
    RETURNING id`;

  return NextResponse.json({ ok: true, id: row.id, parentId });
}
