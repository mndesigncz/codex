// Jazyk podle země návštěvníka (lib/i18n/config.ts, jazykZeZeme): prodejní stránka
// i aplikace se bez zvoleného jazyka ukážou v jazyce země, odkud je člověk otevřel.
import { jazykZeZeme } from '../../lib/i18n/config.ts';
import type { Testy } from './_testy.ts';

export default function ({ eq }: Testy) {
  eq('Česko → čeština', jazykZeZeme('CZ'), 'cs');
  eq('kód země bez ohledu na velikost písmen', jazykZeZeme('cz'), 'cs');
  eq('Slovensko → slovenština', jazykZeZeme('SK'), 'sk');
  eq('Polsko → polština', jazykZeZeme('PL'), 'pl');
  for (const z of ['DE', 'AT', 'CH', 'LI', 'LU']) eq(`${z} → němčina`, jazykZeZeme(z), 'de');
  for (const z of ['GB', 'US', 'FR', 'HU', 'UA']) eq(`${z} → angličtina`, jazykZeZeme(z), 'en');
  eq('bez hlavičky (lokálně, sondy) se nic nevybírá → čeština', jazykZeZeme(null), undefined);
  eq('prázdná hlavička', jazykZeZeme(''), undefined);
  eq('neznámá země (XX) se nehádá', jazykZeZeme('XX'), undefined);
  eq('Tor (T1) se nehádá', jazykZeZeme('T1'), undefined);
  eq('jen dvoupísmenný kód', jazykZeZeme('Česko'), undefined);
}
