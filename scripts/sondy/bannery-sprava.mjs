// Kolo 74 — správa bannerů (Vzhled → Bannery) a čtení QR kuponu na obsluze (Kartička hosta).
// Ruční sonda (MIMO v spust.mjs): API podvrhuje. Na 390 a 1280 px bez vodorovného scrollu.
//
// Bannery: seznam, přepínač aktivní (PATCH), řazení (PATCH order), nový banner (POST),
// odkaz javascript: se nepustí ani k odeslání, smazání.
// Kartička: payload „managero:coupon:ABC-DEF“ i opsaný kód → náhled kuponu (preview) →
// Uplatnit (POST bez preview); cizí QR a karta hosta se řeknou srozumitelně;
// uplatněný kupon jde jen zobrazit, ne uplatnit.
//   NEXTAUTH_SECRET=… SONDY_ZAKLAD=http://localhost:3414 node scripts/sondy/bannery-sprava.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, FIX_DOMU, roleMine, DIR } from './k68-spolecne.mjs';

const nacti = (j) => JSON.parse(readFileSync(DIR + j + '.json', 'utf8'));
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---------------------------------------------------------------------------
// Bannery ve Vzhledu
// ---------------------------------------------------------------------------
for (const sirka of [1280, 390]) {
  const radky = [
    { id: 1, title: 'Páteční degustace', text: 'Každý pátek', image_url: null, link_kind: 'menu', link_ref: null, active: true, valid_since: null, valid_until: null, position: 0 },
    { id: 2, title: 'Dvojnásobné body', text: '', image_url: null, link_kind: 'none', link_ref: null, active: false, valid_since: null, valid_until: null, position: 1 },
    { id: 3, title: 'Stará akce', text: '', image_url: null, link_kind: 'none', link_ref: null, active: true, valid_since: null, valid_until: '2020-01-01', position: 2 },
  ];
  const volani = [];
  const dalsi = (req, json) => {
    const path = new URL(req.url()).pathname; const m = req.method();
    if (path === '/api/client/admin/profile') return json({ profile: nacti('client_admin_profile').profile ?? nacti('client_admin_profile'), url: 'http://x/client/lipa' });
    if (path === '/api/client/admin/banners') {
      if (m === 'GET') return json({ banners: radky, events: [{ id: 7, title: 'Koncert', date: '2026-11-01' }] });
      const body = req.postDataJSON?.() ?? null;
      volani.push({ m, body, q: new URL(req.url()).search });
      if (m === 'POST') return json({ ok: true, banner: { id: 9, position: 3, ...body, image_url: null, link_ref: body.link_ref || null } });
      if (m === 'PATCH' && body?.id) return json({ ok: true, banner: { ...radky.find(r => r.id === body.id), ...body } });
      return json({ ok: true });
    }
    return undefined;
  };
  const { ctx, p, chyby } = await kontext({ viewport: { width: sirka, height: 950 }, mobil: sirka < 500, fix: nacti('k69-b8-rozlozeni-klient'), dalsi });
  await p.goto((process.env.SONDY_ZAKLAD ?? 'http://localhost:3000') + '/employer/overview?mode=client&tab=brand', { waitUntil: 'networkidle' });
  await p.getByRole('heading', { name: 'Bannery' }).waitFor({ timeout: 15000 });
  await p.waitForTimeout(500);
  const L = `${sirka}`;
  tvrdi(`${L}: seznam má tři bannery`, await p.locator('[data-banner-row]').count() === 3);
  tvrdi(`${L}: u staré akce stojí „platnost skončila“`, (await p.locator('[data-banner-row="3"]').innerText()).includes('platnost skončila'));
  tvrdi(`${L}: bez vodorovného scrollu`, await bezPreteceni(p));
  await p.locator('[data-banner-row="1"]').getByRole('switch').click();
  await p.waitForTimeout(200);
  tvrdi(`${L}: přepínač pošle PATCH active=false`, volani.some(v => v.m === 'PATCH' && v.body?.id === 1 && v.body?.active === false), JSON.stringify(volani));
  await p.locator('[data-banner-row="2"]').getByRole('button', { name: /výš/ }).click();
  await p.waitForTimeout(200);
  tvrdi(`${L}: řazení pošle nové pořadí`, JSON.stringify(volani.find(v => v.body?.order)?.body?.order) === '[2,1,3]', JSON.stringify(volani.find(v => v.body?.order)));

  await p.getByRole('button', { name: 'Nový banner' }).click();
  await p.getByLabel('Nadpis').fill('Nový web');
  await p.getByLabel('Kam banner vede').selectOption('url');
  await p.getByLabel('Webový odkaz').fill('javascript:alert(1)');
  await p.getByRole('button', { name: 'Přidat banner' }).click();
  await p.waitForTimeout(300);
  tvrdi(`${L}: javascript: se neodešle`, !volani.some(v => v.m === 'POST'));
  tvrdi(`${L}: formulář s náhledem bez vodorovného scrollu`, await bezPreteceni(p));
  await p.getByLabel('Webový odkaz').fill('https://example.com/novy');
  await p.getByRole('button', { name: 'Přidat banner' }).click();
  await p.waitForTimeout(400);
  const post = volani.find(v => v.m === 'POST');
  tvrdi(`${L}: https odkaz se odešle`, post?.body?.link_kind === 'url' && post?.body?.link_ref === 'https://example.com/novy', JSON.stringify(post));
  tvrdi(`${L}: nový banner je v seznamu`, await p.locator('[data-banner-row="9"]').count() === 1);
  p.once('dialog', d => d.accept());
  await p.locator('[data-banner-row="9"]').getByRole('button', { name: /Smazat/ }).click();
  await p.waitForTimeout(300);
  tvrdi(`${L}: smazání pošle DELETE`, volani.some(v => v.m === 'DELETE' && v.q === '?id=9'), JSON.stringify(volani.map(v => v.m)));
  await p.screenshot({ path: new URL(`./shots/bannery-sprava-${sirka}.png`, import.meta.url).pathname, fullPage: true }).catch(() => {});
  tvrdi(`${L}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Kartička hosta: QR kuponu
// ---------------------------------------------------------------------------
for (const sirka of [1280, 390]) {
  const L = `${sirka}`;
  const fix = { ...FIX_DOMU, polozky: [{ id: 'klient-objednavky-od-stolu', widget: 'klient.objednavky_od_stolu', velikost: 'L' }, ...FIX_DOMU.polozky] };
  const volani = [];
  const kupony = {
    'ABC-DEF': { preview: true, code: 'ABC-DEF', title: 'Káva zdarma', description: 'Jedna káva k obědu.', customer: 'Jana Nováková', benefit: 'Položka zdarma', badges: ['po, út', '11:00–14:00'], validSince: null, validUntil: '2026-12-31', redeemed: false, problem: null, usable: true },
    'XYZ-789': { preview: true, code: 'XYZ-789', title: 'Sleva 10 %', description: '', customer: 'Petr Dvořák', benefit: 'Sleva 10 %', badges: [], validSince: null, validUntil: null, redeemed: true, problem: 'Už uplatněno 1. 9. 2026.', usable: false },
  };
  const dalsi = (req, json) => {
    const path = new URL(req.url()).pathname;
    if (path === '/api/client/staff/inbox') return json({ orders: [], reservations: [], pos: { connected: false } });
    if (path === '/api/client/staff/scan') { volani.push({ scan: new URL(req.url()).search }); return json({ error: 'Hosta s touhle kartou neznáme.' }, 404); }
    if (path === '/api/client/admin/redeem') {
      const b = req.postDataJSON(); volani.push({ redeem: b });
      if (b.preview) { const k = kupony[b.code]; return k ? json(k) : json({ error: 'Takový kupon tu není.' }, 404); }
      return json({ ok: true, title: 'Káva zdarma', benefit: 'Položka zdarma', badges: [] });
    }
    return undefined;
  };
  const { ctx, p, chyby } = await kontext({ viewport: { width: sirka, height: 950 }, mobil: sirka < 500, role: 'employee', mineData: roleMine('barista', []), fix, dalsi });
  await otevri(p, '/employee/shifts', 'zamestnanec.domu');
  await p.locator('[data-plocha] li[data-widget="klient.objednavky_od_stolu"] summary').click();
  const pole = p.getByLabel('Kód kartičky nebo kuponu');
  await pole.waitFor();

  // Payload z QR.
  await pole.fill('managero:coupon:abc-def');
  await pole.press('Enter');
  await p.getByTestId('kupon-nahled').waitFor({ timeout: 5000 });
  const nahled = await p.getByTestId('kupon-nahled').innerText();
  tvrdi(`${L}: náhled — název, držitel, podmínky, platnost`, ['Káva zdarma', 'Jana Nováková', '11:00–14:00', '2026-12-31'].every(s => nahled.includes(s)), nahled.replace(/\n/g, ' | '));
  tvrdi(`${L}: náhled šel přes redeem s preview a payload se normalizoval na server`, volani.some(v => v.redeem?.preview === true && /abc-def/i.test(v.redeem.code)));
  tvrdi(`${L}: náhled nic neuplatnil`, !volani.some(v => v.redeem && !v.redeem.preview));
  tvrdi(`${L}: bez vodorovného scrollu`, await bezPreteceni(p));
  await p.screenshot({ path: new URL(`./shots/bannery-kupon-${sirka}.png`, import.meta.url).pathname }).catch(() => {});
  await p.getByRole('button', { name: 'Uplatnit', exact: true }).click();
  await p.waitForTimeout(400);
  const ucast = volani.filter(v => v.redeem && !v.redeem.preview);
  tvrdi(`${L}: Uplatnit pošle POST jednou, s kódem ABC-DEF`, ucast.length === 1 && ucast[0].redeem.code === 'ABC-DEF', JSON.stringify(ucast));
  tvrdi(`${L}: po uplatnění je zpět pole`, await pole.count() === 1);

  // Opsaný kód bez pomlčky.
  await pole.fill('abcdef'); await pole.press('Enter');
  await p.getByTestId('kupon-nahled').waitFor({ timeout: 5000 });
  tvrdi(`${L}: opsaný šestimístný kód otevře kupon`, (await p.getByTestId('kupon-nahled').innerText()).includes('Káva zdarma'));
  await p.getByRole('button', { name: 'Zrušit' }).click();

  // Už uplatněný: Uplatnit je zakázané a řekne proč.
  await pole.fill('XYZ789'); await pole.press('Enter');
  await p.getByTestId('kupon-nahled').waitFor({ timeout: 5000 });
  tvrdi(`${L}: uplatněný kupon — Uplatnit je zakázané a je vidět důvod`, await p.getByRole('button', { name: 'Uplatnit', exact: true }).isDisabled() && (await p.getByTestId('kupon-nahled').innerText()).includes('Už uplatněno'));
  await p.getByRole('button', { name: 'Zrušit' }).click();

  // Cizí QR a karta hosta.
  await pole.fill('https://example.com/abc'); await pole.press('Enter');
  tvrdi(`${L}: cizí QR se řekne srozumitelně`, (await p.locator('p.note-danger').innerText()).includes('není QR z Managera'), await p.locator('p.note-danger').innerText());
  await pole.fill('ABCD1234'); await pole.press('Enter');
  await p.waitForTimeout(300);
  tvrdi(`${L}: osmimístný kód jde dál jako karta hosta (staff/scan)`, volani.some(v => v.scan?.includes('ABCD1234')), JSON.stringify(volani.map(v => v.scan)));
  tvrdi(`${L}: karta nespustila uplatnění kuponu`, volani.filter(v => v.redeem).length === 4);
  tvrdi(`${L}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
await konec();
