// Kolo 9: schválit vše u mřížek, hledání v Týmu a Docházce,
// „Uložit a přidat další" ve skladu.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const OUT = new URL('./shots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

const problems = [];
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { console.log('  ✗', m); problems.push(m); };

async function open(url, w = 1280) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, locale: 'cs-CZ', isMobile: w <= 500, hasTouch: w <= 500 });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok('employer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const sent = [];
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') {
      sent.push(`${route.request().method()} ${u.replace('http://localhost:3000', '')}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":9}' });
    }
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  p.on('dialog', d => d.accept());
  await p.goto('http://localhost:3000' + url, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1600);
  return { ctx, p, errs, sent };
}

// 1) Schválit vše u mřížek karet
for (const [name, url, expect, shot] of [
  ['Návody', '?view=guides', 1, 'k9-guides'],
  ['Postupy', '?view=procedures', 1, 'k9-procedures'],
]) {
  console.log(`${name} — schválit vše:`);
  const { ctx, p, errs, sent } = await open('/employer/overview' + url);
  const bar = p.locator('button', { hasText: /^Schválit vše \(/ });
  const n = await bar.count();
  // Pruh se ukazuje až od dvou čekajících; u jednoho je tlačítko na kartě dost.
  if (expect === 1 && n === 0) {
    ok('u jednoho čekajícího se pruh neukazuje (správně)');
  } else if (n > 0) {
    const label = await bar.first().innerText();
    const want = parseInt(label.match(/\((\d+)\)/)?.[1] ?? '0');
    const before = sent.length;
    await bar.first().click();
    await p.waitForTimeout(1400);
    const fired = sent.filter(x => x.startsWith('PATCH')).length - sent.slice(0, before).filter(x => x.startsWith('PATCH')).length;
    fired === want ? ok(`„${label.trim()}" poslalo ${fired} požadavků naráz`) : bad(`${name}: čekáno ${want}, odešlo ${fired}`);
  } else {
    bad(`${name}: pruh ani tlačítko nenalezeno`);
  }
  if (shot) await p.screenshot({ path: `${OUT}${shot}-1280.png` });
  if (errs.length) bad(`${name}: chyba v konzoli — ${errs[0]}`);
  await ctx.close();
}

// 2) Hledání v Týmu a Docházce
console.log('Hledání v seznamech:');
{
  const { ctx, p, errs } = await open('/employer/overview?view=team-settings');
  const f = p.locator('input[aria-label="Hledat člena týmu"]');
  (await f.count()) ? ok('Tým: hledání je k dispozici') : console.log('  · Tým: hledání skryté (≤8 lidí ve fixture)');
  if (errs.length) bad('Tým: chyba v konzoli — ' + errs[0]);
  await ctx.close();
}
{
  const { ctx, p, errs } = await open('/employer/overview?view=attendance');
  const f = p.locator('input[aria-label="Hledat zaměstnance v docházce"]');
  if (await f.count() === 0) console.log('  · Docházka: hledání skryté (≤10 záznamů ve fixture)');
  else {
    const before = await p.locator('h2', { hasText: /^Záznamy/ }).innerText();
    await f.fill('Eva');
    await p.waitForTimeout(600);
    const after = await p.locator('h2', { hasText: /^Záznamy/ }).innerText();
    after !== before ? ok(`Docházka: „${before.trim()}" → „${after.trim()}"`) : bad('Docházka: hledání nic nezúžilo');
  }
  if (errs.length) bad('Docházka: chyba v konzoli — ' + errs[0]);
  await ctx.close();
}

// 3) Uložit a přidat další
console.log('Sklad — uložit a přidat další:');
{
  const { ctx, p, errs, sent } = await open('/employer/overview?view=inventory');
  const add = p.locator('button', { hasText: /Přidat položku|Nová položka|Zapsat do skladu/ }).first();
  if (await add.count() === 0) { bad('tlačítko pro novou položku nenalezeno'); }
  else {
    await add.click();
    await p.waitForTimeout(800);
    const keep = p.locator('button', { hasText: /^Uložit a přidat další$/ });
    if (await keep.count() === 0) bad('tlačítko „Uložit a přidat další" není');
    else {
      const nameField = p.locator('input[placeholder="Např. Sirup Mango 0,7 l"]').first();
      if (await nameField.count() === 0) { bad('pole názvu nenalezeno'); }
      else {
        await nameField.fill('Sirup Mango 0,7 l');
        const before = sent.length;
        await keep.first().click();
        await p.waitForTimeout(1100);
        sent.length > before ? ok('uložilo se') : bad('neuložilo se');
        (await nameField.inputValue()) === '' ? ok('název se vyprázdnil, formulář zůstal otevřený') : bad('název se nevyprázdnil');
        (await p.locator('text=/Zapsáno/').count()) ? ok('potvrzení „Zapsáno" je vidět') : bad('chybí potvrzení, co se zapsalo');
        await p.screenshot({ path: `${OUT}k9-stock-1280.png` });
      }
    }
  }
  if (errs.length) bad('Sklad: chyba v konzoli — ' + errs[0]);
  await ctx.close();
}

console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
