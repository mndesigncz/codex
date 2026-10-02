// Ruční sonda kola 81: kupony a promo kódy v plné síle (Věrnost → Kupony a kódy).
// Není v ZELENE ve spust.mjs (je v MIMO): API se podvrhuje, sonda tvrdí, co UI zobrazí a pošle.
//
//   SONDY_ZAKLAD=http://localhost:3411 SONDY_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node scripts/sondy/kupony-sprava.mjs
//
// Měří na 390 a 1280 px (bez vodorovného scrollu): katalog se stavy a filtrem, editor posílá nová pole
// (limity, položka nabídky, vyloučení, noční hodiny 22–02, X+Y), koncept, náhled pohledem hosta,
// smazání kuponu, který hosté drží, nabídne archivaci, hromadné akce, uplatnění u kasy vyžaduje útratu,
// poslání kuponu vybraným členům, promo kód: dávka a úprava.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, DIR } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const CLIENT = (tab) => `/employer/overview?mode=client&tab=${tab}`;
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const POLOZKY = [{ id: 11, name: 'Matcha latte', category: 'Nápoje' }, { id: 12, name: 'Víno bílé', category: 'Alkohol' }];
const KUPONY = [
  { id: 1, title: 'Sleva 15 % pro zlaté', description: '', costPoints: 100, active: true, status: 'live', stav: 'aktivni', benefitKind: 'percent', percentOff: 15, benefit: 'Sleva 15 %', badges: ['jen Zlatý host'], targetTiers: ['gold'], targetGroups: [], claimed: 4, redeemed: 2, openClaims: 2, totalLimit: 10, issued: 4, dailyLimit: null, welcome: false, daysOfWeek: [], excludedItems: [], excludedCategories: [] },
  { id: 2, title: 'Koncept dezert', description: '', costPoints: 50, active: true, status: 'draft', stav: 'koncept', benefitKind: 'free_item', benefit: 'Položka zdarma', badges: [], targetTiers: [], targetGroups: [], claimed: 0, redeemed: 0, openClaims: 0, totalLimit: null, issued: 0, welcome: false, daysOfWeek: [], excludedItems: [], excludedCategories: [] },
  { id: 3, title: 'Uvítací káva', description: '', costPoints: 0, active: true, status: 'live', stav: 'aktivni', benefitKind: 'free_item', benefit: 'Položka zdarma', badges: [], targetTiers: [], targetGroups: [], claimed: 1, redeemed: 0, openClaims: 0, totalLimit: null, issued: 1, welcome: true, daysOfWeek: [], excludedItems: [], excludedCategories: [] },
];
const PROMOS = [{ id: 5, code: 'JARO26', title: 'Jarní leták', points: 50, coupon_id: null, coupon_title: null, max_uses: 10, uses: 3, valid_since: null, valid_until: null, active: true, stav: 'aktivni' }];
const CLENOVE = [{ id: 1, name: 'Anna Nováková', email: 'anna@example.cz', points: 120, stamps: 3, visits: 4, joined_at: '2026-01-10T10:00:00Z', last_visit_at: null, reservations: 0, open_coupons: 0 }];

