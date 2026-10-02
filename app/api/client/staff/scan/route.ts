// Kartička u kasy. Obsluha načte QR nebo opíše kód, uvidí, kdo to je a co má,
// a jedním klepnutím dá razítko za návštěvu nebo body za útratu. Razítko
// nejvýš jedno denně; body podle pravidel podniku (bodů za 100 Kč).
//
// Integrita: každá akce se zabere (client_scan_actions) — stejný klíč
// Idempotency-Key nebo stejná akce téhož hosta do 5 s se podruhé nepřipíše.
// Připsání z účtenky jde po krocích a hotové kroky se při opakování přeskočí.
// Do deníku věrnosti se zapisuje i obsluha (staff_id).
import { NextRequest, NextResponse } from 'next/server';
import { tierForMember, tierRulesFromProfile } from '@/lib/clientSlots';
import { pripisUtratu, slevaClena } from '@/lib/urovneDb';
import { sql, customerByCard, ensureProfile, join, membership, award, awardCredit, spendCredit, stampVisit, normalizeCardCode } from '@/lib/client';
import { zajistiRazitka } from '@/lib/stampsSchema';
import { otiskAkce, spustKrok } from '@/lib/stampsPlan';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { pragueToday, pragueDayOf, parseDbTime } from '@/lib/pragueTime';
import { audit } from '@/lib/audit';
import { activeCampaigns, progressFor, applyBillToCampaigns, hostKarta } from '@/lib/stamps';
import { getConnection, billDetail } from '@/lib/storyous';
import { menaPodniku } from '@/lib/menaPodniku';
import { benefitLabel } from '@/lib/coupons';
import { aktivniBonus } from '@/lib/bonusAkceDb';
import { bodySBonusem, poznamkaRazitek, popisNasobice } from '@/lib/bonusAkce';
import { odmenaZUctu } from '@/lib/bodyPravidlaDb';
import { vetyOOmezeni, pravidlaBoduZProfilu } from '@/lib/bodyPravidla';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Položky nabídky, které dávají razítko v běžících kampaních (vybrané položky a položky vybraných
 * kategorií, bez vyloučených) — obsluha je může zadat ručně, když účtenka v pokladně není.
 */
