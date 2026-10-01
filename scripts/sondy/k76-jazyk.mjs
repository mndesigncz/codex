// Kolo 76 — vícejazyčnost: přepnutí jazyka na hostovské stránce, na veřejném lístku a v aplikaci.
//
// Tvrdí (na telefonu 390 × 844 a na monitoru):
//  • lístek (/menu-akce.html): jazyk prohlížeče hosta → <html lang> i obal stránky,
//    `?lang=` v dotazu na API, pilulka s globusem jen u lístku s víc jazyky, klávesnice
//    (šipky, Escape, návrat fokusu), dotykový cíl 44 px, „vyprodáno“ v jazyce, legenda
//    a filtr alergenů, nepřetékání ve všech pěti jazycích, výpadek API = záloha s obalem
//    v jazyce hosta, omezený pohyb;
//  • hostovská stránka podniku: přepnutí přes pilulku (cookie, <html lang>, žádná česká
//    slova obalu v angličtině), automatický jazyk z prohlížeče, německé texty bez přetečení;
//  • aplikace: přepnutí z listu „Více“ (PATCH /api/account s jazykem, německé popisky docku
//    se vejdou), karta Jazyk v Nastavení → Jazyk a region i v tmavém režimu.
//
// Čas dne se neuplatní: lístek i stránka podniku dostávají pevné fixtury a nic tu nezávisí
// na hodinách (připomínky postupů předem označuje `kontext` v k68-spolecne).
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { buildBoard, publicShape } from '../../lib/menu.ts';
import { kontext, tvrdi, konec, fixtura, OUT } from './k68-spolecne.mjs';

const BASE = process.env.SONDY_BASE ?? 'http://localhost:3000';
const TEL = { width: 390, height: 844 };
const JAZYKY = [['cs', 'Čeština'], ['en', 'English'], ['de', 'Deutsch'], ['sk', 'Slovenčina'], ['pl', 'Polski']];

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

// ---- fixtura lístku: stejný kód jako na serveru (lib/menu.ts), žádný vlastní překlad v sondě ----
const radkyDesky = (extra = {}) => ({
  id: 1, slug: 'cafe', name: 'Café', eyebrow: 'Venkovní akce', title: 'Speciální nabídka', note: '*Alergeny a složení na vyžádání u obsluhy',
  wifi_ssid: null, wifi_password: null, currency: 'Kč', enabled: true, theme: null,
  langs: { vychozi: 'cs', nabizet: ['cs', 'en', 'de', 'sk', 'pl'] },
  i18n: { en: { title: 'Special offer', eyebrow: 'Outdoor event' }, de: { title: 'Sonderangebot', eyebrow: 'Außer Haus' }, pl: { title: 'Oferta specjalna' } },
  ...extra,
});
const sekce = [
  { id: 10, title: 'Nápoje', column_no: 1, position: 0, i18n: { en: { title: 'Drinks' }, de: { title: 'Getränke' } } },
  { id: 11, title: 'Jídlo', column_no: 2, position: 1, i18n: null },
];
const polozky = [
  { id: 100, section_id: 10, name: 'Ledový Tuareg', price: 69, description: 'Osvěžující čaj s ledem', sold_out: false, position: 0, allergens: [7, 1], tags: ['vegan'],
    i18n: { en: { name: 'Iced Tuareg', description: 'Refreshing iced tea' }, de: { name: 'Eistee Tuareg', description: 'Erfrischender Eistee' } } },
  { id: 101, section_id: 10, name: 'Gin tonic', price: 119, description: null, sold_out: true, position: 1, allergens: [], tags: [], i18n: { en: { name: 'Gin and tonic' } } },
  { id: 102, section_id: 11, name: 'Masová bagetka s trhaným masem', price: 79, description: 'Od každého trošku', sold_out: false, position: 0, allergens: [1, 3, 10], tags: [], i18n: { de: { name: 'Baguette mit Pulled Pork' } } },
];
const odpovedLístku = (url, extra = {}) => {
  const lang = new URL(url).searchParams.get('lang');
  return publicShape(buildBoard(radkyDesky(extra), sekce, polozky), lang, { locale: 'cs-CZ' });
};

