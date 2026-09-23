// Dvojklik na tlačítko, které něco zakládá. Vznikne jedna věc, nebo dvě?
// Kuchyň klikne dvakrát pokaždé, když server odpoví o chlup pomaleji.
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

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let dvojice = 0, kliku = 0;
const nalezy = new Map();
for (const [name, role, path] of SCREENS) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  if (role) await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const mutace = [];
  await ctx.route('**/api/**', async route => {
    const r = route.request();
    const u = r.url();
    if (u.includes('/api/auth/')) return route.continue();
    if (r.method() !== 'GET') {
      mutace.push({ m: r.method(), u: u.replace(/^https?:\/\/[^/]+/, ''), b: (r.postData() || '').slice(0, 300), t: Date.now() });
      // Odpověď schválně opožděná: přesně v té mezeře uživatel klikne podruhé.
      await new Promise(res => setTimeout(res, 700));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":1}' });
    }
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  p.on('dialog', d => d.dismiss().catch(() => {}));
  await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1200);

  const pocet = await p.locator('button:visible').count().catch(() => 0);
  for (let i = 0; i < Math.min(pocet, 20); i++) {
    const btn = p.locator('button:visible').nth(i);
    const jmeno = ((await btn.innerText().catch(() => '')) || (await btn.getAttribute('aria-label').catch(() => '')) || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    if (!jmeno) continue;
    mutace.length = 0;
    // Dvojklik s krátkou prodlevou — tak, jak to udělá netrpělivá ruka.
    await btn.click({ timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(90);
    await btn.click({ timeout: 1500, force: true }).catch(() => {});
    kliku++;
    await p.waitForTimeout(1400);
    // Dvě stejné mutace = dva záznamy.
    const podle = new Map();
    for (const m of mutace) {
      if (m.m !== 'POST' && m.m !== 'PUT') continue;
      const k = m.m + ' ' + m.u + ' ' + m.b;
      podle.set(k, (podle.get(k) ?? 0) + 1);
    }
    for (const [k, n] of podle) if (n > 1) {
      dvojice++;
      const klic = `${name} · „${jmeno}" → ${n}× ${k.slice(0, 60)}`;
      nalezy.set(klic, (nalezy.get(klic) ?? 0) + 1);
      console.log('  ✗ ' + klic);
    }
    // Uklidit případné otevřené okno.
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(150);
    if (await p.locator('.modal-sheet:visible, [role="dialog"]:visible').count().catch(() => 0)) {
      await p.reload({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(700);
    }
  }
  await ctx.close();
}
console.log(`\nDvojkliků: ${kliku}. Z toho vzniklo dvakrát totéž: ${dvojice}.`);
await b.close();
