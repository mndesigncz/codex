// Nativní obal (iOS / Android): poznání aplikace a brána tras. Čisté, bez databáze.
//
// Do obchodů jdou DVĚ aplikace nad jedním webem (server.url):
//   Managero        (app.managero.app)     — provoz: vedení, zaměstnanci, kiosk
//   Managero client (app.managero.client)  — hosté: podniky, rezervace, věrnost
// Rozhodnutí o bundle ID (sjednocuje plány, které se rozcházely): provozní
// aplikace je `app.managero.app` (ne `…provoz`), hostovská `app.managero.client`,
// produkční doména `https://www.managero.app` (apex managero.app jen přesměrovává,
// proto universal links / app links míří jen na www).
//
// Aplikaci pozná server podle značky, kterou obal přidá do User-Agentu
// (`ManageroApp/1.0.0 (build 12)` a `ManageroClient/1.0.0 (build 12)`).
//
// DŮLEŽITÉ — značka NENÍ bezpečnostní hranice. User-Agent si pošle kdokoli,
// takže značka smí práva jen ZUŽOVAT (schovat platby, zavřít cizí část webu),
// nikdy rozšiřovat. Skutečná autorizace zůstává v rolích a oprávněních; falešná
// značka tedy nic neodemkne, nejvýš si člověk sám zavře část aplikace.

export type Obal = 'managero' | 'client' | null;

export interface RozpoznanyObal {
  obal: Obal;
  verze: string | null;
  build: number | null;
}

const RE_PROVOZ = /ManageroApp\/([\d][\w.\-]*)(?:\s*\(build\s+(\d+)\))?/;
const RE_KLIENT = /ManageroClient\/([\d][\w.\-]*)(?:\s*\(build\s+(\d+)\))?/;

export function obalZUserAgent(ua: string | null | undefined): RozpoznanyObal {
  const s = String(ua ?? '');
  // Kdyby byly v řetězci obě značky (cizí zásah), platí ta přísnější: host je
  // zúžený víc než provoz, takže falešné „obě“ nikomu nic nepřidá.
  const klient = RE_KLIENT.exec(s);
  const provoz = RE_PROVOZ.exec(s);
  const m = klient ?? provoz;
  if (!m) return { obal: null, verze: null, build: null };
  return { obal: klient ? 'client' : 'managero', verze: m[1], build: m[2] ? Number(m[2]) : null };
}

/** Zkratka pro routy a server komponenty: v jakém obalu běží požadavek. */
export function obalZHlavicek(h: { get(name: string): string | null }): Obal {
  return obalZUserAgent(h.get('user-agent')).obal;
}

/** Nabídka a nákup předplatného v obalu nikdy (Apple 3.1.1, Google Play Billing). */
export function smiPlatby(obal: Obal): boolean {
  return obal === null;
}

// ---- Brána tras -----------------------------------------------------------------

export type RozhodnutiObalu =
  | { akce: 'pustit' }
  | { akce: 'api'; status: 403 | 404; zprava: string }
  | { akce: 'presmerovat'; kam: string };

export const ZPRAVA_PLATBY_V_OBALU = 'Předplatné se v aplikaci nespravuje.';

/** Veřejné právní a podpůrné stránky — musí jít otevřít z obou aplikací bez přihlášení. */
export const PRAVNI_STRANKY = ['/soukromi', '/podminky', '/podpora', '/smazat-ucet'];

export function jePravniStranka(cesta: string): boolean {
  const c = cesta.replace(/^\/en(?=\/|$)/, '') || '/';
  // `/smazat-ucet/potvrdit` je cíl odkazu z e-mailu (potvrzení smazání účtu z webu).
  return PRAVNI_STRANKY.some(p => c === p || c === p + '/') || c.startsWith('/smazat-ucet/');
}

const jeTrasa = (cesta: string, zaklad: string) => cesta === zaklad || cesta.startsWith(zaklad + '/');

/** Stránky hosta, které provozní aplikace nepustí (host tam nemá co dělat). */
export function jeHostovskaStranka(cesta: string): boolean {
  return jeTrasa(cesta, '/client');
}

