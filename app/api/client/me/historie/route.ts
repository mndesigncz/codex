// Moje historie: body, razítka, kredit a kupony jedním seznamem (nejnovější nahoře), po stránkách.
// ?slug= zúží na jeden podnik (stránka podniku), bez něj jsou všechny moje podniky (Moje).
// Interní poznámky podniku se hostovi nevrací, jen druh záznamu, čísla a název kuponu (lib/hostHistorieDb.ts).
import { NextRequest, NextResponse } from 'next/server';
import { customer, profileBySlug } from '@/lib/client';
import { historieHosta } from '@/lib/hostHistorieDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const u = req.nextUrl.searchParams;
  let teamId: number | null = null;
  const slug = u.get('slug');
  if (slug) {
    const p = await profileBySlug(slug);
    if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
    teamId = Number(p.team_id);
  }
  try {
    return NextResponse.json(await historieHosta(me.id, { teamId, strana: u.get('strana'), naStranu: u.get('naStranu') }));
  } catch (e) {
    console.error('[historie hosta]', e);
    return NextResponse.json({ error: 'Historii se teď nepodařilo načíst. Zkus to za chvíli.' }, { status: 503 });
  }
}
