// „Rozsype se layout" nemusí znamenat přetečení. Tohle měří skok: o kolik
// se posune obsah, když se v ukázce funkcí přepne scéna. Panel má na
// monitoru min-height, na telefonu žádnou — takže se stránka každých 6 s
// sama od sebe zkrátí nebo prodlouží pod rukou toho, kdo zrovna čte.
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:3000/';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

for (const w of [390, 768, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('#funkce')?.scrollIntoView());
  await p.waitForTimeout(500);

  const zalozky = await p.$$('#funkce [role="tab"]');
  const vysky = [];
  for (let i = 0; i < zalozky.length; i++) {
    await zalozky[i].click();
    await p.waitForTimeout(700); // scéna se rozjede
    const h = await p.evaluate(() => {
      const el = document.getElementById('fn-panel');
      const r = el.getBoundingClientRect();
      return { panel: Math.round(r.height), stranka: Math.round(document.body.scrollHeight) };
    });
    const jmeno = await zalozky[i].innerText();
    vysky.push({ jmeno: jmeno.trim(), ...h });
  }
  const hs = vysky.map(v => v.panel);
  const min = Math.min(...hs), max = Math.max(...hs);
  console.log(`\n=== ${w} px ===  panel min ${min}  max ${max}  ROZKMIT ${max - min} px`);
  for (const v of vysky) console.log(`   ${String(v.panel).padStart(4)} px  ${v.jmeno}`);
  await ctx.close();
}
await b.close();
