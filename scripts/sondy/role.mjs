// Kolo 67 — role a oprávnění v UI: editor rolí (oblasti, závislosti, zámky,
// tablet), POST nese vybraná oprávnění, chyba serveru se ukáže doslova,
// Nastavení týmu nabízí role, navigace se řídí oprávněními, telefon nepřetéká.
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

const ROLE = JSON.parse(readFileSync(DIR + 'roles.json', 'utf8'));
const VSE = ROLE.ja.opravneni;
const sysRole = k => ROLE.system.find(r => r.klic === k);
const mine = (opravneni, role) => ({ ...JSON.parse(readFileSync(DIR + 'teams_mine.json', 'utf8')), role, opravneni });
const VLASTNIK = mine(VSE, { klic: 'vedeni', roleId: null, nazev: 'Vlastník', typ: 'vedeni', jeVlastnik: true });

/** Kontext s podvrženým API. `mineData` = odpověď /api/teams/mine, `roles` = /api/roles. */
async function kontext(viewport, { mineData = VLASTNIK, roles = ROLE, postRoles, patchMembers, teams } = {}) {
  const ctx = await b.newContext({ viewport, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('managero-app-mode', 'full'); } catch {} });
  await ctx.route('**/api/**', async route => {
    const req = route.request(); const u = req.url(); const m = req.method();
    if (u.includes('/api/auth/')) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.endsWith('/api/teams/mine')) return json(mineData);
    if (new URL(u).pathname === '/api/roles' && m === 'GET') return json(roles);
    if (new URL(u).pathname === '/api/roles' && m === 'POST') return postRoles ? postRoles(req, json) : json({ ok: true, id: 99 });
    if (u.includes('/api/teams/members') && m === 'PATCH') return patchMembers ? patchMembers(req, json) : json({ ok: true });
    if (new URL(u).pathname === '/api/teams' && m === 'GET' && teams) return json(teams);
    if (m !== 'GET') return json({ ok: true });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return json([]);
  });
  return ctx;
}
async function otevriRole(p) {
  await p.goto('http://localhost:3000/employer/overview?view=settings', { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
  await p.getByRole('button', { name: /Role a oprávnění/ }).filter({ visible: true }).first().click(); await p.waitForTimeout(900);
}
const prepinac = (p, nazev) => p.getByRole('switch', { name: nazev, exact: true });

// 1) Seznam rolí, nová role, oblasti, závislosti, POST s vybranými oprávněními
{
  const posty = [];
  const ctx = await kontext({ width: 1280, height: 950 }, { postRoles: (req, json) => { posty.push(JSON.parse(req.postData() || '{}')); return json({ ok: true, id: 99 }); } });
  const p = await ctx.newPage();
  await otevriRole(p);
  let t = norm(await p.locator('main').innerText());
  tvrdi('seznam: přednastavené i vlastní role s počtem lidí', t.includes('barista / obsluha') && t.includes('směnový vedoucí') && t.includes('4 lidé') && t.includes('výchozí pro nové'), t.slice(0, 300));
  tvrdi('seznam: přednastavenou jde zkopírovat do vlastní', (await p.getByRole('button', { name: 'Zkopírovat do vlastní' }).count()) >= 6, 'tlačítka chybí');
  await p.getByRole('button', { name: 'Nová role' }).click(); await p.waitForTimeout(500);
  const oblasti = p.locator('button[aria-expanded]').filter({ hasText: /\d+\/\d+/ });
  tvrdi('editor: oblasti jako rozbalovací sekce s počtem (14)', (await oblasti.count()) === 14, `oblastí ${await oblasti.count()}`);
  await oblasti.filter({ hasText: 'Rozvrh' }).first().click(); await p.waitForTimeout(300);
  tvrdi('editor: řádek má přepínač, název, popis i štítek citlivosti', await prepinac(p, 'Generovat rozvrh').isVisible()
    && norm(await p.locator('main').innerText()).includes('automatický návrh rozvrhu') && (await p.locator('.chip', { hasText: /^(Běžné|Střední|Citlivé)$/ }).count()) > 3, 'chybí');
  await prepinac(p, 'Generovat rozvrh').click(); await p.waitForTimeout(300);
  tvrdi('závislost: zapnutí „Generovat rozvrh" zapne „Upravovat směny" i plánovač', await prepinac(p, 'Upravovat směny').getAttribute('aria-checked') === 'true'
    && await prepinac(p, 'Plánovač rozvrhu').getAttribute('aria-checked') === 'true', 'nezapnuto');
  t = norm(await p.locator('main').innerText());
  tvrdi('závislost: poznámka „zapnuto kvůli" a „zapnuto i"', t.includes('zapnuto kvůli') && t.includes('zapnuto i'), t.slice(0, 200));
  await prepinac(p, 'Upravovat směny').click(); await p.waitForTimeout(300);
  tvrdi('závislost: vypnutí „Upravovat směny" vypne i generování', await prepinac(p, 'Generovat rozvrh').getAttribute('aria-checked') === 'false', 'zůstalo zapnuté');
  await prepinac(p, 'Generovat rozvrh').click(); await p.waitForTimeout(200);
  // Hledání najde oprávnění v jiné oblasti bez ručního rozbalení.
  await p.getByRole('combobox', { name: 'Hledat v oprávněních' }).or(p.getByLabel('Hledat v oprávněních')).first().fill('marže'); await p.waitForTimeout(400);
  tvrdi('hledání: „marže" ukáže oprávnění z Financí', await prepinac(p, 'Marže produktů').isVisible(), 'nenalezeno');
  await p.getByLabel('Hledat v oprávněních').first().fill(''); await p.waitForTimeout(200);
  await p.getByLabel('Název role').fill('Směnový plánovač');
  await p.getByRole('button', { name: 'Vytvořit roli' }).click(); await p.waitForTimeout(900);
  const po = posty[0] ?? {};
  const ma = k => (po.opravneni || []).includes(k);
  tvrdi('POST /api/roles nese název, typ a vybraná oprávnění i se závislostmi', po.nazev === 'Směnový plánovač' && po.typ === 'zamestnanec'
    && ma('rozvrh.generovat') && ma('rozvrh.upravit') && ma('rozvrh.zobrazit') && ma('rozvrh.nahled'), JSON.stringify(po).slice(0, 300));
  await ctx.close();
}

// 2) Chyba serveru se ukáže poctivě (403 s českou hláškou)
{
  const hlaska = 'Roli nemůžeš dát oprávnění, která sám nemáš: „Vidět mzdy a sazby".';
  const ctx = await kontext({ width: 1280, height: 950 }, { postRoles: (req, json) => json({ error: hlaska }, 403) });
  const p = await ctx.newPage();
  await otevriRole(p);
  await p.getByRole('button', { name: 'Nová role' }).click(); await p.waitForTimeout(400);
  await p.getByLabel('Název role').fill('Test');
  await p.getByRole('button', { name: 'Vytvořit roli' }).click(); await p.waitForTimeout(800);
  const a = await p.getByRole('alert').allInnerTexts();
  tvrdi('403: hláška serveru je vidět doslova a editor zůstal otevřený', a.some(x => x.includes(hlaska)) && await p.getByLabel('Název role').isVisible(), a.join(' | '));
  await ctx.close();
}

// 3) Zámky: oprávnění, která přihlášený nemá, a tablet jen s bílou listinou
{
  const provozni = sysRole('provozni').opravneni.concat(['tym.role_spravovat']);
  const roles = { ...ROLE, ja: { jeVlastnik: false, klic: null, roleId: 3, nazev: 'Provozní se správou rolí', opravneni: provozni } };
  const ctx = await kontext({ width: 1280, height: 950 }, { roles, mineData: mine(provozni, { klic: null, roleId: 3, nazev: 'Provozní se správou rolí', typ: 'vedeni', jeVlastnik: false }) });
  const p = await ctx.newPage();
  await otevriRole(p);
  await p.getByRole('button', { name: 'Nová role' }).click(); await p.waitForTimeout(400);
  await p.locator('button[aria-expanded]').filter({ hasText: 'Finance' }).first().click(); await p.waitForTimeout(300);
  const mzdy = p.locator('li').filter({ has: p.getByRole('switch', { name: 'Vidět mzdy a sazby', exact: true }) });
  const sw = prepinac(p, 'Vidět mzdy a sazby');
  const existuje = await sw.count();
  tvrdi('zámek: oprávnění, které sám nemám, je zamčené s vysvětlením', existuje > 0 && await sw.isDisabled() && norm(await mzdy.innerText()).includes('sám tohle oprávnění nemáš'), existuje ? norm(await mzdy.innerText()).slice(0, 160) : 'přepínač „Vidět mzdy a sazby" chybí');
  await p.getByRole('tab', { name: 'Tablet' }).click(); await p.waitForTimeout(300);
  await p.locator('button[aria-expanded]').filter({ hasText: 'Sklad' }).first().click(); await p.waitForTimeout(300);
  const t = norm(await p.locator('main').innerText());
  tvrdi('tablet: mimo bílou listinu zamčeno („tablet tohle mít nesmí")', t.includes('tablet tohle mít nesmí'), t.slice(0, 200));
  tvrdi('tablet: stav skladu zůstává povolený', !(await prepinac(p, 'Zapisovat stav a odpis').isDisabled()) && !(await prepinac(p, 'Vidět sklad').isDisabled()), 'zamčené');
  await ctx.close();
}

// 4) Nastavení týmu: výběr role u člena, PATCH jen s rolí
{
  const patche = [];
  const teams = JSON.parse(readFileSync(DIR + 'teams.json', 'utf8'));
  teams.members = teams.members.map(m => m.role === 'employee' ? { ...m, role_klic: 'barista', role_id: null } : { ...m, role_klic: 'vedeni', role_id: null });
  const ctx = await kontext({ width: 1280, height: 950 }, { teams, patchMembers: (req, json) => { patche.push(JSON.parse(req.postData() || '{}')); return json({ ok: true }); } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview?view=team-settings', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  let t = norm(await p.locator('main').innerText());
  tvrdi('tým: u člena je název role', t.includes('barista / obsluha'), t.slice(0, 200));
  const radek = p.locator('.py-4').filter({ hasText: 'Eva Testová' }).first();
  await radek.getByRole('button', { name: 'Upravit' }).click(); await p.waitForTimeout(400);
  const vyber = p.getByLabel('Role', { exact: true });
  const volby = await vyber.locator('option').allInnerTexts();
  tvrdi('tým: výběr nabízí přednastavené i vlastní role, ne tablet', volby.some(v => v.includes('Provozní')) && volby.some(v => v.includes('Směnový vedoucí')) && !volby.some(v => v.includes('Kiosk')), volby.join(' | '));
  await vyber.selectOption({ label: 'Směnový vedoucí' });
  await p.getByRole('button', { name: 'Uložit', exact: true }).click(); await p.waitForTimeout(700);
  tvrdi('tým: PATCH nese roleId a nic, co se neměnilo', patche.length === 1 && patche[0].roleId === 7 && patche[0].hourlyRate === undefined && patche[0].jobTitle === undefined, JSON.stringify(patche));
  t = norm(await radek.innerText());
  tvrdi('tým: po uložení je u člena nová role', t.includes('směnový vedoucí'), t.slice(0, 120));
  await ctx.close();
}

// 5) Navigace podle oprávnění (Účetní) a poctivý stav bez oprávnění
{
  const u = sysRole('ucetni');
  const ctx = await kontext({ width: 1280, height: 950 }, { mineData: mine(u.opravneni, { klic: 'ucetni', roleId: null, nazev: u.nazev, typ: 'vedeni', jeVlastnik: false }) });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview?view=shifts', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  const nav = norm(await p.locator('aside nav').innerText());
  tvrdi('navigace účetní: Finance a Uzávěrky ano, Rozvrh a Plánování ne', nav.includes('finance') && nav.includes('uzávěrky') && !nav.includes('rozvrh') && !nav.includes('plánování'), nav);
  tvrdi('pohled bez oprávnění: „Na tohle nemáš v tomto podniku oprávnění"', norm(await p.locator('main').innerText()).includes('na tohle nemáš v tomto podniku oprávnění'), 'jiný obsah');
  await ctx.close();
}
// 5b) Vedení (vlastník) vidí celou navigaci jako dřív
{
  const ctx = await kontext({ width: 1280, height: 950 });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/employer/overview', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  const nav = norm(await p.locator('aside nav').innerText());
  const chybi = ['rozvrh', 'sklad', 'receptury', 'postupy', 'úkoly', 'návody', 'plánování', 'uzávěrky', 'finance', 'nápady', 'docházka', 'moje směny', 'odměny'].filter(x => !nav.includes(x));
  tvrdi('navigace vedení: nic nechybí', chybi.length === 0, chybi.join(', '));
  await ctx.close();
}

// 6) Telefon 390 px: seznam rolí i editor bez přetečení
{
  const ctx = await kontext({ width: 390, height: 844 });
  const p = await ctx.newPage();
  await otevriRole(p);
  const sirka = () => p.evaluate(() => document.documentElement.scrollWidth);
  tvrdi('telefon: seznam rolí nepřetéká', await sirka() <= 390, `šířka ${await sirka()}`);
  await p.getByRole('button', { name: 'Nová role' }).click(); await p.waitForTimeout(400);
  await p.locator('button[aria-expanded]').filter({ hasText: 'Zákazníci a menu' }).first().click(); await p.waitForTimeout(300);
  tvrdi('telefon: editor nepřetéká', await sirka() <= 390, `šířka ${await sirka()}`);
  const mimo = [];
  // Záložky Nastavení jsou vodorovně rolovací pás — ty za okraj smí; hlídá se editor.
  const tl = p.locator('main form button').filter({ visible: true });
  for (let i = 0; i < Math.min(await tl.count(), 80); i++) { const bb = await tl.nth(i).boundingBox(); if (bb && (bb.x < 0 || bb.x + bb.width > 391)) mimo.push((await tl.nth(i).innerText()).trim().slice(0, 20) + '@' + Math.round(bb.x + bb.width)); }
  tvrdi('telefon: žádné tlačítko editoru nekončí za okrajem', mimo.length === 0, mimo.join(', '));
  await p.screenshot({ path: new URL('./shots/role-telefon.png', import.meta.url).pathname });
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} selhání` : '\nvše v pořádku');
process.exit(fails ? 1 : 0);
