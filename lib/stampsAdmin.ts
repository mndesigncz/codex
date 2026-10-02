// Správa razítek z administrace: statistika kampaně, ruční úprava razítek hosta
// s důvodem, storno poslední akce, duplikace, řazení a stavy kampaní.
// Čistá logika (plán, validace, rozpad po dnech) je v lib/stampsPlan.ts.

import { sql } from './client';
import { zajistiRazitka } from './stampsSchema';
import { pragueToday, pragueDayOf, parseDbTime } from './pragueTime';
import { addStamps, shapeCampaign, type StampCampaign } from './stamps';
import { planOdebrani, prumerDnu, rozpadPoDnech, sCasem, type Stav } from './stampsPlan';

export interface ChybaAkce { chyba: string; status: number }
const je = (chyba: string, status = 400): ChybaAkce => ({ chyba, status });

/** Kampaň týmu podle id, nebo null. */
export async function kampanTymu(teamId: number, id: number): Promise<StampCampaign | null> {
  await zajistiRazitka();
  const [r] = await sql`SELECT * FROM client_stamp_campaigns WHERE id = ${id} AND team_id = ${teamId}`;
  return r ? shapeCampaign(r) : null;
}

// ---- statistika --------------------------------------------------------------

export interface StatistikaKampane {
  sbirajici: number; otevrenaRazitka: number; dokonceno: number; razitekCelkem: number;
  odmenVydano: number; odmenUplatneno: number; odmenCeka: number;
  prumernaDobaDni: number | null; dobaZVzorku: number;
  top: { customerId: number; jmeno: string; dokonceno: number; razitek: number }[];
  poDnech: { den: string; razitek: number; karet: number }[];
}

export async function statistikaKampane(teamId: number, id: number): Promise<StatistikaKampane> {
  await zajistiRazitka();
  const [sou, vydej, doby, top, dny] = await Promise.all([
    sql`SELECT COUNT(*)::int AS sbirajici, COALESCE(SUM(stamps), 0)::int AS otevrena, COALESCE(SUM(completed), 0)::int AS dokonceno
        FROM client_stamp_progress WHERE team_id = ${teamId} AND campaign_id = ${id}`,
    sql`SELECT COUNT(*)::int AS vydano, COUNT(*) FILTER (WHERE cl.redeemed_at IS NOT NULL)::int AS uplatneno
        FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id
        WHERE cl.team_id = ${teamId} AND c.campaign_id = ${id}`,
    sql`SELECT EXTRACT(EPOCH FROM (created_at - card_started_at)) / 86400 AS dnu
        FROM client_stamp_events
        WHERE team_id = ${teamId} AND campaign_id = ${id} AND completions > 0 AND card_started_at IS NOT NULL AND undone_at IS NULL
        ORDER BY id DESC LIMIT 500`,
    sql`SELECT sp.customer_id, us.name, sp.completed, sp.stamps
        FROM client_stamp_progress sp JOIN users us ON us.id = sp.customer_id
        WHERE sp.team_id = ${teamId} AND sp.campaign_id = ${id} AND (sp.completed > 0 OR sp.stamps > 0)
        ORDER BY sp.completed DESC, sp.stamps DESC, sp.customer_id LIMIT 5`,
    sql`SELECT day AS den,
               COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0)::int AS razitek,
               COALESCE(SUM(completions), 0)::int AS karet
        FROM client_stamp_events
        WHERE team_id = ${teamId} AND campaign_id = ${id} AND kind IN ('earn', 'manual') AND undone_at IS NULL AND day >= ${pragueDayOf(new Date(Date.now() - 29 * 86400000))}
        GROUP BY day`,
  ]) as any[][];
  const [celkem] = await sql`
    SELECT COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0)::int AS razitek FROM client_stamp_events
    WHERE team_id = ${teamId} AND campaign_id = ${id} AND kind IN ('earn', 'manual') AND undone_at IS NULL` as any[];
  const vzorek = doby.map(r => Number(r.dnu));
  const vyd = Number(vydej[0]?.vydano) || 0; const upl = Number(vydej[0]?.uplatneno) || 0;
  return {
    sbirajici: Number(sou[0]?.sbirajici) || 0, otevrenaRazitka: Number(sou[0]?.otevrena) || 0, dokonceno: Number(sou[0]?.dokonceno) || 0,
    razitekCelkem: Number(celkem?.razitek) || 0,
    odmenVydano: vyd, odmenUplatneno: upl, odmenCeka: Math.max(0, vyd - upl),
    prumernaDobaDni: prumerDnu(vzorek), dobaZVzorku: vzorek.length,
    top: top.map(r => ({ customerId: Number(r.customer_id), jmeno: String(r.name ?? ''), dokonceno: Number(r.completed) || 0, razitek: Number(r.stamps) || 0 })),
    poDnech: rozpadPoDnech(dny.map(r => ({ den: String(r.den), razitek: Number(r.razitek) || 0, karet: Number(r.karet) || 0 })), pragueToday(), 30),
  };
}

