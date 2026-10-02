// Přehledy věrnosti — dotazy do databáze. Čistá logika (rozřazení zdrojů, hodnota bodu, CSV)
// je v lib/bodyPravidla.ts.
//
// Dny se všude počítají podle pražských hodin: časy v databázi jsou UTC, takže
// přímé přetypování sloupce na date by po půlnoci (do 1–2 hodin ráno) hodilo řádek na včerejšek.
// Sloupec se proto nejdřív převede `AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague'`.

import { sql } from './client';
import { pragueToday, dayPlus, dbTimeDayHM } from './pragueTime';
import {
  druhOdkazu, hodnotaBodu, souhrnZdroju, zdrojRadkuDeniku, DRUH_DENIKU, MAX_DNU_OBDOBI, MAX_RADKU_EXPORTU, jeRazeni, obdobiZDotazu,
  type RadekDeniku, type RadekZdroju, type SouhrnZdroje, type DruhOdkazu, type Razeni,
} from './bodyPravidla';

export { MAX_DNU_OBDOBI, MAX_RADKU_EXPORTU, jeRazeni, obdobiZDotazu, type Razeni };

/** Seznam dní od–do včetně (pražské kalendářní dny). */
function dnyMezi(od: string, doo: string): string[] {
  const out: string[] = [];
  for (let d = od; d <= doo && out.length < MAX_DNU_OBDOBI + 1; d = dayPlus(d, 1)) out.push(d);
  return out;
}

export interface BodRady {
  day: string; active: number; points_given: number; points_spent: number; new_members: number; redeemed: number;
}

/**
 * Řada po dnech pro graf Přehledu. „Členové u kasy" jsou hosté se skutečnou návštěvou nebo
 * útratou (razítko, objednávka, účtenka, částka u kasy) — ne každý řádek deníku, takže ruční
 * úprava bodů nebo narozeninový dárek z hosta „návštěvníka" neudělá.
 */
export async function radaPoDnech(teamId: number, dnu = 31): Promise<BodRady[]> {
  const doo = pragueToday();
  const od = dayPlus(doo, -(dnu - 1));
  const [denik, clenove, kupony] = await Promise.all([
    sql`
      SELECT x.d::text AS day,
             COUNT(DISTINCT x.customer_id) FILTER (WHERE x.kind IN ('visit', 'order') OR x.ref = 'card' OR x.ref LIKE 'bill:%')::int AS active,
             COALESCE(SUM(x.delta) FILTER (WHERE x.delta > 0), 0)::int AS points_given,
             COALESCE(-SUM(x.delta) FILTER (WHERE x.delta < 0), 0)::int AS points_spent
      FROM (
        SELECT l.customer_id, l.delta, l.kind, l.ref,
               (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date AS d
        FROM client_loyalty_ledger l
        WHERE l.team_id = ${teamId} AND l.created_at >= (${od}::date - 1)
      ) x
      WHERE x.d BETWEEN ${od}::date AND ${doo}::date
      GROUP BY x.d` as Promise<any[]>,
    sql`
      SELECT (m.joined_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date::text AS day, COUNT(*)::int AS n
      FROM client_memberships m
      WHERE m.team_id = ${teamId} AND m.joined_at >= (${od}::date - 1)
        AND (m.joined_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date BETWEEN ${od}::date AND ${doo}::date
      GROUP BY 1` as Promise<any[]>,
    sql`
      SELECT (cl.redeemed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date::text AS day, COUNT(*)::int AS n
      FROM client_coupon_claims cl
      WHERE cl.team_id = ${teamId} AND cl.redeemed_at >= (${od}::date - 1)
        AND (cl.redeemed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date BETWEEN ${od}::date AND ${doo}::date
      GROUP BY 1` as Promise<any[]>,
  ]);
  const poDni = <T extends { day: string }>(rows: T[]) => new Map(rows.map(r => [String(r.day), r]));
  const a = poDni(denik), n = poDni(clenove), k = poDni(kupony);
  return dnyMezi(od, doo).map(day => ({
    day,
    active: Number(a.get(day)?.active) || 0,
    points_given: Number(a.get(day)?.points_given) || 0,
    points_spent: Number(a.get(day)?.points_spent) || 0,
    new_members: Number((n.get(day) as any)?.n) || 0,
    redeemed: Number((k.get(day) as any)?.n) || 0,
  }));
}

