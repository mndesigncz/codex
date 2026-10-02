// Výběr člena pro dárkový poukaz (majitel poukazu v aplikaci, kupující s body): hledání mezi členy podniku podle jména.
// Oprávnění poukazy.spravovat (kdo poukazy zakládá, nemusí smět do seznamu členů). E-mail se ukáže a hledá jen tomu,
// kdo smí hostům psát (zakaznici.kontakty), ať se z poukazů nedá vytěžit kontakt na hosty.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('poukazy.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const q = String(req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60);
  // Příliš krátký dotaz by vrátil půlku členů; bez dotazu se nevrací nic.
  if (q.length < 2) return NextResponse.json({ clenove: [] });
  const kontakty = ctx.role.opravneni.has('zakaznici.kontakty');
  const vzor = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
  try {
    const rows = await sql`
      SELECT u.id, u.name, u.email FROM client_memberships m JOIN users u ON u.id = m.customer_id
      WHERE m.team_id = ${ctx.teamId} AND u.deleted_at IS NULL AND (u.name ILIKE ${vzor} OR (${kontakty}::boolean AND u.email ILIKE ${vzor}))
      ORDER BY u.name LIMIT 8` as any[];
    return NextResponse.json({ clenove: rows.map(r => ({ id: Number(r.id), name: String(r.name ?? ''), ...(kontakty ? { email: String(r.email ?? '') } : {}) })) });
  } catch (e) {
    console.error('[poukazy] hledání členů', e);
    return NextResponse.json({ error: 'Členy se nepodařilo vyhledat. Zkus to za chvíli.' }, { status: 500 });
  }
}
