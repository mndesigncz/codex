import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { normalizeExcluded } from '@/lib/share';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Veřejné sdílené odkazy spravuje ten, kdo má sdileni.spravovat.
async function spravce() {
  const c = await pozaduj('sdileni.spravovat');
  if (jeOdpoved(c)) return c;
  return { meId: c.meId, teamId: c.teamId, opr: c.role.opravneni };
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await spravce();
  if (jeOdpoved(me)) return me;

  const id = parseInt(params.id);
  const b = await request.json();

  // Each field on its own so a partial edit doesn't clear the rest.
  if (b.title !== undefined) {
    const title = b.title ? String(b.title).trim().slice(0, 120) || null : null;
    await sql`UPDATE share_links SET title = ${title} WHERE id = ${id} AND team_id = ${me.teamId}`;
  }
  if (b.note !== undefined) {
    const note = b.note ? String(b.note).trim().slice(0, 500) || null : null;
    await sql`UPDATE share_links SET note = ${note} WHERE id = ${id} AND team_id = ${me.teamId}`;
  }
  if (b.excluded !== undefined) {
    await sql`
      UPDATE share_links SET excluded = ${JSON.stringify(normalizeExcluded(b.excluded))}::jsonb
      WHERE id = ${id} AND team_id = ${me.teamId}`;
  }
  if (b.enabled !== undefined) {
    await sql`UPDATE share_links SET enabled = ${b.enabled === true} WHERE id = ${id} AND team_id = ${me.teamId}`;
  }
  if (b.pinned !== undefined) {
    try {
      if (b.pinned === true) {
        // One pinned link per team — pinning a new one unpins the old.
        await sql`UPDATE share_links SET pinned = FALSE WHERE team_id = ${me.teamId}`;
        await sql`UPDATE share_links SET pinned = TRUE, enabled = TRUE WHERE id = ${id} AND team_id = ${me.teamId}`;
      } else {
        await sql`UPDATE share_links SET pinned = FALSE WHERE id = ${id} AND team_id = ${me.teamId}`;
      }
    } catch { /* not migrated yet */ }
  }

  const [row] = await sql`SELECT * FROM share_links WHERE id = ${id} AND team_id = ${me.teamId}`;
  if (!row) return NextResponse.json({ error: 'Odkaz nenalezen' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await spravce();
  if (jeOdpoved(me)) return me;
  const id = parseInt(params.id);
  await sql`DELETE FROM share_links WHERE id = ${id} AND team_id = ${me.teamId}`;
  return NextResponse.json({ ok: true });
}
