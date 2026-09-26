// Kolo 64 — kopie z jiného podniku organizace: tlačítko, výběr, POST, výsledek s poznámkou.
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
const posty = [];
// Kolo 69 (B6b): na telefonu se vedlejší akce hlavičky plochy schovají do „···"
// (Další akce → Kopírovat z jiného podniku); na monitoru je vidět tlačítko.
async function otevriKopii(p) {
  const btn = p.getByRole('button', { name: /Z jiného podniku/ }).first();
  if (await btn.isVisible().catch(() => false)) return btn.click();
  await p.getByRole('button', { name: 'Další akce', exact: true }).first().click(); await p.waitForTimeout(300);
  await p.getByRole('menuitem', { name: /z jiného podniku/i }).first().click();
}
async function kontext(viewport) {
  const ctx = await b.newContext({ viewport, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() === 'POST' && u.includes('/api/organization/kopie')) {
      const body = JSON.parse(route.request().postData() || '{}'); posty.push(body);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, vysledky: (body.ids || []).map(id => ({ id, noveId: 700 + id, nazev: id === 5 ? 'Čištění kávovaru' : 'Blue Lagoon', poznamky: id === 6 ? ['Krok „Sirup 20 ml": surovina „Modrý sirup" v tomhle podniku není — odpojeno.'] : [] })) }) });
    }
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  return ctx;
}

