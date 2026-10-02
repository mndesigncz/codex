// Kolo 81 — koncept a verze pravidel věrnosti: co se uloží do konceptu, jak se čte rozdíl před → po a že použití
// konceptu jde stejnou cestou jako přímé uložení (jedna kontrola, jeden zápis, jedna historie změn).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { popisZmenyPravidel, novaPolePravidel, POLE_PRAVIDEL, KLICE_KONCEPTU } from '../../lib/bodyPravidla.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const kc = (n: number) => `${n} Kč`;

export default function ({ eq, ok }: Testy) {
  // ---- klíče konceptu ----
  ok('koncept: obsahuje všechna pole, která kontroluje validujPravidla', POLE_PRAVIDEL.every(k => KLICE_KONCEPTU.includes(k)));
  ok('koncept: obsahuje všechna pole rozšířených pravidel bodů', Object.keys(novaPolePravidel({})).every(k => KLICE_KONCEPTU.includes(k)));
  ok('koncept: obsahuje propadání bodů a „Chybíš nám“ (jdou z obrazovky stejným PUT)', ['points_expire_days', 'reactivation_days', 'reactivation_points', 'cashback_mode'].every(k => KLICE_KONCEPTU.includes(k)));
  eq('koncept: žádné pole dvakrát', new Set(KLICE_KONCEPTU).size, KLICE_KONCEPTU.length);

  // ---- rozdíl před → po ----
  const zaklad = { points_per_100: 5, points_cap_per_bill: 0, mult_gold: 1, points_expire_days: 0, reactivation_days: 0, reactivation_points: 0 };
  eq('rozdíl: beze změny je prázdný', popisZmenyPravidel(zaklad, { ...zaklad }, kc), []);
  eq('rozdíl: strop a násobič s čárkou', popisZmenyPravidel(zaklad, { ...zaklad, points_cap_per_bill: 10, mult_gold: '1,5' }, kc), ['Strop bodů na účtenku: bez stropu → 10 b.', 'Násobič zlato: 1× → 1,5×']);
  eq('rozdíl: propadání bodů a Chybíš nám se do historie dostane taky', popisZmenyPravidel(zaklad, { ...zaklad, points_expire_days: 90, reactivation_days: 30 }, kc), ['Propadnutí bodů: nikdy → po 90 dnech', 'Chybíš nám po: vypnuto → 30 dnech']);

  // ---- zapojení ----
  const lib = precti('lib/pravidlaVerze.ts');
  ok('verze: číslo se zvedá a řádek vkládá jedním příkazem (dva souběžné zápisy nedostanou stejné číslo)', /WITH nova AS \(UPDATE client_profiles SET rules_version = COALESCE\(rules_version, 1\) \+ 1/.test(lib) && /UNIQUE \(team_id, version\)/.test(lib));
  ok('koncept: ukládá se po kontrole celého souboru pravidel (stejná funkce jako přímé uložení)', /validujPravidla\(spojene\)/.test(lib));
  const route = precti('app/api/client/admin/loyalty/pravidla/route.ts');
  ok('API: čtení s vernost.zobrazit, změny s vernost.pravidla a v plánu Max', /pozaduj\('vernost\.zobrazit'\)/.test(route) && /pozaduj\('vernost\.pravidla'\)/.test(route) && /teamIsMax/.test(route));
  ok('API: použití konceptu jde přes PUT profilu (jedna cesta zápisu) a pak koncept zmizí', /ulozPravidlaProfilu\(new NextRequest/.test(route) && /zahodKoncept\(ctx\.teamId\)/.test(route) && /_verze/.test(route));
  ok('API: prázdný koncept se nepoužije', /Není co použít/.test(route));
  const profil = precti('app/api/client/admin/profile/route.ts');
  ok('profil: každá změna pravidel (přímá i z konceptu) zapíše verzi a historii změn', /zapisVerzi\(u\.team_id, u\.id, zmeny, b\?\._verze\?\.zdroj === 'koncept' \? 'koncept' : 'form', b\?\._verze\?\.poznamka\)/.test(profil) && /'client\.pravidla'/.test(profil));
  ok('rozhraní: koncept, použití s poznámkou, zahození a seznam verzí v Body a úrovně', ['Uložit koncept', 'Použít pravidla…', 'Zahodit koncept', 'Poznámka k verzi', 'Verze pravidel'].every(t => precti('components/client/loyalty/BodyKoncept.tsx').includes(t)) && /<KonceptPanel /.test(precti('components/client/LoyaltyTabs.tsx')) && /<VerzePravidel /.test(precti('components/client/LoyaltyTabs.tsx')));
  const init = precti('app/api/init/route.ts');
  ok('schéma: sloupce konceptu a tabulka verzí jsou v init', ['loyalty_draft JSONB', 'loyalty_draft_at TIMESTAMP', 'rules_version INTEGER'].every(x => init.includes(`client_profiles ADD COLUMN IF NOT EXISTS ${x}`)) && init.includes('CREATE TABLE IF NOT EXISTS client_pravidla_verze'));
  const smaz = precti('lib/smazaniUctu.ts');
  ok('smazání: verze pravidel patří podniku (anonymní autor, maže se s podnikem)', /client_pravidla_verze: 'ponechat'/.test(smaz) && /'client_pravidla_verze'/.test(smaz.slice(smaz.indexOf('TYMOVE_TABULKY'))));
  ok('historie změn: koncept má český popisek', /'client\.pravidla\.koncept'/.test(precti('lib/auditPopisky.ts')));
}
