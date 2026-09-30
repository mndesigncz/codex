// Kolo 74 — veřejná ukázka /demo: čistá pravidla a pojistky nad zdrojáky.
//
// Chování v prohlížeči (mock server, iframe, zprávy) hlídá sonda k74-demo;
// tady jsou věci, které jdou zkontrolovat bez prohlížeče: překlad scény na
// pohled aplikace, dny ukázky a hlavně bezpečnostní pojistky, které se při
// úpravě snadno rozbijí tiše (middleware, hlavičky rámování, mock nesmí
// pustit /api na síť).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { ID_SCEN, SCENY, jeRole, jeScena, nastaveniZAdresy, pohledScenyProRoli } from '../../lib/demo/sceny.ts';
import { jeCestaDema } from '../../lib/demo/cesta.ts';
import { dnyMesice, denVTydnu, mesic, posunDen } from '../../lib/demo/cas.ts';
import { PametovyCookies } from '../../lib/demo/prostredi.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Kód bez komentářů: komentáře popisují pravidla a pojistky by chytaly je. */
const kod = (cesta: string) => zdroj(cesta).split('\n').filter(r => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');

export default function ({ eq, ok }: Testy) {
  // ---- scény a role z adresy ----
  eq('scény: sedm hlavních příběhů', ID_SCEN, ['prehled', 'rozvrh', 'uzaverka', 'sklad', 'ukoly', 'tym', 'kiosk']);
  eq('adresa: bez parametrů je přehled vedení', nastaveniZAdresy(''), { scena: 'prehled', role: 'vedeni', okno: false });
  eq('adresa: uzávěrka začíná jako zaměstnanec (formulář patří obsluze)', nastaveniZAdresy('?scena=uzaverka'), { scena: 'uzaverka', role: 'zamestnanec', okno: false });
  eq('adresa: kiosk začíná jako tablet', nastaveniZAdresy('?scena=kiosk').role, 'kiosk');
  eq('adresa: ?role přepíše výchozí roli scény', nastaveniZAdresy('?scena=uzaverka&role=vedeni').role, 'vedeni');
  eq('adresa: ?rezim=okno', nastaveniZAdresy('?rezim=okno').okno, true);
  eq('adresa: neznámá scéna i role spadnou na přehled vedení', nastaveniZAdresy('?scena=__proto__&role=admin'), { scena: 'prehled', role: 'vedeni', okno: false });
  ok('scéna: prototypové názvy nejsou scéna', !jeScena('constructor') && !jeScena('toString') && !jeScena(undefined));
  ok('role: jen tři známé', jeRole('vedeni') && jeRole('zamestnanec') && jeRole('kiosk') && !jeRole('majitel'));

  // ---- překlad na pohledy, které aplikace zná z hlubokých odkazů ----
  eq('pohled: rozvrh vedení = shifts', pohledScenyProRoli('rozvrh', 'vedeni'), 'shifts');
  eq('pohled: rozvrh zaměstnance = my-shifts', pohledScenyProRoli('rozvrh', 'zamestnanec'), 'my-shifts');
  eq('pohled: uzávěrka zaměstnance = closing', pohledScenyProRoli('uzaverka', 'zamestnanec'), 'closing');
  eq('pohled: přehled nemá ?view (domů)', pohledScenyProRoli('prehled', 'vedeni'), null);
  eq('pohled: tým u zaměstnance nemá kam vést → domů', pohledScenyProRoli('tym', 'zamestnanec'), null);
  // Pohledy musí existovat v layoutech: překlep by ukázal přehled místo scény a nikdo by si nevšiml.
  // Od kola 76 jsou výchozí pohledy obou layoutů v lib/navigace.ts (sdílí je i skládání navigace).
  const vedeni = zdroj('components/employer/EmployerLayout.tsx') + zdroj('lib/navigace.ts');
  const zamest = zdroj('components/employee/EmployeeLayout.tsx') + zdroj('lib/navigace.ts');
  for (const id of ID_SCEN) {
    const p = SCENY[id].pohled as Record<string, string>;
    if (p.vedeni) ok(`pohled vedení „${p.vedeni}" (scéna ${id}) zná EmployerLayout`, vedeni.includes(`id: '${p.vedeni}'`) || p.vedeni === 'team-settings');
    if (p.zamestnanec) ok(`pohled zaměstnance „${p.zamestnanec}" (scéna ${id}) zná EmployeeLayout`, zamest.includes(`id: '${p.zamestnanec}'`));
  }

  // ---- cesta ukázky ----
  ok('cesta: /demo a pod ní', jeCestaDema('/demo') && jeCestaDema('/demo/x'));
  ok('cesta: /demonstrace a jiné trasy ne', !jeCestaDema('/demonstrace') && !jeCestaDema('/') && !jeCestaDema('/employer/overview') && !jeCestaDema(null));

  // ---- dny: nikdy pevné datum, přechod měsíce a roku ----
  eq('dny: posun přes konec měsíce', posunDen('2026-09-30', 1), '2026-10-01');
  eq('dny: posun přes konec roku zpět', posunDen('2027-01-01', -1), '2026-12-31');
  eq('dny: únor přestupného roku má 29 dnů', dnyMesice('2028-02').length, 29);
  eq('dny: měsíc z dne', mesic('2026-09-30'), '2026-09');
  eq('dny: středa 30. 9. 2026 (0 = neděle)', denVTydnu('2026-09-30'), 3);

  // ---- bezpečnost: veřejná trasa a rámování ----
  const mw = zdroj('middleware.ts');
  ok('middleware: matcher /demo nezná (trasa je veřejná a nesahá se na ni)', !/matcher:[^\]]*demo/.test(mw));
  const cfg = zdroj('next.config.js');
  ok('hlavičky: obecné pravidlo vylučuje /demo a má vlastní pravidlo pro /demo',
    /source: '\/\(\(\?!demo\(\?:\/\|\$\)\)\.\*\)'/.test(cfg) && /source: '\/demo\/:path\*'/.test(cfg));
  ok('hlavičky: ostatní trasy zůstávají DENY a frame-ancestors none', /ramovatSam \? 'SAMEORIGIN' : 'DENY'/.test(cfg) && cfg.includes(`"frame-ancestors 'none'"`));
  ok('hlavičky: ukázku smí rámovat jen vlastní původ', cfg.includes(`"frame-ancestors 'self'"`) && !/frame-ancestors \*/.test(cfg));
  ok('hlavičky: ukázka je mimo vyhledávače', cfg.includes("X-Robots-Tag") && cfg.includes('noindex, nofollow'));
  ok('hlavičky: prodejní stránka smí vložit ukázku (frame-src má self)', cfg.includes(`"frame-src 'self' https://js.stripe.com`));
  const layout = zdroj('app/demo/layout.tsx');
  ok('metadata: /demo je noindex, nofollow', /index: false/.test(layout) && /follow: false/.test(layout));

  // ---- izolace: mock nesmí pustit /api na skutečný server ----
  const mock = kod('lib/demo/mockApi.ts');
  ok('mock: cizí původ se odmítá', /origin !== window\.location\.origin[\s\S]{0,200}Promise\.reject/.test(mock));
  ok('mock: původní fetch se volá jen mimo /api/', /!url\.pathname\.startsWith\('\/api\/'\)\) return puvodniFetch/.test(mock));
  ok('mock: service worker se v ukázce nikdy nezaregistruje', /kontejner\.register = \(\) => Promise\.reject/.test(mock));
  ok('mock: instalace je idempotentní a vratná (vrací funkci pro návrat fetch, sendBeacon i service workeru)',
    /if \(odinstalovatApi\) return odinstalovatApi/.test(mock) && /window\.fetch = nativniFetch/.test(mock) && /delete \(navigator as any\)\.sendBeacon|navigator\.sendBeacon = puvodni/.test(mock));
  const prov = kod('app/providers.tsx');
  ok('provider: v ukázce se nemontuje service worker ani push', /\{!demo && <ServiceWorker \/>\}/.test(prov) && /\{!demo && <PushManager \/>\}/.test(prov));
  const root = kod('components/demo/DemoRoot.tsx');
  ok('kořen: MigrationOnLoad a PosTick se v ukázce nemontují', !/MigrationOnLoad|PosTick/.test(root));
  ok('kořen: příchozí zprávy se ověřují podle původu', /e\.origin !== window\.location\.origin/.test(kod('lib/demo/zpravy.ts')));
  ok('kořen: zprávy ven jdou jen na vlastní původ', /postMessage\(z, window\.location\.origin\)/.test(kod('lib/demo/zpravy.ts')));
  const env = kod('lib/demo/prostredi.ts');
  ok('prostředí: localStorage i sessionStorage jsou jen v paměti stránky', /jmeno of \['localStorage', 'sessionStorage'\]/.test(env));
  ok('prostředí: document.cookie je zastíněné paměťovým jarem (kiosk jinak píše skutečnou managero-kiosk-acting)',
    /Object\.defineProperty\(document, 'cookie'/.test(env) && !/document\.cookie/.test(mock + root + env));
  ok('prostředí: instalace je idempotentní a vratná', /if \(odinstalovat\) return odinstalovat/.test(env) && /delete \(document as any\)\.cookie/.test(env));
  ok('prostředí: beforeunload aplikace neblokuje reset ukázky (zachytávací posluchač)', /addEventListener\('beforeunload', posluchac, true\)/.test(env) && /stopImmediatePropagation/.test(env));
  ok('kořen: instalace nezávisí na adrese (initializer useState, efekt i rychlá cesta)',
    /useState\(\(\) => \{ if \(typeof window !== 'undefined'\) pripravDemo\(\)/.test(root) && /const vratit = pripravDemo\(\)/.test(root) && /prisloKlientskouNavigaci\(\)/.test(root));
  ok('kořen: klientská navigace vynutí plné načtení a při odchodu se vše vrátí', /window\.location\.reload\(\)/.test(root) && /vratit\(\);/.test(root));
  const zaklad = kod('lib/demo/routy/zaklad.ts');
  ok('odhlášení: /api/auth/signout vrací adresu ukázky (ne skutečné /login)', /\/api\/auth\/signout'\) return ok\(\{ url: adresaDema\(\) \}\)/.test(zaklad));
  ok('předplatné: v ukázce chybí oprávnění predplatne.zobrazit (záložka se nevykreslí)', /OPRAVNENI_MIMO_UKAZKU = new Set\(\['predplatne\.zobrazit'\]\)/.test(zaklad));

  // ---- cookie jar ukázky: chová se jako document.cookie ----
  const jar = new PametovyCookies();
  eq('cookie jar: prázdný', jar.get(), '');
  jar.set('managero-kiosk-acting=2; path=/; max-age=3600; samesite=lax');
  jar.set('a=b');
  eq('cookie jar: zápis s atributy uloží jen dvojici jméno=hodnota', jar.get(), 'managero-kiosk-acting=2; a=b');
  jar.set('managero-kiosk-acting=; path=/; max-age=0');
  eq('cookie jar: max-age=0 smaže (tak kiosk maže identitu)', jar.get(), 'a=b');
  jar.set('a=b; expires=Thu, 01 Jan 1970 00:00:00 GMT');
  eq('cookie jar: prošlé expires smaže', jar.get(), '');
  jar.set('bezRovnitka');
  eq('cookie jar: zápis bez = se ignoruje (jméno je prázdné)', jar.get(), '');
}
