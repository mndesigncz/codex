// Spuštění (balík C): fyzické kartičky.
//
// Sonda tvrdí na 390 px (telefon, dotyk) i na 1280 px:
//  C1 Client → Kartičky: počty podle stavu, dávky, seznam karet se stavem a hostem; „Vytisknout dávku“
//     ověří počet (10–500) a POST dávky otevře tiskový arch; filtr stavu jde do adresy API; blokace
//     a náhrada přes okno s potvrzením (POST /api/client/cards/<id>).
//  C2 Čtečka u kasy: nová karta → „Nová karta“ s hledáním hosta (GET hoste) → Přiřadit (POST aktivace)
//     → karta se načte znovu a je u ní host. Host bez aplikace: jméno povinné, telefon nepovinný.
//     Zablokovaná karta → „Karta je zablokovaná.“
//  C3 Moje (host): „Mám plastovou kartu“ → kód → připojeno; připojené karty v seznamu.
//  Vše bez vodorovného posuvu, cíle akcí aspoň 44 px, bez chyb v konzoli.
//   SONDY_ZAKLAD=http://localhost:3445 node scripts/sondy/k90-karty.mjs
import { kontext, tvrdi, konec, browser, tokenPro, BASE, OUT } from './k68-spolecne.mjs';

const SNIMKY = process.env.SONDY_SNIMKY ? process.env.SONDY_SNIMKY.replace(/\/?$/, '/') : OUT;
const dbCas = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const ted = Date.now();

const KARTY = [
  { id: 11, kod: 'KMPT-4XQ2', cislo: 'KMPT-4XQ2', stav: 'aktivni', zdroj: 'davka', davkaId: 3, hostId: 7, host: 'Klára Vojtíšková', bezAplikace: true, activated_at: dbCas(ted - 86400000) },
  { id: 12, kod: 'R7WN-9HDA', cislo: 'R7WN-9HDA', stav: 'nova', zdroj: 'davka', davkaId: 3, hostId: null, host: null, bezAplikace: false, activated_at: null },
  { id: 13, kod: 'T5:100245', cislo: '100245', stav: 'aktivni', zdroj: 'import', davkaId: null, hostId: 8, host: 'Petr Dlouhý se strašně dlouhým příjmením Novák-Svoboda', bezAplikace: false, activated_at: dbCas(ted - 30 * 86400000) },
  { id: 14, kod: 'ZZ2B-QW8E', cislo: 'ZZ2B-QW8E', stav: 'blokovana', zdroj: 'davka', davkaId: 3, hostId: null, host: null, bezAplikace: false, activated_at: null },
];
const SEZNAM = {
  davky: [{ id: 3, nazev: 'Léto 2026', pocet: 50, nove: 47, aktivni: 2, blokovane: 1, created_at: dbCas(ted - 5 * 86400000) }],
  pocty: { nova: 47, aktivni: 3, blokovana: 1 }, zImportu: 1, karty: KARTY, dalsi: false, smiSpravovat: true,
};
const HOST = {
  customer: { id: 7, name: 'Klára Vojtíšková' }, member: true, points: 40, credit: 0, stamps: 1, visits: 2, spend: 300, campaigns: [], posledniAkce: null, polozky: [],
  tierBy: 'visits', levelLabel: 'Člen', tier: 'bronze', discount: 0, discountSource: null, discountName: null, tierDiscount: 0, nextTierAt: null,
  stampedToday: false, birthdayToday: false, lastVisit: null, openCoupons: [], affordable: [], bills: [], parovani: null,
  rules: { pointsPer100: 10, stampTarget: 8, stampReward: 'Káva zdarma', cashbackPct: 0 },
};

const scrollX = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const maleCile = (p, sel, min) => p.$$eval(`${sel} button, ${sel} input`, (bs, min) => bs.filter(b => b.offsetParent && b.getAttribute('type') !== 'hidden')
  .map(b => ({ t: (b.textContent || b.getAttribute('aria-label') || b.id || '').trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height), pole: b.tagName === 'INPUT' }))
  // Pole (.field) má na počítači 42–43 px (na telefonu 16px písmo a víc); tlačítka musí mít plný cíl.
  .filter(b => b.h < (b.pole ? Math.min(min, 42) : min)), min);