async function polozkyKampani(teamId: number, camps: StampCampaign[]): Promise<{ id: number; name: string }[]> {
  const prod = camps.filter(c => c.rule_type === 'products');
  if (!prod.length) return [];
  const ids = Array.from(new Set(prod.flatMap(c => c.stamp_items.map(i => i.itemId))));
  const sekce = Array.from(new Set(prod.flatMap(c => c.stamp_sections.map(i => i.sectionId))));
  const vyloucene = new Set(prod.flatMap(c => c.excluded_items.map(i => i.itemId)));
  if (!ids.length && !sekce.length) return [];
  try {
    const rows = await sql`
      SELECT mi.id, mi.name FROM menu_items mi
      JOIN menu_sections ms ON ms.id = mi.section_id
      JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${teamId}
      WHERE mi.id = ANY(${ids}) OR mi.section_id = ANY(${sekce})
      ORDER BY mi.name LIMIT 80`;
    return (rows as any[]).filter(r => !vyloucene.has(Number(r.id))).map(r => ({ id: Number(r.id), name: String(r.name) }));
  } catch { return []; }
}

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
  const dnes = pragueToday();
  const camps = await activeCampaigns(teamId, dnes);
  const prog = camps.length ? await progressFor(teamId, customerId) : new Map();
  // Poslední akce s razítky (pro tlačítko Storno) a položky, které dávají razítko (pro ruční zadání).
  let posledniAkce: { note: string; at: string } | null = null;
  try {
    await zajistiRazitka();
    const [e] = await sql`SELECT note, created_at FROM client_stamp_events WHERE team_id = ${teamId} AND customer_id = ${customerId} AND undone_at IS NULL AND delta <> 0 ORDER BY id DESC LIMIT 1`;
    if (e) posledniAkce = { note: String(e.note ?? 'Razítka'), at: (parseDbTime(e.created_at) ?? new Date()).toISOString() };
  } catch { posledniAkce = null; }
  const polozky = await polozkyKampani(teamId, camps);
  return {
    member: !!m, points, credit: Number(m?.credit ?? 0), stamps: Number(m?.stamps ?? 0), visits,
    campaigns: camps.map(c => ({
      id: c.id, name: c.name, required: c.required_stamps, ruleType: c.rule_type,
      stamps: Number(prog.get(c.id)?.stamps ?? 0), reward: c.reward_title || null,
      // Karta, která vypršela (nedosbíraná včas), se obsluze ukáže, ať hostovi umí říct proč.
      expiredCount: hostKarta(c, prog.get(c.id)).expiredCount,
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
      SELECT b.bill_id, b.final_price, b.paid_at,
             EXISTS (SELECT 1 FROM client_bill_awards a WHERE a.team_id = b.team_id AND a.bill_id = b.bill_id) AS awarded
      FROM pos_bills b
      WHERE b.team_id = ${u.team_id} AND b.day = ${pragueToday()} AND b.final_price > 0
      ORDER BY COALESCE(b.paid_at, b.created_at) DESC LIMIT 5` as any[];
  } catch { bills = []; }
  return NextResponse.json({
    customer: c, ...(await summary(u.team_id, c.id, p)), bills,
    rules: {
      pointsPer100: Number(p.points_per_100) || 0, stampTarget: Number(p.stamp_target) || 0,
      stampReward: p.stamp_reward, cashbackPct: Number(p.cashback_pct) || 0,
      bodyPravidla: pravidlaBoduZProfilu(p),
    },
  });
}

/** Položky zadané ručně (itemId nabídky + počet) — pro kampaň „za položky" bez účtenky. */
function rucniPolozky(raw: any): { itemId: number; qty: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { itemId: number; qty: number }[] = [];
  for (const x of raw.slice(0, 50)) {
    const itemId = Math.round(Number(x?.itemId)); const qty = Math.round(Number(x?.qty));
    if (itemId > 0 && qty >= 1 && qty <= 99) out.push({ itemId, qty });
  }
  return out;
}

/**
 * Zabere akci před provedením. Vrací id řádku, nebo null, když stejná akce téhož
 * hosta právě proběhla: buď přišel stejný klíč Idempotency-Key (opakování po
 * výpadku, dvojklik), nebo stejný otisk akce do 5 s. Jedinečné indexy rozhodnou
 * i souběžné požadavky; NOT EXISTS hlídá hranici pětisekundových košů.
 */
async function zaberAkci(teamId: number, customerId: number, staffId: number, akce: string, klic: string | null, otisk: string): Promise<number | null> {
  const [r] = await sql`
    INSERT INTO client_scan_actions (team_id, customer_id, staff_id, action, idem_key, fingerprint, bucket)
    SELECT ${teamId}::int, ${customerId}::int, ${staffId}::int, ${akce}::text, ${klic}::text, ${otisk}::text, FLOOR(EXTRACT(EPOCH FROM NOW()) / 5)::bigint
    WHERE NOT EXISTS (
      SELECT 1 FROM client_scan_actions
      WHERE team_id = ${teamId} AND customer_id = ${customerId} AND fingerprint = ${otisk}
        AND created_at > NOW() - INTERVAL '5 seconds')
    ON CONFLICT DO NOTHING
    RETURNING id`;
  // Úklid starých řádků jednou za čas — tabulka nemá růst donekonečna.
  if (Math.random() < 0.02) await sql`DELETE FROM client_scan_actions WHERE created_at < NOW() - INTERVAL '2 days'`.catch(() => {});
  return r ? Number(r.id) : null;
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj(['vernost.karta', 'vernost.body_z_castky', 'vernost.platba_kreditem']);
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const c = await customerByCard(String(b.code ?? ''));
  if (!c) return NextResponse.json({ error: 'Takovou kartičku neznáme.' }, { status: 404 });
  const action = String(b.action ?? '');
  // Razítko, storno a připsání z účtenky jsou běžná práce u kasy; body z ručně
  // zadané částky a placení kreditem hýbou penězi hosta, a tak mají svá
  // oprávnění. Kontroluje se dřív, než se host stane členem (join níž).
  const klic = action === 'points' ? 'vernost.body_z_castky' : action === 'credit' ? 'vernost.platba_kreditem' : 'vernost.karta';
  if (!ctx.role.opravneni.has(klic)) {
    return NextResponse.json({ error: action === 'credit' ? 'Platbu kreditem nemáš povolenou.' : action === 'points' ? 'Připisovat body z částky nemáš povoleno.' : 'Pracovat s kartičkou hosta nemáš povoleno.' }, { status: 403 });
  }
  if (!['stamp', 'bill', 'points', 'credit', 'join'].includes(action)) return NextResponse.json({ error: 'Neznámá akce' }, { status: 400 });
  const p = await ensureProfile(u.team_id);
  if (!p.loyalty_on) return NextResponse.json({ error: 'Podnik nemá věrnost zapnutou.' }, { status: 400 });
  await zajistiRazitka();
  await join(c.id, u.team_id);
  // Čtečka u kasy: host není členem podniku, obsluha ho jedním klepnutím přidá (bez razítka a bodů).
  if (action === 'join') {
    const x = await summary(u.team_id, c.id, p);
    const zprava = `${c.name} je teď členem.`;
    audit(u.team_id, u.id, 'client.card', 'client', c.id, zprava);
    return NextResponse.json({ ok: true, message: zprava, customer: c, ...x });
  }

  // Idempotence: klíč z UI (volitelný) a otisk akce. Opakovaná akce se nepřipíše podruhé.
  const idemKey = String(req.headers.get('idempotency-key') ?? b.idemKey ?? '').trim().slice(0, 80) || null;
  const akceId = await zaberAkci(u.team_id, c.id, u.id, action, idemKey, otiskAkce(action, b));
  if (akceId == null) {
    return NextResponse.json({
      ok: true, duplicate: true, message: `${c.name}: stejná akce právě proběhla, podruhé se nepřipsala.`,
      customer: c, ...(await summary(u.team_id, c.id, p)),
    });
  }
  let res: NextResponse;
  try { res = await provedAkci(action, b, c, u, p, akceId); }
  catch (e) {
    await sql`DELETE FROM client_scan_actions WHERE id = ${akceId}`.catch(() => {});
    throw e;
  }
  // Neúspěšná akce nic nespotřebovala — oprava vstupu (částka, účtenka) nesmí narazit na pětisekundový zámek.
  if (res.status >= 400) await sql`DELETE FROM client_scan_actions WHERE id = ${akceId}`.catch(() => {});
  return res;
}

async function provedAkci(action: string, b: any, c: { id: number; name: string }, u: { id: number; team_id: number }, p: any, akceId: number): Promise<NextResponse> {
  // Zprávy obsluze i poznámky v paměti hosta jsou v měně podniku, ne v korunách.
  const mena = await menaPodniku(u.team_id);
  const ref = `scan:${akceId}`;
  // Bonusová akce (Happy hour) platí v okamžiku načtení; uplatní se uvnitř téhož připsání.
  const bonus = await aktivniBonus(u.team_id);
  let msg = '';
  // Co čtečka ukazuje navíc: vypršelé karty a razítka, která se nevešla.
  let expiredCount = 0; let lost = 0;
  const dnes = pragueToday();
  if (action === 'stamp') {
    // Návštěva + razítko každé kampani „za návštěvu" (nebo staré razítko, když kampaně nejsou).
    // Denní zámek je v jednom UPDATE — souběh dvou skenů proběhne jednou, druhý dostane already.
    const r = await stampVisit(u.team_id, c.id, p, 'card', bonus.razitka, poznamkaRazitek(bonus), u.id);
    if (r.already) return NextResponse.json({ error: `${c.name} dnes razítko už má.` }, { status: 409 });
    if (r.lines) msg = `${c.name}: ${r.lines.join(' · ')}`;
    else msg = r.rewarded ? `${c.name}: razítka kompletní, odměna „${p.stamp_reward}" je v kuponech.` : `${c.name}: razítko ${r.stamps}/${p.stamp_target}.`;
  } else if (action === 'bill') {
    // Připsání Z ÚČTENKY: razítka podle pravidel kampaní z položek účtu +
    // body a cashback z částky + návštěva. Účtenka smí věrnost připsat jen jednou.
    // Zápis jde po krocích (kroky hlídá guard): spadne-li něco uprostřed, další pokus
    // dokončí jen to, co chybí — nic se nezdvojí a účtenka není spotřebovaná naprázdno.
    const billId = String(b.billId ?? '').slice(0, 60);
    if (!billId) return NextResponse.json({ error: 'Vyber účtenku.' }, { status: 400 });
    const guard = await sql`
      INSERT INTO client_bill_awards (team_id, bill_id, customer_id, done_at, kroky, staff_id)
      VALUES (${u.team_id}, ${billId}, ${c.id}, NULL, '', ${u.id})
      ON CONFLICT (team_id, bill_id) DO NOTHING RETURNING bill_id`;
    let hotove = new Set<string>();
    if (!guard.length) {
      // Dřívější pokus nedoběhl (a je starší než 30 s, tedy mrtvý)? Převezme se atomicky.
      const [navazu] = await sql`
        UPDATE client_bill_awards SET awarded_at = NOW(), staff_id = ${u.id}
        WHERE team_id = ${u.team_id} AND bill_id = ${billId} AND customer_id = ${c.id}
          AND done_at IS NULL AND awarded_at < NOW() - INTERVAL '30 seconds'
        RETURNING kroky`;
      if (!navazu) {
        const [cur] = await sql`SELECT done_at FROM client_bill_awards WHERE team_id = ${u.team_id} AND bill_id = ${billId}`;
        return NextResponse.json({ error: cur?.done_at ? 'Tahle účtenka už věrnost připsala.' : 'Účtenka se právě připisuje. Zkus to za půl minuty.' }, { status: 409 });
      }
      hotove = new Set(String(navazu.kroky ?? '').split(',').filter(Boolean));
    }
    const krok = (nazev: string, fn: () => Promise<void>) => spustKrok(hotove, nazev, fn, async n => {
      await sql`UPDATE client_bill_awards SET kroky = kroky || ${n + ','} WHERE team_id = ${u.team_id} AND bill_id = ${billId}`;
    });
    try {
      const conn = await getConnection(u.team_id);
      let items: { productId: string | null; qty: number; price: number | null }[] = [];
      let polozkyUctu: { productId: string | null; amount: number; price: number | null }[] = [];
      let total = Math.max(0, Math.round(Number(b.amount) || 0));
      if (conn) {
        try {
          const d = await billDetail(conn, billId);
          items = d.items.map(it => ({ productId: it.productId, qty: Number(it.amount) || 1, price: it.price }));
          polozkyUctu = d.items.map(it => ({ productId: it.productId, amount: it.amount, price: it.price }));
          if (d.head?.finalPrice != null) total = Math.max(0, Math.round(Number(d.head.finalPrice)));
        } catch { /* detail nedostupný — zbude útrata */ }
      }
      const parts: string[] = [];
      await krok('visit', async () => {
        // Účtenka je návštěva: roste počet návštěv (úrovně) a kampaně „za návštěvu" dostanou razítko, nejvýš jednou denně.
        const v = await stampVisit(u.team_id, c.id, p, `bill:${billId}`, 0, '', u.id);
        if (!v.already && v.lines) parts.push(...v.lines);
      });
      await krok('stamps', async () => {
        const st = await applyBillToCampaigns(u.team_id, c.id, pragueToday(), { billId, total, items }, { staffId: u.id, razitka: bonus.razitka, poznamka: poznamkaRazitek(bonus) });
        parts.push(...st.lines);
      });
      // Body a cashback podle pravidel podniku: zaokrouhlení, minimum, strop, kredit/poukaz a vyloučené položky.
      const { odmena: od, pravidla: pr } = await odmenaZUctu(u.team_id, p, total, { predplaceno: b.prepaid, polozky: polozkyUctu });
      const { body: pts, poznamka: bonusPozn } = bodySBonusem(od.points, bonus);
      const back = od.cashback;
      parts.push(...vetyOOmezeni(od, pr, mena.money));
      if (pts > 0) await krok('points', async () => { const points = await award(u.team_id, c.id, pts, 'manual', `bill:${billId}`, `Útrata ${mena.money(total)} z účtenky${bonusPozn}`, u.id); parts.push(`+${pts} bodů${bonus.nasobic > 1 ? ` (${popisNasobice(bonus.nasobic)}, ${bonus.nazev})` : ''} (celkem ${points})`); });
      // Cashback podle nastavení podniku: kredit v korunách, nebo body (Kartička).
      if (back > 0) {
        await krok('cashback', async () => {
          if (p.cashback_mode === 'points') {
            const points = await award(u.team_id, c.id, back, 'cashback', `bill:${billId}`, `${p.cashback_pct} % z ${mena.money(total)} v bodech`, u.id);
            parts.push(`+${back} bodů cashback (celkem ${points})`);
          } else { await awardCredit(u.team_id, c.id, back, 'cashback', `bill:${billId}`, `${p.cashback_pct} % z ${mena.money(total)}`, u.id); parts.push(`+${mena.money(back)} kreditu`); }
        });
      }
      // Útrata pro úrovně podle útraty se počítá z každé účtenky, i když nedala žádný bod.
      await krok('spend', async () => { await pripisUtratu(u.team_id, c.id, total); });
      await sql`UPDATE client_bill_awards SET done_at = NOW() WHERE team_id = ${u.team_id} AND bill_id = ${billId}`;
      if (!parts.length) parts.push('žádné pravidlo se netrefilo');
      msg = `${c.name} · účtenka ${mena.money(total)}: ${parts.join(' · ')}`;
    } catch {
      // Hotové kroky zůstávají zapsané; ať jde pokus hned zopakovat, guard se uvolní k převzetí.
      await sql`UPDATE client_bill_awards SET awarded_at = NOW() - INTERVAL '1 minute' WHERE team_id = ${u.team_id} AND bill_id = ${billId} AND done_at IS NULL`.catch(() => {});
      return NextResponse.json({ error: 'Připsání se přerušilo. Načti účtenku znovu — co už se připsalo, se nezdvojí.' }, { status: 500 });
    }
  } else if (action === 'points') {
    const amount = Math.max(0, Math.min(100000, Math.round(Number(b.amount) || 0)));
    const polozky = rucniPolozky(b.items);
    const { odmena: od, pravidla: pr } = await odmenaZUctu(u.team_id, p, amount, { predplaceno: b.prepaid });
    const { body: pts, poznamka: bonusPozn } = bodySBonusem(od.points, bonus);
    const back = od.cashback;
    const omezeni = vetyOOmezeni(od, pr, mena.money);
    const podleUtraty = p.tier_by === 'spend';
    // Kampaně „za útratu" a „za položky" se spustí i z ruční částky a ručních položek.
    const kampane = (await activeCampaigns(u.team_id, pragueToday())).some(x => x.rule_type !== 'visit');
    if (amount <= 0 && !polozky.length) return NextResponse.json({ error: 'Zadej částku, nebo vyber položky.' }, { status: 400 });
    if (pts <= 0 && back <= 0 && !podleUtraty && !kampane) return NextResponse.json({ error: `Z této částky nevychází žádný bod ani kredit${omezeni.length ? ` (${omezeni.join('; ')})` : ''}.` }, { status: 400 });
    const parts: string[] = [];
    if (amount > 0) await pripisUtratu(u.team_id, c.id, amount);
    const v = await stampVisit(u.team_id, c.id, p, ref, 0, '', u.id);
    if (!v.already && v.lines) parts.push(...v.lines);
    const st = await applyBillToCampaigns(u.team_id, c.id, pragueToday(), { billId: ref, total: amount, items: [], rucniPolozky: polozky }, { staffId: u.id, razitka: bonus.razitka, poznamka: poznamkaRazitek(bonus) });
    parts.push(...st.lines);
    if (pts > 0) { const points = await award(u.team_id, c.id, pts, 'manual', ref, `Útrata ${mena.money(amount)} u kasy${bonusPozn}`, u.id); parts.push(`+${pts} bodů${bonus.nasobic > 1 ? ` (${popisNasobice(bonus.nasobic)}, ${bonus.nazev})` : ''} (celkem ${points})`); }
    if (back > 0 && p.cashback_mode === 'points') {
      const points = await award(u.team_id, c.id, back, 'cashback', ref, `${p.cashback_pct} % z útraty ${mena.money(amount)} v bodech`, u.id);
      parts.push(`+${back} bodů cashback (celkem ${points})`);
    } else if (back > 0) { const credit = await awardCredit(u.team_id, c.id, back, 'cashback', ref, `${p.cashback_pct} % z útraty ${mena.money(amount)}`, u.id); parts.push(`+${mena.money(back)} kreditu (celkem ${mena.money(Number(credit))})`); }
    if (!parts.length) parts.push('útrata zapsána');
    if (omezeni.length) parts.push(`(${omezeni.join('; ')})`);
    msg = `${c.name}: ${parts.join(', ')}${amount > 0 ? ` za ${mena.money(amount)}` : ''}.`;
  } else if (action === 'credit') {
    // Host platí kreditem: částka se odečte z jeho peněženky u podniku.
    const amount = Math.max(1, Math.min(100000, Math.round(Number(b.amount) || 0)));
    // Atomicky: odečte se jen když kredit stačí. Dvojklik u kasy tak
    // nepřečerpá zůstatek (dřív GREATEST(0,…) přečerpání jen skrylo).
    const credit = await spendCredit(u.team_id, c.id, amount, 'credit', ref, `Uplatněno u kasy`, u.id);
    if (credit == null) {
      const m = await membership(c.id, u.team_id);
      return NextResponse.json({ error: `${c.name} má kredit jen ${mena.money(Number(m?.credit ?? 0))}.` }, { status: 409 });
    }
    msg = `${c.name}: uplatněno ${mena.money(amount)} kreditu, zbývá ${mena.money(Number(credit))}.`;
  }
  audit(u.team_id, u.id, 'client.card', 'client', c.id, msg);
  return NextResponse.json({ ok: true, message: msg, expiredCount, lost, customer: c, ...(await summary(u.team_id, c.id, p)) });
}