// ---- ruční úprava razítek hosta ----------------------------------------------------

export interface KartaClena {
  campaignId: number; nazev: string; potrebnych: number; razitek: number; dokonceno: number;
  stav: Stav; posledniUdalost: { id: number; kind: string; delta: number; completions: number; kdy: string; duvod: string | null } | null;
}

export async function kartyClena(teamId: number, customerId: number): Promise<{ karty: KartaClena[]; udalosti: any[] }> {
  await zajistiRazitka();
  const kampane = (await sql`SELECT * FROM client_stamp_campaigns WHERE team_id = ${teamId} AND status <> 'archived' ORDER BY position, id`) as any[];
  const prog = new Map(((await sql`SELECT * FROM client_stamp_progress WHERE team_id = ${teamId} AND customer_id = ${customerId}`) as any[]).map(r => [Number(r.campaign_id), r]));
  const posledni = (await sql`
    SELECT DISTINCT ON (campaign_id) id, campaign_id, kind, delta, completions, created_at, reason
    FROM client_stamp_events
    WHERE team_id = ${teamId} AND customer_id = ${customerId} AND undone_at IS NULL AND (delta <> 0 OR completions > 0)
    ORDER BY campaign_id, id DESC`) as any[];
  const poKampani = new Map(posledni.map(r => [Number(r.campaign_id), r]));
  const udalosti = (await sql`
    SELECT e.id, e.campaign_id, c.name AS kampan, e.kind, e.delta, e.completions, e.reason, e.created_at, e.undone_at, e.staff_id, u.name AS obsluha
    FROM client_stamp_events e
    JOIN client_stamp_campaigns c ON c.id = e.campaign_id
    LEFT JOIN users u ON u.id = e.staff_id
    WHERE e.team_id = ${teamId} AND e.customer_id = ${customerId} AND (e.delta <> 0 OR e.completions > 0)
    ORDER BY e.id DESC LIMIT 15`) as any[];
  return {
    karty: kampane.map(r => {
      const c = shapeCampaign(r); const pr = prog.get(c.id); const ev = poKampani.get(c.id);
      return {
        campaignId: c.id, nazev: c.name, potrebnych: c.required_stamps,
        razitek: Number(pr?.stamps ?? 0), dokonceno: Number(pr?.completed ?? 0), stav: c.status,
        posledniUdalost: ev ? { id: Number(ev.id), kind: String(ev.kind), delta: Number(ev.delta), completions: Number(ev.completions), kdy: String(ev.created_at), duvod: ev.reason ?? null } : null,
      };
    }),
    udalosti,
  };
}

/**
 * Majitel připíše (kladné `delta`) nebo odebere (záporné) razítka hostovi.
 * Důvod je povinný — vidí ho deník člena i audit. Připsání obchází denní strop,
 * okno platnosti a pauzu mezi kartami, ale limit dokončených karet platí.
 */
