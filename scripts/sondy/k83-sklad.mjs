// Kolo 7, balík R7-6 — Sklad, receptury, uzávěrky a dodavatelé na telefonu (390 × 844, dotyk),
// česky, německy a polsky. Každé změněné okno a stránka:
//  A) okno příjmu objednávky zdola: Upravit množství → řádky s PoleMnozstvi a cenou za balení
//     bez přetečení (i na 320 px), pole ≥ 44 px a písmo ≥ 16 px (žádný zoom při fokusu);
//  B) Dodavatelé zdola: formulář pod sebou, Objednat s dotykovou plochou ≥ 44 px;
//  C) Uzávěrky na 320 px: Vše | Měsíc a MonthNav v hlavičce seznamu bez přetečení;
//  D) Nastavení › Profil podniku s polem Cílová marže;
//  E) Receptury: pilulky a Řadit v jednom pásu;
//  F) Inventura: minulé inventury s hodnotou rozdílu v penězích;
//  G) Uzávěrky: Souhrn L s metrikou Hosté v Segmented (čtyři volby v jednom řádku i německy) a Ø na hosta;
//  H) Finance: Ztráty a manka L — Chip změny proti minulé inventuře a BarSpark posledních inventur
//     uvnitř widgetu (nepřetéká ani s dlouhým německým chipem).
// Snímky do scripts/sondy/shots/k83-sklad-*.png (necommitují se).
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, DIR, OUT, BASE } from './k68-spolecne.mjs';
import { nastavJazyk } from './preteceni-jadro.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const slovnik = {};
/** Věta v jazyce sondy ze slovníku aplikace (česky = klíč). */
const tr = (jazyk, sekce, klic, hodnoty = {}) => {
  let v = klic;
  if (jazyk !== 'cs') {
    const d = (slovnik[`${jazyk}/${sekce}`] ??= JSON.parse(readFileSync(new URL(`../../locales/${jazyk}/${sekce}.json`, import.meta.url), 'utf8')));
    v = d[klic] ?? klic;
  }
  return Object.entries(hodnoty).reduce((s, [k, x]) => s.replaceAll(`{${k}}`, String(x)), v);
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const praha = (o = 0) => ((d) => { d.setUTCDate(d.getUTCDate() + o); return d.toISOString().slice(0, 10); })(new Date(`${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now()))}T12:00:00Z`));
const DNY = { DNES: praha(0), VCERA: praha(-1), PREDEVCIREM: praha(-2), PRED3: praha(-3), PRED4: praha(-4), PRED5: praha(-5), PRED6: praha(-6) };
const MESIC = DNY.DNES.slice(0, 7);
const sDaty = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t.replaceAll('"MESIC"', `"${MESIC}"`));
};
/** Fixtura s holým DNES (finance, účtenky, prodeje po dnech — jako v k69-b5b). */
const sDnes = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8').replaceAll('DNES', DNY.DNES));
// Uzávěrky: fixtura z posledních dní + dvě z předminulého měsíce (MonthNav má co listovat).
const predminuly = (() => { const [y, m] = MESIC.split('-').map(Number); const d = new Date(Date.UTC(y, m - 3, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
const uzaverky = (() => { const z = sDaty('k69-b5a-closings'); return { ...z, closings: [...z.closings, ...[10, 11].map((dd, i) => ({ ...z.closings[2], id: 900 + i, date: `${predminuly}-${dd}`, shift_date: `${predminuly}-${dd}` }))] }; })();
// Inventura: žádná otevřená, jedna dokončená s rozdíly (id 3 = poslední v řadě ztrát).
const inventura = (() => {
  const s = nacti('k69-b3-stocktake');
  return { open: null, history: [{ id: 3, status: 'done', createdAt: '2026-09-20T07:00:00Z', completedAt: '2026-09-20T18:00:00Z',
    data: [{ itemId: 1, name: 'Mléko plnotučné', category: 'Mléčné', unit: 'l', unitCost: 25, expected: 8, counted: 6 }, ...s.open.data.slice(1, 2).map(r => ({ ...r, counted: 1 }))] }] };
})();

const podvrh = (req, json) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (m === 'PATCH' && path === '/api/orders') return json({ ok: true, restocked: 2 });
  if (m !== 'GET') return undefined;
  const mapa = {
    '/api/inventory/categories': 'k69-b3-categories', '/api/pos/usage': 'k69-b3-pos-usage', '/api/inventory/reports': 'k69-b3-reports',
    '/api/orders': 'k69-b3-orders', '/api/inventory/log': 'k69-b3-log', '/api/production': 'k69-b3-production', '/api/suppliers': 'suppliers',
    '/api/pos/products': 'k69-b4-pos-products',
  };
  if (path === '/api/inventory/log' && url.searchParams.get('itemId')) return json([]);
  if (path === '/api/inventory') {
    // Receptury chtějí suroviny z k69-b4 (káva zdražila → marže kolem cíle), Sklad položky z k69-b3.
    return json(req.headers().referer?.includes('recipes') ? nacti('k69-b4-inventory').map(i => (i.id === 2 ? { ...i, unitCost: 2600 } : i)) : nacti('k69-b3-inventory'));
  }
  if (path === '/api/stocktake') return json(inventura);
  if (path === '/api/inventory/shrinkage') return json(nacti('k69-b5b-shrinkage'));
  // Finance (H): stejné fixtury jako k69-b5b, den DNES podle Prahy.
  if (path === '/api/finance') return json({ ...sDnes('k69-b5b-finance'), month: url.searchParams.get('month') });
  if (path === '/api/finance/advice') return json(sDnes('k69-b5b-finance-advice'));
  if (path === '/api/pos/daily') return json(sDnes('k69-b5b-pos-daily'));
  if (path === '/api/pos/status') return json(sDnes('k69-b5b-pos-status'));
  if (path === '/api/receipts') return json(sDnes('k69-b5b-receipts'));
  if (path === '/api/teams') { const f = nacti('teams'); return json({ ...f, team: { ...f.team, margin_target_pct: 60 } }); }
  if (path === '/api/closings') return json(uzaverky);
  if (path === '/api/closings/calendar') return json({ ...sDaty('k69-b5a-calendar'), month: url.searchParams.get('month') ?? MESIC });
  if (path === '/api/closings/handover') return json(sDaty('k69-b5a-handover'));
  if (path === '/api/guides') return json({ guides: [] });
  if (path === '/api/pos/margins') return json(nacti('k69-b5b-pos-margins'));
  if (mapa[path]) return json(nacti(mapa[path]));
  return undefined;
};

/** Přetečení: dokument, a v daném prvku každý potomek, který by vyčuhoval do strany (posuvné pásy se nepočítají). */
const pretekani = (loc) => loc.evaluate(el => {
  const r = el.getBoundingClientRect();
  const ven = [...el.querySelectorAll('*')].filter(x => {
    if (x.closest('[role="tablist"], .overflow-x-auto, .sr-only')) return false;
    const b = x.getBoundingClientRect();
    return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1);
  }).map(x => `${x.tagName.toLowerCase()}.${String(x.className).slice(0, 30)}`);
  return { dokument: document.documentElement.scrollWidth - innerWidth, prvek: el.scrollWidth - el.clientWidth, ven: ven.slice(0, 4) };
});
const bezPreteceni = (m) => m.dokument <= 0 && m.prvek <= 0 && m.ven.length === 0;
const zdola = async (p, okno, vyska) => { await p.waitForTimeout(600); const r = await okno.boundingBox(); return !!r && Math.abs(r.y + r.height - vyska) <= 2; };
const vyskaCile = (loc) => loc.evaluate(b => Math.round(Math.max(b.getBoundingClientRect().height, parseFloat(getComputedStyle(b, '::before').height) || 0)));

for (const jazyk of ['cs', 'de', 'pl']) {
  const telefon = { width: 390, height: 844 };

  // ---- A) Okno příjmu zdola, po položkách ----
  for (const w of jazyk === 'cs' ? [390, 320] : [390]) {
    const { ctx, p } = await kontext({ viewport: { ...telefon, width: w }, mobil: true, fix: nacti('k69-b3-rozlozeni-sklad'), dalsi: podvrh });
    await nastavJazyk(ctx, jazyk);
    await otevri(p, '/employer/inventory', 'vedeni.sklad');
    const obj = p.locator('[data-plocha] li[data-widget="sklad.objednavky"]');
    await dokud(() => obj.getByRole('button', { name: tr(jazyk, 'widgety', 'Přijmout'), exact: true }).first().isVisible(), 5000);
    await obj.getByRole('button', { name: tr(jazyk, 'widgety', 'Přijmout'), exact: true }).first().click();
    const okno = p.getByRole('dialog', { name: new RegExp(esc(tr(jazyk, 'widgety', 'Přišlo od {dodavatel}?', { dodavatel: 'Makro' }))) });
    await dokud(() => okno.isVisible(), 3000);
    await okno.getByRole('tablist').getByRole('tab').nth(1).click();
    const radky = okno.locator('[data-radek-prijmu]');
    await dokud(async () => (await radky.count()) === 2, 3000);
    const pole = okno.locator('[data-radek-prijmu] input');
    tvrdi(`A ${jazyk} ${w}: okno příjmu vyjíždí zdola`, await zdola(p, okno, telefon.height));
    tvrdi(`A ${jazyk} ${w}: dvě položky, každá s polem Přišlo a cenou za balení (inputMode decimal)`, await pole.count() === 4
      && (await pole.evaluateAll(xs => xs.every(x => x.getAttribute('inputmode') === 'decimal'))));
    const rozmery = await pole.evaluateAll(xs => xs.map(x => ({ h: Math.round(x.getBoundingClientRect().height), f: parseFloat(getComputedStyle(x).fontSize) })));
    tvrdi(`A ${jazyk} ${w}: pole ≥ 44 px a písmo ≥ 16 px`, rozmery.every(x => x.h >= 44 && x.f >= 16), JSON.stringify(rozmery));
    const m = await pretekani(okno);
    tvrdi(`A ${jazyk} ${w}: okno ani řádky nepřetékají`, bezPreteceni(m), JSON.stringify(m));
    // Řádek se láme: název nahoře, pole pod ním (pevné sloupce se na telefon nevejdou).
    const lom = await radky.first().evaluate(li => { const n = li.querySelector('p'), i = li.querySelector('input'); return n && i ? i.getBoundingClientRect().top > n.getBoundingClientRect().bottom : false; });
    tvrdi(`A ${jazyk} ${w}: na telefonu je pole pod názvem položky`, lom);
    await radky.first().scrollIntoViewIfNeeded();
    await p.screenshot({ path: OUT + `k83-sklad-prijem-${jazyk}-${w}.png` });
    await ctx.close();
  }

  // ---- B) Dodavatelé zdola ----
  {
    const { ctx, p } = await kontext({ viewport: telefon, mobil: true, fix: nacti('k69-b3-rozlozeni-sklad'), dalsi: podvrh });
    await nastavJazyk(ctx, jazyk);
    await otevri(p, '/employer/inventory', 'vedeni.sklad');
    await p.getByRole('button', { name: tr(jazyk, 'spolecne', 'Další akce'), exact: true }).first().click();
    await p.getByRole('menuitem', { name: tr(jazyk, 'sprava', 'Dodavatelé') }).click();
    const okno = p.getByRole('dialog', { name: tr(jazyk, 'sprava', 'Dodavatelé') });
    await dokud(() => okno.isVisible(), 3000);
    tvrdi(`B ${jazyk}: Dodavatelé vyjíždí zdola`, await zdola(p, okno, telefon.height));
    const objednat = okno.getByRole('button', { name: tr(jazyk, 'sprava', 'Objednat od {nazev}', { nazev: 'Makro' }) });
    await dokud(() => objednat.isVisible(), 3000);
    tvrdi(`B ${jazyk}: „Objednat" má dotykovou plochu ≥ 44 px`, (await vyskaCile(objednat)) >= 44, String(await vyskaCile(objednat)));
    await p.screenshot({ path: OUT + `k83-sklad-dodavatele-${jazyk}.png` });
    await okno.getByRole('button', { name: tr(jazyk, 'sprava', 'Nový dodavatel') }).click();
    const ids = ['#sklad-dod-nazev', '#sklad-dod-email', '#sklad-dod-telefon', '#sklad-dod-poznamka'];
    await dokud(() => okno.locator(ids[0]).isVisible(), 2000);
    const boxy = await Promise.all(ids.map(id => okno.locator(id).boundingBox()));
    tvrdi(`B ${jazyk}: čtyři pole pod sebou (stejný levý okraj, každé níž)`, boxy.every(Boolean) && boxy.every((b, i) => i === 0 || (Math.abs(b.x - boxy[0].x) < 2 && b.y > boxy[i - 1].y)), JSON.stringify(boxy.map(b => b && [Math.round(b.x), Math.round(b.y)])));
    const m = await pretekani(okno);
    tvrdi(`B ${jazyk}: okno nepřetéká`, bezPreteceni(m), JSON.stringify(m));
    await p.screenshot({ path: OUT + `k83-sklad-dodavatele-novy-${jazyk}.png` });
    await ctx.close();
  }

  // ---- C) Uzávěrky na 320: Vše | Měsíc a MonthNav v hlavičce seznamu ----
  {
    const { ctx, p } = await kontext({ viewport: { width: 320, height: 800 }, mobil: true, fix: sDaty('k69-b5a-rozlozeni-uzaverky'), dalsi: podvrh });
    await nastavJazyk(ctx, jazyk);
    await otevri(p, '/employer/overview?view=reports', 'vedeni.uzaverky');
    const nastroj = p.locator('li[data-widget="nastroj"]');
    const obdobi = nastroj.getByRole('tablist', { name: tr(jazyk, 'sprava', 'Období') });
    await dokud(() => obdobi.isVisible(), 6000);
    await obdobi.getByRole('tab').nth(1).click();
    const nav = nastroj.getByRole('group', { name: tr(jazyk, 'spolecne', 'Měsíc') });
    tvrdi(`C ${jazyk}: MonthNav v hlavičce seznamu`, await dokud(() => nav.isVisible(), 2000));
    const m = await pretekani(nastroj);
    tvrdi(`C ${jazyk} 320: hlavička s přepínačem a MonthNav nepřetéká`, bezPreteceni(m), JSON.stringify(m));
    const nazev = await nav.locator('[aria-live]').evaluate(s => ({ w: s.clientWidth, sw: s.scrollWidth }));
    tvrdi(`C ${jazyk} 320: název měsíce se vejde celý (nezkrácený)`, nazev.sw <= nazev.w + 1, JSON.stringify(nazev));
    await nastroj.scrollIntoViewIfNeeded();
    await p.screenshot({ path: OUT + `k83-sklad-uzaverky-320-${jazyk}.png` });
    await ctx.close();
  }

  // ---- D) Nastavení › Profil podniku: Cílová marže ----
  {
    const { ctx, p } = await kontext({ viewport: telefon, mobil: true, dalsi: podvrh });
    await nastavJazyk(ctx, jazyk);
    await p.goto(BASE + '/employer/overview?view=settings', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: new RegExp(esc(tr(jazyk, 'spolecne', 'Profil podniku'))) }).filter({ visible: true }).first().click();
    const pole = p.locator('#tym-cil-marze');
    tvrdi(`D ${jazyk}: Profil podniku má pole Cílová marže (60 z /api/teams, inputMode numeric)`, await dokud(() => pole.isVisible(), 6000)
      && await pole.inputValue() === '60' && await pole.getAttribute('inputmode') === 'numeric');
    const pres = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    tvrdi(`D ${jazyk}: bez vodorovného přetečení`, pres <= 0, String(pres));
    await pole.scrollIntoViewIfNeeded();
    await p.screenshot({ path: OUT + `k83-sklad-profil-${jazyk}.png` });
    await ctx.close();
  }

  // ---- E) Receptury: pilulky a Řadit v jednom pásu ----
  {
    const { ctx, p } = await kontext({ viewport: telefon, mobil: true, fix: nacti('k69-b4-rozlozeni-receptury'), dalsi: podvrh });
    await nastavJazyk(ctx, jazyk);
    await otevri(p, '/employer/recipes', 'vedeni.receptury');
    const nastroj = p.locator('li[data-widget="nastroj"]');
    const pas = nastroj.getByRole('group', { name: tr(jazyk, 'sklad', 'Filtry receptur') });
    await dokud(() => pas.isVisible(), 6000);
    const razeni = nastroj.getByRole('button', { name: new RegExp(`^${esc(tr(jazyk, 'sklad', 'Řadit: {druh}', { druh: '' }))}`) });
    const [bp, bm] = [await pas.boundingBox(), await razeni.boundingBox()];
    tvrdi(`E ${jazyk}: pilulky a Řadit v jednom řádku`, bp && bm && Math.abs((bp.y + bp.height / 2) - (bm.y + bm.height / 2)) < 6, JSON.stringify([bp, bm]));
    tvrdi(`E ${jazyk}: pilulka „Pod cílem" je (cíl podniku 60 %)`, await pas.getByRole('button').count() === 2);
    const m = await pretekani(nastroj);
    tvrdi(`E ${jazyk}: Receptury nepřetékají`, bezPreteceni(m), JSON.stringify(m));
    await pas.scrollIntoViewIfNeeded();
    await p.screenshot({ path: OUT + `k83-sklad-receptury-${jazyk}.png` });
    await ctx.close();
  }

  // ---- F) Inventura: minulé inventury s hodnotou rozdílu ----
  {
    const { ctx, p } = await kontext({ viewport: telefon, mobil: true, fix: nacti('k69-b3-rozlozeni-sklad'), dalsi: podvrh });
    await nastavJazyk(ctx, jazyk);
    await otevri(p, '/employer/inventory', 'vedeni.sklad');
    await p.getByRole('button', { name: tr(jazyk, 'spolecne', 'Další akce'), exact: true }).first().click();
    await p.getByRole('menuitem', { name: new RegExp(`^${esc(tr(jazyk, 'sprava', 'Inventura'))}`) }).click();
    const okno = p.getByRole('dialog').filter({ hasText: tr(jazyk, 'sklad', 'Minulé inventury') });
    await dokud(() => okno.isVisible(), 5000);
    const radek = okno.locator('section[aria-labelledby="inventura-historie"] li').first();
    // Řada ztrát má u inventury id 3 čistý rozdíl −1 630 (fixtura k69-b5b-shrinkage).
    tvrdi(`F ${jazyk}: minulá inventura ukazuje rozdíl v penězích (−1 630, červeně)`, await dokud(async () => /1\s?630/.test((await radek.innerText()).replace(/\s/g, ' ')), 4000)
      && /text-bad-ink/.test(await radek.locator('.list-value span span').first().getAttribute('class') ?? ''), (await radek.innerText()).replace(/\s+/g, ' '));
    const m = await pretekani(okno);
    tvrdi(`F ${jazyk}: Inventura nepřetéká`, bezPreteceni(m), JSON.stringify(m));
    await radek.scrollIntoViewIfNeeded();
    await p.screenshot({ path: OUT + `k83-sklad-inventura-${jazyk}.png` });
    await ctx.close();
  }

  // ---- G) Uzávěrky: Souhrn L s metrikou Hosté ----
  {
    const { ctx, p } = await kontext({ viewport: telefon, mobil: true, fix: sDaty('k69-b5a-rozlozeni-uzaverky'), dalsi: podvrh });
    await nastavJazyk(ctx, jazyk);
    await otevri(p, '/employer/overview?view=reports', 'vedeni.uzaverky');
    const souhrn = p.locator('[data-plocha] li[data-widget="uzaverky.souhrn"]');
    const metriky = souhrn.getByRole('tablist', { name: tr(jazyk, 'widgety', 'Co ukázat v grafu') });
    await dokud(() => metriky.isVisible(), 6000);
    const hoste = metriky.getByRole('tab', { name: tr(jazyk, 'widgety', 'Hosté') });
    tvrdi(`G ${jazyk}: Souhrn L nabízí metriku Hosté (čtvrtá volba)`, await hoste.count() === 1 && await metriky.getByRole('tab').count() === 4);
    const radek = await metriky.evaluate(el => { const ys = [...el.querySelectorAll('[role="tab"]')].map(t => Math.round(t.getBoundingClientRect().top)); return new Set(ys).size; });
    tvrdi(`G ${jazyk}: všechny čtyři volby v jednom řádku`, radek === 1, String(radek));
    await hoste.click();
    const txt = await dokud(async () => /264/.test(await souhrn.innerText()), 3000) ? (await souhrn.innerText()).replace(/\s+/g, ' ') : '';
    tvrdi(`G ${jazyk}: hlavní číslo 264 hostů bez měny a pod ním Ø na hosta`, /264/.test(txt) && !/264\s*(Kč|CZK)/.test(txt) && /234/.test(txt), txt.slice(0, 160));
    const m = await pretekani(souhrn);
    tvrdi(`G ${jazyk}: Souhrn nepřetéká`, bezPreteceni(m), JSON.stringify(m));
    await souhrn.scrollIntoViewIfNeeded();
    await p.screenshot({ path: OUT + `k83-sklad-souhrn-hoste-${jazyk}.png` });
    await ctx.close();
  }

  // ---- H) Finance: Ztráty a manka L s Chipem změny a BarSparkem ----
  {
    const zaklad = sDnes('k69-b5b-rozlozeni-finance');
    const fixL = { ...zaklad, polozky: [{ id: 'ztraty', widget: 'finance.ztraty', velikost: 'L' }, { id: 'nastroj', widget: 'nastroj', velikost: 'L' }] };
    const { ctx, p } = await kontext({ viewport: telefon, mobil: true, fix: fixL, dalsi: podvrh });
    await nastavJazyk(ctx, jazyk);
    await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
    const li = p.locator('[data-plocha] li[data-widget="finance.ztraty"]').first();
    const graf = li.locator('[role="group"][aria-label]').first();
    tvrdi(`H ${jazyk}: BarSpark posledních 6 inventur pod čísly, nejnovější zvýrazněná`, await dokud(() => graf.isVisible(), 8000)
      && await graf.locator('.spark-sloupek, .spark-sloupek-hl').count() === 6 && await graf.locator('.spark-sloupek-hl').count() === 1);
    tvrdi(`H ${jazyk}: Chip změny proti minulé inventuře (650)`, /650/.test((await li.innerText()).replace(/\s/g, ' ')), (await li.innerText()).replace(/\s+/g, ' ').slice(0, 200));
    const m = await pretekani(li);
    tvrdi(`H ${jazyk}: graf ani chip nepřetékají widget`, bezPreteceni(m), JSON.stringify(m));
    await li.scrollIntoViewIfNeeded();
    await p.screenshot({ path: OUT + `k83-sklad-ztraty-${jazyk}.png` });
    await ctx.close();
  }
}
await konec();
