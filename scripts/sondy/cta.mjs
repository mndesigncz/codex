// Bílý text na fotce. Text se schová, vyfotí se samotný prvek (ne výřez
// stránky — ten se počítá od začátku dokumentu, ne od okna, a snadno
// sfotíte úplně jiné místo) a hledá se NEJSVĚTLEJŠÍ pixel podkladu.
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const lum = (r, g, b2) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b2);
};
const kontrast = (L) => +(1.05 / (L + 0.05)).toFixed(2);

for (const w of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); } });
  await p.waitForTimeout(500);
  const el = await p.evaluateHandle(() => {
    const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('Zítřejší směna'));
    const obal = h.parentElement;
    obal.scrollIntoView({ block: 'center' });
    [...obal.querySelectorAll('h2, p, a, span, svg, div')].forEach(e => { e.style.visibility = 'hidden'; });
    return obal;
  });
  await p.waitForTimeout(250);
  const buf = await el.asElement().screenshot();
  const png = PNG.sync.read(buf);
  let max = 0, sum = 0, n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const L = lum(png.data[i], png.data[i + 1], png.data[i + 2]);
    if (L > max) max = L; sum += L; n++;
  }
  console.log(`${w} px  ${png.width}x${png.height}px  nejhorší místo → bílá ${kontrast(max)} : 1   průměr ${kontrast(sum / n)} : 1   ${kontrast(max) >= 4.5 ? 'OK' : 'POD NORMOU'}`);
  await ctx.close();
}
await b.close();
