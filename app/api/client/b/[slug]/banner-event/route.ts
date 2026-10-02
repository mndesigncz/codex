// Host: zobrazení a proklik banneru. Lehká statistika bez osobních údajů: do databáze jde jen
// „banner, pražský den, +1“ (lib/clientBanners.ts zapisUdalostBanneru). Nepřihlášený host smí také;
// bez cookie, bez IP v databázi (IP se používá jen k omezení počtu volání v paměti počítadla).
// Odpověď je vždy stejná, ať se zapsalo, nebo ne (neexistující a vypnutý banner se neliší).
import { NextResponse } from 'next/server';
import { profileBySlug } from '@/lib/client';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';
import { druhUdalosti } from '@/lib/bannery';
import { zapisUdalostBanneru } from '@/lib/clientBanners';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const p = await profileBySlug(params.slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const teamId = Number(p.team_id);
  const b = await req.json().catch(() => ({}));
  const druh = druhUdalosti(b?.type);
  const id = Number(b?.id);
  if (!druh || !Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Neplatná událost.' }, { status: 400 });
  // Statistika není důležitější než provoz: při výpadku počítadla se pustí, při překročení limitu ne.
  const brana = await hit(`banner-udalost:${klientIp(req.headers)}:${teamId}`, 120, 10 * 60);
  if (!brana.ok) return NextResponse.json({ error: 'Moc požadavků.' }, { status: 429 });
  try {
    await zapisUdalostBanneru(teamId, id, druh);
  } catch (e) {
    console.error('[banner-event]', e);
    return NextResponse.json({ error: 'Událost se nepodařilo zapsat.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
