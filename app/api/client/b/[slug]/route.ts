// Stránka podniku pro hosta: profil, otevírací doba, menu, stoly (když se
// objednává), moje členství, moje nadcházející rezervace a kupony k vyzvednutí.

import { NextResponse } from 'next/server';
import { normalizePlan } from '@/lib/floorplan';
import { tierForMember, tierRulesFromProfile } from '@/lib/clientSlots';
import { slevaClena } from '@/lib/urovneDb';
import { sql, customer, profileBySlug, publicProfile, membership } from '@/lib/client';
import { activeCampaigns, progressFor } from '@/lib/stamps';
import { shapeCoupon, windowOk, ageFrom, TIER_LABELS } from '@/lib/coupons';
import { pragueToday, pragueHM, pragueDaySafe } from '@/lib/pragueTime';
import { buildBoard, publicShape, menaListku } from '@/lib/menu';
import { menaZRadku } from '@/lib/mena';
import { aktivniBannery, kontextHosta } from '@/lib/clientBanners';
import { aktivniBonus } from '@/lib/bonusAkceDb';
import { dokdyDnes } from '@/lib/bonusAkce';
import { planClena } from '@/lib/propadaniBoduDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Nabídka pro hosta: sekce a položky s tím, co host smí vidět (bez PINu,
 * bez id produktu z pokladny — to si objednávka dohledá podle id položky).
 * Tvar drží stránka hosta i objednávka: sections[].items[].
 */
async function menuFor(teamId: number, menuSlug: string | null, lang: string | null, currency?: string | null) {
  try {
    // Sloupce jazyků, alergenů a překladů (kolo 76) zvlášť a defenzivně: před
    // /api/init nejsou a nabídka se musí ukázat jako dřív, jen česky a bez alergenů.
    const nactiDesku = async (nove: boolean) => {
      if (nove) {
        return menuSlug
          ? await sql`SELECT id, slug, name, currency, langs, i18n FROM menu_boards WHERE team_id = ${teamId} AND slug = ${menuSlug} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`
          : await sql`SELECT id, slug, name, currency, langs, i18n FROM menu_boards WHERE team_id = ${teamId} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`;
      }
      return menuSlug
        ? await sql`SELECT id, slug, name, currency FROM menu_boards WHERE team_id = ${teamId} AND slug = ${menuSlug} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`
        : await sql`SELECT id, slug, name, currency FROM menu_boards WHERE team_id = ${teamId} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`;
    };
    let rows: any[];
    try { rows = await nactiDesku(true) as any[]; } catch { rows = await nactiDesku(false) as any[]; }
    const board = rows[0];
    if (!board) return null;
    let sections: any[];
    let items: any[];
    try {
      sections = await sql`SELECT id, title, position, i18n FROM menu_sections WHERE board_id = ${board.id} ORDER BY position, id` as any[];
      items = await sql`
        SELECT i.id, i.section_id, i.name, i.price, i.description, i.sold_out, i.position, i.allergens, i.tags, i.i18n
        FROM menu_items i JOIN menu_sections s ON s.id = i.section_id
        WHERE s.board_id = ${board.id} ORDER BY i.position, i.id` as any[];
    } catch {
      sections = await sql`SELECT id, title, position FROM menu_sections WHERE board_id = ${board.id} ORDER BY position, id` as any[];
      items = await sql`
        SELECT i.id, i.section_id, i.name, i.price, i.description, i.sold_out, i.position
        FROM menu_items i JOIN menu_sections s ON s.id = i.section_id
        WHERE s.board_id = ${board.id} ORDER BY i.position, i.id` as any[];
    }
    // Překlad, alergeny a věty o nich řeší jedno místo (lib/menu publicShape), stejné jako
    // u veřejného lístku: host vidí v obou stejnou pravdu. Jazyk mimo nabízené = výchozí jazyk lístku.
    const deska = buildBoard(board, sections, items);
    const pub = publicShape(deska, lang, { currency: currency ?? undefined });
    return {
      slug: board.slug, name: board.name, // Měna podniku, ne výchozí „Kč" z desky (host eurové kavárny dřív viděl koruny).
      currency: menaListku(board.currency, currency),
      sections: pub.sekce.map((sec, si) => ({
        id: deska.sections[si].id, title: sec.nadpis,
        items: sec.polozky.map(p => ({
          id: p.id, name: p.name, price: Number(p.price) || 0,
          description: p.desc ?? '', soldOut: !!p.vyprodano,
          ...('alergeny' in p ? { alergeny: (p as any).alergeny } : {}),
        })),
      })),
      alergenyNazvy: pub.alergenyNazvy,
      alergenyPoznamka: pub.alergenyPoznamka,
      alergenyNeuplne: pub.alergenyNeuplne,
    };
  } catch { return null; }
}

