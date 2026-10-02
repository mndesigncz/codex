// Čtečka u kasy (/employer/ctecka): simulace hardwarové čtečky, která píše jako klávesnice.
//
// Čtečka = rychlé psaní kódu (pár ms mezi znaky) a Enter na konci, bez klepnutí do pole.
// Sonda tvrdí na 390 px i na desktopu:
//  C1 Prázdná obrazovka: „Čekám na další kartu", skryté pole je zaostřené, stránka nescrolluje do strany.
//  C2 Sken karty: host se načte sám (GET /api/client/staff/scan?code=ABCD-EFGH) a na jedné obrazovce je
//     úroveň, sleva se zdrojem, body, kredit, razítková karta s postupem, kupon k uplatnění, kupon za body,
//     narozeniny a poslední návštěva; tlačítka akcí mají aspoň 48 px.
//  C3 Odolnost: zaostření na tlačítku (Enter z čtečky nesmí „kliknout"), dvojitý sken do 2 s = jeden dotaz,
//     kód malými písmeny bez pomlčky s koncovým Tab, cizí QR, neznámá karta.
//  C4 Akce: razítko → POST, potvrzení, odpočet a automatický návrat; „Zůstat u hosta" návrat zruší.
//  C5 Host bez členství: „Přidat jako člena" → POST action join.
//  C6 Kupon (payload QR) → náhled → Uplatnit → POST redeem; kupon u hosta se uplatní jedním klepnutím.
//  C7 Bez oprávnění vernost.karta: žádný dotaz na API, srozumitelná věta.
//  C8 Historie: nejvýš pět záznamů; „méně pohybu" vypne přechod odpočtu.
//   SONDY_ZAKLAD=http://localhost:3414 node scripts/sondy/ctecka.mjs
import { kontext, tvrdi, konec, BASE, VLASTNIK, ROLE, mine } from './k68-spolecne.mjs';

const dnes = new Date().toISOString();
const HOST = {
  customer: { id: 7, name: 'Klára Vojtíšková s hodně dlouhým příjmením Nováková-Svobodová' },
  member: true, points: 240, credit: 120, stamps: 3, visits: 14, spend: 5400,
  campaigns: [{ id: 1, name: 'Káva za 8 razítek', required: 8, ruleType: 'visit', stamps: 5, reward: 'Káva zdarma' }],
  tierBy: 'visits', levelLabel: 'Stříbrný', tier: 'silver', discount: 10, discountSource: 'skupina', discountName: 'Stálí hosté', tierDiscount: 5,
  nextTierAt: 20, nextTierLabel: 'Zlatý', nextTierUnit: 'visits',
  stampedToday: false, birthdayToday: true, lastVisit: new Date(Date.now() - 3 * 86400000).toISOString(),
  openCoupons: [
    { code: 'ABC-DEF', title: 'Káva zdarma za plnou kartu', kind: 'stamps', fromStamps: true, validUntil: '2026-12-31', benefit: null },
    { code: 'XYZ-123', title: 'Sleva 20 % na dort', kind: 'offer', fromStamps: false, validUntil: null, benefit: '20 % sleva' },
  ],
  affordable: [{ id: 3, title: 'Čaj na památku', cost_points: 200 }],
  bills: [{ bill_id: 'B1', final_price: 250, paid_at: dnes }, { bill_id: 'B2', final_price: 99, paid_at: dnes }],
  rules: { pointsPer100: 5, stampTarget: 8, stampReward: 'Káva zdarma', cashbackPct: 0 },
};
const KUPON = { preview: true, code: 'KUP-123', title: 'Dort k narozeninám', description: '', customer: 'Eva Dlouhá', benefit: 'zdarma', badges: ['od 200 Kč'], validSince: null, validUntil: '2026-12-31', problem: null, usable: true };

