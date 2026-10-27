// Živá odezva u kasy (kontrakt se čtečkou: …/klient/kontrakt-ctecka.md).
// Host s otevřeným „U kasy“ se ptá každé 2–3 s: GET ?od=<kurzor>. Bez `od` (první dotaz)
// vrátí jen kurzor „teď“ a žádné události — staré akce se znovu neukazují.
import { NextRequest, NextResponse } from 'next/server';
import { customer } from '@/lib/client';
import { udalostiOd, kurzorTed, platnyKurzor } from '@/lib/klient/odezva';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const od = platnyKurzor(new URL(req.url).searchParams.get('od'));
  if (!od) return NextResponse.json({ kurzor: await kurzorTed(), udalosti: [] });
  return NextResponse.json(await udalostiOd(me.id, od));
}
