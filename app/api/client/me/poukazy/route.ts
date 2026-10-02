// Moje poukazy: host si poukaz odebere ze své aplikace (zůstane platný, jen přestane být „jeho“).
// Přidání poukazu do aplikace je v api/client/b/[slug]/voucher (kód + podnik). Hostovi se tu nikdy nevrací nic jiného než
// výsledek; jen vlastní poukaz jde odebrat (podmínka ve WHERE).
import { NextRequest, NextResponse } from 'next/server';
import { customer } from '@/lib/client';
import { odeberPoukazHostovi } from '@/lib/poukazyHostDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function DELETE(req: NextRequest) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const id = Math.round(Number(b.id));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Poukaz nenalezen' }, { status: 404 });
  try {
    if (!(await odeberPoukazHostovi(me.id, id))) return NextResponse.json({ error: 'Poukaz nenalezen' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[poukaz hosta] odebrání', e);
    return NextResponse.json({ error: 'Poukaz se teď nepodařilo odebrat. Zkus to za chvíli.' }, { status: 503 });
  }
}
