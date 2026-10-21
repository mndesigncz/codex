// Souhlas s podmínkami s verzí (spuštění, balík P): click-wrap u registrace podniku,
// připojení zaměstnance (kód i pozvánka) a hosta, verze v databázi, brána nové verze,
// souhlas v pokladně Stripe jen s proměnnou prostředí.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  HLASKA_BEZ_SOUHLASU, HLASKA_BEZ_VEKU, MIN_VEK_HOSTA, VERZE_PODMINEK, VERZE_ZASAD, cestaSBranou, klicOvereniSouhlasu, odkazyPravni,
  potrebujeSouhlas, souhlasAktualni, souhlasZTela, vekZTela,
} from '../../lib/pravni/verze.ts';
import { POLE_PROFILU } from '../../lib/exportUctu.ts';
import { RETENCE } from '../../lib/retence.ts';
import { LHUTY, RETENCE_TEXT, TARIFY } from '../../lib/pravni/lhuty.ts';
import { PRICES, TRIAL_DAYS } from '../../lib/plan.ts';
import { PLATNOST_ODKAZU_DNI } from '../../lib/pravni/zalohaOdkaz.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  eq('verze podmínek a zásad', [VERZE_PODMINEK, VERZE_ZASAD], ['2026-10-21', '2026-10-21']);
  eq('host: aspoň 15 let', MIN_VEK_HOSTA, 15);

  // ---- pravidla ----
  ok('aktuální: obě verze dnešní nebo novější', souhlasAktualni({ terms_version: VERZE_PODMINEK, privacy_version: VERZE_ZASAD }) && souhlasAktualni({ terms_version: '2027-01-01', privacy_version: '2026-12-01' }));
  ok('neaktuální: starší verze (i ta z 2026-10-14), chybějící verze, smetí, null', !souhlasAktualni({ terms_version: '2026-10-14', privacy_version: '2026-10-14' })
    && !souhlasAktualni({ terms_version: VERZE_PODMINEK, privacy_version: null }) && !souhlasAktualni({ terms_version: 'ano', privacy_version: 'ano' }) && !souhlasAktualni(null));
  ok('brána: sdílený tablet se neptá nikdy', !potrebujeSouhlas('kiosk', null));
  ok('brána: účet bez verze (z doby před verzováním) se zeptá', potrebujeSouhlas('employer', { terms_version: null, privacy_version: null }) && potrebujeSouhlas('customer', {}));
  ok('brána: s aktuální verzí se neptá', !potrebujeSouhlas('employee', { terms_version: VERZE_PODMINEK, privacy_version: VERZE_ZASAD }));
  ok('souhlas z těla: jen výslovné true', souhlasZTela({ terms: true }) && !souhlasZTela({ terms: 'true' }) && !souhlasZTela({ terms: 1 }) && !souhlasZTela({}) && !souhlasZTela(null));
  ok('věk z těla: jen výslovné true', vekZTela({ vek15: true }) && !vekZTela({ vek15: 'ano' }) && !vekZTela({}));
  eq('odkazy: česky české stránky, jinak anglické', [odkazyPravni('cs'), odkazyPravni('de')], [
    { podminky: '/podminky', soukromi: '/soukromi', obchodniPodminky: '/obchodni-podminky', zpracovatelskaSmlouva: '/zpracovatelska-smlouva' },
    { podminky: '/en/podminky', soukromi: '/en/soukromi', obchodniPodminky: '/en/obchodni-podminky', zpracovatelskaSmlouva: '/en/zpracovatelska-smlouva' }]);
  ok('brána běží v aplikaci, ne na veřejných, právních a přihlašovacích stránkách',
    ['/employer/overview', '/employee/shifts', '/client', '/client/me', '/admin'].every(cestaSBranou)
    && !['/', '/podminky', '/soukromi', '/en/podminky', '/login', '/register', '/join', '/demo', '/client/login', '/client/register', '/client/odhlasit', null].some(c => cestaSBranou(c as string)));
  ok('ověření v relaci je vázané na člověka i verzi', klicOvereniSouhlasu(7).includes(':7:') && klicOvereniSouhlasu(7).includes(VERZE_PODMINEK) && klicOvereniSouhlasu(7) !== klicOvereniSouhlasu(8));

  // ---- server: bez souhlasu účet nevznikne, verze se uloží ----
  for (const [cesta, nazev] of [['app/api/register/route.ts', 'registrace podniku'], ['app/api/teams/join/route.ts', 'připojení kódem'], ['app/api/invitations/accept/route.ts', 'pozvánka'], ['app/api/client/register/route.ts', 'registrace hosta']] as const) {
    const s = cti(cesta);
    ok(`${nazev}: bez souhlasZTela 400 s hláškou a zapisSouhlas po založení`, /if \(!souhlasZTela\(b\)\)/.test(s) && /HLASKA_BEZ_SOUHLASU/.test(s) && /await zapisSouhlas\(Number\(/.test(s));
  }
  const host = cti('app/api/client/register/route.ts');
  ok('host: bez věku 400', /if \(!vekZTela\(b\)\) return NextResponse\.json\(\{ error: HLASKA_BEZ_VEKU \}, \{ status: 400 \}\)/.test(host));
  ok('host: souhlas se kontroluje před limitem pokusů a bcryptem', host.indexOf('souhlasZTela(b)') < host.indexOf('client-register-ip'));
  const reg = cti('app/api/register/route.ts');
  ok('podnik: souhlas se kontroluje před limitem pokusů', reg.indexOf('souhlasZTela(b)') < reg.indexOf('register-ip'));
  const pozv = cti('app/api/invitations/accept/route.ts');
  ok('pozvánka: souhlas se uloží i u existujícího účtu', (pozv.match(/await zapisSouhlas\(/g) ?? []).length === 2);
  const db = cti('lib/pravni/souhlasDb.ts');
  ok('zápis: verze podmínek, zásad a čas jedním UPDATE', /SET terms_version = \$\{VERZE_PODMINEK\}, privacy_version = \$\{VERZE_ZASAD\}, terms_accepted_at = NOW\(\)/.test(db));
  const init = cti('app/api/init/route.ts');
  ok('migrace: users.terms_version a users.privacy_version', /ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT/.test(init) && /ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version TEXT/.test(init));
  const api = cti('app/api/account/souhlas/route.ts');
  ok('API souhlasu: GET potreba podle verze a role, POST jen s terms: true', /potrebujeSouhlas\(r\.role, r\)/.test(api) && /if \(!souhlasZTela\(b\)\)/.test(api));
  eq('hlášky serveru', [HLASKA_BEZ_SOUHLASU, HLASKA_BEZ_VEKU], ['Bez souhlasu s podmínkami účet založit nejde.', 'Účet hosta si můžeš založit od 15 let.']);

  // ---- klient: zaškrtávátko místo pasivní věty ----
  for (const [cesta, nazev] of [['components/registrace/Cesta.tsx', 'registrace podniku'], ['app/(auth)/join/page.tsx', 'připojení'], ['components/client/AuthForms.tsx', 'registrace hosta']] as const) {
    const s = cti(cesta);
    ok(`${nazev}: SouhlasPodminek, terms ze zaškrtnutí, bez pasivní věty`, /<SouhlasPodminek /.test(s) && /terms: souhlas/.test(s) && !/Založením účtu souhlasíš|Vytvořením účtu souhlasíte/.test(s));
  }
  ok('host: neposílá terms: true natvrdo a posílá věk', !/novinky, terms: true/.test(cti('components/client/AuthForms.tsx')) && /vek15: vek/.test(cti('components/client/AuthForms.tsx')));
  const brana = cti('components/pravni/NovaVerze.tsx');
  ok('brána: GET a POST /api/account/souhlas, mimo tablet a ukázku', /fetch\('\/api\/account\/souhlas'/.test(brana) && /role !== 'kiosk'/.test(brana) && /jeCestaDema\(cesta\)/.test(brana));
  ok('brána je připojená v providers (mimo ukázku)', /\{!demo && <NovaVerze \/>\}/.test(cti('app/providers.tsx')));
  ok('ukázkový režim zná /api/account/souhlas', /'\/api\/account\/souhlas'/.test(cti('lib/demo/routy/zaklad.ts')));

  // ---- podnik: B2B prohlášení, obchodní podmínky a zpracovatelská smlouva (2026-10-21) ----
  ok('registrace podniku: SouhlasPodminek ve variantě podnik', /<SouhlasPodminek id="cs-souhlas" podnik /.test(cti('components/registrace/Cesta.tsx')));
  const souhlasUi = cti('components/pravni/SouhlasPodminek.tsx');
  ok('souhlas podniku: „jednám jako podnikatel“ a odkazy na obchodní podmínky a zpracovatelskou smlouvu', /Jednám jako podnikatel/.test(souhlasUi) && /odkazy\.obchodniPodminky/.test(souhlasUi) && /odkazy\.zpracovatelskaSmlouva/.test(souhlasUi));
  ok('brána: vlastník podniku dostane variantu podnik', /podnik=\{vlastnik\}/.test(brana) && /vlastnik: await jeVlastnikPodniku\(id\)/.test(api));

  // ---- čísla v dokumentech sedí s kódem ----
  eq('lhůty retence v dokumentech = lib/retence.ts', [RETENCE_TEXT.neaktivniHostMesicu, RETENCE_TEXT.upozorneniPredemDni, RETENCE_TEXT.auditLogLet, RETENCE_TEXT.oznameniDni, RETENCE_TEXT.zrusenyPodnikDni],
    [RETENCE.neaktivniHostMesicu, RETENCE.upozorneniPredemDni, RETENCE.auditLogLet, RETENCE.oznameniDni, RETENCE.zrusenyPodnikDni]);
  ok('auth_attempts se mažou po 1 dni (init)', RETENCE_TEXT.pokusyPrihlaseniDni === 1 && /DELETE FROM auth_attempts WHERE window_start < NOW\(\) - INTERVAL '1 day'/.test(init));
  eq('tarify v dokumentech = lib/plan.ts', [TARIFY.zkusebniDni, TARIFY.ceny], [TRIAL_DAYS, PRICES]);
  eq('platnost odkazu na zálohu', LHUTY.odkazZalohyDni, PLATNOST_ODKAZU_DNI);
  ok('platnost relace 30 dní (lib/authRelace.ts)', LHUTY.relaceDni === 30 && /PLATNOST_S = 30 \* 24 \* 60 \* 60/.test(cti('lib/authRelace.ts')));

  // ---- Stripe ----
  const billing = cti('lib/billing.ts');
  ok('Stripe: patička faktury z lib/firma.ts u nového zákazníka i před pokladnou', /invoice_settings: \{ footer: patickaFaktury\(\) \}/.test(billing) && /nastavPatickuFaktury\(s, customer\)/.test(billing));
  ok('Stripe: consent_collection jen s STRIPE_SOUHLAS_PODMINEK=1', /env\.STRIPE_SOUHLAS_PODMINEK === '1'/.test(billing) && /\.\.\.\(souhlasVPokladne\(\) \? \{ consent_collection: \{ terms_of_service: 'required' as const \} \} : \{\}\)/.test(billing));

  // ---- export ----
  ok('export dat: verze souhlasu v profilu', ['terms_version', 'privacy_version', 'terms_accepted_at'].every(k => (POLE_PROFILU as readonly string[]).includes(k)));
}
