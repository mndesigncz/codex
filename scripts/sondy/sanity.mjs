// Kontrola měřidla, ne stránky. Do hotové stránky se vloží prvek, o kterém
// se ví, že přetéká, a prvek, o kterém se ví, že končí v půlce. Když je
// sonda nenajde, nula z předchozího běhu nic neznamená.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
const r = await p.evaluate(() => {
  const s = document.querySelector('section');
  const zly = document.createElement('div');
  zly.style.cssText = 'width:200vw;height:24px;background:red';
  zly.className = 'lgx';
  s.appendChild(zly);
  const pul = document.createElement('div');
  pul.className = 'lgx';
  pul.style.cssText = 'width:70%;height:24px;background:blue';
  s.appendChild(pul);
  const vw = window.innerWidth;
  const rz = zly.getBoundingClientRect();
  const rp = pul.getBoundingClientRect();
  const rodic = s.getBoundingClientRect().width - parseFloat(getComputedStyle(s).paddingLeft) - parseFloat(getComputedStyle(s).paddingRight);
  return {
    pretekl: rz.right > vw + 1,
    rozjeto: document.documentElement.scrollWidth > vw + 1,
    podilPuleneho: +(rp.width / rodic).toFixed(2),
  };
});
console.log('vložený široký prvek přetekl:', r.pretekl ? 'ANO (sonda by ho našla)' : 'NE — sonda je slepá');
console.log('stránka se rozjela do strany:', r.rozjeto ? 'ANO (detektor funguje)' : 'NE — detektor je slepý');
console.log('vložený poloviční prvek má podíl:', r.podilPuleneho, r.podilPuleneho > 0.55 && r.podilPuleneho < 0.93 ? '(spadl by do pásma „končí v půlce")' : '(mimo pásmo — pravidlo B je špatně nastavené)');
await b.close();
