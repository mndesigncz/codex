// Scheduling rules the generator obeys: how many days in a row a person may be
// rostered, how many hours a month, and whether shifts are spread fairly across
// the team. Team-wide defaults with per-person overrides.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { audit } from '@/lib/audit';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { pragueToday } from '@/lib/pragueTime';
import { navrhPrahu, ocekavaneTrzby, vycistiNastaveniTrzeb, type TrzbyDnu } from '@/lib/rozvrhGenerator';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/** Team default: null = no limit. Anything outside 1–14 is nonsense for a rota. */
function cleanTeamLimit(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(14, Math.max(1, n));
}

/**
 * Per-person override, three states:
 *   null → follow the team default
 *   0    → explicitly no limit for this person (even when the team has one)
 *   1–14 → their own limit
 */
function cleanPersonLimit(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return 0;
  return Math.min(14, Math.max(1, n));
}

/** Team default hours/month: null = no limit; sane range 8–400. */
function cleanTeamHours(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(400, Math.max(8, n));
}

/** Per-person hours/month: null = follow team, 0 = explicitly no limit. */
function cleanPersonHours(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return 0;
  return Math.min(400, Math.max(8, n));
}

// Pravidla i osobní limity (úvazek) patří k nastavení rozvrhu. Dřív se
// kontrolovalo zrcadlo users.role, teď oprávnění v aktivním podniku.

export async function GET() {
  const c = await pozaduj('rozvrh.nastaveni');
  if (jeOdpoved(c)) return c;
  const u = { id: c.meId, team_id: c.teamId };

  let teamMax: number | null = null;
  let teamMaxHours: number | null = null;
  let balanceShifts = true;
  let splitShifts = false;
  try {
    const [t] = await sql`
      SELECT max_consecutive_days, max_month_hours, balance_shifts, allow_split_shifts FROM teams WHERE id = ${u.team_id}`;
    teamMax = t?.max_consecutive_days ?? null;
    teamMaxHours = t?.max_month_hours ?? null;
    balanceShifts = t?.balance_shifts !== false; // NULL = on
    splitShifts = t?.allow_split_shifts === true;
  } catch { /* not migrated yet */ }

  // Lidé podle členství a role z členství (kolo 62); limity zůstávají na
  // users. Alias `p`, protože `u` je tu volající.
  let members: any[] = [];
  try {
    members = await sql`
      SELECT p.id, p.name, p.avatar, COALESCE(m.role, p.role) AS role,
             p.max_consecutive_days AS "maxConsecutive",
             p.max_month_hours AS "maxHours", (p.split_shifts_ok IS NOT FALSE) AS "splitOk"
      FROM users p
      LEFT JOIN team_members m ON m.user_id = p.id AND m.team_id = ${u.team_id}
      WHERE (m.user_id IS NOT NULL OR p.team_id = ${u.team_id})
        AND COALESCE(m.role, p.role) IN ('employee','employer')
      ORDER BY COALESCE(m.role, p.role) DESC, p.name ASC`;
  } catch {
    members = await sql`
      SELECT p.id, p.name, p.avatar, COALESCE(m.role, p.role) AS role, NULL AS "maxConsecutive"
      FROM users p
      LEFT JOIN team_members m ON m.user_id = p.id AND m.team_id = ${u.team_id}
      WHERE (m.user_id IS NOT NULL OR p.team_id = ${u.team_id})
        AND COALESCE(m.role, p.role) IN ('employee','employer')
      ORDER BY COALESCE(m.role, p.role) DESC, p.name ASC`;
  }

  // Počet lidí podle tržeb (výchozí vypnuto). Průměry dnů v týdnu a návrh
  // prahu jen s finance.trzby — bez něj přepínač jde, ale čísla se neukážou
  // a generátor doporučení vynechá (a řekne to).
  let nastaveni = vycistiNastaveniTrzeb(null);
  let oteviraci: Record<string, any> | null = null;
  try {
    const [t] = await sql`SELECT staffing_rules, opening_hours FROM teams WHERE id = ${u.team_id}`;
    nastaveni = vycistiNastaveniTrzeb(t?.staffing_rules);
    oteviraci = t?.opening_hours ?? null;
  } catch { /* sloupec ještě není — funkce vypnutá */ }
  const smiTrzby = c.role.opravneni.has('finance.trzby');
  let dny: TrzbyDnu | null = null;
  if (smiTrzby) {
    const dnes = pragueToday();
    const od = (() => { const d = new Date(dnes + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 8 * 7); return d.toISOString().slice(0, 10); })();
    try {
      const rows = await sql`
        SELECT COALESCE(shift_date, date)::text AS date,
               SUM(COALESCE(cash_revenue, 0) + COALESCE(card_revenue, 0))::float AS trzba
        FROM cash_closings
        WHERE team_id = ${u.team_id} AND COALESCE(shift_date, date) >= ${od} AND COALESCE(shift_date, date) < ${dnes}
        GROUP BY 1`;
      dny = ocekavaneTrzby((rows as any[]).map(r => ({ date: String(r.date).slice(0, 10), trzba: Number(r.trzba) || 0 })), dnes, oteviraci);
    } catch { dny = {}; }
  }
  // Práh je typicky medián denní tržby (návrh z dat), takže prozrazuje
  // tržby stejně jako průměry: bez finance.trzby se vrací jen to, JESTLI je
  // nastavený, ne jeho hodnota.
  const trzby = {
    podleTrzeb: nastaveni.podleTrzeb,
    prah: smiTrzby ? nastaveni.prah : null,
    prahNastaven: nastaveni.prah != null,
    smiTrzby,
    ...(smiTrzby ? { dny: dny ?? {}, navrhPrahu: navrhPrahu(dny ?? {}) } : {}),
  };

  return NextResponse.json({ teamMax, teamMaxHours, balanceShifts, splitShifts, members, trzby });
}

