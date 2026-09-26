// Kolo 60 — sdílené číselníky v UI podniku, který je přijímá.
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
const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, locale: 'cs-CZ' });
await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const posty = [];
await ctx.route('**/api/**', async route => {
  const u = route.request().url();
  if (u.includes('/api/auth/')) return route.continue();
  if (route.request().method() !== 'GET') { posty.push({ url: u.replace('http://localhost:3000', ''), body: route.request().postData() }); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, organization: { id: 9, name: 'Moje kavárny', settings: JSON.parse(readFileSync(DIR + 'organization.json', 'utf8')).organization.settings }, kopie: [] }) }); }
  // Kolo 69 (B3): Sklad je plocha s widgety — rozložení (widgety skladu a položky jako nástroj) z fixtury balíku.
  if (new URL(u).pathname === '/api/rozlozeni' && new URL(u).searchParams.get('stranka') === 'vedeni.sklad') return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + 'k69-b3-rozlozeni-sklad.json', 'utf8') });
  // Kolo 69 (B1): Rozvrh je plocha s widgety — rozložení z fixtury balíku (widgety rozvrhu a plánovač jako nástroj).
  if (new URL(u).pathname === '/api/rozlozeni' && new URL(u).searchParams.get('stranka') === 'vedeni.rozvrh') return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + 'k69-b1-rozlozeni-rozvrh.json', 'utf8') });
  // Kolo 69 (B2): Docházka a Tým jsou plochy s widgety — rozložení (widgety a nástroj) z fixtury balíku.
  if (new URL(u).pathname === '/api/rozlozeni' && ['vedeni.dochazka', 'vedeni.tym'].includes(new URL(u).searchParams.get('stranka'))) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + (new URL(u).searchParams.get('stranka') === 'vedeni.tym' ? 'k69-b2-rozlozeni-tym' : 'k69-b2-rozlozeni-dochazka') + '.json', 'utf8') });
  const k = keyFor(u);
  if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
const p = await ctx.newPage();
let fails = 0;
const tvrdi = (popis, ok, co = '') => { console.log(`${ok ? '✓' : '✗'} ${popis}${ok ? '' : '  ← ' + co}`); if (!ok) fails++; };
const norm = s => s.replace(/ /g, ' ').toLowerCase();
// Řádek seznamu = nejvnitřnější „well"/„glass-card"/li, který text obsahuje. Filtrovací
// čipy v hlavičce skladu a čekající žádosti o odměnu nesou stejný text, proto se
// řádky filtrují podle tlačítek, ne bere první shoda.
// Řádkem je i přímé dítě seznamu „divide-y" (správce kategorií, katalog odměn).
const RADEK = '(contains(@class,"well") or contains(@class,"glass-card") or self::li or parent::*[contains(@class,"divide-y")])';
const radky = (text, scope = p) => scope.locator(`xpath=//*[${RADEK} and .//text()[contains(., "${text}")] and not(.//*[${RADEK} and .//text()[contains(., "${text}")]])]`);

// 1) Nastavení organizace
await p.goto('http://localhost:3000/employer/overview?view=team-settings', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
// Kolo 69 (B2): nastavení týmu je v sekcích nástroje; organizace je v sekci Podnik.
await p.getByRole('tab', { name: 'Podnik' }).click(); await p.waitForTimeout(600);
let m = norm(await p.locator('main').innerText());
tvrdi('nastavení: blok „Kdo který číselník spravuje"', m.includes('kdo který číselník spravuje'), m.slice(0, 200));
tvrdi('nastavení: pět výběrů zdroje', await p.locator('select[aria-labelledby^="org-zdroj-"]').count() === 5, String(await p.locator('select[aria-labelledby^="org-zdroj-"]').count()));
tvrdi('nastavení: „připravuje se" už jen u fakturace', (m.match(/připravuje se/g) || []).length === 1, String((m.match(/připravuje se/g) || []).length));
tvrdi('nastavení: výběr kategorií ukazuje Kavárna Vinohrady', (await p.locator('select[aria-labelledby="org-zdroj-kategorieSkladu"]').inputValue()) === '1', 'hodnota jiná');
// změna zdroje odměn → PATCH s celou mapou zdrojů
await p.locator('select[aria-labelledby="org-zdroj-odmeny"]').selectOption('2'); await p.waitForTimeout(600);
const patch = posty.find(x => x.url === '/api/organization');
tvrdi('nastavení: PATCH nese celou mapu zdrojů', !!patch && /"zdrojeCiselniku":\{[^}]*"kategorieSkladu":1[^}]*"odmeny":2/.test(patch.body ?? ''), JSON.stringify(patch).slice(0, 200));
// vypnutí hlavního vypínače → potvrzení říká, co dostane kopii a co se jen přestane číst; zrušení nic neposílá
// Kolo 69 (B2): potvrzení je Modal „Změnit sdílení?", ne confirm() prohlížeče.
const predTim = posty.filter(x => x.url === '/api/organization').length;
await p.getByRole('switch', { name: 'Sdílené číselníky' }).click(); await p.waitForTimeout(600);
const okno = p.getByRole('dialog', { name: 'Změnit sdílení?' });
const zprava = await okno.innerText().catch(() => '');
await okno.getByRole('button', { name: 'Zrušit' }).click().catch(() => {}); await p.waitForTimeout(300);
tvrdi('nastavení: potvrzení rozlišuje kopie a „přestanou být vidět"', /kopie toho, co z organizace používají: kategorie skladu, typy směn, kategorie návodů\./.test(zprava) && /přestanou být v podnicích vidět: dodavatelé\./.test(zprava), zprava.slice(0, 220));
tvrdi('nastavení: zrušené potvrzení nic neuloží', posty.filter(x => x.url === '/api/organization').length === predTim, 'PATCH odešel');

