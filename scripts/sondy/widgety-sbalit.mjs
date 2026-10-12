// Widgety: sbalit / rozbalit a „klepnutí, které nic nedělá".
//  1) Na stránce, kam widget sám vede (Tržba po dnech na Financích), není šipka „Otevřít" (nic by neudělala);
//     místo ní je „Sbalit" — sbalí tělo, volba přežije obnovení stránky, „Rozbalit" ji vrátí; klepnutí do
//     hlavičky totéž; klepnutí do těla kartu nesbalí ani nikam nevede.
//  2) Na jiné stránce (Souhrn měsíce na Přehledu → Finance) šipka „Otevřít" zůstává a klepnutí naviguje.
//  3) Dlouhý obsah se zkrátí s „Zobrazit vše" a jde rozbalit.
//  4) Telefon (kolo 6, Z14/V14): malá karta s cílem má šipku „Otevřít" vpravo dole vedle čísla, ne
//     v hlavičce (název má celou šířku); minimalizovaná malá karta zabere celý řádek mřížky.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, fixtura, DIR, OUT, BASE } from './k68-spolecne.mjs';
import { dayPlus, pragueToday } from '../../lib/pragueTime.ts';

const dnes = pragueToday();
const dalsi = (req, json) => {
  const u = new URL(req.url()); if (req.method() !== 'GET') return undefined;
  if (u.pathname === '/api/pos/daily') {
    const od = u.searchParams.get('from'), doD = u.searchParams.get('to');
    const days = []; let n = 0;
    for (let d = od; d <= doD && n < 40; d = dayPlus(d, 1), n++) {
      const total = 12000 + ((Number(d.slice(8)) * 1731) % 9000);
      days.push({ day: d, bills: 90, cash: total / 3, card: total * 2 / 3, other: 0, total, tips: 0, tipsCash: 0, tipsCard: 0, discounts: 0, refundCount: 0, refundTotal: 0, persons: 0, closings: 0, declared: null, diff: null });
    }
    const base = JSON.parse(readFileSync(DIR + 'k69-b5b-pos-daily.json', 'utf8').replaceAll('DNES', dnes));
    return json({ ...base, from: od, to: doD, days, totals: { ...base.totals, total: days.reduce((s, x) => s + x.total, 0) } });
  }
  if (u.pathname === '/api/finance') return json({ ...JSON.parse(readFileSync(DIR + 'k69-b5b-finance.json', 'utf8').replaceAll('DNES', dnes)), month: u.searchParams.get('month') });
  return undefined;
};
const fix = (polozky) => ({ ...fixtura('k69-b5b-rozlozeni-finance'), polozky });
const FINANCE = fix([
  { id: 'po-dnech', widget: 'trzby.po_dnech', velikost: 'L', nastaveni: { obdobi: 'mesic_stranky' } },
  { id: 'souhrn', widget: 'finance.souhrn_mesice', velikost: 'L' },
]);
const li = (p, id) => p.locator(`[data-plocha] li[data-instance="${id}"]`);

