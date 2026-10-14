// Čekající párování kartiček s účty z pokladny (varianta A, lib/vernostZUctu.ts).
//
// GET   seznam „Čeká na zaplacení“ (host, čas skenu, stůl, účty, které připadají v úvahu)
//       a „Spárováno“ za poslední tři hodiny. Při čtení se párování líně uklidí (propadnutí
//       po 6 h), zkusí se napárovat ze zrcadla a na pozadí se vynutí synchronizace Storyous
//       (nejvýš jednou za 30 s), dokud něco čeká.
// PATCH { id, action: 'zrusit' }               párování skončí bez připsání
//       { id, action: 'stul', deskId }          obsluha upřesní stůl (páruje se pak podle stolu)
//       { id, action: 'vybrat', billId }        obsluha vybere účet ručně (stejné jádro, jednou na účet)
import { NextRequest, NextResponse, after } from 'next/server';
import { sql, ensureProfile, join, jeClenBlokovan } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { getConnection } from '@/lib/storyous';
import { audit } from '@/lib/audit';
import { menaPodniku } from '@/lib/menaPodniku';
import { vetaSparovano } from '@/lib/parovaniUctu';
import { zajistiParovani, parujCekajici, seznamCekajicich, stolyKParovani, synchronizujPoSkenu, pripisZUctu } from '@/lib/vernostZUctu';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

export async function GET() {
  const ctx = await pozaduj('vernost.karta');
  if (jeOdpoved(ctx)) return ctx;
  const conn = await getConnection(ctx.teamId);
  // Bez pokladny se nic nepáruje: čtečka se chová jako dřív.
  if (!conn) return NextResponse.json({ pos: false, ceka: [], hotovo: [], stoly: [] });
  try {
    await parujCekajici(ctx.teamId);
    const s = await seznamCekajicich(ctx.teamId);
    if (s.ceka.length) after(() => synchronizujPoSkenu(ctx.teamId));
    return NextResponse.json({ pos: true, ...s, stoly: await stolyKParovani(ctx.teamId) });
  } catch {
    return NextResponse.json({ error: 'Čekající účty se nepodařilo načíst.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('vernost.karta');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const id = Math.round(Number(b.id));
  const action = String(b.action ?? '');
  if (!(id > 0) || !['zrusit', 'stul', 'vybrat'].includes(action)) return NextResponse.json({ error: 'Neznámá akce' }, { status: 400 });
  await zajistiParovani();
  const [c] = await sql`
    SELECT c.id, c.customer_id, c.stav, us.name AS customer_name
    FROM client_bill_claims c JOIN users us ON us.id = c.customer_id
    WHERE c.id = ${id} AND c.team_id = ${ctx.teamId}` as any[];
  if (!c) return NextResponse.json({ error: 'Takové čekání na účet neznáme.' }, { status: 404 });
  if (c.stav !== 'ceka') {
    return NextResponse.json({ error: c.stav === 'sparovano' ? 'Tenhle host už je s účtem spárovaný.' : c.stav === 'propadlo' ? 'Čekání propadlo (víc než 6 hodin od skenu).' : 'Čekání už neplatí.' }, { status: 409 });
  }
  const host = { id: Number(c.customer_id), name: String(c.customer_name ?? 'Host') };

  if (action === 'zrusit') {
    await sql`UPDATE client_bill_claims SET stav = 'zruseno', updated_at = NOW() WHERE id = ${id} AND team_id = ${ctx.teamId} AND stav = 'ceka'`;
    audit(ctx.teamId, ctx.meId, 'client.parovani', 'client', host.id, `${host.name}: čekání na účet zrušeno`);
    return NextResponse.json({ ok: true, message: `${host.name}: čekání na účet zrušeno.` });
  }

  if (action === 'stul') {
    const deskId = b.deskId == null || b.deskId === '' ? null : String(b.deskId).slice(0, 60);
    if (deskId) {
      const [t] = await sql`SELECT name FROM client_tables WHERE team_id = ${ctx.teamId} AND storyous_desk_id = ${deskId}` as any[];
      if (!t) return NextResponse.json({ error: 'Takový stůl podnik s pokladnou spárovaný nemá.' }, { status: 400 });
    }
    await sql`UPDATE client_bill_claims SET desk_id = ${deskId}, updated_at = NOW() WHERE id = ${id} AND team_id = ${ctx.teamId} AND stav = 'ceka'`;
    // Se stolem může být účet hned jednoznačný.
    await parujCekajici(ctx.teamId);
    return NextResponse.json({ ok: true });
  }

  // Ruční výběr účtu u čekajícího párování.
  const billId = String(b.billId ?? '').slice(0, 60);
  if (!billId) return NextResponse.json({ error: 'Vyber účtenku.' }, { status: 400 });
  const p = await ensureProfile(ctx.teamId);
  if (await jeClenBlokovan(ctx.teamId, host.id)) return NextResponse.json({ error: `${host.name} je ve věrnostním programu zablokovaný. Body ani razítka se mu nepřipisují.` }, { status: 403 });
  await join(host.id, ctx.teamId);
  const r = await pripisZUctu({ teamId: ctx.teamId, customer: host, billId, staffId: ctx.meId, profil: p, claimId: id, zdroj: 'vyber' });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const mena = await menaPodniku(ctx.teamId);
  const veta = vetaSparovano(r.total, r.body, r.kredit, mena.money);
  audit(ctx.teamId, ctx.meId, 'client.parovani', 'client', host.id, `${host.name}: ${veta} (vybrala obsluha)`);
  return NextResponse.json({ ok: true, message: `${host.name}: ${veta}.`, detail: r.message });
}