async function lístek({ locale, viewport = TEL, extra = {}, vypadek = false, reduced = false }) {
  const ctx = await b.newContext({ viewport, locale, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const dotazy = [];
  await ctx.route('**/api/menu/public/**', route => {
    const u = route.request().url();
    dotazy.push(u);
    if (vypadek) return route.abort('internetdisconnected');
    if (/\/qr(\?|$)/.test(u) || /\/soldout/.test(u)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(odpovedLístku(u, extra)) });
  });
  await ctx.route('**/_vercel/**', r => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', e => chyby.push(String(e)));
  await p.goto(BASE + '/menu-akce.html?menu=cafe', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  return { ctx, p, dotazy, chyby };
}
const preteka = (p) => p.evaluate(() => ({ doc: document.documentElement.scrollWidth, okno: window.innerWidth }));

// ============================================================ lístek: německý host (locale de-DE)
{
  const { ctx, p, dotazy, chyby } = await lístek({ locale: 'de-DE' });
  tvrdi('lístek: jazyk prohlížeče (de) → <html lang="de">', await p.evaluate(() => document.documentElement.lang) === 'de');
  tvrdi('lístek: dotaz na API nese ?lang=de', dotazy.some(u => /\/api\/menu\/public\/cafe\?lang=de/.test(u)), dotazy.join(' '));
  tvrdi('lístek: nadpis a položky v němčině (překlad ze serveru)', (await p.locator('#title').innerText()) === 'Sonderangebot' && (await p.locator('#cols').innerText()).includes('Eistee Tuareg'));
  tvrdi('lístek: sekce bez překladu zůstane ve výchozím jazyce (Jídlo)', (await p.locator('#cols').innerText()).includes('Jídlo'));
  tvrdi('lístek: chybí-li překlad popisu, stojí výchozí text', (await p.locator('#cols').innerText()).includes('Od každého trošku'));
  tvrdi('lístek: cena podle locale podniku (69 Kč)', /69\s*Kč/.test((await p.locator('.price').first().innerText()).replace(/ /g, ' ')));
  const pilulka = p.locator('#jazyk');
  tvrdi('lístek: pilulka jazyka je vidět (lístek nabízí pět jazyků) a nese DE', await pilulka.isVisible() && (await p.locator('#jazyk-kod').innerText()) === 'DE');
  tvrdi('lístek: pilulka má přístupný název „Sprache: Deutsch“', (await p.locator('#jazyk-btn').getAttribute('aria-label')) === 'Sprache: Deutsch');
  // dotykový cíl 44 px: klepnutí 14 px pod středem (mimo 32px tvar, uvnitř ::before) musí otevřít nabídku
  const r = await p.locator('#jazyk-btn').boundingBox();
  tvrdi('lístek: tvar pilulky je malý (≤ 34 px), cíl větší', r.height <= 34);
  await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2 + 14);
  tvrdi('lístek: klepnutí kousek pod pilulkou ji otevře (cíl 44 px)', await p.locator('#jazyk-menu').isVisible());
  const poloz = await p.locator('#jazyk-menu button').evaluateAll(els => els.map(e => ({ t: e.textContent.trim(), h: e.getBoundingClientRect().height, lang: e.lang, sel: e.getAttribute('aria-checked') })));
  tvrdi('lístek: v nabídce pět endonymů a vybraná němčina', poloz.length === 5 && poloz.map(x => x.t).join() === JAZYKY.map(j => j[1]).join() && poloz.find(x => x.t === 'Deutsch').sel === 'true', JSON.stringify(poloz));
  tvrdi('lístek: položky nabídky mají ≥ 44 px', poloz.every(x => x.h >= 44), JSON.stringify(poloz.map(x => x.h)));
  tvrdi('lístek: fokus je na vybrané položce', await p.evaluate(() => document.activeElement?.textContent.trim()) === 'Deutsch');
  await p.keyboard.press('ArrowDown');
  tvrdi('lístek: šipka dolů posune fokus (Slovenčina)', await p.evaluate(() => document.activeElement?.textContent.trim()) === 'Slovenčina');
  await p.keyboard.press('Escape');
  tvrdi('lístek: Escape zavře nabídku a vrátí fokus na pilulku', !(await p.locator('#jazyk-menu').isVisible()) && await p.evaluate(() => document.activeElement?.id) === 'jazyk-btn');

  // alergeny: legenda v němčině, věta o alergenech formální, filtr na telefonu
  const legenda = await p.locator('#legenda').innerText();
  tvrdi('lístek: legenda alergenů v jazyce hosta (Milch, Glutenhaltiges Getreide)', legenda.includes('Milch') && legenda.includes('Glutenhaltiges Getreide'), legenda);
  tvrdi('lístek: u položky jsou čísla alergenů, u položky bez nich nic', (await p.locator('li[data-key="0-0"] .alg').innerText()).includes('1, 7') && await p.locator('li[data-key="0-1"] .alg').count() === 0);
  tvrdi('lístek: legenda hlásí, že u některých položek alergeny chybí (formální Sie)', /Sie/.test(legenda) && /nicht angegeben/.test(legenda), legenda);
  tvrdi('lístek: patička nese větu o alergenech (server, formální)', /Fragen Sie das Servicepersonal/.test(await p.locator('#note').innerText()));
  tvrdi('lístek: štítek Vegan', (await p.locator('.stitek').first().innerText()).toLowerCase() === 'vegan');
  tvrdi('lístek: filtr „bez alergenu“ je na telefonu vidět', await p.locator('#filtr').isVisible());
  await p.locator('#filtr summary').click();
  await p.locator('#filtr .filtr-chips button[data-k="7"]').click();
  tvrdi('lístek: filtr skryje položky s mlékem (Eistee), ostatní zůstanou', await p.locator('li[data-key="0-0"]').isHidden() && await p.locator('li[data-key="1-0"]').isVisible());
  tvrdi('lístek: vybraný alergen je stisknutý (aria-pressed)', (await p.locator('#filtr .filtr-chips button[data-k="7"]').getAttribute('aria-pressed')) === 'true');
  await p.locator('#filtr .filtr-zrusit').click();
  tvrdi('lístek: „Auswahl aufheben“ vrátí položky', await p.locator('li[data-key="0-0"]').isVisible());
  const tlacitka = await p.locator('#filtr button, #filtr summary').evaluateAll(els => els.filter(e => e.offsetParent).map(e => e.getBoundingClientRect().height));
  tvrdi('lístek: ovládání filtru má cíle ≥ 44 px', tlacitka.length > 0 && tlacitka.every(h => h >= 43.5), JSON.stringify(tlacitka));

  // přepnutí na angličtinu z nabídky: jazyk, adresa, uložená volba, „sold out“
  await p.locator('#jazyk-btn').click();
  await p.locator('#jazyk-menu button[data-j="en"]').click();
  await p.waitForTimeout(600);
  tvrdi('lístek: přepnutí na angličtinu změní <html lang> a nadpis', await p.evaluate(() => document.documentElement.lang) === 'en' && (await p.locator('#title').innerText()) === 'Special offer');
  tvrdi('lístek: volba se uloží (localStorage) a zapíše do adresy (?lang=en)', await p.evaluate(() => localStorage.getItem('managero-host-lang')) === 'en' && /[?&]lang=en/.test(p.url()));
  tvrdi('lístek: nový dotaz na API s ?lang=en', dotazy.some(u => /\?lang=en/.test(u)));
  const pseudo = await p.evaluate(() => getComputedStyle(document.querySelector('li[data-out="1"] .name'), '::after').content);
  tvrdi('lístek: štítek vyprodáno je v jazyce hosta („sold out“)', /sold out/.test(pseudo), pseudo);
  tvrdi('lístek: bez českých slov obalu v angličtině (legenda, patička)', !/Alergeny|vyprodáno|Menu do mobilu/.test(await p.evaluate(() => document.body.innerText)), '');
  // všech pět jazyků: nic nepřetéká
  for (const [kod, nazev] of JAZYKY) {
    await p.locator('#jazyk-btn').click();
    await p.locator(`#jazyk-menu button[data-j="${kod}"]`).click();
    await p.waitForTimeout(450);
    const pt = await preteka(p);
    tvrdi(`lístek: ${nazev} na 390 px bez vodorovného přetečení`, pt.doc <= pt.okno, JSON.stringify(pt));
    tvrdi(`lístek: ${nazev} má <html lang="${kod}">`, await p.evaluate(() => document.documentElement.lang) === kod);
    if (kod === 'de') await p.screenshot({ path: `${OUT}k76-menu-de-390.png`, fullPage: true });
    if (kod === 'pl') await p.screenshot({ path: `${OUT}k76-menu-pl-390.png`, fullPage: true });
  }
  tvrdi('lístek: stránka bez chyby ve skriptu', chyby.length === 0, chyby[0]);
  await ctx.close();
}

// ============================================================ lístek s jedním jazykem: žádná pilulka, obal česky
{
  const { ctx, p } = await lístek({ locale: 'en-US', extra: { langs: null, i18n: null } });
  tvrdi('lístek s jedním jazykem: pilulka se nekreslí', await p.locator('#jazyk').isHidden());
  tvrdi('lístek s jedním jazykem: anglický prohlížeč vidí celý český lístek (<html lang="cs">)', await p.evaluate(() => document.documentElement.lang) === 'cs' && (await p.locator('#title').innerText()) === 'Speciální nabídka');
  await ctx.close();
}

// ============================================================ výpadek API: záloha, obal v jazyce hosta
{
  const { ctx, p } = await lístek({ locale: 'pl-PL', vypadek: true });
  tvrdi('výpadek: záloha má obal v jazyce hosta (<html lang="pl">, poznámka polsky)', await p.evaluate(() => document.documentElement.lang) === 'pl' && (await p.locator('#note').innerText()).includes('Alergeny i skład na życzenie u obsługi'), await p.locator('#note').innerText());
  tvrdi('výpadek: bez živých dat se pilulka nekreslí (nenabízí, co nejde)', await p.locator('#jazyk').isHidden());
  tvrdi('výpadek: položky zálohy zůstanou české', (await p.locator('#cols').innerText()).includes('Ledový Tuareg') || (await p.locator('#cols').innerText()).includes('Teplý čaj'));
  await ctx.close();
}

// ============================================================ omezený pohyb a monitor (iPad)
{
  const { ctx, p } = await lístek({ locale: 'cs-CZ', viewport: { width: 1024, height: 768 }, reduced: true });
  const dur = await p.locator('#jazyk').evaluate(el => getComputedStyle(el).transitionDuration);
  tvrdi('omezený pohyb: pilulka nepřechází (transition 0 s)', /^0s$/.test(dur), dur);
  const pozice = await p.evaluate(() => { const r = document.getElementById('jazyk').getBoundingClientRect(); const t = document.getElementById('tools').getBoundingClientRect(); return { jazykPrava: r.right, toolsLeva: t.left }; });
  tvrdi('iPad: pilulka sedí vlevo od ovládání obsluhy a nepřekrývá ho', pozice.jazykPrava <= pozice.toolsLeva + 1, JSON.stringify(pozice));
  await ctx.close();
}

// ============================================================ hostovská stránka podniku
async function host({ locale, cookies = [] }) {
  const ctx = await b.newContext({ viewport: TEL, locale, isMobile: true, hasTouch: true });
  if (cookies.length) await ctx.addCookies(cookies);
  const dotazy = [];
  await ctx.route('**/api/client/b/kavarna-u-lipy**', route => {
    dotazy.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(new URL('./fixtury/client_b_kavarna-u-lipy.json', import.meta.url), 'utf8') });
  });
  await ctx.route('**/api/client/**', route => (route.request().url().includes('/client/b/kavarna-u-lipy') ? route.fallback() : route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })));
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', e => chyby.push(String(e)));
  await p.goto(BASE + '/client/kavarna-u-lipy', { waitUntil: 'networkidle' });
  await p.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(700);
  return { ctx, p, dotazy, chyby };
}
// innerText vrací text po `text-transform` (nadpisy jsou VELKÝMI), proto se porovnává bez ohledu na velikost písmen.
const text = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').toLowerCase());