for (const w of [1280, 390]) {
  const { ctx, p } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, fix: FINANCE, dalsi });
  await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
  await p.waitForTimeout(800);
  const karta = li(p, 'po-dnech');
  tvrdi(`1 ${w}: na vlastní stránce není šipka „Otevřít" (nic by neudělala)`, await karta.getByRole('button', { name: /^Otevřít/ }).count() === 0);
  const sbalit = karta.getByRole('button', { name: /^Sbalit/ });
  tvrdi(`1 ${w}: je tlačítko „Sbalit" a tělo je vidět`, await sbalit.count() === 1 && await karta.getByText(/Tržba po jednotlivých dnech|Celkem|Kč/).first().isVisible());
  const vyskaPred = (await karta.boundingBox())?.height ?? 0;
  await sbalit.click();
  tvrdi(`1 ${w}: po „Sbalit" zůstane jen hlavička (karta je výrazně nižší)`, await dokud(async () => ((await karta.boundingBox())?.height ?? 999) < vyskaPred / 3, 3000), `${vyskaPred} → ${(await karta.boundingBox())?.height}`);
  tvrdi(`1 ${w}: a nabízí „Rozbalit" s aria-expanded=false`, await karta.getByRole('button', { name: /^Rozbalit/ }).getAttribute('aria-expanded') === 'false');
  await p.reload({ waitUntil: 'networkidle' });
  await p.locator('[data-plocha] li[data-instance]').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(800);
  tvrdi(`1 ${w}: sbalení přežije obnovení stránky`, await li(p, 'po-dnech').getByRole('button', { name: /^Rozbalit/ }).count() === 1);
  await li(p, 'po-dnech').getByRole('button', { name: /^Rozbalit/ }).click();
  tvrdi(`1 ${w}: „Rozbalit" vrátí obsah`, await dokud(async () => ((await li(p, 'po-dnech').boundingBox())?.height ?? 0) > vyskaPred / 2, 3000));

  // klepnutí do hlavičky (na název) také sbalí
  await li(p, 'po-dnech').locator('h2').click();
  tvrdi(`1 ${w}: klepnutí na název karty ji sbalí`, await dokud(async () => await li(p, 'po-dnech').getByRole('button', { name: /^Rozbalit/ }).count() === 1, 3000));
  await li(p, 'po-dnech').locator('h2').click();
  await dokud(async () => await li(p, 'po-dnech').getByRole('button', { name: /^Sbalit/ }).count() === 1, 3000);

  // klepnutí do těla nesbalí a nikam nevede
  const url0 = p.url();
  await li(p, 'souhrn').locator('p, span').first().click({ position: { x: 20, y: 6 } }).catch(() => {});
  await p.waitForTimeout(400);
  tvrdi(`1 ${w}: klepnutí do těla karty nic nesbalí a nenaviguje`, p.url() === url0 && await li(p, 'souhrn').getByRole('button', { name: /^Sbalit/ }).count() === 1);

  // dlouhý obsah: celý měsíc dnů je delší než práh → zkrácení + „Zobrazit vše"
  const dlouha = li(p, 'po-dnech');
  await p.getByRole('button', { name: 'Předchozí měsíc' }).click();
  await dokud(async () => await dlouha.locator('[data-zkraceno]').count() === 1, 6000);
  tvrdi(`3 ${w}: dlouhý obsah je zkrácený a nabízí „Zobrazit vše"`, await dlouha.locator('[data-zkraceno]').count() === 1 && await dlouha.getByRole('button', { name: 'Zobrazit vše', exact: true }).count() === 1);
  const vyskaZkr = (await dlouha.boundingBox())?.height ?? 0;
  await dlouha.getByRole('button', { name: 'Zobrazit vše', exact: true }).click();
  tvrdi(`3 ${w}: „Zobrazit vše" obsah rozbalí (karta naroste, „Ukázat méně")`, await dokud(async () => await dlouha.locator('[data-zkraceno]').count() === 0, 3000) && ((await dlouha.boundingBox())?.height ?? 0) > vyskaZkr && await dlouha.getByRole('button', { name: 'Ukázat méně' }).count() === 1);
  const pres = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  tvrdi(`1 ${w}: bez vodorovného přetečení`, pres <= 0, String(pres));
  if (w === 390) { await dlouha.scrollIntoViewIfNeeded(); await p.screenshot({ path: OUT + 'widgety-sbalit.png' }); }
  await ctx.close();
}