export async function GET(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const p = await profileBySlug(params.slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const teamId = Number(p.team_id);
  const me = await customer();
  const today = pragueToday();

  const [menu, tables, coupons] = await Promise.all([
    menuFor(teamId, p.menu_slug ?? null, new URL(req.url).searchParams.get('lang'), p.currency),
    p.ordering_on ? sql`SELECT id, name, seats, map_x, map_y, map_w, map_h, map_shape, map_rot FROM client_tables WHERE team_id = ${teamId} AND active = TRUE ORDER BY position, id` : Promise.resolve([]),
    p.loyalty_on ? sql`SELECT * FROM client_coupons
                       WHERE team_id = ${teamId} AND active = TRUE AND kind = 'offer' AND (valid_until IS NULL OR valid_until >= ${today})
                       ORDER BY cost_points, id` : Promise.resolve([]),
  ]);

  let mine: any = null;
  let myBirthday: string | null = null;
  if (me) {
    const m = await membership(me.id, teamId);
    try { const [us] = await sql`SELECT birthday FROM users WHERE id = ${me.id}`; myBirthday = us?.birthday ?? null; } catch { myBirthday = null; }
    const reservations = await sql`
      SELECT id, date, time, party, note, status, created_at FROM client_reservations
      WHERE team_id = ${teamId} AND customer_id = ${me.id} AND date >= ${today} AND status NOT IN ('cancelled','declined','done')
      ORDER BY date, time`;
    const claims = await sql`
      SELECT cl.id, cl.code, cl.claimed_at, cl.redeemed_at, c.title, c.valid_until FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id
      WHERE cl.team_id = ${teamId} AND cl.customer_id = ${me.id} AND cl.redeemed_at IS NULL ORDER BY cl.claimed_at DESC`;
    const tier = tierForMember({ visits: Number(m?.visits ?? 0), spend: Number(m?.spend ?? 0) }, tierRulesFromProfile(p));
    // Sleva = nejvyšší z úrovně a slev skupin; host vidí i odkud je.
    const sleva = await slevaClena(teamId, me.id, tier);
    const myCamps = await activeCampaigns(teamId, today);
    const myProg = myCamps.length ? await progressFor(teamId, me.id) : new Map();
    mine = {
      member: !!m, points: Number(m?.points ?? 0), stamps: Number(m?.stamps ?? 0), visits: Number(m?.visits ?? 0),
      credit: Number(m?.credit ?? 0),
      spend: Number(m?.spend ?? 0), tierBy: tier.unit,
      level: tier.id, levelLabel: tier.label, discount: sleva.pct, discountSource: sleva.zdroj, discountName: sleva.nazev,
      nextTierAt: tier.nextAt, nextTierLabel: tier.nextLabel, nextTierUnit: tier.unit,
      campaigns: myCamps.map(c => ({
        id: c.id, name: c.name, description: c.description, required: c.required_stamps,
        reward: c.reward_title, stamps: Number(myProg.get(c.id)?.stamps ?? 0),
        completed: Number(myProg.get(c.id)?.completed ?? 0),
        // Doba na dokončení: karta se nuluje, když od posledního razítka uplyne víc než `daysToFinish` dní.
        daysToFinish: c.days_to_finish, lastStampDay: pragueDaySafe(myProg.get(c.id)?.last_stamp_at) || null,
      })),
      reservations, claims,
    };
    // Body, kterým brzy vyprší platnost (jen když podnik propadání používá).
    if (p.loyalty_on && Number(p.points_expire_days) > 0) {
      const pl = await planClena(teamId, me.id, p);
      const body = pl.propadne + pl.varovat;
      mine.expiring = body > 0 ? { points: body, till: pl.varovatDo ?? today } : null;
    }
  }
  // Novinky: poslední rozeslané zprávy členům rovnou na stránce podniku,
  // ať mají co číst i hosté bez zapnutých oznámení.
  // Veřejné akce podniku: co se tam koná a na co host může přijít.
  let events: any[] = [];
  try {
    const rows = await sql`
      SELECT id, title, description, kind, date, start_time, end_time, location, offsite, capacity, photos, menu, status
      FROM events
      WHERE team_id = ${teamId} AND public = TRUE AND status <> 'cancelled' AND date >= ${today}
      ORDER BY date, start_time NULLS LAST LIMIT 8` as any[];
    const ids = rows.map((r: any) => Number(r.id));
    // Menu akce jsou odkazy do nabídky — host má vidět aktuální jména a ceny.
    const menuIds = Array.from(new Set(rows.flatMap((r: any) => (Array.isArray(r.menu) ? r.menu : [])
      .map((l: any) => Number(l?.itemId)).filter((n: number) => Number.isFinite(n) && n > 0))));
    const boardIds = Array.from(new Set(rows.flatMap((r: any) => (Array.isArray(r.menu) ? r.menu : [])
      .map((l: any) => Number(l?.boardId)).filter((n: number) => Number.isFinite(n) && n > 0))));
    let boardRows: any[] = [];
    if (boardIds.length) {
      try { boardRows = await sql`SELECT id, name FROM menu_boards WHERE team_id = ${teamId} AND id = ANY(${boardIds})` as any[]; } catch { boardRows = []; }
    }
    const boardById = new Map(boardRows.map((r: any) => [Number(r.id), String(r.name)]));
    let menuRows: any[] = [];
    if (menuIds.length) {
      try { menuRows = await sql`SELECT id, name, price FROM menu_items WHERE id = ANY(${menuIds})` as any[]; } catch { menuRows = []; }
    }
    const menuById = new Map(menuRows.map((r: any) => [Number(r.id), { name: String(r.name), price: r.price == null ? null : Number(r.price) }]));
    // Kolik lidí jde a co sleduju já — dvě skupinové otázky, ne po akci.
    let counts: any[] = []; let mine: any[] = [];
    if (ids.length) {
      try {
        [counts, mine] = await Promise.all([
          sql`SELECT event_id, COUNT(*) FILTER (WHERE going)::int AS going FROM client_event_follows WHERE event_id = ANY(${ids}) GROUP BY event_id` as any,
          me ? sql`SELECT event_id, going FROM client_event_follows WHERE customer_id = ${me.id} AND event_id = ANY(${ids})` as any : Promise.resolve([]),
        ]);
      } catch { /* sledování bez migrace */ }
    }
    const goingBy = new Map(counts.map((r: any) => [Number(r.event_id), Number(r.going) || 0]));
    const myBy = new Map(mine.map((r: any) => [Number(r.event_id), r]));
    events = rows.map((r: any) => ({
      id: r.id, title: r.title, description: r.description, kind: r.kind,
      date: r.date, start_time: r.start_time, end_time: r.end_time,
      location: r.location, offsite: r.offsite === true, capacity: r.capacity,
      photos: Array.isArray(r.photos) ? r.photos.filter((x: any) => /^\/api\/client\/img\/\d+$/.test(String(x))).slice(0, 8) : [],
      menu: (Array.isArray(r.menu) ? r.menu.slice(0, 30) : [])
        .map((l: any) => {
          const boardId = Number(l?.boardId);
          if (Number.isFinite(boardId) && boardId > 0) {
            const bn = boardById.get(boardId);
            return bn ? { board: true, name: bn, price: null } : null;
          }
          const itemId = Number(l?.itemId);
          if (Number.isFinite(itemId) && itemId > 0) {
            const hit = menuById.get(itemId);
            return hit ? { name: hit.name, price: hit.price } : null;
          }
          return l?.name ? { name: String(l.name).slice(0, 120), price: l.price ?? null } : null;
        })
        .filter((l: any) => l != null),
      going: goingBy.get(Number(r.id)) ?? 0,
      myFollow: myBy.has(Number(r.id)),
      myGoing: myBy.get(Number(r.id))?.going === true,
    }));
  } catch { events = []; }

  // Kartičky podniku vidí i nepřihlášený host — je to lákadlo k registraci.
  let stampCampaigns: any[] = [];
  try {
    stampCampaigns = (await activeCampaigns(teamId, today)).map(c => ({
      id: c.id, name: c.name, description: c.description, required: c.required_stamps, reward: c.reward_title,
    }));
  } catch { stampCampaigns = []; }

  let news: any[] = [];
  // Jen opravdu odeslané — naplánované zprávy nesmí do Novinek předčasně.
  try { news = await sql`SELECT id, title, body, sent_at FROM client_broadcasts WHERE team_id = ${teamId} AND COALESCE(status, 'sent') = 'sent' ORDER BY sent_at DESC LIMIT 3` as any[]; } catch { news = []; }
  const plan = p.floorplan && p.ordering_on ? normalizePlan(p.floorplan) : null;

  // Kupony v plné síle: výhoda + štítky podmínek, a přihlášenému členovi
  // rovnou důvod, proč na kupon teď nedosáhne (okno, úroveň, 18+). Skupiny
  // a limity se doříkají až při vyzvednutí — bez dotazu na každý kupon.
  const hm = pragueHM();
  const castkaPodniku = menaZRadku(p.currency, p.locale).money;
  const shapedCoupons = (coupons as any[]).map((r: any) => {
    const s = shapeCoupon(r, castkaPodniku);
    let blocked: string | null = windowOk(r, { today, hm });
    if (!blocked && mine?.member && s.targetTiers.length && !s.targetTiers.includes(mine.level)) {
      blocked = `Jen pro ${s.targetTiers.map((t: string) => TIER_LABELS[t]).join(' / ')}.`;
    }
    if (!blocked && mine?.member && s.adultOnly) {
      const age = ageFrom(myBirthday, today);
      if (age == null) blocked = 'Kupon je 18+ — doplň si datum narození v Moje.';
      else if (age < 18) blocked = 'Jen pro plnoleté.';
    }
    // cost_points nechává starý název — stránka hosta ho už čte.
    return { ...s, cost_points: s.costPoints, valid_until: s.validUntil, blocked };
  });
  // Promo bannery podniku (max 5, aktivní a v platnosti). Obsah je data podniku.
  // Cílení: člen vidí jiné bannery než nečlen; úroveň a skupiny se berou z hostova členství.
  const banners = await aktivniBannery(teamId, today, await kontextHosta(teamId, me?.id ?? null, mine));
  // Bonusová akce, která právě běží („Dnes dvojnásobné body do 18:00"); text skládá stránka přes t().
  let bonus: any = null;
  if (p.loyalty_on) {
    const bn = await aktivniBonus(teamId);
    if (bn.pravidla.length) {
      const konec = dokdyDnes(bn);
      bonus = { name: bn.nazev, multiplier: bn.nasobic, stampBonus: bn.razitka, until: konec == null ? null : `${String(konec).padStart(2, '0')}:00` };
    }
  }
  return NextResponse.json({ business: publicProfile(p), bonus, menu, tables, plan, coupons: shapedCoupons, news, events, stampCampaigns, banners, me: mine, signedIn: !!me, today });
}
