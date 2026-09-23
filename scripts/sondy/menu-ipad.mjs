// Menu na iPadu před podnikem — statická stránka, kterou sonda přes
// screens.json nikdy nevidí.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
for (const [jm, w, h] of [['iPad na výšku', 810, 1080], ['iPad na šířku', 1080, 810]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: true });
  const chyby = []; p.on('pageerror', e => chyby.push(String(e).slice(0, 120)));
  await p.goto('http://localhost:3000/menu-akce.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const m = await p.evaluate(() => {
    const sw = document.documentElement.clientWidth;
    let nula = 0, maleTexty = 0;
    for (const el of document.querySelectorAll('p,span,div,h1,h2,h3,li')) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim(); if (t.length < 3) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (r.width < 6 && r.height > 0) nula++;
      if (parseFloat(cs.fontSize) < 14) maleTexty++;   // na iPadu přes výčep se čte z dálky
    }
    return { prestek: document.documentElement.scrollWidth > sw + 2, nula, maleTexty,
      text: (document.body.innerText || '').trim().length };
  });
  console.log(`${jm} ${w}×${h}: přetéká=${m.prestek ? 'ANO ✗' : 'ne ✓'} · zkolabovaný text=${m.nula}${m.nula ? ' ✗' : ' ✓'} · písmo pod 14px=${m.maleTexty} · délka textu=${m.text}${chyby.length ? '  CHYBY: ' + chyby.join('|') : ''}`);
  await p.screenshot({ path: `shots/menu-${w}x${h}.png` });
  await p.close();
}
await b.close();