export interface PrehledBodu {
  obdobi: { od: string; do: string };
  zavazek: {
    members: number; points: number; credit: number; membersWithPoints: number; membersWithCredit: number;
    /** Odhad hodnoty jednoho bodu v měně podniku; null = nejde odhadnout. */
    pointValue: number | null; pointsValue: number | null;
    /** Zůstatek nevyčerpaných dárkových poukazů (dluh podniku v penězích). */
    poukazy: number; poukazuAktivnich: number;
  };
  /** Výnosnost za období: kolik útraty prošlo účtenkami s věrností a kolik stála odměna. */
  vynosnost: {
    utrata: number; ucty: number; cashbackKredit: number; cashbackBody: number; bodyRozdane: number; storno: number;
    /** Odhad nákladu odměn v % z útraty (kredit + body × hodnota bodu); null, když nejde odhadnout. */
    nakladPct: number | null;
  };
  zdroje: SouhrnZdroje[];
  top: { id: number; name: string; points: number; credit: number; visits: number; spend: number; lastVisitAt: string | null }[];
}

/** Závazek, zdroje bodů za období a top hosté. */
export async function prehledBodu(teamId: number, obdobi: { od: string; do: string }, razeni: Razeni, limit = 10): Promise<PrehledBodu> {
  const [z] = await sql`
    SELECT COUNT(*)::int AS members,
           COALESCE(SUM(points), 0)::float8 AS points, COALESCE(SUM(credit), 0)::float8 AS credit,
           COUNT(*) FILTER (WHERE points > 0)::int AS with_points, COUNT(*) FILTER (WHERE credit > 0)::int AS with_credit
    FROM client_memberships WHERE team_id = ${teamId}` as any[];
  const kupony = await sql`
    SELECT cost_points, amount_off FROM client_coupons
    WHERE team_id = ${teamId} AND active = TRUE AND kind = 'offer' AND cost_points > 0 AND amount_off > 0` as any[];
  const hodnota = hodnotaBodu(kupony);
  const body = Number(z?.points) || 0;

  const radky = await sql`
    SELECT l.kind,
           CASE WHEN l.ref IS NULL OR l.ref = '' THEN 'none' WHEN l.ref = 'card' THEN 'card' WHEN l.ref LIKE 'bill:%' THEN 'bill'
                WHEN l.ref LIKE 'promo:%' THEN 'promo' WHEN l.ref LIKE 'ord:%' THEN 'ord' ELSE 'other' END AS odkaz,
           COALESCE(SUM(l.delta) FILTER (WHERE l.delta > 0), 0)::float8 AS given,
           COALESCE(-SUM(l.delta) FILTER (WHERE l.delta < 0), 0)::float8 AS spent,
           COUNT(*)::int AS n
    FROM client_loyalty_ledger l
    WHERE l.team_id = ${teamId} AND l.delta <> 0 AND l.created_at >= (${obdobi.od}::date - 1)
      AND (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date BETWEEN ${obdobi.od}::date AND ${obdobi.do}::date
    GROUP BY 1, 2` as any[];
  const zdroje = souhrnZdroju(radky.map(r => ({
    kind: String(r.kind), odkaz: String(r.odkaz) as DruhOdkazu, given: Number(r.given) || 0, spent: Number(r.spent) || 0, n: Number(r.n) || 0,
  } satisfies RadekZdroju)));

  const top = await sql`
    SELECT m.customer_id AS id, us.name, m.points, COALESCE(m.credit, 0) AS credit, m.visits,
           COALESCE((to_jsonb(m)->>'spend')::int, 0) AS spend, m.last_visit_at
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${teamId}
    ORDER BY
      CASE WHEN ${razeni} = 'body' THEN m.points END DESC NULLS LAST,
      CASE WHEN ${razeni} = 'navstevy' THEN m.visits END DESC NULLS LAST,
      CASE WHEN ${razeni} = 'utrata' THEN COALESCE((to_jsonb(m)->>'spend')::int, 0) END DESC NULLS LAST,
      m.points DESC, m.customer_id
    LIMIT ${Math.max(1, Math.min(50, limit))}` as any[];

  // Dárkové poukazy: nevyčerpaný zůstatek je stejný závazek jako kredit.
  let poukazy = 0; let poukazuAktivnich = 0;
  try {
    const [pk] = await sql`
      SELECT COALESCE(SUM(balance), 0)::float8 AS zustatek, COUNT(*)::int AS n FROM client_vouchers
      WHERE team_id = ${teamId} AND status = 'active' AND balance > 0 AND (valid_until IS NULL OR valid_until >= ${pragueToday()}::date)` as any[];
    poukazy = Number(pk?.zustatek) || 0; poukazuAktivnich = Number(pk?.n) || 0;
  } catch { /* poukazy bez migrace */ }
  // Výnosnost: útrata z účtenek s věrností (bez stornovaných) × cashback a rozdané body v období.
  let utrata = 0; let ucty = 0; let cashbackKredit = 0; let cashbackBody = 0; let storno = 0;
  try {
    const [u] = await sql`
      SELECT COALESCE(SUM(spend), 0)::float8 AS utrata, COUNT(*)::int AS n FROM client_bill_awards
      WHERE team_id = ${teamId} AND done_at IS NOT NULL AND reversed_at IS NULL
        AND (awarded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date BETWEEN ${obdobi.od}::date AND ${obdobi.do}::date` as any[];
    utrata = Number(u?.utrata) || 0; ucty = Number(u?.n) || 0;
    const [c] = await sql`
      SELECT COALESCE(SUM(credit_delta) FILTER (WHERE kind = 'cashback'), 0)::float8 AS kredit,
             COALESCE(SUM(delta) FILTER (WHERE kind = 'cashback'), 0)::float8 AS body,
             COALESCE(-SUM(delta) FILTER (WHERE kind = 'storno' AND delta < 0), 0)::float8 AS storno
      FROM client_loyalty_ledger
      WHERE team_id = ${teamId} AND created_at >= (${obdobi.od}::date - 1)
        AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date BETWEEN ${obdobi.od}::date AND ${obdobi.do}::date` as any[];
    cashbackKredit = Number(c?.kredit) || 0; cashbackBody = Number(c?.body) || 0; storno = Number(c?.storno) || 0;
  } catch { /* sloupce účtenek před migrací */ }
  const bodyRozdane = zdroje.reduce((a, r) => a + r.given, 0);
  const naklad = cashbackKredit + (hodnota != null ? bodyRozdane * hodnota : 0);
  const nakladPct = utrata > 0 && (hodnota != null || cashbackKredit > 0) ? Math.round((naklad / utrata) * 1000) / 10 : null;

  return {
    obdobi,
    vynosnost: { utrata, ucty, cashbackKredit, cashbackBody, bodyRozdane, storno, nakladPct },
    zavazek: {
      members: Number(z?.members) || 0, points: body, credit: Number(z?.credit) || 0,
      membersWithPoints: Number(z?.with_points) || 0, membersWithCredit: Number(z?.with_credit) || 0,
      pointValue: hodnota, pointsValue: hodnota == null ? null : Math.round(body * hodnota),
      poukazy, poukazuAktivnich,
    },
    zdroje,
    top: top.map(r => ({
      id: Number(r.id), name: String(r.name ?? ''), points: Number(r.points) || 0, credit: Number(r.credit) || 0,
      visits: Number(r.visits) || 0, spend: Number(r.spend) || 0, lastVisitAt: r.last_visit_at ? String(r.last_visit_at) : null,
    })),
  };
}

