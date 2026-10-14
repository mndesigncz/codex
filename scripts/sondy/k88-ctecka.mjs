// Spuštění (balík Q): čtečka u kasy s pokladnou Storyous — kartička se spáruje se zaplaceným účtem sama.
//
// Sonda tvrdí na 390 px (telefon, dotyk) i na 1280 px, světle i tmavě:
//  Q1 Sken v podniku s pokladnou: u hosta „Body se připíšou samy po zaplacení účtu", stoly jako velké
//     přepínače (48 px), výběr stolu = PATCH { action: 'stul' }; ruční výběr účtu zůstává („Nebo vyber účet hned").
//  Q2 „Čeká na zaplacení": host, čas skenu a stůl; „Vybrat účet" ukáže kandidáty, klepnutí = PATCH vybrat
//     a výsledek „Spárováno s účtem … · +41 b"; „Zrušit" = PATCH zrusit.
//  Q3 Nově spárované samo (po obnovení seznamu) se zapíše do historie čtečky.
//  Q4 Bez pokladny (pos: false, parovani: null) se nic z párování nekreslí — čtečka jako dřív.
//  Q5 Příjem v Managero client (StaffInbox + CardScan): „Čeká na zaplacení" je vidět i se sbalenou kartičkou,
//     po načtení kartičky u hosta stejná věta; cíle aspoň 44 px.
//  Vše bez vodorovného posuvu, cíle akcí aspoň 44 px, bez chyb v konzoli.
//   SONDY_ZAKLAD=http://localhost:3446 node scripts/sondy/k88-ctecka.mjs
import { kontext, tvrdi, konec, BASE, OUT } from './k68-spolecne.mjs';

const SNIMKY = process.env.SONDY_SNIMKY ? process.env.SONDY_SNIMKY.replace(/\/?$/, '/') : OUT;
const ted = Date.now();
const dbCas = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19); // čas z databáze bez zóny (UTC)

const HOST = {
  customer: { id: 7, name: 'Klára Vojtíšková' },
  member: true, points: 240, credit: 0, stamps: 3, visits: 14, spend: 5400, campaigns: [], posledniAkce: null, polozky: [],
  tierBy: 'visits', levelLabel: 'Stříbrný', tier: 'silver', discount: 10, discountSource: 'uroven', discountName: null, tierDiscount: 10,
  nextTierAt: 20, nextTierLabel: 'Zlatý', nextTierUnit: 'visits', stampedToday: false, birthdayToday: false,
  lastVisit: new Date(ted - 3 * 86400000).toISOString(), openCoupons: [], affordable: [],
  bills: [{ bill_id: 'B1', final_price: 412, paid_at: new Date(ted - 600000).toISOString() }, { bill_id: 'B2', final_price: 99, paid_at: new Date(ted - 300000).toISOString() }],
  rules: { pointsPer100: 10, stampTarget: 8, stampReward: 'Káva zdarma', cashbackPct: 0 },
  parovani: { id: 31, deskId: null, stoly: [{ deskId: '5', name: 'U okna' }, { deskId: '6', name: 'Velký stůl' }, { deskId: '7', name: 'Zahrádka 1' }, { deskId: '8', name: 'Bar' }] },
};

function api(zaznam, stav, { pos = true } = {}) {
  return (req, json) => {
    const u = new URL(req.url()); const m = req.method();
    if (u.pathname === '/api/client/staff/scan' && m === 'GET') {
      zaznam.push({ m, path: u.pathname, code: u.searchParams.get('code') });
      return json(pos ? HOST : { ...HOST, parovani: null });
    }
    if (u.pathname === '/api/client/staff/scan' && m === 'POST') {
      const b = JSON.parse(req.postData() || '{}'); zaznam.push({ m, path: u.pathname, ...b });
      return json({ ok: true, message: `${HOST.customer.name}: razítko 4/8.`, ...HOST, stampedToday: true });
    }
    if (u.pathname === '/api/client/staff/claims' && m === 'GET') {
      zaznam.push({ m, path: u.pathname });
      if (!pos) return json({ pos: false, ceka: [], hotovo: [], stoly: [] });
      return json({ pos: true, ceka: stav.ceka, hotovo: stav.hotovo, stoly: HOST.parovani.stoly });
    }
    if (u.pathname === '/api/client/staff/claims' && m === 'PATCH') {
      const b = JSON.parse(req.postData() || '{}'); zaznam.push({ m, path: u.pathname, ...b });
      if (b.action === 'zrusit') { stav.ceka = stav.ceka.filter(c => c.id !== b.id); return json({ ok: true, message: 'Petr Dlouhý: čekání na účet zrušeno.' }); }
      if (b.action === 'stul') { stav.ceka = stav.ceka.map(c => c.id === b.id ? { ...c, deskId: b.deskId, stul: b.deskId ? 'Velký stůl' : null } : c); return json({ ok: true }); }
      if (b.action === 'vybrat') {
        const c = stav.ceka.find(x => x.id === b.id);
        stav.ceka = stav.ceka.filter(x => x.id !== b.id);
        stav.hotovo = [{ id: b.id, customer_name: c?.customerName ?? 'Host', total: 412, points: 41, credit: 0, matched_by: 'vyber', matched_at: dbCas(Date.now()) }, ...stav.hotovo];
        return json({ ok: true, message: `${c?.customerName}: Spárováno s účtem 412 Kč · +41 b.` });
      }
    }
    return undefined;
  };
}

