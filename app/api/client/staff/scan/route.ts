// Kartička u kasy. Obsluha načte QR nebo opíše kód, uvidí, kdo to je a co má,
// a jedním klepnutím dá razítko za návštěvu nebo body za útratu. Razítko
// nejvýš jedno denně; body podle pravidel podniku (bodů za 100 Kč).
//
// Integrita: stejný klíč Idempotency-Key dvakrát = jedna akce a druhé volání dostane
// původní odpověď (lib/idempotence.ts, tabulka client_kasa_idem). Každá akce se navíc
// zabere (client_scan_actions) — stejný klíč nebo stejná akce téhož hosta do 5 s se
// podruhé nepřipíše ani bez klíče.
// Připsání z účtenky jde po krocích a hotové kroky se při opakování přeskočí.
// Do deníku věrnosti se zapisuje i obsluha (staff_id).
import { zamerHosta } from '@/lib/klient/zamer';
import { NextRequest, NextResponse, after } from 'next/server';
import { tierForMember, tierRulesFromProfile } from '@/lib/clientSlots';
import { pripisUtratu, slevaClena } from '@/lib/urovneDb';
import { pripisZUctu, zalozParovani, stolyKParovani, synchronizujPoSkenu } from '@/lib/vernostZUctu';
import { sql, najdiKartu, ensureProfile, join, membership, award, awardCredit, spendCredit, stampVisit, jeClenBlokovan } from '@/lib/client';
import { vypadaJakoKarta, zobrazitelnyKod, HLASKA_BLOKOVANA, HLASKA_CIZI_NOVA } from '@/lib/kartyFyzicke';
import { zajistiRazitka } from '@/lib/stampsSchema';
import { otiskAkce, platiTed as platiTedPlan } from '@/lib/stampsPlan';
import { sIdempotenci } from '@/lib/idempotence';
import { stavKartyHosta, popisOkna } from '@/lib/razitkaPravidla';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { pragueToday, pragueDayOf, pragueHM, parseDbTime } from '@/lib/pragueTime';
import { audit } from '@/lib/audit';
import { activeCampaigns, progressFor, applyBillToCampaigns, isoDow, prubehHosta, navstevniKampane, maKampane, type StampCampaign } from '@/lib/stamps';
import { getConnection } from '@/lib/storyous';
import { menaPodniku } from '@/lib/menaPodniku';
import { benefitLabel } from '@/lib/coupons';
import { aktivniBonus } from '@/lib/bonusAkceDb';
import { poznamkaRazitek } from '@/lib/bonusAkce';
import { odmenaZUctu, zapisZbytek } from '@/lib/bodyPravidlaDb';
import { vetyOOmezeni, pravidlaBoduZProfilu } from '@/lib/bodyPravidla';
import { cisloUctenky, klicRucniUctenky } from '@/lib/kasaStorno';
import { stornujPosledniAkci, posledniStornovatelna } from '@/lib/kasaStornoDb';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
// Po skenu v podniku s pokladnou běží na pozadí synchronizace Storyous (rozpočet 35 s).
export const maxDuration = 60;

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
/** Název podniku na kartě hosta ve čtečce (jako ho vidí host: název ze sdíleného vzhledu, jinak tým). */
async function nazevPodniku(teamId: number): Promise<string | null> {
  try {
    const [t] = await sql`SELECT COALESCE(NULLIF(share_theme->>'businessName', ''), name) AS nazev FROM teams WHERE id = ${teamId}` as any[];
    return t?.nazev ? String(t.nazev) : null;
  } catch { return null; }
}

