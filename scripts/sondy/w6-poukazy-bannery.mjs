// W6 — správa bannerů (plán s dny a hodinami, jazykové mutace) a hostovská strana (Moje poukazy, propadlá razítková
// karta v Moje, „Přidat do mé aplikace“). Ruční sonda (MIMO v spust.mjs): API podvrhuje. Na 390 a 1280 px bez vodorovného scrollu.
//   NEXTAUTH_SECRET=… SONDY_ZAKLAD=http://localhost:3414 node scripts/sondy/w6-poukazy-bannery.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, tokenPro, DIR } from './k68-spolecne.mjs';

const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
const nacti = (j) => JSON.parse(readFileSync(DIR + j + '.json', 'utf8'));
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---------------------------------------------------------------------------
// Správa bannerů: plán a překlady
// ---------------------------------------------------------------------------
for (const sirka of [1280, 390]) {
  const L = `správa ${sirka}`;
  const radky = [
    { id: 1, title: 'Snídaňové menu', text: '', image_url: null, link_kind: 'menu', link_ref: null, active: true, valid_since: null, valid_until: null, position: 0, target_kind: 'all', target_ref: null, archived: false,
      days_of_week: [1, 2, 3, 4, 5], hour_from: '08:00', hour_till: '11:00', i18n: { en: { title: 'Breakfast menu', text: '' } } },
    { id: 2, title: 'Bez plánu', text: '', image_url: null, link_kind: 'none', link_ref: null, active: true, valid_since: null, valid_until: null, position: 1, target_kind: 'all', target_ref: null, archived: false,
      days_of_week: [], hour_from: null, hour_till: null, i18n: {} },
  ];
  const volani = [];
  const dalsi = (req, json) => {
    const path = new URL(req.url()).pathname; const m = req.method();
    if (path === '/api/client/admin/profile') return json({ profile: nacti('client_admin_profile').profile ?? nacti('client_admin_profile'), url: 'http://x/client/lipa' });
    if (path === '/api/client/admin/banners') {
      if (m === 'GET') return json({
        banners: radky, events: [], coupons: [], campaigns: [], groups: [], urovne: { bronze: 'Bronzový', silver: 'Stříbrný', gold: 'Zlatý', platinum: 'Platinový' },
        statistiky: {}, dniStatistiky: 30, dnes: '2026-10-05', kdy: { dow: 1, hhmm: '12:00' },
      });
      const body = req.postDataJSON?.() ?? null;
      volani.push({ m, body });
      if (m === 'POST') return json({ ok: true, banner: { id: 9, position: 2, ...body, image_url: null, link_ref: null, archived: false } });
      if (m === 'PATCH' && body?.id) return json({ ok: true, banner: { ...radky.find(r => r.id === body.id), ...body } });
      return json({ ok: true });
    }
    return undefined;
  };
  const { ctx, p, chyby } = await kontext({ viewport: { width: sirka, height: 950 }, mobil: sirka < 500, fix: nacti('k69-b8-rozlozeni-klient'), dalsi });
  await p.goto(BASE + '/employer/overview?mode=client&tab=brand', { waitUntil: 'networkidle' });
  await p.getByRole('heading', { name: 'Bannery' }).waitFor({ timeout: 15000 });
  await p.waitForTimeout(500);
  const r1 = await p.locator('[data-banner-row="1"]').innerText();
  tvrdi(`${L}: v seznamu je plán „po–pá 08:00–11:00“`, r1.includes('po–pá 08:00–11:00'), r1);
  tvrdi(`${L}: v pondělí ve 12:00 je banner mimo plán`, r1.includes('mimo plán'), r1);
  tvrdi(`${L}: počet překladů v seznamu`, r1.includes('překlady: 1'), r1);
  tvrdi(`${L}: banner bez plánu se vidí`, (await p.locator('[data-banner-row="2"]').innerText()).includes('vidí se'));

  // Nový banner: neúplné hodiny se neodešlou, pak plán + překlad.
  await p.getByRole('button', { name: 'Nový banner' }).click();
  await p.getByLabel('Nadpis', { exact: true }).fill('Večerní hudba');
  await p.getByRole('button', { name: 'Pá', exact: true }).click();
  await p.getByRole('button', { name: 'So', exact: true }).click();
  await p.getByLabel('Od hodiny').fill('22:00');
  await p.waitForTimeout(150);
  tvrdi(`${L}: neúplné hodiny hlásí chybu`, (await p.locator('body').innerText()).includes('Hodiny vyplň obě'));
  await p.getByRole('button', { name: 'Přidat banner' }).click();
  await p.waitForTimeout(300);
  tvrdi(`${L}: banner s neúplnými hodinami se neodešle`, !volani.some(v => v.m === 'POST'));
  await p.getByLabel('Do hodiny').fill('02:00');
  await p.waitForTimeout(150);
  const text = await p.locator('body').innerText();
  tvrdi(`${L}: věta o plánu a půlnoci`, /pá, so 22:00–02:00/.test(text) && /přes půlnoc/.test(text), text.slice(-600));
  await p.getByRole('button', { name: /Angličtina/ }).click();
  await p.getByLabel('Nadpis (angličtina)').fill('Live music');
  tvrdi(`${L}: formulář s plánem a překlady bez vodorovného scrollu`, await bezPreteceni(p));
  await p.getByRole('button', { name: 'Přidat banner' }).click();
  await p.waitForTimeout(400);
  const post = volani.find(v => v.m === 'POST');
  tvrdi(`${L}: POST nese dny, hodiny a překlad`, JSON.stringify(post?.body?.days_of_week) === '[5,6]' && post?.body?.hour_from === '22:00' && post?.body?.hour_till === '02:00' && post?.body?.i18n?.en?.title === 'Live music', JSON.stringify(post));
  await p.screenshot({ path: new URL(`./shots/w6-bannery-${sirka}.png`, import.meta.url).pathname, fullPage: true }).catch(() => {});
  tvrdi(`${L}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Hostovská strana: Moje poukazy, propadlá karta
// ---------------------------------------------------------------------------
const me = nacti('client_me');
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
for (const sirka of [390, 1280]) {
  const L = `moje ${sirka}`;
  const odebrano = [];
  const ctx = await b.newContext({ viewport: { width: sirka, height: 900 }, locale: 'cs-CZ' });
  const DATA = {
    ...me,
    poukazy: [
      { id: 7, code: 'DP-ABCD-2345', balance: 300, value: 500, currency: 'CZK', validUntil: '2027-01-31', stav: 'active', design: 'vanoce', business: 'Kavárna U Lípy', slug: 'kavarna-u-lipy' },
      { id: 8, code: 'DP-WXYZ-9876', balance: 0, value: 200, currency: 'CZK', validUntil: null, stav: 'used', design: 'klasik', business: 'Kavárna U Lípy', slug: 'kavarna-u-lipy' },
    ],
    memberships: (me.memberships ?? []).map((m, i) => i === 0 ? {
      ...m, expiring: { points: 40, till: '2026-10-20' },
      campaigns: [{ id: 1, name: 'Osmá káva zdarma', required: 8, reward: 'Káva zdarma', stamps: 0, completed: 0, expiresAt: null, expiredCount: 5, expiredAt: '2026-10-01' }],
    } : m),
  };
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro('customer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', route => {
    const u = new URL(route.request().url());
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/api/client/me/poukazy' && route.request().method() === 'DELETE') { odebrano.push(route.request().postDataJSON()); return json({ ok: true }); }
    if (u.pathname === '/api/client/me') return json(DATA);
    if (u.pathname === '/api/client/card') return json(nacti('client_card'));
    if (u.pathname === '/api/client/reviews') return json({ pending: [] });
    return json([]);
  });
  const chyby = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => chyby.push(String(e)));
  await p.goto(`${BASE}/client/me`, { waitUntil: 'networkidle' });
  await p.getByRole('heading', { name: 'Moje poukazy' }).waitFor({ timeout: 15000 });
  const t = await p.locator('body').innerText();
  tvrdi(`${L}: poukaz s kódem, zůstatkem a platností`, /DP-ABCD-2345/.test(t) && /Zůstatek\s*300/.test(t) && /platí do/.test(t), t.slice(0, 400));
  tvrdi(`${L}: vyčerpaný poukaz zůstává vidět se stavem`, /Vyčerpaný/.test(t));
  tvrdi(`${L}: propadlá razítková karta`, /Karta vypršela a razítka propadla \(5\)/.test(t), t.slice(0, 600));
  tvrdi(`${L}: body, které brzy propadnou`, /40 bodů propadne do/.test(t));
  tvrdi(`${L}: bez vodorovného scrollu`, await bezPreteceni(p));
  // Odebrání z aplikace: nejdřív potvrzení, teprve pak zápis.
  await p.getByRole('button', { name: 'Odebrat z aplikace' }).first().click();
  tvrdi(`${L}: odebrání se nejdřív zeptá`, odebrano.length === 0 && /Poukaz zůstane platný/.test(await p.locator('body').innerText()));
  await p.getByRole('button', { name: 'Ponechat' }).first().click();
  tvrdi(`${L}: „Ponechat“ nic nezapíše`, odebrano.length === 0);
  await p.getByRole('button', { name: 'Odebrat z aplikace' }).first().click();
  await p.getByRole('button', { name: 'Odebrat', exact: true }).click();
  await p.waitForTimeout(300);
  tvrdi(`${L}: potvrzené odebrání pošle id poukazu`, odebrano.length === 1 && odebrano[0].id === 7 || odebrano[0]?.id === 8, JSON.stringify(odebrano));
  await p.screenshot({ path: new URL(`./shots/w6-moje-${sirka}.png`, import.meta.url).pathname, fullPage: true }).catch(() => {});
  tvrdi(`${L}: bez chyb stránky`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
await b.close();
await konec();
