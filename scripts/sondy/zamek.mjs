// Zamčená funkce má nabídnout tarif, ne poslat do Nastavení.
// Tři stavy podniku, tři různé správné odpovědi.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} employer`, { encoding: 'utf8' }).trim();
const zaklad = JSON.parse(readFileSync(DIR + 'teams.json', 'utf8'));
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

const stavy = [
  ['podnik bez předplatného', { plan: 'free', effective: 'free', subscriptionStatus: null, hadSubscription: false }, 'Odemknout Max'],
  ['podnik s běžícím Pro',    { plan: 'pro', effective: 'pro', subscriptionStatus: 'active', hadSubscription: true, interval: 'month' }, 'Přejít na Max'],
  ['Pro v nabídce −30 %',     { plan: 'pro', effective: 'pro', subscriptionStatus: 'active', hadSubscription: true, interval: 'month', maxOfferUntil: '2027-01-01' }, 'Přejít na Max −30 %'],
];

for (const [jm, patch, cekano] of stavy) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    if (u.includes('/api/teams')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...zaklad, planInfo: { ...zaklad.planInfo, ...patch } }) });
    }
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview?mode=client&tab=loyalty', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1800);
  const tlacitka = await p.locator('button:has-text("Odemknout"), button:has-text("Přejít na")').allTextContents();
  const doNastaveni = await p.locator('a[href*="view=settings"]:has-text("Zjistit víc")').count();
  const nalez = tlacitka.map(t => t.trim().replace(/\s+/g, ' ')).join(' / ') || '—';
  console.log(`${nalez.includes(cekano) ? '✓' : '✗'} ${jm}: „${nalez}" (čekáno „${cekano}")${doNastaveni ? '  ✗ pořád vede do Nastavení' : ''}`);
  await ctx.close();
}
await b.close();
