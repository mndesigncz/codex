// Profil podniku v Managero client — vedení ho zapíná, pojmenuje adresu,
// nastaví, co host smí (rezervace, objednávky, věrnost) a pravidla věrnosti.
import { NextRequest, NextResponse } from 'next/server';
import { sql, ensureProfile, slugify, publicProfile } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { normalizeQrDesign } from '@/lib/qrDesign';
import { audit } from '@/lib/audit';
import { zajistiUrovne } from '@/lib/urovneDb';
import { ulozPropadani, zajistiPropadani } from '@/lib/propadaniBoduDb';
import { zajistiReaktivaci } from '@/lib/reaktivace';
import { zajistiBodyPravidla } from '@/lib/bodyPravidlaDb';
import {
  validujPravidla, POLE_PRAVIDEL, popisZmenyPravidel, vetaZmenPravidel, jeZaokrouhleni, vylouceneZProfilu,
  MAX_PRAH_NAVSTEV, MAX_PRAH_UTRATY, MAX_MIN_UTRATA, MAX_STROP_BODU, MAX_MESICU_NEAKTIVITY,
} from '@/lib/bodyPravidla';
import { menaPodniku } from '@/lib/menaPodniku';
import { teamIsMax, MAX_ONLY_MSG } from '@/lib/planServer';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Profil drží tři různé věci: provoz stránky pro hosty, její vzhled a
 * pravidla věrnosti. Každou smí měnit někdo jiný, proto se oprávnění
 * kontroluje podle polí, která požadavek posílá (obrazovky posílají jen
 * svoje pole — Nastavení, Vzhled, Věrnost).
 */
const POLE_OPRAVNENI: Record<string, string> = {
  enabled: 'klient.nastaveni', slug: 'klient.nastaveni', reservations_on: 'klient.nastaveni', ordering_on: 'klient.nastaveni',
  max_party: 'klient.nastaveni', lead_days: 'klient.nastaveni', slot_minutes: 'klient.nastaveni', menu_slug: 'klient.nastaveni',
  order_qr_required: 'klient.nastaveni', order_geo: 'klient.nastaveni', lat: 'klient.nastaveni', lng: 'klient.nastaveni',
  geo_radius_m: 'klient.nastaveni', order_auto_pos: 'klient.nastaveni',
  // Texty a adresa se upravují na obrazovce Vzhled spolu s logem a galerií.
  tagline: 'klient.vzhled', description: 'klient.vzhled', address: 'klient.vzhled', cover_url: 'klient.vzhled',
  logo_url: 'klient.vzhled', gallery: 'klient.vzhled', accent: 'klient.vzhled', qr_design: 'klient.vzhled',
  loyalty_on: 'vernost.pravidla', points_per_100: 'vernost.pravidla', stamp_target: 'vernost.pravidla', stamp_reward: 'vernost.pravidla',
  birthday_points: 'vernost.pravidla', referral_points: 'vernost.pravidla', silver_at: 'vernost.pravidla', gold_at: 'vernost.pravidla',
  platinum_at: 'vernost.pravidla', member_discount: 'vernost.pravidla', silver_discount: 'vernost.pravidla',
  tier_by: 'vernost.pravidla', silver_spend: 'vernost.pravidla', gold_spend: 'vernost.pravidla', platinum_spend: 'vernost.pravidla',
  reactivation_days: 'vernost.pravidla', reactivation_points: 'vernost.pravidla',
  gold_discount: 'vernost.pravidla', platinum_discount: 'vernost.pravidla', cashback_pct: 'vernost.pravidla', cashback_mode: 'vernost.pravidla',
  points_expire_days: 'vernost.pravidla',
  points_round: 'vernost.pravidla', points_min_spend: 'vernost.pravidla', points_cap_per_bill: 'vernost.pravidla',
  points_exclude_prepaid: 'vernost.pravidla', points_exclude_items: 'vernost.pravidla', tier_inactive_months: 'vernost.pravidla',
};
/** Pole pravidel bodů, která žijí ve vlastním UPDATE (sloupce se zajišťují za běhu). */
const POLE_BODU = ['points_round', 'points_min_spend', 'points_cap_per_bill', 'points_exclude_prepaid', 'points_exclude_items', 'tier_inactive_months'];
const NAZEV_SKUPINY: Record<string, string> = {
  'klient.nastaveni': 'nastavení stránky pro hosty', 'klient.vzhled': 'vzhled stránky pro hosty', 'vernost.pravidla': 'pravidla věrnosti',
};

function origin(req: NextRequest) { return (process.env.NEXTAUTH_URL?.replace(/\/$/, '') || new URL(req.url).origin); }

