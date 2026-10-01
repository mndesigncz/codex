// Host: „Mám poukaz“. Opíše kód a uvidí zůstatek a platnost. Jen čtení, nic se tu neuplatňuje (to dělá obsluha u kasy).
// Kódy se nesmí dát hádat: pokusy se počítají podle IP a podniku (hit) a všechny chyby jsou stejně generické,
// ať se z odpovědi nepozná, jestli kód existuje, je zrušený, vyčerpaný nebo propadlý.
import { NextResponse } from 'next/server';
import { profileBySlug } from '@/lib/client';
import { pragueToday } from '@/lib/pragueTime';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';
import { poukazProHosta } from '@/lib/poukazyDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const p = await profileBySlug(params.slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const teamId = Number(p.team_id);
  // Deset pokusů za čtvrt hodiny z jedné adresy u jednoho podniku; při výpadku počítadla se NEpouští (hádání kódů).
  const brana = await hit(`poukaz:${klientIp(req.headers)}:${teamId}`, 10, 15 * 60, { failClosed: true });
  if (!brana.ok) return NextResponse.json({ error: 'Moc pokusů. Zkus to za čtvrt hodiny.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  try {
    const v = await poukazProHosta(teamId, b.code, pragueToday());
    if (!v) return NextResponse.json({ error: 'Poukaz nenalezen nebo neplatí' }, { status: 404 });
    return NextResponse.json({ ok: true, balance: v.balance, value: v.value_amount, currency: v.currency, validUntil: v.valid_until });
  } catch (e) {
    console.error('[poukaz hosta]', e);
    return NextResponse.json({ error: 'Poukaz se teď nepodařilo ověřit. Zkus to za chvíli.' }, { status: 503 });
  }
}