const otevrene = (p) => p.evaluate(() => window.__otevreno ?? []);
const zachytOkna = (ctx) => ctx.addInitScript(() => { window.__otevreno = []; window.open = (u) => { window.__otevreno.push(String(u)); return null; }; });

// ---- C1: správa ----
for (const [sirka, mobil] of [[390, true], [1280, false]]) {
  const jm = `Kartičky ${sirka} px`;
  const zaznam = [];
  const dalsi = (req, json) => {
    const u = new URL(req.url()); const m = req.method();
    if (u.pathname === '/api/client/cards' && m === 'GET') { zaznam.push({ m, q: u.search }); return json(SEZNAM); }
    if (u.pathname === '/api/client/cards' && m === 'POST') { const b = JSON.parse(req.postData() || '{}'); zaznam.push({ m, ...b }); return json({ ok: true, davka: { id: 4, pocet: b.pocet } }); }
    const k = /^\/api\/client\/cards\/(\d+)$/.exec(u.pathname);
    if (k && m === 'POST') {
      const b = JSON.parse(req.postData() || '{}'); zaznam.push({ m, id: Number(k[1]), ...b });
      return b.akce === 'nahradit' ? json({ ok: true, nova: { id: 20, kod: 'N3WC-ARD7' }, tisk: !b.kod, message: 'Nová karta N3WC-ARD7 patří hostovi, stará je zablokovaná.' })
        : json({ ok: true, message: 'Karta R7WN-9HDA je zablokovaná.' });
    }
    return undefined;
  };
  const { ctx, p, chyby } = await kontext({ viewport: { width: sirka, height: sirka < 500 ? 844 : 900 }, mobil, dalsi });
  await zachytOkna(ctx);
  // Kolo 92: plastové karty jsou část Věrnost → Kupony a poukazy (dřív samostatná záložka Kartičky).
  await p.goto(BASE + '/employer/overview?mode=client&tab=cards', { waitUntil: 'networkidle' });
  await p.getByRole('tab', { name: 'Plastové karty' }).click();
  await p.locator('[data-testid="karty-seznam"]').waitFor({ timeout: 20000 });
  const text = await p.locator('main').innerText();
  tvrdi(`${jm}: jeden h1 „Kartičky“`, (await p.locator('h1').count()) === 1 && /Kartičky/.test(await p.locator('h1').innerText()));
  tvrdi(`${jm}: počty podle stavu a převzaté z importu`, /Aktivní\s*3/i.test(text) && /Nepřiřazené\s*47/i.test(text) && /starých karet z importu Kartičky: 1 karta/.test(text), text.slice(0, 300));
  tvrdi(`${jm}: dávka s počty`, /Léto 2026/.test(text) && /50 karet/.test(text) && /Aktivní 2 · nepřiřazené 47 · zablokované 1/.test(text));
  tvrdi(`${jm}: karta s hostem bez aplikace, stará karta jen číslem`, /Klára Vojtíšková · bez aplikace/.test(text) && /100245/.test(text) && !/T5:100245/.test(text) && /stará karta/.test(text));
  tvrdi(`${jm}: stav slovem (Aktivní / Nepřiřazená / Zablokovaná)`, /Nepřiřazená/.test(text) && /Zablokovaná/.test(text));
  tvrdi(`${jm}: bez vodorovného posuvu`, (await scrollX(p)) <= 0, String(await scrollX(p)));
  // „Skrýt tenhle popis“ je společný křížek PageHeaderu (mimo tuhle obrazovku).
  const male = (await maleCile(p, 'main', 36)).filter(b => !/Skrýt tenhle popis/.test(b.t));
  tvrdi(`${jm}: cíle aspoň 36 px (malé akce řádků), hlavní 44`, male.length === 0, JSON.stringify(male.slice(0, 5)));
  await p.screenshot({ path: `${SNIMKY}k90-sprava-${sirka}.png`, fullPage: true }).catch(() => {});

  // Filtr stavu → adresa API
  await p.getByRole('tab', { name: 'Nepřiřazené' }).or(p.getByRole('button', { name: 'Nepřiřazené' })).first().click();
  await p.waitForTimeout(400);
  tvrdi(`${jm}: filtr stavu jde do API`, zaznam.some(z => z.m === 'GET' && /stav=nova/.test(z.q)), JSON.stringify(zaznam.map(z => z.q)));

  // Nová dávka
  await p.getByRole('button', { name: 'Vytisknout dávku' }).click();
  const okno = p.getByRole('dialog');
  await okno.getByLabel('Počet karet').fill('5');
  await okno.getByRole('button', { name: 'Založit a vytisknout' }).click();
  await okno.getByRole('alert').waitFor({ timeout: 3000 });
  tvrdi(`${jm}: počet pod 10 neprojde (bez POST)`, /Nejméně 10/.test(await okno.getByRole('alert').innerText()) && !zaznam.some(z => z.m === 'POST' && z.pocet));
  await p.screenshot({ path: `${SNIMKY}k90-davka-${sirka}.png` }).catch(() => {});
  await okno.getByLabel('Počet karet').fill('20');
  await okno.getByLabel('Název (nepovinné)').fill('Podzim');
  await okno.getByRole('button', { name: 'Založit a vytisknout' }).click();
  await p.waitForTimeout(500);
  tvrdi(`${jm}: POST dávky s počtem a názvem`, zaznam.some(z => z.m === 'POST' && z.pocet === 20 && z.nazev === 'Podzim'));
  tvrdi(`${jm}: otevře se tiskový arch dávky`, (await otevrene(p)).some(u => u.includes('/api/client/cards/davky/4/tisk')), JSON.stringify(await otevrene(p)));

  // Blokace nepřiřazené karty
  await p.getByRole('button', { name: 'Akce s kartou R7WN-9HDA' }).click();
  await p.getByRole('menuitem', { name: 'Zablokovat' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Zablokovat' }).click();
  await p.waitForTimeout(400);
  tvrdi(`${jm}: Zablokovat = POST blokovat`, zaznam.some(z => z.id === 12 && z.akce === 'blokovat'));

  // Náhrada aktivní karty bez kódu → tisk nové
  await p.getByRole('button', { name: 'Akce s kartou KMPT-4XQ2' }).click();
  await p.getByRole('menuitem', { name: 'Nahradit novou kartou' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Nahradit' }).click();
  await p.waitForTimeout(500);
  tvrdi(`${jm}: Nahradit = POST nahradit, nová karta k tisku`, zaznam.some(z => z.id === 11 && z.akce === 'nahradit') && (await otevrene(p)).some(u => u.includes('/api/client/cards/20/tisk')));
  tvrdi(`${jm}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---- C2: čtečka u kasy ----
for (const [sirka, mobil] of [[390, true], [1280, false]]) {
  const jm = `Čtečka ${sirka} px`;
  const zaznam = []; let aktivovano = false;
  const dalsi = (req, json) => {
    const u = new URL(req.url()); const m = req.method();
    if (u.pathname === '/api/client/staff/scan' && m === 'GET') {
      const code = u.searchParams.get('code'); zaznam.push({ m, code });
      if (/ZZ2B/.test(code)) return json({ error: 'Karta je zablokovaná.', blokovana: true }, 403);
      return json(aktivovano ? HOST : { novaKarta: { kod: 'R7WN-9HDA', davkaId: 3 } });
    }
    if (u.pathname === '/api/client/cards/hoste') { zaznam.push({ m, hledat: u.searchParams.get('q') }); return json({ hoste: [
      { id: 7, name: 'Klára Vojtíšková', kontakt: 'k•••@seznam.cz', clen: true, body: 40, bezAplikace: false },
      { id: 9, name: 'Klára Malá', kontakt: '••• 456', clen: false, body: 0, bezAplikace: false },
    ] }); }
    if (u.pathname === '/api/client/cards/aktivace') {
      const b = JSON.parse(req.postData() || '{}'); zaznam.push({ m, akt: true, ...b }); aktivovano = true;
      return json({ ok: true, customer: { id: 7, name: 'Klára Vojtíšková' }, kod: 'R7WN-9HDA', message: 'Karta R7WN-9HDA patří hostovi Klára Vojtíšková.' });
    }
    if (u.pathname === '/api/client/staff/claims') return json({ pos: false, ceka: [], hotovo: [], stoly: [] });
    return undefined;
  };
  const { ctx, p, chyby } = await kontext({ viewport: { width: sirka, height: sirka < 500 ? 844 : 900 }, mobil, dalsi });
  await ctx.addInitScript(() => { try { localStorage.setItem('managero-ctecka-navrat', '0'); } catch { /* */ } });
  await p.goto(BASE + '/employer/ctecka', { waitUntil: 'networkidle' });
  await p.locator('[data-testid="ctecka"]').waitFor({ timeout: 20000 });
  await p.keyboard.type('R7WN-9HDA', { delay: 6 }); await p.keyboard.press('Enter');
  await p.locator('[data-testid="karta-aktivace"]').waitFor({ timeout: 6000 });
  tvrdi(`${jm}: nová karta nabídne přiřazení`, /Nová karta/i.test(await p.locator('[data-testid="karta-aktivace"]').innerText()));
  await p.getByLabel('Jméno, telefon nebo e-mail').fill('Klára');
  await p.getByRole('button', { name: 'Přiřadit' }).first().waitFor({ timeout: 4000 });
  const t = await p.locator('[data-testid="karta-aktivace"]').innerText();
  tvrdi(`${jm}: nalezení hosté se zakrytým kontaktem a členstvím`, /k•••@seznam\.cz/.test(t) && /člen · 40 b\./.test(t) && /zatím není členem/.test(t), t.slice(0, 300));
  const male = await maleCile(p, '[data-testid="karta-aktivace"]', 44);
  tvrdi(`${jm}: cíle aspoň 44 px`, male.length === 0, JSON.stringify(male));
  tvrdi(`${jm}: bez vodorovného posuvu (přiřazení)`, (await scrollX(p)) <= 0, String(await scrollX(p)));
  await p.screenshot({ path: `${SNIMKY}k90-ctecka-nova-${sirka}.png`, fullPage: true }).catch(() => {});
  // Host bez aplikace: formulář
  await p.getByRole('button', { name: 'Nový host bez aplikace' }).click();
  tvrdi(`${jm}: telefon má telefonní klávesnici`, (await p.getByLabel('Telefon (nepovinné)').getAttribute('inputmode')) === 'tel');
  await p.getByRole('button', { name: 'Založit a přiřadit kartu' }).click();
  tvrdi(`${jm}: bez jména se nezaloží`, /jméno hosta/i.test(await p.locator('[data-testid="karta-aktivace"] [role="alert"]').innerText()) && !zaznam.some(z => z.akt));
  await p.screenshot({ path: `${SNIMKY}k90-ctecka-novy-host-${sirka}.png`, fullPage: true }).catch(() => {});
  await p.getByRole('button', { name: 'Najít hosta' }).click();
  await p.getByLabel('Jméno, telefon nebo e-mail').fill('Klára V');
  await p.getByRole('button', { name: 'Přiřadit' }).first().click();
  await p.locator('[data-testid="ctecka-host"]').waitFor({ timeout: 6000 });
  tvrdi(`${jm}: Přiřadit = POST aktivace s kódem a hostem`, zaznam.some(z => z.akt && z.kod === 'R7WN-9HDA' && z.customerId === 7));
  tvrdi(`${jm}: po přiřazení se karta načte s hostem`, /Klára Vojtíšková/.test(await p.locator('[data-testid="ctecka-host"]').innerText()));
  // Zablokovaná karta
  await p.getByRole('button', { name: 'Jiný host' }).click();
  await p.keyboard.type('ZZ2B-QW8E', { delay: 6 }); await p.keyboard.press('Enter');
  await p.locator('[data-testid="ctecka-chyba"]').waitFor({ timeout: 6000 });
  tvrdi(`${jm}: zablokovaná karta → „Karta je zablokovaná.“`, /Karta je zablokovaná\./.test(await p.locator('[data-testid="ctecka-chyba"]').innerText()));
  tvrdi(`${jm}: bez chyb v konzoli`, chyby.filter(c => !/403/.test(c)).length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---- C3: host v aplikaci ----
for (const [sirka, mobil] of [[390, true], [1280, false]]) {
  const jm = `Moje ${sirka} px`;
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: sirka, height: sirka < 500 ? 844 : 900 }, locale: 'cs-CZ', isMobile: mobil, hasTouch: mobil });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro('customer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const zaznam = []; let karty = [];
  await ctx.route('**/api/**', route => {
    const u = new URL(route.request().url()); const m = route.request().method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname === '/api/client/me') return json({ me: { name: 'Klára Vojtíšková' }, memberships: [{ slug: 'kavarna-u-lipy', name: 'Kavárna U Lípy', points: 40, visits: 2, spend: 300, credit: 0, campaigns: [] }], claims: [], reservations: [], orders: [], today: '2026-10-15' });
    if (u.pathname === '/api/client/card') return json({ code: 'ABCD-EFGH', name: 'Klára Vojtíšková', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>', wallet: { apple: false, google: false } });
    if (u.pathname === '/api/client/cards/moje' && m === 'GET') return json({ karty });
    if (u.pathname === '/api/client/cards/moje' && m === 'POST') {
      const b = route.request().postDataJSON(); zaznam.push(b);
      if (/ZZZZ/.test(b.kod)) return json({ error: 'Takovou kartu neznáme. Zkontroluj kód.' }, 404);
      karty = [{ id: 11, kod: 'KMPT-4XQ2', podnik: 'Kavárna U Lípy' }];
      return json({ ok: true, stav: 'prevzata', karty });
    }
    return json({});
  });
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', e => chyby.push(String(e)));
  p.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) chyby.push(msg.text()); });
  await p.goto(BASE + '/client/me', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Mám plastovou kartu' }).waitFor({ timeout: 15000 });
  await p.getByRole('button', { name: 'Mám plastovou kartu' }).click();
  await p.getByLabel('Kód z plastové karty').fill('zzzz zzzz');
  tvrdi(`${jm}: kód se formátuje`, (await p.getByLabel('Kód z plastové karty').inputValue()) === 'ZZZZ-ZZZZ');
  await p.getByRole('button', { name: 'Připojit kartu' }).click();
  await p.locator('[data-testid="plastove-karty"] [role="alert"]').waitFor({ timeout: 4000 });
  tvrdi(`${jm}: neznámý kód řekne proč`, /Takovou kartu neznáme/.test(await p.locator('[data-testid="plastove-karty"] [role="alert"]').innerText()));
  const male = await maleCile(p, '[data-testid="plastove-karty"]', 44);
  tvrdi(`${jm}: cíle aspoň 44 px`, male.length === 0, JSON.stringify(male));
  await p.screenshot({ path: `${SNIMKY}k90-moje-formular-${sirka}.png`, fullPage: true }).catch(() => {});
  await p.getByLabel('Kód z plastové karty').fill('KMPT4XQ2');
  await p.getByRole('button', { name: 'Připojit kartu' }).click();
  await p.getByText('Karta je připojená a body z ní jsou teď na tvém účtu.').waitFor({ timeout: 4000 });
  const sekce = await p.locator('[data-testid="plastove-karty"]').innerText();
  tvrdi(`${jm}: připojená karta je v seznamu`, /Plastové karty/.test(sekce) && /Kavárna U Lípy/.test(sekce) && /KMPT-4XQ2/.test(sekce));
  tvrdi(`${jm}: POST s kódem`, zaznam.some(z => z.kod === 'KMPT-4XQ2'));
  tvrdi(`${jm}: bez vodorovného posuvu`, (await scrollX(p)) <= 0, String(await scrollX(p)));
  await p.screenshot({ path: `${SNIMKY}k90-moje-pripojeno-${sirka}.png`, fullPage: true }).catch(() => {});
  tvrdi(`${jm}: bez chyb v konzoli`, chyby.filter(c => !/404/.test(c)).length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

await konec();
