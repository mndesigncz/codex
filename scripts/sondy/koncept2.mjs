// Koncept v chatu (vázaný na kanál, bez banneru) a v rozeslání zákazníkům.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let chyb = 0;
const kontrola = (j, p) => { if (p) console.log('  ✓ ' + j); else { console.log('  ✗ ' + j); chyb++; } };
const kontext = async (role) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const r = route.request(); const u = r.url();
    if (u.includes('/api/auth/')) return route.continue();
    if (r.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  return ctx;
};

// ——— Chat: rozepsaná zpráva, přepnutí jinam a zpět.
{
  const ctx = await kontext('employer');
  const p = await ctx.newPage();
  await p.goto(BASE + '/employer/overview?view=chat', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1600);
  // Na počítači chat neotevře konverzaci sám („Vyber konverzaci").
  await p.getByText('Týmový chat').first().click().catch(() => {}); await p.waitForTimeout(800);
  const okno = p.locator('textarea:visible').first();
  if (await okno.count()) {
    await okno.click();
    await p.keyboard.type('rozepsana zprava sondy', { delay: 10 });
    await p.waitForTimeout(400);
    await p.goto(BASE + '/employer/overview?view=tasks', { waitUntil: 'networkidle' });
    await p.waitForTimeout(700);
    await p.goto(BASE + '/employer/overview?view=chat', { waitUntil: 'networkidle' });
    await p.waitForTimeout(800); await p.getByText('Týmový chat').first().click().catch(() => {});
    await p.waitForTimeout(1800);
    const v = await p.locator('textarea:visible').first().inputValue().catch(() => '');
    kontrola('chat: rozepsaná zpráva je zpátky v okně', v.includes('rozepsana'));
    // Výjimka z přiznání: v chatu se banner nevykresluje schválně.
    kontrola('chat: bez banneru (zpráva mluví sama za sebe)',
      (await p.locator('text=/Vrátili jsme ti/').count().catch(() => 0)) === 0);
    const klice = await p.evaluate(() => { try { return Object.keys(sessionStorage).filter(k => k.includes('koncept')); } catch { return []; } });
    kontrola('chat: koncept je vázaný na kanál (' + klice.join(', ') + ')', klice.some(k => /koncept-chat-\d+/.test(k)));
  } else { console.log('  ? chat: okno zprávy nenalezeno'); chyb++; }
  await ctx.close();
}

// ——— Rozeslání zákazníkům: Kampaně → Zprávy → „Nová kampaň" (průvodce v okně, kolo 92).
{
  const ctx = await kontext('employer');
  const p = await ctx.newPage();
  const otevriPruvodce = async () => {
    await p.goto(BASE + '/employer/overview?mode=client&tab=campaigns', { waitUntil: 'networkidle' });
    await p.waitForTimeout(1200);
    await p.getByRole('button', { name: 'Nová kampaň' }).first().click().catch(() => {});
    const okno = p.getByRole('dialog');
    await okno.waitFor({ timeout: 5000 }).catch(() => {});
    await okno.getByRole('button', { name: 'Pokračovat k textu' }).click().catch(() => {});
    await p.waitForTimeout(500);
    return okno;
  };
  const okno = await otevriPruvodce();
  const pole = okno.locator('#kp-body');
  if (await pole.count()) {
    await okno.locator('#kp-title').fill('Rozepsaná kampaň');
    await pole.click();
    await p.keyboard.type('rozepsane rozeslani sondy', { delay: 10 });
    await p.waitForTimeout(400);
    await p.goto(BASE + '/employer/overview?mode=client&tab=events', { waitUntil: 'networkidle' });
    await p.waitForTimeout(700);
    const znovu = await otevriPruvodce();
    const v = await znovu.locator('#kp-body').inputValue().catch(() => '');
    kontrola('rozeslání: koncept je zpátky', v.includes('rozepsane'));
    kontrola('rozeslání: a přizná se', (await p.locator('text=/Vrátili jsme ti/').count().catch(() => 0)) > 0);
  } else { console.log('  ? rozeslání: pole nenalezeno'); chyb++; }
  await ctx.close();
}
console.log(chyb ? `\n${chyb} kontrol selhalo.` : '\nVšechno sedí.');
await b.close();
process.exit(chyb ? 1 : 0);
