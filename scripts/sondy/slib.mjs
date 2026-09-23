// Offline stránka slibuje: „Rozepsané zůstává uložené v tomhle zařízení."
// Tohle ten slib zkouší. Koncepty drží sessionStorage — ta přežije obnovení
// stránky, ale ne zavření záložky. Otázka je, jestli slib odpovídá realitě
// v situaci, kterou ta stránka popisuje: spadne wifi, obsluha obnoví.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} employer`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

async function kontext() {
  const ctx = await b.newContext({ viewport: { width: 810, height: 1080 }, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  return ctx;
}

const TEXT = 'Rozepsané oznámení, které se nesmí ztratit';

async function napis(p) {
  await p.goto('http://localhost:3000/employer/overview?view=announcements', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  const pole = p.locator('textarea').first();
  await pole.click();
  await pole.type(TEXT, { delay: 12 });
  await p.waitForTimeout(900);   // koncept se ukládá se zpožděním
}
async function jeTam(p) {
  await p.waitForTimeout(1200);
  const t = await p.locator('textarea').first().inputValue().catch(() => '');
  const note = await p.locator('text=z minula').count().catch(() => 0);
  return { text: t.includes('nesmí ztratit'), note: note > 0 };
}

// 1) Výpadek a obnovení téže záložky — situace, kterou offline stránka popisuje.
{
  const ctx = await kontext();
  const p = await ctx.newPage();
  await napis(p);
  await ctx.setOffline(true);
  try { await p.reload({ waitUntil: 'domcontentloaded', timeout: 12000 }); } catch {}
  await ctx.setOffline(false);
  // Offline stránka service workeru se po návratu sítě sama obnoví — první
  // reload se s ní může potkat a skončit ERR_ABORTED. Počkat a zkusit znovu.
  await p.waitForTimeout(800);
  await p.reload({ waitUntil: 'networkidle' }).catch(async () => { await p.waitForTimeout(1000); await p.reload({ waitUntil: 'networkidle' }); });
  const r = await jeTam(p);
  console.log(`výpadek + obnovení téže záložky: text zpátky=${r.text ? 'ano ✓' : 'NE ✗'} · nabídka „z minula"=${r.note ? 'ano' : 'ne'}`);
  await ctx.close();
}
// 2) Zavření a znovuotevření záložky (obsluha tablet vypne a ráno zapne).
{
  const ctx = await kontext();
  const p = await ctx.newPage();
  await napis(p);
  await p.close();
  const p2 = await ctx.newPage();
  await p2.goto('http://localhost:3000/employer/overview?view=announcements', { waitUntil: 'networkidle' });
  const r = await jeTam(p2);
  console.log(`zavřená a znovu otevřená záložka:  text zpátky=${r.text ? 'ano' : 'NE'} · nabídka „z minula"=${r.note ? 'ano' : 'ne'}`);
  await ctx.close();
}
await b.close();
