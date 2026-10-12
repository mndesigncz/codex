import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'crypto';
import { hit, clear } from '@/lib/rateLimit';
import { neon } from '@neondatabase/serverless';
import { pragueToday, pragueDaySafe, parseDbTime, dayPlus } from '@/lib/pragueTime';
import { autoCloseEntry, isForgottenClockOut, pragueMoment, denSmeny } from '@/lib/staleShifts';
import { notifyUser } from '@/lib/push';
import { jeClenem } from '@/lib/tenant';
import { pozaduj, jeOdpoved, clenoveSOpravnenim } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { vyberSmenuPichacek, type SmenaPichacek } from '@/lib/dochazkaPrehled';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Current wall-clock time in Prague as "HH:MM".
function hhmmPrague(d = new Date()): string {
  return d.toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' });
}

// Pražské „d. M. HH:MM" pro push a audit (hodiny jsou mzda — člověk má vidět, co se změnilo).
function denCas(d: Date | null): string {
  return d
    ? d.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '…';
}

/** Nejdelší důvod ruční opravy (time_entries.note) — stejný strop jako Textarea v okně. */
const MAX_DUVOD = 300;

/**
 * Důvod ruční opravy z těla požadavku: undefined = beze změny, '' nebo null = smazat,
 * jinak ořezaný text nejvýš MAX_DUVOD znaků. Neplatný tvar vrátí chybu pro 400.
 */
function duvodZTela(v: unknown): { duvod?: string | null; chyba?: string } {
  if (v === undefined) return {};
  if (v === null) return { duvod: null };
  if (typeof v !== 'string') return { chyba: 'Neplatný důvod.' };
  const d = v.trim();
  if (d.length > MAX_DUVOD) return { chyba: `Důvod může mít nejvýš ${MAX_DUVOD} znaků.` };
  return { duvod: d || null };
}

/**
 * Ruční čas musí dávat smysl: záznam nejvýš 24 h (delší se do mzdy stejně nepočítá —
 * lib/wages) a nic v budoucnosti (s deseti minutami na rozladěné hodiny). Překlep
 * v roce nebo v AM/PM by jinak tiše přidal nebo ubral hodiny ve mzdě.
 */
function chybaCasu(od: Date, doCasu: Date | null): string | null {
  const strop = Date.now() + 10 * 60 * 1000;
  if (od.getTime() > strop || (doCasu && doCasu.getTime() > strop)) return 'Čas nemůže být v budoucnosti.';
  if (doCasu && doCasu.getTime() - od.getTime() > 24 * 3600 * 1000) return 'Záznam je delší než 24 hodin — zkontroluj časy.';
  return null;
}

// Ensure the employee has a shift for `date`; create an auto one if not, so the
// closing counts it. Returns silently on any error (e.g. column not migrated).
async function ensureShift(teamId: number, employeeId: number, date: string, start: string, end: string) {
  try {
    const [sh] = await sql`SELECT id FROM shifts WHERE employee_id = ${employeeId} AND date = ${date} AND team_id = ${teamId} LIMIT 1`;
    if (sh) return;
    try {
      await sql`INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type, auto_created)
                VALUES (${teamId}, ${employeeId}, ${date}, ${start}, ${end}, 'auto', TRUE)`;
    } catch {
      await sql`INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type)
                VALUES (${teamId}, ${employeeId}, ${date}, ${start}, ${end}, 'auto')`;
    }
  } catch { /* best-effort */ }
}

// Sazba člověka v tomhle podniku: z členství, u starých účtů ze zrcadla
// users (jako roster výš). Nula = nenastaveno; výpadek sloupce = null.
async function vlastniSazba(userId: number, teamId: number): Promise<number | null> {
  try {
    const [r] = await sql`
      SELECT CASE WHEN m.user_id IS NOT NULL THEN COALESCE(m.hourly_rate, 0) ELSE COALESCE(u.hourly_rate, 0) END AS sazba
      FROM users u LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${teamId}
      WHERE u.id = ${userId}`;
    return r ? Number(r.sazba) || 0 : null;
  } catch { return null; }
}

