// Ruční úprava bodů (omluva, bonus, oprava) a deník člena.
import { NextRequest, NextResponse } from 'next/server';
import { sql, awardDetail, awardCreditDetail, spendCredit, spendPoints, loyaltySummary, ensureProfile } from '@/lib/client';
import { tierForMember, tierRulesFromProfile } from '@/lib/clientSlots';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { upravUtratu, dopocitejUtratu } from '@/lib/urovneDb';
import { audit } from '@/lib/audit';
import { radaPoDnech } from '@/lib/bodyPrehledy';
import { cisloCs } from '@/lib/bodyPravidla';
import { menaPodniku } from '@/lib/menaPodniku';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const q = new URL(req.url).searchParams;
  // Bez čísla hosta vrací souhrn celé věrnosti pro přehled záložky.
  const cid = parseInt(String(q.get('customerId')), 10);
  if (!cid) {
    const recent = await sql`
      SELECT l.id, l.delta, l.credit_delta, l.kind, l.note, l.created_at, us.name AS customer_name
      FROM client_loyalty_ledger l JOIN users us ON us.id = l.customer_id
      WHERE l.team_id = ${u.team_id} ORDER BY l.created_at DESC LIMIT 20`;
    // Statistiky za 31 dní (po vzoru Kartičky): po dnech, ať jde vidět rytmus
    // týdne. Dny jsou pražské (ne UTC) a „členové u kasy" jsou jen skutečné návštěvy.
    let series: any[] = [];
    try { series = await radaPoDnech(u.team_id, 31); } catch { series = []; }
    return NextResponse.json({ summary: await loyaltySummary(u.team_id), recent, series });
  }
  const ledger = await sql`SELECT * FROM client_loyalty_ledger WHERE team_id = ${u.team_id} AND customer_id = ${cid} ORDER BY created_at DESC LIMIT 100`;
  if (!q.get('detail')) return NextResponse.json({ ledger });
  // Přehled hosta pro okno člena: všechno, co už o něm evidujeme, bez nových tabulek.
  const [m] = await sql`SELECT * FROM client_memberships WHERE team_id = ${u.team_id} AND customer_id = ${cid}` as any[];
  if (!m) return NextResponse.json({ error: 'Tenhle host není členem podniku.' }, { status: 404 });
  const profil = await ensureProfile(u.team_id);
  const uroven = tierForMember({ visits: m.visits, spend: m.spend }, tierRulesFromProfile(profil));
  const kampane = await sql`
    SELECT c.name, c.required_stamps, c.reward_title, p.stamps
    FROM client_stamp_progress p JOIN client_stamp_campaigns c ON c.id = p.campaign_id
    WHERE p.team_id = ${u.team_id} AND p.customer_id = ${cid} AND c.active = TRUE
    ORDER BY c.position, c.id` as any[];
  const claims = await sql`
    SELECT cl.claimed_at, cl.redeemed_at, cp.title
    FROM client_coupon_claims cl JOIN client_coupons cp ON cp.id = cl.coupon_id
    WHERE cl.team_id = ${u.team_id} AND cl.customer_id = ${cid}
    ORDER BY cl.claimed_at DESC LIMIT 30` as any[];
  let vouchers: any[] = [];
  try {
    vouchers = await sql`
      SELECT code, value_amount, balance, created_at FROM client_vouchers
      WHERE team_id = ${u.team_id} AND customer_id = ${cid} ORDER BY created_at DESC LIMIT 20` as any[];
  } catch { vouchers = []; }
  const orders = await sql`
    SELECT id, total, status, created_at FROM client_orders
    WHERE team_id = ${u.team_id} AND customer_id = ${cid} ORDER BY created_at DESC LIMIT 20` as any[];
  return NextResponse.json({
    ledger, claims, vouchers, orders, kampane, uroven,
    clen: {
      points: Number(m.points) || 0, stamps: kampane.length ? kampane.reduce((a, k) => a + (Number(k.stamps) || 0), 0) : Number(m.stamps) || 0, visits: Number(m.visits) || 0,
      spend: Number(m.spend) || 0, credit: Number(m.credit) || 0, joined_at: m.joined_at, last_visit_at: m.last_visit_at,
    },
  });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj(['vernost.upravit_body', 'vernost.kredit_upravit']);
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  // Kredit jsou peníze hosta u podniku, body jen odměna — ruční zásah do
  // kreditu je proto samostatné oprávnění.
  const klic = b.what === 'credit' ? 'vernost.kredit_upravit' : 'vernost.upravit_body';
  if (!ctx.role.opravneni.has(klic)) {
    return NextResponse.json({ error: b.what === 'credit' ? 'Upravovat kredit hostů nemáš povoleno.' : 'Upravovat body hostů nemáš povoleno.' }, { status: 403 });
  }
  // Jednorázové dopočtení útraty všem členům z objednávek a účtenek (jen tam, kde je útrata nulová).
  if (b.what === 'spend_backfill') {
    const upraveno = await dopocitejUtratu(u.team_id);
    audit(u.team_id, u.id, 'client.spend', 'client', null, `dopočtena útrata ${upraveno} členům`);
    return NextResponse.json({ ok: true, updated: upraveno });
  }
  const cid = parseInt(String(b.customerId), 10);
  const delta = Math.max(-100000, Math.min(100000, parseInt(String(b.delta), 10) || 0));
  if (!cid || !delta) return NextResponse.json({ error: 'Kolik bodů a komu?' }, { status: 400 });
  const [m] = await sql`SELECT id, points, credit FROM client_memberships WHERE customer_id = ${cid} AND team_id = ${u.team_id}`;
  if (!m) return NextResponse.json({ error: 'Tenhle host není členem podniku.' }, { status: 404 });
  const note = String(b.note ?? '').slice(0, 120) || null;
  // Ruční úprava kumulované útraty (oprava, převod z jiné aplikace). Do deníku jde řádek bez bodů.
  if (b.what === 'spend') {
    const spend = await upravUtratu(u.team_id, cid, delta);
    if (spend == null) return NextResponse.json({ error: 'Tenhle host není členem podniku.' }, { status: 404 });
    await sql`
      INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note)
      VALUES (${u.team_id}, ${cid}, 0, 'manual', 'spend', ${`Útrata ${delta > 0 ? '+' : ''}${delta}${note ? ` — ${note}` : ''}`.slice(0, 200)})`;
    audit(u.team_id, u.id, 'client.spend', 'client', cid, `útrata ${delta > 0 ? '+' : ''}${delta} → ${spend}`);
    return NextResponse.json({ ok: true, spend });
  }
  const [host] = await sql`SELECT name FROM users WHERE id = ${cid}`;
  const jmeno = String(host?.name ?? `host ${cid}`);
  const duvod = note ? ` — ${note}` : '';
  // Stejným koncovým bodem se dá upravit i kredit — obsluha ho u kasy odečítá.
  // Odečet jde přes atomické spendCredit / spendPoints: víc, než host má, odečíst nejde
  // (dřív se zůstatek ořízl na nulu, ale do deníku se zapsal celý odečet, takže se rozešly).
  if (b.what === 'credit') {
    const mena = await menaPodniku(u.team_id);
    const mel = Number(m.credit) || 0;
    // Odepsat víc, než host má, nejde: dřív se zůstatek potichu ořízl na nulu a deník lhal.
    // Odečet jde přes atomické spendCredit, takže ani souběh dvou úprav nepřečerpá zůstatek.
    const neniDost = () => NextResponse.json({ error: `${jmeno} má kredit jen ${mena.money(mel)}, víc odepsat nejde.` }, { status: 409 });
    if (delta < 0 && -delta > mel) return neniDost();
    let r: { credit: number; change: number };
    if (delta < 0) {
      const po = await spendCredit(u.team_id, cid, -delta, 'credit', null, note);
      if (po == null) return neniDost();
      r = { credit: po, change: delta };
    } else r = await awardCreditDetail(u.team_id, cid, delta, 'credit', null, note);
    audit(u.team_id, u.id, 'client.credit', 'client', cid, `${jmeno}: ${r.change > 0 ? '+' : ''}${mena.money(r.change)} (${mena.money(mel)} → ${mena.money(r.credit)})${duvod}`);
    return NextResponse.json({ ok: true, credit: r.credit, change: r.change });
  }
  const mel = Number(m.points) || 0;
  const neniDost = () => NextResponse.json({ error: `${jmeno} má jen ${cisloCs(mel)} b., víc odepsat nejde.` }, { status: 409 });
  if (delta < 0 && -delta > mel) return neniDost();
  let r: { points: number; change: number };
  if (delta < 0) {
    const po = await spendPoints(u.team_id, cid, -delta, 'manual', null, note);
    if (po == null) return neniDost();
    r = { points: po, change: delta };
  } else r = await awardDetail(u.team_id, cid, delta, 'manual', null, note);
  audit(u.team_id, u.id, 'client.points', 'client', cid, `${jmeno}: ${r.change > 0 ? '+' : ''}${r.change} b. (${mel} → ${r.points})${duvod}`);
  return NextResponse.json({ ok: true, points: r.points, change: r.change });
}
