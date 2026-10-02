// Kartička u kasy. Obsluha načte QR nebo opíše kód, uvidí, kdo to je a co má,
// a jedním klepnutím dá razítko za návštěvu nebo body za útratu. Razítko
// nejvýš jedno denně; body podle pravidel podniku (bodů za 100 Kč).
import { NextRequest, NextResponse } from 'next/server';
import { tierForMember, tierRulesFromProfile } from '@/lib/clientSlots';
import { slevaClena } from '@/lib/urovneDb';
import { sql, customerByCard, ensureProfile, join, membership, spendCredit, stampVisit, normalizeCardCode } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { pragueToday, pragueDayOf, parseDbTime } from '@/lib/pragueTime';
import { audit } from '@/lib/audit';
import { activeCampaigns, progressFor, addStamps, applyBillToCampaigns } from '@/lib/stamps';
import { getConnection, billDetail } from '@/lib/storyous';
import { menaPodniku } from '@/lib/menaPodniku';
import { benefitLabel } from '@/lib/coupons';
import { aktivniBonus } from '@/lib/bonusAkceDb';
import { poznamkaRazitek } from '@/lib/bonusAkce';
import { odmenZaUtratu, zkontrolujUroven } from '@/lib/bodyPravidlaDb';
import { pravidlaZProfilu, vypocitejOdmenu, castKreditem, type PolozkaUctu } from '@/lib/bodyPravidla';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Co obsluha u kasy potřebuje vidět: kdo to je, co má a na co má nárok. */
async function summary(teamId: number, customerId: number, p?: any) {
  const m = await membership(customerId, teamId);
  const mena = await menaPodniku(teamId);
  // Kupony čekající na uplatnění; `stamps` = odměna za plnou razítkovou kartu (hotová k vyzvednutí).
  const claimRows = await sql`
    SELECT cl.code, c.title, c.kind, c.valid_until, c.benefit_kind, c.percent_off, c.amount_off, c.xy_buy, c.xy_free
    FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id
    WHERE cl.team_id = ${teamId} AND cl.customer_id = ${customerId} AND cl.redeemed_at IS NULL ORDER BY cl.claimed_at` as any[];
  const claims = claimRows.map(r => ({
    code: String(r.code), title: String(r.title), kind: String(r.kind ?? 'offer'), fromStamps: r.kind === 'stamps',
    validUntil: r.valid_until ?? null, benefit: benefitLabel(r, mena.money) || null,
  }));
  // Narozeniny dnes: stejné pravidlo jako denní dárek (měsíc a den z data narození, pražský den).
  let birthdayToday = false;
  try {
    const [u] = await sql`SELECT birthday FROM users WHERE id = ${customerId}`;
    birthdayToday = !!u?.birthday && String(u.birthday).slice(5, 10) === pragueToday().slice(5);
  } catch { birthdayToday = false; }
  // Kupony za body, na které host právě teď dosáhne — obsluha je nabídne.
  const points = Number(m?.points ?? 0);
  const affordable = await sql`
    SELECT id, title, cost_points FROM client_coupons
    WHERE team_id = ${teamId} AND active = TRUE AND kind = 'offer' AND cost_points > 0 AND cost_points <= ${points}
    ORDER BY cost_points DESC LIMIT 5`;
  const last = parseDbTime(m?.last_visit_at);
  const visits = Number(m?.visits ?? 0);
  const tier = tierForMember({ visits, spend: Number(m?.spend ?? 0), lastVisitAt: m?.last_visit_at }, p ? tierRulesFromProfile(p) : null);
  // Sleva = nejvyšší z úrovně a slev skupin (nikdy součet); obsluha vidí i zdroj.
  const sleva = await slevaClena(teamId, customerId, tier);
  const camps = await activeCampaigns(teamId, pragueToday());
  const prog = camps.length ? await progressFor(teamId, customerId) : new Map();
  return {
    member: !!m, points, credit: Number(m?.credit ?? 0), stamps: Number(m?.stamps ?? 0), visits,
    campaigns: camps.map(c => ({
      id: c.id, name: c.name, required: c.required_stamps, ruleType: c.rule_type,
      stamps: Number(prog.get(c.id)?.stamps ?? 0), reward: c.reward_title || null,
    })),
    lastVisit: last ? last.toISOString() : null, birthdayToday,
    spend: Number(m?.spend ?? 0), tierBy: tier.unit,
    levelLabel: tier.label, tier: tier.id, discount: sleva.pct, discountSource: sleva.zdroj, discountName: sleva.nazev,
    tierDiscount: tier.discount,
    nextTierAt: tier.nextAt, nextTierLabel: tier.nextLabel, nextTierUnit: tier.unit,
    stampedToday: !!last && pragueDayOf(last) === pragueToday(),
    openCoupons: claims, affordable,
  };
}

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.karta');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const code = normalizeCardCode(String(new URL(req.url).searchParams.get('code') ?? ''));
  if (!code) return NextResponse.json({ error: 'Kód má osm znaků.' }, { status: 400 });
  const c = await customerByCard(code);
  if (!c) return NextResponse.json({ error: 'Takovou kartičku neznáme.' }, { status: 404 });
  const p = await ensureProfile(u.team_id);
  // Poslední dnešní účtenky z pokladny: obsluha částku vybere, nemusí ji
  // opisovat. Body a kredit pak sedí s tím, co host opravdu zaplatil.
  let bills: any[] = [];
  try {
    bills = await sql`
      SELECT bill_id, final_price, paid_at FROM pos_bills
      WHERE team_id = ${u.team_id} AND day = ${pragueToday()} AND final_price > 0 AND refunded = FALSE AND deleted = FALSE
      ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 5` as any[];
  } catch { bills = []; }
  return NextResponse.json({
    customer: c, ...(await summary(u.team_id, c.id, p)), bills,
    rules: {
      pointsPer100: Number(p.points_per_100) || 0, stampTarget: Number(p.stamp_target) || 0,
      stampReward: p.stamp_reward, cashbackPct: Number(p.cashback_pct) || 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj(['vernost.karta', 'vernost.body_z_castky', 'vernost.platba_kreditem']);
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const c = await customerByCard(String(b.code ?? ''));
  if (!c) return NextResponse.json({ error: 'Takovou kartičku neznáme.' }, { status: 404 });
  const action = String(b.action ?? '');
  // Razítko a připsání z účtenky jsou běžná práce u kasy; body z ručně
  // zadané částky a placení kreditem hýbou penězi hosta, a tak mají svá
  // oprávnění. Kontroluje se dřív, než se host stane členem (join níž).
  const klic = action === 'points' ? 'vernost.body_z_castky' : action === 'credit' ? 'vernost.platba_kreditem' : 'vernost.karta';
  if (!ctx.role.opravneni.has(klic)) {
    return NextResponse.json({ error: action === 'credit' ? 'Platbu kreditem nemáš povolenou.' : action === 'points' ? 'Připisovat body z částky nemáš povoleno.' : 'Pracovat s kartičkou hosta nemáš povoleno.' }, { status: 403 });
  }
  const p = await ensureProfile(u.team_id);
  if (!p.loyalty_on) return NextResponse.json({ error: 'Podnik nemá věrnost zapnutou.' }, { status: 400 });
  await join(c.id, u.team_id);
  // Čtečka u kasy: host není členem podniku, obsluha ho jedním klepnutím přidá (bez razítka a bodů).
  if (action === 'join') {
    const x = await summary(u.team_id, c.id, p);
    const zprava = `${c.name} je teď členem.`;
    audit(u.team_id, u.id, 'client.card', 'client', c.id, zprava);
    return NextResponse.json({ ok: true, message: zprava, customer: c, ...x });
  }
  // Zprávy obsluze i poznámky v paměti hosta jsou v měně podniku, ne v korunách.
  const mena = await menaPodniku(u.team_id);
  // Bonusová akce (Happy hour) platí v okamžiku načtení; uplatní se uvnitř téhož připsání.
  const bonus = await aktivniBonus(u.team_id);
  let msg = '';
  if (action === 'stamp') {
    const before = await summary(u.team_id, c.id);
    if (before.stampedToday) return NextResponse.json({ error: `${c.name} dnes razítko už má.` }, { status: 409 });
    // Kampaně „za návštěvu": razítko dostane každá; návštěvu počítá stampVisit.
    const visitCamps = (await activeCampaigns(u.team_id, pragueToday())).filter(x => x.rule_type === 'visit');
    if (visitCamps.length) {
      // Návštěva a starý čítač se posunou (kvůli úrovním a dennímu zámku),
      // ale odměnu řídí kampaně — starý cíl vypneme nulou, ať se nezdvojí.
      await stampVisit(u.team_id, c.id, { ...p, stamp_target: 0 }, 'card');
      const parts2: string[] = [];
      for (const vc of visitCamps) {
        const r = await addStamps(vc, c.id, 1 + bonus.razitka, 'card', poznamkaRazitek(bonus));
        if (r.skipped) { parts2.push(`${vc.name}: ${r.skipped}`); continue; }
        parts2.push(r.completions > 0 ? `${vc.name}: karta plná — odměna je v kuponech` : `${vc.name}: ${r.stamps}/${vc.required_stamps}`);
      }
      msg = `${c.name}: ${parts2.join(' · ')}`;
    } else {
      const r = await stampVisit(u.team_id, c.id, p, 'card', bonus.razitka, poznamkaRazitek(bonus));
      msg = r.rewarded ? `${c.name}: razítka kompletní, odměna „${p.stamp_reward}" je v kuponech.` : `${c.name}: razítko ${r.stamps}/${p.stamp_target}.`;
    }
  } else if (action === 'bill') {
    // Připsání Z ÚČTENKY: razítka podle pravidel kampaní z položek účtu +
    // body a cashback z částky. Účtenka smí věrnost připsat jen jednou.
    const billId = String(b.billId ?? '').slice(0, 60);
    if (!billId) return NextResponse.json({ error: 'Vyber účtenku.' }, { status: 400 });
    // Zrušená nebo vrácená účtenka věrnost nepřipíše (u už připsaných se body vrací samy po synchronizaci).
    try {
      const [bs] = await sql`SELECT refunded, deleted FROM pos_bills WHERE team_id = ${u.team_id} AND bill_id = ${billId}` as any[];
      if (bs?.refunded || bs?.deleted) return NextResponse.json({ error: 'Tahle účtenka byla v pokladně zrušena nebo vrácena.' }, { status: 409 });
    } catch { /* zrcadlo účtenek ještě není */ }
    const guard = await sql`
      INSERT INTO client_bill_awards (team_id, bill_id, customer_id)
      VALUES (${u.team_id}, ${billId}, ${c.id})
      ON CONFLICT (team_id, bill_id) DO NOTHING RETURNING bill_id`;
    if (!guard.length) return NextResponse.json({ error: 'Tahle účtenka už věrnost připsala.' }, { status: 409 });
    const conn = await getConnection(u.team_id);
    let items: { productId: string | null; qty: number }[] = [];
    let polozky: PolozkaUctu[] = [];
    let kreditem = 0;
    let total = Math.max(0, Math.round(Number(b.amount) || 0));
    if (conn) {
      try {
        const d = await billDetail(conn, billId);
        items = d.items.map(it => ({ productId: it.productId, qty: Number(it.amount) || 1 }));
        polozky = d.items.map(it => ({ productId: it.productId, categoryId: it.categoryId, castka: (Number(it.price) || 0) * (Number(it.amount) || 0) }));
        kreditem = castKreditem(d.head?.buckets?.methods);
        if (d.head?.finalPrice != null) total = Math.max(0, Math.round(Number(d.head.finalPrice)));
      } catch { /* detail nedostupný — zbude útrata */ }
    }
    const parts: string[] = [];
    const st = await applyBillToCampaigns(u.team_id, c.id, pragueToday(), { billId, total, items }, { razitka: bonus.razitka, poznamka: poznamkaRazitek(bonus) });
    parts.push(...st.lines);
    // Body, cashback i útrata pro úrovně: jedno místo s pravidly podniku (minimum, vyloučené položky,
    // část placená kreditem, zaokrouhlení, násobič, stropy). Deník nese odkaz na účtenku.
    const res = await odmenZaUtratu({
      teamId: u.team_id, customerId: c.id, profil: p, castka: total, zdroj: 'bill', ref: `bill:${billId}`,
      popis: `Útrata ${mena.money(total)} z účtenky`, polozky, zaplacenoKreditem: kreditem, bonus, money: mena.money,
    });
    parts.push(...res.casti);
    if (!parts.length) parts.push('žádné pravidlo se netrefilo');
    msg = `${c.name} · účtenka ${mena.money(total)}: ${parts.join(' · ')}`;
  } else if (action === 'points') {
    const amount = Math.max(0, Math.min(100000, Math.round(Number(b.amount) || 0)));
    const podleUtraty = p.tier_by === 'spend';
    // Předem se pozná, že z částky nic nevyjde (minimum, nulové sazby), ať obsluha nezapisuje naprázdno.
    const pre = vypocitejOdmenu({ castka: amount, uroven: 'bronze', bonusNasobic: bonus.nasobic, bonusNazev: bonus.nazev }, pravidlaZProfilu(p));
    if (amount <= 0 || (pre.body <= 0 && pre.cashback <= 0 && !podleUtraty)) {
      return NextResponse.json({ error: amount <= 0 ? 'Zadej částku útraty.' : `Z této částky nevychází žádný bod ani kredit${pre.poznamky.length ? ` (${pre.poznamky.join(', ')})` : ''}.` }, { status: 400 });
    }
    const res = await odmenZaUtratu({
      teamId: u.team_id, customerId: c.id, profil: p, castka: amount, zdroj: 'card', ref: 'card',
      popis: `Útrata ${mena.money(amount)} u kasy`, bonus, money: mena.money,
    });
    const parts = res.casti.length ? res.casti : ['útrata zapsána'];
    msg = `${c.name}: ${parts.join(', ')} za ${mena.money(amount)}.`;
  } else if (action === 'credit') {
    // Host platí kreditem: částka se odečte z jeho peněženky u podniku.
    const amount = Math.max(1, Math.min(100000, Math.round(Number(b.amount) || 0)));
    // Atomicky: odečte se jen když kredit stačí. Dvojklik u kasy tak
    // nepřečerpá zůstatek (dřív GREATEST(0,…) přečerpání jen skrylo).
    const credit = await spendCredit(u.team_id, c.id, amount, 'credit', 'card', `Uplatněno u kasy`);
    if (credit == null) {
      const m = await membership(c.id, u.team_id);
      return NextResponse.json({ error: `${c.name} má kredit jen ${mena.money(Number(m?.credit ?? 0))}.` }, { status: 409 });
    }
    msg = `${c.name}: uplatněno ${mena.money(amount)} kreditu, zbývá ${mena.money(Number(credit))}.`;
  } else {
    return NextResponse.json({ error: 'Neznámá akce' }, { status: 400 });
  }
  // Razítko za návštěvu mohlo posunout úroveň (podle návštěv): oznámení hostovi, jednou.
  if (action !== 'credit') await zkontrolujUroven(u.team_id, c.id, p).catch(() => {});
  audit(u.team_id, u.id, 'client.card', 'client', c.id, msg);
  return NextResponse.json({ ok: true, message: msg, customer: c, ...(await summary(u.team_id, c.id, p)) });
}
