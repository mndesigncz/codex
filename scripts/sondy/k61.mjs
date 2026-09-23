// Kolo 61 — měření organizací: vlastnictví „Přidat podnik", přepínač na telefonu,
// potvrzení před sloučením, prázdný sklad s kategoriemi z organizace, ceník, /pozastaveno.
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
let fails = 0;
const tvrdi = (popis, ok, co = '') => { console.log(`${ok ? '✓' : '✗'} ${popis}${ok ? '' : '  ← ' + co}`); if (!ok) fails++; };
const norm = s => s.replace(/ /g, ' ').toLowerCase();

// Nastavitelné odchylky od fixtur pro tuhle sondu.
const stav = { muzuZalozit: false, jenCiziKategorie: false, navodyBezZdroje: false };
const posty = [];
async function kontext(viewport) {
  const ctx = await b.newContext({ viewport, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') {
      posty.push({ url: u.replace('http://localhost:3000', ''), body: route.request().postData() });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, organization: JSON.parse(readFileSync(DIR + 'organization.json', 'utf8')).organization, kopie: [] }) });
    }
    const k = keyFor(u);
    if (k === 'teams_mine') { const d = JSON.parse(readFileSync(DIR + k + '.json', 'utf8')); d.muzuZalozit = stav.muzuZalozit; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) }); }
    if (k === 'inventory_categories' && stav.jenCiziKategorie) { const d = JSON.parse(readFileSync(DIR + k + '.json', 'utf8')); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d.filter(c => c.zOrganizace)) }); }
    if (k === 'organization' && stav.navodyBezZdroje) { const d = JSON.parse(readFileSync(DIR + k + '.json', 'utf8')); d.organization.settings.zdrojeCiselniku.kategorieNavodu = null; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) }); }
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  return ctx;
}

