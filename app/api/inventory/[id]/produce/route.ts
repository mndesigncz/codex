import { NextResponse } from 'next/server';
import { produceBatch } from '@/lib/production';
import { resolveActingUser } from '@/lib/kioskActing';
import { verejnaHlaska } from '@/lib/verejnaChyba';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { typNaUcet } from '@/lib/opravneni';

export const dynamic = 'force-dynamic';

// POST { batches } — „vyrobeno": naskladní dávky a odepíše suroviny.
// Smí každý s `vyroba.vyrabet` (všechny tři dnešní role); na sdíleném tabletu
// se připíše tomu, kdo ho zrovna používá.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const c = await pozaduj('vyroba.vyrabet');
  if (jeOdpoved(c)) return c;
  const { meId, teamId } = c;
  const role = typNaUcet(c.role.typ);
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  // Za jiného jedná jen tablet; ostatním resolveActingUser vrátí je samé.
  const actor = await resolveActingUser(meId, role, teamId, b.actingAs, req);
  try {
    const r = await produceBatch(teamId, id, Number(b.batches) || 1, actor, { taskId: b.taskId ? Number(b.taskId) : null });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    const msg = verejnaHlaska(e, 'Výroba se nepodařila.', '[produce]');
    return NextResponse.json({ error: msg }, { status: msg.includes('nenalezena') ? 404 : 400 });
  }
}
