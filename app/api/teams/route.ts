import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { popisPoliNastaveni } from '@/lib/auditPopisky';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { generateJoinCode } from '@/lib/team';
import { planInfoOf } from '@/lib/plan';
import { clenovePodniku } from '@/lib/tenant';
import { roleClena, pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { roleZTypu } from '@/lib/opravneni';
import { cistyJazyk } from '@/lib/i18n/config';
import { cistaZeme, PREDVOLBY_ZEMI } from '@/lib/i18n/zeme';
import { normalizujNavKonfig } from '@/lib/navigace';
import { cistyIco, cistyDic, cistyPrah, pragySedi } from '@/lib/podnikProfil';
import { cistePevneNaklady } from '@/lib/financeWidgety';
import { cilMarze } from '@/lib/recepturyPrehled';
import { nastaveniZRadku } from '@/lib/nastaveniPodniku';

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

    // Výkon (spuštění, balík S): dřív tu bylo osmnáct dotazů za sebou, teď
    // jeden řádek týmu (`SELECT *` vrátí jen sloupce, které už existují —
    // chybějící sloupec před migrací nic nerozbije, viz lib/nastaveniPodniku)
    // a role, připnutý odkaz a členové souběžně.
    const [teamRows, r, pinnedRows, clenove] = await Promise.all([
      sql`SELECT * FROM teams WHERE id = ${teamId}`,
      roleClena(me.id, Number(teamId)),
      sql`SELECT token, title, kind FROM share_links WHERE team_id = ${teamId} AND pinned = TRUE AND enabled = TRUE LIMIT 1`
        .catch(() => [] as Record<string, unknown>[]),
      // Sazby se načtou vždy a níž se skryjí podle finance.mzdy — jinak by
      // dotaz na členy musel čekat na roli.
      clenovePodniku(teamId, { sSazbou: true }),
    ]);
    const radek = teamRows[0] as Record<string, unknown> | undefined;
    if (!radek) return NextResponse.json({ team: null });

    // Kolo 67: nastavení podniku (měna, uzávěrky, přehledy, tarif…) čte každý
    // člen — stojí na nich jeho vlastní obrazovky i tablet. Citlivá pole jen
    // s oprávněním: kód pro připojení (tym.pozvat), e-maily a telefony
    // (tym.kontakty), sazby (finance.mzdy), pravidelné náklady (finance.zobrazit /
    // finance.nastaveni), podrobnosti předplatného
    // (predplatne.zobrazit). Kdo v podniku není členem (host se zrcadlem
    // team_id), neprojde vůbec — dřív tu dostal i join kód.
    if (!r) return NextResponse.json({ team: null });
    const ma = (k: string) => r.opravneni.has(k);
    const team = nastaveniZRadku(radek, ma('finance.zobrazit') || ma('finance.nastaveni'));
    if (!ma('tym.pozvat')) team.join_code = null;

    // Plan & trial — resolved server-side so every client agrees on the label.
    const planInfoPlne = planInfoOf(radek);
    // Tarif a zkušební doba zůstávají všem (podle nich UI zamyká funkce);
    // stav plateb, období a nabídky jen tomu, kdo předplatné vidí.
    const planInfo = ma('predplatne.zobrazit') ? planInfoPlne : {
      ...planInfoPlne, pastDue: false, cancelAt: null, interval: null, subscriptionStatus: null,
      maxOfferUntil: null, hadSubscription: false,
    };

    // The link pinned to every dashboard (employer, employees, kiosk).
    const ps = pinnedRows[0];
    const pinnedShare: { token: string; title: string | null; kind: string } | null = ps
      ? { token: String(ps.token), title: (ps.title as string | null) ?? null, kind: String(ps.kind) } : null;

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
      team,
      members,
      isOwner: Number(team.owner_id) === me.id,
    });
  } catch (e) {
    // Never surface a 500 as "no team"; report a real error the UI can show.
    return NextResponse.json({ error: 'Tým se nepodařilo načíst. Zkus to prosím znovu.' }, { status: 500 });
  }
}