export async function upravRazitka(o: { teamId: number; campaignId: number; customerId: number; delta: number; duvod: string; staffId: number }): Promise<{ ok: true; razitek: number; dokonceni: number; veta: string } | ChybaAkce> {
  const delta = Math.round(o.delta);
  const duvod = o.duvod.trim().slice(0, 200);
  if (!delta) return je('Zadej, kolik razítek připsat nebo odebrat.');
  if (Math.abs(delta) > 50) return je('Najednou jde upravit nejvýš 50 razítek.');
  if (duvod.length < 3) return je('Napiš důvod úpravy (aspoň pár slov) — uvidí ho v deníku člena.');
  const c = await kampanTymu(o.teamId, o.campaignId);
  if (!c) return je('Kampaň nenalezena.', 404);
  const [clen] = await sql`SELECT 1 AS ano FROM client_memberships WHERE team_id = ${o.teamId} AND customer_id = ${o.customerId}`;
  if (!clen) return je('Host není členem podniku.', 404);

  if (delta > 0) {
    const r = await addStamps(c, o.customerId, delta, `manual:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, { staffId: o.staffId, rucne: true, reason: duvod, druh: 'manual' });
    if (r.skipped) return je(r.skipped, 409);
    const veta = `${c.name}: +${r.added}${r.completions > 0 ? `, karta dokončena${r.completions > 1 ? ` ${r.completions}×` : ''} (odměna je v kuponech)` : ` (${r.stamps}/${c.required_stamps})`}${r.dropped ? `; ${r.dropped} navíc se nevešlo` : ''}`;
    return { ok: true, razitek: r.stamps, dokonceni: r.completions, veta };
  }

  await sql`INSERT INTO client_stamp_progress (campaign_id, customer_id, team_id) VALUES (${c.id}, ${o.customerId}, ${o.teamId}) ON CONFLICT (campaign_id, customer_id) DO NOTHING`;
  const den = pragueToday();
  const vysl = await sCasem({
    nacti: async () => { const [r] = await sql`SELECT * FROM client_stamp_progress WHERE campaign_id = ${c.id} AND customer_id = ${o.customerId}`; return r; },
    spocitej: r => planOdebrani({ stamps: Number(r?.stamps ?? 0) }, -delta),
    zapis: async (r, p) => {
      if (p.odebrano <= 0) return true;
      const [upd] = await sql`
        UPDATE client_stamp_progress SET stamps = ${p.razitek}, rev = rev + 1
        WHERE campaign_id = ${c.id} AND customer_id = ${o.customerId} AND rev = ${Number(r?.rev ?? 0)} RETURNING rev`;
      return !!upd;
    },
  });
  if (!vysl) return je('Kartu právě upravuje někdo jiný. Zkus to za chvilku znovu.', 409);
  if (vysl.plan.odebrano <= 0) return je('Host nemá žádná razítka k odebrání.', 409);
  await sql`
    INSERT INTO client_stamp_events (team_id, campaign_id, customer_id, kind, delta, before_stamps, before_completed, before_started_at, staff_id, day, reason)
    VALUES (${o.teamId}, ${c.id}, ${o.customerId}, 'manual', ${-vysl.plan.odebrano}, ${Number(vysl.stav?.stamps ?? 0)}, ${Number(vysl.stav?.completed ?? 0)}, ${parseDbTime(vysl.stav?.started_at)?.toISOString() ?? null}, ${o.staffId}, ${den}, ${duvod})`;
  await sql`
    INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note, staff_id)
    VALUES (${o.teamId}, ${o.customerId}, 0, 'manual', 'razitka', ${`${c.name}: −${vysl.plan.odebrano} razítek ručně · důvod: ${duvod}`}, ${o.staffId})`;
  return { ok: true, razitek: vysl.plan.razitek, dokonceni: 0, veta: `${c.name}: −${vysl.plan.odebrano} (${vysl.plan.razitek}/${c.required_stamps})` };
}

/**
 * Storno poslední akce s razítky u jedné kampaně. Vrací kartu do stavu před akcí
 * a odebere kupon za kartu, kterou ta akce dokončila — pokud ho host mezitím
 * neuplatnil. `ocekavanaUdalost` chrání před stornem jiné akce, než kterou
 * obsluha viděla (dvojklik, dva správci naráz).
 */
export async function stornoPosledni(o: { teamId: number; campaignId: number; customerId: number; ocekavanaUdalost?: number | null; staffId: number }): Promise<{ ok: true; razitek: number; veta: string } | ChybaAkce> {
  const c = await kampanTymu(o.teamId, o.campaignId);
  if (!c) return je('Kampaň nenalezena.', 404);
  const [posl] = await sql`
    SELECT * FROM client_stamp_events
    WHERE team_id = ${o.teamId} AND campaign_id = ${c.id} AND customer_id = ${o.customerId} AND undone_at IS NULL AND (delta <> 0 OR completions > 0 OR kind = 'expire')
    ORDER BY id DESC LIMIT 1`;
  if (!posl) return je('Není co stornovat.', 404);
  if (o.ocekavanaUdalost && Number(posl.id) !== o.ocekavanaUdalost) return je('Mezitím přibyla jiná změna. Načti kartu znovu.', 409);
  if (!['earn', 'manual'].includes(String(posl.kind))) return je('Poslední změnou bylo propadnutí karty — to se stornovat nedá. Razítka připiš ručně.', 409);
  if (Number(posl.completions) > 0) {
    const [uplatneno] = await sql`
      SELECT 1 AS ano FROM client_coupon_claims cl JOIN client_coupons cp ON cp.id = cl.coupon_id
      WHERE cp.team_id = ${o.teamId} AND cp.stamp_event_id = ${Number(posl.id)} AND cl.redeemed_at IS NOT NULL LIMIT 1`;
    if (uplatneno) return je('Odměnu z té karty host už uplatnil, storno nejde.', 409);
  }
  const vysl = await sCasem({
    nacti: async () => { const [r] = await sql`SELECT * FROM client_stamp_progress WHERE campaign_id = ${c.id} AND customer_id = ${o.customerId}`; return r; },
    spocitej: () => true,
    zapis: async r => {
      const earned = String(posl.kind) === 'earn' ? Math.max(0, Number(posl.delta)) : 0;
      const [upd] = await sql`
        UPDATE client_stamp_progress SET stamps = ${Number(posl.before_stamps)}, completed = ${Number(posl.before_completed)},
          started_at = ${(parseDbTime(posl.before_started_at) ?? new Date()).toISOString()},
          day_stamps = CASE WHEN day_of = ${String(posl.day)} THEN GREATEST(0, day_stamps - ${earned}) ELSE day_stamps END,
          rev = rev + 1
        WHERE campaign_id = ${c.id} AND customer_id = ${o.customerId} AND rev = ${Number(r?.rev ?? 0)} RETURNING rev`;
      return !!upd;
    },
  });
  if (!vysl) return je('Kartu právě upravuje někdo jiný. Zkus to za chvilku znovu.', 409);
  // ref dostane příponu, ať jde za stejnou účtenku/návštěvu razítko připsat znovu.
  await sql`UPDATE client_stamp_events SET undone_at = NOW(), ref = CASE WHEN ref IS NULL THEN NULL ELSE ref || ':storno' END WHERE id = ${Number(posl.id)}`;
  if (Number(posl.completions) > 0) {
    await sql`DELETE FROM client_coupon_claims WHERE team_id = ${o.teamId} AND coupon_id IN (SELECT id FROM client_coupons WHERE team_id = ${o.teamId} AND stamp_event_id = ${Number(posl.id)})`;
    await sql`DELETE FROM client_coupons WHERE team_id = ${o.teamId} AND stamp_event_id = ${Number(posl.id)}`;
  }
  const veta = `${c.name}: stornována poslední akce (${Number(posl.delta) > 0 ? '+' : ''}${posl.delta}), zpět ${Number(posl.before_stamps)}/${c.required_stamps}`;
  await sql`
    INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note, staff_id)
    VALUES (${o.teamId}, ${o.customerId}, 0, 'manual', 'razitka', ${veta}, ${o.staffId})`;
  return { ok: true, razitek: Number(posl.before_stamps), veta };
}

// ---- seznam kampaní: duplikace, řazení, stav ----------------------------------------

/** Kopie kampaně jako koncept (bez průběhů hostů). Vrací id kopie. */
export async function duplikujKampan(teamId: number, id: number): Promise<number | null> {
  const c = await kampanTymu(teamId, id);
  if (!c) return null;
  const jmeno = `${c.name} (kopie)`.slice(0, 120);
  const [r] = await sql`
    INSERT INTO client_stamp_campaigns (
      team_id, name, description, conditions, active, status, valid_since, valid_till, required_stamps, rule_type,
      stamp_items, excluded_items, min_value, min_value_multiple, one_per_order, reward_title, reward_items,
      days_to_finish, days_to_redeem, repeat_mode, stack_cards, max_completions, daily_cap, days_of_week, hour_from, hour_till, position)
    VALUES (
      ${teamId}, ${jmeno}, ${c.description}, ${c.conditions}, FALSE, 'draft', ${c.valid_since}, ${c.valid_till}, ${c.required_stamps}, ${c.rule_type},
      ${JSON.stringify(c.stamp_items)}::jsonb, ${JSON.stringify(c.excluded_items)}::jsonb, ${c.min_value}, ${c.min_value_multiple}, ${c.one_per_order}, ${c.reward_title}, ${JSON.stringify(c.reward_items)}::jsonb,
      ${c.days_to_finish}, ${c.days_to_redeem}, ${c.repeat_mode}, ${c.stack_cards}, ${c.max_completions}, ${c.daily_cap}, ${JSON.stringify(c.days_of_week)}::jsonb, ${c.hour_from}, ${c.hour_till},
      (SELECT COALESCE(MAX(position), 0) + 1 FROM client_stamp_campaigns WHERE team_id = ${teamId}))
    RETURNING id`;
  return Number(r.id);
}

/** Posun kampaně o jedno místo nahoru / dolů; pozice se přečíslují 1…n. */
export async function presunKampan(teamId: number, id: number, smer: 'up' | 'down'): Promise<boolean> {
  await zajistiRazitka();
  const ids = ((await sql`SELECT id FROM client_stamp_campaigns WHERE team_id = ${teamId} ORDER BY position, id`) as any[]).map(r => Number(r.id));
  const i = ids.indexOf(id);
  const j = smer === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return false;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const pozice = ids.map((_, k) => k + 1);
  await sql`
    UPDATE client_stamp_campaigns c SET position = v.p
    FROM unnest(${ids}::int[], ${pozice}::int[]) AS v(id, p)
    WHERE c.id = v.id AND c.team_id = ${teamId}`;
  return true;
}

export async function nastavStav(teamId: number, id: number, stav: Stav): Promise<boolean> {
  await zajistiRazitka();
  const [r] = await sql`UPDATE client_stamp_campaigns SET status = ${stav}, active = ${stav === 'active'} WHERE id = ${id} AND team_id = ${teamId} RETURNING id`;
  return !!r;
}