const novyStav = () => ({
  ceka: [
    { id: 31, customerId: 7, customerName: 'Klára Vojtíšková', staffName: 'Eva Nováková', deskId: null, stul: null, scannedAt: dbCas(ted - 120000), kandidati: [] },
    { id: 32, customerId: 8, customerName: 'Petr Dlouhý se strašně dlouhým příjmením Novák-Svoboda', staffName: 'Eva Nováková', deskId: '6', stul: 'Velký stůl', scannedAt: dbCas(ted - 1500000),
      kandidati: [{ billId: 'B7', finalPrice: 412, paidAt: new Date(ted - 60000).toISOString() }, { billId: 'B8', finalPrice: 268, paidAt: new Date(ted - 30000).toISOString() }] },
  ],
  hotovo: [{ id: 29, customer_name: 'Jana Malá', total: 186, points: 18, credit: 0, matched_by: 'auto', matched_at: dbCas(ted - 900000) }],
});

async function sken(p, text) { await p.keyboard.type(text, { delay: 6 }); await p.keyboard.press('Enter'); }
const scrollX = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const maleCile = (p, sel, min) => p.$$eval(`${sel} button`, (bs, min) => bs.filter(b => b.offsetParent && b.textContent.trim())
  .map(b => ({ t: b.textContent.trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height) })).filter(b => b.h < min), min);

async function otevri(opt) {
  const zaznam = []; const stav = novyStav();
  const k = await kontext({ ...opt, dalsi: api(zaznam, stav, opt.api ?? {}) });
  await k.ctx.addInitScript(() => { try { localStorage.setItem('managero-ctecka-navrat', '0'); } catch { /* */ } });
  await k.p.goto(BASE + '/employer/ctecka', { waitUntil: 'networkidle' });
  await k.p.locator('[data-testid="ctecka"]').waitFor({ timeout: 20000 });
  return { ...k, zaznam, stav };
}