export async function GET(req: NextRequest) {
  // Profil čte obrazovka Nastavení, Vzhled i Věrnost — stačí kterékoli z nich.
  const ctx = await pozaduj(['klient.nastaveni', 'klient.vzhled', 'vernost.zobrazit']);
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  // Sloupce úrovní podle útraty se zajistí dřív, ať je profil (SELECT *) vrátí.
  try { await zajistiUrovne(); } catch { /* bez nich platí návštěvy */ }
  try { await zajistiPropadani(); } catch { /* bez nich body nepropadají */ }
  try { await zajistiReaktivaci(); } catch { /* bez nich je „Chybíš nám“ vypnuté */ }
  try { await zajistiBodyPravidla(); } catch { /* bez nich platí dosavadní výpočet bodů */ }
  const p = await ensureProfile(u.team_id);
  const boards = await sql`
    SELECT b.slug, b.name,
           COUNT(i.id)::int AS items,
           COUNT(i.id) FILTER (WHERE i.pos_product_id IS NOT NULL AND i.pos_product_id <> '')::int AS linked
    FROM menu_boards b
    LEFT JOIN menu_sections s ON s.board_id = b.id
    LEFT JOIN menu_items i ON i.section_id = s.id
    WHERE b.team_id = ${u.team_id} AND b.enabled IS NOT FALSE
    GROUP BY b.id, b.slug, b.name ORDER BY b.id`;
  const [team] = await sql`SELECT name, opening_hours FROM teams WHERE id = ${u.team_id}`;
  return NextResponse.json({ profile: { ...p, team_name: team?.name, opening_hours: team?.opening_hours ?? {} }, boards, url: `${origin(req)}/client/${p.slug}` });
}

