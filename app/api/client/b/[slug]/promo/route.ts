// Host zadá promo kód podniku. Logika (podmínky kuponu, „jednou na hosta“, počítadlo, kompenzace)
// je v lib/klient/promo.ts — stejnou cestou jde i jedno pole „Mám kód“ (POST /api/client/kod).
import { NextResponse } from 'next/server';
import { customer, profileBySlug } from '@/lib/client';
import { hit } from '@/lib/rateLimit';
import { uplatniPromo } from '@/lib/klient/promo';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const p = await profileBySlug(params.slug);
  if (!p || !p.loyalty_on) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const gate = await hit(`client-promo:${me.id}`, 10, 3600);
  if (!gate.ok) return NextResponse.json({ error: 'Moc pokusů. Zkus to za hodinu.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const r = await uplatniPromo(me, p, String(b.code ?? ''));
  return NextResponse.json(r.body, { status: r.status });
}