// 1) „Přidat podnik" jen když to server dovolí
{
  const ctx = await kontext({ width: 1280, height: 950 }); const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  await p.locator('aside button[title^="Podnik:"]').first().click(); await p.waitForTimeout(300);
  let menu = norm(await p.locator('aside [role="menu"]').innerText());
  tvrdi('přepínač: bez vlastnictví se „Přidat podnik" nenabízí', menu.includes('kavárna karlín') && !menu.includes('přidat podnik'), menu.slice(0, 160));
  stav.muzuZalozit = true;
  await p.goto('http://localhost:3000/employer/overview', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  await p.locator('aside button[title^="Podnik:"]').first().click(); await p.waitForTimeout(300);
  menu = norm(await p.locator('aside [role="menu"]').innerText());
  tvrdi('přepínač: vlastník „Přidat podnik" vidí', menu.includes('přidat podnik'), menu.slice(0, 160));
  await ctx.close();
}

// 2) Telefon: přepínač v hlavičce — v režimu TO GO i v plné správě
{
  const ctx = await kontext({ width: 390, height: 844 }); const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  tvrdi('telefon (TO GO): přepínač podniků je v plovoucí hlavičce', await p.locator('button[title^="Podnik:"]').first().isVisible(), 'chybí');
  await p.locator('button[title^="Podnik:"]').first().click(); await p.waitForTimeout(300);
  const menuTogo = norm(await p.locator('[role="menu"]').first().innerText());
  tvrdi('telefon (TO GO): menu nabízí druhý podnik', menuTogo.includes('kavárna karlín'), menuTogo.slice(0, 120));
  await p.keyboard.press('Escape');
  await ctx.addInitScript(() => { try { localStorage.setItem('managero-app-mode', 'full'); } catch {} });
  await p.goto('http://localhost:3000/employer/overview', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const btn = p.locator('header button[title^="Podnik:"]').first();
  tvrdi('telefon (správa): přepínač podniků je v hlavičce', await btn.isVisible(), 'chybí');
  await btn.click(); await p.waitForTimeout(300);
  const menu = norm(await p.locator('header [role="menu"]').innerText());
  tvrdi('telefon: menu nabízí druhý podnik i „Všechny podniky"', menu.includes('kavárna karlín') && menu.includes('všechny podniky'), menu.slice(0, 160));
  const box = await p.locator('header [role="menu"]').boundingBox();
  tvrdi('telefon: menu nepřetéká přes okraj obrazovky', !!box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
  await ctx.close();
}

// 3) Potvrzení před sloučením (zapnutí zdroje u číselníku s kopiemi)
{
  stav.navodyBezZdroje = true;
  const ctx = await kontext({ width: 1280, height: 950 }); const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview?view=team-settings', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  let zprava = ''; p.once('dialog', d => { zprava = d.message(); d.dismiss(); });
  const pred = posty.filter(x => x.url === '/api/organization').length;
  await p.locator('select[aria-labelledby="org-zdroj-kategorieNavodu"]').selectOption('2'); await p.waitForTimeout(500);
  tvrdi('nastavení: zapnutí zdroje se ptá na nahrazení kopií', /nahradí je originál ze zdroje: kategorie návodů/.test(zprava), zprava.slice(0, 200));
  tvrdi('nastavení: zrušené potvrzení sloučení nic neuloží', posty.filter(x => x.url === '/api/organization').length === pred, 'PATCH odešel');
  p.once('dialog', d => d.accept());
  await p.locator('select[aria-labelledby="org-zdroj-kategorieNavodu"]').selectOption('2'); await p.waitForTimeout(600);
  tvrdi('nastavení: potvrzené sloučení PATCH odešle', posty.filter(x => x.url === '/api/organization').length === pred + 1, 'PATCH neodešel');
  // Přepínač je mimo komponentu: po kliknutí zůstává fokus na něm.
  const sw = p.getByRole('switch', { name: 'Přehled za všechny podniky' });
  p.once('dialog', d => d.accept());
  await sw.focus(); await p.keyboard.press('Space'); await p.waitForTimeout(700);
  tvrdi('nastavení: přepínač po kliknutí neztratí fokus', await sw.evaluate(el => document.activeElement === el), 'fokus utekl');
  stav.navodyBezZdroje = false;
  await ctx.close();
}

// 4) Sklad bez vlastních kategorií, ale s kategoriemi z organizace
{
  stav.jenCiziKategorie = true;
  const ctx = await kontext({ width: 1280, height: 950 }); const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview?view=inventory', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  await p.locator('button[title="Další"]').first().click(); await p.waitForTimeout(300);
  await p.getByRole('menuitem', { name: /Kategorie a balení/ }).or(p.getByText('Kategorie a balení')).first().click(); await p.waitForTimeout(700);
  const m = norm(await p.locator('body').innerText());
  tvrdi('sklad: bez vlastních kategorií neříká „prázdný", když jsou kategorie z organizace', m.includes('vlastní kategorie zatím nemáš') && !m.includes('sklad je zatím prázdný') && m.includes('sirupy z organizace'), m.slice(0, 200));
  stav.jenCiziKategorie = false;
  await ctx.close();
}

// 5) Ceník: fajfka a tečka mají roli, kterou odečítač přečte
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, locale: 'cs-CZ' }); const p = await ctx.newPage();
  await p.goto('http://localhost:3000/', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  const ano = await p.locator('span[role="img"][aria-label="ano"]').count(), ne = await p.locator('span[role="img"][aria-label="ne"]').count();
  tvrdi('ceník: „ano"/„ne" mají role="img"', ano > 0 && ne > 0, `ano ${ano}, ne ${ne}`);
  await ctx.close();
}

// 6) /pozastaveno nabízí přepínač (člověk s víc podniky se dostane do zdravého)
{
  const ctx = await kontext({ width: 1280, height: 950 }); const p = await ctx.newPage();
  await p.goto('http://localhost:3000/pozastaveno', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const m = norm(await p.locator('main').innerText());
  tvrdi('pozastaveno: stránka se ukáže a má přepínač podniků', m.includes('pozastaven') && (await p.locator('main button[title^="Podnik:"]').count()) === 1, m.slice(0, 120));
  await ctx.close();
}

// 7) Přehled organizace: chyba přepnutí nezakryje čísla
{
  const ctx = await kontext({ width: 1280, height: 950 }); const p = await ctx.newPage();
  await ctx.route('**/api/teams/switch', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'V tomhle podniku nejsi členem.' }) }));
  await p.goto('http://localhost:3000/employer/overview?view=org', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  const pred = norm(await p.locator('main').innerText());
  await p.getByRole('button', { name: 'Otevřít' }).first().click(); await p.waitForTimeout(600);
  const po = norm(await p.locator('main').innerText());
  tvrdi('přehled: chyba přepnutí se ukáže u seznamu', po.includes('v tomhle podniku nejsi členem'), po.slice(0, 160));
  tvrdi('přehled: čísla po chybě přepnutí nezmizí', pred.includes('kavárna') && po.includes('kavárna') && !po.includes('přehled se nenačetl'), po.slice(0, 160));
  await ctx.close();
}

console.log(fails ? `\n${fails} SELHALO` : '\norganizace po měření: vlastník zakládá, telefon přepíná, sloučení se ptá');
await b.close(); process.exit(fails ? 1 : 0);
