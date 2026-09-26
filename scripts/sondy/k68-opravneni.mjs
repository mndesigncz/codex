// Kolo 68 — widget bez oprávnění neexistuje (spec §1.5, §7.2 k68-opravneni, AK-13, AK-14, O11).
//
// Server je první brána, klient druhá: i když zastaralý server pošle
// Pokladnu dnes roli bez tržeb, plocha ji nenakreslí, galerie ji nenabídne
// a na /api/pos/summary neodejde ANI JEDEN dotaz. Než dorazí oprávnění,
// neodejde žádný datový dotaz widgetu s klíčem (ma() před načtením vrací
// ANO — widget ale čeká na `nacteno && ma()`). Zamčené rozložení nemá žádný
// vstup do úprav a UI nepošle PUT. Tablet si rozložení neupravuje vůbec.
import {
  kontext, konec, tvrdi, otevri, lista, upravit, vUpravach, stred, dokud, dotyk, podrzPrstem, podrzMysi, mistoPodPlochou,
  dotazyNa, roleMine, VLASTNIK, FIX_VEDENI, FIX_DOMU, BASE, tokenPro, browser,
} from './k68-spolecne.mjs';

const P = (id, widget, velikost) => ({ id, widget, velikost });
const naPlose = (p, widget) => p.locator(`[data-plocha] li[data-widget="${widget}"]:not([hidden])`).count();

// 1) Provozní bez finance.trzby, zastaralý server s Pokladnou v položkách i v `dostupne`.
{
  const { ctx, p, stav } = await kontext({ mineData: roleMine('provozni') });
  await otevri(p, '/employer/overview');
  await p.waitForTimeout(800);
  tvrdi('1: Provozní bez tržeb nevidí Pokladnu dnes (server ji poslal)', await naPlose(p, 'pokladna.dnes') === 0);
  tvrdi('1: ani „Pokladna dnes" v textu plochy', !(await p.locator('[data-plocha]').innerText()).includes('Pokladna dnes'));
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(500);
  tvrdi('1: v galerii Pokladna dnes není (ani zamčená, ani šedá)', !(await galerie.innerText()).includes('Pokladna dnes'));
  tvrdi('1: galerie jiné widgety nabízí', await galerie.getByRole('button', { name: 'Dnešní směny' }).count() === 1);
  await p.keyboard.press('Escape');
  tvrdi('1: na /api/pos/summary neodešel ani jeden dotaz', dotazyNa(stav, ['/api/pos/summary']).length === 0, `${dotazyNa(stav, ['/api/pos/summary']).length}×`);
  await ctx.close();
}

// 2) Oprávnění dorazí za 800 ms — do té doby žádný datový dotaz widgetu s klíčem, jen kostry.
{
  const fix = { ...FIX_VEDENI, polozky: [
    P('pokladna-dnes', 'pokladna.dnes', 'M'), P('klient-hoste-vernost', 'klient.hoste_vernost', 'M'),
    P('rozvrh-dostupnost-tymu', 'rozvrh.dostupnost_tymu', 'M'), P('hodnoceni-ohodnotit-smeny', 'hodnoceni.ohodnotit_smeny', 'L'),
    P('sklad-dochazi', 'sklad.dochazi', 'S'), P('chat-neprectene', 'chat.neprectene', 'S'),
  ] };
  const { ctx, p, stav } = await kontext({ fix, mineZpozdeni: 800 });
  await p.goto(BASE + '/employer/overview', { waitUntil: 'domcontentloaded' });
  // Kostry se hledají, dokud oprávnění nedorazila (pod zátěží paralelních sond může
  // první vykreslení plochy přijít až těsně před nimi).
  let kostry = 0;
  while (stav.mineDoruceno == null && kostry === 0) {
    kostry = await p.locator('[data-plocha] .shimmer, [data-plocha] [aria-busy="true"]').count().catch(() => 0);
    await p.waitForTimeout(40);
  }
  await dokud(async () => stav.mineDoruceno != null, 5000);
  await p.waitForTimeout(1500);
  // Jen endpointy, které volají výhradně widgety (nepřečtené zprávy si načítá i navigace layoutu).
  const KLICOVE = ['/api/pos/summary', '/api/client/admin/summary', '/api/availability', '/api/shift-reviews', '/api/inventory'];
  const predMine = stav.dotazy.filter(d => d.t < stav.mineDoruceno && KLICOVE.some(x => d.path.startsWith(x)));
  tvrdi('2: před načtením oprávnění neodešel žádný datový dotaz widgetu s klíčem', predMine.length === 0, predMine.map(d => d.path).join(', '));
  tvrdi('2: mezitím jsou vidět kostry', kostry > 0, String(kostry));
  const poMine = new Set(dotazyNa(stav, KLICOVE).map(d => d.path));
  tvrdi('2: po načtení (vlastník) se data widgetů načtou', poMine.has('/api/pos/summary') && poMine.has('/api/availability'), [...poMine].join(', '));
  await ctx.close();
}