// 2) Přehled: Souhrn měsíce vede na Finance → šipka „Otevřít" je a klepnutí navigovalo
{
  const prehled = { ...fixtura('k68-rozlozeni-vedeni'), polozky: [{ id: 'souhrn', widget: 'finance.souhrn_mesice', velikost: 'M' }] };
  const { ctx, p } = await kontext({ viewport: { width: 1280, height: 900 }, fix: prehled, dalsi });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  await p.waitForTimeout(800);
  const k = li(p, 'souhrn');
  const jdi = k.getByRole('button', { name: /^(Otevřít|Finance)/ });
  tvrdi('2: na Přehledu vede Souhrn měsíce jinam — má odkaz „Finance ›" (nebo šipku „Otevřít")', await jdi.count() === 1);
  tvrdi('2: a je u něj i „Sbalit"', await k.getByRole('button', { name: /^Sbalit/ }).count() === 1);
  await jdi.click();
  tvrdi('2: odkaz přepne na Finance (nadpis stránky)', await dokud(async () => (await p.locator('h1').first().innerText().catch(() => '')).trim() === 'Finance', 5000), await p.locator('h1').first().innerText().catch(() => ''));
  await ctx.close();
}
// 4) Telefon 390: šipka malé karty pod názvem, minimalizovaná malá karta přes celý řádek.
{
  const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
  const uzaverky = (vseSchvaleno) => (req, json) => {
    const u = new URL(req.url());
    if (req.method() !== 'GET' || u.pathname !== '/api/closings') return dalsi(req, json);
    let t = readFileSync(DIR + 'k69-b5a-closings.json', 'utf8');
    for (const [k, o] of [['VCERA', -1], ['PREDEVCIREM', -2], ['PRED3', -3], ['PRED4', -4], ['PRED5', -5], ['PRED6', -6], ['DNES', 0]]) t = t.replaceAll(`"${k}"`, `"${praha(o)}"`);
    const d = JSON.parse(t.replaceAll('"MESIC"', `"${praha().slice(0, 7)}"`));
    if (vseSchvaleno) d.closings = d.closings.map(c => ({ ...c, approved: true }));
    return json(d);
  };
  const prehled = { ...fixtura('k68-rozlozeni-vedeni'), polozky: [
    { id: 'ke-schvaleni', widget: 'uzaverky.ke_schvaleni', velikost: 'S' },
    { id: 'chat', widget: 'chat.neprectene', velikost: 'S' },
  ] };
  for (const vseSchvaleno of [false, true]) {
    const { ctx, p } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, fix: prehled, dalsi: uzaverky(vseSchvaleno) });
    await otevri(p, '/employer/overview', 'vedeni.prehled');
    await p.waitForTimeout(800);
    const k = li(p, 'ke-schvaleni');
    if (!vseSchvaleno) {
      const m = await k.evaluate(el => {
        const h2 = el.querySelector('h2'); const hlavicka = h2?.parentElement;
        const sipka = [...el.querySelectorAll('button')].find(b => b.getAttribute('aria-label')?.startsWith('Otevřít'));
        const r = (x) => x?.getBoundingClientRect();
        return { vHlavicce: !!hlavicka?.querySelector('button'), sipkaPodNazvem: !!sipka && r(sipka).top >= r(h2).bottom, sipkaVpravo: !!sipka && r(el).right - r(sipka).right <= 24,
          nazevSirka: Math.round(r(h2).width), karta: Math.round(r(el).width) };
      });
      tvrdi('4 390: malá karta s cílem má šipku „Otevřít" vpravo dole, ne v hlavičce vedle názvu', !m.vHlavicce && m.sipkaPodNazvem && m.sipkaVpravo, JSON.stringify(m));
      tvrdi('4 390: název malé karty má celou šířku karty (bez ovládání vedle)', m.nazevSirka >= m.karta - 40, JSON.stringify(m));
      await k.getByRole('button', { name: /^Otevřít/ }).click();
      tvrdi('4 390: šipka malé karty dál vede na cíl (Uzávěrky)', await dokud(async () => (await p.locator('h1').first().innerText().catch(() => '')).trim() === 'Uzávěrky', 5000));
    } else {
      const m = await p.evaluate(() => {
        const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
        const mini = document.querySelector('[data-plocha] li[data-instance="ke-schvaleni"] section');
        const souhrn = mini?.querySelector('p');
        return { mini: !!mini && /vyřízeno/.test(mini.getAttribute('aria-label') ?? ''), li: Math.round(r('[data-plocha] li[data-instance="ke-schvaleni"]')?.width ?? 0),
          mrizka: Math.round(r('[data-plocha] ul')?.width ?? 0), souhrnCely: !!souhrn && souhrn.scrollWidth <= souhrn.clientWidth + 1 };
      });
      tvrdi('4 390: vyřízená malá karta je minimalizovaná a zabere celý řádek mřížky', m.mini && m.li >= m.mrizka - 1, JSON.stringify(m));
      tvrdi('4 390: …souhrn minimalizované karty není useknutý', m.souhrnCely, JSON.stringify(m));
    }
    tvrdi(`4 390${vseSchvaleno ? ' (vyřízeno)' : ''}: bez vodorovného přetečení`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await ctx.close();
  }
}
await konec();
