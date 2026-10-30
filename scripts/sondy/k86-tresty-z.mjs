// Kolo 10 — balík Z: „Tresty" u zaměstnance (widget Moje tresty, okno DetailTrestu, odkaz z oznámení).
//
// Z1 Domů 390 (dotyk) + 1280: malá karta „2 tresty k potvrzení" s nejnovějším nepotvrzeným a „Beru na
//    vědomí" (PATCH seen, Toast, přenačtení); střední karta — řádky s chipem stavu (červený jen
//    „Nepotvrzeno"), dopad „−15 b" + „krácení 300 Kč" (měna podniku), zrušený přeškrtnutý se „Zrušeno: …",
//    bez limetky. Detail z řádku: položka sazebníku a „2. v tomto měsíci", směna, věta o prémii (ne mzdě),
//    fotka, vyjádření „Vedení to uvidí."; Vyjádřit se → prázdné = hláška, Nesouhlasím → PATCH
//    { response, disagree: true }, Toast; DiscardGuard nad rozepsaným vyjádřením.
// Z1b Domů bez nepotvrzených: malá karta se v klidu nekreslí (plocha ji schová), střední zůstává.
// Z1c Tmavý režim 390: Domů a detail (snímky), bez přetečení.
// Z2 Odměny 1280 + 390: velký widget — souhrn měsíce, Segmented Vše / Platné / Zrušené, zrušený trest
//    v detailu jen ke čtení; Odkud mám body s řádkem „Tresty −25 · 2 tresty s body".
// Z3 Odkaz z oznámení /employee/shifts?view=rewards&arg=tresty → Odměny s otevřeným detailem nejnovějšího
//    nepotvrzeného (101); bez nepotvrzených detail toho, co se naposled stalo (zrušení 104).
// Z4 Polština a němčina 320: Domů, detail a Odměny bez přetečení.
//   SONDY_ZAKLAD=http://localhost:3443 node scripts/sondy/k86-tresty-z.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, jdi, mine, sysRole, DIR, OUT, BASE } from './k68-spolecne.mjs';
import { nastavJazyk } from './preteceni-jadro.mjs';

const TEL = { width: 390, height: 844 };
const PC = { width: 1280, height: 900 };
const SNIMKY = process.env.K86_SNIMKY ? process.env.K86_SNIMKY.replace(/\/?$/, '/') : OUT;
mkdirSync(SNIMKY, { recursive: true });

const r = sysRole('barista');
const BARISTA = mine(r.opravneni, { klic: 'barista', roleId: null, nazev: r.nazev, typ: r.typ, jeVlastnik: false });

