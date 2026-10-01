// Kolo 77 — nativní obal a obchody: poznání aplikace z User-Agentu, brána tras,
// kategorie oznámení, nativní push (APNs/FCM), právní texty, název souboru.
//
// Co se hlídá: značka v User-Agentu práva jen ZUŽUJE, nikdy nerozšiřuje;
// hostovská aplikace nedosáhne na provoz a platby; provozní nepustí hostovské
// stránky; právní stránky jdou z obou aplikací; novinky podniků chodí jen s
// výslovným souhlasem; nativní push bez klíčů nic nedělá a s klíči sestaví
// správné zprávy.

import { generateKeyPairSync, verify } from 'node:crypto';
import type { Testy } from './_testy.ts';
import {
  obalZUserAgent, rozhodniObal, rolePatriDoObalu, jePravniStranka, smiPlatby, obalZHlavicek,
  ZPRAVA_PLATBY_V_OBALU,
} from '../../lib/obal.ts';
import { jeZtlumeno, neutralniProNativni, CATEGORY_PREF, OPT_IN } from '../../lib/pushPravidla.ts';
import {
  apnsJwt, sestavApnsPayload, sestavFcmZpravu, apnsKonfigurace, fcmKonfigurace, apnsTokenNeplatny, fcmTokenNeplatny,
  poslatApns, poslatFcm, poslatNativne, ANDROID_KANAL, topicPro, nativniPushNastaven, BUNDLE_ID, normalizujPem, type Doprava,
} from '../../lib/nativniPush.ts';
import { mistniCesta } from '../../lib/bezpecnaUrl.ts';
import { zjistiObalUa } from '../../lib/nativni/most.ts';
import { existsSync, readFileSync } from 'node:fs';
import { bezpecnyNazev } from '../../lib/nazevSouboru.ts';
import { firma, chybejiciUdaje, jeEmail, ZASTUPNA } from '../../lib/firma.ts';
import { dokument, KLICE_DOKUMENTU } from '../../lib/pravni/texty.ts';

const UA_PROVOZ = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ManageroApp/1.0.0 (build 12)';
const UA_KLIENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ManageroClient/1.2.3 (build 45)';
const UA_WEB = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

