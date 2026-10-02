// Promo kódy: na letáku, v příspěvku, na účtence. Host ho zadá a dostane body
// nebo kupon. Omezený počet použití, každý host jednou. Správce kód zakládá
// (jednotlivě, nebo dávkou s předponou), upravuje, vypíná a maže; rozpad použití
// je v ./[id], export dávky do CSV v ./export.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { pragueToday } from '@/lib/pragueTime';
import { cistiKod, zkontrolujPromo, zkontrolujDavku, navrhniKody, stavPromo } from '@/lib/promoKody';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function kuponPatriPodniku(teamId: number, couponId: number | null): Promise<boolean> {
  if (!couponId) return true;
  const [c] = await sql`SELECT id FROM client_coupons WHERE id = ${couponId} AND team_id = ${teamId} AND kind = 'offer'`;
  return !!c;
}

export async function GET() {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const dnes = pragueToday();
  const rows = await sql`
    SELECT p.*, c.title AS coupon_title FROM client_promos p LEFT JOIN client_coupons c ON c.id = p.coupon_id
    WHERE p.team_id = ${ctx.teamId} ORDER BY p.active DESC, p.created_at DESC, p.id DESC` as any[];
  const promos = rows.map(p => ({ ...p, stav: stavPromo(p, dnes) }));
  return NextResponse.json({ promos });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const davka = b.davka === true;
  // Dávka má jednorázové kódy, dokud správce neřekne jinak.
  const v = zkontrolujPromo(davka && !String(b.max_uses ?? '').trim() ? { ...b, max_uses: '1' } : b);
  if ('chyba' in v) return NextResponse.json({ error: v.chyba }, { status: 400 });
  const h = v.hodnoty;
  if (!(await kuponPatriPodniku(ctx.teamId, h.couponId))) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 400 });

  if (davka) {
    const d = zkontrolujDavku(b);
    if ('chyba' in d) return NextResponse.json({ error: d.chyba }, { status: 400 });
    const stitek = `${d.predpona || 'DAVKA'} ${pragueToday()}`.slice(0, 40);
    const vytvorene: any[] = [];
    // Kolize s cizími kódy jsou vzácné (kód je unikátní napříč podniky); doplní se dalším kolem.
    for (let kolo = 0; kolo < 5 && vytvorene.length < d.pocet; kolo++) {
      const kody = navrhniKody(d.pocet - vytvorene.length, d.predpona);
      const r = await sql`
        INSERT INTO client_promos (team_id, code, title, points, coupon_id, max_uses, valid_until, batch)
        SELECT ${ctx.teamId}, k, ${h.title}, ${h.points}, ${h.couponId}, ${h.maxUses}, ${h.validUntil}, ${stitek}
        FROM unnest(${kody}::text[]) AS k
        ON CONFLICT (code) DO NOTHING RETURNING *` as any[];
      vytvorene.push(...r);
    }
    if (vytvorene.length < d.pocet) {
      return NextResponse.json({ error: `Povedlo se vytvořit jen ${vytvorene.length} z ${d.pocet} kódů. Zkus jinou předponu.`, vytvoreno: vytvorene.length, davka: stitek }, { status: 409 });
    }
    await audit(ctx.teamId, ctx.meId, 'client.promo', 'client_promo', null, `dávka ${vytvorene.length} kódů: ${h.title} (${stitek})`);
    return NextResponse.json({ ok: true, davka: stitek, vytvoreno: vytvorene.length, promos: vytvorene });
  }

  const code = cistiKod(b.code);
  if (code.length < 3) return NextResponse.json({ error: 'Kód musí mít aspoň 3 znaky (písmena a číslice).' }, { status: 400 });
  const vlozeno = await sql`
    INSERT INTO client_promos (team_id, code, title, points, coupon_id, max_uses, valid_until)
    VALUES (${ctx.teamId}, ${code}, ${h.title}, ${h.points}, ${h.couponId}, ${h.maxUses}, ${h.validUntil})
    ON CONFLICT (code) DO NOTHING RETURNING *` as any[];
  if (!vlozeno.length) return NextResponse.json({ error: 'Tenhle kód už někdo používá. Zvol jiný.' }, { status: 409 });
  await audit(ctx.teamId, ctx.meId, 'client.promo', 'client_promo', Number(vlozeno[0].id), `založen: ${code} (${h.title})`);
  return NextResponse.json({ ok: true, promo: vlozeno[0] });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  const [cur] = await sql`SELECT * FROM client_promos WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  if (!cur) return NextResponse.json({ error: 'Kód nenalezen' }, { status: 404 });
  // Rychlé přepnutí aktivity.
  if (b.title === undefined) {
    const [p] = await sql`UPDATE client_promos SET active = ${!!b.active} WHERE id = ${id} AND team_id = ${ctx.teamId} RETURNING *`;
    await audit(ctx.teamId, ctx.meId, 'client.promo', 'client_promo', id, `${p.active ? 'zapnut' : 'vypnut'}: ${p.code}`);
    return NextResponse.json({ ok: true, promo: p });
  }
  // Úprava: kód samotný zůstává (je vytištěný na letácích); mění se odměna a limity.
  const v = zkontrolujPromo(b);
  if ('chyba' in v) return NextResponse.json({ error: v.chyba }, { status: 400 });
  const h = v.hodnoty;
  if (!(await kuponPatriPodniku(ctx.teamId, h.couponId))) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 400 });
  if (h.maxUses != null && h.maxUses < Number(cur.uses)) {
    return NextResponse.json({ error: `Kód už byl použit ${Number(cur.uses)}×. Limit nastav aspoň na tolik.` }, { status: 400 });
  }
  const [p] = await sql`
    UPDATE client_promos SET title = ${h.title}, points = ${h.points}, coupon_id = ${h.couponId}, max_uses = ${h.maxUses}, valid_until = ${h.validUntil}
    WHERE id = ${id} AND team_id = ${ctx.teamId} RETURNING *`;
  await audit(ctx.teamId, ctx.meId, 'client.promo', 'client_promo', id, `upraven: ${p.code}`);
  return NextResponse.json({ ok: true, promo: p });
}

/** Smazání jednoho kódu (`?id=`), nebo všech nepoužitých z dávky (`?batch=`). */
export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const url = new URL(req.url);
  const batch = url.searchParams.get('batch');
  if (batch) {
    const smazano = await sql`
      DELETE FROM client_promos WHERE team_id = ${ctx.teamId} AND batch = ${batch} AND uses = 0
      AND NOT EXISTS (SELECT 1 FROM client_promo_uses u WHERE u.promo_id = client_promos.id)
      RETURNING id`;
    await audit(ctx.teamId, ctx.meId, 'client.promo', 'client_promo', null, `smazáno ${smazano.length} nepoužitých kódů z dávky ${batch}`);
    return NextResponse.json({ ok: true, smazano: smazano.length });
  }
  const id = parseInt(url.searchParams.get('id') ?? '', 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatný kód' }, { status: 400 });
  const [p] = await sql`SELECT id, code, uses FROM client_promos WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  if (!p) return NextResponse.json({ error: 'Kód nenalezen' }, { status: 404 });
  await sql`DELETE FROM client_promo_uses WHERE promo_id = ${id}`;
  await sql`DELETE FROM client_promos WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  await audit(ctx.teamId, ctx.meId, 'client.promo', 'client_promo', id, `smazán: ${p.code}${Number(p.uses) ? ` (použit ${Number(p.uses)}×)` : ''}`);
  return NextResponse.json({ ok: true });
}