// 2) Sklad → Kategorie a balení
await p.goto('http://localhost:3000/employer/overview?view=inventory', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
await p.locator('[data-plocha] button[aria-label="Další akce"]:visible').first().click(); // kolo 69: „···" hlavičky plochy await p.waitForTimeout(400);
await p.getByRole('menu').getByText('Kategorie a balení', { exact: false }).first().click(); await p.waitForTimeout(700);
m = norm(await p.locator('body').innerText());
tvrdi('sklad: správce kategorií má blok „Z organizace"', m.includes('z organizace') && m.includes('sirupy z organizace'), m.slice(0, 120));
{ const s = radky('Sirupy z organizace', p.getByRole('dialog')); const n = await s.count(); const sTl = await s.filter({ has: p.locator('button:not([class*="chip"])') }).count();
  tvrdi('sklad: cizí kategorie bez tlačítek úprav', n >= 1 && sTl === 0, `řádků ${n}, s tlačítky ${sTl}`); }
tvrdi('sklad: uvádí, kdo kategorii spravuje', m.includes('spravuje: kavárna vinohrady'), 'chybí „Spravuje:"');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// 3) Rozvrh → Typy směn
await p.locator('aside').getByText('Rozvrh', { exact: true }).first().click(); await p.waitForTimeout(1200);
await p.getByText('Typy směn', { exact: true }).first().click(); await p.waitForTimeout(900);
m = norm(await p.locator('main').innerText());
tvrdi('typy směn: cizí typ s chipem a správcem', m.includes('noční z organizace') && m.includes('spravuje: kavárna vinohrady'), m.slice(0, 160));
// Kolo 69 (B1): akce řádku jsou ikonová tlačítka s aria-label („Upravit typ Ranní"), ne title.
tvrdi('typy směn: cizí typ bez Upravit/Smazat', await p.getByRole('button', { name: /(Upravit|Smazat) typ Noční z organizace/ }).count() === 0, 'tlačítka jsou tam');
tvrdi('typy směn: vlastní typ má Upravit', await p.getByRole('button', { name: 'Upravit typ Ranní' }).count() >= 1, 'vlastní typ bez Upravit');

// 4) Návody → Spravovat kategorie
await p.goto('http://localhost:3000/employer/overview?view=guides', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
await p.locator('button[title="Spravovat kategorie"]').first().click(); await p.waitForTimeout(700);
m = norm(await p.locator('body').innerText());
tvrdi('návody: cizí kategorie s chipem', m.includes('bezpečnost z organizace') && (m.match(/z organizace/g) || []).length >= 2, m.slice(0, 160));
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// 5) Odměny
await p.goto('http://localhost:3000/employer/overview?view=rewards', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
m = norm(await p.locator('main').innerText());
tvrdi('odměny: cizí odměna s chipem a správcem', m.includes('volný den z organizace') && m.includes('spravuje: kavárna vinohrady'), m.slice(0, 160));
tvrdi('odměny: cizí odměna bez Odebrat', await radky('Volný den z organizace').filter({ has: p.locator('button[aria-label="Odebrat"]') }).count() === 0, 'Odebrat je tam');
tvrdi('odměny: vlastní odměna má Odebrat', await radky('Volný pátek').filter({ has: p.locator('button[aria-label="Odebrat"]') }).count() >= 1, 'vlastní bez Odebrat');

console.log(fails ? `\n${fails} SELHALO` : '\njeden podnik spravuje, ostatní vidí — a je vidět odkud');
await b.close(); process.exit(fails ? 1 : 0);