/** Deník za období pro CSV; `prebyva` = období má víc řádků, než se do jednoho souboru vejde. */
export async function denikProExport(teamId: number, obdobi: { od: string; do: string }): Promise<{ radky: RadekDeniku[]; prebyva: boolean }> {
  const rows = await sql`
    SELECT l.created_at, us.name, l.kind, l.ref, l.delta, l.credit_delta, l.note
    FROM client_loyalty_ledger l JOIN users us ON us.id = l.customer_id
    WHERE l.team_id = ${teamId} AND l.created_at >= (${obdobi.od}::date - 1)
      AND (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date BETWEEN ${obdobi.od}::date AND ${obdobi.do}::date
    ORDER BY l.created_at, l.id
    LIMIT ${MAX_RADKU_EXPORTU + 1}` as any[];
  const prebyva = rows.length > MAX_RADKU_EXPORTU;
  const radky = rows.slice(0, MAX_RADKU_EXPORTU).map(r => ({
    kdy: dbTimeDayHM(r.created_at),
    host: String(r.name ?? ''),
    druh: DRUH_DENIKU[String(r.kind)] ?? String(r.kind),
    body: Number(r.delta) || 0,
    kredit: Number(r.credit_delta) || 0,
    zdroj: zdrojRadkuDeniku(String(r.kind), r.ref, Number(r.delta) || 0, Number(r.credit_delta) || 0),
    poznamka: String(r.note ?? ''),
  }));
  return { radky, prebyva };
}

/** Pro test a kontrolu: stejná klasifikace odkazu jako v CASE výše. */
export { druhOdkazu };
