import { chromium } from 'playwright-core';
const [,, out, w, h, ...pozice] = process.argv;
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
await p.goto('http://localhost:3100/', { waitUntil: 'networkidle', timeout: 120000 });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.waitForTimeout(5000);
for (const poz of pozice) {
  if (poz.startsWith('#')) await p.evaluate(s => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 70); }, poz);
  else await p.evaluate(y => window.scrollTo(0, y), +poz);
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${out}-${poz.replace('#', '')}.png` });
}
console.log('vyska', await p.evaluate(() => document.body.scrollHeight));
await b.close();
