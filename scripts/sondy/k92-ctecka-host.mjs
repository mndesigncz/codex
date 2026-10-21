// Kolo 92 (ověření): čtečka u kasy ↔ host — přibalená odměna a živá odezva od začátku do konce.
//
// Dva prohlížeče nad JEDNÍM podvrženým serverem (stav v téhle sondě): host (Managero client, „U kasy")
// a obsluha (/employer/ctecka). Server se chová podle kontraktu klient/kontrakt-ctecka.md:
// záměr hosta (me/zamer), čtečka ho vrací v staff/scan, akce zapisují do „deníků" a host je čte
// přes card/stav?od=<kurzor>.
//  E1 Host v „U kasy" přibalí připravenou odměnu → PUT me/zamer { slug, claimId }.
//  E2 Čtečka po načtení karty ukáže „Host chce uplatnit: …" a hlavní akci „Uplatnit … a přidat razítko".
//  E3 Obsluha nastaví 2 razítka a dá jednu akci → POST staff/scan stamp, POST stamps/member { delta: 1 }
//     (razítko navíc = ruční úprava s důvodem), POST admin/redeem { code } — v tomhle pořadí, každé jednou.
//  E4 Host to vidí živě v tom samém listu, i když druhá půlka (razítko navíc z ruční úpravy a uplatnění)
//     přijde až v dalším dotazu na card/stav: „+2", „7 / 8" a „Uplatněno: …". Dřív se po první události
//     přestal ptát a ruční razítko (kind manual) server do odezvy vůbec nebral.
//  Obě strany bez vodorovného posuvu, bez chyb v konzoli; 390 (host, dotyk) + 1280 (čtečka).
//   SONDY_ZAKLAD=http://localhost:3000 node scripts/sondy/k92-ctecka-host.mjs
import { mkdirSync } from 'node:fs';
import { browser, kontext, tvrdi, konec, dokud, BASE, OUT, tokenPro } from './k68-spolecne.mjs';
import { klientFixtury } from '../../apps/scripts/fixtury-klient.mjs';

const SNIMKY = process.env.SONDY_SNIMKY ? process.env.SONDY_SNIMKY.replace(/\/?$/, '/') : OUT;
mkdirSync(SNIMKY, { recursive: true });
const fix = klientFixtury('2026-10-14');

// ---- Sdílený „server" ----
const svet = {
  kurzor: 1,
  fronta: [], // { n, ...UdalostKasy }
  zamer: null, // { teamId, claimId, expiresAt }
  claim: { id: 5, code: 'FIL-0005', title: 'Filtr dne jako odměna', slug: 'kavarna-u-lipy', business: 'Kavárna U Lípy', kind: 'stamps', redeemed_at: null, valid_until: '2026-12-31' },
  kampan: { id: 1, name: 'Osmá káva jako odměna', required: 8, stamps: 5, reward: 'Káva' },
  zapisy: [],
};
const PODNIK = { teamId: 1, slug: 'kavarna-u-lipy', podnik: 'Kavárna U Lípy', accent: '#3E5406' };
const at = () => new Date().toISOString();
const udalost = (u) => svet.fronta.push({ n: ++svet.kurzor, ...PODNIK, at: at(), ...u });
const kartaTed = () => ({ id: svet.kampan.id, nazev: svet.kampan.name, razitka: svet.kampan.stamps, cil: svet.kampan.required, odmena: svet.kampan.reward });

function meHosta() {
  const me = JSON.parse(JSON.stringify(fix.me));
  me.memberships = [
    { ...me.memberships[0], teamId: 1, slug: PODNIK.slug, name: PODNIK.podnik, accent: PODNIK.accent, loyaltyOn: true,
      campaigns: [{ id: svet.kampan.id, name: svet.kampan.name, required: svet.kampan.required, stamps: svet.kampan.stamps, reward: svet.kampan.reward }] },
  ];
  me.claims = svet.claim.redeemed_at ? [] : [svet.claim];
  return me;
}