// GET — s dochazka.tablet nebo dochazka.zobrazit: dnešní roster s živým
// stavem; s dochazka.zobrazit navíc záznamy; hodinové sazby jen s
// finance.mzdy (Provozní docházku vidí, sazby ne). Ostatní: vlastní záznamy.
export async function GET(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const opr = c.role.opravneni;

  if (opr.has('dochazka.tablet') || opr.has('dochazka.zobrazit')) {
    // Roster: every employee + their currently-open entry (if clocked in)
    // + today's planned shift so the kiosk can show plan vs reality.
    // Kolo 7: plán je jen PLÁNOVANÁ směna. Automatická (type 'auto', vzniká při
    // příchodu bez rozvrhu se začátkem i koncem v čase příchodu) by se tvářila
    // jako „plán 14:12–14:12": Píchačky by ji ukázaly jako rozvrh, Otevřené
    // příchody by z ní udělaly noční směnu do zítřka a hlídač níž by po půl
    // hodině poslal „Směna ti už skončila" každému, kdo přišel bez rozvrhu.
    const today = pragueToday();
    // Kolo 62: v rosteru je každý, kdo má v podniku ČLENSTVÍ nebo zrcadlo —
    // člen přepnutý do jiného podniku z tabletu nezmizí. Sazba je z členství
    // v TOMHLE podniku (nikdy ze zrcadla cizího). Otevřený příchod i směna se
    // berou jen odsud, jinak by watchdog níž zavřel příchod z podniku B pod
    // hlavičkou A; NULL u time_entries jsou řádky z doby před sloupcem team_id.
    const rosterQuery = (withRate: boolean) => sql`
      SELECT u.id, u.name, u.avatar,
             CASE WHEN ${withRate}
                  THEN (CASE WHEN m.user_id IS NOT NULL THEN COALESCE(m.hourly_rate, 0) ELSE COALESCE(u.hourly_rate, 0) END)
                  ELSE NULL END AS "hourlyRate",
             (u.pin IS NOT NULL AND u.pin <> '') AS "hasPin",
             te.clock_in AS "openSince",
             te.id AS "openEntryId", te.nudged_at AS "nudgedAt",
             sh.start_time AS "shiftStart", sh.end_time AS "shiftEnd"
      FROM users u
      LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${c.teamId}
      LEFT JOIN LATERAL (
        SELECT id, clock_in, nudged_at FROM time_entries
        WHERE employee_id = u.id AND clock_out IS NULL
          AND (team_id = ${c.teamId} OR team_id IS NULL)
        ORDER BY clock_in DESC LIMIT 1
      ) te ON TRUE
      LEFT JOIN LATERAL (
        SELECT start_time, end_time FROM shifts
        WHERE employee_id = u.id AND date = ${today} AND team_id = ${c.teamId}
          AND auto_created IS NOT TRUE AND type <> 'auto'
        ORDER BY start_time ASC LIMIT 1
      ) sh ON TRUE
      WHERE (m.user_id IS NOT NULL OR u.team_id = ${c.teamId})
        AND COALESCE(m.role, u.role) IN ('employee','employer')
      ORDER BY COALESCE(m.role, u.role) DESC, u.name ASC`;
    let roster: any[];
    try {
      roster = await rosterQuery(opr.has('finance.mzdy'));
    } catch {
      // hourly_rate not migrated yet — retry without touching the column
      roster = await sql`
        SELECT u.id, u.name, u.avatar, NULL AS "hourlyRate",
               (u.pin IS NOT NULL AND u.pin <> '') AS "hasPin",
               te.clock_in AS "openSince",
               sh.start_time AS "shiftStart", sh.end_time AS "shiftEnd"
        FROM users u
        LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${c.teamId}
        LEFT JOIN LATERAL (
          SELECT clock_in FROM time_entries
          WHERE employee_id = u.id AND clock_out IS NULL
            AND (team_id = ${c.teamId} OR team_id IS NULL)
          ORDER BY clock_in DESC LIMIT 1
        ) te ON TRUE
        LEFT JOIN LATERAL (
          SELECT start_time, end_time FROM shifts
          WHERE employee_id = u.id AND date = ${today} AND team_id = ${c.teamId} AND type <> 'auto'
          ORDER BY start_time ASC LIMIT 1
        ) sh ON TRUE
        WHERE (m.user_id IS NOT NULL OR u.team_id = ${c.teamId})
          AND COALESCE(m.role, u.role) IN ('employee','employer')
        ORDER BY COALESCE(m.role, u.role) DESC, u.name ASC`;
    }

    // hasPin: PINy se ukládají do pin_hash (PATCH /api/kiosk) a starý čitelný
    // sloupec pin se po prvním použití nuluje. Dotaz výš čte jen pin, takže po
    // uložení PINu hlásil hasPin=false — tablet pak nenabídl číselník a člověk
    // se z tabletu nemohl odpíchnout ani zrušit PIN. Čte se zvlášť, ať výpadek
    // sloupce pin_hash (chybí migrace) neshodí celý roster.
    try {
      const ids = (roster as any[]).map(r => Number(r.id));
      if (ids.length) {
        const rows = await sql`SELECT id FROM users WHERE id = ANY(${ids}) AND pin_hash IS NOT NULL AND pin_hash <> ''`;
        const shash = new Set((rows as any[]).map(r => Number(r.id)));
        for (const r of roster as any[]) r.hasPin = r.hasPin === true || shash.has(Number(r.id));
      }
    } catch { /* bez pin_hash zůstává starý sloupec pin */ }

    // Inline watchdog: the shop kiosk polls this endpoint all day, so every
    // roster load doubles as the hourly check that Vercel's daily-cron limit
    // won't give us. The daily cron stays as a backstop for quiet teams.
    try {
      const nowMs = Date.now();
      for (const r of roster as any[]) {
        if (!r.openSince || !r.openEntryId) continue;
        const inMs = new Date(r.openSince).getTime();
        if (isForgottenClockOut(r.openSince)) {
          await autoCloseEntry({ id: r.openEntryId, employee_id: Number(r.id), team_id: c.teamId, clock_in: r.openSince });
          r.openSince = null; r.openEntryId = null;
        } else if (!r.nudgedAt && r.shiftEnd) {
          const planned = pragueMoment(today, String(r.shiftEnd));
          if (planned && planned.getTime() > inMs && nowMs - planned.getTime() > 30 * 60 * 1000) {
            await notifyUser(Number(r.id), {
              title: '🕐 Pořád jsi na směně?',
              body: 'Směna ti už skončila a pořád jsi odpíchnutý/á. Jestli ještě pracuješ, nic neřeš. Jestli jsi doma, odpíchni si odchod — jinak ho v noci doplníme za tebe podle uzávěrky a ráno to bude chtít zkontrolovat.',
              type: 'warning',
              category: 'shift',
              link: '/employee/shifts',
            });
            try { await sql`UPDATE time_entries SET nudged_at = NOW() WHERE id = ${r.openEntryId}`; } catch { /* not migrated */ }
          }
        }
      }
    } catch { /* watchdog is best-effort */ }

    // Vlastní sazba pro „Můj výdělek" (kolo 69, katalog: moje.vydelek): kdo
    // vidí roster bez sazeb (bez finance.mzdy), ale smí znát svou mzdu
    // (finance.moje_mzda), dostane sazbu jen na vlastním řádku. Cizí sazby
    // tím nevidí — jinak by widget musel chodit na další endpoint.
    if (!opr.has('finance.mzdy') && opr.has('finance.moje_mzda')) {
      const ja = (roster as any[]).find(r => Number(r.id) === c.meId);
      if (ja) ja.hourlyRate = await vlastniSazba(c.meId, c.teamId);
    }

    let entries: any[] = [];
    if (opr.has('dochazka.zobrazit')) {
      const { searchParams } = new URL(req.url);
      const days = Math.min(180, Math.max(1, parseInt(searchParams.get('days') ?? '30')));
      // Kolo 7: k záznamu plánovaná směna (plán proti skutečnosti) a kdo ho ručně
      // upravil. Směna jedním dotazem pro všechny záznamy (LATERAL, žádných N
      // dotazů): téhož člověka v tomhle podniku, z pražského dne příchodu, nebo
      // noční (konec ≤ začátek) ze dne před ním — příchod po půlnoci patří
      // včerejšku. Z kandidátů ta, jejíž začátek je nejblíž příchodu. Automatické
      // směny se nepočítají (nejsou plán, vznikly z příchodu samého).
      try {
        entries = await sql`
          SELECT te.id, te.employee_id AS "employeeId", u.name AS "employeeName", u.avatar AS "employeeAvatar",
                 te.clock_in AS "clockIn", te.clock_out AS "clockOut", te.source, te.note,
                 te.updated_by AS "updatedBy", ub.name AS "updatedByName", te.updated_at AS "updatedAt",
                 pl.start_time AS "planStart", pl.end_time AS "planEnd", pl.date AS "planDate"
          FROM time_entries te
          LEFT JOIN users u ON u.id = te.employee_id
          LEFT JOIN users ub ON ub.id = te.updated_by
          LEFT JOIN LATERAL (
            SELECT s.date, s.start_time, s.end_time FROM shifts s
            WHERE s.employee_id = te.employee_id AND s.team_id = ${c.teamId}
              AND s.auto_created IS NOT TRUE AND s.type <> 'auto'
              AND s.date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND s.start_time ~ '^[0-9]{2}:[0-9]{2}'
              AND (s.date = to_char(te.clock_in AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD')
                OR (s.date = to_char((te.clock_in AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague') - INTERVAL '1 day', 'YYYY-MM-DD')
                    AND LEFT(s.end_time, 5) <= LEFT(s.start_time, 5)))
            ORDER BY ABS(EXTRACT(EPOCH FROM ((te.clock_in AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague') - (s.date || ' ' || LEFT(s.start_time, 5))::timestamp)))
            LIMIT 1
          ) pl ON TRUE
          WHERE te.team_id = ${c.teamId}
            AND te.clock_in >= NOW() - (${days} || ' days')::interval
          ORDER BY te.clock_in DESC`;
      } catch {
        // updated_by / updated_at ještě nejsou (migrace /api/init) — záznamy bez plánu a stopy úprav, jako dřív.
        entries = await sql`
          SELECT te.id, te.employee_id AS "employeeId", u.name AS "employeeName", u.avatar AS "employeeAvatar",
                 te.clock_in AS "clockIn", te.clock_out AS "clockOut", te.source, te.note
          FROM time_entries te
          LEFT JOIN users u ON u.id = te.employee_id
          WHERE te.team_id = ${c.teamId}
            AND te.clock_in >= NOW() - (${days} || ' days')::interval
          ORDER BY te.clock_in DESC`;
      }
    }
    // Prémie a srážky za stejné období — jen kdo vidí mzdy (jako sazby). Jedna adresa pro hodiny, sazby i úpravy,
    // ať Souhrn hodin, Mzdy a nástroj nemusí na další endpoint. Bez migrace prázdné.
    let adjustments: any[] = [];
    if (opr.has('dochazka.zobrazit') && opr.has('finance.mzdy')) {
      const { searchParams } = new URL(req.url);
      const days = Math.min(180, Math.max(1, parseInt(searchParams.get('days') ?? '30')));
      try {
        adjustments = await sql`
          SELECT id, user_id AS "userId", day, amount, note, source FROM wage_adjustments
          WHERE team_id = ${c.teamId} AND day >= ${pragueDaySafe(new Date(Date.now() - (days - 1) * 86400000))}
          ORDER BY day DESC, id DESC`;
      } catch { /* wage_adjustments ještě nejsou (migrace) */ }
    }
    return NextResponse.json({ roster, entries, adjustments });
  }

  // Zaměstnanec — vlastní záznamy (posledních 70 dní — i „minulý měsíc" na 31.) v TOMHLE podniku.
  // Kolo 69 (nález N14): bez filtru podniku sčítalo „Odpracováno" na Domů
  // hodiny ze všech podniků, kde člověk pracuje — barista ve dvou kavárnách
  // viděl součet obou. NULL připouští řádky z doby před sloupcem team_id
  // (stejně jako otevřený příchod v POST).
  // Kolo 7: i kdo záznam ručně upravil (updatedBy) — „Moje docházka" u něj ukáže „ručně".
  let entries: any[];
  try {
    entries = await sql`
      SELECT id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut", source, note, updated_by AS "updatedBy"
      FROM time_entries
      WHERE employee_id = ${c.meId} AND clock_in >= NOW() - INTERVAL '70 days'
        AND (team_id = ${c.teamId} OR team_id IS NULL)
      ORDER BY clock_in DESC`;
  } catch {
    // updated_by ještě není (migrace) — bez stopy úprav, jako dřív.
    entries = await sql`
      SELECT id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut", source, note
      FROM time_entries
      WHERE employee_id = ${c.meId} AND clock_in >= NOW() - INTERVAL '70 days'
        AND (team_id = ${c.teamId} OR team_id IS NULL)
      ORDER BY clock_in DESC`;
  }
  // Their own open entry rides along so the clock widget works for them too.
  // Jen otevřený příchod v tomhle podniku: Píchačky by jinak ukazovaly
  // „na směně" podle příchodu v jiném podniku a odchod (POST) by ho nenašel.
  let openSince: string | null = null;
  try {
    const [openRow] = await sql`
      SELECT clock_in FROM time_entries
      WHERE employee_id = ${c.meId} AND clock_out IS NULL
        AND (team_id = ${c.teamId} OR team_id IS NULL)
      ORDER BY clock_in DESC LIMIT 1`;
    openSince = openRow?.clock_in ?? null;
  } catch { /* ignore */ }
  // Vlastní sazba jen s oprávněním na vlastní (nebo všechny) mzdy — pro „Můj výdělek".
  const smiSazbu = opr.has('finance.moje_mzda') || opr.has('finance.mzdy');
  // Dnešní směna z rozvrhu pro Píchačky (kolo 7) — jedním dotazem tady, ne přes
  // /api/shifts: Píchačky jsou i na Domů a widget má jednu adresu. Dnešek a noční
  // směna ze včerejška, která ještě běží (příchod po půlnoci patří včerejšku);
  // vybírá lib/dochazkaPrehled.vyberSmenuPichacek. Automatické směny nejsou rozvrh.
  let smena: SmenaPichacek | null = null;
  try {
    const dnes = pragueToday();
    const smeny = await sql`
      SELECT date, start_time, end_time FROM shifts
      WHERE employee_id = ${c.meId} AND team_id = ${c.teamId} AND date IN (${dnes}, ${dayPlus(dnes, -1)})
        AND auto_created IS NOT TRUE AND type <> 'auto'
      ORDER BY date DESC, start_time ASC`;
    smena = vyberSmenuPichacek(smeny as { date: string; start_time: string; end_time: string }[], dnes, Date.now(), openSince);
  } catch { /* bez rozvrhu Píchačky jen neukážou plán */ }
  const ja: Record<string, unknown> = {
    id: c.meId, openSince,
    shiftStart: smena?.shiftStart ?? null, shiftEnd: smena?.shiftEnd ?? null, shiftDate: smena?.shiftDate ?? null,
  };
  if (smiSazbu) ja.hourlyRate = await vlastniSazba(c.meId, c.teamId);
  // Vlastní prémie a srážky (Můj výdělek) — kdo smí znát svou mzdu, vidí i co k ní vedení přidalo.
  let adjustments: any[] = [];
  if (smiSazbu) {
    try {
      adjustments = await sql`
        SELECT id, user_id AS "userId", day, amount, note, source FROM wage_adjustments
        WHERE team_id = ${c.teamId} AND user_id = ${c.meId} AND day >= ${pragueDaySafe(new Date(Date.now() - 69 * 86400000))}
        ORDER BY day DESC, id DESC`;
    } catch { /* bez migrace */ }
  }
  return NextResponse.json({ roster: [ja], entries, adjustments });
}

