// Spuštění, balík O — App Store a Google Play: co aplikace slibuje, to umí.
//
// Hlídá: odkazy a nová okna v obalu (cizí web do prohlížeče v aplikaci, naše soubory přes
// sdílecí list), kód podniku z ruky, založení podniku jen na webu, eskalaci nahlášeného obsahu
// provozovateli, offline kartu v obalu, pluginy obalů a dokumentaci a texty obchodů proti kódu
// (názvy proměnných, žádný zvuk v Data safety, žádné „jen česky", žádný kalendář u rezervace).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { cilOdkazu, cestaZKoduPodniku, cestaZQr } from '../../lib/nativni/most.ts';
import { rozhodniObal, CESTA_PODNIK_NA_WEBU, ZPRAVA_REGISTRACE_V_OBALU } from '../../lib/obal.ts';
import { kontaktModerace, stavLhuty, emailEskalace, LHUTA_NAHLASENI_HODIN } from '../../lib/moderace.ts';
import { KLIC_KARTY, KARTA_KOD, KARTA_SVG } from '../../lib/offlineKarta.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const ZAKLAD = 'https://www.managero.app/employer/overview';

export default async function ({ eq, ok }: Testy) {
  // ---- odkazy a nová okna v obalu ----
  eq('odkaz: obyčejná navigace uvnitř aplikace', cilOdkazu('/employer/overview?view=chat', ZAKLAD), { druh: 'web' });
  eq('odkaz: cizí web do prohlížeče v aplikaci', cilOdkazu('https://mapy.cz/zakladni?q=x', ZAKLAD), { druh: 'prohlizec', url: 'https://mapy.cz/zakladni?q=x' });
  eq('odkaz: cizí web i bez nového okna (allowNavigation by ho poslal do Safari)', cilOdkazu('https://dodavatel.example/objednat', ZAKLAD).druh, 'prohlizec');
  eq('odkaz: naše veřejná stránka do nového okna → prohlížeč s celou adresou', cilOdkazu('/client/cafe-demo', ZAKLAD, { noveOkno: true }), { druh: 'prohlizec', url: 'https://www.managero.app/client/cafe-demo' });
  eq('odkaz: fotka z API do nového okna → soubor se stáhne s přihlášením', cilOdkazu('/api/upload/42', ZAKLAD, { noveOkno: true }), { druh: 'soubor', url: 'https://www.managero.app/api/upload/42', nazev: '42' });
  eq('odkaz: <a download> s názvem', cilOdkazu('/api/client/coupons/3/qr', ZAKLAD, { stahnout: 'kupon.png' }), { druh: 'soubor', url: 'https://www.managero.app/api/client/coupons/3/qr', nazev: 'kupon.png' });
  eq('odkaz: blob z <a download> (kartička jako obrázek)', cilOdkazu('blob:https://www.managero.app/abc', ZAKLAD, { stahnout: 'karta.png' }), { druh: 'soubor', url: 'blob:https://www.managero.app/abc', nazev: 'karta.png' });
  eq('odkaz: apex managero.app je náš (vytištěné QR)', cilOdkazu('https://managero.app/employer', ZAKLAD), { druh: 'web' });
  eq('odkaz: mailto a tel obslouží systém', [cilOdkazu('mailto:podpora@managero.app', ZAKLAD).druh, cilOdkazu('tel:+420123', ZAKLAD).druh], ['web', 'web']);
  eq('odkaz: nesmysl nic nerozbije', cilOdkazu('http://[::1', ZAKLAD), { druh: 'web' });

  // ---- kód podniku napsaný rukou ----
  eq('kód podniku: slug', cestaZKoduPodniku('cafe-demo'), '/client/cafe-demo');
  eq('kód podniku: velká písmena a mezery', cestaZKoduPodniku('  Cafe Demo '), '/client/cafe-demo');
  eq('kód podniku: opsaná adresa bez https', cestaZKoduPodniku('www.managero.app/client/cafe-demo'), '/client/cafe-demo');
  eq('kód podniku: vložená adresa stolu', cestaZKoduPodniku('https://www.managero.app/client/cafe-demo?tab=order&table=3'), '/client/cafe-demo?tab=order&table=3');
  eq('kód podniku: cizí adresa ne', cestaZKoduPodniku('https://evil.example/client/x'), null);
  eq('kód podniku: diakritika a prázdno ne', [cestaZKoduPodniku('Kavárna'), cestaZKoduPodniku(''), cestaZKoduPodniku('   ')], [null, null, null]);
  eq('sken: QR podniku i stolu otevře podnik, cizí ne', [cestaZQr('https://www.managero.app/client/x1'), cestaZQr('https://evil.example/client/x1')], ['/client/x1', null]);

  // ---- založení podniku jen na webu (Apple 3.1.3(f)) ----
  eq('registrace: v aplikaci Managero /register → vysvětlení', rozhodniObal({ obal: 'managero', pathname: '/register' }), { akce: 'presmerovat', kam: CESTA_PODNIK_NA_WEBU });
  eq('registrace: API z aplikace Managero 403', rozhodniObal({ obal: 'managero', pathname: '/api/register', method: 'POST' }), { akce: 'api', status: 403, zprava: ZPRAVA_REGISTRACE_V_OBALU });
  eq('registrace: API z hostovské aplikace taky ne', rozhodniObal({ obal: 'client', pathname: '/api/register', method: 'POST' }).akce, 'api');
  eq('registrace: registrace hosta v hostovské aplikaci zůstává', rozhodniObal({ obal: 'client', pathname: '/api/client/register', method: 'POST' }), { akce: 'pustit' });
  eq('registrace: vysvětlující stránka v aplikaci Managero projde', rozhodniObal({ obal: 'managero', pathname: CESTA_PODNIK_NA_WEBU }), { akce: 'pustit' });
  eq('registrace: připojení zaměstnance kódem zůstává', rozhodniObal({ obal: 'managero', pathname: '/join' }), { akce: 'pustit' });
  eq('registrace: web beze změny', [rozhodniObal({ obal: null, pathname: '/register' }), rozhodniObal({ obal: null, pathname: '/api/register' })], [{ akce: 'pustit' }, { akce: 'pustit' }]);
  const stranka = zdroj('app/(auth)/zalozit-podnik/page.tsx');
  ok('registrace: vysvětlení v obalu bez odkazu na web a platbu', !/href=["'`]https?:/.test(stranka) && !/billing|stripe|cen[ayí]\b/i.test(stranka) && /vObalu &&|!vObalu &&/.test(stranka));
  ok('registrace: middleware zná /zalozit-podnik', /'\/zalozit-podnik'/.test(zdroj('middleware.ts')));

  // ---- eskalace nahlášeného obsahu ----
  eq('moderace: e-mail provozovatele z MODERACE_EMAIL', kontaktModerace({ MODERACE_EMAIL: 'moderace@firma.cz', FIRMA_EMAIL_PODPORY: 'podpora@firma.cz' }), 'moderace@firma.cz');
  eq('moderace: jinak e-mail podpory', kontaktModerace({ FIRMA_EMAIL_PODPORY: ' podpora@firma.cz ' }), 'podpora@firma.cz');
  eq('moderace: zástupné pole ani nesmysl ne', [kontaktModerace({ FIRMA_EMAIL_PODPORY: '{{EMAIL_PODPORY}}' }), kontaktModerace({ MODERACE_EMAIL: 'x' }), kontaktModerace({})], [null, null, null]);
  eq('moderace: lhůta 24 hodin', LHUTA_NAHLASENI_HODIN, 24);
  eq('moderace: čerstvé nahlášení má skoro celou lhůtu', stavLhuty('open', 0.5), { stav: 'v_lhute', zbyvaHodin: 24 });
  eq('moderace: poslední hodina', stavLhuty('open', 23.2), { stav: 'v_lhute', zbyvaHodin: 1 });
  eq('moderace: po lhůtě', stavLhuty('open', 27.5), { stav: 'po_lhute', poHodin: 3 });
  eq('moderace: vyřízené lhůtu nemá', [stavLhuty('removed', 99), stavLhuty('dismissed', 1)], [{ stav: 'vyrizeno' }, { stav: 'vyrizeno' }]);
  const mail = emailEskalace({ id: 7, podnik: 'Kavárna <U Lípy>', druh: 'zprava', duvod: 'obtezujici', odkaz: 'https://www.managero.app/admin/nahlaseni' });
  ok('moderace: e-mail říká podnik, důvod a vede do správy', /#7/.test(mail.subject) && /Obtěžování/.test(mail.subject) && mail.html.includes('/admin/nahlaseni') && mail.html.includes('Kavárna &lt;U Lípy&gt;'));
  const reportsRoute = zdroj('app/api/reports/route.ts');
  ok('moderace: nové nahlášení se eskaluje, e-mail nenese opis zprávy', /eskalujNahlaseni\(/.test(reportsRoute) && !/snapshot|opis/.test(zdroj('lib/moderaceDb.ts').split('export async function eskalujNahlaseni')[1] ?? 'snapshot'));
  ok('moderace: správa platformy má stránku i API a zásah jde do historie', /\/admin\/nahlaseni/.test(zdroj('components/admin/AdminShell.tsx')) && /logAdmin\(/.test(zdroj('app/api/admin/nahlaseni/[id]/route.ts')) && /requireSuperadmin/.test(zdroj('app/api/admin/nahlaseni/route.ts')));
  ok('moderace: sloupec escalated_at je v DDL', /ALTER TABLE content_reports ADD COLUMN IF NOT EXISTS escalated_at/.test(zdroj('app/api/init/route.ts')));

  // ---- offline karta v obalu ----
  const offlineKlient = zdroj('apps/client/www/offline.html');
  ok('offline obalu: client čte kartičku z Preferences i localStorage se stejným klíčem a kontrolou jako lib/offlineKarta.ts',
    offlineKlient.includes(`'${KLIC_KARTY}'`) && offlineKlient.includes('Plugins.Preferences') && offlineKlient.includes(KARTA_KOD.source) && offlineKlient.includes(KARTA_SVG.source));
  ok('offline obalu: kód se vkládá přes textContent', offlineKlient.includes("getElementById('host-karta-kod').textContent") && !/host-karta-kod'\)\.innerHTML/.test(offlineKlient));
  const offlineProvoz = zdroj('apps/managero/www/offline.html');
  ok('offline obalu: Managero kartu hosta nemá, značky bloků nezůstaly', !offlineProvoz.includes('id="host-karta"') && !/<!--\/?KARTA-->/.test(offlineProvoz + offlineKlient));
  const karta = zdroj('lib/offlineKarta.ts');
  ok('offline karta: ukládá se i do úložiště aplikace a po odhlášení se tam maže', /pr\.set\(\{ key: KLIC_KARTY/.test(karta) && /pr\.remove\(\{ key: KLIC_KARTY/.test(karta));

  // ---- most: soubory, sandbox ----
  const most = zdroj('components/NativeBridge.tsx');
  ok('most: sdílení předá soubory (Filesystem → Share files), canShare říká pravdu', /zapisDoCache\(/.test(most) && /files,/.test(most) && /canShare = /.test(most));
  ok('most: ladicí binárka hlásí sandbox APNs', /jeLadiciBinarka\(\)/.test(most) && /env: 'sandbox'/.test(most));
  ok('most: odkazy a window.open jdou přes cilOdkazu a plugin Browser', /cilOdkazu\(/.test(most) && /plugin\('Browser'\)/.test(most) && /window\.open = function/.test(most));
  const poCap = zdroj('apps/scripts/po-cap-add.mjs');
  ok('po-cap-add: aps-environment volitelně production (APS_ENV) a hodnota jde do entitlements', /process\.env\.APS_ENV === 'production'/.test(poCap) && poCap.includes('<string>${aps}</string>'));

  // ---- pluginy obalů ----
  const balik = (a: string) => JSON.parse(zdroj(`apps/${a}/package.json`));
  const [pm, pc] = [balik('managero'), balik('client')];
  for (const p of ['@capacitor/filesystem', '@capacitor/browser', '@capacitor/share', '@capacitor/preferences']) {
    ok(`obaly: ${p} v obou se stejnou verzí`, !!pm.dependencies[p] && pm.dependencies[p] === pc.dependencies[p]);
  }
  ok('obaly: Capacitor 8 a pluginy řady 8', /^\^8\./.test(pc.dependencies['@capacitor/core']) && /^\^8\./.test(pc.dependencies['@capacitor/filesystem']) && /^\^8\./.test(pc.dependencies['@capacitor/browser']));
  ok('obaly: kořenový package.json Capacitor nemá', !/@capacitor\//.test(zdroj('package.json')));

  // ---- dokumentace a texty obchodů proti kódu ----
  const apple = zdroj('docs/obchody/APPLE.md');
  const google = zdroj('docs/obchody/GOOGLE.md');
  const push = zdroj('lib/nativniPush.ts');
  for (const v of ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_KEY_P8', 'FCM_PROJECT_ID', 'FCM_SERVICE_ACCOUNT']) {
    ok(`dokumentace: ${v} čte kód a návod ho jmenuje`, push.includes(v) && apple.includes(`\`${v}\``));
  }
  ok('dokumentace: staré názvy proměnných jen jako varování', !/FCM_SERVICE_ACCOUNT_JSON/.test(apple + google + zdroj('docs/obchody/CHECKLIST.md')) && (apple.match(/APNS_PRIVATE_KEY/g) ?? []).length <= 1);
  ok('Data safety a App Privacy: zvuk se nesbírá', !/\| Zvuk \|/.test(google) && !/Audio Data \| hlasov/.test(apple));
  ok('dokumentace: Face ID se jako funkce neslibuje', !/Face ID zámek \(client\)/.test(apple) && !/skener QR, Face ID,/.test(google));
  const texty = ['cs', 'en-US'].flatMap(l => ['client', 'managero'].map(a => zdroj(`apps/app-store/${a}/metadata/${l}/description.txt`)))
    .concat(['cs-CZ', 'en-US'].flatMap(l => ['client', 'managero'].map(a => zdroj(`apps/play-store/${a}/metadata/android/${l}/full_description.txt`))));
  ok('texty obchodů: žádné „jen česky" (aplikace mluví jazykem telefonu)', texty.every(t => !/Czech only|dostupná v češtině/.test(t)));
  ok('texty obchodů: rezervace do kalendáře neslibují (kalendář je u akcí)', texty.every(t => !/rezervaci přidáš do kalendáře|reservation to your calendar/i.test(t)));
  ok('texty obchodů: Naskenovat a kód podniku u client', /Naskenovat/.test(zdroj('apps/app-store/client/metadata/cs/description.txt')) && /Tap Scan/.test(zdroj('apps/app-store/client/metadata/en-US/description.txt')));
  for (const a of ['client', 'managero']) {
    const n = zdroj(`apps/app-store/${a}/metadata/review_information/notes.txt`);
    ok(`poznámky ${a}: do 4000 znaků i po dosazení údajů`, n.length + 200 < 4000);
    ok(`poznámky ${a}: jazyk podle telefonu, ne „Czech only"`, /device language/.test(n) && !/Czech only/.test(n));
  }
  const nc = zdroj('apps/app-store/client/metadata/review_information/notes.txt');
  ok('poznámky client: záložky, Naskenovat a mazání účtu podle skutečných názvů', /"Podniky" \(Places\)/.test(nc) && /"Naskenovat" \(Scan\)/.test(nc) && /Účet a soukromí/.test(nc) && !/Karta tab|Profil:/.test(nc));
  const nm = zdroj('apps/app-store/managero/metadata/review_information/notes.txt');
  ok('poznámky Managero: založení podniku na webu a 3.1.3(f), mazání účtu v Data a soukromí', /3\.1\.3\(f\)/.test(nm) && /Data a soukromí/.test(nm) && !/reset before every submission/.test(nm));
}