const praha = (o = 0) => ((d) => { d.setUTCDate(d.getUTCDate() + o); return d.toISOString().slice(0, 10); })(new Date(`${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now()))}T12:00:00Z`));
const DNY = { DNES: praha(0), VCERA: praha(-1), PRED3: praha(-3), PRED5: praha(-5), PRED6: praha(-6) };
const MESIC = DNY.DNES.slice(0, 7);
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`).replaceAll(`"${k}T`, `"${v}T`);
  return JSON.parse(t);
};
const skutecneChyby = (chyby) => chyby.filter(c => !/Minified React error #418|Hydration|hydrat|Failed to load resource/i.test(c));
const preteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const widgetLi = (p, id) => p.locator(`[data-plocha] li[data-instance="${id}"]`);
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : '').replace(/ /g, ' ');
const telo = (req) => { try { return req.postData() ? JSON.parse(req.postData()) : null; } catch { return null; } };
const poAnimaci = (loc) => loc.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const dialog = (p) => p.locator('[role="dialog"]').filter({ has: p.locator('[data-detail-trestu]') });

/**
 * Podvrh /api/tresty: GET vrací fixturu (čtení do `stav.cteni`), PATCH do `stav.zapisy` a odpoví trestem se změnou.
 * `stav.vseVidel` → všechny tresty potvrzené (malá karta na Domů se schová).
 */
const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (path.startsWith('/api/tresty')) {
    const data = nacti('k86-tresty-z-tresty');
    // Všechno potvrzené a zrušení 104 dnes ráno (oznámení „Trest zrušen" je to nejčerstvější, co se stalo).
    if (stav.vseVidel) data.items = data.items.map(x => ({ ...x, seenAt: x.seenAt ?? `${DNY.DNES}T08:00:00.000Z`, ...(x.id === 104 ? { cancelledAt: `${DNY.DNES}T07:00:00.000Z` } : {}) }));
    if (m === 'GET') { (stav.cteni ??= []).push(path + url.search); return json(data); }
    const t = telo(req);
    (stav.zapisy ??= []).push({ m, path, telo: t });
    const id = Number(path.split('/').pop());
    const puvodni = data.items.find(x => x.id === id) ?? data.items[0];
    if (t?.seen) return json({ ok: true, item: { ...puvodni, seenAt: new Date().toISOString() } });
    if (t?.response !== undefined) return json({ ok: true, item: { ...puvodni, response: t.response, responseAt: new Date().toISOString(), disputed: t.disagree === true, seenAt: puvodni.seenAt ?? new Date().toISOString() } });
    return json({ ok: true, item: puvodni });
  }
  if (path === '/api/rewards' && m === 'GET') return json(nacti('k86-tresty-z-rewards'));
  return undefined;
};

/** Kontext + obrázek fotky (route na /api/upload/* vrací PNG, ne JSON). */
async function otevriKontext(volby) {
  const k = await kontext({ role: 'employee', mineData: BARISTA, dalsi: podvrh, ...volby });
  await k.ctx.route('**/api/upload/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  return k;
}

const FIX_DOMU = nacti('k86-tresty-z-rozlozeni-domu');
const FIX_ODMENY = nacti('k86-tresty-z-rozlozeni-odmeny');

// ---------------------------------------------------------------------------
// Z1 — Domů 390 (dotyk) + 1280
// ---------------------------------------------------------------------------
for (const [nazev, volby] of [['390', { viewport: TEL, mobil: true }], ['1280', { viewport: PC, mobil: false }]]) {
  const { ctx, p, stav, chyby } = await otevriKontext({ ...volby, fix: FIX_DOMU });
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  const male = widgetLi(p, 'tresty-male');
  const w = widgetLi(p, 'moje-smeny-tresty');
  await dokud(() => w.locator('[data-tresty-seznam]').count().then(n => n > 0), 8000);
  await dokud(() => male.locator('[data-tresty-k-potvrzeni]').count().then(n => n > 0), 4000);
  const tm = await text(male);
  tvrdi(`Z1 (${nazev}): malá karta — „2 tresty k potvrzení", nejnovější nepotvrzený (Pozdní příchod o 25 min., −10 b) a „Beru na vědomí"`,
    /2 tresty k potvrzení/i.test(tm) && /Pozdní příchod o 25 min\./.test(tm) && /−10 b/.test(tm) && await male.getByRole('button', { name: 'Beru na vědomí' }).count() === 1, tm.replace(/\n/g, ' | '));
  await poAnimaci(male);
  const vyska = (await male.getByRole('button', { name: 'Beru na vědomí' }).boundingBox())?.height ?? 0;
  tvrdi(`Z1 (${nazev}): „Beru na vědomí" je cíl ≥ 44 px`, vyska >= 44, String(vyska));
  tvrdi(`Z1 (${nazev}): /api/tresty se ptá jednou pro obě karty (sdílená mezipaměť)`, (stav.cteni ?? []).filter(u => u === '/api/tresty').length === 1, JSON.stringify(stav.cteni));

  const tw = await text(w);
  const radky = w.locator('[data-tresty-seznam] > li');
  const pocetRadku = await radky.count();
  tvrdi(`Z1 (${nazev}): střední karta — nejvýš 5 řádků, sporný nahoře, nepotvrzené za ním`, pocetRadku >= 2 && pocetRadku <= 5
    && /Nezavřená lednice/.test(await text(radky.nth(0))) && /Pozdní příchod o 25 min\./.test(await text(radky.nth(1))), tw.replace(/\n/g, ' | ').slice(0, 400));
  tvrdi(`Z1 (${nazev}): červený chip jen u nepotvrzených (2×), sporný „Nesouhlasí" tlumeně`, await w.locator('.chip.chip-bad').count() === 2 && /Nesouhlasí/.test(tw) && await w.locator('.chip-wait').filter({ hasText: 'Nesouhlasí' }).count() === 1);
  tvrdi(`Z1 (${nazev}): dopad v řádku „−15 b" + „krácení 300 Kč" (měna podniku), napomenutí slovem`, /−15 b/.test(tw) && /krácení 300\s?Kč/.test(tw) && /Napomenutí/.test(tw), tw.replace(/\n/g, ' | ').slice(0, 500));
  tvrdi(`Z1 (${nazev}): meta řádku — den · položka sazebníku · kdo dal`, /Pozdní příchod · dal\(a\) Martin Nemeškal/.test(tw), tw.replace(/\n/g, ' | ').slice(0, 500));
  const zruseny = radky.filter({ hasText: 'Pozdní příchod o 40 min.' });
  if (await zruseny.count()) {
    tvrdi(`Z1 (${nazev}): zrušený — přeškrtnutý dopad a „Zrušeno: Omyl — byla to jiná směna."`, /Zrušeno: Omyl — byla to jiná směna\./.test(await text(zruseny))
      && await zruseny.locator('[data-dopad].line-through').count() === 1);
  }
  tvrdi(`Z1 (${nazev}): bez limetky ve widgetech`, await p.locator('[data-plocha] li[data-widget="moje-smeny.tresty"]').locator('button.on-accent, .btn-accent').count() === 0);
  await p.screenshot({ path: SNIMKY + `k86-tresty-domu-${nazev}.png`, fullPage: true });

  // Beru na vědomí z malé karty
  await male.getByRole('button', { name: 'Beru na vědomí' }).click();
  const patch = await dokud(() => stav.zapisy?.find(z => z.m === 'PATCH'), 4000);
  tvrdi(`Z1 (${nazev}): „Beru na vědomí" → PATCH /api/tresty/101 { seen: true }`, patch?.path === '/api/tresty/101' && patch?.telo?.seen === true, JSON.stringify(patch));
  tvrdi(`Z1 (${nazev}): Toast „Vzato na vědomí." a přenačtení /api/tresty`, await dokud(() => p.getByRole('status').filter({ hasText: 'Vzato na vědomí.' }).isVisible().catch(() => false), 3000)
    && await dokud(() => (stav.cteni ?? []).filter(u => u === '/api/tresty').length >= 2, 4000), JSON.stringify(stav.cteni));

  // Detail sporného (103) z řádku
  await radky.nth(0).getByRole('button').first().click();
  const d = dialog(p);
  tvrdi(`Z1 (${nazev}): klepnutí na řádek otevře detail trestu`, await dokud(() => d.isVisible().catch(() => false), 4000));
  await poAnimaci(d);
  const td = await text(d);
  tvrdi(`Z1 (${nazev}): detail — text, položka sazebníku, kdo dal, uzávěrka`, /Nezavřená lednice přes noc/.test(td) && /Položka sazebníku/.test(td) && /Nezavřená lednice \/ sklad/.test(td) && /Martin Nemeškal/.test(td) && /Uzávěrka/.test(td), td.replace(/\n/g, ' | ').slice(0, 600));
  tvrdi(`Z1 (${nazev}): dopad — body dolů −15 b, krácení −300 Kč a věta „Krátí se jen prémie za …, ne mzda."`, /−15 b/.test(td) && /−300\s?Kč/.test(td) && /Krátí se jen prémie za \S+, ne mzda\./.test(td), td.replace(/\n/g, ' | ').slice(0, 600));
  tvrdi(`Z1 (${nazev}): fotka a vyjádření „Vedení to uvidí." s chipem „Nesouhlasíš"`, await d.locator('img[alt="Fotka k trestu"]').count() === 1 && /Lednici jsem zavírala/.test(td) && /Vedení to uvidí\./.test(td) && /Nesouhlasíš/.test(td));
  tvrdi(`Z1 (${nazev}): potvrzený trest — tlačítka Zavřít a Upravit vyjádření, žádné „Beru na vědomí"`, await d.getByRole('button', { name: 'Upravit vyjádření' }).count() === 1 && await d.getByRole('button', { name: 'Beru na vědomí' }).count() === 0);
  if (nazev === '390') {
    tvrdi('Z1 (390): detail nepřetéká', await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1) && await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);
    const cile = await d.getByRole('button').evaluateAll(els => els.filter(e => e.offsetParent !== null && !e.classList.contains('btn-icon') && e.closest('footer, [data-modal-footer], .modal-footer')).map(e => [e.textContent.trim().slice(0, 20), e.getBoundingClientRect().height]));
    tvrdi('Z1 (390): tlačítka v patičce detailu ≥ 44 px', cile.every(([, h]) => h >= 44), JSON.stringify(cile));
  }
  await p.screenshot({ path: SNIMKY + `k86-tresty-detail-${nazev}.png` });
  await d.getByRole('button', { name: 'Zavřít', exact: true }).last().click();
  tvrdi(`Z1 (${nazev}): Zavřít zavře detail`, await dokud(async () => (await d.count()) === 0, 2000));

  // Detail nepotvrzeného (101): pořadí, směna, Vyjádřit se + Nesouhlasím
  await jdi(p, BASE + '/employee/shifts?view=home');
  await dokud(() => w.locator('[data-tresty-seznam]').count().then(n => n > 0), 8000);
  await w.locator('[data-tresty-seznam] > li').filter({ hasText: 'Pozdní příchod o 25 min.' }).getByRole('button').first().click();
  await dokud(() => d.isVisible().catch(() => false), 4000);
  await poAnimaci(d);
  const td2 = await text(d);
  tvrdi(`Z1 (${nazev}): detail nepotvrzeného — „2. v tomto měsíci", řádek Směna, chip Nepotvrzeno, Beru na vědomí i Vyjádřit se`,
    /2\. v tomto měsíci/.test(td2) && /Směna/.test(td2) && await d.locator('.chip-bad').count() === 1
    && await d.getByRole('button', { name: 'Beru na vědomí' }).count() === 1 && await d.getByRole('button', { name: 'Vyjádřit se' }).count() === 1, td2.replace(/\n/g, ' | ').slice(0, 500));
  await d.getByRole('button', { name: 'Vyjádřit se' }).click();
  const pole = d.getByLabel('Tvoje vyjádření');
  tvrdi(`Z1 (${nazev}): Vyjádřit se → textarea a přepínač „Nesouhlasím s trestem"`, await dokud(() => pole.isVisible().catch(() => false), 2000) && await d.getByRole('switch', { name: 'Nesouhlasím s trestem' }).count() === 1);
  if (nazev === '390') tvrdi('Z1 (390): textarea má písmo ≥ 16 px', (await pole.evaluate(el => parseFloat(getComputedStyle(el).fontSize))) >= 16);
  await d.getByRole('button', { name: 'Odeslat vyjádření' }).click();
  tvrdi(`Z1 (${nazev}): prázdné vyjádření → „Napiš své vyjádření." pod polem, žádný PATCH`, await dokud(() => d.getByRole('alert').filter({ hasText: 'Napiš své vyjádření.' }).isVisible().catch(() => false), 2000)
    && (stav.zapisy ?? []).filter(z => z.telo?.response !== undefined).length === 0);
  await pole.fill('Autobus měl zpoždění, psala jsem vedoucí předem.');
  tvrdi(`Z1 (${nazev}): počítadlo znaků „48/500"`, /48\/500/.test(await text(d.locator('[data-pocitadlo]'))), await text(d.locator('[data-pocitadlo]')));
  // DiscardGuard: Escape nad rozepsaným se zeptá.
  await p.keyboard.press('Escape');
  const otazka = p.getByRole('alertdialog', { name: 'Zahodit rozepsané?' });
  tvrdi(`Z1 (${nazev}): Escape nad rozepsaným vyjádřením se zeptá „Zahodit rozepsané?"`, await dokud(() => otazka.isVisible().catch(() => false), 2000));
  await otazka.getByRole('button', { name: 'Zpět k úpravám' }).click();
  tvrdi(`Z1 (${nazev}): „Zpět k úpravám" nechá okno i text`, await dokud(async () => (await otazka.count()) === 0, 2000) && (await pole.inputValue()) === 'Autobus měl zpoždění, psala jsem vedoucí předem.');
  await d.getByRole('switch', { name: 'Nesouhlasím s trestem' }).click();
  if (nazev === '390') await p.screenshot({ path: SNIMKY + 'k86-tresty-vyjadreni-390.png' });
  await d.getByRole('button', { name: 'Odeslat vyjádření' }).click();
  const vyj = await dokud(async () => stav.zapisy?.find(z => z.telo?.response !== undefined), 4000);
  tvrdi(`Z1 (${nazev}): PATCH /api/tresty/101 { response, disagree: true }`, vyj?.path === '/api/tresty/101' && vyj?.telo?.response === 'Autobus měl zpoždění, psala jsem vedoucí předem.' && vyj?.telo?.disagree === true, JSON.stringify(vyj));
  tvrdi(`Z1 (${nazev}): Toast „Nesouhlas odeslán — vedení ho uvidí." a v detailu vyjádření s „Vedení to uvidí."`,
    await dokud(() => p.getByRole('status').filter({ hasText: 'Nesouhlas odeslán — vedení ho uvidí.' }).isVisible().catch(() => false), 3000)
    && await dokud(async () => /Autobus měl zpoždění/.test(await text(d.locator('[data-vyjadreni]'))), 3000) && /Vedení to uvidí\./.test(await text(d.locator('[data-vyjadreni]'))));
  tvrdi(`Z1 (${nazev}): stránka nepřetéká`, await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);
  tvrdi(`Z1 (${nazev}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// Z1b — Domů bez nepotvrzených: malá karta se v klidu nekreslí.
{
  const { ctx, p, stav } = await otevriKontext({ viewport: TEL, mobil: true, fix: FIX_DOMU });
  stav.vseVidel = true;
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  const w = widgetLi(p, 'moje-smeny-tresty');
  await dokud(() => w.locator('[data-tresty-seznam]').count().then(n => n > 0), 8000);
  const male = widgetLi(p, 'tresty-male');
  tvrdi('Z1b (390): bez nepotvrzeného trestu malá karta na Domů zmizí (plocha ji schová), střední zůstane',
    await dokud(async () => !(await male.isVisible().catch(() => false)), 3000) && await w.isVisible() && await w.locator('.chip-bad').count() === 0);
  await p.screenshot({ path: SNIMKY + 'k86-tresty-domu-bez-nepotvrzenych-390.png', fullPage: true });
  await ctx.close();
}

// Z1c — tmavý režim 390: Domů a detail.
{
  const { ctx, p, chyby } = await otevriKontext({ viewport: TEL, mobil: true, tmavy: true, fix: FIX_DOMU });
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  const w = widgetLi(p, 'moje-smeny-tresty');
  await dokud(() => w.locator('[data-tresty-seznam]').count().then(n => n > 0), 8000);
  tvrdi('Z1c (tmavý 390): pozadí je tmavé', await p.evaluate(() => { const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return c[0] < 80 && c[1] < 80 && c[2] < 80; }));
  await p.screenshot({ path: SNIMKY + 'k86-tresty-domu-390-tmavy.png', fullPage: true });
  await w.locator('[data-tresty-seznam] > li').filter({ hasText: 'Nezavřená lednice' }).getByRole('button').first().click();
  const d = dialog(p);
  await dokud(() => d.isVisible().catch(() => false), 4000);
  await poAnimaci(d);
  tvrdi('Z1c (tmavý 390): detail nepřetéká', await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1) && await preteceni(p) <= 1);
  await p.screenshot({ path: SNIMKY + 'k86-tresty-detail-390-tmavy.png' });
  tvrdi('Z1c (tmavý 390): bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z2 — Odměny 1280 + 390: velký widget, filtr, zrušený jen ke čtení, Odkud mám body
// ---------------------------------------------------------------------------
for (const [nazev, volby] of [['1280', { viewport: PC, mobil: false }], ['390', { viewport: TEL, mobil: true }]]) {
  const { ctx, p, chyby } = await otevriKontext({ ...volby, fix: FIX_ODMENY });
  await otevri(p, '/employee/shifts?view=rewards', 'zamestnanec.odmeny');
  const w = widgetLi(p, 'moje-smeny-tresty');
  await dokud(() => w.locator('[data-tresty-seznam]').count().then(n => n > 0), 8000);
  const souhrn = await text(w.locator('[data-tresty-souhrn]'));
  // Souhrn měsíce z fixtury: platné tresty tohoto měsíce (101, 105, 102, 103 podle data) a zrušený 104.
  const data = nacti('k86-tresty-z-tresty').items.filter(x => x.day.startsWith(MESIC));
  const platne = data.filter(x => x.status === 'plati');
  const body = platne.reduce((a, x) => a + x.points, 0);
  tvrdi(`Z2 (${nazev}): souhrn měsíce „${platne.length} tresty… · −${body} b"`, new RegExp(`${platne.length} trest`).test(souhrn) && (body === 0 || souhrn.includes(`−${body} b`)), souhrn);
  const seg = w.getByRole('tablist', { name: 'Stav' });
  tvrdi(`Z2 (${nazev}): Segmented Vše / Platné / Zrušené`, await seg.getByRole('tab').count() === 3 && /Vše/.test(await text(seg)) && /Platné/.test(await text(seg)) && /Zrušené/.test(await text(seg)), await text(seg));
  const zrusenychVMesici = data.filter(x => x.status === 'zruseno').length;
  await seg.getByRole('tab', { name: /Zrušené/ }).click();
  const radky = w.locator('[data-tresty-seznam] > li');
  tvrdi(`Z2 (${nazev}): filtr Zrušené ukáže jen zrušené (${zrusenychVMesici})`, await dokud(async () => (await radky.count()) === zrusenychVMesici || (zrusenychVMesici === 0 && /Žádný trest/.test(await text(w))), 2000), String(await radky.count()));
  await p.screenshot({ path: SNIMKY + `k86-tresty-odmeny-zrusene-${nazev}.png`, fullPage: true });
  if (zrusenychVMesici) {
    await radky.nth(0).getByRole('button').first().click();
    const d = dialog(p);
    await dokud(() => d.isVisible().catch(() => false), 4000);
    await poAnimaci(d);
    const td = await text(d);
    tvrdi(`Z2 (${nazev}): zrušený trest jen ke čtení — „Zrušeno: Omyl…", body se vrátily, žádné akce`, /Zrušeno: Omyl — byla to jiná směna\./.test(td) && /body i krácení se vrátily/.test(td)
      && await d.getByRole('button', { name: /Beru na vědomí|Vyjádřit se|Upravit vyjádření/ }).count() === 0 && await d.locator('[data-dopad-trestu] .line-through').count() === 1, td.replace(/\n/g, ' | ').slice(0, 400));
    await p.screenshot({ path: SNIMKY + `k86-tresty-detail-zruseny-${nazev}.png` });
    await d.getByRole('button', { name: 'Zavřít', exact: true }).last().click();
    await dokud(async () => (await d.count()) === 0, 2000);
  }
  await seg.getByRole('tab', { name: /Vše/ }).click();
  const odkud = widgetLi(p, 'moje-odkud-body');
  const to = await text(odkud);
  tvrdi(`Z2 (${nazev}): Odkud mám body — řádek „Tresty" se zápornými body a plurálem „2 tresty s body"`, /Tresty/.test(to) && /2 tresty s body/.test(to) && /[−-]25/.test(to), to.replace(/\n/g, ' | ').slice(0, 400));
  await p.screenshot({ path: SNIMKY + `k86-tresty-odmeny-${nazev}.png`, fullPage: true });
  tvrdi(`Z2 (${nazev}): stránka nepřetéká`, await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);
  tvrdi(`Z2 (${nazev}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z3 — odkaz z oznámení
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await otevriKontext({ viewport: TEL, mobil: true, fix: FIX_ODMENY });
  await otevri(p, '/employee/shifts?view=rewards&arg=tresty', 'zamestnanec.odmeny');
  const d = dialog(p);
  tvrdi('Z3 (390): odkaz z oznámení otevře Odměny s detailem nejnovějšího nepotvrzeného trestu (101)', await dokud(() => d.isVisible().catch(() => false), 6000)
    && (await d.locator('[data-detail-trestu]').getAttribute('data-detail-trestu')) === '101' && await widgetLi(p, 'moje-smeny-tresty').count() === 1);
  await poAnimaci(d);
  await p.screenshot({ path: SNIMKY + 'k86-tresty-z-oznameni-390.png' });
  await d.getByRole('button', { name: 'Beru na vědomí' }).click();
  tvrdi('Z3 (390): „Beru na vědomí" v detailu → Toast, chip „Vzato na vědomí"', await dokud(() => p.getByRole('status').filter({ hasText: 'Vzato na vědomí.' }).isVisible().catch(() => false), 3000)
    && await dokud(async () => /Vzato na vědomí/.test(await text(d.locator('.chip'))), 3000));
  tvrdi('Z3 (390): bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}
{
  const { ctx, p, stav } = await otevriKontext({ viewport: TEL, mobil: true, fix: FIX_ODMENY });
  stav.vseVidel = true;
  await otevri(p, '/employee/shifts?view=rewards&arg=tresty', 'zamestnanec.odmeny');
  const d = dialog(p);
  tvrdi('Z3b (390): bez nepotvrzených otevře odkaz detail toho, co se naposled stalo (zrušení 104)', await dokud(() => d.isVisible().catch(() => false), 6000)
    && (await d.locator('[data-detail-trestu]').getAttribute('data-detail-trestu')) === '104');
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z4 — polština a němčina 320
// ---------------------------------------------------------------------------
for (const jazyk of ['pl', 'de']) {
  const { ctx, p } = await otevriKontext({ viewport: { width: 320, height: 700 }, mobil: true, fix: FIX_DOMU });
  await nastavJazyk(p.context(), jazyk);
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  const w = widgetLi(p, 'moje-smeny-tresty');
  await dokud(() => w.locator('[data-tresty-seznam]').count().then(n => n > 0), 8000);
  await p.waitForTimeout(400);
  const karty = await p.$$eval('[data-plocha] li[data-widget] section', els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.closest('li').dataset.instance));
  tvrdi(`Z4 (320 ${jazyk}): Domů s Mými tresty nepřetéká (dokument ani karty)`, await preteceni(p) <= 1 && karty.length === 0, `přetečení ${await preteceni(p)} px, karty ${JSON.stringify(karty)}`);
  await p.screenshot({ path: SNIMKY + `k86-tresty-domu-320-${jazyk}.png`, fullPage: true });
  await w.locator('[data-tresty-seznam] > li').filter({ hasText: 'Nezavřená lednice' }).getByRole('button').first().click();
  const d = dialog(p);
  await dokud(() => d.isVisible().catch(() => false), 4000);
  await poAnimaci(d);
  tvrdi(`Z4 (320 ${jazyk}): detail nepřetéká`, await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1) && await preteceni(p) <= 1);
  await p.screenshot({ path: SNIMKY + `k86-tresty-detail-320-${jazyk}.png` });
  await ctx.close();
}
// Odměny 320 pl (velký widget se Segmented)
{
  const { ctx, p } = await otevriKontext({ viewport: { width: 320, height: 700 }, mobil: true, fix: FIX_ODMENY });
  await nastavJazyk(p.context(), 'pl');
  await otevri(p, '/employee/shifts?view=rewards', 'zamestnanec.odmeny');
  const w = widgetLi(p, 'moje-smeny-tresty');
  await dokud(() => w.locator('[data-tresty-seznam]').count().then(n => n > 0), 8000);
  await p.waitForTimeout(400);
  const karty = await p.$$eval('[data-plocha] li[data-widget] section', els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.closest('li').dataset.instance));
  tvrdi('Z4 (320 pl): Odměny s velkým widgetem nepřetékají', await preteceni(p) <= 1 && karty.length === 0, `přetečení ${await preteceni(p)} px, karty ${JSON.stringify(karty)}`);
  await p.screenshot({ path: SNIMKY + 'k86-tresty-odmeny-320-pl.png', fullPage: true });
  await ctx.close();
}

await konec();