async function kontextHosta() {
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro('customer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', route => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname; const m = req.method();
    const ok = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p.startsWith('/api/auth/')) {
      if (p === '/api/auth/session') return ok({ user: { id: '18', name: fix.me.customer.name, email: fix.me.customer.email, role: 'customer' }, expires: '2099-01-01T00:00:00.000Z' });
      return route.continue();
    }
    if (p === '/api/client/me/zamer') {
      if (m === 'PUT') {
        const t = JSON.parse(req.postData() || '{}'); svet.zapisy.push({ kdo: 'host', m, p, ...t });
        if (t.claimId !== svet.claim.id || t.slug !== PODNIK.slug) return ok({ error: 'Tahle odměna tu není.' }, 409);
        svet.zamer = { teamId: 1, claimId: t.claimId, expiresAt: new Date(Date.now() + 7200_000).toISOString() };
      }
      if (m === 'DELETE') { svet.zapisy.push({ kdo: 'host', m, p }); svet.zamer = null; }
      return ok({ ok: true, zamery: svet.zamer ? [svet.zamer] : [] });
    }
    if (p === '/api/client/card/stav') {
      const od = Number(u.searchParams.get('od') ?? 0);
      const udalosti = od ? svet.fronta.filter(x => x.n > od).map(({ n, ...x }) => x) : [];
      svet.dotazyStavu = (svet.dotazyStavu ?? 0) + 1;
      if (udalosti.length) { svet.doruceno = [...(svet.doruceno ?? []), ...udalosti.map(x => x.id)]; (svet.davky ??= []).push(udalosti.map(x => x.id)); }
      return ok({ kurzor: String(svet.kurzor), udalosti });
    }
    if (p === '/api/client/me') return ok(meHosta());
    if (p === '/api/client/card') return ok({ ...fix.card, code: 'ABCD-EFGH' });
    if (p === '/api/client/businesses') return ok(fix.businesses);
    const b2 = /^\/api\/client\/b\/([^/]+)$/.exec(p);
    if (b2) return fix.b[b2[1]] ? ok(fix.b[b2[1]]) : ok({ error: 'nenalezeno' }, 404);
    return ok({});
  });
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', e => chyby.push(String(e)));
  p.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) chyby.push(msg.text()); });
  return { ctx, p, chyby };
}

function hostCtecky() {
  return {
    customer: { id: 101, name: fix.me.customer.name }, member: true, points: 320, credit: 0, stamps: 0, visits: 18, spend: 5400,
    campaigns: [{ id: svet.kampan.id, name: svet.kampan.name, required: svet.kampan.required, ruleType: 'visit', stamps: svet.kampan.stamps, reward: svet.kampan.reward }],
    tierBy: 'visits', levelLabel: 'Stříbrný', tier: 'silver', discount: 0, discountSource: null, discountName: null, tierDiscount: 0,
    nextTierAt: 20, nextTierLabel: 'Zlatý', nextTierUnit: 'visits', stampedToday: svet.stampedToday === true, birthdayToday: false,
    lastVisit: new Date(Date.now() - 3 * 86400000).toISOString(),
    openCoupons: svet.claim.redeemed_at ? [] : [{ code: svet.claim.code, title: svet.claim.title, kind: 'stamps', fromStamps: true, validUntil: svet.claim.valid_until, benefit: null }],
    affordable: [], bills: [], rules: { pointsPer100: 10, stampTarget: 8, stampReward: 'Káva', cashbackPct: 0 },
    accent: PODNIK.accent, podnik: PODNIK.podnik,
    zamer: svet.zamer && !svet.claim.redeemed_at ? { claimId: svet.claim.id, code: svet.claim.code, title: svet.claim.title, benefit: null, fromStamps: true, validUntil: svet.claim.valid_until, createdAt: at(), expiresAt: svet.zamer.expiresAt } : null,
  };
}