// API hosta, které provozní aplikace nepotřebuje. Správa (`admin`, `staff`),
// obrázky podniku (`img`) a serverové zpětné volání pokladny (`pos`) zůstávají.
const HOSTOVSKE_API = ['/api/client/b', '/api/client/me', '/api/client/card', '/api/client/register',
  '/api/client/businesses', '/api/client/orders', '/api/client/reservations', '/api/client/reviews', '/api/client/events'];

/** Část API, která patří provozu a hostovská aplikace na ni nesmí. */
const PROVOZNI_API_HOSTA = ['/api/client/admin', '/api/client/staff'];

// Co smí hostovská aplikace volat mimo /api/client. Seznam je úzký schválně:
// co tu není, hostovi nepatří.
const API_HOSTA_OBECNE = ['/api/auth', '/api/push', '/api/native', '/api/notifications', '/api/account'];

/**
 * Rozhodne, jestli aplikace s daným obalem smí na cestu.
 *
 * Vrací jen ZÚŽENÍ (přesměrování nebo odmítnutí). Bez obalu vždy „pustit“:
 * webový prohlížeč touhle bránou neprochází.
 */
export function rozhodniObal(vstup: { obal: Obal; pathname: string; method?: string }): RozhodnutiObalu {
  const { obal, pathname } = vstup;
  if (!obal) return { akce: 'pustit' };
  const jeApi = pathname === '/api' || pathname.startsWith('/api/');
  // Soubory a ověření domény: bez nich nejde ani načíst aplikaci, ani ověřit universal link.
  if (pathname.startsWith('/_next/') || pathname.startsWith('/.well-known/')) return { akce: 'pustit' };

  if (jeApi) {
    // Tvrdá pojistka plateb: i kdyby UI něco uniklo, server v obalu nic nenakoupí.
    // Webhook Stripe UA obalu nemá, proto ho tahle větev nezasáhne.
    if (/^\/api\/billing\/(checkout|portal|upgrade)(\/|$)/.test(pathname)) {
      return { akce: 'api', status: 403, zprava: ZPRAVA_PLATBY_V_OBALU };
    }
    if (obal === 'client') {
      if (PROVOZNI_API_HOSTA.some(p => jeTrasa(pathname, p))) return { akce: 'api', status: 404, zprava: 'Nenalezeno.' };
      if (jeTrasa(pathname, '/api/client')) return { akce: 'pustit' };
      if (API_HOSTA_OBECNE.some(p => jeTrasa(pathname, p))) return { akce: 'pustit' };
      // Nic jiného (sklad, směny, billing, mcp, seed…) nesdělujeme ani tím, že existuje.
      return { akce: 'api', status: 404, zprava: 'Nenalezeno.' };
    }
    // obal === 'managero'
    if (HOSTOVSKE_API.some(p => jeTrasa(pathname, p))) return { akce: 'api', status: 404, zprava: 'Nenalezeno.' };
    return { akce: 'pustit' };
  }

  if (jePravniStranka(pathname)) return { akce: 'pustit' };

  if (obal === 'client') {
    if (jeTrasa(pathname, '/client')) return { akce: 'pustit' };
    // Přihlášení provozu do hostovské aplikace nevede: rovnou na přihlášení hosta.
    if (pathname === '/login' || pathname === '/register' || pathname === '/join') return { akce: 'presmerovat', kam: '/client/login' };
    if (pathname === '/zapomenute-heslo') return { akce: 'presmerovat', kam: '/client/zapomenute-heslo' };
    return { akce: 'presmerovat', kam: '/client' };
  }

  // obal === 'managero': hostovské stránky ne (prodejní stránka `/` se řeší v app/page.tsx,
  // kde se bez přihlášení přesměruje na /login).
  if (jeHostovskaStranka(pathname)) return { akce: 'presmerovat', kam: '/' };
  return { akce: 'pustit' };
}

/** Role, která do dané aplikace patří: host do hostovské, všichni ostatní do provozní. */
export function rolePatriDoObalu(obal: Obal, role: string | null | undefined): boolean {
  if (!obal) return true;
  if (obal === 'client') return role === 'customer';
  return role !== 'customer';
}

export const HLASKA_ROLE_V_CLIENTU = 'Tenhle účet patří do aplikace Managero pro podniky.';
export const HLASKA_ROLE_V_PROVOZU = 'Tenhle účet je hosta. Používejte aplikaci Managero client.';