// 3) Účetní: bez dostupnost.zobrazit (žádná Dostupnost týmu ani /api/availability?month) a bez oznameni.spravovat.
{
  const fix = { ...FIX_VEDENI, polozky: [
    P('rozvrh-dostupnost-tymu', 'rozvrh.dostupnost_tymu', 'M'), P('oznameni-nastenka', 'oznameni.nastenka', 'L'), P('ukoly-dnes', 'ukoly.dnes', 'S'),
  ] };
  const { ctx, p, stav } = await kontext({ fix, mineData: roleMine('ucetni') });
  await otevri(p, '/employer/overview');
  await p.waitForTimeout(800);
  tvrdi('3: role bez dostupnost.zobrazit nevidí Dostupnost týmu', await naPlose(p, 'rozvrh.dostupnost_tymu') === 0);
  tvrdi('3: …a na /api/availability?month neodešel dotaz', dotazyNa(stav, ['/api/availability']).length === 0, dotazyNa(stav, ['/api/availability']).map(d => d.u).join(', '));
  const nastenka = p.locator('[data-plocha] li[data-widget="oznameni.nastenka"]');
  tvrdi('3: Nástěnka je vidět (čte každý)', await nastenka.count() === 1 && await nastenka.isVisible());
  tvrdi('3: bez oznameni.spravovat nemá Nástěnka formulář', await nastenka.locator('textarea').count() === 0 && !(await nastenka.innerText()).includes('Nové oznámení'));
  tvrdi('3: …ani menu akcí u oznámení', await nastenka.getByRole('button', { name: /Další akce s oznámením/ }).count() === 0);
  await ctx.close();
}

// 4) Barista (bez vyroba.vyrabet) na Domů: zastaralý server posílá i Čeká na tebe a K výrobě.
{
  const fix = { ...FIX_DOMU, polozky: [P('prehled-ceka-na-tebe', 'prehled.ceka_na_tebe', 'L'), P('vyroba-k-vyrobe', 'vyroba.k_vyrobe', 'L'), ...FIX_DOMU.polozky] };
  const { ctx, p, stav } = await kontext({ role: 'employee', mineData: roleMine('barista', ['vyroba.vyrabet']), fix });
  await otevri(p, '/employee/shifts', 'zamestnanec.domu');
  await p.waitForTimeout(800);
  tvrdi('4: Barista nevidí Čeká na tebe', await naPlose(p, 'prehled.ceka_na_tebe') === 0);
  tvrdi('4: bez vyroba.vyrabet nevidí K výrobě a /api/production se nevolá', await naPlose(p, 'vyroba.k_vyrobe') === 0 && dotazyNa(stav, ['/api/production']).length === 0);
  const { KATALOG_ZAM } = { KATALOG_ZAM: new Set(FIX_DOMU.dostupne) };
  const viditelne = await p.$$eval('[data-plocha] li[data-widget]:not([hidden])', els => els.map(e => e.getAttribute('data-widget')));
  tvrdi('4: všechny viditelné widgety jsou z rozhraní zaměstnance', viditelne.length > 0 && viditelne.every(w => KATALOG_ZAM.has(w)), JSON.stringify(viditelne));
  await ctx.close();
}

