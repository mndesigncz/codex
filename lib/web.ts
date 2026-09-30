// Veřejná adresa a základní texty webu — pro metadata, robots a sitemap.
//
// Produkční doména je www.managero.app. Bez metadataBase by Next skládal
// og:image a canonical z adresy, na které zrovna běží build (localhost,
// náhledy na Vercelu), a odkaz nasdílený na síť by ukazoval na nedostupný
// obrázek. `NEXT_PUBLIC_SITE_URL` jen přebíjí doménu (např. při přesunu).

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.managero.app').replace(/\/+$/, '');

export const SITE_NAZEV = 'Managero';
export const SITE_TITULEK = 'Managero — směny, sklad a uzávěrky pro kavárny, bary a restaurace';
export const SITE_POPIS =
  'Správa malého podniku v jedné aplikaci: rozvrh směn a docházka, uzávěrky, sklad a receptury, úkoly, chat i věrnostní program pro hosty. Zdarma do 3 lidí.';

/** Trasy, které mají mít vlastní záznam v sitemap.xml a smějí do vyhledávačů. */
export const VEREJNE_TRASY = ['/', '/register', '/client', '/soukromi', '/podminky', '/podpora', '/smazat-ucet'] as const;

/** Předpony, které vyhledávače nemají procházet (přihlášená část, tablet, správa, ukázka, API). */
export const SOUKROME_PREDPONY = [
  '/api/', '/employer', '/employee', '/kiosk', '/admin', '/demo', '/s/', '/join', '/login',
  '/pozastaveno', '/client/me', '/client/login', '/client/register',
  '/zapomenute-heslo', '/nove-heslo', '/client/zapomenute-heslo', '/client/nove-heslo',
] as const;

/**
 * Základ Open Graph. Stránka, která si dá vlastní `openGraph` (canonical/url),
 * NEDĚDÍ z layoutu — Next objekt nesloučí, nahradí ho — takže obrázek a typ
 * musí přijít znovu. Proto jedna sdílená hodnota, ne opis do každé stránky.
 */
export const OG_ZAKLAD = {
  type: 'website' as const,
  locale: 'cs_CZ',
  siteName: SITE_NAZEV,
  title: SITE_TITULEK,
  description: SITE_POPIS,
  // Karta 1200×630 ze skutečného snímku aplikace (scripts/landing-og.mjs); poměr 1,91:1 je to, co sítě ořezávají nejméně.
  images: [{ url: '/brand/landing/og.png', width: 1200, height: 630, alt: 'Aplikace Managero s přehledem dne: tržba, kdo je na směně, úkoly a docházející zásoby' }],
};
