// Pokladna hlásí stav objednávky (potvrzeno, vydáno, odmítnuto) jedním GET
// na podepsanou adresu. Bez opakování — proto je to jen zrychlení; jistotu
// dává dotahování stavu při každém zobrazení příjmu.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { callbackSig, applyPosState } from '@/lib/clientOrders';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const STATE: Record<string, string> = { confirm: 'CONFIRMED', dispatch: 'DISPATCHED', decline: 'DECLINED' };

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  const id = parseInt(String(q.get('o')), 10);
  const event = String(q.get('e') ?? '');
  const key = String(q.get('k') ?? '');
  const st = STATE[event];
  if (!id || !st) return NextResponse.json({ error: 'Neznámá událost' }, { status: 400 });
  const want = callbackSig(id, event);
  if (key.length !== want.length || !timingSafeEqual(Buffer.from(key), Buffer.from(want))) return NextResponse.json({ error: 'Neplatný podpis' }, { status: 403 });
  const [o] = await sql`SELECT * FROM client_orders WHERE id = ${id}`;
  if (!o) return NextResponse.json({ error: 'Objednávka nenalezena' }, { status: 404 });
  if (o.pos_state !== st) await applyPosState(Number(o.team_id), o, st);
  return NextResponse.json({ ok: true });
}
