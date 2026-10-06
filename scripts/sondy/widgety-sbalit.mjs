// Widgety: sbalit / rozbalit a „klepnutí, které nic nedělá".
//  1) Na stránce, kam widget sám vede (Tržba po dnech na Financích), není šipka „Otevřít" (nic by neudělala);
//     místo ní je „Sbalit" — sbalí tělo, volba přežije obnovení stránky, „Rozbalit" ji vrátí; klepnutí do
//     hlavičky totéž; klepnutí do těla kartu nesbalí ani nikam nevede.
//  2) Na jiné stránce (Souhrn měsíce na Přehledu → Finance) šipka „Otevřít" zůstává a klepnutí naviguje.
//  3) Dlouhý obsah se zkrátí s „Zobrazit vše" a jde rozbalit.
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
await konec();
