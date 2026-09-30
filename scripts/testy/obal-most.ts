// Nativní obal: čisté části mostu (lib/nativni/most.ts) a konfigurace apps/.
//
// Co se hlídá: značka v User-Agentu, převod odkazů a QR na cesty (cizí host ani cizí
// schéma se neotevře), kód karty hosta, a že apps/apps.json drží dohodnutá ID
// (app.managero.app, app.managero.client) a doménu www, na které stojí universal links.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { cestaZOdkazu, cestaZQr, jeKioskCesta, kodKarty, zjistiObalUa } from '../../lib/nativni/most.ts';

export default function ({ eq, ok }: Testy) {
  // ---- značka v User-Agentu ----
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  eq('bez značky není obal', zjistiObalUa(safari), { obal: null, verze: null, build: null });
  eq('ManageroApp = provoz, s buildem', zjistiObalUa(`${safari} ManageroApp/1.2.0 (build 7)`), { obal: 'managero', verze: '1.2.0', build: 7 });
  eq('ManageroClient = hosté', zjistiObalUa(`${safari} ManageroClient/1.0.0 (build 1)`), { obal: 'client', verze: '1.0.0', build: 1 });
  eq('značka bez buildu', zjistiObalUa('x ManageroClient/2.0'), { obal: 'client', verze: '2.0', build: null });
  eq('prázdný UA', zjistiObalUa(null), { obal: null, verze: null, build: null });
  eq('obě značky v UA: platí přísnější (host), stejně jako na serveru', zjistiObalUa(`${safari} ManageroApp/1.0.0 ManageroClient/1.0.0`).obal, 'client');

  // ---- universal links a App Links ----
  eq('odkaz na podnik', cestaZOdkazu('https://www.managero.app/client/kavarna-u-lipy?tab=order&table=3&t=abc'), '/client/kavarna-u-lipy?tab=order&table=3&t=abc');
  eq('apex se čte taky', cestaZOdkazu('https://managero.app/employee/closing'), '/employee/closing');
  eq('cizí host se ignoruje', cestaZOdkazu('https://evil.example/client/x'), null);
  eq('http (bez TLS) se ignoruje', cestaZOdkazu('http://www.managero.app/client'), null);
  eq('host podobný našemu se ignoruje', cestaZOdkazu('https://www.managero.app.evil.example/client'), null);
  eq('vlastní schéma klienta', cestaZOdkazu('manageroclient://client/kavarna-u-lipy'), '/client/kavarna-u-lipy');
  eq('vlastní schéma provozu', cestaZOdkazu('managero://employer/overview?x=1'), '/employer/overview?x=1');
  eq('cizí schéma', cestaZOdkazu('javascript:alert(1)'), null);
  eq('nesmysl', cestaZOdkazu('není url'), null);
  eq('prázdné', cestaZOdkazu(''), null);

  // ---- QR podniku a stolu ----
  eq('QR stolu z tisku', cestaZQr('https://www.managero.app/client/kavarna-u-lipy?tab=order&table=3&t=tok'), '/client/kavarna-u-lipy?tab=order&table=3&t=tok');
  eq('QR domovské stránky hostů', cestaZQr('https://www.managero.app/client'), '/client');
  eq('holý kód podniku', cestaZQr('  Kavarna-U-Lipy '), '/client/kavarna-u-lipy');
  eq('QR na provozní trasu se v hostovské aplikaci neotevře', cestaZQr('https://www.managero.app/employer/overview'), null);
  eq('cizí web v QR', cestaZQr('https://example.com/client/x'), null);
  eq('kód s lomítkem není slug', cestaZQr('../etc'), null);
  eq('příliš krátký kód', cestaZQr('a'), null);
  eq('prázdný QR', cestaZQr(''), null);

  // ---- karta hosta ----
  eq('kód karty z QR', kodKarty('abcd-1234'), 'ABCD1234');
  eq('URL není kód karty', kodKarty('https://www.managero.app/client'), null);
  eq('krátký kód', kodKarty('ABC123'), null);

  // ---- kiosk nedostává push ani zámek ----
  ok('/kiosk je kiosk', jeKioskCesta('/kiosk'));
  ok('/kiosk/sklad je kiosk', jeKioskCesta('/kiosk/sklad'));
  ok('/kioskova-stranka není kiosk', !jeKioskCesta('/kioskova-stranka'));
  ok('/employer není kiosk', !jeKioskCesta('/employer/overview'));

  // ---- apps/apps.json: dohodnutá ID, doména a disjunktní cesty odkazů ----
  const a = JSON.parse(readFileSync(new URL('../../apps/apps.json', import.meta.url), 'utf8'));
  eq('bundle ID provozu', a.apps.managero.bundleId, 'app.managero.app');
  eq('bundle ID hostů', a.apps.client.bundleId, 'app.managero.client');
  eq('Android ID = iOS bundle ID (provoz)', a.apps.managero.applicationId, a.apps.managero.bundleId);
  eq('Android ID = iOS bundle ID (hosté)', a.apps.client.applicationId, a.apps.client.bundleId);
  eq('doména je www (apex jen přesměrovává)', a.domena, 'www.managero.app');
  eq('vstup provozu', a.apps.managero.vstupniUrl, 'https://www.managero.app/employer/overview');
  eq('vstup hostů', a.apps.client.vstupniUrl, 'https://www.managero.app/client');
  eq('UA tokeny', [a.apps.managero.uaToken, a.apps.client.uaToken], ['ManageroApp', 'ManageroClient']);
  const cestyProvozu: string[] = a.apps.managero.linkCesty;
  const cestyHostu: string[] = a.apps.client.linkCesty;
  ok('cesty odkazů obou aplikací se nepřekrývají', !cestyProvozu.some(c => cestyHostu.some(d => c.startsWith(d) || d.startsWith(c))));
  eq('targetSdk 36', a.android.targetSdk, 36);
}
