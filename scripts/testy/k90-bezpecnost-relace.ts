// Změna hesla odhlásí ostatní zařízení (spuštění, balík S): users.session_version.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { verzeRelace, relaceOdvolana, RELACE_ODVOLANA } from '../../lib/authVerze.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  eq('verze: chybějící/nesmysl = 0', [undefined, null, '', 'abc', -3, NaN, {}].map(verzeRelace), [0, 0, 0, 0, 0, 0, 0]);
  eq('verze: číslo i text z databáze', [verzeRelace(2), verzeRelace('5'), verzeRelace(3.7)], [2, 5, 3]);
  ok('odvolání: token bez verze a databáze 0 (nasazení) neodvolá', !relaceOdvolana(undefined, 0));
  ok('odvolání: stejná verze platí', !relaceOdvolana(2, 2));
  ok('odvolání: vyšší verze v databázi odvolá', relaceOdvolana(1, 2));
  ok('odvolání: starý token bez verze po první změně hesla odvolá', relaceOdvolana(undefined, 1));
  ok('odvolání: neznámá verze z databáze (sloupec chybí / výpadek) nikdy neodvolá', !relaceOdvolana(0, null) && !relaceOdvolana(0, undefined));
  ok('odvolání: novější token než databáze (jiný isolát) neodvolá', !relaceOdvolana(3, 2));

  const auth = cti('lib/auth.ts');
  ok('auth: verze jede v témž dotazu jako role a tým (žádný dotaz navíc)', /SELECT team_id, role, deleted_at, session_version FROM users WHERE id = \$\{id\}/.test(auth));
  ok('auth: bez sloupce se čte jako dřív', /SELECT team_id, role, deleted_at FROM users WHERE id = \$\{id\}/.test(auth));
  ok('auth: odvolaná relace hodí chybu (NextAuth smaže cookie)', /if \(relaceOdvolana\(token\.sv, u\.sv\)\) throw new Error\(RELACE_ODVOLANA\)/.test(auth) && RELACE_ODVOLANA === 'RELACE_ODVOLANA');
  ok('auth: výpadek databáze (u === null) relaci nechá', /u === null: databáze nejde — token zůstane/.test(auth));
  ok('auth: verze do tokenu při přihlášení', /token\.sv = verzeRelace\(\(user as any\)\.sv\)/.test(auth));
  ok('auth: mezipaměť stavu zůstává (5 s)', /STAV_TTL_MS = 5_000/.test(auth));

  const zmena = cti('app/api/account/route.ts');
  ok('změna hesla: zvýší verzi a současné zařízení ponechá', /zvysVerziRelace\(id\)/.test(zmena) && /ponechSoucasneZarizeni\(verze\)/.test(zmena));
  ok('obnovení hesla: zvýší verzi', /zvysVerziRelace\(userId\)/.test(cti('app/api/account/heslo/obnovit/route.ts')));
  const init = cti('app/api/init/route.ts');
  ok('init: session_version s výchozí 0 pro všechny', /ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0/.test(init));
  const rel = cti('lib/authRelace.ts');
  ok('cookie: přepis jen přes decode/encode NextAuth s tajemstvím', /decode\(\{ token: jar\.get\(nazev\)!\.value, secret \}\)/.test(rel) && /httpOnly: true/.test(rel));
}
