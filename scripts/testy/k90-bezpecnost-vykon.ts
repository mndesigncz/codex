// Výkon (spuštění, balík S): /api/teams z jednoho řádku a souběžně, crony po dávkách.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { poDavkach } from '../../lib/cronDavky.ts';
import { nastaveniZRadku } from '../../lib/nastaveniPodniku.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default async function ({ eq, ok }: Testy) {
  // ---- nastavení z jednoho řádku: chybějící sloupec = stejná výchozí hodnota jako dřív v catch ----
  const holy = nastaveniZRadku({ id: 7, name: 'Kavárna', owner_id: 3, join_code: 'ABC', created_at: 'x' }, true);
  eq('výchozí: uzávěrka bez směny / výplata z kasy / rozpis týmu = ano', [holy.closing_requires_shift, holy.payout_from_register, holy.show_team_schedule], [true, true, true]);
  eq('výchozí: denní hotovost a spropitné v kase = ne', [holy.pay_daily_cash, holy.tips_in_drawer], [false, false]);
  eq('výchozí: měna, jazyk, týden, prahy', [holy.currency, holy.locale, holy.week_start, holy.low_stock_default, holy.critical_stock_default], ['CZK', 'cs-CZ', 1, 5, 2]);
  eq('výchozí: lokalizace bez sloupců', [holy.default_lang, holy.time_format, holy.timezone, holy.nav_config], ['cs', '24', 'Europe/Prague', null]);
  ok('výchozí: IČO/DIČ se nenabízí bez sloupců', holy.ico_dic_ok === false);
  eq('výchozí: prázdné konfigurace', [holy.dashboard_config, holy.levels_config, holy.points_config, holy.fixed_costs, holy.margin_target_pct], [{}, [], {}, [], null]);
  const plny = nastaveniZRadku({
    id: 7, closing_requires_shift: false, payout_from_register: false, show_team_schedule: false, pay_daily_cash: true, tips_in_drawer: true,
    drawer_float: 2000, currency: 'EUR', week_start: 0, ico: '27074358', dic: null, default_lang: 'de', time_format: '12', margin_target_pct: 70,
    fixed_costs: [{ name: 'Nájem', amount: 30000 }], levels_config: [{ n: 1 }], dashboard_config: [1, 2],
  }, true);
  eq('plný řádek: hodnoty projdou', [plny.closing_requires_shift, plny.payout_from_register, plny.pay_daily_cash, plny.tips_in_drawer, plny.drawer_float, plny.currency, plny.week_start, plny.default_lang, plny.time_format, plny.margin_target_pct], [false, false, true, true, 2000, 'EUR', 0, 'de', '12', 70]);
  ok('plný řádek: IČO/DIČ se nabízí', plny.ico_dic_ok === true && plny.ico === '27074358');
  ok('plný řádek: pole místo objektu se zahodí', JSON.stringify(plny.dashboard_config) === '{}' && plny.levels_config.length === 1);
  eq('pevné náklady jen s oprávněním', nastaveniZRadku({ fixed_costs: [{ name: 'Nájem', amount: 1 }] }, false).fixed_costs, []);
  const tajne = nastaveniZRadku({ id: 1, stripe_customer_id: 'cus_x', stripe_subscription_id: 'sub_x', plan_override: 'max' }, true) as Record<string, unknown>;
  ok('SELECT * neprosákne: Stripe a interní sloupce v odpovědi nejsou', !('stripe_customer_id' in tajne) && !('stripe_subscription_id' in tajne) && !('plan_override' in tajne));

  const teams = cti('app/api/teams/route.ts');
  const get = teams.slice(teams.indexOf('export async function GET'), teams.indexOf('export async function PATCH'));
  ok('/api/teams: jeden řádek týmu (SELECT *), žádné dotazy po sloupcích', /sql`SELECT \* FROM teams WHERE id = \$\{teamId\}`/.test(get) && (get.match(/FROM teams/g) ?? []).length === 1);
  ok('/api/teams: role, připnutý odkaz a členové souběžně', /Promise\.all\(\[\s*sql`SELECT \* FROM teams/.test(get) && /clenovePodniku\(teamId, \{ sSazbou: true \}\)/.test(get));
  ok('/api/teams: sazby dál jen s finance.mzdy', /hourly_rate: sazby \? \(c\.hourlyRate \?\? 0\) : null/.test(get));
  ok('/api/teams: join kód dál jen s tym.pozvat', /if \(!ma\('tym\.pozvat'\)\) team\.join_code = null/.test(get));

  // ---- crony po dávkách ----
  let bezi = 0, nejvic = 0;
  const v = await poDavkach([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], async (n) => {
    bezi++; nejvic = Math.max(nejvic, bezi);
    await new Promise(r => setTimeout(r, 2));
    bezi--;
    if (n === 4) throw new Error('jeden podnik spadl');
  }, { soubezne: 3 });
  eq('dávky: všechno projde, chyba jednoho nezastaví ostatní', v, { hotovo: 9, chyby: 1, nestihnuto: 0 });
  ok('dávky: nejvýš 3 souběžně', nejvic <= 3 && nejvic > 1);
  let hodiny = 0;
  const vCas = await poDavkach([1, 2, 3, 4, 5], async () => { hodiny += 20; }, { soubezne: 1, rozpocetMs: 50, ted: () => hodiny });
  eq('dávky: po vyčerpání času se nové nezačínají a řekne se kolik', vCas, { hotovo: 3, chyby: 0, nestihnuto: 2 });
  eq('dávky: prázdný seznam', await poDavkach([], async () => {}), { hotovo: 0, chyby: 0, nestihnuto: 0 });
  for (const [f, n] of [['app/api/digest/route.ts', 4], ['app/api/backup/route.ts', 5], ['app/api/pos/cron/route.ts', 3]] as const) {
    ok(`${f}: po dávkách (${n} souběžně) s rozpočtem času`, new RegExp(`poDavkach\\([\\s\\S]*soubezne: ${n}, rozpocetMs: 50_000`).test(cti(f)) && !/for \(const (team|t) of teams/.test(cti(f)));
  }
}