const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  const k = (stav.k ??= { coupons: [], promos: [], send: [], redeem: [], mazani: [] });
  if (path === '/api/client/admin/profile') return json({ profile: nacti('client_admin_profile').profile, boards: [], url: '' });
  if (path === '/api/client/admin/coupons') {
    if (m === 'GET') return json({ coupons: KUPONY, groups: [], polozky: POLOZKY });
    if (m === 'DELETE') { k.mazani.push(url.search); return json({ ok: true }); }
    const b = req.postDataJSON(); k.coupons.push({ m, b });
    return json(b?.ids ? { ok: true, hotovo: b.ids.length, preskoceno: 0 } : { ok: true, coupon: { ...b, id: 9 } });
  }
  if (path === '/api/client/admin/coupons/send') {
    if (m === 'GET') return json({ celkem: 12, skupiny: [], segmenty: [{ id: 'quiet', label: 'Nepřišli měsíc a déle', popis: '', pocet: 3 }] });
    const b = req.postDataJSON(); k.send.push(b); return json({ ok: true, odeslano: 1, preskoceno: {}, veta: 'Odesláno: 1.' });
  }
  if (path === '/api/client/admin/promos') {
    if (m === 'GET') return json({ promos: PROMOS });
    const b = req.postDataJSON(); k.promos.push({ m, b }); return json({ ok: true, promo: { ...PROMOS[0], ...b }, pocet: b?.batch?.count ?? 1 });
  }
  if (path === '/api/client/admin/customers') return json({ customers: CLENOVE, total: CLENOVE.length });
  if (path === '/api/client/admin/redeem') {
    const b = req.postDataJSON(); k.redeem.push(b);
    if (b.preview) return json({ preview: true, code: 'ABC-DEF', title: 'Sleva 15 %', benefit: 'Sleva 15 %', description: '', customer: 'Anna Nováková', badges: ['od 200 Kč útraty'], validSince: null, validUntil: null, redeemed: false, problem: null, usable: true, needsAmount: true, minOrderValue: 200, needsAgeCheck: false, adultOnly: false });
    return json({ ok: true, title: 'Sleva 15 %', benefit: 'Sleva 15 %', customer: 'Anna Nováková', badges: [], amount: Number(b.amount) });
  }
  return undefined;
};

