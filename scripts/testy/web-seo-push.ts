// SEO základ (lib/web.ts) a dostupnost push notifikací (lib/pushKlient.ts).
//
// robots.ts a sitemap.ts jsou tenké obaly nad konstantami z lib/web.ts, takže
// se testují ty konstanty: veřejná trasa nesmí spadnout pod zakázanou
// předponu (sitemap by pak lhala robots.txt) a texty musí mít rozumnou délku.

import type { Testy } from './_testy.ts';
import { SITE_URL, SITE_TITULEK, SITE_POPIS, VEREJNE_TRASY, SOUKROME_PREDPONY } from '../../lib/web.ts';
import { stavPush } from '../../lib/pushKlient.ts';

export default function ({ eq, ok }: Testy) {
  ok('seo: adresa webu je https bez lomítka na konci', /^https:\/\/[^/]+$/.test(SITE_URL));
  eq('seo: produkční doména', SITE_URL, 'https://www.managero.app');
  ok('seo: titulek se vejde do výsledku hledání (≤ 70 znaků)', SITE_TITULEK.length <= 70);
  ok('seo: popis se vejde do výsledku hledání (≤ 160 znaků)', SITE_POPIS.length <= 160);
  ok('seo: titulek a popis jsou česky (diakritika)', /[ěščřžýáíé]/i.test(SITE_TITULEK) && /[ěščřžýáíé]/i.test(SITE_POPIS));

  const zakazane = (trasa: string) => SOUKROME_PREDPONY.some(p => trasa === p || trasa.startsWith(p.endsWith('/') ? p : p + '/') || trasa === p.replace(/\/$/, ''));
  eq('seo: žádná veřejná trasa není zakázaná v robots.txt', VEREJNE_TRASY.filter(zakazane), []);
  for (const trasa of ['/employer', '/employee', '/kiosk', '/demo', '/admin', '/api/schedule']) {
    ok(`seo: ${trasa} je pro roboty zakázané`, zakazane(trasa));
  }
  ok('seo: úvodní stránka je v sitemap', (VEREJNE_TRASY as readonly string[]).includes('/'));

  // Push: přepínač se nabízí jen tam, kde by opravdu fungoval.
  eq('push: bez VAPID klíčů se nenabízí', stavPush(false, true), 'nenakonfigurovano');
  eq('push: bez klíčů rozhoduje klíč, ne prohlížeč', stavPush(false, false), 'nenakonfigurovano');
  eq('push: klíče + podporující prohlížeč = nabídnout', stavPush(true, true), 'ok');
  eq('push: klíče, ale prohlížeč push neumí', stavPush(true, false), 'nepodporovano');
}
