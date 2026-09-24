// Host ruší svou rezervaci. Jen dokud nezačala a dokud nebyla usazena.
import { NextResponse } from 'next/server';
import { sql, customer } from '@/lib/client';
import { clenoveSOpravnenim } from '@/lib/opravneniDb';
import { notifyUsers } from '@/lib/push';

import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Zrušení uvolní místo — týká se toho, kdo o kapacitě rozhoduje
 * (rezervace.schvalovat), stejně jako upozornění na novou rezervaci.
 * Upozornění je best-effort: host svou akci provedl, i když push neodejde.
 */
async function upozorni(teamId: number, payload: { title: string; body?: string; link?: string; type?: string }) {
  try {
    const ids = await clenoveSOpravnenim(teamId, 'rezervace.schvalovat');
    if (ids.length) await notifyUsers(ids, { ...payload, category: 'general' });
  } catch { /* bez upozornění */ }
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const id = parseInt(params.id, 10);
  const b = await req.json().catch(() => ({}));
  if (b.status !== 'cancelled') return NextResponse.json({ error: 'Host může rezervaci jen zrušit.' }, { status: 400 });
  const [r] = await sql`SELECT * FROM client_reservations WHERE id = ${id} AND customer_id = ${me.id}`;
  if (!r) return NextResponse.json({ error: 'Rezervace nenalezena' }, { status: 404 });
  if (!['requested', 'confirmed'].includes(String(r.status)) || String(r.date) < pragueToday()) {
    return NextResponse.json({ error: 'Tuhle rezervaci už zrušit nejde.' }, { status: 400 });
  }
  await sql`UPDATE client_reservations SET status = 'cancelled', updated_at = NOW() WHERE id = ${id}`;
  await upozorni(Number(r.team_id), { title: 'Rezervace zrušena', body: `${me.name} · ${String(r.date).split('-').reverse().join('. ')} ${r.time}`, link: '/employer/overview?mode=client&tab=reservations', type: 'info' });
  return NextResponse.json({ ok: true });
}
