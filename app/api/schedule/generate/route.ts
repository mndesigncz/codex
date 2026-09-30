import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { tymyCiselniku, idClenu } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { pragueToday } from '@/lib/pragueTime';
import {
  navrhniRozvrh, ocekavaneTrzby, vycistiNastaveniTrzeb, type ClovekGeneratoru, type TypSmeny, type VstupGeneratoru,
} from '@/lib/rozvrhGenerator';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Rozhodování (kdo kam, povinná otevírací směna, žádoucí druhá, doporučení
// podle tržeb, díry a jejich úroveň) je v lib/rozvrhGenerator.ts, ať ho
// hlídají testy. Tady se jen načtou data aktivního podniku a výsledek vrátí.

function defaultsOpening() {
  const oh: Record<string, { open: string; close: string; closed: boolean }> = {};
  for (let d = 0; d <= 6; d++) oh[String(d)] = { open: '08:00', close: '20:00', closed: false };
  return oh;
}

export async function POST(req: Request) {
  const ctx = await pozaduj('rozvrh.generovat');
  if (jeOdpoved(ctx)) return ctx;

  const body = await req.json();
  const month: string = body.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });
  }

  // ---- Commit path: employer confirmed a preview → bulk insert ----
  if (body.commit) {
    const list: any[] = Array.isArray(body.shifts) ? body.shifts : [];
    if (list.length === 0) return NextResponse.json({ inserted: 0 });
    // Přepsání měsíce je zároveň vymazání měsíce — bez toho klíče by šel
    // generátorem obejít (kontroluje se před zápisem, ať nevznikne půlka).
    const nahradit = body.replaceMonth === true;
    if (nahradit && !ctx.role.opravneni.has('rozvrh.mazat_mesic')) {
      return NextResponse.json({ error: 'Na vymazání celého měsíce nemáš oprávnění — ulož návrh bez přepsání.' }, { status: 403 });
    }
    // Členství jednou (kolo 62) — stejná množina lidí, ze které vzešel
    // náhled, jinak se směny člena přepnutého jinam tiše zahodí.
    const clenove = new Set(await idClenu(ctx.teamId));
    const platne = list
      .map(s => ({ employeeId: parseInt(s.employeeId), date: String(s.date ?? ''), startTime: String(s.startTime ?? ''), endTime: String(s.endTime ?? ''), type: String(s.type ?? 'flexible') }))
      .filter(s => s.employeeId && s.date.startsWith(month + '-') && s.startTime && s.endTime && clenove.has(s.employeeId));
    // Verze uloženého měsíce, ze které plánovač vycházel (GET /api/schedule).
    // Bez ní (starší klient) se souběh nehlídá.
    const verze: string | null = typeof body.verze === 'string' && body.verze ? body.verze : null;

    // Smazání měsíce a vložení návrhu JEDNÍM příkazem: CTE běží atomicky nad
    // jedním snímkem, takže výpadek uprostřed nenechá měsíc napůl smazaný
    // (dřív DELETE a pak INSERT po jednom, každý vlastní HTTP dotaz). Zámek
    // na podnik a měsíc seřadí dvě současná uložení (dvojklik, dvě tlačítka,
    // dvě záložky): druhé po získání zámku vidí změněnou verzi a skončí 409,
    // místo aby vložilo návrh podruhé. Výraz verze MUSÍ sedět s GET
    // /api/schedule.
    const [, vysledek] = await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext(${`rozvrh-commit:${ctx.teamId}:${month}`}))`,
      sql`
        WITH kontrola AS (
          SELECT (${verze}::text IS NULL OR md5(COALESCE(string_agg(id::text || '|' || employee_id::text || '|' || date || '|' || start_time || '|' || end_time, ',' ORDER BY id), '')) = ${verze}::text) AS ok
          FROM shifts WHERE team_id = ${ctx.teamId} AND date >= ${month + '-01'} AND date <= ${month + '-31'}
        ),
        smazane AS (
          DELETE FROM shifts
          WHERE ${nahradit}::boolean AND (SELECT ok FROM kontrola)
            AND team_id = ${ctx.teamId} AND date >= ${month + '-01'} AND date <= ${month + '-31'}
          RETURNING id
        ),
        vlozene AS (
          INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type)
          SELECT ${ctx.teamId}, x.e, x.d, x.s, x.k, x.t
          FROM unnest(${platne.map(s => s.employeeId)}::int[], ${platne.map(s => s.date)}::text[], ${platne.map(s => s.startTime)}::text[], ${platne.map(s => s.endTime)}::text[], ${platne.map(s => s.type)}::text[]) AS x(e, d, s, k, t)
          WHERE (SELECT ok FROM kontrola)
          RETURNING id
        )
        SELECT (SELECT ok FROM kontrola) AS ok, (SELECT COUNT(*) FROM vlozene)::int AS vlozeno`,
    ]) as any[];
    const r = (vysledek as any[])?.[0];
    if (!r?.ok) {
      return NextResponse.json({
        error: 'Rozvrh tohoto měsíce mezitím někdo změnil (jiné okno nebo zařízení). Nic se neuložilo — návrh zůstal otevřený, zkontroluj uložené směny a ulož znovu.',
        konflikt: true,
      }, { status: 409 });
    }
    return NextResponse.json({ inserted: Number(r.vlozeno) || 0, ok: true });
  }

  // ---- Preview path: run the algorithm ----
  // Employees always; employers only when they submitted availability for
  // the month (i.e. they want to be scheduled too).
  // Členství NEBO zrcadlo a role z členství (kolo 62): člen přepnutý do
  // jiného podniku dřív z rozvrhu úplně vypadl. Dostupnost jen z TOHOHLE
  // podniku — vedoucí dvou podniků, který ji zadal jen v B, se v A neplánuje.
  const employeeRows = await sql`
    SELECT u.id, u.name, u.avatar FROM users u
    LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${ctx.teamId}
    WHERE (m.user_id IS NOT NULL OR u.team_id = ${ctx.teamId}) AND (
      COALESCE(m.role, u.role) = 'employee' OR (
        COALESCE(m.role, u.role) = 'employer' AND EXISTS (
          SELECT 1 FROM availability_requests a
          WHERE a.employee_id = u.id AND a.month = ${month} AND a.team_id = ${ctx.teamId}
        )
      )
    )
    ORDER BY u.name ASC`;
  const employeeIds = (employeeRows as any[]).map(r => Number(r.id));
  const availRows = await sql`
    SELECT employee_id, unavailable_dates, day_preferences, preferred_shift, max_shifts
    FROM availability_requests WHERE team_id = ${ctx.teamId} AND month = ${month}`;
  // Approved time off blocks those days regardless of submitted availability.
  let timeOffRows: any[] = [];
  try {
    timeOffRows = await sql`
      SELECT employee_id, from_date, to_date FROM time_off_requests
      WHERE team_id = ${ctx.teamId} AND status = 'approved'
        AND to_date >= ${month + '-01'} AND from_date <= ${month + '-31'}`;
  } catch { /* table not migrated yet */ }
  const timeOffByEmp = new Map<number, Set<string>>();
  for (const t of timeOffRows) {
    const set = timeOffByEmp.get(t.employee_id) ?? new Set<string>();
    const from = new Date(t.from_date + 'T00:00:00');
    const to = new Date(t.to_date + 'T00:00:00');
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      set.add(d.toISOString().split('T')[0]);
    }
    timeOffByEmp.set(t.employee_id, set);
  }
  // I typy ze zdrojového podniku organizace (kolo 60), vlastní první.
  // „Od otevření / do zavření" se níž překládá proti otevírací době TOHOHLE
  // podniku (resolveTimes), takže sdílená definice sedí každému.
  const tymy = await tymyCiselniku(ctx.teamId, 'typySmen');
  let shiftTypes: any[];
  try {
    shiftTypes = await sql`
      SELECT id, name, start_time, end_time, color, position, starts_at_open, ends_at_close
      FROM shift_types WHERE team_id = ANY(${tymy})
      ORDER BY (team_id = ${ctx.teamId}) DESC, position ASC, id ASC`;
  } catch {
    shiftTypes = await sql`
      SELECT id, name, start_time, end_time, color, position
      FROM shift_types WHERE team_id = ANY(${tymy})
      ORDER BY (team_id = ${ctx.teamId}) DESC, position ASC, id ASC`;
  }
  const fixedRows = await sql`
    SELECT employee_id, weekday, shift_type_id FROM fixed_assignments WHERE team_id = ${ctx.teamId}`;
  const [team] = await sql`SELECT opening_hours FROM teams WHERE id = ${ctx.teamId}`;

  // ---- Rule: how many days in a row may someone work ----
  let teamMaxConsecutive: number | null = null;
  let teamMaxHours: number | null = null;
  let balanceShifts = true;
  let splitShifts = false;
  try {
    const [t] = await sql`
      SELECT max_consecutive_days, max_month_hours, balance_shifts, allow_split_shifts FROM teams WHERE id = ${ctx.teamId}`;
    teamMaxConsecutive = t?.max_consecutive_days ?? null;
    teamMaxHours = t?.max_month_hours ?? null;
    balanceShifts = t?.balance_shifts !== false; // NULL = fair rotation on
    splitShifts = t?.allow_split_shifts === true;
  } catch {
    try {
      const [t] = await sql`SELECT max_consecutive_days FROM teams WHERE id = ${ctx.teamId}`;
      teamMaxConsecutive = t?.max_consecutive_days ?? null;
    } catch { /* not migrated yet — no limits */ }
  }
  const personalMax = new Map<number, number | null>();
  const personalHours = new Map<number, number | null>();
  const splitOk = new Map<number, boolean>();
  // Limity jsou sloupce users (na člověka), proto podle id osazenstva, ne podle zrcadla.
  try {
    const rows = await sql`
      SELECT id, max_consecutive_days, max_month_hours, split_shifts_ok FROM users WHERE id = ANY(${employeeIds})`;
    rows.forEach((r: any) => {
      personalMax.set(r.id, r.max_consecutive_days ?? null);
      personalHours.set(r.id, r.max_month_hours ?? null);
      splitOk.set(r.id, r.split_shifts_ok !== false);
    });
  } catch {
    try {
      const rows = await sql`
        SELECT id, max_consecutive_days FROM users WHERE id = ANY(${employeeIds})`;
      rows.forEach((r: any) => personalMax.set(r.id, r.max_consecutive_days ?? null));
    } catch { /* not migrated yet */ }
  }

  // Shifts already standing just before this month, so a streak that started in
  // the previous month keeps counting instead of resetting on the 1st.
  const carryFrom = (() => {
    const d = new Date(month + '-01T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 20);
    return d.toISOString().slice(0, 10);
  })();
  let priorShifts: any[] = [];
  try {
    priorShifts = await sql`
      SELECT employee_id, date FROM shifts
      WHERE team_id = ${ctx.teamId} AND date >= ${carryFrom} AND date < ${month + '-01'}`;
  } catch { /* ignore */ }
  const priorByEmp = new Map<number, Set<string>>();
  for (const r of priorShifts as any[]) {
    const set = priorByEmp.get(r.employee_id) ?? new Set<string>();
    set.add(String(r.date));
    priorByEmp.set(r.employee_id, set);
  }
  const openingHours =
    team?.opening_hours && Object.keys(team.opening_hours).length > 0 ? team.opening_hours : defaultsOpening();

  if (shiftTypes.length === 0) {
    return NextResponse.json({
      proposed: [],
      warnings: ['Nejsou nastaveny žádné typy směn. Přidej je v záložce „Typy směn".'],
      gaps: [], understaffed: [],
    });
  }
  if (employeeRows.length === 0) {
    return NextResponse.json({ proposed: [], warnings: ['V týmu nejsou žádní zaměstnanci.'], gaps: [], understaffed: [] });
  }

  const availByEmp = new Map<number, any>();
  availRows.forEach((a: any) => availByEmp.set(a.employee_id, a));

  const lide: ClovekGeneratoru[] = employeeRows.map((u: any) => {
    const a = availByEmp.get(u.id);
    return {
      id: u.id,
      name: u.name,
      avatar: u.avatar ?? '👤',
      unavailable: [...(a?.unavailable_dates ?? []), ...Array.from(timeOffByEmp.get(u.id) ?? new Set<string>())],
      dayPrefs: (a?.day_preferences ?? {}) as Record<string, string>,
      preferredShift: a?.preferred_shift ?? null,
      // Uložená 0 (dřívější formulář ji pustil) je „bez limitu“, stejně jako v přehledu vytížení.
      maxShifts: Number(a?.max_shifts) > 0 ? Number(a.max_shifts) : null,
      // Osobní výjimka vyhrává (0 = výslovně bez limitu), jinak týmový
      // výchozí; null všude = bez limitu.
      maxConsecutive: personalMax.get(u.id) === 0 ? null : (personalMax.get(u.id) ?? teamMaxConsecutive ?? null),
      maxHours: personalHours.get(u.id) === 0 ? null : (personalHours.get(u.id) ?? teamMaxHours ?? null),
      priorDates: Array.from(priorByEmp.get(u.id) ?? []),
      splitOk: splitOk.get(u.id) !== false,
    };
  });

  // ---- Počet lidí podle tržeb (volitelné, výchozí vypnuto) ----
  // Nastavení je v teams.staffing_rules (JSON). Tržby jsou citlivé: počítají
  // se jen s finance.trzby. Bez něj se doporučení vynechá a UI to řekne —
  // generátor pak jede jen podle povinné a žádoucí směny.
  let nastaveniTrzeb = vycistiNastaveniTrzeb(null);
  try {
    const [t] = await sql`SELECT staffing_rules FROM teams WHERE id = ${ctx.teamId}`;
    nastaveniTrzeb = vycistiNastaveniTrzeb(t?.staffing_rules);
  } catch { /* sloupec ještě není (spusť /api/init) — funkce zůstává vypnutá */ }
  let trzby: VstupGeneratoru['trzby'] = null;
  let stavTrzeb: 'ok' | 'bez_opravneni' | 'bez_dat' | 'bez_prahu' | null = null;
  if (nastaveniTrzeb.podleTrzeb) {
    if (!ctx.role.opravneni.has('finance.trzby')) {
      stavTrzeb = 'bez_opravneni';
    } else if (!nastaveniTrzeb.prah) {
      stavTrzeb = 'bez_prahu';
    } else {
      // Stejný zdroj jako kalendář uzávěrek (/api/closings/calendar): tržba
      // dne = hotovost + karta ze všech uzávěrek dne směny.
      const dnes = pragueToday();
      const od = (() => { const d = new Date(dnes + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 8 * 7); return d.toISOString().slice(0, 10); })();
      let historie: { date: string; trzba: number }[] = [];
      try {
        const rows = await sql`
          SELECT COALESCE(shift_date, date)::text AS date,
                 SUM(COALESCE(cash_revenue, 0) + COALESCE(card_revenue, 0))::float AS trzba
          FROM cash_closings
          WHERE team_id = ${ctx.teamId} AND COALESCE(shift_date, date) >= ${od} AND COALESCE(shift_date, date) < ${dnes}
          GROUP BY 1`;
        historie = (rows as any[]).map(r => ({ date: String(r.date).slice(0, 10), trzba: Number(r.trzba) || 0 }));
      } catch { historie = []; }
      const dny = ocekavaneTrzby(historie, dnes, openingHours);
      if (Object.keys(dny).length === 0) stavTrzeb = 'bez_dat';
      else { stavTrzeb = 'ok'; trzby = { prah: nastaveniTrzeb.prah, dny }; }
    }
  }

  // Uložené směny měsíce, když je uložení návrhu nepřepíše (bez
  // rozvrh.mazat_mesic nikdy, jinak podle přepínače v náhledu). Generátor je
  // bere jako obsazené — jinak hlásil falešné „Nikdo neotevře" na dnech
  // s uloženou otvíračkou a návrh pak vedle ní uložil další lidi.
  // Starší klient `nahradit` neposílá: pak platí výchozí stav přepínače
  // (zapnuto, když to role smí).
  const smiMazat = ctx.role.opravneni.has('rozvrh.mazat_mesic');
  const nahradit = smiMazat && body.nahradit !== false;
  let ulozene: VstupGeneratoru['ulozene'] = [];
  if (!nahradit) {
    const rows = await sql`
      SELECT employee_id, date, start_time, end_time, type FROM shifts
      WHERE team_id = ${ctx.teamId} AND date >= ${month + '-01'} AND date <= ${month + '-31'}`;
    ulozene = (rows as any[]).map(r => ({
      employeeId: Number(r.employee_id), date: String(r.date).slice(0, 10),
      startTime: String(r.start_time).slice(0, 5), endTime: String(r.end_time).slice(0, 5), type: r.type ?? null,
    }));
  }

  const vysledek = navrhniRozvrh({
    month,
    lide,
    typy: shiftTypes as TypSmeny[],
    openingHours,
    pevne: (fixedRows as any[]).map(f => ({ employeeId: f.employee_id, weekday: f.weekday, shiftTypeId: f.shift_type_id })),
    pravidla: { balanceShifts, splitShifts },
    trzby,
    ulozene,
  });

  // Tvar odpovědi: proposed/warnings/gaps/understaffed jako dřív (sondy
  // i plánovač je čtou beze změny), gaps a understaffed mají navíc `uroven`
  // (povinna | zadouci). O tržbách odpověď mlčí, když je funkce vypnutá.
  return NextResponse.json({
    ...vysledek,
    // Z čeho návrh vyšel: s přepsáním měsíce, nebo vedle uložených směn.
    nahradit,
    ...(stavTrzeb ? { trzby: { stav: stavTrzeb, prah: stavTrzeb === 'ok' ? nastaveniTrzeb.prah : null } } : {}),
  });
}
