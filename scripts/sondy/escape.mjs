// Co se stane s rozepsaným textem, když okno zavřu omylem.
// Kolo 7 zavedlo Escape do všech oken. Nikdo nezměřil, co Escape zahodí.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const VSE = [
  ...JSON.parse(readFileSync(new URL('./screens.json', import.meta.url).pathname, 'utf8')),
  ...JSON.parse(readFileSync(new URL('./screens-client.json', import.meta.url).pathname, 'utf8')),
];
const SCREENS = [...new Map(VSE.map(r => [r[2], r])).values()];
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();

const ZNAK = 'SONDA-NEDOPSANY-TEXT';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let ztraty = 0, hlidano = 0, oken = 0;
const nalezy = [];
for (const [name, role, path] of SCREENS) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  if (role) await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  p.on('dialog', d => d.dismiss().catch(() => {}));
  await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1200);

  // Kandidáti na otevření okna: viditelná tlačítka se smysluplným jménem.
  const pocet = await p.locator('button:visible').count().catch(() => 0);
  for (let i = 0; i < Math.min(pocet, 26); i++) {
    const btn = p.locator('button:visible').nth(i);
    const jmeno = (await btn.innerText().catch(() => '') || await btn.getAttribute('aria-label').catch(() => '') || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!jmeno) continue;
    await btn.click({ timeout: 2500 }).catch(() => {});
    await p.waitForTimeout(450);
    const okno = p.locator('.modal-sheet:visible, [role="dialog"]:visible').first();
    if (!(await okno.count().catch(() => 0))) { await p.keyboard.press('Escape').catch(() => {}); continue; }
    const pole = okno.locator('textarea:visible, input[type="text"]:visible, input:not([type]):visible').first();
    if (!(await pole.count().catch(() => 0))) { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(250); continue; }
    oken++;
    await pole.fill(ZNAK).catch(() => {});
    await p.waitForTimeout(150);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
    const porad = await p.locator('.modal-sheet:visible, [role="dialog"]:visible').count().catch(() => 0);
    if (porad) { hlidano++; await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(300);
      await p.locator('.modal-sheet:visible, [role="dialog"]:visible').count().then(async c => { if (c) { await p.reload({ waitUntil: 'networkidle' }).catch(()=>{}); await p.waitForTimeout(900); } });
      continue; }
    // Okno zmizelo. Otevřít znovu a podívat se, jestli text přežil.
    await btn.click({ timeout: 2500 }).catch(() => {});
    await p.waitForTimeout(450);
    const znovu = p.locator('.modal-sheet:visible, [role="dialog"]:visible').first();
    const prezil = (await znovu.count().catch(() => 0)) ? (await znovu.innerHTML().catch(() => '')).includes(ZNAK) || (await znovu.locator(`textarea, input`).evaluateAll((els, z) => els.some(e => e.value === z), ZNAK).catch(() => false)) : false;
    if (!prezil) { ztraty++; nalezy.push(`${name} · „${jmeno}"`); }
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(250);
  }
  await ctx.close();
}
console.log(`\nOken s rozepsaným textem: ${oken}. Escape se zeptal: ${hlidano}. Text zmizel bez varování: ${ztraty}.`);
for (const n of nalezy) console.log('  ✗ ' + n);
await b.close();