/** Obsluha API čtečky nad sdíleným stavem. Razítko navíc odpovídá až po 3 s, ať druhá půlka zápisů přijde hostovi v dalším dotazu. */
function apiCtecky(req, json) {
  const u = new URL(req.url()); const m = req.method();
  if (u.pathname === '/api/client/staff/scan' && m === 'GET') { svet.zapisy.push({ kdo: 'ctecka', m, p: u.pathname, code: u.searchParams.get('code') }); return json(hostCtecky()); }
  if (u.pathname === '/api/client/staff/scan' && m === 'POST') {
    const b = JSON.parse(req.postData() || '{}'); svet.zapisy.push({ kdo: 'ctecka', m, p: u.pathname, action: b.action });
    if (b.action === 'stamp') {
      svet.kampan.stamps += 1; svet.stampedToday = true;
      udalost({ id: `S${svet.kurzor + 100}`, typ: 'razitko', delta: 1, karta: kartaTed() }); // kind earn
    }
    return json({ ok: true, message: `${fix.me.customer.name}: razítko ${svet.kampan.stamps}/${svet.kampan.required}.`, ...hostCtecky() });
  }
  if (u.pathname === '/api/client/admin/stamps/member' && m === 'POST') {
    const b = JSON.parse(req.postData() || '{}'); svet.zapisy.push({ kdo: 'ctecka', m, p: u.pathname, delta: b.delta, reason: b.reason, campaignId: b.campaignId });
    return new Promise(r => setTimeout(r, 3000)).then(() => {
      svet.kampan.stamps += Number(b.delta);
      udalost({ id: `S${svet.kurzor + 100}`, typ: 'razitko', delta: Number(b.delta), karta: kartaTed() }); // kind manual
      return json({ ok: true, razitek: svet.kampan.stamps, veta: `+${b.delta}` });
    });
  }
  if (u.pathname === '/api/client/admin/redeem' && m === 'POST') {
    const b = JSON.parse(req.postData() || '{}'); svet.zapisy.push({ kdo: 'ctecka', m, p: u.pathname, code: b.code, preview: b.preview });
    if (b.code !== svet.claim.code) return json({ error: 'Kupon neznáme.' }, 404);
    svet.claim.redeemed_at = at(); svet.zamer = null;
    udalost({ id: `U${svet.claim.id}`, typ: 'uplatneno', delta: 0, nazev: svet.claim.title });
    return json({ ok: true, title: svet.claim.title, customer: fix.me.customer.name, benefit: null, badges: [] });
  }
  return undefined;
}

const scrollX = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// ---- Host: U kasy, přibalit odměnu ----
const host = await kontextHosta();
await host.p.goto(BASE + '/client/me?kasa=1', { waitUntil: 'networkidle' });
const list = host.p.getByRole('dialog');
await list.waitFor({ timeout: 20000 });
const prepinac = list.getByRole('switch');
tvrdi('E1 (390): U kasy nabízí připravenou odměnu s přepínačem', await dokud(() => prepinac.first().isVisible().catch(() => false), 8000) && /Filtr dne jako odměna je připravená/.test(await list.innerText()));
await prepinac.first().click();
tvrdi('E1: přibalení pošle PUT me/zamer { slug, claimId }', await dokud(() => svet.zapisy.some(z => z.kdo === 'host' && z.m === 'PUT' && z.slug === PODNIK.slug && z.claimId === 5), 3000), JSON.stringify(svet.zapisy));
tvrdi('E1: host vidí „Obsluha ji uplatní při načtení."', await dokud(async () => /Obsluha ji uplatní při načtení/.test(await list.innerText()), 3000));
tvrdi('E1 (390): U kasy bez vodorovného posuvu', (await scrollX(host.p)) <= 0);
await host.p.screenshot({ path: SNIMKY + 'k92-host-prebaleno-390.png' });

