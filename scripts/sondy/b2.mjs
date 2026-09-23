import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const p = await (await b.newContext({ viewport: { width: 900, height: 620 }, locale: 'cs-CZ' })).newPage();
await p.goto('http://localhost:3000/__boundary-test', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.screenshot({ path: 'shots/boundary-test.png' });
console.log((await p.locator('body').innerText()).slice(0, 300));
await b.close();
