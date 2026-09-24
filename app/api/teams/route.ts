import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { generateJoinCode } from '@/lib/team';
import { planInfoOf } from '@/lib/plan';
import { clenovePodniku } from '@/lib/tenant';
import { roleClena, pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { roleZTypu } from '@/lib/opravneni';

export const dynamic = 'force-dynamic';

async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  // Jen identita. Role ani podnik ze session se tu nečtou: podnik je
  // z databáze a oprávnění z členství (roleClena níž).
  return { id: parseInt((session.user as any).id) };
}

export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);

  try {
    // Resolve team from the user record (session teamId may be stale)
    // Jen z databáze. Dřív tu byl fallback na teamId ze session — a ten si
    // šel z prohlížeče přepsat, takže účet bez týmu si mohl nechat vypsat
    // cizí podnik i s join kódem.
    const [dbUser] = await sql`SELECT team_id FROM users WHERE id = ${me.id}`;
    const teamId = dbUser?.team_id ?? null;
    if (!teamId) return NextResponse.json({ team: null });

    // Core columns only — never depend on newer optional columns here, so a
    // pending migration can NEVER make a team look like it disappeared.
    const [team] = await sql`SELECT id, name, owner_id, join_code, created_at FROM teams WHERE id = ${teamId}`;
    if (!team) return NextResponse.json({ team: null });

    // Kolo 67: nastavení podniku (měna, uzávěrky, přehledy, tarif…) čte každý
    // člen — stojí na nich jeho vlastní obrazovky i tablet. Citlivá pole jen
    // s oprávněním: kód pro připojení (tym.pozvat), e-maily a telefony
    // (tym.kontakty), sazby (finance.mzdy), podrobnosti předplatného
    // (predplatne.zobrazit). Kdo v podniku není členem (host se zrcadlem
    // team_id), neprojde vůbec — dřív tu dostal i join kód.
    const r = await roleClena(me.id, Number(teamId));
    if (!r) return NextResponse.json({ team: null });
    const ma = (k: string) => r.opravneni.has(k);
    if (!ma('tym.pozvat')) team.join_code = null;

    // Optional/newer columns fetched defensively; missing column ⇒ safe default.
    let payDailyCash = false;
    let closingRequiresShift = true;
    let payoutFromRegister = true;
    let showTeamSchedule = true;
    try {
      const [extra] = await sql`SELECT pay_daily_cash, closing_requires_shift FROM teams WHERE id = ${teamId}`;
      payDailyCash = !!extra?.pay_daily_cash;
      closingRequiresShift = extra?.closing_requires_shift !== false;
    } catch { /* columns not migrated yet */ }
    try {
      const [extra] = await sql`SELECT payout_from_register FROM teams WHERE id = ${teamId}`;
      payoutFromRegister = extra?.payout_from_register !== false;
    } catch { /* column not migrated yet */ }
    try {
      const [extra] = await sql`SELECT show_team_schedule FROM teams WHERE id = ${teamId}`;
      showTeamSchedule = extra?.show_team_schedule !== false;
    } catch { /* column not migrated yet */ }

    // Do cash tips physically stay in the drawer? Drives the expected-cash math.
    let tipsInDrawer = false;
    let drawerFloat: number | null = null;
    try {
      const [extra] = await sql`SELECT drawer_float FROM teams WHERE id = ${teamId}`;
      drawerFloat = extra?.drawer_float ?? null;
    } catch { /* not migrated */ }
    try {
      const [extra] = await sql`SELECT tips_in_drawer FROM teams WHERE id = ${teamId}`;
      tipsInDrawer = extra?.tips_in_drawer === true;
    } catch { /* column not migrated yet */ }

    let dashboardConfig: any = {};
    try {
      const [dc] = await sql`SELECT dashboard_config FROM teams WHERE id = ${teamId}`;
      dashboardConfig = dc?.dashboard_config && typeof dc.dashboard_config === 'object' ? dc.dashboard_config : {};
    } catch { /* column not migrated yet */ }

    let levelsConfig: any = [];
    let pointsConfig: any = {};
    try {
      const [rc] = await sql`SELECT levels_config, points_config FROM teams WHERE id = ${teamId}`;
      levelsConfig = Array.isArray(rc?.levels_config) ? rc.levels_config : [];
      pointsConfig = rc?.points_config && typeof rc.points_config === 'object' ? rc.points_config : {};
    } catch { /* columns not migrated yet */ }

    // Business/localization settings (defensive — safe defaults before migration).
    let biz = { currency: 'CZK', locale: 'cs-CZ', week_start: 1, labor_target_pct: null as number | null,
                low_stock_default: 5, critical_stock_default: 2, business_type: null as string | null };
    try {
      const [b] = await sql`
        SELECT currency, locale, week_start, labor_target_pct, low_stock_default, critical_stock_default, business_type
        FROM teams WHERE id = ${teamId}`;
      if (b) biz = {
        currency: b.currency || 'CZK',
        locale: b.locale || 'cs-CZ',
        week_start: b.week_start ?? 1,
        labor_target_pct: b.labor_target_pct ?? null,
        low_stock_default: b.low_stock_default ?? 5,
        critical_stock_default: b.critical_stock_default ?? 2,
        business_type: b.business_type ?? null,
      };
    } catch { /* columns not migrated yet */ }

    // Plan & trial — resolved server-side so every client agrees on the label.
    let planRow: any = null;
    try {
      [planRow] = await sql`
        SELECT plan, plan_override, trial_ends_at, subscription_status, subscription_interval, current_period_end,
               cancel_at_period_end, trial_end, max_offer_until, stripe_subscription_id, had_subscription
        FROM teams WHERE id = ${teamId}`;
    } catch {
      try { [planRow] = await sql`SELECT plan, trial_ends_at FROM teams WHERE id = ${teamId}`; }
      catch { /* columns not migrated yet ⇒ grandfathered pro */ }
    }
    const planInfoPlne = planInfoOf(planRow);
    // Tarif a zkušební doba zůstávají všem (podle nich UI zamyká funkce);
    // stav plateb, období a nabídky jen tomu, kdo předplatné vidí.
    const planInfo = ma('predplatne.zobrazit') ? planInfoPlne : {
      ...planInfoPlne, pastDue: false, cancelAt: null, interval: null, subscriptionStatus: null,
      maxOfferUntil: null, hadSubscription: false,
    };

    // The link pinned to every dashboard (employer, employees, kiosk).
    let pinnedShare: { token: string; title: string | null; kind: string } | null = null;
    try {
      const [ps] = await sql`
        SELECT token, title, kind FROM share_links
        WHERE team_id = ${teamId} AND pinned = TRUE AND enabled = TRUE LIMIT 1`;
      if (ps) pinnedShare = { token: ps.token, title: ps.title ?? null, kind: ps.kind };
    } catch { /* not migrated yet */ }

    // Členství NEBO zrcadlo (kolo 62): člen přepnutý do jiného podniku tu
    // dřív zmizel. Role, pozice a sazba jsou z členství v TOMHLE podniku.
    // Klíče odpovědi zůstávají, přibylo aktivni_jinde. `role` je typ účtu
    // (rozhraní, rozvrh, žebříček), ne role s oprávněními.
    const sazby = ma('finance.mzdy');
    const kontakty = ma('tym.kontakty');
    // Role s oprávněními (role_klic / role_id / role_nazev) — bez nich
    // Nastavení týmu ukazovalo jen typ účtu („Vedoucí") a vlastní role po
    // obnovení stránky zmizela z výběru i ze štítku. Bere se z roleClena,
    // aby seznam říkal totéž, co pak platí na serveru (včetně vlastníka
    // a náhrady podle typu účtu, když role v členství chybí).
    const clenove = await clenovePodniku(teamId, { sSazbou: sazby });
    const role = await Promise.all(clenove.map(c => roleClena(c.id, Number(teamId)).catch(() => null)));
    const members = clenove.map((c, i) => {
      const rc = role[i];
      const zTypu = roleZTypu(c.role);
      return {
        id: c.id, name: c.name, email: kontakty ? c.email : null, role: c.role, avatar: c.avatar, phone: kontakty ? c.phone : null,
        job_title: c.jobTitle, shift_preference: c.shiftPreference,
        hourly_rate: sazby ? (c.hourlyRate ?? 0) : null,
        aktivni_jinde: c.aktivniJinde,
        role_klic: rc ? rc.klic : zTypu.klic,
        role_id: rc ? rc.roleId : null,
        role_nazev: rc ? rc.nazev : zTypu.nazev,
      };
    });

    return NextResponse.json({
      planInfo,
      pinnedShare,
      team: { ...team, pay_daily_cash: payDailyCash, closing_requires_shift: closingRequiresShift, show_team_schedule: showTeamSchedule, payout_from_register: payoutFromRegister, tips_in_drawer: tipsInDrawer, drawer_float: drawerFloat, dashboard_config: dashboardConfig, levels_config: levelsConfig, points_config: pointsConfig, ...biz },
      members,
      isOwner: team?.owner_id === me.id,
    });
  } catch (e) {
    // Never surface a 500 as "no team"; report a real error the UI can show.
    return NextResponse.json({ error: 'Tým se nepodařilo načíst. Zkuste to prosím znovu.' }, { status: 500 });
  }
}