/** Obsluha API: karta ABCD-EFGH existuje, NOVY-0000 není členem, ostatní neznámé. */
function api(zaznam, { host = HOST } = {}) {
  return (req, json) => {
    const u = new URL(req.url()); const m = req.method();
    if (u.pathname === '/api/client/staff/scan' && m === 'GET') {
      const code = u.searchParams.get('code'); zaznam.push({ m, code });
      if (code === 'ABCD-EFGH') return json(host);
      if (code === 'NOVY-0000') return json({ ...host, customer: { id: 9, name: 'Nový Host' }, member: false, points: 0, credit: 0, visits: 0, campaigns: [], openCoupons: [], affordable: [], birthdayToday: false, lastVisit: null });
      return json({ error: 'Takovou kartičku neznáme.' }, 404);
    }
    if (u.pathname === '/api/client/staff/scan' && m === 'POST') {
      const b = JSON.parse(req.postData() || '{}'); zaznam.push({ m, ...b });
      if (b.action === 'join') return json({ ok: true, message: 'Nový Host je teď členem.', customer: { id: 9, name: 'Nový Host' }, ...host, member: true, points: 0 });
      return json({ ok: true, message: `${host.customer.name}: razítko 6/8.`, customer: host.customer, ...host, stamps: 4, stampedToday: true });
    }
    if (u.pathname === '/api/client/admin/redeem' && m === 'POST') {
      const b = JSON.parse(req.postData() || '{}'); zaznam.push({ m, redeem: b });
      return b.preview ? json(KUPON) : json({ ok: true, title: 'Dort k narozeninám', customer: 'Eva Dlouhá', benefit: 'zdarma', badges: [] });
    }
    return undefined;
  };
}

/** Čtečka: znaky po pár ms a konec Enterem (nebo Tab). */
async function sken(p, text, konecKlavesa = 'Enter') {
  await p.keyboard.type(text, { delay: 6 });
  if (konecKlavesa) await p.keyboard.press(konecKlavesa);
}
const scrollX = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const ceka = (p) => p.locator('[data-testid="ctecka-ceka"]').isVisible();

async function otevri(opt = {}) {
  const zaznam = [];
  const k = await kontext({ ...opt, dalsi: api(zaznam, opt.api ?? {}) });
  if (opt.navrat != null) await k.ctx.addInitScript(([n]) => { try { localStorage.setItem('managero-ctecka-navrat', n); } catch { /* */ } }, [String(opt.navrat)]);
  await k.p.goto(BASE + '/employer/ctecka', { waitUntil: 'networkidle' });
  await k.p.locator('[data-testid="ctecka"]').waitFor({ timeout: 20000 });
  return { ...k, zaznam };
}

