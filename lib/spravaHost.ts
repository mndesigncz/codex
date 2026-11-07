// Správa platformy žije na vlastní adrese (admin.managero.app), ne v aplikaci.
//
// Dřív byla na www.managero.app/admin a vstupovalo se do ní relací aplikace
// (NextAuth). Teď je to oddělený svět: vlastní host, vlastní přihlášení
// (heslo + kód z autentizační aplikace, lib/spravaRelace.ts) a vlastní cookie,
// která se kvůli prefixu `__Host-` nikdy nepošle na jiný host. Na www tak
// `/admin` neexistuje (404 jako každá jiná neznámá adresa) a admin API
// odtud projde jen s Bearer tokenem (Claude, MCP, skripty).
//
// Tenhle soubor je čisté rozhodnutí „co s požadavkem" — čte ho middleware
// na edge, takže nesmí importovat nic z Node. Testy: scripts/testy/sprava-host.ts.

/** Výchozí adresa správy. Pro vývoj a sondy se dá přepsat (`ADMIN_HOST=admin.localhost`). */
export const VYCHOZI_ADMIN_HOST = 'admin.managero.app';

/** Host správy bez portu, malými písmeny. */
export function adminHost(raw: string | undefined = process.env.ADMIN_HOST): string {
  return (String(raw ?? '').trim().toLowerCase().replace(/:\d+$/, '') || VYCHOZI_ADMIN_HOST);
}

/**
 * Host požadavku: za proxy `x-forwarded-host`, jinak `host`. Host správy ale jen
 * tehdy, když na něj ukazují OBĚ hlavičky — kdyby proxy nechala projít podvrženou
 * `X-Forwarded-Host: admin…` na www (nebo naopak), rozhodne ta, která správou není.
 */
export function hostPozadavku(h: { get(n: string): string | null }): string | null {
  const host = h.get('host');
  const preposlany = h.get('x-forwarded-host');
  if (host && preposlany && jeAdminHost(host) !== jeAdminHost(preposlany)) return jeAdminHost(host) ? preposlany : host;
  return preposlany ?? host;
}

/** Host z hlavičky (může nést port a za proxy víc hodnot oddělených čárkou). */
export function cistyHost(h: string | null | undefined): string {
  return String(h ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

/**
 * Je požadavek na hostu správy? Kromě nastaveného hostu platí vždy i
 * `admin.localhost` — prohlížeč ho posílá na vlastní počítač, takže se
 * správa dá vyzkoušet lokálně bez úprav /etc/hosts a nikdo zvenku ho nepošle
 * na produkci (tam by ho Vercel ani nepřijal jako doménu projektu).
 */
export function jeAdminHost(host: string | null | undefined, nastaveny: string = adminHost()): boolean {
  const h = cistyHost(host);
  if (!h) return false;
  return h === nastaveny || h === 'admin.localhost';
}

/** Veřejná adresa správy pro odkazy v e-mailech (nahlášený obsah apod.). */
export function odkazSpravy(cesta = '/', host: string = adminHost()): string {
  const schema = host.endsWith('.localhost') || host === 'localhost' ? 'http' : 'https';
  return `${schema}://${host}${cesta.startsWith('/') ? cesta : '/' + cesta}`;
}

// Stránky správy: adresa na hostu správy → stránka v app/admin. Jiné cesty
// na hostu správy nejsou (404). Detail podniku jen s číselným id.
const STRANKY: [RegExp, (m: string[]) => string][] = [
  [/^\/$/, () => '/admin'],
  [/^\/prihlaseni\/?$/, () => '/admin/prihlaseni'],
  [/^\/nahlaseni\/?$/, () => '/admin/nahlaseni'],
  [/^\/audit\/?$/, () => '/admin/audit'],
  [/^\/retence\/?$/, () => '/admin/retence'],
  [/^\/teams\/(\d{1,12})\/?$/, m => `/admin/teams/${m[1]}`],
];

/** API, které na hostu správy existuje: zásahy (requireSuperadmin) a přihlášení správy. */
const API_SPRAVY = ['/api/admin', '/api/sprava'];

const podCestou = (cesta: string, zaklad: string) => cesta === zaklad || cesta.startsWith(zaklad + '/');

export type RozhodnutiHostu =
  /** Není to věc správy — zbytek middleware (aplikace) rozhoduje dál. */
  | { akce: 'aplikace' }
  /** Host správy, pustit beze změny (soubory Next, API správy). */
  | { akce: 'pustit' }
  /** Host správy, stránka: interně přepsat na app/admin/… */
  | { akce: 'prepsat'; cesta: string }
  /** robots.txt správy: nic neindexovat. */
  | { akce: 'robots' }
  /** Neexistuje. `api` = odpovědět JSONem, jinak stránka 404. */
  | { akce: '404'; api: boolean };

/**
 * Co s požadavkem podle hostu a cesty.
 *
 * - Host správy: stránky správy (přepis na app/admin), `/api/admin`, `/api/sprava`,
 *   soubory Next a ikona; všechno ostatní 404 — žádný manifest, service worker,
 *   prodejní stránka ani přihlášení aplikace.
 * - Jiný host: `/admin…` je 404 (nic neprozrazovat, ani přesměrováním),
 *   `/api/sprava` taky; `/api/admin` jen s hlavičkou Bearer (token ověří
 *   requireSuperadmin) — relace aplikace tam už nestačí.
 */
export function rozhodniHost(v: { host: string | null | undefined; pathname: string; authorization?: string | null; nastaveny?: string }): RozhodnutiHostu {
  const cesta = v.pathname || '/';
  const jeApi = podCestou(cesta, '/api');
  if (jeAdminHost(v.host, v.nastaveny ?? adminHost())) {
    if (cesta.startsWith('/_next/')) return { akce: 'pustit' };
    if (cesta === '/icon.svg' || cesta === '/favicon.ico') return { akce: 'pustit' };
    if (cesta === '/robots.txt') return { akce: 'robots' };
    if (API_SPRAVY.some(a => podCestou(cesta, a))) return { akce: 'pustit' };
    if (jeApi) return { akce: '404', api: true };
    for (const [re, kam] of STRANKY) {
      const m = cesta.match(re);
      if (m) return { akce: 'prepsat', cesta: kam(m) };
    }
    return { akce: '404', api: false };
  }
  if (podCestou(cesta, '/admin')) return { akce: '404', api: false };
  if (podCestou(cesta, '/api/sprava')) return { akce: '404', api: true };
  if (podCestou(cesta, '/api/admin') && !/^Bearer\s+\S/.test(String(v.authorization ?? ''))) return { akce: '404', api: true };
  return { akce: 'aplikace' };
}
