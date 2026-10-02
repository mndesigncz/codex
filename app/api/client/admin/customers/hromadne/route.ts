// Hromadné akce nad vybranými členy: skupina (přidat / odebrat), body, kupon a zpráva.
// Každá akce má svoje oprávnění — hromadné body nejsou o nic slabší než body jednomu členovi.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { platniClenove, hromadneBody, kuponKPripsani, pripisKuponClenum, MAX_HROMADNE } from '@/lib/clenoveDb';
import { vytvorZpravu } from '@/lib/broadcasts';
import { zajistiSchemaClenu } from '@/lib/clenoveSchema';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

const KLIC: Record<string, string> = {
  skupina_pridat: 'zakaznici.skupiny',
  skupina_odebrat: 'zakaznici.skupiny',
  body: 'vernost.upravit_body',
  kupon: 'kupony.spravovat',
  zprava: 'zakaznici.zpravy',
};

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const akce = String(b.akce ?? '');
  const klic = KLIC[akce];
  if (!klic) return NextResponse.json({ error: 'Neznámá akce.' }, { status: 400 });
  const ctx = await pozaduj(klic);
  if (jeOdpoved(ctx)) return ctx;
  await zajistiSchemaClenu();
  const ids = await platniClenove(ctx.teamId, b.ids);
  if (!ids.length) return NextResponse.json({ error: 'Nikdo z vybraných už není členem.' }, { status: 400 });
  if (Array.isArray(b.ids) && b.ids.length > MAX_HROMADNE) return NextResponse.json({ error: `Najednou jde nejvýš ${MAX_HROMADNE} členů. Zúži výběr filtrem.` }, { status: 400 });

  if (akce === 'skupina_pridat' || akce === 'skupina_odebrat') {
    const gid = Math.round(Number(b.skupina));
    const [g] = await sql`SELECT id, name, rule, archived FROM client_groups WHERE id = ${gid} AND team_id = ${ctx.teamId}`;
    if (!g) return NextResponse.json({ error: 'Skupina nenalezena.' }, { status: 404 });
    if (g.rule) return NextResponse.json({ error: 'Členy dynamické skupiny počítá pravidlo, ručně se neupravují.' }, { status: 400 });
    if (g.archived) return NextResponse.json({ error: 'Skupina je v archivu. Nejdřív ji vrať z archivu.' }, { status: 400 });
    if (akce === 'skupina_pridat') {
      const r = await sql`
        INSERT INTO client_group_members (group_id, customer_id, team_id)
        SELECT ${gid}, x, ${ctx.teamId} FROM unnest(${ids}::int[]) AS x
        ON CONFLICT (group_id, customer_id) DO NOTHING RETURNING customer_id` as any[];
      audit(ctx.teamId, ctx.meId, 'client.clen.hromadne_skupina', 'client', gid, `${g.name}: +${r.length} členů`);
      return NextResponse.json({ ok: true, zmeneno: r.length, uzBylo: ids.length - r.length });
    }
    const r = await sql`DELETE FROM client_group_members WHERE group_id = ${gid} AND team_id = ${ctx.teamId} AND customer_id = ANY(${ids}) RETURNING customer_id` as any[];
    audit(ctx.teamId, ctx.meId, 'client.clen.hromadne_skupina', 'client', gid, `${g.name}: −${r.length} členů`);
    return NextResponse.json({ ok: true, zmeneno: r.length, uzBylo: ids.length - r.length });
  }

  if (akce === 'body') {
    const delta = Math.round(Number(b.delta));
    if (!Number.isInteger(delta) || delta === 0) return NextResponse.json({ error: 'Zadej počet bodů, kladný přičte, záporný odečte.' }, { status: 400 });
    if (Math.abs(delta) > 100000) return NextResponse.json({ error: 'Najednou jde nejvýš 100 000 bodů.' }, { status: 400 });
    const r = await hromadneBody(ctx.teamId, ids, delta, String(b.note ?? '').trim().slice(0, 200), ctx.meId);
    return NextResponse.json({ ok: true, upraveno: r.upraveno, blokovanych: r.blokovanych });
  }

  if (akce === 'kupon') {
    const k = await kuponKPripsani(ctx.teamId, Math.round(Number(b.couponId)));
    if (!k) return NextResponse.json({ error: 'Kupon neexistuje nebo je vypnutý.' }, { status: 400 });
    const komu = await pripisKuponClenum(ctx.teamId, k.id, ids);
    audit(ctx.teamId, ctx.meId, 'client.clen.hromadne_kupon', 'client', k.id, `${k.title}: ${komu.length} členů`);
    return NextResponse.json({ ok: true, pripsano: komu.length, uMeloUz: ids.length - komu.length });
  }

  // zprava: stejná cesta jako rozesílka, jen s publikem „vybraní členové“.
  const r = await vytvorZpravu(ctx.teamId, ctx.meId, { ...b, audience: 'vybrani', vybrani: ids });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, broadcast: r.row, scheduled: r.scheduled });
}
