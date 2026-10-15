import { NextResponse } from 'next/server';
import { customer, profileBySlug, join, membership, award } from '@/lib/client';
import { uvitaciBody } from '@/lib/bodyPravidla';
import { zmenSouhlas } from '@/lib/consentsDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const p = await profileBySlug(params.slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const teamId = Number(p.team_id);
  const already = await membership(me.id, teamId);
  const m = await join(me.id, teamId);
  // Uvítací body: hned je co ztratit, hned je proč se vrátit.
  // Kolik bodů, určuje podnik (Věrnost → Body a úrovně → Uvítací body); bez nastavení platí dřívějších 10.
  const uvitaci = !already && p.loyalty_on ? uvitaciBody(p) : 0;
  if (uvitaci > 0) await award(teamId, me.id, uvitaci, 'welcome', null, 'Vítej v podniku');
  // „Chci novinky od <podnik>“ při vstupu (spuštění, balík G): výchozí NE, ukládá se jen výslovné true
  // (oznámení i e-mail; e-mail jde v profilu vypnout zvlášť). Nepovedený zápis členství neshodí.
  const b = await req.json().catch(() => ({}));
  let novinky = false;
  if (b?.novinky === true) {
    const s = await zmenSouhlas(me.id, { teamId, typ: 'novinky_email', stav: 'udelen' }, 'clenstvi').catch(() => null);
    novinky = !!s?.push;
  }
  return NextResponse.json({ ok: true, points: Number(m?.points ?? 0) + uvitaci, novinky });
}
