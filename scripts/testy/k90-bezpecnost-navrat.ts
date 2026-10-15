// Návrat po přihlášení (spuštění, balík S): jen místní cesty, nic cizího.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { navratPoPrihlaseni, prihlaseniSNavratem } from '../../lib/navratPoPrihlaseni.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const P = 'https://app.managero.cz';

export default function ({ eq, ok }: Testy) {
  eq('návrat: místní cesta projde', navratPoPrihlaseni('/employer?view=finance', P), '/employer?view=finance');
  eq('návrat: odkaz na zálohu projde i s tokenem', navratPoPrihlaseni('/api/backup/stahnout?t=1.2.ab-c', P), '/api/backup/stahnout?t=1.2.ab-c');
  eq('návrat: absolutní adresa se stejným původem (tvar NextAuth)', navratPoPrihlaseni(`${P}/employee/shifts#dnes`, P), '/employee/shifts#dnes');
  eq('návrat: cizí doména → úvod', navratPoPrihlaseni('https://zly.cz/employer', P), '/');
  eq('návrat: //zly.cz → úvod', navratPoPrihlaseni('//zly.cz', P), '/');
  eq('návrat: zpětné lomítko → úvod', navratPoPrihlaseni('/\\zly.cz', P), '/');
  eq('návrat: javascript: → úvod', navratPoPrihlaseni('javascript:alert(1)', P), '/');
  eq('návrat: data: → úvod', navratPoPrihlaseni('data:text/html,<b>', P), '/');
  eq('návrat: řídicí znak → úvod', navratPoPrihlaseni('/\t/zly.cz', P), '/');
  eq('návrat: zpět na přihlášení by byl kruh', navratPoPrihlaseni('/login?callbackUrl=/x', P), '/');
  eq('návrat: /api/auth taky ne', navratPoPrihlaseni('/api/auth/signout', P), '/');
  eq('návrat: /loginy (jiná cesta) projde', navratPoPrihlaseni('/loginy', P), '/loginy');
  eq('návrat: prázdné → výchozí', navratPoPrihlaseni(null, P, '/client'), '/client');
  eq('návrat: bez původu absolutní adresa neprojde', navratPoPrihlaseni(`${P}/employer`, null), '/');
  eq('návrat: http vs https je jiný původ', navratPoPrihlaseni('http://app.managero.cz/employer', P), '/');
  eq('odkaz: přihlášení s návratem', prihlaseniSNavratem('/api/backup/stahnout?t=1.2.x'), '/login?callbackUrl=%2Fapi%2Fbackup%2Fstahnout%3Ft%3D1.2.x');
  eq('odkaz: cizí cíl dá holé přihlášení', prihlaseniSNavratem('https://zly.cz'), '/login');

  const form = cti('components/LoginForm.tsx');
  ok('LoginForm: čte callbackUrl i next přes navratPoPrihlaseni', /navratPoPrihlaseni\(searchParams\.get\('callbackUrl'\) \?\? searchParams\.get\('next'\), window\.location\.origin\)/.test(form));
  ok('LoginForm: už ne natvrdo router.push(\'/\')', !/router\.push\('\/'\)/.test(form));
  const mw = cti('middleware.ts');
  ok('middleware: stránka bez přihlášení → /login s callbackUrl', /searchParams\.set\('callbackUrl'/.test(mw));
  ok('middleware: správa platformy se v callbackUrl neprozrazuje', !/\(employer\|employee\|kiosk\|admin\)/.test(mw));
  ok('záloha: odkaz Přihlásit se vede zpět na stažení', /prihlaseniSNavratem\(cestaOdkazuZalohy\(token!\)\)/.test(cti('app/api/backup/stahnout/route.ts')));
}