export default async function ({ eq, ok }: Testy) {
  // ---- poznání aplikace ----
  eq('obal: provozní aplikace', obalZUserAgent(UA_PROVOZ), { obal: 'managero', verze: '1.0.0', build: 12 });
  eq('obal: hostovská aplikace', obalZUserAgent(UA_KLIENT), { obal: 'client', verze: '1.2.3', build: 45 });
  eq('obal: běžný prohlížeč není obal', obalZUserAgent(UA_WEB).obal, null);
  eq('obal: prázdný a chybějící UA', [obalZUserAgent('').obal, obalZUserAgent(null).obal, obalZUserAgent(undefined).obal], [null, null, null]);
  eq('obal: bez čísla buildu', obalZUserAgent('ManageroApp/2.0'), { obal: 'managero', verze: '2.0', build: null });
  eq('obal: obě značky najednou platí přísnější (host)', obalZUserAgent('ManageroApp/1.0 ManageroClient/1.0').obal, 'client');
  eq('obal: podobný řetězec není značka', obalZUserAgent('ManageroApplication/1').obal, null);
  eq('obal: z hlaviček', obalZHlavicek({ get: (k: string) => (k === 'user-agent' ? UA_KLIENT : null) }), 'client');

  // ---- brána tras: hostovská aplikace ----
  const c = (pathname: string) => rozhodniObal({ obal: 'client', pathname });
  const m = (pathname: string) => rozhodniObal({ obal: 'managero', pathname });
  const web = (pathname: string) => rozhodniObal({ obal: null, pathname });
  eq('host: /client projde', c('/client'), { akce: 'pustit' });
  eq('host: /client/slug projde', c('/client/cafe-demo'), { akce: 'pustit' });
  eq('host: /client/me projde', c('/client/me'), { akce: 'pustit' });
  eq('host: /employer neprojde', c('/employer/overview'), { akce: 'presmerovat', kam: '/client' });
  eq('host: /employee neprojde', c('/employee/shifts'), { akce: 'presmerovat', kam: '/client' });
  eq('host: /kiosk a /admin neprojdou', [c('/kiosk'), c('/admin')], [{ akce: 'presmerovat', kam: '/client' }, { akce: 'presmerovat', kam: '/client' }]);
  eq('host: úvodní stránka s cenami neprojde', c('/'), { akce: 'presmerovat', kam: '/client' });
  eq('host: přihlášení provozu vede na přihlášení hosta', [c('/login'), c('/register'), c('/join')], Array(3).fill({ akce: 'presmerovat', kam: '/client/login' }));
  eq('host: zapomenuté heslo provozu vede na heslo hosta', c('/zapomenute-heslo'), { akce: 'presmerovat', kam: '/client/zapomenute-heslo' });
  eq('host: /s a /demo neprojdou', [c('/s/abc').akce, c('/demo').akce], ['presmerovat', 'presmerovat']);
  for (const p of ['/soukromi', '/podminky', '/podpora', '/smazat-ucet', '/en/soukromi', '/en/smazat-ucet', '/smazat-ucet/potvrdit']) {
    eq(`host: právní stránka ${p} projde`, c(p), { akce: 'pustit' });
    eq(`provoz: právní stránka ${p} projde`, m(p), { akce: 'pustit' });
  }
  eq('host: .well-known projde', c('/.well-known/apple-app-site-association'), { akce: 'pustit' });
  eq('host: /_next projde', c('/_next/static/x.js'), { akce: 'pustit' });

  // ---- API hostovské aplikace ----
  eq('host API: /api/client/b/x projde', c('/api/client/b/cafe-demo'), { akce: 'pustit' });
  eq('host API: /api/client/me projde', c('/api/client/me'), { akce: 'pustit' });
  eq('host API: admin ne (404)', c('/api/client/admin/summary'), { akce: 'api', status: 404, zprava: 'Nenalezeno.' });
  eq('host API: staff ne (404)', c('/api/client/staff/scan'), { akce: 'api', status: 404, zprava: 'Nenalezeno.' });
  eq('host API: auth, push, native, notifications, account projdou',
    ['/api/auth/session', '/api/push/subscribe', '/api/native/push', '/api/notifications', '/api/account'].map(p => c(p).akce), Array(5).fill('pustit'));
  for (const p of ['/api/inventory', '/api/shifts', '/api/teams', '/api/mcp', '/api/seed', '/api/backup', '/api/init', '/api/conversations/1/messages', '/api/reports', '/api/blocks']) {
    eq(`host API: ${p} ne (404)`, c(p).akce, 'api');
  }

  // ---- platby: server je v obalu odmítne vždy (403), na webu ne ----
  for (const p of ['/api/billing/checkout', '/api/billing/portal', '/api/billing/upgrade']) {
    eq(`platby: ${p} z provozní aplikace 403`, m(p), { akce: 'api', status: 403, zprava: ZPRAVA_PLATBY_V_OBALU });
    eq(`platby: ${p} z hostovské aplikace 403`, c(p), { akce: 'api', status: 403, zprava: ZPRAVA_PLATBY_V_OBALU });
    eq(`platby: ${p} z webu projde bránou`, web(p), { akce: 'pustit' });
  }
  ok('platby: webhook Stripe brána nezasahuje', m('/api/billing/webhook').akce === 'pustit');
  ok('platby: v obalu se nesmí nabízet, na webu ano', !smiPlatby('managero') && !smiPlatby('client') && smiPlatby(null));

  // ---- provozní aplikace ----
  eq('provoz: /client neprojde', m('/client'), { akce: 'presmerovat', kam: '/' });
  eq('provoz: /client/login a /client/me neprojdou', [m('/client/login').akce, m('/client/me').akce], ['presmerovat', 'presmerovat']);
  eq('provoz: /employer projde', m('/employer/overview'), { akce: 'pustit' });
  eq('provoz: přihlášení a úvod projdou', [m('/login').akce, m('/').akce, m('/join').akce], ['pustit', 'pustit', 'pustit']);
  eq('provoz API: správa klienta projde', [m('/api/client/admin/summary').akce, m('/api/client/staff/scan').akce, m('/api/client/img/3').akce], ['pustit', 'pustit', 'pustit']);
  eq('provoz API: hostovské API ne (404)', [m('/api/client/b/cafe-demo').akce, m('/api/client/me').akce, m('/api/client/card').akce, m('/api/client/register').akce], Array(4).fill('api'));
  eq('provoz API: sklad, směny projdou', [m('/api/inventory').akce, m('/api/shifts').akce], ['pustit', 'pustit']);

  // ---- značka jen zužuje, nikdy nerozšiřuje ----
  // Bez značky brána nedělá nic (web prochází bez omezení), se značkou může jen něco zavřít.
  for (const p of ['/', '/login', '/client', '/employer/x', '/api/billing/checkout', '/api/client/admin/x', '/soukromi']) {
    eq(`web: ${p} brána nezasahuje`, web(p), { akce: 'pustit' });
  }
  ok('zužování: žádná cesta, kterou web nemá, se značkou nevznikne (jen pustit/odmítnout)',
    ['/api/x', '/x', '/client', '/employer'].every(p => ['pustit', 'api', 'presmerovat'].includes(c(p).akce) && ['pustit', 'api', 'presmerovat'].includes(m(p).akce)));
  ok('role: host patří do hostovské aplikace, ostatní do provozní',
    rolePatriDoObalu('client', 'customer') && !rolePatriDoObalu('client', 'employer') && !rolePatriDoObalu('client', 'employee')
    && rolePatriDoObalu('managero', 'employer') && rolePatriDoObalu('managero', 'kiosk') && !rolePatriDoObalu('managero', 'customer'));
  ok('role: bez obalu (web) jde kdokoli kamkoli', rolePatriDoObalu(null, 'customer') && rolePatriDoObalu(null, 'employer'));
  ok('právní stránka: přesná cesta, ne předpona cizí stránky', jePravniStranka('/podpora') && !jePravniStranka('/podpora-x') && !jePravniStranka('/employer/podpora'));

  // ---- kategorie oznámení: opt-in pro novinky podniků ----
  ok('push: novinky bez souhlasu jsou ztlumené', jeZtlumeno({}, 'novinky') && jeZtlumeno(null, 'novinky') && jeZtlumeno({ novinky: false }, 'novinky'));
  ok('push: novinky se souhlasem chodí', !jeZtlumeno({ novinky: true }, 'novinky'));
  ok('push: „truthy“ není souhlas', jeZtlumeno({ novinky: 'true' as unknown as boolean }, 'novinky') && jeZtlumeno({ novinky: 1 as unknown as boolean }, 'novinky'));
  ok('push: běžné kategorie jsou ve výchozím stavu zapnuté', !jeZtlumeno({}, 'message') && !jeZtlumeno(null, 'stock') && !jeZtlumeno({}, 'shift'));
  ok('push: běžnou kategorii lze vypnout', jeZtlumeno({ messages: false }, 'message') && jeZtlumeno({ lowStock: false }, 'stock') && jeZtlumeno({ shifts: false }, 'shift'));
  ok('push: obecná a transakční oznámení chodí vždy', !jeZtlumeno({ novinky: false, messages: false }, 'general') && !jeZtlumeno({}, undefined));
  ok('push: opt-in je jen novinky', OPT_IN.size === 1 && OPT_IN.has('novinky') && CATEGORY_PREF.novinky === 'novinky');
  eq('push: oznámení o platbě se do obalu posílá neutrálně a bez odkazu',
    neutralniProNativni({ title: 'Platba se nezdařila', body: 'Zkontroluj kartu v Nastavení → Předplatné', link: '/employer/overview?view=settings&tab=billing' }, 'billing'),
    { title: 'Upozornění k účtu podniku', body: 'Vedení podniku ho může vyřídit mimo aplikaci.', link: undefined });
  eq('push: ostatní oznámení se nemění', neutralniProNativni({ title: 'Nová zpráva', link: '/' }, 'chat'), { title: 'Nová zpráva', link: '/' });

  // ---- nativní push: sestavení zpráv ----
  const p1 = sestavApnsPayload({ title: 'Rezervace potvrzena', body: 'Dnes v 18:00', link: '/client/me', tag: 'rez-5', badge: 3 }) as any;
  eq('APNs: alert, zvuk, odznak, vlákno', [p1.aps.alert, p1.aps.sound, p1.aps.badge, p1.aps['thread-id']], [{ title: 'Rezervace potvrzena', body: 'Dnes v 18:00' }, 'default', 3, 'rez-5']);
  eq('APNs: odkaz je mimo aps', p1.link, '/client/me');
  eq('APNs: bez odkazu vede na kořen', (sestavApnsPayload({ title: 'x' }) as any).link, '/');
  ok('APNs: dlouhý text se zkrátí', ((sestavApnsPayload({ title: 'a'.repeat(500), body: 'b'.repeat(500) }) as any).aps.alert.body as string).length <= 240);
  const f1 = sestavFcmZpravu('tok', { title: 'Hotovo', body: 'Objednávka je hotová', link: '/client/me', tag: 'o-1' }) as any;
  eq('FCM: token, notifikace, data s odkazem', [f1.message.token, f1.message.notification.title, f1.message.data.link, f1.message.data.tag], ['tok', 'Hotovo', '/client/me', 'o-1']);

  // bundle ID: rozhodnutí `app.managero.app` (provoz) a `app.managero.client` (host)
  eq('bundle ID: výchozí témata', [topicPro('managero', {}), topicPro('client', {})], ['app.managero.app', 'app.managero.client']);
  eq('bundle ID: konstanty', BUNDLE_ID, { managero: 'app.managero.app', client: 'app.managero.client' });
  eq('bundle ID: přepsání z prostředí', topicPro('client', { APNS_TOPIC_CLIENT: 'jiny.bundle' }), 'jiny.bundle');

  // ---- APNs JWT: podpis jde ověřit veřejným klíčem ----
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const p8 = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const jwt = apnsJwt('KEY123', 'TEAM456', p8, 1_800_000_000);
  const [h, b, sig] = jwt.split('.');
  eq('APNs JWT: hlavička a tělo', [JSON.parse(Buffer.from(h, 'base64url').toString()), JSON.parse(Buffer.from(b, 'base64url').toString())],
    [{ alg: 'ES256', kid: 'KEY123' }, { iss: 'TEAM456', iat: 1_800_000_000 }]);
  ok('APNs JWT: podpis ES256 (ieee-p1363, 64 bajtů) sedí', Buffer.from(sig, 'base64url').length === 64
    && verify('sha256', Buffer.from(`${h}.${b}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
  ok('APNs JWT: klíč s doslovnými \\n se opraví', normalizujPem(p8.replace(/\n/g, '\\n')) === p8);

  // ---- bez klíčů je nativní push no-op, s klíči odesílá přes rozhraní ----
  eq('push: bez klíčů není nic nastavené', nativniPushNastaven({}), { ios: false, android: false });
  eq('push: APNs konfigurace vyžaduje všechny tři hodnoty', [apnsKonfigurace({ APNS_KEY_ID: 'k', APNS_TEAM_ID: 't' }), fcmKonfigurace({ FCM_PROJECT_ID: 'p' })], [null, null]);
  const bez = await poslatNativne([{ token: 't'.repeat(40), app: 'client', platform: 'ios', env: 'production' }, { token: 'f'.repeat(40), app: 'managero', platform: 'android', env: 'production' }], { title: 'x' }, {});
  eq('push: bez klíčů se nic neodešle a nic nespadne', bez, { neplatne: [], odeslano: 0 });
  ok('push: APNs token 410 a BadDeviceToken je neplatný, 500 ne',
    apnsTokenNeplatny(410, undefined) && apnsTokenNeplatny(400, 'BadDeviceToken') && !apnsTokenNeplatny(500, 'InternalServerError') && !apnsTokenNeplatny(429, 'TooManyRequests'));
  ok('push: FCM 404 je neplatný, 500 ne', fcmTokenNeplatny(404, '') && fcmTokenNeplatny(400, '{"error":{"details":[{"errorCode":"UNREGISTERED"}],"message":"token"}}') && !fcmTokenNeplatny(500, ''));
  const odpovedi: Record<string, { status: number; telo: string }> = { dobry: { status: 200, telo: '' }, mrtvy: { status: 410, telo: '{"reason":"Unregistered"}' }, vadny: { status: 400, telo: '{"reason":"BadDeviceToken"}' }, dockani: { status: 503, telo: '{"reason":"ServiceUnavailable"}' } };
  const volani: { path: string; topic: string; auth: boolean; sandbox: boolean }[] = [];
  const doprava: Doprava = async ({ host, hlavicky }) => {
    const token = hlavicky[':path'].split('/').pop()!;
    volani.push({ path: hlavicky[':path'], topic: hlavicky['apns-topic'], auth: /^bearer .+\..+\..+$/.test(hlavicky.authorization), sandbox: host.includes('sandbox') });
    return odpovedi[token];
  };
  const cfg = apnsKonfigurace({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_KEY_P8: p8 })!;
  const r = await poslatApns(cfg, [
    { token: 'dobry', app: 'client', env: 'production' }, { token: 'mrtvy', app: 'managero', env: 'sandbox' },
    { token: 'vadny', app: 'client', env: 'production' }, { token: 'dockani', app: 'client', env: 'production' },
  ], { title: 'Ahoj', tag: 't1' }, doprava);
  eq('APNs: odesláno 1, neplatné tokeny se vrátí k smazání, přechodná chyba ne', [r.odeslano, r.neplatne.sort()], [1, ['mrtvy', 'vadny']]);
  eq('APNs: téma podle aplikace a sandbox podle prostředí', [volani.find(v => v.path.endsWith('dobry'))!.topic, volani.find(v => v.path.endsWith('mrtvy'))!.topic, volani.find(v => v.path.endsWith('mrtvy'))!.sandbox],
    ['app.managero.client', 'app.managero.app', true]);
  ok('APNs: každé volání nese platný bearer JWT', volani.every(v => v.auth));
  const { privateKey: rsa } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const fcmCfg = fcmKonfigurace({ FCM_PROJECT_ID: 'projekt', FCM_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@projekt.iam', private_key: rsa.export({ type: 'pkcs8', format: 'pem' }) }) })!;
  const fcmVolani: string[] = [];
  const fakeFetch = (async (url: string, init: any) => {
    fcmVolani.push(String(url));
    if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 });
    const tok = JSON.parse(init.body).message.token;
    return tok === 'mrtvy' ? new Response('{"error":{"status":"NOT_FOUND"}}', { status: 404 }) : new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  const rf = await poslatFcm(fcmCfg, [{ token: 'ok1', app: 'client', env: 'production' }, { token: 'mrtvy', app: 'client', env: 'production' }], { title: 'Hotovo' }, fakeFetch);
  eq('FCM: odesláno 1, mrtvý token k smazání', [rf.odeslano, rf.neplatne], [1, ['mrtvy']]);
  ok('FCM: token se získá jednou a zprávy jdou na v1 endpoint projektu', fcmVolani.filter(u => u.includes('oauth2')).length === 1 && fcmVolani.some(u => u.includes('/v1/projects/projekt/messages:send')));

  // ---- odkazy z obalu: jen naše doména a místní cesta ----
  eq('odkaz: místní cesta projde', mistniCesta('/client/cafe-demo?tab=order&table=3', '/'), '/client/cafe-demo?tab=order&table=3');
  eq('odkaz: cizí doména, schémata a //host ne', [mistniCesta('https://evil.example/client', '/'), mistniCesta('javascript:alert(1)', '/'), mistniCesta('//evil.example/x', '/'), mistniCesta(null, '/')], ['/', '/', '/', '/']);

  // ---- jediný most: klient bere detekci z lib/obal.ts, push má jednoho vlastníka ----
  eq('most: detekce obalu v klientovi je ta ze serveru', [UA_PROVOZ, UA_KLIENT, UA_WEB, `${UA_PROVOZ} ManageroClient/1.0.0`].map(ua => zjistiObalUa(ua)), [UA_PROVOZ, UA_KLIENT, UA_WEB, `${UA_PROVOZ} ManageroClient/1.0.0`].map(ua => obalZUserAgent(ua)));
  ok('most: starý lib/nativniMost.ts neexistuje', !existsSync('lib/nativniMost.ts'));
  const zdroj = (p: string) => readFileSync(p, 'utf8');
  const KLICE = /managero-(native-)?push-(token|vypnuto)/;
  const vlastnici = ['components/NativeBridge.tsx', 'components/Settings.tsx', 'components/settings/SekceOznameni.tsx', 'components/client/UcetHosta.tsx', 'lib/odhlaseni.ts', 'lib/stahni.ts', 'lib/nativni/most.ts'].filter(p => KLICE.test(zdroj(p)));
  eq('most: klíč tokenu a volby push zná jen NativeBridge', vlastnici, ['components/NativeBridge.tsx']);
  ok('most: addListener(registration) jen v NativeBridge', !/addListener\('registration'/.test(zdroj('lib/nativni/most.ts')) && /addListener\('registration'/.test(zdroj('components/NativeBridge.tsx')));
  ok('most: odhlášení volá odhlasitPush mostu', /odhlasitPush\(\)/.test(zdroj('lib/odhlaseni.ts')));
  ok('most: Nastavení (Notifikace) i účet hosta při vypnutí volají vypniPush', /vypniPush\(\)/.test(zdroj('components/settings/SekceOznameni.tsx')) && /vypniPush\(\)/.test(zdroj('components/client/UcetHosta.tsx')));
  const tok = 'x'.repeat(64);
  eq('fcm: zpráva míří do kanálu, který obal na Androidu vytváří', (sestavFcmZpravu(tok, { title: 'a' }) as any).message.android.notification.channel_id, ANDROID_KANAL);
  ok('fcm: kanál je stejný jako createChannel v NativeBridge', zdroj('components/NativeBridge.tsx').includes(`id: '${ANDROID_KANAL}'`));

  // ---- název souboru ----
  eq('soubor: lomítka a zakázané znaky pryč', bezpecnyNazev('../../etc/passwd'), '..-..-etc-passwd');
  eq('soubor: prázdný název dostane výchozí', [bezpecnyNazev(''), bezpecnyNazev('  '), bezpecnyNazev('..'), bezpecnyNazev('***', 'x')], ['soubor', 'soubor', 'soubor', '-']);
  eq('soubor: běžný název zůstane', bezpecnyNazev('rozvrh-2026-09.csv'), 'rozvrh-2026-09.csv');

  // ---- údaje provozovatele: nikdy nevymyšlené ----
  const prazdna = firma({});
  eq('firma: bez prostředí zůstanou viditelná zástupná pole', [prazdna.nazev, prazdna.ico, prazdna.adresa, prazdna.emailPodpory], [ZASTUPNA.nazev, ZASTUPNA.ico, ZASTUPNA.adresa, ZASTUPNA.emailPodpory]);
  eq('firma: chybějící údaje se dají vypsat', chybejiciUdaje(prazdna), ['nazev', 'ico', 'adresa', 'emailPodpory', 'regionDat']);
  const vyplnena = firma({ FIRMA_NAZEV: 'Příklad s.r.o.', FIRMA_ICO: '12345678', FIRMA_ADRESA: 'Ulice 1, Praha', FIRMA_EMAIL_PODPORY: 'podpora@priklad.cz', FIRMA_REGION_DAT: 'EU' });
  eq('firma: vyplněné údaje se berou z prostředí', [chybejiciUdaje(vyplnena), vyplnena.nazev], [[], 'Příklad s.r.o.']);
  ok('firma: zástupný e-mail není mailto, skutečný ano', !jeEmail(ZASTUPNA.emailPodpory) && jeEmail('podpora@priklad.cz'));

  // ---- právní texty: věcné, dvoujazyčné a bez vymyšlených údajů ----
  for (const klic of KLICE_DOKUMENTU) {
    for (const jazyk of ['cs', 'en'] as const) {
      const d = dokument(klic, jazyk, prazdna);
      ok(`právní text ${klic}/${jazyk}: titulek, úvod a sekce`, d.titulek.length > 3 && d.uvod.length > 40 && d.sekce.length >= 3);
      const cele = JSON.stringify(d);
      ok(`právní text ${klic}/${jazyk}: bez firmy nese zástupná pole, ne vymyšlená jména`, !/s\.r\.o\.|a\.s\.|GmbH|Ltd/.test(cele));
    }
  }
  const soukromi = JSON.stringify(dokument('soukromi', 'cs', vyplnena));
  ok('soukromí: zná správce a kontakt z konfigurace', soukromi.includes('Příklad s.r.o.') && soukromi.includes('12345678') && soukromi.includes('podpora@priklad.cz'));
  ok('soukromí: jmenuje zpracovatele z kódu (Neon, Vercel, Resend, Apple, Google, Stripe)', ['Neon', 'Vercel', 'Resend', 'Apple', 'Google', 'Stripe'].every(x => soukromi.includes(x)));
  ok('soukromí: říká, že poloha se neukládá a že se nesleduje', /Souřadnice se neukládají/.test(soukromi) && /Nepoužíváme reklamní ani sledovací/.test(soukromi));
  const smaz = JSON.stringify(dokument('smazat-ucet', 'cs', vyplnena));
  ok('smazání účtu: říká, co zmizí a co zůstane anonymně', /Smazaný uživatel/.test(smaz) && /Zrušíme|zruší/.test(smaz) && /potvrd/i.test(smaz));
  ok('podmínky: zakazují nevhodný obsah a popisují nahlášení a blokaci', /Nahlásit/.test(JSON.stringify(dokument('podminky', 'cs', vyplnena))) && /Report/.test(JSON.stringify(dokument('podminky', 'en', vyplnena))));
}
