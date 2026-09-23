// Všechny cesty ven z okna, na jednom okně.
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
let chyb = 0;
const kontrola = (jmeno, podminka) => { if (podminka) console.log('  ✓ ' + jmeno); else { console.log('  ✗ ' + jmeno); chyb++; } };

const otevri = async () => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok('employer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview?view=events', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1400);
  await p.locator('button:visible', { hasText: /Nová akce/ }).first().click({ timeout: 5000 });
  await p.waitForTimeout(600);
  return { ctx, p };
};
const otevrene = async (p) => (await p.locator('.modal-sheet:visible, [role="dialog"]:visible').count()) > 0;
const ptaSe = async (p) => (await p.locator('.discard-guard:visible').count()) > 0;
const napis = async (p, t = 'Degustace vín pro dvacet lidí') => {
  await p.locator('.modal-sheet input[type="text"], .modal-sheet input:not([type]), .modal-sheet textarea').first().click();
  await p.keyboard.type(t, { delay: 8 }); await p.waitForTimeout(200);
};

// 1) Nedotčené okno se Escapem zavře hned — pojistka nesmí překážet.
{ const { ctx, p } = await otevri();
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  kontrola('nedotčené okno se Escapem zavře bez ptaní', !(await otevrene(p)));
  await ctx.close(); }

// 2) Klik vedle okna u rozepsaného se zeptá místo zavření.
{ const { ctx, p } = await otevri();
  await napis(p);
  await p.mouse.click(30, 30); await p.waitForTimeout(700);
  kontrola('klik vedle rozepsaného okna nezavře', await otevrene(p));
  kontrola('klik vedle rozepsaného okna se zeptá', await ptaSe(p));
  await ctx.close(); }

// 3) Druhý Escape nad otázkou vrací k úpravám, nezahazuje.
{ const { ctx, p } = await otevri();
  await napis(p);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  kontrola('druhý Escape okno nezavře', await otevrene(p));
  kontrola('druhý Escape otázku sundá', !(await ptaSe(p)));
  const t = await p.locator('.modal-sheet input[type="text"], .modal-sheet input:not([type]), .modal-sheet textarea').first().inputValue().catch(() => '');
  kontrola('text po návratu zůstal', t.includes('Degustace'));
  await ctx.close(); }

// 4) „Zpět k úpravám" vrátí do formuláře i s textem.
{ const { ctx, p } = await otevri();
  await napis(p);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await p.locator('.discard-guard button', { hasText: /Zpět k úpravám/ }).click({ timeout: 4000 });
  await p.waitForTimeout(500);
  kontrola('„Zpět k úpravám" okno nechá otevřené', await otevrene(p));
  const t = await p.locator('.modal-sheet input[type="text"], .modal-sheet input:not([type]), .modal-sheet textarea').first().inputValue().catch(() => '');
  kontrola('„Zpět k úpravám" nechá text', t.includes('Degustace'));
  await ctx.close(); }

// 5) „Zahodit" opravdu zavře — pojistka nesmí uvěznit.
{ const { ctx, p } = await otevri();
  await napis(p);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await p.locator('.discard-guard button', { hasText: /^Zahodit$/ }).click({ timeout: 4000 });
  await p.waitForTimeout(700);
  kontrola('„Zahodit" okno zavře', !(await otevrene(p)));
  await ctx.close(); }

// 6) Napsat a zase smazat není ztráta — okno se zavře bez ptaní.
{ const { ctx, p } = await otevri();
  await napis(p, 'x');
  const pole = p.locator('.modal-sheet input[type="text"], .modal-sheet input:not([type]), .modal-sheet textarea').first();
  await pole.click(); await p.keyboard.press('Backspace'); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  kontrola('smazaný text okno neuvězní', !(await otevrene(p)));
  await ctx.close(); }

// 7) Fokus po otázce míří na bezpečnou volbu.
{ const { ctx, p } = await otevri();
  await napis(p);
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  const t = await p.evaluate(() => (document.activeElement?.textContent || '').trim());
  kontrola('fokus je na „Zpět k úpravám" (je: ' + t + ')', t.includes('Zpět'));
  await ctx.close(); }

console.log(chyb ? `\n${chyb} kontrol selhalo.` : '\nVšechny cesty ven z okna sedí.');
await b.close();
process.exit(chyb ? 1 : 0);