// ---- Čtečka: načtení karty, záměr, jedna akce ----
const obsl = await kontext({ viewport: { width: 1280, height: 900 }, dalsi: apiCtecky });
await obsl.p.goto(BASE + '/employer/ctecka', { waitUntil: 'networkidle' });
await obsl.p.locator('[data-testid="ctecka"]').waitFor({ timeout: 20000 });
await obsl.p.keyboard.type('ABCD-EFGH', { delay: 6 });
await obsl.p.keyboard.press('Enter');
await obsl.p.locator('[data-testid="ctecka-host"]').waitFor({ timeout: 6000 });
const zamer = obsl.p.locator('[data-testid="ctecka-zamer"]');
tvrdi('E2 (1280): čtečka ukáže „Host chce uplatnit: Filtr dne jako odměna"', await dokud(() => zamer.isVisible().catch(() => false), 3000) && /Host chce uplatnit: Filtr dne jako odměna/.test(await zamer.innerText()));
const kombinace = obsl.p.locator('[data-testid="ctecka-kombinace"]');
tvrdi('E2: hlavní akce „Uplatnit filtr dne jako odměna a přidat razítko"', /Uplatnit filtr dne jako odměna a přidat razítko/.test(await kombinace.innerText()), await kombinace.innerText().catch(() => ''));
await obsl.p.getByRole('button', { name: 'O razítko víc' }).click();
await obsl.p.screenshot({ path: SNIMKY + 'k92-ctecka-zamer-1280.png' });
const kurzorPred = svet.kurzor;
await kombinace.click();
tvrdi('E3: jedna akce → POST stamp, stamps/member { delta: 1 } s důvodem, admin/redeem { code } — v tomhle pořadí',
  await dokud(() => svet.zapisy.some(z => z.p === '/api/client/admin/redeem' && !z.preview), 9000)
  && (() => {
    const poradi = svet.zapisy.filter(z => z.kdo === 'ctecka' && z.m === 'POST').map(z => z.p === '/api/client/staff/scan' ? `stamp:${z.action}` : z.p === '/api/client/admin/stamps/member' ? `navic:${z.delta}:${/U kasy/.test(z.reason ?? '')}` : `redeem:${z.code}`);
    return JSON.stringify(poradi) === JSON.stringify(['stamp:stamp', 'navic:1:true', `redeem:${svet.claim.code}`]);
  })(), JSON.stringify(svet.zapisy.filter(z => z.kdo === 'ctecka')));
tvrdi('E3: čtečka potvrdí uplatnění', await dokud(async () => /Uplatněno: Filtr dne jako odměna/.test(await obsl.p.locator('[data-testid="ctecka"]').innerText()), 4000));
tvrdi('E3 (1280): čtečka bez vodorovného posuvu', (await scrollX(obsl.p)) <= 0);

// ---- Host: živá odezva ----
tvrdi('E4: zápisy došly hostovi ve dvou dotazech (první razítko zvlášť, razítko navíc a uplatnění později)', await dokud(() => (svet.davky ?? []).length >= 2, 9000) && svet.davky[0].length === 1 && svet.kurzor > kurzorPred, JSON.stringify(svet.davky));
tvrdi('E4 (390): host vidí „Razítka připsána" a „+2" (razítko + razítko navíc z ruční úpravy)', await dokud(async () => {
  const t = await list.innerText().catch(() => '');
  return /Razítka připsána/.test(t) && /\+2/.test(t);
}, 9000), (await list.innerText().catch(() => '')).slice(0, 400));
const textOdezvy = await list.innerText().catch(() => '');
tvrdi('E4: karta ukazuje stav po všech zápisech „7 / 8"', /7 \/ 8/.test(textOdezvy), textOdezvy.slice(0, 400));
tvrdi('E4: v tom samém listu „Uplatněno: Filtr dne jako odměna"', /Uplatněno: Filtr dne jako odměna/.test(textOdezvy), textOdezvy.slice(0, 400));
tvrdi('E4: hostovi došly všechny tři události (S, S navíc, U)', (svet.doruceno ?? []).length === 3, JSON.stringify(svet.doruceno));
tvrdi('E4 (390): odezva bez vodorovného posuvu', (await scrollX(host.p)) <= 0);
await host.p.screenshot({ path: SNIMKY + 'k92-host-odezva-390.png' });
tvrdi('bez chyb v konzoli (host)', host.chyby.length === 0, host.chyby.join(' | '));
tvrdi('bez chyb v konzoli (čtečka)', obsl.chyby.length === 0, obsl.chyby.join(' | '));

await host.ctx.close();
await obsl.ctx.close();

await konec();