async function summary(teamId: number, customerId: number, p?: any) {
  const m = await membership(customerId, teamId);
  const mena = await menaPodniku(teamId);
  // Kupony čekající na uplatnění; `stamps` = odměna za plnou razítkovou kartu (hotová k vyzvednutí).
  const claimRows = await sql`
    SELECT cl.code, c.title, c.kind, c.valid_until, c.benefit_kind, c.percent_off, c.amount_off, c.xy_buy, c.xy_free,
           (SELECT mi.name FROM menu_items mi WHERE mi.id = c.menu_item_id) AS menu_item_name
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
    WHERE team_id = ${teamId} AND active = TRUE AND kind = 'offer' AND draft = FALSE AND archived_at IS NULL AND cost_points > 0 AND cost_points <= ${points}
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
    campaigns: camps.map(c => {
      const pr = prog.get(c.id) ?? null;
      const st = stavKartyHosta(c, pr ? prubehHosta(pr) : null);
      const okno = platiTedPlan(c, isoDow(pragueToday()), pragueHM());
      return {
        id: c.id, name: c.name, required: c.required_stamps, ruleType: c.rule_type,
        stamps: st.stamps, reward: c.reward_title || null, completed: Number(pr?.completed ?? 0),
        // Karta, která vypršela (nedosbíraná včas), se obsluze ukáže, ať hostovi umí říct proč.
        expiredCount: st.vyprselaRazitek, vyprsela: st.vyprsela, vyprselaRazitek: st.vyprselaRazitek,
        platiTed: okno.plati, okno: popisOkna(c) || null, dosbiratDo: st.dosbiratDo, zbyvaDni: st.zbyvaDni,
        dalsiKartaOd: st.dalsiKartaOd, hotovoNavzdy: st.hotovoNavzdy,
        color: c.card_color,
      };
    }),
    // Poslední akce s razítky (tlačítko Storno) a položky, které dávají razítko (ruční zadání).
    posledniAkce: await posledniStornovatelna(teamId, customerId), polozky: await polozkyKampani(teamId, camps),
    lastVisit: last ? last.toISOString() : null, birthdayToday,
    spend: Number(m?.spend ?? 0), tierBy: tier.unit,
    levelLabel: tier.label, tier: tier.id, discount: sleva.pct, discountSource: sleva.zdroj, discountName: sleva.nazev,
    tierDiscount: tier.discount,
    nextTierAt: tier.nextAt, nextTierLabel: tier.nextLabel, nextTierUnit: tier.unit,
    stampedToday: !!last && pragueDayOf(last) === pragueToday(),
    openCoupons: claims, affordable,
    // Kolo 92 (kontrakt HOST ↔ SPRÁVA, kontrakt-ctecka.md §2a): odměna, kterou si host v „U kasy" přibalil
    // k tomuhle načtení. Čtečka z ní udělá hlavní akci („Razítko + uplatnit …"). Bez tabulky null.
    zamer: await zamerHosta(teamId, customerId),
    // Barva podniku pro kartu hosta ve čtečce (stejná karta, jakou host vidí v aplikaci).
    accent: p?.accent ? String(p.accent) : null,
    podnik: await nazevPodniku(teamId),
  };
}

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.karta');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  // Kartička z aplikace, plastová karta z dávky (lib/kartyFyzicke.ts) nebo číslo staré karty převzaté z Kartičky.
  const raw = String(new URL(req.url).searchParams.get('code') ?? '');
  if (!vypadaJakoKarta(raw)) return NextResponse.json({ error: 'Kód má osm znaků.' }, { status: 400 });
  const nalez = await najdiKartu(raw, u.team_id);
  if (nalez?.typ === 'blokovana') return NextResponse.json({ error: HLASKA_BLOKOVANA, blokovana: true }, { status: 403 });
  // Nová plastová karta: obsluha ji přiřadí hostovi (POST /api/client/cards/aktivace).
  if (nalez?.typ === 'nova') {
    if (nalez.teamId !== u.team_id) return NextResponse.json({ error: HLASKA_CIZI_NOVA }, { status: 404 });
    return NextResponse.json({ novaKarta: { kod: zobrazitelnyKod(nalez.kod), davkaId: nalez.davkaId } });
  }
  const c = nalez?.typ === 'host' ? { id: nalez.id, name: nalez.name } : null;
  if (!c) return NextResponse.json({ error: 'Takovou kartičku neznáme.' }, { status: 404 });
  const p = await ensureProfile(u.team_id);
  // Poslední dnešní účtenky z pokladny: obsluha částku vybere, nemusí ji
  // opisovat. Body a kredit pak sedí s tím, co host opravdu zaplatil.
  let bills: any[] = [];
  try {
    bills = await sql`
      SELECT b.bill_id, b.final_price, b.paid_at,
             EXISTS (SELECT 1 FROM client_bill_awards a WHERE a.team_id = b.team_id AND a.bill_id = b.bill_id AND a.done_at IS NOT NULL) AS awarded
      FROM pos_bills b
      WHERE b.team_id = ${u.team_id} AND b.day = ${pragueToday()} AND b.final_price > 0 AND b.refunded = FALSE AND b.deleted = FALSE
      ORDER BY COALESCE(b.paid_at, b.created_at) DESC LIMIT 5` as any[];
  } catch { bills = []; }
  // Podnik s pokladnou Storyous: sken založí čekající párování a body se připíšou samy, až
  // se zaplacený účet stáhne z pokladny (lib/vernostZUctu.ts). Synchronizace se po skenu
  // vynutí na pozadí (nejvýš jednou za 30 s), ať obsluha nečeká na pětiminutový tik.
  let parovani: { id: number; deskId: string | null; stoly: { deskId: string; name: string }[] } | null = null;
  if (p.loyalty_on && !(await jeClenBlokovan(u.team_id, c.id))) {
    try {
      if (await getConnection(u.team_id)) {
        const z = await zalozParovani(u.team_id, c.id, u.id);
        if (z) {
          parovani = { id: z.id, deskId: z.deskId, stoly: await stolyKParovani(u.team_id) };
          after(() => synchronizujPoSkenu(u.team_id));
        }
      }
    } catch { parovani = null; /* bez párování zůstává ruční výběr účtu */ }
  }
  return NextResponse.json({
    customer: c, ...(await summary(u.team_id, c.id, p)), bills, parovani,
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
  const nalez = await najdiKartu(String(b.code ?? ''), u.team_id);
  if (nalez?.typ === 'blokovana') return NextResponse.json({ error: HLASKA_BLOKOVANA, blokovana: true }, { status: 403 });
  if (nalez?.typ === 'nova') return NextResponse.json({ error: 'Karta ještě nepatří žádnému hostovi. Nejdřív ji přiřaď.' }, { status: 409 });
  const c = nalez?.typ === 'host' ? { id: nalez.id, name: nalez.name } : null;
  if (!c) return NextResponse.json({ error: 'Takovou kartičku neznáme.' }, { status: 404 });
  const action = String(b.action ?? '');
  // Razítko, storno poslední akce, ruční položky a připsání z účtenky jsou běžná práce u kasy; body z ručně
  // zadané částky a placení kreditem hýbou penězi hosta, a tak mají svá
  // oprávnění. Kontroluje se dřív, než se host stane členem (join níž).
  const klic = action === 'points' ? 'vernost.body_z_castky' : action === 'credit' ? 'vernost.platba_kreditem' : 'vernost.karta';
  if (!ctx.role.opravneni.has(klic)) {
    return NextResponse.json({ error: action === 'credit' ? 'Platbu kreditem nemáš povolenou.' : action === 'points' ? 'Připisovat body z částky nemáš povoleno.' : 'Pracovat s kartičkou hosta nemáš povoleno.' }, { status: 403 });
  }
  // Stejný Idempotency-Key dvakrát (dvojklik, opakování po výpadku sítě) = jedna akce, druhé volání dostane původní odpověď.
  return sIdempotenci(u.team_id, req, b, () => pripis(req, u, c, b, action, ctx.role.opravneni));
}

async function pripis(req: NextRequest, u: { id: number; team_id: number }, c: { id: number; name: string }, b: any, action: string, opravneni: Set<string>): Promise<NextResponse> {
  if (!['stamp', 'bill', 'points', 'credit', 'join', 'items', 'undo'].includes(action)) return NextResponse.json({ error: 'Neznámá akce' }, { status: 400 });
  const p = await ensureProfile(u.team_id);
  if (!p.loyalty_on) return NextResponse.json({ error: 'Podnik nemá věrnost zapnutou.' }, { status: 400 });
  await zajistiRazitka();
  // Storno poslední akce (body z částky, platba kreditem): vlastní zábor v databázi, takže ho neřeší pětisekundový
  // otisk (ten by storno zapsal jako „poslední akci“ a další storno by vracelo storno).
  if (action === 'undo') {
    const mena = await menaPodniku(u.team_id);
    const r = await stornujPosledniAkci(u.team_id, u.id, c.id, c.name, opravneni, mena.money);
    if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: r.status });
    audit(u.team_id, u.id, 'client.card', 'client', c.id, r.message);
    return NextResponse.json({ ok: true, message: r.message, customer: c, ...(await summary(u.team_id, c.id, p)) });
  }
  await join(c.id, u.team_id);
  // Zablokovaný člen u kasy nic nesbírá ani neutrácí; obsluha se dozví proč a poznámku najde ve správě členů.
  if (await jeClenBlokovan(u.team_id, c.id)) {
    return NextResponse.json({ error: `${c.name} je ve věrnostním programu zablokovaný. Body ani razítka se mu nepřipisují.` }, { status: 403 });
  }
  // Čtečka u kasy: host není členem podniku, obsluha ho jedním klepnutím přidá (bez razítka a bodů).
  if (action === 'join') {
    const x = await summary(u.team_id, c.id, p);
    const zprava = `${c.name} je teď členem.`;
    audit(u.team_id, u.id, 'client.card', 'client', c.id, zprava);
    return NextResponse.json({ ok: true, message: zprava, customer: c, ...x });
  }

  // Idempotence: klíč z UI (volitelný) a otisk akce. Opakovaná akce se nepřipíše podruhé.
  // Ručně zadané číslo účtenky (bez pokladny): jedno číslo věrnost připíše jen jednou. Chyba tvaru se hlásí hned.
  const uctenka = action === 'points' ? cisloUctenky(b.receipt) : { ok: true as const, cislo: null };
  if (!uctenka.ok) return NextResponse.json({ error: uctenka.chyba }, { status: 400 });
  const idemKey = String(req.headers.get('idempotency-key') ?? b.idemKey ?? '').trim().slice(0, 80) || null;
  const akceId = await zaberAkci(u.team_id, c.id, u.id, action, idemKey, otiskAkce(action, b));
  if (akceId == null) {
    return NextResponse.json({
      ok: true, duplicate: true, message: `${c.name}: stejná akce právě proběhla, podruhé se nepřipsala.`,
      customer: c, ...(await summary(u.team_id, c.id, p)),
    });
  }
  // Strážce ručně zadané účtenky: jeden příkaz s ON CONFLICT, dvě obsluhy s týmž číslem se nepřipíšou obě.
  const klicUctenky = uctenka.cislo ? klicRucniUctenky(uctenka.cislo) : null;
  const uvolniUctenku = () => klicUctenky
    ? sql`DELETE FROM client_bill_awards WHERE team_id = ${u.team_id} AND bill_id = ${klicUctenky} AND customer_id = ${c.id}`.catch(() => {})
    : Promise.resolve();
  if (klicUctenky) {
    const g = await sql`
      INSERT INTO client_bill_awards (team_id, bill_id, customer_id, staff_id) VALUES (${u.team_id}, ${klicUctenky}, ${c.id}, ${u.id})
      ON CONFLICT (team_id, bill_id) DO NOTHING RETURNING bill_id`;
    if (!g.length) {
      await sql`DELETE FROM client_scan_actions WHERE id = ${akceId}`.catch(() => {});
      return NextResponse.json({ error: 'Tahle účtenka už věrnost připsala.' }, { status: 409 });
    }
  }
  let res: NextResponse;
  try { res = await provedAkci(action, b, c, u, p, akceId); }
  catch (e) {
    await sql`DELETE FROM client_scan_actions WHERE id = ${akceId}`.catch(() => {});
    await uvolniUctenku();
    throw e;
  }
  // Neúspěšná akce nic nespotřebovala — oprava vstupu (částka, účtenka) nesmí narazit na pětisekundový zámek.
  if (res.status >= 400) { await sql`DELETE FROM client_scan_actions WHERE id = ${akceId}`.catch(() => {}); await uvolniUctenku(); }
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
  const sectiVysledek = (x: { expired?: number; lost?: number }) => { expiredCount += x.expired ?? 0; lost += x.lost ?? 0; };
  if (action === 'stamp') {
    // Návštěva + razítko každé kampani „za návštěvu" (nebo staré razítko, když kampaně nejsou).
    // Denní zámek je v jednom UPDATE — souběh dvou skenů proběhne jednou, druhý dostane already.
    // Kartičky „za návštěvu“, které teď neplatí (jiný den, mimo hodiny, pozastavená), razítko nedají a nespotřebují denní zámek.
    const nk = await navstevniKampane(u.team_id, pragueToday());
    if (nk.vse.length && !nk.platne.length) return NextResponse.json({ error: nk.proc ?? 'Razítko za návštěvu teď žádná kartička nedává.' }, { status: 409 });
    if (!nk.vse.length && await maKampane(u.team_id)) return NextResponse.json({ error: 'Žádná kartička „za návštěvu“ teď neběží (je pozastavená, skončila nebo ještě nezačala).' }, { status: 409 });
    const r = await stampVisit(u.team_id, c.id, p, 'card', bonus.razitka, poznamkaRazitek(bonus), u.id);
    if (r.already) return NextResponse.json({ error: `${c.name} dnes razítko už má.` }, { status: 409 });
    sectiVysledek(r);
    if (r.lines) msg = `${c.name}: ${r.lines.join(' · ')}`;
    else msg = r.rewarded ? `${c.name}: razítka kompletní, odměna „${p.stamp_reward}" je v kuponech.` : `${c.name}: razítko ${r.stamps}/${p.stamp_target}.`;
  } else if (action === 'items') {
    // Razítka z ručně zadaných položek (účtenka není v pokladně nebo Storyous není napojené).
    const polozky = rucniPolozky(b.items);
    if (!polozky.length) return NextResponse.json({ error: 'Přidej aspoň jednu položku.' }, { status: 400 });
    const st = await applyBillToCampaigns(u.team_id, c.id, pragueToday(), { billId: ref, total: 0, items: [], rucniPolozky: polozky }, { staffId: u.id, razitka: bonus.razitka, poznamka: poznamkaRazitek(bonus) });
    if (!st.anything) return NextResponse.json({ error: st.lines.length ? st.lines.join(' · ') : 'Tyhle položky žádná kartička nepočítá.' }, { status: 400 });
    sectiVysledek(st);
    msg = `${c.name} · ruční položky: ${st.lines.join(' · ')}`;
  } else if (action === 'bill') {
    // Připsání Z ÚČTENKY: jádro v lib/vernostZUctu.ts (razítka z položek, body a cashback z částky,
    // návštěva, útrata, zápis pro storno). Účtenka smí věrnost připsat jen jednou, ať ji pošle
    // obsluha tady, nebo ji spáruje naskenovaná kartička sama po zaplacení.
    const r = await pripisZUctu({ teamId: u.team_id, customer: c, billId: String(b.billId ?? ''), staffId: u.id, profil: p, castka: Number(b.amount) || 0, predplaceno: Number(b.prepaid) || 0, zdroj: 'rucne' });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    sectiVysledek(r);
    msg = r.message;
  } else if (action === 'points') {
    const amount = Math.max(0, Math.min(100000, Math.round(Number(b.amount) || 0)));
    const polozky = rucniPolozky(b.items);
    const { odmena: od, pravidla: pr, poznamka: bonusPozn } = await odmenaZUctu(u.team_id, p, amount, { predplaceno: b.prepaid, customerId: c.id, bonus });
    const pts = od.points;
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
    if (!v.already && v.lines) { parts.push(...v.lines); sectiVysledek(v); }
    const st = await applyBillToCampaigns(u.team_id, c.id, pragueToday(), { billId: ref, total: amount, items: [], rucniPolozky: polozky }, { staffId: u.id, razitka: bonus.razitka, poznamka: poznamkaRazitek(bonus) });
    parts.push(...st.lines); sectiVysledek(st);
    if (pts > 0) { const points = await award(u.team_id, c.id, pts, 'manual', ref, `Útrata ${mena.money(amount)} u kasy${bonusPozn}`, u.id); parts.push(`+${pts} bodů${od.nasobicPopis ? ` (${od.nasobicPopis})` : ''} (celkem ${points})`); }
    if (amount > 0) await zapisZbytek(u.team_id, c.id, pr, od);
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
