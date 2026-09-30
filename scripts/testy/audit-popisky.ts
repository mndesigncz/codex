// Historie změn: popisky akcí a čitelný detail (lib/auditPopisky.ts).
//
// Pokrytí všech klíčů, které kód zapisuje, hlídá scripts/check-audit-labels.mjs;
// tady je chování pomocníků — hlavně že se do historie nikdy nedostane
// syrový klíč ani JSON celého nastavení.

import type { Testy } from './_testy.ts';
import { AUDIT_POPISKY, popisAkce, detailAkce, popisPoliNastaveni, shrnutiNastaveniOrganizace, shrnutiSdilenychCiselniku } from '../../lib/auditPopisky.ts';

export default function ({ eq, ok }: Testy) {
  eq('audit: známá akce má český popisek', popisAkce('team.switch'), 'Přepnutí do jiného podniku');
  eq('audit: neznámá akce se neukáže syrově', popisAkce('neco.nove'), 'Jiná změna v podniku');
  ok('audit: žádný popisek není zase jen klíč', Object.entries(AUDIT_POPISKY).every(([k, v]) => v !== k && /[a-zá-ž]/i.test(v) && !/^[a-z]+\.[a-z_.-]+$/.test(v)));
  ok('audit: popisky se neopakují (řádky v historii se dají rozlišit)', new Set(Object.values(AUDIT_POPISKY)).size === Object.keys(AUDIT_POPISKY).length);

  // Starý záznam organizace nesl JSON celého nastavení.
  const stary = JSON.stringify({ sdileniLidi: true, sdileneCiselniky: false, zdrojeCiselniku: { typySmen: 5 } });
  eq('audit: JSON nastavení organizace se převede na větu',
    detailAkce('organization.settings', stary), 'Sdílení lidí: zapnuto, sdílené číselníky: vypnuto');
  eq('audit: sdílené číselníky — kolik jich má zdroj',
    detailAkce('organization.ciselniky', JSON.stringify({ sdileneCiselniky: true, zdroje: { a: 3, b: null, c: 7 } })),
    'Sdílené číselníky: zapnuto, se sdíleným zdrojem: 2');
  eq('audit: uříznutý JSON se nezobrazí', detailAkce('organization.settings', '{"sdileniLidi":tru'), null);
  eq('audit: neznámý JSON se nezobrazí', detailAkce('jina.akce', '{"a":1}'), null);
  eq('audit: běžný detail zůstane', detailAkce('role.create', 'Barista (vlastní): 12 oprávnění'), 'Barista (vlastní): 12 oprávnění');
  eq('audit: prázdný detail = žádný', detailAkce('role.create', '  '), null);

  // Název polí nastavení podniku česky, neznámá se vynechají.
  eq('audit: pole nastavení česky', popisPoliNastaveni(['name', 'currency', 'nesmysl', 'name']), 'název, měna');
  eq('audit: starý detail team.settings se přeloží', detailAkce('team.settings', 'name, payDailyCash'), 'název, denní výplata v hotovosti');
  eq('audit: nové zápisy jsou věta', shrnutiNastaveniOrganizace({ sdileniLidi: false, sdileneCiselniky: true }), 'Sdílení lidí: vypnuto, sdílené číselníky: zapnuto');
  eq('audit: bez zdrojů', shrnutiSdilenychCiselniku(false, null), 'Sdílené číselníky: vypnuto, se sdíleným zdrojem: 0');
}
