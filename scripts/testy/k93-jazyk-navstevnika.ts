// Jazyk návštěvníka bez účtu (lib/i18n/config.ts, jazykNavstevnika): cookie →
// Accept-Language → země z IP → čeština. Kolo 93: dřív šla země před prohlížečem,
// takže Čech s českým prohlížečem z IP mimo ČR (cesty, VPN) dostal angličtinu.
import { jazykNavstevnika } from '../../lib/i18n/config.ts';
import type { Testy } from './_testy.ts';

export default function ({ eq }: Testy) {
  // 1) cookie (přepínač) vyhrává nad vším
  eq('cookie vyhrává nad prohlížečem i zemí', jazykNavstevnika({ cookie: 'de', acceptLanguage: 'cs-CZ,cs;q=0.9', zeme: 'CZ' }), 'de');
  eq('cookie s velkými písmeny / regionem', jazykNavstevnika({ cookie: 'PL', acceptLanguage: 'en', zeme: 'US' }), 'pl');
  eq('neplatná cookie se přeskočí', jazykNavstevnika({ cookie: 'fr', acceptLanguage: 'sk-SK', zeme: 'US' }), 'sk');

  // 2) prohlížeč před zemí
  eq('český prohlížeč z IP v USA → čeština (cestující, VPN)', jazykNavstevnika({ acceptLanguage: 'cs-CZ,cs;q=0.9,en;q=0.8', zeme: 'US' }), 'cs');
  eq('anglický prohlížeč v Česku → angličtina', jazykNavstevnika({ acceptLanguage: 'en-US,en;q=0.9', zeme: 'CZ' }), 'en');
  eq('rozhodují q-hodnoty, ne pořadí', jazykNavstevnika({ acceptLanguage: 'en;q=0.4,de-AT;q=0.9', zeme: 'CZ' }), 'de');
  eq('první podporovaný: fr přeskočen, pak pl', jazykNavstevnika({ acceptLanguage: 'fr-FR,pl;q=0.8,en;q=0.5', zeme: 'DE' }), 'pl');
  eq('slovenský prohlížeč', jazykNavstevnika({ acceptLanguage: 'sk', zeme: 'AT' }), 'sk');
  eq('zástupný znak * se nebere jako jazyk', jazykNavstevnika({ acceptLanguage: '*', zeme: 'PL' }), 'pl');

  // 3) země z IP jen když prohlížeč neřekne nic, čemu rozumíme
  eq('nepodporovaný prohlížeč (fr) v Německu → němčina podle země', jazykNavstevnika({ acceptLanguage: 'fr-FR,fr;q=0.9', zeme: 'DE' }), 'de');
  eq('bez hlavičky prohlížeče, IP z Polska → polština', jazykNavstevnika({ acceptLanguage: null, zeme: 'PL' }), 'pl');
  eq('nepodporovaný prohlížeč mimo naše země → angličtina', jazykNavstevnika({ acceptLanguage: 'ja', zeme: 'JP' }), 'en');

  // 4) nic → čeština
  eq('bez všeho (lokálně, build) → čeština', jazykNavstevnika({}), 'cs');
  eq('nepodporovaný prohlížeč bez země → čeština', jazykNavstevnika({ acceptLanguage: 'fr', zeme: null }), 'cs');
  eq('neznámá země (XX) → čeština', jazykNavstevnika({ acceptLanguage: '', zeme: 'XX' }), 'cs');

  // 5) vyhledávače a náhledy odkazů: česká podoba jediné adresy, ne jazyk podle IP robota
  const GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  eq('Googlebot z USA bez Accept-Language → čeština', jazykNavstevnika({ zeme: 'US', userAgent: GOOGLEBOT }), 'cs');
  eq('Googlebot s anglickým Accept-Language → čeština', jazykNavstevnika({ acceptLanguage: 'en-US', zeme: 'US', userAgent: GOOGLEBOT }), 'cs');
  eq('SeznamBot → čeština', jazykNavstevnika({ zeme: 'CZ', userAgent: 'Mozilla/5.0 (compatible; SeznamBot/4.0; +https://o-seznam.cz/napoveda/vyhledavani/en/seznambot-crawler/)' }), 'cs');
  eq('náhled na Facebooku z Irska → čeština', jazykNavstevnika({ zeme: 'IE', userAgent: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' }), 'cs');
  eq('Bingbot z USA → čeština', jazykNavstevnika({ acceptLanguage: 'en-US', zeme: 'US', userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)' }), 'cs');
  eq('cookie vyhrává i u robota', jazykNavstevnika({ cookie: 'de', zeme: 'US', userAgent: GOOGLEBOT }), 'de');
  eq('obyčejný Chrome z USA → angličtina (robot jen podle UA)', jazykNavstevnika({ zeme: 'US', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' }), 'en');
  eq('Safari na iPhonu v Německu → němčina', jazykNavstevnika({ acceptLanguage: 'de-DE', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }), 'de');
}