{
  const { ctx, p, dotazy, chyby } = await host({ locale: 'cs-CZ' });
  tvrdi('host: český prohlížeč = česká stránka (Otevírací doba, <html lang="cs">)', (await text(p)).includes('otevírací doba') && await p.evaluate(() => document.documentElement.lang) === 'cs');
  const pill = p.getByRole('button', { name: /^Jazyk: Čeština/ });
  tvrdi('host: pilulka jazyka je v hlavičce', await pill.isVisible());
  await pill.click();
  await p.getByRole('menuitemradio', { name: 'English' }).click();
  await p.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(900);
  const en = await text(p);
  tvrdi('host: po přepnutí na angličtinu je obal anglicky (Opening hours)', en.includes('opening hours'), en.slice(0, 200));
  tvrdi('host: bez českých slov obalu (Otevírací doba, Stát se členem, Nabídka)', !/otevírací doba|stát se členem|nabídka/.test(en));
  tvrdi('host: obsah podniku se nepřekládá sám (název zůstává)', en.includes('kavárna u lípy'));
  tvrdi('host: <html lang="en"> a cookie managero-lang=en', await p.evaluate(() => document.documentElement.lang) === 'en' && (await ctx.cookies()).some(c => c.name === 'managero-lang' && c.value === 'en'));
  tvrdi('host: stránka znovu načetla nabídku s ?lang=en', dotazy.some(u => /\?lang=en/.test(u)), dotazy.join(' '));
  for (const [kod, nazev, slovo] of [['de', 'Deutsch', 'Öffnungszeiten'], ['sk', 'Slovenčina', 'Otváracie hodiny'], ['pl', 'Polski', 'Godziny otwarcia']]) {
    await p.getByRole('button', { name: /^(Language|Sprache|Jazyk|Język):/ }).click();
    await p.getByRole('menuitemradio', { name: nazev }).click();
    await p.waitForFunction(k => document.documentElement.lang === k, kod, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(700);
    const t = await text(p);
    const pt = await preteka(p);
    tvrdi(`host: ${nazev}: přeloženo („${slovo}“)`, t.includes(slovo.toLowerCase()), t.slice(0, 160));
    tvrdi(`host: ${nazev} na 390 px bez vodorovného přetečení`, pt.doc <= pt.okno, JSON.stringify(pt));
    if (kod === 'de') await p.screenshot({ path: `${OUT}k76-host-de-390.png` });
  }
  tvrdi('host: stránka bez chyby ve skriptu', chyby.length === 0, chyby[0]);
  await ctx.close();
}
{
  // host z Německa bez cookie: jazyk prohlížeče
  const { ctx, p } = await host({ locale: 'de-DE' });
  tvrdi('host: německý prohlížeč = německá stránka bez klepnutí (Öffnungszeiten)', (await text(p)).includes('öffnungszeiten') && await p.evaluate(() => document.documentElement.lang) === 'de');
  await ctx.close();
}

// ============================================================ aplikace: list „Více“, přepnutí, Nastavení
{
  const { ctx, p, stav } = await kontext({ viewport: TEL, mobil: true });
  await p.goto(BASE + '/employer/overview', { waitUntil: 'networkidle' });
  await p.getByRole('navigation', { name: 'Spodní navigace' }).waitFor({ timeout: 15000 });
  // TO GO je na telefonu výchozí kapesní režim; přepne se na plnou správu, kde je dok.
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Více' }).click();
  await p.getByRole('button', { name: /^Jazyk: Čeština/ }).click();
  const radia = await p.getByRole('radio').evaluateAll(els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  tvrdi('aplikace: okno Jazyk nabízí pět endonymů', radia.length === 5 && JAZYKY.every(([, n]) => radia.some(r => r.startsWith(n))), JSON.stringify(radia));
  await p.getByRole('radio', { name: /Deutsch/ }).click();
  await p.waitForFunction(() => document.documentElement.lang === 'de', null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(800);
  tvrdi('aplikace: <html lang="de"> a cookie managero-lang=de', await p.evaluate(() => document.documentElement.lang) === 'de' && (await ctx.cookies()).some(c => c.name === 'managero-lang' && c.value === 'de'));
  const patch = stav.dotazy.find(d => d.m === 'PATCH' && d.path === '/api/account');
  tvrdi('aplikace: jazyk se uloží na účet (PATCH /api/account s lang)', !!patch, JSON.stringify(stav.dotazy.map(d => d.m + ' ' + d.path).slice(-6)));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const dok = await p.getByRole('navigation', { name: 'Untere Navigation' }).evaluate(n => {
    const r = n.getBoundingClientRect();
    return { levy: r.left, pravy: r.right, popisky: Array.from(n.querySelectorAll('span')).map(s => ({ t: s.textContent.trim(), p: s.getBoundingClientRect().right, l: s.getBoundingClientRect().left, pre: s.scrollWidth > s.clientWidth + 1 })) };
  });
  tvrdi('aplikace: dok v němčině (Übersicht) a žádný popisek nepřesahuje okno', dok.popisky.some(x => x.t === 'Übersicht') && dok.popisky.every(x => x.l >= 0 && x.p <= 390), JSON.stringify(dok.popisky));
  tvrdi('aplikace: dok se vejde do 390 px', dok.levy >= 0 && dok.pravy <= 390, JSON.stringify(dok));
  const pt = await preteka(p);
  tvrdi('aplikace: německá slupka bez vodorovného přetečení', pt.doc <= pt.okno, JSON.stringify(pt));
  await p.screenshot({ path: `${OUT}k76-app-de-390.png` });
  await ctx.close();
}
for (const [tmavy, nazev] of [[false, 'světlý'], [true, 'tmavý']]) {
  const { ctx, p } = await kontext({ viewport: { width: 1280, height: 900 }, tmavy });
  await p.goto(BASE + '/employer/overview?view=settings', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Jazyk a region/ }).first().click();
  const skupina = p.getByRole('radiogroup', { name: 'Jazyk' });
  await skupina.waitFor({ timeout: 10000 });
  const radia = await skupina.getByRole('radio').evaluateAll(els => els.map(e => ({ t: e.textContent.replace(/\s+/g, ' ').trim(), on: e.getAttribute('aria-checked') })));
  tvrdi(`Nastavení → Jazyk a region (${nazev}): karta Jazyk má pět jazyků a vybranou češtinu`, radia.length === 5 && radia[0].on === 'true' && radia.filter(r => r.on === 'true').length === 1, JSON.stringify(radia));
  // vybraný řádek nese fajfku, ne limetku: nikde v kartě není plná limetková výplň
  const limetka = await skupina.evaluate(el => Array.from(el.querySelectorAll('*')).filter(e => { const c = getComputedStyle(e).backgroundColor; return c === 'rgb(200, 245, 66)'; }).length);
  tvrdi(`Nastavení → Jazyk a region (${nazev}): v kartě Jazyk není plná limetka`, limetka === 0, String(limetka));
  await p.screenshot({ path: `${OUT}k76-nastaveni-${tmavy ? 'tmavy' : 'svetly'}.png` });
  await ctx.close();
}
await b.close();
await konec();
