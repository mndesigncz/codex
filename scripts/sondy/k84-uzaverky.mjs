// Kolo 8, balík R8-5 — Uzávěrky, receptury a poznámky: výplata z kasy s výběrem člověka a fotky dokladů
// (zaměstnanec 390 s dotykem, POST /api/closings), detail uzávěrky s výplatami po lidech, doklady a vláknem
// poznámek s @zmínkou (vedení 1280 i 390), widget Receptury (Změněno tento týden, Návrhy ke schválení → PATCH),
// historie receptury (okno, Vrátit na tuto verzi), bublina počtu poznámek v řádku, návrh změny u zaměstnance
// jen s receptury.navrhnout (390, POST /api/pos/recipe-proposals). Němčina 320 bez přetečení.
//   SONDY_ZAKLAD=http://localhost:3435 node scripts/sondy/k84-uzaverky.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, roleMine, mine, sysRole, DIR, OUT, BASE } from './k68-spolecne.mjs';
import { nastavJazyk } from './preteceni-jadro.mjs';

const TEL = { width: 390, height: 844 };
const PC = { width: 1280, height: 900 };
const BARISTA = roleMine('barista');
/** Barista, který receptury jen navrhuje (bez receptury.upravit). */
const NAVRHOVATEL = (() => { const r = sysRole('barista'); return mine([...r.opravneni.filter(k => k !== 'receptury.upravit'), 'receptury.navrhnout'], { klic: 'barista', roleId: null, nazev: r.nazev, typ: r.typ, jeVlastnik: false }); })();
const SNIMKY = process.env.K84_SNIMKY ? process.env.K84_SNIMKY.replace(/\/?$/, '/') : OUT;
mkdirSync(SNIMKY, { recursive: true });

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PREDEVCIREM: praha(-2), PRED3: praha(-3), PRED4: praha(-4), PRED5: praha(-5), PRED6: praha(-6) };
const MESIC = DNY.DNES.slice(0, 7);
// Pražský čas se správným posunem podle data (letní +02:00, zimní +01:00) — pevné +02:00
// po změně času na zimní posunulo příchody o hodinu a „pozdní příchod" zmizel.
const iso = (den, hm) => {
  const odhad = new Date(`${den}T${hm}:00Z`);
  const tz = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Prague', timeZoneName: 'longOffset' }).formatToParts(odhad).find(x => x.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  return new Date(`${den}T${hm}:00${tz.replace('GMT', '') || '+00:00'}`).toISOString();
};
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  t = t.replace(/"@([A-Z0-9]+)-(\d\d:\d\d)"/g, (_, k, hm) => `"${iso(DNY[k] ?? DNY.DNES, hm)}"`);
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`).replaceAll(`"${k}T`, `"${v}T`);
  return JSON.parse(t.replaceAll('"MESIC"', `"${MESIC}"`));
};
const skutecneChyby = (chyby) => chyby.filter(c => !/Minified React error #418|Hydration|hydrat|Failed to load resource/i.test(c));
const preteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
const dialog = (p) => p.getByRole('dialog').last();
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : '').replace(/\u00a0/g, ' ');
/** 1×1 PNG — „fotka" z fotoaparátu pro vstup souboru. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// ---------------------------------------------------------------------------
// Podvrhy API
// ---------------------------------------------------------------------------

/** Uzávěrky (zaměstnanec i vedení): seznam, kolegové, detail, poznámky, nahrání; zápisy do `stav.zapisy`. */
const podvrhUzaverky = ({ closings = 'k69-b5a-closings-zamestnanec' } = {}) => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (m !== 'GET') {
    const telo = (() => { try { return req.postData() ? JSON.parse(req.postData()) : null; } catch { return null; } })();
    (stav.zapisy ??= []).push({ m, path, telo, q: url.search });
    if (path === '/api/closings') return json({ ok: true, closing: { id: 777, date: DNY.DNES }, approved: true, covered: 0, tipsInDrawer: false, openClockIns: [] });
    if (path === '/api/upload') return json({ url: `/api/upload/k84-${(stav.zapisy ?? []).length}` });
    if (path === '/api/notes') return json({ id: 99, text: telo?.text ?? '', createdAt: new Date().toISOString(), updatedAt: null, autor: { id: 15, name: 'Martin Nemeškal', avatar: '🧑' }, moje: true, muzuSmazat: true, pripnuta: false, zminky: [16] }, 201);
    return json({ ok: true });
  }
  if (path === '/api/closings') { const d = nacti(closings); return json({ ...d, payDailyCash: true }); }
  if (path === '/api/closings/coworkers') return json(nacti('k84-uzaverky-coworkers'));
  if (path === '/api/closings/wage') return json({ available: false });
  if (path === '/api/closings/calendar') return json({ ...nacti('k69-b5a-calendar'), month: url.searchParams.get('month') ?? MESIC });
  if (path === '/api/closings/handover') return json(nacti('k69-b5a-handover'));
  if (/^\/api\/closings\/\d+$/.test(path)) return json(nacti('k84-uzaverky-closing-detail'));
  if (path === '/api/notes') return json(url.searchParams.get('typ') === 'closing' ? nacti('k84-uzaverky-notes-closing') : []);
  if (path === '/api/notes/pocty') return json({ pocty: {} });
  if (path === '/api/finance') return json(JSON.parse(readFileSync(DIR + 'finance_month_2026-09.json', 'utf8')));
  return undefined;
};

/** Receptury: katalog kasy, sklad, historie, návrhy, počty poznámek; zápisy do `stav.zapisy`. */
const podvrhReceptury = ({ navrhy = 'k84-uzaverky-proposals' } = {}) => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (m !== 'GET') {
    const telo = (() => { try { return req.postData() ? JSON.parse(req.postData()) : null; } catch { return null; } })();
    (stav.zapisy ??= []).push({ m, path, telo });
    if (path === '/api/pos/recipe-proposals') return json({ ok: true, proposal: { ...(nacti(navrhy).proposals[0] ?? {}), id: 9, status: m === 'PATCH' ? 'schvaleno' : 'ceka' } });
    return json({ ok: true });
  }
  if (path === '/api/pos/products') return json(nacti('k69-b4-pos-products'));
  if (path === '/api/inventory') return json(nacti('k69-b4-inventory'));
  if (path === '/api/inventory/categories') return json([{ id: 1, name: 'Bar' }]);
  if (path === '/api/guides') return json({ guides: [{ id: 12, title: 'Jak dělat latte', productId: 'p1' }] });
  if (path === '/api/pos/margins') return json({ connected: true, totals: { marginPct: 68, margin: 1000, noRecipe: 1 }, items: [] });
  if (path === '/api/pos/status') return json({ connected: true });
  if (path === '/api/pos/recipe-history') return json(nacti(url.searchParams.get('productId') ? 'k84-uzaverky-history' : 'k84-uzaverky-history-tyden'));
  if (path === '/api/pos/recipe-proposals') return json(nacti(navrhy));
  if (path === '/api/notes/pocty') return json(url.searchParams.get('typ') === 'recipe' ? nacti('k84-uzaverky-pocty-recipe') : { pocty: {} });
  if (path === '/api/notes') return json([]);
  return undefined;
};

const FIX_UZAVERKA = nacti('k69-b5a-rozlozeni-uzaverka');
const FIX_UZAVERKY = nacti('k69-b5a-rozlozeni-uzaverky');
const FIX_RECEPTURY = nacti('k69-b4-rozlozeni-receptury');
const FIX_RECEPTURY_ZAM = { ...FIX_RECEPTURY, stranka: 'zamestnanec.receptury', rozsah: 'typ:zamestnanec', polozky: FIX_RECEPTURY.polozky.filter(x => x.widget !== 'finance.marze'), dostupne: ['receptury.pokryti', 'receptury.bez_receptury'] };

// ---------------------------------------------------------------------------
// U1 — zaměstnanec 390: výplata z kasy komu, doklady, odeslání
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', viewport: TEL, mobil: true, fix: FIX_UZAVERKA, mineData: BARISTA, dalsi: podvrhUzaverky() });
  await otevri(p, '/employee/shifts?view=closing', 'zamestnanec.uzaverka');
  const nastroj = widgetLi(p, 'nastroj');
  await nastroj.getByRole('button', { name: 'Přejít na krok Výdaje' }).click();
  await p.waitForTimeout(400);
  const vyplata = nastroj.getByRole('button', { name: 'Výplata z kasy', exact: true });
  tvrdi('U1 (390): mezi druhy pohybů je „Výplata z kasy" (podnik vyplácí z kasy)', await vyplata.count() === 1);
  await vyplata.click();
  const komu = nastroj.locator('[data-vyplata-komu]');
  tvrdi('U1 (390): po volbě výplaty se ukáže „Komu se vyplácí" — Já, Martin (na směně) a „Jiný…"', await dokud(() => komu.isVisible(), 2000)
    && /Já/.test(await text(komu)) && /Martin Nemeškal/.test(await text(komu)) && /Jiný…/.test(await text(komu)), (await text(komu)).replace(/\n/g, ' | '));
  tvrdi('U1 (390): pás příjemců se posouvá do strany, ne přes okraj', await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);
  const pilulky = komu.getByRole('button');
  const vyska = await pilulky.first().evaluate(el => el.getBoundingClientRect().height);
  tvrdi('U1 (390): pilulka příjemce je dotykový cíl ≥ 36 px (tap-target-sm) a výchozí je Já', vyska >= 36 && (await pilulky.first().getAttribute('aria-pressed')) === 'true', `${vyska}px`);
  await komu.getByRole('button', { name: 'Martin Nemeškal' }).click();
  await nastroj.getByLabel(/Částka pohybu/).fill('1200');
  await nastroj.getByRole('button', { name: 'Přidat' }).click();
  const radek = nastroj.locator('[data-pohyb="payout"][data-komu="15"]');
  tvrdi('U1 (390): pohyb „Výplata z kasy · Martin Nemeškal −1 200 Kč" přibyl do seznamu', await dokud(() => radek.count().then(n => n === 1), 1500) && /Martin Nemeškal/.test(await text(radek)) && /1 200/.test(await text(radek)), await text(radek));
  tvrdi('U1 (390): „Moje výplata dnes" zmizí — zdroj pravdy jsou rozepsané výplaty', await nastroj.getByLabel('Moje výplata dnes').count() === 0);
  tvrdi('U1 (390): „Jiný…" rozbalí výběr dalšího člena (Jakub bez směny)', await (async () => {
    await komu.getByRole('button', { name: 'Jiný…' }).click();
    const sel = nastroj.getByLabel('Jiný člen podniku');
    return await dokud(() => sel.isVisible(), 1500) && (await sel.innerText()).includes('Jakub Horák');
  })());
  await p.screenshot({ path: SNIMKY + 'k84-uzaverky-vyplata-komu-390.png', fullPage: true });

  // Doklady v kroku Tržby: tlačítko otevře fotoaparát (vstup souboru), fotka se nahraje přes /api/upload.
  await nastroj.getByRole('button', { name: 'Přejít na krok Tržby' }).click();
  await p.waitForTimeout(400);
  const doklady = nastroj.locator('[data-fotky-dokladu="terminal,zreport"]');
  tvrdi('U1 (390): krok Tržby má blok „Doklady k tržbě" s Vyfotit výpis z terminálu / Vyfotit Z-report', await doklady.getByRole('button', { name: 'Vyfotit výpis z terminálu' }).isVisible()
    && await doklady.getByRole('button', { name: 'Vyfotit Z-report' }).isVisible());
  const [vyber] = await Promise.all([p.waitForEvent('filechooser'), doklady.getByRole('button', { name: 'Vyfotit výpis z terminálu' }).click()]);
  await vyber.setFiles({ name: 'terminal.png', mimeType: 'image/png', buffer: PNG });
  tvrdi('U1 (390): fotka jde na POST /api/upload a objeví se náhled s druhem „terminál"', await dokud(() => stav.zapisy?.some(z => z.path === '/api/upload'), 4000)
    && await dokud(() => doklady.locator('li').count().then(n => n === 1), 3000) && /terminál/.test(await text(doklady)), (await text(doklady)).slice(0, 120));
  tvrdi('U1 (390): fotoaparát se otvírá přímo (capture=environment)', await doklady.locator('input[type=file]').getAttribute('capture') === 'environment');
  await p.screenshot({ path: SNIMKY + 'k84-uzaverky-doklady-390.png', fullPage: true });
  tvrdi('U1 (390): krok Tržby nepřetéká', await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);

  // Odeslání: tělo nese userId i jméno příjemce, fotku a self_payout = součet výplat.
  await nastroj.getByRole('button', { name: 'Přejít na krok Kontrola' }).click();
  await p.waitForTimeout(400);
  await nastroj.getByLabel('Skutečný stav kasy').first().fill('5000').catch(async () => { await nastroj.locator('input[required]').first().fill('5000'); });
  await nastroj.getByRole('button', { name: 'Odeslat uzávěrku' }).click();
  const post = await dokud(async () => stav.zapisy?.find(z => z.m === 'POST' && z.path === '/api/closings'), 5000);
  const pohyb = post?.telo?.movements?.[0];
  tvrdi('U1: POST /api/closings nese pohyb { kind: payout, amount: 1200, userId: 15, userName: Martin Nemeškal }', !!pohyb && pohyb.kind === 'payout' && pohyb.amount === 1200 && pohyb.userId === 15 && pohyb.userName === 'Martin Nemeškal', JSON.stringify(pohyb));
  tvrdi('U1: …selfPayout = 1 200 a photos[0].druh = terminal', post?.telo?.selfPayout === 1200 && post?.telo?.photos?.[0]?.druh === 'terminal' && /^\/api\/upload\//.test(post?.telo?.photos?.[0]?.url ?? ''), JSON.stringify({ s: post?.telo?.selfPayout, f: post?.telo?.photos }));
  tvrdi('U1: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// U1b — němčina 320: krok Výdaje s pilulkami bez přetečení.
{
  const { ctx, p } = await kontext({ role: 'employee', viewport: { width: 320, height: 700 }, mobil: true, fix: FIX_UZAVERKA, mineData: BARISTA, dalsi: podvrhUzaverky() });
  await nastavJazyk(p.context(), 'de');
  await p.goto(BASE + '/employee/shifts?view=closing', { waitUntil: 'networkidle' });
  await p.locator('[data-plocha="zamestnanec.uzaverka"] li[data-instance]:not([hidden])').first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(900);
  const nastroj = widgetLi(p, 'nastroj');
  const kroky = nastroj.locator('button[aria-label^="Zum Schritt"], button[title^="Zum Schritt"]');
  if (await kroky.count() >= 3) await kroky.nth(2).click(); else await nastroj.locator('button[aria-current], button[title]').nth(2).click().catch(() => {});
  await p.waitForTimeout(400);
  const payout = nastroj.getByRole('button', { name: /Auszahlung aus der Kasse|Výplata z kasy/ });
  if (await payout.count()) await payout.first().click();
  await p.waitForTimeout(300);
  tvrdi('U1b (320 de): krok Výdaje s příjemci výplaty nepřetéká', await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// U2 — vedení 1280 a 390: detail uzávěrky — výplaty po lidech, doklady, vlákno s @zmínkou
// ---------------------------------------------------------------------------
for (const [nazev, volby] of [['1280', { viewport: PC, mobil: false }], ['390', { viewport: TEL, mobil: true }]]) {
  const { ctx, p, stav, chyby } = await kontext({ ...volby, fix: FIX_UZAVERKY, dalsi: podvrhUzaverky({ closings: 'k69-b5a-closings' }) });
  await otevri(p, '/employer/overview?view=reports', 'vedeni.uzaverky');
  const nastroj = widgetLi(p, 'nastroj');
  await nastroj.locator('.list-row').first().scrollIntoViewIfNeeded();
  await nastroj.locator('.list-row').first().click();
  const d = dialog(p);
  tvrdi(`U2 (${nazev}): detail uzávěrky se otevře`, await dokud(() => d.getByText('Vyplněná čísla').isVisible().catch(() => false), 6000));
  const td = await text(d);
  tvrdi(`U2 (${nazev}): „Výplaty z kasy 2 000 Kč" rozepsané na Jakub Horák 1 200 Kč a Eva Testová 800 Kč`, /Výplaty z kasy/.test(td) && /Jakub Horák/.test(td) && /1 200 Kč/.test(td) && /800 Kč/.test(td), td.slice(0, 300).replace(/\n/g, ' | '));
  tvrdi(`U2 (${nazev}): pohyb „Výplata z kasy" nese jméno příjemce`, /Výplata z kasy\s*Jakub Horák/i.test(td.replace(/\n/g, ' ')), td.replace(/\n/g, ' | ').slice(0, 200));
  const doklady = d.locator('[data-doklady-uzaverky] li');
  tvrdi(`U2 (${nazev}): oddíl Doklady se dvěma náhledy (terminál, účtenka výdaje · mléko)`, await doklady.count() === 2 && /Výpis z terminálu/.test(td) && /Účtenka výdaje · mléko/.test(td));
  tvrdi(`U2 (${nazev}): náhled dokladu je odkaz na celou velikost`, (await d.locator('[data-doklady-uzaverky] a').first().getAttribute('href') ?? '').startsWith('/api/upload/'));
  const vlakno = d.locator('[data-poznamky-uzaverky]');
  await vlakno.scrollIntoViewIfNeeded();
  const tv = await text(vlakno);
  tvrdi(`U2 (${nazev}): vlákno poznámek pod detailem: „Poznámka vedení" připnutá první, pak poznámky z fixtury (2)`, (await vlakno.locator('[data-uvod-vlakna]').count()) === 1
    && /Proč manko 200\?/.test(tv) && (await vlakno.locator('[data-poznamka]').count()) === 2 && /Poznámky · 2/.test(tv), tv.slice(0, 200).replace(/\n/g, ' | '));
  tvrdi(`U2 (${nazev}): připnutá poznámka je první a zmínka @Eva Testová je zvýrazněná`, (await vlakno.locator('[data-poznamka]').first().getAttribute('data-pripnuta')) === 'true'
    && await vlakno.locator('[data-poznamka] span.font-semibold', { hasText: '@Eva Testová' }).count() === 1);
  // @zmínka: našeptávač z /api/teams, klepnutí vloží jméno, POST nese text se zmínkou.
  const pole = vlakno.getByLabel('Přidat poznámku');
  await pole.fill('Díky @Ev');
  await pole.press('End');
  const naseptavac = vlakno.locator('[data-zminky]');
  tvrdi(`U2 (${nazev}): „@Ev" nabídne Evu Testovou (řádek ≥ 44 px)`, await dokud(() => naseptavac.isVisible().catch(() => false), 3000) && /Eva Testová/.test(await text(naseptavac))
    && (await naseptavac.getByRole('button').first().evaluate(el => el.getBoundingClientRect().height)) >= 44, await text(naseptavac));
  await naseptavac.getByRole('button', { name: /Eva Testová/ }).click();
  tvrdi(`U2 (${nazev}): klepnutí vloží „@Eva Testová "`, await dokud(async () => (await pole.inputValue()).includes('@Eva Testová '), 1500), await pole.inputValue());
  await pole.fill((await pole.inputValue()) + 'za vysvětlení.');
  await vlakno.getByRole('button', { name: 'Přidat' }).click();
  const post = await dokud(async () => stav.zapisy?.find(z => z.m === 'POST' && z.path === '/api/notes'), 4000);
  tvrdi(`U2 (${nazev}): POST /api/notes { typ: closing, id otevřené uzávěrky, text s @Eva Testová }`, post?.telo?.typ === 'closing' && /^\d+$/.test(String(post?.telo?.id)) && /@Eva Testová/.test(post?.telo?.text ?? ''), JSON.stringify(post?.telo));
  tvrdi(`U2 (${nazev}): okno nepřetéká`, await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await p.screenshot({ path: SNIMKY + `k84-uzaverky-detail-${nazev}.png`, fullPage: nazev === '1280' });
  tvrdi(`U2 (${nazev}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// R1 — vedení 1280: widget Receptury (Změněno tento týden, Návrhy ke schválení → PATCH), historie, bublina
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_RECEPTURY, dalsi: podvrhReceptury() });
  await otevri(p, '/employer/overview?view=recipes', 'vedeni.receptury');
  const pokryti = widgetLi(p, 'receptury.pokryti');
  const radky = pokryti.locator('[data-receptury-radky]');
  tvrdi('R1 (1280): Pokrytí recepturou má řádky „Změněno tento týden · 2 receptury" a „Návrhy ke schválení · 1 · čeká"', await dokud(() => radky.isVisible().catch(() => false), 4000)
    && /Změněno tento týden[\s\S]*\n2\n\s*receptury/.test(await text(radky)) && /Návrhy ke schválení[\s\S]*\n1\n[\s\S]*čeká/.test(await text(radky)), (await text(radky)).replace(/\n/g, ' | '));
  tvrdi('R1 (1280): widget nemá limetku', await pokryti.locator('button.on-accent, .btn-accent').count() === 0);
  await radky.getByText('Návrhy ke schválení').click();
  const d = dialog(p);
  tvrdi('R1 (1280): okno Návrhy ke schválení — Espresso, Eva, důvod, „Káva zrnková: 9 g → 11 g", dopad 6,1 → 7,4 Kč (+1,3 Kč) a marže', await dokud(() => d.locator('[data-navrh]').count().then(n => n === 1), 4000)
    && /Espresso/.test(await text(d)) && /Eva Testová/.test(await text(d)) && /Káva zrnková: 9 g → 11 g/.test(await text(d)) && /6,1 Kč → 7,4 Kč \(\+1,3 Kč\)/.test(await text(d)) && /marže 89 % → 87 %/.test(await text(d)), (await text(d)).replace(/\n/g, ' | ').slice(0, 400));
  await p.screenshot({ path: SNIMKY + 'k84-receptury-navrhy-1280.png' });
  await d.getByRole('button', { name: 'Vrátit', exact: true }).click();
  tvrdi('R1 (1280): „Vrátit" chce poznámku — bez ní je „Vrátit s poznámkou" vypnuté', await dokud(() => d.getByRole('button', { name: 'Vrátit s poznámkou' }).isVisible().catch(() => false), 2000) && await d.getByRole('button', { name: 'Vrátit s poznámkou' }).isDisabled());
  await d.getByRole('button', { name: 'Zrušit' }).click();
  await d.getByRole('button', { name: 'Schválit' }).click();
  const patch = await dokud(async () => stav.zapisy?.find(z => z.m === 'PATCH' && z.path === '/api/pos/recipe-proposals'), 4000);
  tvrdi('R1 (1280): Schválit → PATCH /api/pos/recipe-proposals { id: 3, akce: schvalit }', patch?.telo?.id === 3 && patch?.telo?.akce === 'schvalit', JSON.stringify(patch?.telo));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);

  // Seznam: bublina počtu poznámek u Latte (3, nová → tučně), Chip „Návrh ke schválení" u Espressa.
  const nastroj = widgetLi(p, 'nastroj');
  const latte = nastroj.locator('.list-row', { hasText: 'Latte' }).first();
  tvrdi('R1 (1280): řádek Latte má bublinu „3 poznámky, nová" tučně', /3 poznámky, nová/.test(await text(latte)) && await latte.locator('.chip.font-bold').count() === 1, (await text(latte)).replace(/\n/g, ' | '));
  tvrdi('R1 (1280): řádek Espresso má Chip „Návrh ke schválení"', /Návrh ke schválení/.test(await text(nastroj.locator('.list-row', { hasText: 'Espresso' }).first())));
  await p.screenshot({ path: SNIMKY + 'k84-receptury-1280.png', fullPage: true });

  // Editor Latte: Historie · 2 změny → okno s rozdílem, Vrátit na tuto verzi.
  await latte.click();
  const historie = nastroj.locator('[data-historie-receptury]');
  tvrdi('R1 (1280): editor má „Historie · 2 změny" a odkaz na návod vede přes navigaci (tlačítko, ne natvrdo /employer)', await dokud(async () => /Historie · 2 změny/.test(await text(historie)), 4000)
    && await nastroj.locator('button[data-navod="12"]').count() === 1 && await nastroj.locator('a[href*="/employer/overview?view=guides"]').count() === 0, await text(historie));
  await historie.click();
  const h = dialog(p);
  const verze = h.locator('[data-verze]');
  tvrdi('R1 (1280): Historie receptury — 2 verze, nejnovější „platí", rozdíl „Káva zrnková: 9 g → 11 g", náklad 16 Kč (+3,2 Kč)', await dokud(() => verze.count().then(n => n === 2), 4000)
    && /platí/.test(await text(verze.first())) && /Káva zrnková: 9 g → 11 g/.test(await text(verze.first())) && /16 Kč/.test(await text(verze.first())) && /\+3,2 Kč/.test(await text(verze.first())), (await text(verze.first())).replace(/\n/g, ' | '));
  tvrdi('R1 (1280): u každé verze „Zobrazit", „Vrátit na tuto verzi" jen u starší', await h.getByRole('button', { name: 'Zobrazit' }).count() === 2 && await h.getByRole('button', { name: 'Vrátit na tuto verzi' }).count() === 1);
  await verze.nth(1).getByRole('button', { name: 'Zobrazit' }).click();
  tvrdi('R1 (1280): Zobrazit rozbalí suroviny verze (Mléko 2 dl, Káva 9 g)', await dokud(async () => /Mléko plnotučné · 2 dl/.test(await text(verze.nth(1))) && /Káva zrnková · 9 g/.test(await text(verze.nth(1))), 1500), (await text(verze.nth(1))).replace(/\n/g, ' | '));
  await p.screenshot({ path: SNIMKY + 'k84-receptury-historie-1280.png' });
  await h.getByRole('button', { name: 'Vrátit na tuto verzi' }).click();
  tvrdi('R1 (1280): Vrátit na tuto verzi načte verzi do editoru (bez tichého zápisu) a řekne, že platí až uložením', await dokud(() => nastroj.getByText('Načtená starší verze — platit začne, až ji uložíš.').isVisible().catch(() => false), 3000)
    && !stav.zapisy?.some(z => z.path === '/api/pos/products'));
  await nastroj.getByRole('button', { name: 'Uložit recepturu' }).click();
  const ulozeni = await dokud(async () => stav.zapisy?.find(z => z.m === 'POST' && z.path === '/api/pos/products'), 4000);
  tvrdi('R1 (1280): uložení pošle note „Vráceno na verzi z …" a costPerPortion', /^Vráceno na verzi z /.test(ulozeni?.telo?.note ?? '') && typeof ulozeni?.telo?.costPerPortion !== 'undefined', JSON.stringify(ulozeni?.telo));
  tvrdi('R1 (1280): bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// R2 — zaměstnanec 390 jen s receptury.navrhnout: Navrhnout změnu + Proč → POST, stav Chipem
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', viewport: TEL, mobil: true, fix: FIX_RECEPTURY_ZAM, mineData: NAVRHOVATEL, dalsi: podvrhReceptury({ navrhy: 'k84-uzaverky-proposals-moje' }) });
  await otevri(p, '/employee/shifts?view=recipes', 'zamestnanec.receptury');
  const pokryti = widgetLi(p, 'receptury.pokryti');
  tvrdi('R2 (390): widget ukáže „Moje návrhy · 2 · 1 čeká · 1 vráceno" (bez práva schvalovat)', await dokud(async () => /Moje návrhy/.test(await text(pokryti)), 4000) && /1 čeká/.test(await text(pokryti)) && /1 vráceno/.test(await text(pokryti)), (await text(pokryti)).replace(/\n/g, ' | '));
  const nastroj = widgetLi(p, 'nastroj');
  await nastroj.locator('.list-row', { hasText: 'Latte' }).first().click();
  const navrhnout = nastroj.getByRole('button', { name: 'Navrhnout změnu' });
  tvrdi('R2 (390): editor místo „Uložit recepturu" nabízí „Navrhnout změnu" (jediná limetka) + pole Proč', await dokud(() => navrhnout.isVisible().catch(() => false), 4000)
    && await nastroj.getByRole('button', { name: 'Uložit recepturu' }).count() === 0 && await nastroj.getByLabel('Proč').count() === 1
    && await p.locator('[data-plocha] button.on-accent:visible, [data-plocha] .btn-accent:visible').count() === 1);
  tvrdi('R2 (390): stav vlastního návrhu k Latte — Chip „Čeká"', (await nastroj.locator('[data-stav-navrhu="ceka"]').count()) === 1 && /Čeká/.test(await text(nastroj.locator('[data-stav-navrhu]'))));
  tvrdi('R2 (390): bez Proč je Navrhnout změnu vypnuté', await navrhnout.isDisabled());
  const mnozstvi = nastroj.getByLabel('Množství').nth(1);
  await mnozstvi.scrollIntoViewIfNeeded();
  await mnozstvi.fill('11');
  await nastroj.getByLabel('Proč').fill('Nová káva je slabší.');
  tvrdi('R2 (390): pole Proč má písmo ≥ 16 px (bez zoomu při fokusu)', (await nastroj.getByLabel('Proč').evaluate(el => parseFloat(getComputedStyle(el).fontSize))) >= 16);
  tvrdi('R2 (390): editor nepřetéká', await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);
  await p.screenshot({ path: SNIMKY + 'k84-receptury-navrh-390.png', fullPage: true });
  await navrhnout.click();
  const post = await dokud(async () => stav.zapisy?.find(z => z.m === 'POST' && z.path === '/api/pos/recipe-proposals'), 4000);
  tvrdi('R2 (390): Navrhnout změnu → POST /api/pos/recipe-proposals { productId: p1, reason, ingredients s kávou 0,011 kg }', post?.telo?.productId === 'p1' && post?.telo?.reason === 'Nová káva je slabší.'
    && post?.telo?.ingredients?.some(i => i.itemId === 2 && Math.abs(i.amount - 0.011) < 1e-9), JSON.stringify(post?.telo));
  tvrdi('R2 (390): po odeslání Toast „Návrh odeslán…"', await dokud(() => p.getByText('Návrh odeslán — vedení dostalo oznámení a rozhodne.').isVisible().catch(() => false), 3000));
  tvrdi('R2 (390): bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

await konec();
