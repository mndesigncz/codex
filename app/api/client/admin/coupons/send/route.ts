// Poslat kupon hostům: konkrétním (výběr členů), skupině nebo segmentu, hromadně.
// Také „uvítací kupon pro stávající členy“ (zdroj welcome): kupon, který dostávají
// noví členové, dostanou jednorázově i ti, kdo už v klubu jsou. Respektuje cílení
// kuponu (úrovně, skupiny, 18+), limit na hosta a limit kusů; kdo už drží neuplatněný
// kód, nedostane druhý. Hostovi přijde oznámení.
import { NextRequest, NextResponse } from 'next/server';
import { sql, couponCode } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { audienceIds, segmentyPocty, linkFor } from '@/lib/broadcasts';
import { SEGMENTY } from '@/lib/segmenty';
import { notifyUsers } from '@/lib/push';
import { rozesliKupon, vetaORozeslani } from '@/lib/coupons';
import { zajistiKupony } from '@/lib/kuponyDb';
import { jeVeVerejne } from '@/lib/kuponyPravidla';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Možnosti výběru komu poslat: celý klub, skupiny a segmenty s počty. */
export async function GET() {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const teamId = ctx.teamId;
  const [celkem] = await sql`SELECT COUNT(*)::int AS n FROM client_memberships WHERE team_id = ${teamId}`;
  let groups: any[] = [];
  try {
    groups = await sql`
      SELECT g.id, g.name, (SELECT COUNT(*)::int FROM client_group_members gm WHERE gm.group_id = g.id) AS members
      FROM client_groups g WHERE g.team_id = ${teamId} ORDER BY g.name, g.id` as any[];
  } catch { groups = []; }
  const pocty = await segmentyPocty(teamId);
  return NextResponse.json({
    celkem: Number(celkem?.n) || 0,
    skupiny: groups.map(g => ({ id: Number(g.id), name: String(g.name), members: Number(g.members) || 0 })),
    segmenty: SEGMENTY.map(s => ({ id: s.id, label: s.label, popis: s.popis, pocet: pocty[s.id] ?? 0 })),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiKupony();
  const teamId = ctx.teamId;
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.couponId), 10);
  const [c] = Number.isFinite(id) ? await sql`SELECT * FROM client_coupons WHERE id = ${id} AND team_id = ${teamId} AND kind = 'offer'` : [];
  if (!c) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 404 });
  if (!jeVeVerejne(c)) return NextResponse.json({ error: 'Koncept, archivovaný nebo vypnutý kupon nejde rozeslat. Nejdřív ho zveřejni.' }, { status: 409 });
  if (c.valid_until && String(c.valid_until) < pragueToday()) return NextResponse.json({ error: 'Kupon už neplatí, rozeslat ho nejde.' }, { status: 409 });
  let ids: number[];
  if (Array.isArray(b.customerIds)) {
    ids = b.customerIds.map((x: any) => parseInt(String(x), 10)).filter((n: number) => Number.isFinite(n) && n > 0);
  } else if (typeof b.audience === 'string' && b.audience) {
    ids = await audienceIds(teamId, String(b.audience));
  } else return NextResponse.json({ error: 'Vyber, komu kupon poslat.' }, { status: 400 });
  if (!ids.length) return NextResponse.json({ error: 'V tomhle výběru nikdo není.' }, { status: 400 });
  if (ids.length > 5000) return NextResponse.json({ error: 'Najednou jde poslat nejvýš 5 000 hostům. Zúži výběr.' }, { status: 400 });
  const zdroj = b.zdroj === 'welcome' ? 'welcome' : 'send';
  const { komu, preskoceno } = await rozesliKupon(teamId, c, ids, { zdroj, poslal: ctx.meId, makeCode: couponCode });
  if (komu.length) {
    const [p] = await sql`SELECT slug FROM client_profiles WHERE team_id = ${teamId}`;
    await notifyUsers(komu, {
      title: 'Máš nový kupon', body: String(c.title).slice(0, 120), link: linkFor('me', p?.slug ?? null), type: 'success', category: 'novinky',
    }).catch(() => {});
  }
  const veta = vetaORozeslani(komu.length, preskoceno);
  audit(teamId, ctx.meId, 'client.coupon.send', 'client_coupon_send', id, `${zdroj === 'welcome' ? 'uvítací pro stávající' : 'poslán'}: ${c.title}. ${veta}`);
  return NextResponse.json({ ok: true, odeslano: komu.length, preskoceno, veta });
}