for (const [sirka, mobil] of [[390, true], [1280, false]]) {
  const jm = `${sirka} px`;
  const { ctx, p, zaznam, chyby } = await otevri({ viewport: { width: sirka, height: 900 }, mobil, navrat: 5 });

  // C1
  tvrdi(`${jm}: čekám na další kartu`, await ceka(p));
  tvrdi(`${jm}: skryté pole je zaostřené`, await p.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'ctecka-pole'));
  tvrdi(`${jm}: stav „Čtečka připravena"`, /připravena/.test(await p.locator('[data-testid="ctecka-stav"]').innerText()));
  tvrdi(`${jm}: bez vodorovného scrollu (čekání)`, (await scrollX(p)) <= 0, String(await scrollX(p)));

  // C2: čtečka píše bez klepnutí do pole
  await sken(p, 'ABCD-EFGH');
  await p.locator('[data-testid="ctecka-host"]').waitFor({ timeout: 5000 });
  const host = await p.locator('[data-testid="ctecka-host"]').innerText();
  tvrdi(`${jm}: dotaz s kódem karty`, zaznam.some(z => z.m === 'GET' && z.code === 'ABCD-EFGH'));
  for (const [co, re] of [['jméno', /Klára Vojtíšková/], ['úroveň', /Stříbrný/], ['sleva se zdrojem', /Sleva 10 % \(Stálí hosté\)/], ['body', /240 b\./],
    ['kredit', /Kredit/], ['postup razítek', /5\/8/], ['kupon k uplatnění', /Káva zdarma za plnou kartu/], ['druhý kupon', /Sleva 20 % na dort/],
    ['kupon za body', /Čaj na památku/], ['narozeniny', /narozeniny/], ['poslední návštěva', /naposledy před 3 dny/], ['účtenka', /Připsat z účtenky/]]) {
    tvrdi(`${jm}: host ukazuje ${co}`, re.test(host), host.slice(0, 200));
  }
  tvrdi(`${jm}: bez vodorovného scrollu (host)`, (await scrollX(p)) <= 0, String(await scrollX(p)));
  const male = await p.$$eval('[data-testid="ctecka-host"] button', bs => bs.filter(b => b.offsetParent && b.textContent.trim() && !/Jiný host/.test(b.textContent)).map(b => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height) })).filter(b => b.h < 48));
  tvrdi(`${jm}: velké dotykové cíle (min. 48 px)`, male.length === 0, JSON.stringify(male));
  const poradi = await p.$$eval('[data-testid="ctecka-host"] button', bs => bs.map(b => b.textContent.trim()).filter(t => /Razítko|Dnes razítko/.test(t)));
  tvrdi(`${jm}: razítko je nahoře`, poradi.length > 0);
  await p.screenshot({ path: new URL(`./shots/ctecka-host-${sirka}.png`, import.meta.url).pathname }).catch(() => {});

  // C3: zaostření na tlačítku, dvojitý sken, malé písmeno bez pomlčky s Tabem
  await p.locator('[data-testid="ctecka-host"] button', { hasText: 'Uplatnit' }).first().focus();
  const pred = zaznam.length;
  await sken(p, 'abcdefgh', 'Tab');
  await p.waitForTimeout(400);
  tvrdi(`${jm}: dvojitý sken téhož kódu do 2 s se zahodí`, zaznam.length === pred, JSON.stringify(zaznam.slice(pred)));
  tvrdi(`${jm}: Enter z čtečky na tlačítku nic neuplatnil`, !zaznam.some(z => z.redeem));
  await p.getByRole('button', { name: 'Jiný host' }).click();
  tvrdi(`${jm}: Jiný host vrací čekání`, await ceka(p));
  await sken(p, 'https://example.com/x');
  await p.locator('[data-testid="ctecka-chyba"]').waitFor({ timeout: 3000 });
  tvrdi(`${jm}: cizí QR srozumitelně`, /není QR z Managera/.test(await p.locator('[data-testid="ctecka-chyba"]').innerText()));
  await p.getByRole('button', { name: 'Čekám na další kartu' }).click();
  await sken(p, 'ZZZZ-9999');
  await p.locator('[data-testid="ctecka-chyba"]').waitFor({ timeout: 3000 });
  tvrdi(`${jm}: neznámá karta`, /Takovou kartičku neznáme/.test(await p.locator('[data-testid="ctecka-chyba"]').innerText()));
  tvrdi(`${jm}: chyba bez vodorovného scrollu`, (await scrollX(p)) <= 0);
  await p.getByRole('button', { name: 'Čekám na další kartu' }).click();

  // C4: razítko, potvrzení, odpočet, automatický návrat (5 s)
  await sken(p, 'ABCD-EFGH', 'Enter');
  await p.locator('[data-testid="ctecka-host"]').waitFor({ timeout: 5000 });
  await p.getByRole('button', { name: 'Razítko za návštěvu' }).click();
  await p.locator('[data-testid="ctecka-potvrzeni"]').waitFor({ timeout: 3000 });
  tvrdi(`${jm}: POST razítka`, zaznam.some(z => z.m === 'POST' && z.action === 'stamp' && z.code === 'ABCD-EFGH'));
  tvrdi(`${jm}: potvrzení a odpočet`, /Čekám na další kartu za \d s/.test(await p.locator('[data-testid="ctecka-potvrzeni"]').innerText()));
  await p.getByRole('button', { name: 'Zůstat u hosta' }).click();
  await p.waitForTimeout(5800);
  tvrdi(`${jm}: Zůstat u hosta návrat zruší`, await p.locator('[data-testid="ctecka-host"]').isVisible());
  // znovu bez „zůstat": návrat po 5 s
  await p.getByRole('button', { name: 'Další karta' }).click();
  await sken(p, 'ABCD-EFGH');
  await p.locator('[data-testid="ctecka-host"]').waitFor({ timeout: 5000 });
  await p.getByRole('button', { name: /Připsat z účtenky 250/ }).click();
  await p.locator('[data-testid="ctecka-potvrzeni"]').waitFor({ timeout: 3000 });
  tvrdi(`${jm}: POST účtenky`, zaznam.some(z => z.action === 'bill' && z.billId === 'B1'));
  await p.waitForTimeout(6200);
  tvrdi(`${jm}: po odpočtu zpět na čekání`, await ceka(p));

  // C6: kupon z QR
  await sken(p, 'managero:coupon:KUP-123');
  await p.locator('[data-testid="ctecka-kupon"]').waitFor({ timeout: 3000 });
  tvrdi(`${jm}: náhled kuponu`, /Dort k narozeninám/.test(await p.locator('[data-testid="ctecka-kupon"]').innerText()));
  await p.locator('[data-testid="ctecka-kupon"]').getByRole('button', { name: 'Uplatnit' }).click();
  await p.locator('[data-testid="ctecka-potvrzeni"]').waitFor({ timeout: 3000 });
  tvrdi(`${jm}: POST uplatnění kuponu`, zaznam.some(z => z.redeem && !z.redeem.preview && z.redeem.code === 'KUP-123'));

  // kupon u hosta jedním klepnutím
  await p.getByRole('button', { name: 'Další karta' }).click();
  await sken(p, 'ABCD-EFGH');
  await p.locator('[data-testid="ctecka-host"]').waitFor({ timeout: 5000 });
  await p.locator('[data-testid="ctecka-host"] li', { hasText: 'Sleva 20 % na dort' }).getByRole('button', { name: 'Uplatnit' }).click();
  await p.locator('[data-testid="ctecka-potvrzeni"]').waitFor({ timeout: 3000 });
  tvrdi(`${jm}: kupon hosta uplatněn z jeho obrazovky`, zaznam.some(z => z.redeem?.code === 'XYZ-123'));
  tvrdi(`${jm}: uplatněný kupon zmizel ze seznamu`, !/Sleva 20 % na dort/.test(await p.locator('[data-testid="ctecka-host"]').innerText()));

  // C8: historie nejvýš pět
  await p.getByRole('button', { name: 'Další karta' }).click();
  for (const k of ['AAAA-0001', 'AAAA-0002', 'AAAA-0003', 'AAAA-0004', 'AAAA-0005', 'AAAA-0006']) {
    await sken(p, k); await p.waitForTimeout(250);
    if (await p.locator('[data-testid="ctecka-chyba"]').isVisible()) await p.getByRole('button', { name: 'Čekám na další kartu' }).click();
  }
  const radku = await p.locator('[data-testid="ctecka-historie"] li').count();
  tvrdi(`${jm}: historie má nejvýš pět záznamů`, radku === 5, String(radku));
  tvrdi(`${jm}: bez vodorovného scrollu (historie)`, (await scrollX(p)) <= 0);
  tvrdi(`${jm}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// C5: host bez členství
{
  const { ctx, p, zaznam } = await otevri({ viewport: { width: 390, height: 900 }, mobil: true });
  await sken(p, 'NOVY-0000');
  await p.locator('[data-testid="ctecka-host"]').waitFor({ timeout: 5000 });
  tvrdi('nečlen: nabídka přidat člena', await p.getByRole('button', { name: 'Přidat jako člena' }).isVisible());
  await p.getByRole('button', { name: 'Přidat jako člena' }).click();
  await p.locator('[data-testid="ctecka-potvrzeni"]').waitFor({ timeout: 3000 });
  tvrdi('nečlen: POST join', zaznam.some(z => z.m === 'POST' && z.action === 'join' && z.code === 'NOVY-0000'));
  tvrdi('nečlen: po přidání už nabídka zmizela', !(await p.getByRole('button', { name: 'Přidat jako člena' }).isVisible()));
  await ctx.close();
}

// C7: bez oprávnění vernost.karta
{
  const bez = mine(ROLE.ja.opravneni.filter(k => k !== 'vernost.karta'), { klic: 'zamestnanec', roleId: null, nazev: 'Obsluha', typ: 'zamestnanec', jeVlastnik: false });
  const { ctx, p, zaznam } = await otevri({ viewport: { width: 390, height: 900 }, mobil: true, mineData: bez });
  await p.waitForTimeout(500);
  await sken(p, 'ABCD-EFGH');
  await p.locator('[data-testid="ctecka-chyba"]').waitFor({ timeout: 3000 });
  tvrdi('bez oprávnění: srozumitelná věta', /nemáš povoleno/.test(await p.locator('[data-testid="ctecka-chyba"]').innerText()));
  tvrdi('bez oprávnění: žádný dotaz na kartu', !zaznam.some(z => z.m === 'GET'));
  await ctx.close();
}

// C8: méně pohybu — odpočet bez přechodu
{
  const { ctx, p } = await otevri({ viewport: { width: 390, height: 900 }, mobil: true, reduced: true, navrat: 15 });
  await sken(p, 'ABCD-EFGH');
  await p.locator('[data-testid="ctecka-host"]').waitFor({ timeout: 5000 });
  await p.getByRole('button', { name: 'Razítko za návštěvu' }).click();
  await p.locator('[data-testid="ctecka-potvrzeni"]').waitFor({ timeout: 3000 });
  const prechod = await p.$eval('[data-testid="ctecka-potvrzeni"] [aria-hidden] > div', el => getComputedStyle(el).transitionProperty);
  tvrdi('méně pohybu: pruh odpočtu bez přechodu', prechod === 'none' || prechod === '', prechod);
  await ctx.close();
}

await konec();