// PUT { teamMax?, teamMaxHours?, balanceShifts?, trzby?: { podleTrzeb, prah }, overrides?: [{ id, maxConsecutive?, maxHours? }] }
export async function PUT(req: NextRequest) {
  const c = await pozaduj('rozvrh.nastaveni');
  if (jeOdpoved(c)) return c;
  const u = { id: c.meId, team_id: c.teamId };
  const b = await req.json().catch(() => ({}));

  try {
    if (b.teamMax !== undefined) {
      await sql`UPDATE teams SET max_consecutive_days = ${cleanTeamLimit(b.teamMax)} WHERE id = ${u.team_id}`;
    }
    if (b.teamMaxHours !== undefined) {
      await sql`UPDATE teams SET max_month_hours = ${cleanTeamHours(b.teamMaxHours)} WHERE id = ${u.team_id}`;
    }
    if (b.balanceShifts !== undefined) {
      await sql`UPDATE teams SET balance_shifts = ${b.balanceShifts === true} WHERE id = ${u.team_id}`;
    }
    if (b.splitShifts !== undefined) {
      await sql`UPDATE teams SET allow_split_shifts = ${b.splitShifts === true} WHERE id = ${u.team_id}`;
    }
    if (Array.isArray(b.overrides)) {
      for (const o of b.overrides.slice(0, 100)) {
        const id = parseInt(o?.id);
        if (!Number.isFinite(id)) continue;
        // Team-scoped: a stray id can never rewrite someone else's rota rule.
        // Členství NEBO zrcadlo (kolo 62): výjimka pro člena přepnutého jinam
        // se dřív tiše neuložila (UPDATE 0 řádků).
        if (o?.maxConsecutive !== undefined) {
          await sql`
            UPDATE users SET max_consecutive_days = ${cleanPersonLimit(o?.maxConsecutive)}
            WHERE id = ${id} AND (team_id = ${u.team_id}
              OR EXISTS (SELECT 1 FROM team_members m WHERE m.user_id = users.id AND m.team_id = ${u.team_id}))`;
        }
        if (o?.maxHours !== undefined) {
          await sql`
            UPDATE users SET max_month_hours = ${cleanPersonHours(o?.maxHours)}
            WHERE id = ${id} AND (team_id = ${u.team_id}
              OR EXISTS (SELECT 1 FROM team_members m WHERE m.user_id = users.id AND m.team_id = ${u.team_id}))`;
        }
        if (o?.splitOk !== undefined) {
          await sql`
            UPDATE users SET split_shifts_ok = ${o.splitOk === true}
            WHERE id = ${id} AND (team_id = ${u.team_id}
              OR EXISTS (SELECT 1 FROM team_members m WHERE m.user_id = users.id AND m.team_id = ${u.team_id}))`;
        }
      }
    }
  } catch {
    return NextResponse.json({ error: 'Pravidla nejsou dostupná — spusť /api/init.' }, { status: 400 });
  }

  // Počet lidí podle tržeb: jen s finance.trzby (práh prozrazuje tržby a bez
  // oprávnění ho klient ani nezná — kdyby ho poslal, smazal by ho). Vlastní
  // try/catch: chybějící sloupec staffing_rules (neproběhl /api/init) nesmí
  // shodit uložení ostatních pravidel, která se výš už zapsala.
  let trzbyNeulozeny = false;
  if (b.trzby !== undefined && c.role.opravneni.has('finance.trzby')) {
    // Vyčištěné celé — do JSON se nedostane nic jiného než { podleTrzeb, prah }.
    const t = vycistiNastaveniTrzeb(b.trzby);
    try {
      await sql`UPDATE teams SET staffing_rules = ${JSON.stringify(t)}::jsonb WHERE id = ${u.team_id}`;
    } catch { trzbyNeulozeny = true; }
  }

  audit(u.team_id, u.id, 'schedule.rules', 'schedule', null,
    b.teamMax !== undefined ? `Max dní po sobě: ${cleanTeamLimit(b.teamMax) ?? 'bez omezení'}` : 'Výjimky u lidí');
  return NextResponse.json({ ok: true, ...(trzbyNeulozeny ? { trzbyNeulozeny: true } : {}) });
}