for (const [sirka, mobil, tmavy] of [[390, true, false], [1280, false, false], [390, true, true], [1280, false, true]]) {
  const jm = `${sirka} px${tmavy ? ' tmavě' : ''}`;
  const sfx = `${sirka}${tmavy ? '-tmavy' : ''}`;
  const { ctx, p, zaznam, stav, chyby } = await otevri({ viewport: { width: sirka, height: sirka < 500 ? 844 : 900 }, mobil, tmavy });

  // Q2 (seznam je vidět už na čekání)
  await p.locator('[data-testid="ceka-na-zaplaceni"]').waitFor({ timeout: 8000 });
  const seznam = await p.locator('[data-testid="ceka-na-zaplaceni"]').innerText();
  tvrdi(`${jm}: „Čeká na zaplacení" s oběma hosty`, /Čeká na zaplacení/i.test(seznam) && /Klára Vojtíšková/.test(seznam) && /Petr Dlouhý/.test(seznam), seznam.slice(0, 160));
  tvrdi(`${jm}: u čekání čas skenu a stůl`, /sken v \d{1,2}:\d{2}/.test(seznam) && /stůl Velký stůl/.test(seznam));
  tvrdi(`${jm}: „Spárováno" s výsledkem`, /Spárováno s účtem 186\sKč · \+18 b/.test(seznam), seznam);
  tvrdi(`${jm}: bez vodorovného posuvu (čekání)`, (await scrollX(p)) <= 0, String(await scrollX(p)));
  await p.screenshot({ path: `${SNIMKY}k88-ctecka-ceka-${sfx}.png`, fullPage: true }).catch(() => {});

  // Q1
  await sken(p, 'ABCD-EFGH');
  await p.locator('[data-testid="ctecka-host"]').waitFor({ timeout: 6000 });
  const host = p.locator('[data-testid="parovani-hosta"]');
  tvrdi(`${jm}: u hosta „Body se připíšou samy po zaplacení účtu"`, await host.isVisible() && /Body se připíšou samy po zaplacení účtu/.test(await host.innerText()));
  tvrdi(`${jm}: ruční výběr účtu zůstává`, /Nebo vyber účet hned/i.test(await p.locator('[data-testid="ctecka-host"]').innerText()) && await p.getByRole('button', { name: /Připsat z účtenky 412/ }).isVisible());
  const male = await maleCile(p, '[data-testid="ctecka-host"]', 48);
  tvrdi(`${jm}: velké cíle u hosta (48 px), i stoly`, male.filter(b => !/Jiný host/.test(b.t)).length === 0, JSON.stringify(male));
  tvrdi(`${jm}: bez vodorovného posuvu (host)`, (await scrollX(p)) <= 0, String(await scrollX(p)));
  await p.screenshot({ path: `${SNIMKY}k88-ctecka-host-${sfx}.png`, fullPage: true }).catch(() => {});
  await host.getByRole('button', { name: 'Velký stůl' }).click();
  await p.waitForTimeout(300);
  tvrdi(`${jm}: výběr stolu = PATCH stul`, zaznam.some(z => z.m === 'PATCH' && z.action === 'stul' && z.id === 31 && z.deskId === '6'));
  tvrdi(`${jm}: vybraný stůl je stisknutý`, (await host.getByRole('button', { name: 'Velký stůl' }).getAttribute('aria-pressed')) === 'true');

  // Q2: vybrat účet u Petra, pak zrušit Kláru
  const petr = p.locator('[data-testid="ceka-radek"]', { hasText: 'Petr Dlouhý' });
  await petr.getByRole('button', { name: 'Vybrat účet' }).click();
  tvrdi(`${jm}: kandidáti se ukážou`, /Víc účtů sedí/.test(await petr.innerText()));
  const maleSeznam = await maleCile(p, '[data-testid="ceka-na-zaplaceni"]', 44);
  tvrdi(`${jm}: cíle v seznamu aspoň 44 px`, maleSeznam.length === 0, JSON.stringify(maleSeznam));
  tvrdi(`${jm}: bez vodorovného posuvu (kandidáti)`, (await scrollX(p)) <= 0, String(await scrollX(p)));
  await p.screenshot({ path: `${SNIMKY}k88-ctecka-vyber-${sfx}.png`, fullPage: true }).catch(() => {});
  await petr.getByRole('button', { name: /412/ }).click();
  await p.waitForTimeout(500);
  tvrdi(`${jm}: výběr účtu = PATCH vybrat`, zaznam.some(z => z.m === 'PATCH' && z.action === 'vybrat' && z.id === 32 && z.billId === 'B7'));
  const po = await p.locator('[data-testid="ceka-na-zaplaceni"]').innerText();
  tvrdi(`${jm}: po výběru je Petr ve Spárováno s +41 b`, /Spárováno s účtem 412\sKč · \+41 b/.test(po) && !(await p.locator('[data-testid="ceka-radek"]', { hasText: 'Petr Dlouhý' }).count()));
  await p.locator('[data-testid="ceka-radek"]', { hasText: 'Klára Vojtíšková' }).getByRole('button', { name: 'Zrušit' }).click();
  await p.waitForTimeout(400);
  tvrdi(`${jm}: Zrušit = PATCH zrusit`, zaznam.some(z => z.m === 'PATCH' && z.action === 'zrusit' && z.id === 31));
  tvrdi(`${jm}: po zrušení nikdo nečeká`, (await p.locator('[data-testid="ceka-radek"]').count()) === 0);

  // Q3: samo spárované od minula → záznam v historii čtečky
  stav.ceka = [{ id: 40, customerId: 9, customerName: 'Ota Rychlý', staffName: null, deskId: null, stul: null, scannedAt: dbCas(ted - 60000), kandidati: [] }];
  await sken(p, 'WXYZ-1234');
  await p.waitForTimeout(800);
  stav.ceka = []; stav.hotovo = [{ id: 41, customer_name: 'Ota Rychlý', total: 300, points: 30, credit: 0, matched_by: 'auto', matched_at: dbCas(Date.now()) }, ...stav.hotovo];
  await p.getByRole('button', { name: 'Jiný host' }).click();
  await sken(p, 'ABCD-EFGH');
  await p.waitForTimeout(900);
  tvrdi(`${jm}: samo spárované se zapíše do historie čtečky`, /Ota Rychlý: Spárováno s účtem 300\sKč · \+30 b/.test(await p.locator('[data-testid="ctecka-historie"]').innerText()));
  // Tmavý motiv zapisuje data-theme na <html> skriptem před hydratací (dev hlásí nesoulad atributu); to není chyba čtečky.
  const vlastni = chyby.filter(c => !(tmavy && /hydrated but some attributes/.test(c) && /data-theme/.test(c)));
  tvrdi(`${jm}: bez chyb v konzoli`, vlastni.length === 0, vlastni.slice(0, 2).join(' | '));
  await ctx.close();
}

