// Správa platformy na vlastním hostu (admin.managero.app): TOTP, cookie relace správy
// a rozhodnutí middleware podle hostu.
//
// Co se hlídá: kódy z autentizační aplikace sedí s RFC 6238 (SHA-1) a okno je ±1 krok;
// cookie relace má podpis, účel a platnost (12 h, krok 5 min) a nejde přenést mezi účely;
// na www je /admin 404 a admin API jen s Bearer tokenem; na hostu správy jsou jen
// stránky správy, její API a soubory Next, všechno ostatní 404.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { hotp, totp, overTotp, base32, zBase32, otpauthUri, klicProOpis, novyKlic, krokZCasu } from '../../lib/totp.ts';
import { vydej, over, setCookie, cookieZHlavicky, tajemstviSpravy, COOKIE_RELACE, COOKIE_KROK, PLATNOST_RELACE_S } from '../../lib/spravaRelace.ts';
import { rozhodniHost, jeAdminHost, adminHost, odkazSpravy, cistyHost, hostPozadavku } from '../../lib/spravaHost.ts';

export default function ({ eq, ok }: Testy) {
  // ---- TOTP: RFC 6238, příloha B (SHA-1, klíč „12345678901234567890", 8 číslic) ----
  const rfc = Buffer.from('12345678901234567890', 'ascii');
  const vektory: [number, string][] = [
    [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
    [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130'],
  ];
  for (const [t, kod] of vektory) eq(`totp: RFC 6238 T=${t}`, totp(rfc, t * 1000, 8), kod);
  // RFC 4226, příloha D (HOTP, 6 číslic).
  eq('hotp: RFC 4226 čítače 0–4', [0, 1, 2, 3, 4].map(c => hotp(rfc, c)), ['755224', '287082', '359152', '969429', '338314']);
  // Base32 tam a zpět; klíč RFC v Base32 je známý řetězec.
  eq('base32: klíč RFC', base32(rfc), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  eq('base32: zpět, i malými a s mezerami', zBase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')?.toString('ascii'), '12345678901234567890');
  eq('base32: cizí znak = null', zBase32('ABC1'), null);
  const klic = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const ted = 1_700_000_000_000;
  const krok = krokZCasu(ted);
  const kodTed = hotp(rfc, krok);
  eq('totp: aktuální kód vrátí svůj krok', overTotp(klic, kodTed, ted), krok);
  eq('totp: kód o krok starší projde (okno −1)', overTotp(klic, hotp(rfc, krok - 1), ted), krok - 1);
  eq('totp: kód o krok novější projde (okno +1)', overTotp(klic, hotp(rfc, krok + 1), ted), krok + 1);
  eq('totp: kód o dva kroky vedle neprojde', [overTotp(klic, hotp(rfc, krok - 2), ted), overTotp(klic, hotp(rfc, krok + 2), ted)], [null, null]);
  eq('totp: mezery v kódu nevadí', overTotp(klic, `${kodTed.slice(0, 3)} ${kodTed.slice(3)}`, ted), krok);
  eq('totp: nesmysl, krátký kód, prázdno = null', [overTotp(klic, 'abcdef', ted), overTotp(klic, '12345', ted), overTotp(klic, '', ted), overTotp(klic, null, ted)], [null, null, null, null]);
  eq('totp: rozbitý klíč = null', overTotp('!!!', kodTed, ted), null);
  ok('totp: nový klíč má 160 bitů (32 znaků Base32) a pokaždé jiný', novyKlic().length === 32 && novyKlic() !== novyKlic());
  const uri = otpauthUri({ klic, ucet: 'martin@managero.app' });
  ok('totp: otpauth URI s vydavatelem „Managero správa"', uri.startsWith('otpauth://totp/Managero%20spr%C3%A1va:martin%40managero.app?') && uri.includes(`secret=${klic}`) && uri.includes('issuer=Managero%20spr%C3%A1va') && uri.includes('digits=6') && uri.includes('period=30'));
  eq('totp: klíč k opisu po čtveřicích', klicProOpis('ABCDEFGHIJ'), 'ABCD EFGH IJ');
  // Zákaz opakování je v databázi (UPDATE … last_step < krok); tady aspoň, že ho route opravdu volá.
  ok('totp: kód se zapisuje jako použitý, než vznikne relace', /pouzijKrok\(userId, krok\)/.test(readFileSync('app/api/sprava/kod/route.ts', 'utf8'))
    && /last_step IS NULL OR last_step < \$\{krok\}/.test(readFileSync('lib/spravaDb.ts', 'utf8')));

  // ---- Cookie relace správy ----
  const T = 'tajemstvi-pro-testy-0123456789abcdef';
  const nyni = 1_800_000_000_000;
  const rel = vydej('relace', 15, T, nyni);
  eq('relace: platná vrátí id účtu', over('relace', rel, T, nyni + 1000), 15);
  eq('relace: platí 12 h, pak ne', [over('relace', rel, T, nyni + PLATNOST_RELACE_S * 1000), over('relace', rel, T, nyni + PLATNOST_RELACE_S * 1000 + 1000)], [15, null]);
  eq('relace: jiné tajemství = null', over('relace', rel, 'jine-tajemstvi-0123456789abcdef', nyni), null);
  eq('relace: cookie „krok" neprojde jako relace (a naopak)', [over('relace', vydej('krok', 15, T, nyni), T, nyni), over('krok', rel, T, nyni)], [null, null]);
  eq('krok: platí 5 minut', [over('krok', vydej('krok', 15, T, nyni), T, nyni + 300_000), over('krok', vydej('krok', 15, T, nyni), T, nyni + 301_000)], [15, null]);
  const [, , vydano, sig] = rel.split('.');
  eq('relace: přepsané id účtu neprojde', over('relace', `v1.16.${vydano}.${sig}`, T, nyni), null);
  eq('relace: posunuté vydání (prodloužení) neprojde', over('relace', `v1.15.${Number(vydano) + 3600}.${sig}`, T, nyni + 3_600_000), null);
  eq('relace: z budoucnosti neprojde', over('relace', vydej('relace', 15, T, nyni + 3_600_000), T, nyni), null);
  eq('relace: bez tajemství, prázdná, smetí = null', [over('relace', rel, null, nyni), over('relace', '', T, nyni), over('relace', 'v1.15.x.y', T, nyni)], [null, null, null]);
  eq('tajemství: APP_SECRET_KEY má přednost, krátké/žádné = null', [tajemstviSpravy({ APP_SECRET_KEY: 'a'.repeat(32), NEXTAUTH_SECRET: 'b'.repeat(32) }), tajemstviSpravy({ NEXTAUTH_SECRET: 'kratke' }), tajemstviSpravy({})], ['a'.repeat(32), null, null]);
  const sc = setCookie(COOKIE_RELACE, rel, PLATNOST_RELACE_S);
  ok('cookie: __Host- prefix, Secure, HttpOnly, SameSite=Strict, Path=/, bez Domain, 12 h',
    sc.startsWith('__Host-mgr-sprava=') && /; Secure/.test(sc) && /; HttpOnly/.test(sc) && /; SameSite=Strict/.test(sc) && /; Path=\//.test(sc) && !/Domain=/i.test(sc) && /Max-Age=43200/.test(sc));
  ok('cookie: smazání = Max-Age=0', /Max-Age=0/.test(setCookie(COOKIE_KROK, null, 0)));
  eq('cookie: čtení z hlavičky', [cookieZHlavicky(`a=1; ${COOKIE_RELACE}=${rel}; b=2`, COOKIE_RELACE), cookieZHlavicky('a=1', COOKIE_RELACE), cookieZHlavicky(null, COOKIE_RELACE)], [rel, null, null]);

  // ---- Host: kde správa je a kde není ----
  const A = 'admin.managero.app';
  const r = (host: string, pathname: string, authorization?: string) => rozhodniHost({ host, pathname, authorization, nastaveny: A });
  eq('host: výchozí admin.managero.app, přepsatelný bez portu', [adminHost(undefined), adminHost('Admin.Example.cz:8443')], [A, 'admin.example.cz']);
  ok('host: admin host i s portem a velkými písmeny; admin.localhost vždy; www ne', jeAdminHost('ADMIN.managero.app:443', A) && jeAdminHost('admin.localhost:3000', A) && !jeAdminHost('www.managero.app', A) && !jeAdminHost('admin.managero.app.evil.cz', A) && !jeAdminHost(null, A));
  eq('host: za proxy první hodnota', cistyHost('admin.managero.app, www.managero.app'), A);
  const hl = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
  eq('host: podvržená X-Forwarded-Host na www správu neotevře (a naopak)', [
    hostPozadavku(hl({ host: 'www.managero.app', 'x-forwarded-host': 'admin.localhost' })),
    hostPozadavku(hl({ host: 'admin.managero.app', 'x-forwarded-host': 'www.managero.app' })),
    hostPozadavku(hl({ host: 'admin.managero.app', 'x-forwarded-host': 'admin.managero.app' })),
    hostPozadavku(hl({ host: 'admin.localhost:3000' })),
  ], ['www.managero.app', 'www.managero.app', 'admin.managero.app', 'admin.localhost:3000']);
  eq('admin host: / → přehled', r(A, '/'), { akce: 'prepsat', cesta: '/admin' });
  eq('admin host: /teams/42 → detail podniku', r(A, '/teams/42'), { akce: 'prepsat', cesta: '/admin/teams/42' });
  eq('admin host: přihlášení, nahlášené, audit, retence', ['/prihlaseni', '/nahlaseni', '/audit', '/retence'].map(c => r(A, c)),
    ['/admin/prihlaseni', '/admin/nahlaseni', '/admin/audit', '/admin/retence'].map(cesta => ({ akce: 'prepsat', cesta })));
  eq('admin host: API správy a soubory Next projdou', [r(A, '/api/admin/teams'), r(A, '/api/sprava/kod'), r(A, '/_next/static/x.js'), r(A, '/icon.svg')].map(x => x.akce), ['pustit', 'pustit', 'pustit', 'pustit']);
  eq('admin host: robots.txt zakazuje všechno', r(A, '/robots.txt'), { akce: 'robots' });
  eq('admin host: aplikace, přihlášení aplikace, manifest, worker, /admin… = 404',
    ['/employer/overview', '/login', '/manifest.webmanifest', '/sw.js', '/admin', '/admin/teams/1', '/teams/abc', '/client', '/sitemap.xml'].map(c => r(A, c)),
    Array(9).fill({ akce: '404', api: false }));
  eq('admin host: cizí API (NextAuth, MCP, směny) = 404', ['/api/auth/session', '/api/mcp', '/api/schedule'].map(c => r(A, c)), Array(3).fill({ akce: '404', api: true }));
  for (const host of ['www.managero.app', 'pangea-git-x-martin.vercel.app', 'localhost:3000']) {
    eq(`${host}: /admin a podstránky = 404 (ne přesměrování)`, ['/admin', '/admin/teams/1', '/admin/prihlaseni'].map(c => r(host, c)), Array(3).fill({ akce: '404', api: false }));
    eq(`${host}: /api/admin bez tokenu = 404, s Bearer jde do brány`, [r(host, '/api/admin/teams'), r(host, '/api/admin/teams', 'Bearer xyz'), r(host, '/api/admin/teams', 'Basic xyz')],
      [{ akce: '404', api: true }, { akce: 'aplikace' }, { akce: '404', api: true }]);
    eq(`${host}: přihlášení správy tu není`, r(host, '/api/sprava/prihlaseni'), { akce: '404', api: true });
    eq(`${host}: aplikace beze změny (/, /employer, /api, /administrace)`, ['/', '/employer/overview', '/api/schedule', '/api/mcp', '/administrace'].map(c => r(host, c).akce), Array(5).fill('aplikace'));
  }
  eq('odkaz do správy: https na produkci, http na localhost', [odkazSpravy('/nahlaseni', A), odkazSpravy('nahlaseni', 'admin.localhost')], ['https://admin.managero.app/nahlaseni', 'http://admin.localhost/nahlaseni']);

  // ---- Zapojení ----
  const brana = readFileSync('lib/superadminGate.ts', 'utf8');
  ok('brána: relace aplikace (NextAuth) do správy nevede, Bearer token ano', !/getServerSession|next-auth/.test(brana) && /adminTokenOk\(/.test(brana) && /spravceZPozadavku\(/.test(brana));
  const mw = readFileSync('middleware.ts', 'utf8');
  ok('middleware: rozhoduje host před vším ostatním a na hostu správy běží na všechno', mw.indexOf('rozhodniHost(') < mw.indexOf('getToken(') && /type: 'host', value: 'admin\\\\\.\.\+'/.test(mw));
  ok('menu vedení: žádná položka „Správa platformy"', !/Správa platformy|'\/admin'/.test(readFileSync('components/employer/EmployerLayout.tsx', 'utf8')));
  ok('e-maily o nahlášení vedou na host správy', /odkazSpravy\('\/nahlaseni'\)/.test(readFileSync('lib/moderaceDb.ts', 'utf8')) && /odkazSpravy\('\/nahlaseni'\)/.test(readFileSync('lib/dsaDb.ts', 'utf8')));
  ok('přihlášení správy: heslo stejnou funkcí jako aplikace, limit pokusů, jen správce', (() => {
    const s = readFileSync('app/api/sprava/prihlaseni/route.ts', 'utf8');
    return /najdiUcetHeslem\(/.test(s) && /hit\(`sprava-login:/.test(s) && /jeSpravcePodleDb\(/.test(s) && !/bcrypt/.test(s);
  })());
}