// 5) Zamčené rozložení: bez „Upravit" i „Upravit stránku", podržení nic neotevře, žádný PUT.
{
  const fix = { ...FIX_DOMU, zamceno: true, smiUpravit: false };
  const { ctx, p, stav } = await kontext({ role: 'employee', mineData: roleMine('barista'), fix, viewport: { width: 390, height: 844 }, mobil: true });
  await otevri(p, '/employee/shifts', 'zamestnanec.domu');
  const plochaEl = p.locator('[data-plocha]');
  tvrdi('5: zamčeno: žádné „Upravit"', await plochaEl.locator('button', { hasText: /^Upravit$/ }).count() === 0);
  const tri = plochaEl.locator('button[aria-haspopup="menu"]').first();
  let vMenu = [];
  if (await tri.count() && await tri.isVisible()) { await tri.click(); await p.waitForTimeout(300); vMenu = (await p.getByRole('menuitem').allInnerTexts()).map(s => s.trim()); await p.keyboard.press('Escape'); }
  tvrdi('5: zamčeno: žádné „Upravit stránku" ani v „···"', !vMenu.includes('Upravit stránku'), JSON.stringify(vMenu));
  tvrdi('5: zamčeno: plocha vysvětlí proč („nastavuje vedení")', (await plochaEl.innerText()).includes('Rozložení téhle stránky nastavuje vedení.'));
  const cdp = await dotyk(p);
  // Prst na titulku středního widgetu: malý má natažený odkaz přes celou kartu
  // a emulace Chromia po dlouhém stisku tlačítka pošle click (telefon ne).
  const w = await stred(p.locator('[data-plocha] li[data-velikost="M"]:not([hidden]) h2').first());
  await podrzPrstem(cdp, p, w.x, w.y);
  tvrdi('5: podržení widgetu prstem neotevře menu', (await p.getByRole('menu').count()) === 0);
  tvrdi('5: …a nikam nenavigovalo', p.url().includes('/employee/shifts') || p.url().endsWith('/employee'), p.url());
  const pod = await mistoPodPlochou(p);
  await p.waitForTimeout(200);
  await podrzPrstem(cdp, p, pod.x, pod.y);
  tvrdi('5: podržení prázdného místa nevstoupí do úprav', !(await vUpravach(p)));
  await p.waitForTimeout(800);
  tvrdi('5: za celý scénář UI neposlalo ani jeden PUT', stav.puty.length === 0 && stav.dotazy.filter(d => d.m === 'PUT').length === 0, `${stav.dotazy.filter(d => d.m === 'PUT').length} PUT`);
  await ctx.close();
}