// POST — clock in / out. Sám za sebe kdokoli z podniku; za jiného jen
// s dochazka.tablet (a jeho PINem); celý záznam zpětně s dochazka.upravit.
export async function POST(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const opr = c.role.opravneni;

  const b = await req.json().catch(() => ({}));
  const employeeId = parseInt(b.employeeId);
  const action = b.action === 'out' ? 'out' : 'in';
  if (!Number.isFinite(employeeId)) return NextResponse.json({ error: 'Chybí zaměstnanec' }, { status: 400 });

  // Manual complete entry: kdo upravuje docházku, doplní zapomenutý záznam
  // členovi svého podniku ({ employeeId, clockIn, clockOut } as ISO).
  // Bez oprávnění se požadavek dál chová jako dřív u zaměstnance: jako
  // píchnutí (a za jiného skončí na 403 níž).
  if (opr.has('dochazka.upravit') && b.clockIn && b.clockOut) {
    // Kolo 62: členství nebo zrcadlo — člen přepnutý jinam tu dřív dostal
    // „není ve vašem týmu".
    if (!(await jeClenem(employeeId, c.teamId))) {
      return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu' }, { status: 400 });
    }
    const ci = new Date(b.clockIn), co = new Date(b.clockOut);
    if (isNaN(+ci) || isNaN(+co) || co <= ci) {
      return NextResponse.json({ error: 'Odchod musí být po příchodu.' }, { status: 400 });
    }
    const casChyba = chybaCasu(ci, co);
    if (casChyba) return NextResponse.json({ error: casChyba }, { status: 400 });
    // Kolo 7: ruční záznam je zásah do mzdových dat — nese důvod, kdo ho přidal a kdy, a jde do auditu.
    const { duvod, chyba } = duvodZTela(b.note);
    if (chyba) return NextResponse.json({ error: chyba }, { status: 400 });
    let entry: any;
    try {
      [entry] = await sql`
        INSERT INTO time_entries (team_id, employee_id, clock_in, clock_out, source, note, updated_by, updated_at)
        VALUES (${c.teamId}, ${employeeId}, ${ci.toISOString()}, ${co.toISOString()}, 'manual', ${duvod ?? null}, ${c.meId}, NOW())
        RETURNING id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut"`;
    } catch {
      // updated_by / updated_at ještě nejsou (migrace) — záznam i důvod se uloží bez stopy.
      [entry] = await sql`
        INSERT INTO time_entries (team_id, employee_id, clock_in, clock_out, source, note)
        VALUES (${c.teamId}, ${employeeId}, ${ci.toISOString()}, ${co.toISOString()}, 'manual', ${duvod ?? null})
        RETURNING id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut"`;
    }
    let jmeno = '';
    try { jmeno = String((await sql`SELECT name FROM users WHERE id = ${employeeId}`)[0]?.name ?? ''); } catch { /* jméno je jen do auditu */ }
    await audit(c.teamId, c.meId, 'dochazka.pridat', 'time_entry', entry?.id ?? null,
      `${jmeno || `#${employeeId}`}: ${denCas(ci)} – ${denCas(co)}${duvod ? ` · ${duvod}` : ''}`);
    return NextResponse.json({ ok: true, entry });
  }

  // Authorization: za sebe každý; za jiného jen s dochazka.tablet. Vlastní
  // píchnutí jde vždy jako 'self' bez PINu — i u Vedení, které tablet
  // oprávnění má (jinak by si vedoucí s PINem musel PIN zadávat sám sobě).
  // Účet tabletu jede vždy tabletovou cestou, jako dřív.
  const zaJineho = employeeId !== c.meId;
  if (zaJineho && !opr.has('dochazka.tablet')) {
    return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  }
  const isKiosk = zaJineho || c.role.typ === 'kiosk';
  let empPinHash: string | null = null;
  // PIN je na osobě (users), ne na členství — čte se zvlášť; příslušnost
  // k podniku rozhoduje členství nebo zrcadlo (kolo 62).
  const [emp] = await sql`SELECT id, pin FROM users WHERE id = ${employeeId}`;
  try {
    const [h] = await sql`SELECT pin_hash FROM users WHERE id = ${employeeId}`;
    empPinHash = h?.pin_hash ?? null;
  } catch { /* sloupec ještě není — jede se po staru */ }
  if (!emp || !(await jeClenem(employeeId, c.teamId))) {
    return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu' }, { status: 400 });
  }
  // PIN check for shared-kiosk clock-ins when the employee has one set.
  if (isKiosk && (empPinHash || emp.pin)) {
    // Čtyřmístný PIN má deset tisíc kombinací. Bez omezení pokusů se dá projít
    // za pár minut přímo z tabletu na baru, proto pět pokusů za deset minut.
    const gate = await hit(`pin:${employeeId}`, 5, 10 * 60, { failClosed: true });
    if (!gate.ok) {
      return NextResponse.json(
        { error: `Moc pokusů. Zkus to za ${Math.ceil(gate.retryAfter / 60)} min.` },
        { status: 429 });
    }
    const given = String(b.pin ?? '');
    let okPin = false;
    if (empPinHash) {
      okPin = await bcrypt.compare(given, empPinHash);
    } else if (emp.pin) {
      // Starý čitelný PIN. Porovná se časově konstantně a hned se převede na
      // hash, aby další přihlášení už čitelný nepotřebovalo.
      const a = Buffer.from(given), c = Buffer.from(String(emp.pin));
      okPin = a.length === c.length && timingSafeEqual(a, c);
      if (okPin) {
        try {
          const nh = await bcrypt.hash(given, 10);
          await sql`UPDATE users SET pin_hash = ${nh}, pin = NULL WHERE id = ${employeeId}`;
        } catch { /* převod počká na příště */ }
      }
    }
    if (!okPin) return NextResponse.json({ error: 'Nesprávný PIN' }, { status: 403 });
    await clear(`pin:${employeeId}`);
  }

  // Otevřený příchod v TOMHLE podniku. Bez filtru odchod v podniku A zavřel
  // příchod z podniku B. NULL připouští řádky z doby před sloupcem team_id.
  const [open] = await sql`
    SELECT id, clock_in FROM time_entries
    WHERE employee_id = ${employeeId} AND clock_out IS NULL
      AND (team_id = ${c.teamId} OR team_id IS NULL)
    ORDER BY clock_in DESC LIMIT 1`;

  const today = pragueToday();

  if (action === 'in') {
    let autoClosedPrevious = false;
    if (open) {
      // A forgotten clock-out from a previous day must not block today's
      // arrival — close the stale entry at a sensible time and carry on.
      // Tady denní doba nerozhoduje: kdo si píchá příchod, ten předchozí směnu
      // prokazatelně dokončil — dvě otevřené najednou být nemůžou.
      const openMs = Date.now() - new Date(open.clock_in).getTime();
      if (openMs > 60 * 60 * 1000) {
        const { autoCloseEntry } = await import('@/lib/staleShifts');
        try {
          await autoCloseEntry({ id: open.id, employee_id: employeeId, team_id: c.teamId, clock_in: open.clock_in });
          autoClosedPrevious = true;
        } catch { /* fall through to the 409 below */ }
      }
      if (!autoClosedPrevious) {
        return NextResponse.json({ error: 'Příchod už je zaznamenaný.' }, { status: 409 });
      }
    }
    const [row] = await sql`
      INSERT INTO time_entries (team_id, employee_id, source)
      VALUES (${c.teamId}, ${employeeId}, ${isKiosk ? 'kiosk' : 'self'})
      RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
    // Žádná plánovaná směna? Založí se automatická, aby ji uzávěrka viděla.
    // Den NENÍ „dnes podle hodin na zdi": kdo klepne na příchod po půlnoci
    // v podniku, který zavírá ve dvě, patří ještě k včerejšku. Dřív tu bylo
    // `today` — a sobotní směna v baru se založila jako nedělní, v den, kdy
    // je zavřeno. Odchod (níž) tohle pravidlo znal; příchod ne.
    const now = hhmmPrague();
    const denSmenyPrichodu = await denSmeny(c.teamId, employeeId, new Date());
    await ensureShift(c.teamId, employeeId, denSmenyPrichodu, now, now);

    // Late check: a planned start more than 10 minutes ago means the shift
    // started without them — tell the employer while it still matters.
    try {
      const [planned] = await sql`
        SELECT start_time FROM shifts
        WHERE employee_id = ${employeeId} AND date = ${denSmenyPrichodu} AND start_time IS NOT NULL
          AND team_id = ${c.teamId}
        ORDER BY start_time ASC LIMIT 1`;
      if (planned?.start_time) {
        const [ph, pm] = String(planned.start_time).split(':').map(Number);
        const [nh, nm] = now.split(':').map(Number);
        const lateMin = (nh * 60 + nm) - (ph * 60 + pm);
        if (lateMin > 10 && lateMin < 12 * 60) {
          const [emp2] = await sql`SELECT name FROM users WHERE id = ${employeeId}`;
          // Kdo vidí docházku týmu (kolo 67), ne pevně „vedení".
          const employers = (await clenoveSOpravnenim(c.teamId, 'dochazka.zobrazit')).filter(id => id !== employeeId);
          const { notifyUsers } = await import('@/lib/push');
          await notifyUsers(employers, {
            title: '⏰ Pozdní příchod',
            body: `${emp2?.name ?? 'Zaměstnanec'} se odpíchl/a v ${now} — směna začínala v ${String(planned.start_time).slice(0, 5)} (+${lateMin} min).`,
            type: 'warning',
            category: 'shift',
            link: '/employer/overview?view=attendance',
          });
        }
      }
    } catch { /* late check is best-effort */ }

    return NextResponse.json({ ok: true, action: 'in', entry: row, autoClosedPrevious });
  }

  // clock out
  if (!open) return NextResponse.json({ error: 'Žádný otevřený příchod k odpíchnutí.' }, { status: 409 });
  const [row] = await sql`
    UPDATE time_entries SET clock_out = NOW() WHERE id = ${open.id}
    RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
  // Směna patří dni, kdy začala. Kdo se odpíchne po půlnoci, hledal by jinak
  // svou směnu i uzávěrku pod zítřejším datem — a nenašel ani jedno. A „den,
  // kdy začala" se počítá stejným pravidlem jako u příchodu, jinak by si
  // příchod založil směnu na sobotu a odchod ji hledal pod nedělí.
  const shiftDay = await denSmeny(c.teamId, employeeId, parseDbTime(open.clock_in) ?? new Date());
  // Extend the auto-created shift's end to the real clock-out time.
  try { await sql`UPDATE shifts SET end_time = ${hhmmPrague()} WHERE employee_id = ${employeeId} AND date = ${shiftDay} AND auto_created = TRUE`; } catch { /* not migrated */ }

  // Nudge: does the closing for this shift's business day still need filling?
  let closingDone = true;
  try {
    const [cl] = await sql`
      SELECT id FROM cash_closings
      WHERE created_by = ${employeeId} AND COALESCE(shift_date, date) = ${shiftDay}`;
    closingDone = !!cl;
  } catch {
    try {
      const [cl] = await sql`SELECT id FROM cash_closings WHERE created_by = ${employeeId} AND date = ${shiftDay}`;
      closingDone = !!cl;
    } catch { /* ignore */ }
  }

  return NextResponse.json({ ok: true, action: 'out', entry: row, closingDone });
}

// PATCH — ruční oprava záznamu: { id, clockIn?: ISO, clockOut?: ISO | null, note?: string }.
// Bez clockIn i clockOut = „Ukončit" na teď. `note` je důvod opravy: undefined = beze
// změny, '' = smazat. Každá změna zapíše, kdo ji udělal a kdy (updated_by, updated_at),
// a jde do auditu — hodiny jsou mzda, účetní i člověk mají vidět, proč se měnily.
export async function PATCH(req: NextRequest) {
  const c = await pozaduj('dochazka.upravit');
  if (jeOdpoved(c)) return c;

  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  const { duvod, chyba } = duvodZTela(b.note);
  if (chyba) return NextResponse.json({ error: chyba }, { status: 400 });

  const [entry] = await sql`
    SELECT te.id, te.clock_in, te.clock_out, te.note, te.employee_id, u.name
    FROM time_entries te LEFT JOIN users u ON u.id = te.employee_id
    WHERE te.id = ${id} AND te.team_id = ${c.teamId}`;
  if (!entry) return NextResponse.json({ error: 'Záznam nenalezen' }, { status: 404 });

  // Časy z databáze nemají zónu (UTC) — přes parseDbTime, ať porovnání „změnilo se?" nezávisí na zóně serveru.
  const puvodniOd = parseDbTime(entry.clock_in) ?? new Date(entry.clock_in);
  const puvodniDo = parseDbTime(entry.clock_out);

  // clockIn optional (edit). clockOut given ⇒ set it; clockOut omitted with no
  // clockIn ⇒ force-close to now (the "Ukončit" button).
  let inTs = puvodniOd;
  if (b.clockIn !== undefined) {
    const p = new Date(b.clockIn);
    if (Number.isNaN(p.getTime())) return NextResponse.json({ error: 'Neplatný čas příchodu.' }, { status: 400 });
    inTs = p;
  }
  let outTs: Date | null = puvodniDo;
  if (b.clockOut !== undefined) {
    if (b.clockOut === null || b.clockOut === '') outTs = null;
    else {
      const p = new Date(b.clockOut);
      if (Number.isNaN(p.getTime())) return NextResponse.json({ error: 'Neplatný čas odchodu.' }, { status: 400 });
      outTs = p;
    }
  } else if (b.clockIn === undefined && b.note === undefined) {
    outTs = new Date(); // force-close to now
  }
  if (outTs && outTs.getTime() <= inTs.getTime()) {
    return NextResponse.json({ error: 'Odchod musí být po příchodu.' }, { status: 400 });
  }
  const casChyba = chybaCasu(inTs, outTs);
  if (casChyba) return NextResponse.json({ error: casChyba }, { status: 400 });

  const casZmenen = inTs.getTime() !== puvodniOd.getTime()
    || (outTs?.getTime() ?? null) !== (puvodniDo?.getTime() ?? null);
  const duvodZmenen = duvod !== undefined && (duvod ?? null) !== (entry.note ?? null);
  const zmena = casZmenen || duvodZmenen;
  const novyDuvod = duvodZmenen ? duvod ?? null : entry.note ?? null;

  let row: any;
  try {
    [row] = await sql`
      UPDATE time_entries
      SET clock_in = ${inTs.toISOString()}, clock_out = ${outTs ? outTs.toISOString() : null}, note = ${novyDuvod},
          updated_by = CASE WHEN ${zmena} THEN ${c.meId}::int ELSE updated_by END,
          updated_at = CASE WHEN ${zmena} THEN NOW() ELSE updated_at END
      WHERE id = ${id} AND team_id = ${c.teamId}
      RETURNING id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut", note`;
  } catch {
    // updated_by / updated_at ještě nejsou (migrace) — čas a důvod se uloží bez stopy.
    [row] = await sql`
      UPDATE time_entries SET clock_in = ${inTs.toISOString()}, clock_out = ${outTs ? outTs.toISOString() : null}, note = ${novyDuvod}
      WHERE id = ${id} AND team_id = ${c.teamId}
      RETURNING id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut", note`;
  }

  if (zmena) {
    const pred = `${denCas(puvodniOd)} – ${denCas(puvodniDo)}`;
    const po = `${denCas(inTs)} – ${denCas(outTs)}`;
    await audit(c.teamId, c.meId, 'dochazka.upravit', 'time_entry', id,
      `${entry.name ?? `#${entry.employee_id}`}: ${casZmenen ? `${pred} → ${po}` : po}${novyDuvod ? ` · ${novyDuvod}` : ''}`);
  }

  // The person whose hours changed deserves to know — hours are wages. A s důvodem,
  // ať se nemusí ptát, proč mu někdo sáhl na hodiny.
  if (casZmenen && row && Number(row.employeeId) !== c.meId) {
    try {
      await notifyUser(Number(row.employeeId), {
        title: '🕐 Upravená docházka',
        body: `Vedení upravilo tvůj záznam: ${denCas(inTs)} – ${denCas(outTs)}${novyDuvod ? ` · ${novyDuvod}` : '.'}`,
        type: 'info',
        category: 'shift',
        link: '/employee/shifts',
      });
    } catch { /* best-effort */ }
  }
  return NextResponse.json({ ok: true, entry: row });
}

// DELETE ?id= — smazání záznamu docházky (hodiny = mzda, proto vlastní klíč).
export async function DELETE(req: NextRequest) {
  const c = await pozaduj('dochazka.mazat');
  if (jeOdpoved(c)) return c;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  const [smazany] = await sql`
    DELETE FROM time_entries WHERE id = ${id} AND team_id = ${c.teamId}
    RETURNING employee_id, clock_in, clock_out`;
  // Smazané hodiny zmizí i ze mzdy — do auditu, kdo a čí záznam smazal (kolo 7).
  if (smazany) {
    let jmeno = '';
    try { jmeno = String((await sql`SELECT name FROM users WHERE id = ${smazany.employee_id}`)[0]?.name ?? ''); } catch { /* jen do auditu */ }
    await audit(c.teamId, c.meId, 'dochazka.smazat', 'time_entry', id,
      `${jmeno || `#${smazany.employee_id}`}: ${denCas(parseDbTime(smazany.clock_in))} – ${denCas(parseDbTime(smazany.clock_out))}`);
  }
  return NextResponse.json({ ok: true });
}