// Q4: bez pokladny
{
  const { ctx, p, zaznam } = await otevri({ viewport: { width: 390, height: 844 }, mobil: true, api: { pos: false } });
  await p.waitForTimeout(600);
  tvrdi('bez pokladny: žádný seznam čekajících', (await p.locator('[data-testid="ceka-na-zaplaceni"]').count()) === 0);
  await sken(p, 'ABCD-EFGH');
  await p.locator('[data-testid="ctecka-host"]').waitFor({ timeout: 6000 });
  tvrdi('bez pokladny: u hosta žádné párování', (await p.locator('[data-testid="parovani-hosta"]').count()) === 0);
  tvrdi('bez pokladny: účty z pokladny bez „Nebo vyber“', !/Nebo vyber účet hned/i.test(await p.locator('[data-testid="ctecka-host"]').innerText()));
  tvrdi('bez pokladny: žádný PATCH párování', !zaznam.some(z => z.m === 'PATCH'));
  await ctx.close();
}

// Q5: Příjem (StaffInbox) s Kartičkou hosta
for (const [sirka, mobil] of [[390, true], [1280, false]]) {
  const zaznam = []; const stav = novyStav();
  const inbox = (req, json) => new URL(req.url()).pathname === '/api/client/staff/inbox'
    ? json({ orders: [], reservations: [], newCount: 0, stuck: 0, today: '2026-10-14', pos: { connected: true, autoPos: true, tables: 4, tablesPaired: 4, items: 10, itemsLinked: 10 } })
    : api(zaznam, stav)(req, json);
  const { ctx, p, chyby } = await kontext({ viewport: { width: sirka, height: sirka < 500 ? 844 : 900 }, mobil, dalsi: inbox });
  await p.goto(BASE + '/employer/overview?mode=client&tab=orders', { waitUntil: 'networkidle' });
  await p.locator('[data-testid="ceka-na-zaplaceni"]').waitFor({ timeout: 15000 });
  tvrdi(`Příjem ${sirka} px: čekající vidět i se sbalenou kartičkou`, /Klára Vojtíšková/.test(await p.locator('[data-testid="ceka-na-zaplaceni"]').innerText()));
  const male = await maleCile(p, '[data-testid="ceka-na-zaplaceni"]', 44);
  tvrdi(`Příjem ${sirka} px: cíle v seznamu aspoň 44 px`, male.length === 0, JSON.stringify(male));
  await p.locator('summary', { hasText: 'Kartička hosta u kasy' }).first().click();
  await p.getByLabel('Kód kartičky nebo kuponu').fill('ABCDEFGH');
  await p.getByRole('button', { name: 'Najít' }).click();
  await p.locator('[data-testid="parovani-hosta"]').waitFor({ timeout: 6000 });
  tvrdi(`Příjem ${sirka} px: u hosta „Body se připíšou samy"`, /Body se připíšou samy po zaplacení účtu/.test(await p.locator('[data-testid="parovani-hosta"]').innerText()));
  const maleStoly = await maleCile(p, '[data-testid="parovani-hosta"]', 44);
  tvrdi(`Příjem ${sirka} px: stoly aspoň 44 px`, maleStoly.length === 0, JSON.stringify(maleStoly));
  tvrdi(`Příjem ${sirka} px: seznam čekajících jen jednou (ne i v kartičce)`, (await p.locator('[data-testid="ceka-na-zaplaceni"]').count()) === 1);
  tvrdi(`Příjem ${sirka} px: bez vodorovného posuvu`, (await scrollX(p)) <= 0, String(await scrollX(p)));
  await p.screenshot({ path: `${SNIMKY}k88-prijem-host-${sirka}.png`, fullPage: true }).catch(() => {});
  tvrdi(`Příjem ${sirka} px: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

await konec();