// PATCH: nastavení podniku. Kolo 67: každé pole hlídá své oprávnění (viz
// POLE). Když chybí oprávnění k jedinému poslanému poli, neuloží se nic —
// půlka změny by vypadala jako úspěch (stejně jako teams/members).
const POLE: Record<string, string> = {
  name: 'podnik.nastaveni', currency: 'podnik.nastaveni', locale: 'podnik.nastaveni', weekStart: 'podnik.nastaveni',
  businessType: 'podnik.nastaveni', address: 'podnik.nastaveni', ico: 'podnik.nastaveni', dic: 'podnik.nastaveni', dashboardConfig: 'podnik.nastaveni', showTeamSchedule: 'podnik.nastaveni',
  country: 'podnik.nastaveni', defaultLang: 'podnik.nastaveni', timeFormat: 'podnik.nastaveni', timezone: 'podnik.nastaveni', navConfig: 'podnik.nastaveni',
  regenerateCode: 'tym.pozvat',
  payDailyCash: 'uzaverky.nastaveni', drawerFloat: 'uzaverky.nastaveni', closingRequiresShift: 'uzaverky.nastaveni',
  payoutFromRegister: 'uzaverky.nastaveni', tipsInDrawer: 'uzaverky.nastaveni',
  laborTargetPct: 'finance.nastaveni', fixedCosts: 'finance.nastaveni', marginTargetPct: 'finance.nastaveni',
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
          currency, locale, weekStart, laborTargetPct, lowStockDefault, criticalStockDefault, businessType, address,
          country, defaultLang, timeFormat, timezone, navConfig, ico, dic, fixedCosts } = body ?? {};

  const poslane = Object.keys(body ?? {}).filter(k => body[k] !== undefined && k in POLE);
  const chybi = [...new Set(poslane.map(k => POLE[k]))].filter(k => !c.role.opravneni.has(k));
  if (chybi.length) return NextResponse.json({ error: 'Na tuhle změnu nastavení nemáš oprávnění.' }, { status: 403 });
  if (!poslane.length && !c.role.opravneni.has('podnik.nastaveni')) {
    return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  }

  // Údaje, které by šly na doklad, se ověří dřív, než se cokoli uloží (půlka změny by vypadala jako úspěch).
  if (ico !== undefined && cistyIco(ico) === undefined) {
    return NextResponse.json({ error: 'IČO není platné. Má mít osm číslic se správnou kontrolní číslicí.' }, { status: 400 });
  }
  if (dic !== undefined && cistyDic(dic) === undefined) {
    return NextResponse.json({ error: 'DIČ není platné. Začíná kódem země a má jen písmena a číslice, třeba CZ12345678.' }, { status: 400 });
  }
  // Pevné náklady se ověří celé předem: nejvýš 20 řádků, název 1–40 znaků, částka celá a nezáporná.
  const cistePevne = fixedCosts !== undefined ? cistePevneNaklady(fixedCosts) : undefined;
  if (fixedCosts !== undefined && !cistePevne) {
    return NextResponse.json({ error: 'Pravidelné náklady nejsou v pořádku: nejvýš 20 řádků, každý s názvem do 40 znaků a celou částkou od nuly.' }, { status: 400 });
  }
  for (const [pole, hodnota] of [['lowStockDefault', lowStockDefault], ['criticalStockDefault', criticalStockDefault]] as const) {
    if (hodnota !== undefined && cistyPrah(hodnota) === undefined) {
      return NextResponse.json({ error: pole === 'lowStockDefault' ? 'Práh nízkých zásob musí být celé číslo od nuly.' : 'Práh kritických zásob musí být celé číslo od nuly.' }, { status: 400 });
    }
  }
  // Cílová marže: celé 1–95 %, nebo null (= výchozí 65 %). Nesmysl se odmítne dřív, než se cokoli uloží.
  const marginTargetPct = body?.marginTargetPct;
  if (marginTargetPct !== undefined && marginTargetPct !== null && cilMarze(marginTargetPct) === null) {
    return NextResponse.json({ error: 'Cílová marže musí být celé číslo od 1 do 95 %.' }, { status: 400 });
  }
  if (lowStockDefault !== undefined && criticalStockDefault !== undefined && !pragySedi(cistyPrah(lowStockDefault)!, cistyPrah(criticalStockDefault)!)) {
    return NextResponse.json({ error: 'Kritický práh nesmí být vyšší než práh nízkých zásob.' }, { status: 400 });
  }

  // Aktivní podnik z databáze (pozaduj), nikdy z těla ani z tokenu.
  const [team] = await sql`SELECT id FROM teams WHERE id = ${c.teamId}`;
  if (!team) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });
  const me = { id: c.meId };

  audit(team.id, me.id, 'team.settings', 'team', team.id,
    popisPoliNastaveni(Object.keys(body).filter(k => body[k] !== undefined)) || undefined);
  // Stejný strop jako při založení podniku (80 znaků): název jde do hlaviček,
  // přepínače podniků, správy platformy i e-mailů s pozvánkou, takže dlouhý
  // řetězec z API by se tam roznesl celý.
  const novyNazev = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  if (novyNazev) await sql`UPDATE teams SET name = ${novyNazev} WHERE id = ${team.id}`;
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
  // Jen prostý objekt: pole by se s příznakem spojilo do pole (jsonb `||`)
  // a operátor `?` by v něm klíč neviděl — druhý PATCH by pak příznak
  // zahodil a init by starý přehled převedl znovu.
  if (dashboardConfig && typeof dashboardConfig === 'object' && !Array.isArray(dashboardConfig)) {
    // Posílají ho už jen otevřené záložky ze starého editoru přehledu (kolo 68
    // ho nahradilo rozložením stránek). Příznak migrovano68 se musí zachovat:
    // bez něj by další /api/init převedl starý přehled znovu a vrátil výchozí
    // rozložení, které vedení mezitím smazalo. Příznak patří serveru, proto
    // se ten z těla zahodí (stará záložka ho posílá zpátky, jak ho načetla).
    const { migrovano68: _prevzato, ...novy } = dashboardConfig as Record<string, unknown>;
    try {
      await sql`
        UPDATE teams SET dashboard_config = ${JSON.stringify(novy)}::jsonb
          || CASE WHEN dashboard_config ? 'migrovano68' THEN '{"migrovano68": true}'::jsonb ELSE '{}'::jsonb END
        WHERE id = ${team.id}`;
    } catch { /* not migrated */ }
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
    if (Number.isFinite(lowStockDefault)) await sql`UPDATE teams SET low_stock_default = ${cistyPrah(lowStockDefault)} WHERE id = ${team.id}`;
    if (Number.isFinite(criticalStockDefault)) await sql`UPDATE teams SET critical_stock_default = ${cistyPrah(criticalStockDefault)} WHERE id = ${team.id}`;
    if (typeof businessType === 'string') await sql`UPDATE teams SET business_type = ${businessType} WHERE id = ${team.id}`;
  } catch { /* columns not migrated yet — ignore until /api/init runs */ }

  // Cílová marže (kolo 7): vlastní try, sloupec přibývá s DDL.
  try {
    if (marginTargetPct !== undefined) await sql`UPDATE teams SET margin_target_pct = ${marginTargetPct === null ? null : cilMarze(marginTargetPct)} WHERE id = ${team.id}`;
  } catch { /* column not migrated yet */ }
  // Pevné náklady (kolo 81): vlastní try, sloupec přibývá s DDL.
  try {
    if (cistePevne) await sql`UPDATE teams SET fixed_costs = ${JSON.stringify(cistePevne)}::jsonb WHERE id = ${team.id}`;
  } catch { /* column not migrated yet */ }
  // Adresa má vlastní try: před migrací sloupec chybí a nesmí to vzít ostatní nastavení.
  try {
    if (typeof address === 'string') await sql`UPDATE teams SET address = ${address.trim().slice(0, 200) || null} WHERE id = ${team.id}`;
  } catch { /* column not migrated yet */ }
  // IČO a DIČ: každé zvlášť a defenzivně (sloupce teams.ico, teams.dic přibudou až s DDL).
  // Tvar už se ověřil výš; prázdná hodnota údaj smaže.
  try {
    if (ico !== undefined) await sql.query('UPDATE teams SET ico = $1 WHERE id = $2', [cistyIco(ico) ?? null, team.id]);
  } catch { /* column not migrated yet */ }
  try {
    if (dic !== undefined) await sql.query('UPDATE teams SET dic = $1 WHERE id = $2', [cistyDic(dic) ?? null, team.id]);
  } catch { /* column not migrated yet */ }
  // Lokalizace podniku (kolo 76). Každé pole samostatně a defenzivně: před
  // migrací sloupců se prostě neuloží. Země jen předvyplňuje návrhy, nic nezamyká;
  // neznámá země se neuloží. Pásmo se přijme jen z předvoleb podporovaných zemí
  // (všechna leží v CET/CEST jako Praha): jiné pásmo by bez refaktoru času
  // (plán §9) rozjelo obchodní den, proto ho API odmítne tiše ignorovat.
  try {
    if (country === null || country === '') await sql`UPDATE teams SET country = NULL WHERE id = ${team.id}`;
    else if (cistaZeme(country)) await sql`UPDATE teams SET country = ${cistaZeme(country)!} WHERE id = ${team.id}`;
    if (cistyJazyk(defaultLang)) await sql`UPDATE teams SET default_lang = ${cistyJazyk(defaultLang)!} WHERE id = ${team.id}`;
    if (timeFormat === '24' || timeFormat === '12') await sql`UPDATE teams SET time_format = ${timeFormat} WHERE id = ${team.id}`;
    if (typeof timezone === 'string' && Object.values(PREDVOLBY_ZEMI).some(p => p.pasmo === timezone)) {
      await sql`UPDATE teams SET timezone = ${timezone} WHERE id = ${team.id}`;
    }
  } catch { /* columns not migrated yet — ignore until /api/init runs */ }
  // Přizpůsobení navigace: jen preference, ne oprávnění (lib/navigace.ts).
  // Prázdná nebo výchozí konfigurace se uloží jako NULL = dnešní navigace.
  if (navConfig !== undefined) {
    try {
      const k = navConfig === null ? null : normalizujNavKonfig(navConfig);
      await sql`UPDATE teams SET nav_config = ${k ? JSON.stringify(k) : null}::jsonb WHERE id = ${team.id}`;
    } catch { /* column not migrated yet */ }
  }

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
