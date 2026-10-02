// Promo kódy: na letáku, v příspěvku, na účtence. Host ho zadá a dostane body
// nebo kupon. Omezený počet použití, každý host jednou. Správa v plné síle:
// úprava (název, body, kupon, limit, platnost od–do), dávková generace kódů,
// hromadné zapnutí / vypnutí / smazání, rozpad použití (kdo a kdy) a export CSV.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { zajistiKupony } from '@/lib/kuponyDb';
import { cistyKod, hodnotyPromo, kontrolaPromo, davkaKodu, promoCsv, promoPouzitiCsv, MAX_DAVKA_KODU, stavPromo } from '@/lib/kuponyPravidla';
import { pragueToday } from '@/lib/pragueTime';
import { czCount } from '@/lib/czech';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const KOD = { one: 'kód', few: 'kódy', many: 'kódů' };
const csvOdpoved = (csv: string, soubor: string) => new NextResponse(csv, {
  headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${soubor}"`, 'Cache-Control': 'private, no-store' },
});

/** Kupon k promo kódu musí být kupon tohoto podniku. */
async function kuponJeMuj(teamId: number, id: number | null): Promise<boolean> {
  if (!id) return true;
  const [c] = await sql`SELECT id FROM client_coupons WHERE id = ${id} AND team_id = ${teamId} AND kind = 'offer'`;
  return !!c;
}

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiKupony();
  const u = new URL(req.url).searchParams;
  const dnes = pragueToday();
  const detailId = parseInt(u.get('uses') ?? '', 10);
  // Rozpad použití jednoho kódu: kdo a kdy.
  if (Number.isFinite(detailId) || u.get('export') === 'uses') {
    const rows = await sql`
      SELECT p.code, us.name AS customer_name, pu.used_at
      FROM client_promo_uses pu JOIN client_promos p ON p.id = pu.promo_id JOIN users us ON us.id = pu.customer_id
      WHERE p.team_id = ${ctx.teamId} AND (${Number.isFinite(detailId) ? detailId : null}::int IS NULL OR p.id = ${Number.isFinite(detailId) ? detailId : null})
      ORDER BY pu.used_at DESC LIMIT 5000` as any[];
    if (u.get('export') === 'uses') return csvOdpoved(promoPouzitiCsv(rows), `promo-pouziti-${dnes}.csv`);
    return NextResponse.json({ pouziti: rows.slice(0, 200).map(r => ({ host: r.customer_name, kdy: r.used_at })), celkem: rows.length });
  }
  const promos = await sql`
    SELECT p.*, c.title AS coupon_title FROM client_promos p LEFT JOIN client_coupons c ON c.id = p.coupon_id
    WHERE p.team_id = ${ctx.teamId} ORDER BY p.active DESC, p.created_at DESC`;
  if (u.get('export') === 'csv') return csvOdpoved(promoCsv(promos as any[], dnes), `promo-kody-${dnes}.csv`);
  return NextResponse.json({ promos: (promos as any[]).map(p => ({ ...p, stav: stavPromo(p, dnes) })) });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiKupony();
  const teamId = ctx.teamId;
  const b = await req.json().catch(() => ({}));
  const h = hodnotyPromo(b);
  const bad = kontrolaPromo(h);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  if (!(await kuponJeMuj(teamId, h.coupon_id))) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 400 });
  // Dávka: stejné nastavení, N náhodných kódů s předponou (každý jde použít jinde, jinému hostu).
  if (b.batch) {
    const pocet = Math.round(Number(b.batch.count));
    if (!Number.isFinite(pocet) || pocet < 1 || pocet > MAX_DAVKA_KODU) return NextResponse.json({ error: `Počet kódů v dávce je 1 až ${MAX_DAVKA_KODU}.` }, { status: 400 });
    const prefix = cistyKod(b.batch.prefix, 8);
    if (prefix.length < 2) return NextResponse.json({ error: 'Předpona dávky potřebuje aspoň dva znaky (třeba JARO).' }, { status: 400 });
    const hotove: any[] = [];
    // Kolizi s cizím kódem (kódy jsou unikátní napříč podniky) řeší nová dávka; stačí pár kol.
    for (let kolo = 0; kolo < 4 && hotove.length < pocet; kolo += 1) {
      const kody = davkaKodu({ prefix, pocet: pocet - hotove.length }, new Set(hotove.map(p => p.code)));
      for (const code of kody) {
        const r = await sql`
          INSERT INTO client_promos (team_id, code, title, points, coupon_id, max_uses, valid_since, valid_until, active)
          VALUES (${teamId}, ${code}, ${h.title}, ${h.points}, ${h.coupon_id}, ${h.max_uses}, ${h.valid_since}, ${h.valid_until}, ${h.active})
          ON CONFLICT (code) DO NOTHING RETURNING *`;
        if (r.length) hotove.push(r[0]);
      }
    }
    audit(teamId, ctx.meId, 'client.promo', 'client_promo', null, `dávka ${czCount(hotove.length, KOD)} ${prefix}…: ${h.title}`);
    return NextResponse.json({ ok: true, promos: hotove, pocet: hotove.length });
  }
  const code = cistyKod(b.code);
  if (code.length < 3) return NextResponse.json({ error: 'Kód potřebuje aspoň 3 znaky (písmena a číslice).' }, { status: 400 });
  try {
    const [p] = await sql`
      INSERT INTO client_promos (team_id, code, title, points, coupon_id, max_uses, valid_since, valid_until, active)
      VALUES (${teamId}, ${code}, ${h.title}, ${h.points}, ${h.coupon_id}, ${h.max_uses}, ${h.valid_since}, ${h.valid_until}, ${h.active}) RETURNING *`;
    audit(teamId, ctx.meId, 'client.promo', 'client_promo', p.id, `založen: ${code} (${h.title})`);
    return NextResponse.json({ ok: true, promo: p });
  } catch { return NextResponse.json({ error: 'Tenhle kód už někdo používá. Zvol jiný.' }, { status: 409 }); }
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiKupony();
  const teamId = ctx.teamId;
  const b = await req.json().catch(() => ({}));
  // Hromadně: zapnout, vypnout, smazat (jen kódy, které nikdo nepoužil).
  if (Array.isArray(b.ids)) {
    const ids = Array.from(new Set(b.ids.map((x: any) => parseInt(String(x), 10)).filter((n: number) => Number.isFinite(n) && n > 0))).slice(0, 500) as number[];
    const akce = String(b.action ?? '');
    if (!ids.length) return NextResponse.json({ error: 'Vyber aspoň jeden kód.' }, { status: 400 });
    if (!['aktivovat', 'pozastavit', 'smazat'].includes(akce)) return NextResponse.json({ error: 'Neznámá hromadná akce.' }, { status: 400 });
    const r = akce === 'smazat'
      ? await sql`DELETE FROM client_promos WHERE team_id = ${teamId} AND id = ANY(${ids}) AND uses = 0 RETURNING id`
      : await sql`UPDATE client_promos SET active = ${akce === 'aktivovat'} WHERE team_id = ${teamId} AND id = ANY(${ids}) RETURNING id`;
    audit(teamId, ctx.meId, 'client.promo', 'client_promo', null, `hromadně ${akce}: ${czCount(r.length, KOD)}`);
    return NextResponse.json({ ok: true, hotovo: r.length, preskoceno: ids.length - r.length });
  }
  const id = parseInt(String(b.id), 10);
  const [cur] = Number.isFinite(id) ? await sql`SELECT * FROM client_promos WHERE id = ${id} AND team_id = ${teamId}` : [];
  if (!cur) return NextResponse.json({ error: 'Kód nenalezen' }, { status: 404 });
  // Rychlé přepnutí aktivity.
  if (b.title === undefined) {
    const [p] = await sql`UPDATE client_promos SET active = ${!!b.active} WHERE id = ${id} RETURNING *`;
    audit(teamId, ctx.meId, 'client.promo', 'client_promo', id, `${p.active ? 'zapnut' : 'vypnut'}: ${p.code}`);
    return NextResponse.json({ ok: true, promo: p });
  }
  // Úprava: kód samotný jde změnit, jen dokud ho nikdo nepoužil (jinak by se rozbil leták).
  const h = hodnotyPromo(b);
  const bad = kontrolaPromo(h);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  if (!(await kuponJeMuj(teamId, h.coupon_id))) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 400 });
  const novyKod = b.code === undefined ? cur.code : cistyKod(b.code);
  if (novyKod !== cur.code) {
    if (Number(cur.uses) > 0) return NextResponse.json({ error: 'Kód už někdo použil, přejmenovat ho nejde. Založ nový a tenhle vypni.' }, { status: 409 });
    if (novyKod.length < 3) return NextResponse.json({ error: 'Kód potřebuje aspoň 3 znaky (písmena a číslice).' }, { status: 400 });
  }
  try {
    const [p] = await sql`
      UPDATE client_promos SET code = ${novyKod}, title = ${h.title}, points = ${h.points}, coupon_id = ${h.coupon_id},
        max_uses = ${h.max_uses}, valid_since = ${h.valid_since}, valid_until = ${h.valid_until}, active = ${b.active === undefined ? cur.active !== false : h.active}
      WHERE id = ${id} AND team_id = ${teamId} RETURNING *`;
    audit(teamId, ctx.meId, 'client.promo', 'client_promo', id, `upraven: ${p.code} (${p.title})`);
    return NextResponse.json({ ok: true, promo: p });
  } catch { return NextResponse.json({ error: 'Tenhle kód už někdo používá. Zvol jiný.' }, { status: 409 }); }
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '', 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatný kód' }, { status: 400 });
  const [cur] = await sql`SELECT code, uses FROM client_promos WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  if (!cur) return NextResponse.json({ error: 'Kód nenalezen' }, { status: 404 });
  // Použitý kód se nemaže: zůstala by po něm sirotčí historie a host by ho zadal znovu do prázdna. Vypíná se.
  if (Number(cur.uses) > 0) return NextResponse.json({ error: 'Kód už někdo použil. Vypni ho, ať zůstane historie.' }, { status: 409 });
  await sql`DELETE FROM client_promos WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  audit(ctx.teamId, ctx.meId, 'client.promo', 'client_promo', id, `smazán: ${cur.code}`);
  return NextResponse.json({ ok: true });
}
