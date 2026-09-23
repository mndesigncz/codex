// Klávesnice: Enter odešle, Escape zavře a vrátí fokus, šipky chodí po menu,
// karty jdou dosáhnout Tabem.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

async function page(role = 'employer', w = 1280) {
  const ctx = await b.newContext({ viewport: { width: w, height: 880 }, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":9}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 110)));
  return { ctx, p, errs };
}
const active = (p) => p.evaluate(() => {
  const a = document.activeElement;
  if (!a) return 'nic';
  const t = (a.getAttribute('aria-label') || a.getAttribute('placeholder') || (a.textContent || '').trim().slice(0, 26));
  return `${a.tagName.toLowerCase()}${t ? `«${t}»` : ''}`;
});

const problems = [];
const ok = (msg) => console.log('  ✓', msg);
const bad = (msg) => { console.log('  ✗', msg); problems.push(msg); };

// 1) Menu „···" — šipky a Escape s návratem fokusu
{
  console.log('Menu „···" (Sklad):');
  const { ctx, p, errs } = await page();
  await p.goto('http://localhost:3000/employer/overview?view=inventory', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const trig = p.locator('button[aria-haspopup="menu"]').first();
  if (await trig.count() === 0) bad('tlačítko menu nenalezeno');
  else {
    await trig.focus();
    await p.keyboard.press('ArrowDown');
    await p.waitForTimeout(350);
    const first = await active(p);
    (await p.locator('[role="menu"]').count()) ? ok(`šipka dolů otevřela menu, fokus: ${first}`) : bad('šipka dolů menu neotevřela');
    await p.keyboard.press('ArrowDown');
    await p.waitForTimeout(200);
    const second = await active(p);
    second !== first ? ok(`další šipka posunula na: ${second}`) : bad('šipky se v menu nehýbou');
    await p.keyboard.press('End');
    await p.waitForTimeout(200);
    ok(`End skočil na: ${await active(p)}`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    (await p.locator('[role="menu"]').count()) === 0 ? ok('Escape menu zavřel') : bad('Escape menu nezavřel');
    (await active(p)).startsWith('button') ? ok(`fokus se vrátil na: ${await active(p)}`) : bad(`fokus po Escape: ${await active(p)}`);
  }
  if (errs.length) bad('chyba v konzoli: ' + errs[0]);
  await ctx.close();
}

// 2) Panel oznámení — Escape
{
  console.log('Zvonek oznámení:');
  const { ctx, p, errs } = await page();
  await p.goto('http://localhost:3000/employer/overview', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const bell = p.locator('button[title="Notifikace"]').first();
  if (await bell.count() === 0) bad('zvonek nenalezen');
  else {
    await bell.click();
    await p.waitForTimeout(500);
    const opened = await p.locator('text=Notifikace').count();
    opened > 0 ? ok('panel se otevřel') : bad('panel se neotevřel');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    const stillOpen = await p.evaluate(() => !!document.querySelector('[role="menu"]'));
    !stillOpen ? ok('Escape panel zavřel') : bad('Escape panel nezavřel');
    (await active(p)).startsWith('button') ? ok(`fokus zpět na: ${await active(p)}`) : bad(`fokus po Escape: ${await active(p)}`);
  }
  if (errs.length) bad('chyba v konzoli: ' + errs[0]);
  await ctx.close();
}

// 3) Enter zakládá akci
{
  console.log('Nová akce — Enter:');
  const { ctx, p, errs } = await page();
  await p.goto('http://localhost:3000/employer/overview?view=events', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const add = p.locator('button', { hasText: /Nová akce|Přidat akci|Založit akci/ }).first();
  if (await add.count() === 0) bad('tlačítko „Nová akce" nenalezeno');
  else {
    await add.click();
    await p.waitForTimeout(700);
    const form = await p.locator('form').count();
    form > 0 ? ok('dialog je opravdový formulář') : bad('dialog stále není <form>');
    let submitted = false;
    p.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/events')) submitted = true; });
    await p.locator('input[placeholder="Název akce"]').fill('Svatba Novákovi');
    await p.locator('input[type="date"]').first().fill('2026-10-01');
    await p.locator('input[placeholder="Název akce"]').press('Enter');
    await p.waitForTimeout(900);
    submitted ? ok('Enter akci založil') : bad('Enter akci nezaložil');
  }
  if (errs.length) bad('chyba v konzoli: ' + errs[0]);
  await ctx.close();
}

// 4) Karty dosažitelné Tabem
{
  console.log('Karty postupů a návodů:');
  for (const [name, url, sel] of [
    ['Postupy', '?view=procedures', '[role="button"]'],
    ['Návody', '?view=guides', '[role="button"]'],
    ['Odměny', '?view=rewards', '[role="button"]'],
  ]) {
    const { ctx, p, errs } = await page();
    await p.goto('http://localhost:3000/employer/overview' + url, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    const n = await p.locator(`${sel}[tabindex="0"]`).count();
    n > 0 ? ok(`${name}: ${n} karet dosažitelných klávesnicí`) : console.log(`  · ${name}: žádné karty (prázdná data)`);
    if (errs.length) bad(`${name} — chyba v konzoli: ` + errs[0]);
    await ctx.close();
  }
}

// 5) Účet v Managero client — Escape
{
  console.log('Účet (Managero client):');
  const { ctx, p, errs } = await page('customer');
  await p.goto('http://localhost:3000/client', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const acc = p.locator('button[aria-haspopup="menu"]').first();
  if (await acc.count() === 0) console.log('  · účet nenalezen (nepřihlášený pohled)');
  else {
    await acc.click(); await p.waitForTimeout(400);
    (await p.locator('[role="menu"]').count()) > 0 ? ok('menu účtu otevřeno') : bad('menu účtu se neotevřelo');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    (await p.locator('[role="menu"]').count()) === 0 ? ok('Escape menu účtu zavřel') : bad('Escape menu účtu nezavřel');
  }
  if (errs.length) bad('chyba v konzoli: ' + errs[0]);
  await ctx.close();
}

console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
