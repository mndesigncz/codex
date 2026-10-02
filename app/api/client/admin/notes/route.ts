// Interní poznámky k hostovi („nesnáší mléko", „vždy sedí u okna", „domluvená oslava"):
// vidí je jen personál s oprávněním zakaznici.poznamky, host nikdy. Zápis i smazání
// jde do protokolu změn; text poznámky se do protokolu nekopíruje (je to osobní údaj).
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { poznamkyHosta, zajistiClenove } from '@/lib/clenoveDb';
import { chybaPoznamky, NOTE_MAX, NOTES_MAX_NA_HOSTA } from '@/lib/poznamkyHosta';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.poznamky');
  if (jeOdpoved(ctx)) return ctx;
  const cid = parseInt(new URL(req.url).searchParams.get('customerId') ?? '', 10);
  if (!Number.isFinite(cid)) return NextResponse.json({ error: 'Chybí host.' }, { status: 400 });
  return NextResponse.json({ notes: await poznamkyHosta(ctx.teamId, cid), max: NOTE_MAX });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.poznamky');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const cid = parseInt(String(b.customerId), 10);
  if (!Number.isFinite(cid)) return NextResponse.json({ error: 'Chybí host.' }, { status: 400 });
  const text = String(b.body ?? '').trim();
  const chyba = chybaPoznamky(text);
  if (chyba) return NextResponse.json({ error: chyba }, { status: 400 });
  await zajistiClenove();
  const [m] = await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${ctx.teamId} AND customer_id = ${cid}`;
  if (!m) return NextResponse.json({ error: 'Tenhle host není členem podniku.' }, { status: 404 });
  // Strop počtu poznámek hlídá samotný zápis (jedním příkazem), ne předchozí čtení.
  const [n] = await sql`
    INSERT INTO client_member_notes (team_id, customer_id, body, created_by)
    SELECT ${ctx.teamId}, ${cid}, ${text}, ${ctx.meId}
    WHERE (SELECT COUNT(*) FROM client_member_notes WHERE team_id = ${ctx.teamId} AND customer_id = ${cid}) < ${NOTES_MAX_NA_HOSTA}
    RETURNING id, body, created_at, created_by`;
  if (!n) return NextResponse.json({ error: `U hosta může být nejvýš ${NOTES_MAX_NA_HOSTA} poznámek. Starou smaž.` }, { status: 409 });
  await audit(ctx.teamId, ctx.meId, 'client.poznamka', 'client', cid, 'poznámka přidána');
  return NextResponse.json({ ok: true, note: { ...n, autor: null } });
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.poznamky');
  if (jeOdpoved(ctx)) return ctx;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '', 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná poznámka.' }, { status: 400 });
  const r = await sql`DELETE FROM client_member_notes WHERE id = ${id} AND team_id = ${ctx.teamId} RETURNING customer_id`;
  if (!r.length) return NextResponse.json({ error: 'Poznámka už neexistuje.' }, { status: 404 });
  await audit(ctx.teamId, ctx.meId, 'client.poznamka', 'client', Number(r[0].customer_id), 'poznámka smazána');
  return NextResponse.json({ ok: true });
}