// PATCH: nastavení podniku. Kolo 67: každé pole hlídá své oprávnění (viz
// POLE). Když chybí oprávnění k jedinému poslanému poli, neuloží se nic —
// půlka změny by vypadala jako úspěch (stejně jako teams/members).
const POLE: Record<string, string> = {
  name: 'podnik.nastaveni', currency: 'podnik.nastaveni', locale: 'podnik.nastaveni', weekStart: 'podnik.nastaveni',
  businessType: 'podnik.nastaveni', dashboardConfig: 'podnik.nastaveni', showTeamSchedule: 'podnik.nastaveni',
  regenerateCode: 'tym.pozvat',
  payDailyCash: 'uzaverky.nastaveni', drawerFloat: 'uzaverky.nastaveni', closingRequiresShift: 'uzaverky.nastaveni',
  payoutFromRegister: 'uzaverky.nastaveni', tipsInDrawer: 'uzaverky.nastaveni',
  laborTargetPct: 'finance.nastaveni',
  levelsConfig: 'odmeny.nastaveni', pointsConfig: 'odmeny.nastaveni',
  lowStockDefault: 'sklad.kategorie', criticalStockDefault: 'sklad.kategorie',
};

export async function PATCH(request: Request) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const sql = neon(process.env.DATABASE_URL!);
  const body = await request.json().catch(() => ({}));
  const { name, regenerateCode, payDailyCash, closingRequiresShift, payoutFromRegister, tipsInDrawer, dashboardConfig,
          showTeamSchedule,
          levelsConfig, pointsConfig,
          currency, locale, weekStart, laborTargetPct, lowStockDefault, criticalStockDefault, businessType } = body ?? {};

  const poslane = Object.keys(body ?? {}).filter(k => body[k] !== undefined && k in POLE);
  const chybi = [...new Set(poslane.map(k => POLE[k]))].filter(k => !c.role.opravneni.has(k));
  if (chybi.length) return NextResponse.json({ error: 'Na tuhle změnu nastavení nemáš oprávnění.' }, { status: 403 });
  if (!poslane.length && !c.role.opravneni.has('podnik.nastaveni')) {
    return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  }

  // Aktivní podnik z databáze (pozaduj), nikdy z těla ani z tokenu.
  const [team] = await sql`SELECT id FROM teams WHERE id = ${c.teamId}`;
  if (!team) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });
  const me = { id: c.meId };

  audit(team.id, me.id, 'team.settings', 'team', team.id,
    Object.keys(body).filter(k => body[k] !== undefined).join(', ').slice(0, 200));
  if (name) await sql`UPDATE teams SET name = ${name} WHERE id = ${team.id}`;
  if (typeof payDailyCash === 'boolean') await sql`UPDATE teams SET pay_daily_cash = ${payDailyCash} WHERE id = ${team.id}`;
  if (body.drawerFloat !== undefined) {
    const df = body.drawerFloat === null || body.drawerFloat === '' ? null : Math.max(0, Math.round(Number(body.drawerFloat)) || 0) || null;
    try { await sql`UPDATE teams SET drawer_float = ${df} WHERE id = ${team.id}`; } catch { /* not migrated */ }
  }
  if (typeof closingRequiresShift === 'boolean') await sql`UPDATE teams SET closing_requires_shift = ${closingRequiresShift} WHERE id = ${team.id}`;
  if (typeof showTeamSchedule === 'boolean') {
    try { await sql`UPDATE teams SET show_team_schedule = ${showTeamSchedule} WHERE id = ${team.id}`; } catch { /* not migrated */ }
  }
  if (typeof payoutFromRegister === 'boolean') {
    try { await sql`UPDATE teams SET payout_from_register = ${payoutFromRegister} WHERE id = ${team.id}`; } catch { /* not migrated */ }
  }
  if (typeof tipsInDrawer === 'boolean') {
    try { await sql`UPDATE teams SET tips_in_drawer = ${tipsInDrawer} WHERE id = ${team.id}`; } catch { /* not migrated */ }
  }
  if (dashboardConfig && typeof dashboardConfig === 'object') {
    try { await sql`UPDATE teams SET dashboard_config = ${JSON.stringify(dashboardConfig)}::jsonb WHERE id = ${team.id}`; } catch { /* not migrated */ }
  }
  if (Array.isArray(levelsConfig)) {
    try { await sql`UPDATE teams SET levels_config = ${JSON.stringify(levelsConfig)}::jsonb WHERE id = ${team.id}`; } catch { /* not migrated */ }
  }
  if (pointsConfig && typeof pointsConfig === 'object') {
    try { await sql`UPDATE teams SET points_config = ${JSON.stringify(pointsConfig)}::jsonb WHERE id = ${team.id}`; } catch { /* not migrated */ }
  }
  // Business/localization settings — each guarded so a pending migration degrades gracefully.
  try {
    if (typeof currency === 'string' && currency) await sql`UPDATE teams SET currency = ${currency} WHERE id = ${team.id}`;
    if (typeof locale === 'string' && locale) await sql`UPDATE teams SET locale = ${locale} WHERE id = ${team.id}`;
    if (weekStart === 0 || weekStart === 1) await sql`UPDATE teams SET week_start = ${weekStart} WHERE id = ${team.id}`;
    if (laborTargetPct === null || Number.isFinite(laborTargetPct)) await sql`UPDATE teams SET labor_target_pct = ${laborTargetPct} WHERE id = ${team.id}`;
    if (Number.isFinite(lowStockDefault)) await sql`UPDATE teams SET low_stock_default = ${lowStockDefault} WHERE id = ${team.id}`;
    if (Number.isFinite(criticalStockDefault)) await sql`UPDATE teams SET critical_stock_default = ${criticalStockDefault} WHERE id = ${team.id}`;
    if (typeof businessType === 'string') await sql`UPDATE teams SET business_type = ${businessType} WHERE id = ${team.id}`;
  } catch { /* columns not migrated yet — ignore until /api/init runs */ }

  let joinCode: string | undefined;
  if (regenerateCode) {
    joinCode = generateJoinCode();
    await sql`UPDATE teams SET join_code = ${joinCode} WHERE id = ${team.id}`;
  }

  const [updated] = await sql`SELECT id, name, join_code FROM teams WHERE id = ${team.id}`;
  // Kód pro připojení je vstupenka do podniku — jen pro toho, kdo smí zvát.
  if (updated && !c.role.opravneni.has('tym.pozvat')) updated.join_code = null;
  return NextResponse.json({ ok: true, team: updated });
}
