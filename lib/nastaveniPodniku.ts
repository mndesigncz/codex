// Nastavení podniku pro GET /api/teams z JEDNOHO řádku `SELECT * FROM teams`
// (spuštění, balík S — výkon). Dřív to bylo patnáct dotazů po sloupcích, každý
// v try, aby chybějící sloupec před /api/init nevzal ostatní. `SELECT *` vrátí
// jen sloupce, které v databázi opravdu jsou; chybějící je tu `undefined`
// a dostane stejnou výchozí hodnotu jako dřív v catch. Čisté, bez databáze.

import { cilMarze } from './recepturyPrehled.ts';
import { pevneNakladyZDb, type PevnyNaklad } from './financeWidgety.ts';
import { cistyJazyk } from './i18n/config.ts';
import { cistaZeme } from './i18n/zeme.ts';
import { normalizujNavKonfig } from './navigace.ts';

type Radek = Record<string, unknown>;

const objekt = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Pole týmu do odpovědi; `smiNaklady` = finance.zobrazit nebo finance.nastaveni. */
export function nastaveniZRadku(t: Radek, smiNaklady: boolean) {
  const maSloupec = (k: string) => Object.prototype.hasOwnProperty.call(t, k);
  const fixedCosts: PevnyNaklad[] = smiNaklady ? pevneNakladyZDb(t.fixed_costs) : [];
  const biz = {
    currency: (t.currency as string) || 'CZK',
    locale: (t.locale as string) || 'cs-CZ',
    week_start: (t.week_start as number) ?? 1,
    labor_target_pct: (t.labor_target_pct as number | null) ?? null,
    low_stock_default: (t.low_stock_default as number) ?? 5,
    critical_stock_default: (t.critical_stock_default as number) ?? 2,
    business_type: (t.business_type as string | null) ?? null,
    address: (t.address as string | null) ?? null,
    country: (t.country as string | null) ?? null,
    ico: (t.ico as string | null) ?? null,
    dic: (t.dic as string | null) ?? null,
    // Formulář IČO/DIČ se ukáže, jen když sloupce existují (kolo 73).
    ico_dic_ok: maSloupec('ico') && maSloupec('dic'),
  };
  // Lokalizace (kolo 76): dřív se celá brala jen, když existovalo všech pět sloupců.
  const lokalizace = maSloupec('default_lang') ? {
    default_lang: cistyJazyk(t.default_lang) ?? 'cs',
    country: cistaZeme(t.country) ?? null,
    time_format: t.time_format === '12' ? '12' : '24',
    timezone: (t.timezone as string) || 'Europe/Prague',
    nav_config: normalizujNavKonfig(t.nav_config),
  } : { default_lang: 'cs', country: null, time_format: '24', timezone: 'Europe/Prague', nav_config: null };
  return {
    id: t.id, name: t.name, owner_id: t.owner_id, join_code: t.join_code, created_at: t.created_at,
    pay_daily_cash: !!t.pay_daily_cash,
    closing_requires_shift: t.closing_requires_shift !== false,
    show_team_schedule: t.show_team_schedule !== false,
    payout_from_register: t.payout_from_register !== false,
    tips_in_drawer: t.tips_in_drawer === true,
    drawer_float: (t.drawer_float as number | null) ?? null,
    dashboard_config: objekt(t.dashboard_config),
    levels_config: Array.isArray(t.levels_config) ? t.levels_config : [],
    points_config: objekt(t.points_config),
    fixed_costs: fixedCosts,
    ...biz,
    margin_target_pct: cilMarze(t.margin_target_pct),
    ...lokalizace,
  };
}