async function behy(viewport, mobil) {
  const L = `${viewport.width}px`;
  const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: nacti('k69-b8-rozlozeni-vernost'), dalsi: podvrh });
  await otevri(p, CLIENT('loyalty'), 'vedeni.klient_vernost');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Kupony a kódy' }).click();
  await p.getByRole('heading', { name: 'Katalog kuponů' }).waitFor({ timeout: 8000 });

  // Katalog: stav, zbývající kusy, filtr, bez přetečení.
  const text = await p.locator('main, [data-plocha]').first().innerText();
  tvrdi(`${L}: katalog ukazuje zbývající kusy`, /zbývá 6 kusů z 10/.test(text), text.slice(0, 300));
  tvrdi(`${L}: koncept má štítek Koncept`, text.includes('Koncept'));
  tvrdi(`${L}: bez vodorovného scrollu (katalog)`, await bezPreteceni(p));
  await p.getByRole('tab', { name: /Koncepty/ }).click();
  tvrdi(`${L}: filtr Koncepty ukáže jen koncept`, (await p.getByText('Koncept dezert').count()) === 1 && (await p.getByText('Sleva 15 % pro zlaté').count()) === 0);
  await p.getByRole('tab', { name: /^Vše/ }).click();

  // Smazání kuponu, který hosté drží, nabídne archivaci (dialog odpovídá API).
  await p.getByRole('button', { name: 'Další akce s kuponem Sleva 15 % pro zlaté' }).click();
  await p.getByRole('menuitem', { name: /Smazat/ }).click();
  await p.getByText('smazat nejde').waitFor({ timeout: 3000 });
  tvrdi(`${L}: dialog smazání nabízí Archivovat, ne Smazat`, (await p.getByRole('button', { name: 'Archivovat' }).count()) >= 1 && (await p.getByRole('button', { name: 'Smazat', exact: true }).count()) === 0);
  await p.keyboard.press('Escape');

  // Hromadná akce: vybrat dva kupony a pozastavit.
  await p.getByRole('checkbox', { name: 'Vybrat kupon Koncept dezert' }).click();
  await p.getByRole('checkbox', { name: 'Vybrat kupon Uvítací káva' }).click();
  await p.getByRole('button', { name: 'Pozastavit' }).click();
  await p.waitForTimeout(300);
  tvrdi(`${L}: hromadné pozastavení pošle PATCH s ids a akcí`, stav.k.coupons.some(c => c.m === 'PATCH' && c.b.action === 'pozastavit' && c.b.ids.length === 2), JSON.stringify(stav.k.coupons));

  // Editor: noční hodiny, X+Y, limity, položka, vyloučení.
  await p.getByRole('button', { name: 'Nový kupon' }).click();
  await p.getByLabel('Název').fill('Noční 2+1');
  await p.getByRole('button', { name: 'X+Y', exact: true }).click();
  await p.getByLabel('Host koupí (X)').fill('2');
  await p.getByLabel('Od hodiny').fill('22:00');
  await p.getByLabel('Do hodiny').fill('02:00');
  tvrdi(`${L}: noční okno se v nápovědě pojmenuje`, (await p.getByText('platí přes půlnoc').count()) >= 1);
  await p.getByLabel('Celkem kusů').fill('50');
  await p.getByLabel('Uplatnění za den').fill('5');
  await p.getByLabel('Platí jen na položku').selectOption('11');
  await p.getByRole('button', { name: 'Alkohol', exact: true }).click();
  tvrdi(`${L}: náhled pohledem hosta ukazuje 2+1 na položku`, (await p.getByTestId('kupon-nahled-karta').innerText()).includes('2+1 zdarma na Matcha latte'));
  tvrdi(`${L}: bez vodorovného scrollu (editor)`, await bezPreteceni(p));
  await p.getByRole('button', { name: 'Uložit jako koncept' }).click();
  await p.waitForTimeout(400);
  const post = stav.k.coupons.find(c => c.m === 'POST');
  tvrdi(`${L}: POST nese nová pole`, post?.b.status === 'draft' && post?.b.hourFrom === '22:00' && post?.b.hourTill === '02:00' && post?.b.totalLimit === '50' && post?.b.dailyLimit === '5' && post?.b.menuItemId === 11 && post?.b.excludedCategories?.includes('Alkohol') && post?.b.xyBuy === '2', JSON.stringify(post));

  // Uplatnění u kasy chce útratu.
  await p.getByLabel('Kód od hosta').fill('abc-def');
  await p.getByLabel('Kód od hosta').press('Enter');
  await p.getByTestId('kupon-uplatnit').waitFor({ timeout: 4000 });
  const dialog = p.getByRole('dialog');
  tvrdi(`${L}: Uplatnit je zakázané, dokud není zadaná útrata`, await dialog.getByRole('button', { name: 'Uplatnit', exact: true }).isDisabled());
  await dialog.getByLabel(/Útrata hosta/).fill('250');
  await dialog.getByRole('button', { name: 'Uplatnit', exact: true }).click();
  await p.waitForTimeout(400);
  tvrdi(`${L}: uplatnění pošle útratu`, stav.k.redeem.some(r => !r.preview && String(r.amount) === '250'), JSON.stringify(stav.k.redeem));

  // Promo kódy: dávka.
  await p.getByRole('tab', { name: 'Dávka kódů' }).click().catch(() => {});
  await p.getByRole('button', { name: 'Dávka kódů' }).click().catch(() => {});
  await p.getByLabel('Předpona').fill('jaro');
  await p.getByLabel('Kolik kódů').fill('20');
  await p.getByLabel('Název').last().fill('Dávka leták');
  await p.getByRole('button', { name: 'Vytvořit dávku' }).click();
  await p.waitForTimeout(400);
  tvrdi(`${L}: dávka pošle prefix a počet`, stav.k.promos.some(x => x.m === 'POST' && x.b.batch?.prefix === 'JARO' && Number(x.b.batch?.count) === 20), JSON.stringify(stav.k.promos));
  tvrdi(`${L}: bez vodorovného scrollu (promo kódy)`, await bezPreteceni(p));
  tvrdi(`${L}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();

  // Poslat kupon z členů.
  const c2 = await kontext({ viewport, mobil, fix: nacti('k69-b8-rozlozeni-klient'), dalsi: podvrh });
  await c2.p.goto((process.env.SONDY_ZAKLAD ?? 'http://localhost:3000') + CLIENT('customers'), { waitUntil: 'networkidle' });
  await c2.p.getByRole('button', { name: 'Poslat kupon: Anna Nováková' }).click();
  await c2.p.getByLabel('Kupon').selectOption('1');
  await c2.p.getByRole('button', { name: 'Poslat', exact: true }).click();
  await c2.p.waitForTimeout(400);
  tvrdi(`${L}: poslání vybranému členovi pošle customerIds`, c2.stav.k.send.some(s => s.couponId === 1 && s.customerIds?.[0] === 1), JSON.stringify(c2.stav.k.send));
  await c2.ctx.close();
}

await behy({ width: 1280, height: 950 }, false);
await behy({ width: 390, height: 844 }, true);
await konec();
