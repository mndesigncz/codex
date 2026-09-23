import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const out = {};
for (const [name, vp] of [['desk', { width: 1440, height: 900 }], ['mob', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, locale: 'cs-CZ', deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  // stěna po scrollu do obrazu
  const stena = p.locator('.stena').first();
  await stena.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, 160)); await p.waitForTimeout(900);
  await p.screenshot({ path: `${process.env.S}/k57-${name}-stena.png` });
  out[`${name}.header.posunuto`] = await p.locator('.lg-bar.posunuto').count();
  // panel funkcí: výška zařízení přes všech 12 scén
  const vysky = [];
  const taby = p.getByRole('tab');
  const n = await taby.count();
  for (let i = 0; i < n; i++) {
    await taby.nth(i).click(); await p.waitForTimeout(150);
    const h = await p.locator('#fn-panel .zarizeni').first().evaluate(el => el.getBoundingClientRect().height);
    const ph = await p.locator('#fn-panel').evaluate(el => el.getBoundingClientRect().height);
    vysky.push([Math.round(h), Math.round(ph)]);
  }
  out[`${name}.zarizeni[h,panel]`] = vysky;
  await p.locator('#funkce').scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
  out[`${name}.nav.aktivni`] = await p.locator('header [data-on="true"]').textContent().catch(() => null);
  await p.screenshot({ path: `${process.env.S}/k57-${name}-funkce.png` });
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await b.close();