// 1) Návody: tlačítko → okno → výběr → kopie → výsledek
{
  const ctx = await kontext({ width: 1280, height: 950 }); const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview?view=guides', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  const btn = p.getByRole('button', { name: /Z jiného podniku/ }).first();
  tvrdi('návody: tlačítko „Z jiného podniku" je vidět', await btn.isVisible(), 'chybí');
  await btn.click(); await p.waitForTimeout(900);
  let m = norm(await p.locator('body').innerText());
  tvrdi('okno: nabízí položky z Kavárny Karlín', m.includes('čištění kávovaru') && m.includes('blue lagoon') && m.includes('karlín'), m.slice(0, 200));
  // Výběr může být vlastní prvek s role=checkbox (SelectBox) i nativní input.
  const boxy = p.locator('[role="checkbox"], input[type="checkbox"]').filter({ visible: true });
  tvrdi('okno: každá položka má zaškrtávátko', (await boxy.count()) >= 2, `checkboxů ${await boxy.count()}`);
  await boxy.nth(0).click(); await boxy.nth(1).click(); await p.waitForTimeout(200);
  const kopirovat = p.getByRole('button', { name: /Zkopírovat/ }).first();
  tvrdi('okno: tlačítko říká, kolik se kopíruje', /2/.test(await kopirovat.innerText()), await kopirovat.innerText());
  await kopirovat.click(); await p.waitForTimeout(900);
  tvrdi('POST nese entitu, zdroj a vybraná id', posty.length === 1 && posty[0].entita === 'navody' && posty[0].z === 2 && JSON.stringify([...posty[0].ids].sort()) === '[5,6]', JSON.stringify(posty[0]));
  m = norm(await p.locator('body').innerText());
  tvrdi('výsledek: poznámka o odpojené surovině je vidět', m.includes('modrý sirup') && m.includes('odpojeno'), m.slice(0, 260));
  const hotovo = p.getByRole('button', { name: /^Hotovo$/ }).first();
  tvrdi('výsledek: tlačítko Hotovo', await hotovo.isVisible(), 'chybí');
  await hotovo.click(); await p.waitForTimeout(500);
  tvrdi('okno se po Hotovo zavře', (await p.getByRole('button', { name: /Zkopírovat/ }).count()) === 0, 'zůstalo otevřené');
  await ctx.close();
}
// 2) Postupy a menu: tlačítko existuje
{
  const ctx = await kontext({ width: 1280, height: 950 }); const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview?view=procedures', { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
  tvrdi('postupy: tlačítko „Z jiného podniku"', await p.getByRole('button', { name: /Z jiného podniku/ }).first().isVisible(), 'chybí');
  await otevriKopii(p); await p.waitForTimeout(800);
  tvrdi('postupy: okno nabízí postup ze zdroje', norm(await p.locator('body').innerText()).includes('zavírání'), '');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.goto('http://localhost:3000/employer/overview?view=menu', { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
  // Bez menu nabízí kopii prázdný stav („Zkopírovat z jiného podniku"), s menu dlaždice „Z jiného podniku" — obojí je tlačítko.
  tvrdi('menu: tlačítko „Z jiného podniku"', (await p.getByRole('button', { name: /z jiného podniku/i }).count()) >= 1, 'chybí');
  await ctx.close();
}
// 2b) Souhrn s dílčím neúspěchem: „2 z 3" bez skloňovaného jména, a nula
//     úspěchů ukáže důvody po položkách, ne obecnou chybu serveru.
{
  const ctx = await kontext({ width: 1280, height: 950 });
  await ctx.route('**/api/organization/kopie', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = JSON.parse(route.request().postData() || '{}');
    const vsechnoSpatne = (body.ids || []).length === 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: !vsechnoSpatne, vysledky: vsechnoSpatne
      ? [{ id: body.ids[0], noveId: null, nazev: 'Čištění kávovaru', poznamky: ['Návod ve zdrojovém podniku není.'] }]
      : (body.ids || []).map((id, i) => ({ id, noveId: i === 0 ? null : 800 + id, nazev: 'N' + id, poznamky: i === 0 ? ['Kopie se nepovedla.'] : [] })) }) });
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview?view=guides', { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
  await otevriKopii(p); await p.waitForTimeout(900);
  const boxy = p.getByRole('dialog').locator('[role="checkbox"], input[type="checkbox"]');
  await boxy.nth(0).click(); await boxy.nth(1).click(); await p.waitForTimeout(200);
  await p.getByRole('button', { name: /Zkopírovat \(2\)/ }).click(); await p.waitForTimeout(900);
  let t = norm(await p.getByRole('dialog').innerText());
  tvrdi('souhrn: dílčí úspěch „Zkopírováno 1 z 2."', t.includes('zkopírováno 1 z 2.'), t.slice(0, 200));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await otevriKopii(p); await p.waitForTimeout(900);
  await p.getByRole('dialog').locator('[role="checkbox"], input[type="checkbox"]').nth(0).click(); await p.waitForTimeout(200);
  await p.getByRole('button', { name: /Zkopírovat \(1\)/ }).click(); await p.waitForTimeout(900);
  t = norm(await p.getByRole('dialog').innerText());
  tvrdi('nula úspěchů: „Nic se nezkopírovalo." s důvodem u položky', t.includes('nic se nezkopírovalo') && t.includes('návod ve zdrojovém podniku není'), t.slice(0, 200));
  tvrdi('nula úspěchů: žádná obecná hláška o serveru', !t.includes('nestíhá'), 'obecná hláška');
  await ctx.close();
}
// 2c) Menu do prázdného editoru: po kopii se editor přepne na nové menu —
//     okno s výsledkem musí zůstat, jinak člověk kopíruje podruhé.
{
  const ctx = await kontext({ width: 1280, height: 950 });
  let zkopirovano = false;
  await ctx.route('**/api/menu', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const boards = zkopirovano ? [{ id: 741, slug: 'letni-nabidka', name: 'Letní nabídka', eyebrow: null, title: null, note: null,
      wifiSsid: null, wifiPassword: null, currency: 'CZK', enabled: false, theme: {}, sections: [{ id: 1, title: 'Nápoje', column: 1, items: [{ id: 1, name: 'Limonáda', price: 65, soldOut: false }] }] }] : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ boards }) });
  });
  await ctx.route('**/api/organization/kopie', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    zkopirovano = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, vysledky: [{ id: 41, noveId: 741, nazev: 'Letní nabídka', poznamky: ['Menu je po zkopírování vypnuté a má novou adresu /menu-akce.html?menu=letni-nabidka — zapni ho, až projdeš ceny.'] }] }) });
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview?view=menu', { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
  await p.getByRole('button', { name: /z jiného podniku/i }).first().click(); await p.waitForTimeout(900);
  await p.getByRole('dialog').locator('[role="checkbox"], input[type="checkbox"]').first().click(); await p.waitForTimeout(200);
  await p.getByRole('button', { name: /Zkopírovat \(1\)/ }).click(); await p.waitForTimeout(1800);
  const dlg = p.getByRole('dialog');
  const t = (await dlg.count()) ? norm(await dlg.innerText()) : '';
  tvrdi('menu: výsledek kopie zůstane i po přepnutí editoru na nové menu', t.includes('menu je po zkopírování vypnuté'), t.slice(0, 200) || 'okno zmizelo');
  const hlavni = norm(await p.locator('main').innerText());
  tvrdi('menu: editor pod oknem už ukazuje zkopírované menu', hlavni.includes('letní nabídka'), hlavni.slice(0, 160));
  await ctx.close();
}
// 2d) Telefon, dva zdrojové podniky: patička se vejde (dřív tři tlačítka
//     a „Jiný podnik" useknutý za levým okrajem) a jiný podnik jde vybrat.
{
  const ctx = await kontext({ width: 390, height: 844 });
  await ctx.addInitScript(() => { try { localStorage.setItem('managero-app-mode', 'full'); } catch {} });
  await ctx.route('**/api/teams/mine', async route => {
    const d = JSON.parse(readFileSync(DIR + 'teams_mine.json', 'utf8'));
    d.teams.push({ teamId: 3, role: 'employer', teamName: 'Bistro Smíchov', organizationId: 9 }, { teamId: 4, role: 'employee', teamName: 'Cizí pobočka', organizationId: 9 });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview?view=guides', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  await otevriKopii(p); await p.waitForTimeout(700);
  const dlg = p.getByRole('dialog');
  let t = norm(await dlg.innerText());
  tvrdi('telefon: nabídka jen podniků, kde jsem ve vedení', t.includes('bistro smíchov') && t.includes('kavárna karlín') && !t.includes('cizí pobočka'), t.slice(0, 200));
  await dlg.getByText('Kavárna Karlín').click(); await p.waitForTimeout(900);
  const tl = dlg.getByRole('button');
  const mimo = [];
  for (let i = 0; i < await tl.count(); i++) { const b = await tl.nth(i).boundingBox(); if (b && (b.x < 0 || b.x + b.width > 390)) mimo.push((await tl.nth(i).innerText()).trim() + '@' + Math.round(b.x)); }
  tvrdi('telefon: žádné tlačítko okna nekončí za okrajem', mimo.length === 0, mimo.join(', '));
  tvrdi('telefon: „Vybrat jiný podnik" je v těle okna', await dlg.getByRole('button', { name: 'Vybrat jiný podnik' }).isVisible(), 'chybí');
  t = norm(await dlg.innerText());
  tvrdi('okno jmenuje zdroj i cíl', t.includes('z podniku kavárna karlín do podniku kavárna vinohrady'), t.slice(0, 200));
  await dlg.getByRole('button', { name: 'Vybrat jiný podnik' }).click(); await p.waitForTimeout(500);
  tvrdi('„Vybrat jiný podnik" vrátí výběr podniku', norm(await dlg.innerText()).includes('vyber, odkud se má kopírovat'), '');
  await ctx.close();
}
// 3) Telefon: okno nepřetéká
{
  const ctx = await kontext({ width: 390, height: 844 }); const p = await ctx.newPage();
  await ctx.addInitScript(() => { try { localStorage.setItem('managero-app-mode', 'full'); } catch {} });
  await p.goto('http://localhost:3000/employer/overview?view=guides', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  await otevriKopii(p); await p.waitForTimeout(800);
  const sirka = await p.evaluate(() => document.documentElement.scrollWidth);
  tvrdi('telefon: okno kopie nepřetéká šířku obrazovky', sirka <= 390, `scrollWidth ${sirka}`);
  await ctx.close();
}
console.log(fails ? `\n${fails} SELHALO` : '\nco umí jeden podnik, převezme druhý — s poznámkou, co se nepřeneslo');
await b.close(); process.exit(fails ? 1 : 0);