export async function PUT(req: NextRequest) {
  const ctx = await pozaduj(['klient.nastaveni', 'klient.vzhled', 'vernost.pravidla']);
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  // Chybí-li oprávnění k některému poslanému poli, neuloží se nic — půlka
  // uložená a půlka ne by na obrazovce vypadala jako úspěch.
  const chybi = new Set<string>();
  for (const [pole, klic] of Object.entries(POLE_OPRAVNENI)) {
    if (b?.[pole] !== undefined && !ctx.role.opravneni.has(klic)) chybi.add(klic);
  }
  if (chybi.size) {
    return NextResponse.json({ error: `Na ${[...chybi].map(k => NAZEV_SKUPINY[k]).join(' ani ')} nemáš oprávnění.` }, { status: 403 });
  }
  // Tarif až po oprávnění — kdo na úpravu nemá právo, nemá co řešit tarif.
  if (!(await teamIsMax(u.team_id))) return NextResponse.json({ error: MAX_ONLY_MSG }, { status: 402 });
  // Sloupce pravidel se zajistí dřív než čtení profilu, ať „před" v historii změn a výchozí hodnoty nejsou prázdné.
  try { await zajistiUrovne(); await zajistiBodyPravidla(); } catch { /* bez nich se pravidla nových polí neuloží, ostatní ano */ }
  const cur = await ensureProfile(u.team_id);
  // Pravidla věrnosti se kontrolují jako celek (prahy rostou, slevy neklesají) — stejnou funkcí jako formulář.
  if (POLE_PRAVIDEL.some(k => b?.[k] !== undefined)) {
    const spojene: Record<string, unknown> = {};
    for (const k of POLE_PRAVIDEL) spojene[k] = b?.[k] !== undefined ? b[k] : (cur as any)[k];
    const chyby = validujPravidla(spojene);
    if (chyby.length) return NextResponse.json({ error: chyby[0].text, chyby }, { status: 400 });
  }
  const slug = b.slug != null ? slugify(b.slug) : cur.slug;
  if (!slug) return NextResponse.json({ error: 'Adresa musí mít aspoň jedno písmeno nebo číslo.' }, { status: 400 });
  if (slug !== cur.slug) {
    const [clash] = await sql`SELECT team_id FROM client_profiles WHERE slug = ${slug} AND team_id <> ${u.team_id}`;
    if (clash) return NextResponse.json({ error: 'Tuhle adresu už používá jiný podnik.' }, { status: 409 });
  }
  // „|| d" bralo nulu jako nevyplněno — narozeninové body (0 = nedávat),
  // body za útratu i cíl razítek pak nešly vypnout.
  // Adresa obrázku: buď naše vlastní (/api/client/img/<id>), nebo https.
  // Cokoli jiného (data:, javascript:, relativní cesta jinam) se zahodí.
  const imgUrl = (v: any) => { const u = String(v || '').trim().slice(0, 300); return /^\/api\/client\/img\/\d+$/.test(u) || /^https:\/\/[^\s"'<>]+$/.test(u) ? u : ''; };
  // Galerie: nejvýš osm obrázků, jen naše vlastní adresy.
  const gallery = (v: any) => (Array.isArray(v) ? v : []).map(x => String(x || '')).filter(x => /^\/api\/client\/img\/\d+$/.test(x)).slice(0, 8);
  // Barva značky: jen šestimístný zápis, ať se do stylu nedostane nic jiného.
  const accent = (v: any) => { const c = String(v || '').trim(); return /^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : null; };
  const num = (v: any, d: number, lo: number, hi: number) => { const n = parseInt(String(v ?? d), 10); return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : d)); };
  // Souřadnice: undefined nechá, prázdný řetězec nebo null smaže, číslo uloží.
  const coord = (v: any, cur: any, lim: number) => {
    if (v === undefined) return cur ?? null;
    if (v === null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && Math.abs(n) <= lim ? n : (cur ?? null);
  };
  const [p] = await sql`
    UPDATE client_profiles SET
      slug = ${slug},
      enabled = ${b.enabled != null ? !!b.enabled : cur.enabled},
      tagline = ${String(b.tagline ?? cur.tagline ?? '').slice(0, 120)},
      description = ${String(b.description ?? cur.description ?? '').slice(0, 1200)},
      address = ${String(b.address ?? cur.address ?? '').slice(0, 200)},
      cover_url = ${b.cover_url !== undefined ? imgUrl(b.cover_url) : String(cur.cover_url ?? '')},
      reservations_on = ${b.reservations_on != null ? !!b.reservations_on : cur.reservations_on},
      ordering_on = ${b.ordering_on != null ? !!b.ordering_on : cur.ordering_on},
      loyalty_on = ${b.loyalty_on != null ? !!b.loyalty_on : cur.loyalty_on},
      points_per_100 = ${num(b.points_per_100, Number(cur.points_per_100), 0, 100)},
      stamp_target = ${num(b.stamp_target, Number(cur.stamp_target), 0, 50)},
      stamp_reward = ${String(b.stamp_reward ?? cur.stamp_reward ?? '').slice(0, 80)},
      birthday_points = ${num(b.birthday_points, Number(cur.birthday_points) || 0, 0, 1000)},
      referral_points = ${num(b.referral_points, Number(cur.referral_points) || 0, 0, 1000)},
      silver_at = ${num(b.silver_at, Number(cur.silver_at) || 10, 1, MAX_PRAH_NAVSTEV)},
      gold_at = ${num(b.gold_at, Number(cur.gold_at) || 25, 2, MAX_PRAH_NAVSTEV)},
      member_discount = ${num(b.member_discount, Number(cur.member_discount) || 0, 0, 90)},
      silver_discount = ${num(b.silver_discount, Number(cur.silver_discount) || 0, 0, 90)},
      gold_discount = ${num(b.gold_discount, Number(cur.gold_discount) || 0, 0, 90)},
      platinum_at = ${num(b.platinum_at, Number(cur.platinum_at) || 0, 0, MAX_PRAH_NAVSTEV)},
      platinum_discount = ${num(b.platinum_discount, Number(cur.platinum_discount) || 0, 0, 90)},
      cashback_pct = ${num(b.cashback_pct, Number(cur.cashback_pct) || 0, 0, 50)},
      cashback_mode = ${['credit', 'points'].includes(String(b.cashback_mode)) ? String(b.cashback_mode) : (cur.cashback_mode ?? 'credit')},
      logo_url = ${b.logo_url !== undefined ? (imgUrl(b.logo_url) || null) : cur.logo_url},
      gallery = ${b.gallery !== undefined ? JSON.stringify(gallery(b.gallery)) : JSON.stringify(cur.gallery ?? [])},
      accent = ${b.accent !== undefined ? (accent(b.accent) ?? null) : cur.accent},
      max_party = ${num(b.max_party, Number(cur.max_party), 1, 40)},
      lead_days = ${num(b.lead_days, Number(cur.lead_days), 1, 180)},
      slot_minutes = ${num(b.slot_minutes, Number(cur.slot_minutes), 15, 120)},
      menu_slug = ${b.menu_slug !== undefined ? (b.menu_slug ? String(b.menu_slug).slice(0, 80) : null) : cur.menu_slug},
      order_qr_required = ${b.order_qr_required != null ? !!b.order_qr_required : cur.order_qr_required},
      order_geo = ${['off', 'warn', 'block'].includes(String(b.order_geo)) ? String(b.order_geo) : cur.order_geo},
      lat = ${coord(b.lat, cur.lat, 90)},
      lng = ${coord(b.lng, cur.lng, 180)},
      geo_radius_m = ${num(b.geo_radius_m, Number(cur.geo_radius_m) || 100, 30, 1000)},
      order_auto_pos = ${b.order_auto_pos != null ? !!b.order_auto_pos : cur.order_auto_pos},
      qr_design = ${b.qr_design !== undefined ? JSON.stringify(normalizeQrDesign(b.qr_design)) : JSON.stringify(normalizeQrDesign(cur.qr_design))}::jsonb,
      updated_at = NOW()
    WHERE team_id = ${u.team_id} RETURNING *`;
  // Režim úrovní a prahy v útratě: zvlášť a až po zajištění sloupců, ať uložení
  // ostatních pravidel nezávisí na migraci. Přepnutí režimu nic nemaže —
  // prahy obou režimů zůstávají uložené vedle sebe.
  let pFinal = p;
  if (['tier_by', 'silver_spend', 'gold_spend', 'platinum_spend'].some(k => b?.[k] !== undefined)) {
    await zajistiUrovne();
    [pFinal] = await sql`
      UPDATE client_profiles SET
        tier_by = ${b.tier_by !== undefined ? (b.tier_by === 'spend' ? 'spend' : 'visits') : (p.tier_by === 'spend' ? 'spend' : 'visits')},
        silver_spend = ${num(b.silver_spend, Number(p.silver_spend) || 5000, 1, MAX_PRAH_UTRATY)},
        gold_spend = ${num(b.gold_spend, Number(p.gold_spend) || 15000, 2, MAX_PRAH_UTRATY)},
        platinum_spend = ${num(b.platinum_spend, Number(p.platinum_spend) || 0, 0, MAX_PRAH_UTRATY)}
      WHERE team_id = ${u.team_id} RETURNING *`;
  }
  // Propadání bodů: zvlášť, ať uložení ostatních pravidel nezávisí na migraci.
  if (b?.points_expire_days !== undefined) {
    const r = await ulozPropadani(u.team_id, b.points_expire_days);
    pFinal = { ...pFinal, points_expire_days: r.days, points_expire_since: r.since };
  }
  // „Chybíš nám“: po kolika dnech bez návštěvy (0 = vypnuto) a kolik bodů k tomu. Zvlášť, jako úrovně.
  if (['reactivation_days', 'reactivation_points'].some(k => b?.[k] !== undefined)) {
    await zajistiReaktivaci();
    [pFinal] = await sql`
      UPDATE client_profiles SET
        reactivation_days = ${num(b.reactivation_days, Number(pFinal.reactivation_days) || 0, 0, 365)},
        reactivation_points = ${num(b.reactivation_points, Number(pFinal.reactivation_points) || 0, 0, 1000)}
      WHERE team_id = ${u.team_id} RETURNING *`;
    audit(u.team_id, u.id, 'client.reaktivace', 'client', null, Number(pFinal.reactivation_days) > 0
      ? `Chybíš nám po ${pFinal.reactivation_days} dnech · ${pFinal.reactivation_points} bodů` : 'Chybíš nám vypnuto');
  }
  // Body bez stropu, minimum, zaokrouhlení, kredit a poukazy, vyloučené položky a snížení úrovně po neaktivitě.
  if (POLE_BODU.some(k => b?.[k] !== undefined)) {
    await zajistiBodyPravidla();
    [pFinal] = await sql`
      UPDATE client_profiles SET
        points_round = ${jeZaokrouhleni(b.points_round) ? b.points_round : (jeZaokrouhleni(pFinal.points_round) ? pFinal.points_round : 'sta')},
        points_min_spend = ${num(b.points_min_spend, Number(pFinal.points_min_spend) || 0, 0, MAX_MIN_UTRATA)},
        points_cap_per_bill = ${num(b.points_cap_per_bill, Number(pFinal.points_cap_per_bill) || 0, 0, MAX_STROP_BODU)},
        points_exclude_prepaid = ${b.points_exclude_prepaid != null ? !!b.points_exclude_prepaid : pFinal.points_exclude_prepaid !== false},
        points_exclude_items = ${JSON.stringify(b.points_exclude_items !== undefined ? vylouceneZProfilu(b.points_exclude_items) : vylouceneZProfilu(pFinal.points_exclude_items))}::jsonb,
        tier_inactive_months = ${num(b.tier_inactive_months, Number(pFinal.tier_inactive_months) || 0, 0, MAX_MESICU_NEAKTIVITY)}
      WHERE team_id = ${u.team_id} RETURNING *`;
  }
  // Verze pravidel: co se změnilo, před → po, v historii změn.
  const zmeny = popisZmenyPravidel(cur, pFinal, (await menaPodniku(u.team_id)).money);
  if (zmeny.length) audit(u.team_id, u.id, 'client.pravidla', 'client', null, vetaZmenPravidel(zmeny));
  audit(u.team_id, u.id, 'client.profile', 'client', null, pFinal.enabled ? `zapnuto · /client/${pFinal.slug}` : 'vypnuto');
  return NextResponse.json({ ok: true, profile: pFinal, public: publicProfile({ ...pFinal, team_name: '', opening_hours: {} }), url: `${origin(req)}/client/${pFinal.slug}` });
}
