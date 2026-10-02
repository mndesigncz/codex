// W5 — hostovská strana (platnost kuponů, doba na dokončení karty, „jak získat body“, historie po stránkách,
// statistika bannerů) a správa bannerů (cílení, kupon/karta, koncept, archiv, duplikace, statistika).
// Ruční sonda (MIMO v spust.mjs): API podvrhuje. Na 390 a 1280 px bez vodorovného scrollu.
//   NEXTAUTH_SECRET=… SONDY_ZAKLAD=http://localhost:3414 node scripts/sondy/w5-host-bannery.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, FIX_DOMU, roleMine, DIR } from './k68-spolecne.mjs';

const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
const nacti = (j) => JSON.parse(readFileSync(DIR + j + '.json', 'utf8'));
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const plus = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// ---------------------------------------------------------------------------
// Hostovská strana
// ---------------------------------------------------------------------------
const fix = nacti('client_b_kavarna-u-lipy');
const DNES = fix.today;
const polozky = (od, n) => Array.from({ length: n }, (_, i) => ({
  key: `l${od + i}`, typ: i % 3 === 0 ? 'stamp' : i % 3 === 1 ? 'points_earned' : 'points_spent_coupon', at: `${DNES}T10:00:00Z`,
  points: i % 3 === 0 ? 0 : i % 3 === 1 ? 12 : -50, credit: 0, title: i % 3 === 2 ? 'Filtr dne zdarma' : null, business: 'Kavárna U Lípy', slug: 'kavarna-u-lipy', currency: 'CZK',
}));
const HOST = {
  ...fix,
  business: { ...fix.business, birthdayPoints: 50, referralPoints: 20, pointsExpireDays: 180 },
  stampCampaigns: [{ id: 1, name: 'Osmá káva zdarma', description: '', required: 8, reward: 'Káva zdarma' }],
  coupons: [
    { id: 1, title: 'Filtr dne zdarma', cost_points: 200, valid_until: plus(DNES, 3), benefit: null, badges: [], blocked: null },
    { id: 2, title: 'Sleva 20 % na dort', cost_points: 120, valid_until: plus(DNES, 90), benefit: null, badges: [], blocked: null },
  ],
  me: {
    member: true, points: 320, stamps: 6, visits: 18, credit: 0, level: 'silver', levelLabel: 'Stříbrný', discount: 5,
    campaigns: [{ id: 1, name: 'Osmá káva zdarma', description: '', required: 8, reward: 'Káva zdarma', stamps: 6, completed: 0, expired: false, expiredStamps: 0, finishBy: plus(DNES, 25), daysLeft: 25 }],
    claims: [{ id: 5, code: 'ABC-123', claimed_at: `${DNES}T09:00:00Z`, redeemed_at: null, title: 'Káva zdarma', valid_until: plus(DNES, 3) }],
    reservations: [],
  },
  signedIn: true,
  banners: [{ id: 41, title: 'Dvojnásobné body', text: 'Víkend', imageUrl: null, linkKind: 'coupon', linkRef: '1' }],
};

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
for (const sirka of [390, 1280]) {
  const L = `host ${sirka}`;
  const udalosti = []; const historie = [];
  const ctx = await b.newContext({ viewport: { width: sirka, height: 900 }, locale: 'cs-CZ' });
  await ctx.route('**/api/**', route => {
    const u = new URL(route.request().url());
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/api/client/me/historie') {
      historie.push(u.search);
      const strana = Number(u.searchParams.get('strana') ?? 1);
      return json({ polozky: strana === 1 ? polozky(0, 20) : polozky(20, 3), dalsi: strana === 1, strana, naStranu: 20 });
    }
    if (u.pathname.endsWith('/banner-event')) { udalosti.push(route.request().postDataJSON()); return json({ ok: true }); }
    if (u.pathname.startsWith('/api/client/b/')) return json(HOST);
    return json([]);
  });
  const chyby = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => chyby.push(String(e)));
  await p.goto(`${BASE}/client/kavarna-u-lipy`, { waitUntil: 'networkidle' });
  await p.waitForSelector('h1');
  await p.waitForTimeout(300);
  tvrdi(`${L}: banner se počítá jako zobrazený právě jednou`, udalosti.filter(x => x.type === 'view' && x.id === 41).length === 1, JSON.stringify(udalosti));
  const hlava = await p.locator('section').first().innerText();
  tvrdi(`${L}: legacy „x/8 razítek“ je při kampaních skryté`, !/6\/8 razítek/.test(hlava), hlava.replace(/\n/g, ' | '));
  await p.locator('[data-banner="41"]').getByRole('button', { name: 'Ukázat kupon', exact: true }).click();
  await p.waitForTimeout(500);
  tvrdi(`${L}: proklik banneru se zapsal`, udalosti.some(x => x.type === 'click' && x.id === 41), JSON.stringify(udalosti));
  tvrdi(`${L}: banner na kupon otevřel Věrnost`, await p.getByRole('tab', { name: /Věrnost/ }).getAttribute('aria-selected') === 'true');
  const text = await p.locator('body').innerText();
  tvrdi(`${L}: kupon, který brzy končí, má „Vyprší za 3 dny“`, /Vyprší za 3 dny/.test(text), text.slice(0, 200));
  tvrdi(`${L}: vyzvednutý kupon má platnost`, (text.match(/Vyprší za 3 dny/g) ?? []).length >= 2);
  tvrdi(`${L}: dálku platnosti ukáže jako „Platí do“`, /Platí do/.test(text));
  tvrdi(`${L}: kdy karta vyprší`, /Dosbírej kartu do/.test(text));
  tvrdi(`${L}: „Jak získat body a odměny“`, /jak získat body a odměny/i.test(text) && /Za každých 100\s*Kč útraty dostaneš 10 bodů/.test(text) && /Na narozeniny dostaneš 50 bodů/.test(text), text.slice(-900));
  tvrdi(`${L}: bez vodorovného scrollu`, await bezPreteceni(p));
  tvrdi(`${L}: historie se bez rozbalení nestahuje`, historie.length === 0, JSON.stringify(historie));
  await p.getByText('Historie bodů a kuponů').click();
  await p.locator('details li').nth(19).waitFor({ timeout: 5000 });
  tvrdi(`${L}: historie má 20 záznamů a omezuje na podnik`, (await p.locator('details li').count()) >= 20 && historie[0].includes('slug=kavarna-u-lipy'), `${await p.locator('details li').count()} ${historie.join(' ')}`);
  tvrdi(`${L}: v historii je název kuponu, ne interní poznámka`, /Kupon za body: Filtr dne zdarma/.test(await p.locator('body').innerText()));
  await p.getByRole('button', { name: 'Načíst další' }).click();
  await p.waitForTimeout(400);
  tvrdi(`${L}: druhá strana se přidá a tlačítko zmizí`, (await p.locator('details li').count()) >= 23 && await p.getByRole('button', { name: 'Načíst další' }).count() === 0);
  tvrdi(`${L}: bez vodorovného scrollu s historií`, await bezPreteceni(p));
  await p.screenshot({ path: new URL(`./shots/w5-host-${sirka}.png`, import.meta.url).pathname, fullPage: true }).catch(() => {});
  tvrdi(`${L}: bez chyb stránky`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
await b.close();

// ---------------------------------------------------------------------------
// Správa bannerů
// ---------------------------------------------------------------------------
for (const sirka of [1280, 390]) {
  const L = `správa ${sirka}`;
  const radky = [
    { id: 1, title: 'Páteční degustace', text: '', image_url: null, link_kind: 'menu', link_ref: null, active: true, valid_since: null, valid_until: null, position: 0, target_kind: 'all', target_ref: null, archived: false },
    { id: 2, title: 'Jen pro zlaté', text: '', image_url: null, link_kind: 'none', link_ref: null, active: true, valid_since: null, valid_until: null, position: 1, target_kind: 'level', target_ref: 'gold', archived: false },
    { id: 3, title: 'Loňské Vánoce', text: '', image_url: null, link_kind: 'none', link_ref: null, active: false, valid_since: null, valid_until: null, position: 2, target_kind: 'all', target_ref: null, archived: true },
  ];
  const volani = [];
  const dalsi = (req, json) => {
    const path = new URL(req.url()).pathname; const m = req.method();
    if (path === '/api/client/admin/profile') return json({ profile: nacti('client_admin_profile').profile ?? nacti('client_admin_profile'), url: 'http://x/client/lipa' });
    if (path === '/api/client/admin/banners') {
      if (m === 'GET') return json({
        banners: radky, events: [], coupons: [{ id: 12, title: 'Filtr dne zdarma' }], campaigns: [{ id: 3, name: 'Osmá káva zdarma' }], groups: [{ id: 4, name: 'Štamgasti' }],
        urovne: { bronze: 'Bronzový', silver: 'Stříbrný', gold: 'Zlatý', platinum: 'Platinový' },
        statistiky: { 1: { zobrazeni: 120, kliky: 9, proklikovost: 7.5 } }, dniStatistiky: 30, dnes: '2026-10-01',
      });
      const body = req.postDataJSON?.() ?? null;
      volani.push({ m, body });
      if (m === 'POST') return json({ ok: true, banner: { id: 9, position: 3, ...body, image_url: null, link_ref: body.link_ref || null, archived: false } });
      if (m === 'PATCH' && body?.action === 'duplicate') return json({ ok: true, banner: { ...radky[0], id: 10, title: 'Páteční degustace (kopie)', active: false, position: 3 } });
      if (m === 'PATCH' && body?.action) return json({ ok: true, banner: { ...radky.find(r => r.id === body.id), archived: body.action === 'archive', active: false } });
      if (m === 'PATCH' && body?.id) return json({ ok: true, banner: { ...radky.find(r => r.id === body.id), ...body } });
      return json({ ok: true });
    }
    return undefined;
  };
  const { ctx, p, chyby } = await kontext({ viewport: { width: sirka, height: 950 }, mobil: sirka < 500, fix: nacti('k69-b8-rozlozeni-klient'), dalsi });
  await p.goto(BASE + '/employer/overview?mode=client&tab=brand', { waitUntil: 'networkidle' });
  await p.getByRole('heading', { name: 'Bannery' }).waitFor({ timeout: 15000 });
  await p.waitForTimeout(500);
  tvrdi(`${L}: v seznamu jsou dva aktivní, archivovaný zvlášť`, await p.locator('ul[aria-label="Seznam bannerů"] [data-banner-row]').count() === 2 && await p.locator('[data-banner-row="3"]').count() === 1);
  tvrdi(`${L}: statistika banneru (zobrazení, prokliky, proklikovost)`, (await p.locator('[data-banner-stat="1"]').innerText()).includes('120 zobrazení · 9 prokliků · 7,5 %'), await p.locator('[data-banner-stat="1"]').innerText());
  tvrdi(`${L}: banner bez dat má „Zatím bez zobrazení“`, (await p.locator('[data-banner-stat="2"]').innerText()).includes('Zatím bez zobrazení'));
  tvrdi(`${L}: cílení je vidět v seznamu`, (await p.locator('[data-banner-row="2"]').innerText()).includes('Úroveň: Zlatý'));
  tvrdi(`${L}: bez vodorovného scrollu`, await bezPreteceni(p));

  // Řazení posílá VŠECHNA id podniku (i archivovaná).
  await p.locator('[data-banner-row="2"]').getByRole('button', { name: /výš/ }).click();
  await p.waitForTimeout(250);
  tvrdi(`${L}: pořadí obsahuje i archivovaný banner`, JSON.stringify(volani.find(v => v.body?.order)?.body?.order) === '[2,1,3]', JSON.stringify(volani.find(v => v.body?.order)));

  // Duplikace, archiv, návrat z archivu.
  await p.locator('[data-banner-row="1"]').getByRole('button', { name: /Duplikovat/ }).click();
  await p.waitForTimeout(250);
  tvrdi(`${L}: duplikace pošle action duplicate`, volani.some(v => v.body?.action === 'duplicate' && v.body?.id === 1));
  tvrdi(`${L}: kopie je v seznamu jako koncept`, (await p.locator('[data-banner-row="10"]').innerText()).includes('Páteční degustace (kopie)') && (await p.locator('[data-banner-row="10"]').innerText()).includes('vypnutý'));
  await p.locator('[data-banner-row="2"]').getByRole('button', { name: /Archivovat/ }).click();
  await p.waitForTimeout(250);
  tvrdi(`${L}: archivace pošle action archive`, volani.some(v => v.body?.action === 'archive' && v.body?.id === 2));
  await p.getByText(/^Archiv \(/).click();
  await p.locator('[data-banner-row="3"]').getByRole('button', { name: 'Vrátit z archivu' }).click();
  await p.waitForTimeout(250);
  tvrdi(`${L}: návrat z archivu pošle action restore`, volani.some(v => v.body?.action === 'restore' && v.body?.id === 3));

  // Formulář: cílení na úroveň musí mít úroveň, odkaz na kupon, koncept.
  await p.getByRole('button', { name: 'Nový banner' }).click();
  await p.getByLabel('Nadpis').fill('Pro zlaté hosty');
  await p.getByLabel('Komu se ukáže').selectOption('level');
  await p.getByRole('button', { name: 'Přidat banner' }).click();
  await p.waitForTimeout(300);
  tvrdi(`${L}: cílení na úroveň bez úrovně se neodešle`, !volani.some(v => v.m === 'POST'));
  await p.getByLabel('Úroveň', { exact: true }).selectOption('gold');
  await p.getByLabel('Kam banner vede').selectOption('coupon');
  await p.getByLabel('Kupon', { exact: true }).selectOption('12');
  tvrdi(`${L}: formulář s cílením bez vodorovného scrollu`, await bezPreteceni(p));
  await p.getByRole('switch', { name: 'Ukazovat hostům' }).click();
  await p.getByRole('button', { name: 'Uložit koncept' }).click();
  await p.waitForTimeout(400);
  const post = volani.find(v => v.m === 'POST');
  tvrdi(`${L}: POST nese cílení, kupon a koncept`, post?.body?.target_kind === 'level' && post?.body?.target_ref === 'gold' && post?.body?.link_kind === 'coupon' && post?.body?.link_ref === '12' && post?.body?.active === false, JSON.stringify(post));
  await p.screenshot({ path: new URL(`./shots/w5-bannery-${sirka}.png`, import.meta.url).pathname, fullPage: true }).catch(() => {});
  tvrdi(`${L}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
await konec();