// 6) Tablet (O11): žádná plocha k úpravám, žádné „Upravit stránku", podržení nic neotevře, žádný zápis rozložení.
{
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 768, height: 1024 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro('kiosk'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const zapisy = [];
  const { readFileSync, existsSync, readdirSync } = await import('node:fs');
  const DIR = new URL('./fixtury/', import.meta.url).pathname;
  const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
  const keyFor = (u2) => { const u = new URL(u2); const pp = u.pathname.replace(/^\/api\//, ''); const bare = pp.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
  await ctx.route('**/api/**', async route => {
    const req = route.request(); const u = req.url();
    if (u.includes('/api/auth/')) return route.continue();
    if (u.includes('/api/rozlozeni') && req.method() !== 'GET') zapisy.push(req.method() + ' ' + u);
    if (req.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  await p.goto(BASE + '/kiosk', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const text = await p.locator('body').innerText();
  tvrdi('tablet: stránka se načetla', text.trim().length > 20, text.slice(0, 80));
  tvrdi('tablet: žádné „Upravit stránku" ani lišta úprav', !text.includes('Upravit stránku') && (await p.getByRole('region', { name: 'Úpravy stránky' }).count()) === 0);
  const cdp = await p.context().newCDPSession(p);
  await podrzPrstem(cdp, p, 384, 520);
  tvrdi('tablet: podržení neotevře menu widgetu ani úpravy', (await p.locator('[data-plocha][data-upravy]').count()) === 0 && (await p.getByRole('menu', { name: /Nabídka widgetu/ }).count()) === 0);
  tvrdi('tablet: žádný zápis rozložení', zapisy.length === 0, zapisy.join(', '));
  await ctx.close();
}

// Myš: zamčené rozložení na monitoru — podržení widgetu i pravé tlačítko nic neotevřou.
{
  const fix = { ...FIX_VEDENI, zamceno: true, smiUpravit: false, smiVychozi: false };
  const { ctx, p, stav } = await kontext({ mineData: roleMine('provozni'), fix });
  await otevri(p, '/employer/overview');
  const w = await stred(p.locator('[data-plocha] li[data-instance="ukoly-dnes"]'));
  await podrzMysi(p, w.x, w.y);
  tvrdi('zamčeno (myš): podržení neotevře menu', (await p.getByRole('menu').count()) === 0);
  tvrdi('zamčeno (myš): žádné „Upravit"', await p.locator('[data-plocha]').getByRole('button', { name: 'Upravit', exact: true }).count() === 0);
  tvrdi('zamčeno (myš): žádný PUT', stav.puty.length === 0);
  await ctx.close();
}

// Výpadek /api/teams/mine: „Čeká na tebe" se nesmí potichu schovat. Plocha
// widgety připojí (rozhodl server) a fronty si hlídá každý dotaz sám; dřív
// useSmi při chybě vracelo NE, všechny fronty byly vypnuté a widget zmizel.
{
  const fix = { ...FIX_VEDENI, polozky: [{ id: 'prehled-ceka-na-tebe', widget: 'prehled.ceka_na_tebe', velikost: 'L' }, ...FIX_VEDENI.polozky] };
  const { ctx, p } = await kontext({ fix, dalsi: (req, json) => (new URL(req.url()).pathname === '/api/teams/mine' ? json({ error: 'Server spadl' }, 500) : undefined) });
  await otevri(p, '/employer/overview');
  await p.waitForTimeout(1500);
  const w = await p.evaluate(() => { const l = document.querySelector('[data-plocha] li[data-widget="prehled.ceka_na_tebe"]'); return { skryte: l?.hidden ?? null, text: (l?.textContent ?? '').slice(0, 80) }; });
  tvrdi('výpadek oprávnění: „Čeká na tebe" zůstane vidět s frontami', w.skryte === false && w.text.startsWith('Čeká na tebe') && w.text.length > 'Čeká na tebe'.length, JSON.stringify(w));
  await ctx.close();
}

// Kartička hosta u kasy: zaměstnanec s vernost.karta ji má ve widgetu
// Objednávky od stolu (dřív ji Domů kreslilo přes StaffInbox), bez klíče ne.
for (const [klic, bez, cekam] of [['barista', [], 1], ['barista', ['vernost.karta'], 0]]) {
  const fix = { ...FIX_DOMU, polozky: [{ id: 'klient-objednavky-od-stolu', widget: 'klient.objednavky_od_stolu', velikost: 'L' }, ...FIX_DOMU.polozky] };
  const { ctx, p } = await kontext({ role: 'employee', mineData: roleMine(klic, bez), fix,
    dalsi: (req, json) => (new URL(req.url()).pathname === '/api/client/staff/inbox' ? json({ orders: [], reservations: [], pos: { connected: false } }) : undefined) });
  await otevri(p, '/employee/shifts', 'zamestnanec.domu');
  await p.waitForTimeout(800);
  const n = await p.locator('[data-plocha] li[data-widget="klient.objednavky_od_stolu"]').getByText('Kartička hosta u kasy').count();
  tvrdi(`kartička hosta: ${bez.length ? 'bez vernost.karta chybí' : 's vernost.karta je v Objednávkách od stolu'}`, n === cekam, String(n));
  await ctx.close();
}

void VLASTNIK;
await konec();
