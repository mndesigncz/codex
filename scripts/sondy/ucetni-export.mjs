// Pro účetní (2026-11): podklady pro účetní na jedno klepnutí.
//  A) Pohled „Pro účetní" (monitor 1280): položka v navigaci, výchozí období = minulý měsíc
//     (náhled se ptá od 1. do posledního dne), počty a varování z náhledu, Stáhnout ZIP jde na
//     /api/ucetni/export se stejným obdobím, Zkopírovat odkaz pošle POST a ukáže odkaz v poli,
//     Poslat účetní pošle POST a ohlásí e-mail, vlastní období přepne dotaz náhledu.
//  B) Nastavení účetní: e-mail z nastavení, „Posílat automaticky" pošle PATCH, „Zneplatnit všechny
//     odkazy" se zeptá a pošle PATCH { zneplatnit: true }.
//  C) Telefon 390 a 320: bez vodorovného přetečení, tři akce pod sebou s dotykovou plochou ≥ 44 px.
//  D) Role bez finance.exportovat: položka v navigaci není a pohled ukáže „bez oprávnění".
//  E) Příjem objednávky: pole „Číslo dodacího listu / faktury" a fotka dokladu jdou do PATCH /api/orders.
// Snímky do scripts/sondy/shots/ucetni-*.png (necommitují se).
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, jdi, dokud, mine, ROLE, DIR, OUT, BASE } from './k68-spolecne.mjs';

const dnes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
const minuly = (() => { const [y, m] = dnes.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
const posledni = (() => { const [y, m] = minuly.split('-').map(Number); return `${minuly}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; })();
const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));

const souhrn = {
  uctenky: { pocet: 3, soucet: 4200, bezFotky: 1, bezCastky: 0 },
  prijemky: { pocet: 2, soucet: 7300, bezCeny: 0, bezDokladu: 1 },
  uzaverky: { pocet: 20, neschvalene: 2, hotove: 81000, kartou: 120000, celkem: 201000, spropitneHotove: 3000, spropitneKartou: 1500, vydaje: 2400, odvody: 60000, vyplatyZKasy: 9000, vklady: 0, rozdily: -40 },
  pokladna: { dni: 20, uctenek: 1800, celkem: 199500, hotove: 80000, kartou: 119500, jinak: 0, spropitne: 0, bezDph: 170000, dph: [{ sazba: 21, zaklad: 100000, dph: 21000 }, { sazba: 12, zaklad: 75000, dph: 9000 }] },
  vyplaty: null,
  fotky: { celkem: 31, chybi: 0 },
  varovani: [{ kod: 'uctenky_bez_fotky', pocet: 1 }, { kod: 'prijemky_bez_dokladu', pocet: 1 }, { kod: 'uzaverky_neschvalene', pocet: 2 }],
};
const prehled = (od, doD) => ({
  od, do: doD, mena: 'CZK', smiMzdy: true, sMzdami: false, nazevSouboru: `ucetni-podklady_Kavarna_${od.slice(0, 7)}.zip`,
  podnik: { nazev: 'Kavárna', ico: '12345678', dic: 'CZ12345678' },
  pocty: { uctenky: 3, prijemky: 2, uzaverky: 20, dnyPokladny: 20, vyplaty: null }, souhrn,
});

function podvrh(stav0) {
  const s = stav0;
  return (req, json) => {
    const u = new URL(req.url()); const path = u.pathname; const m = req.method();
    if (path === '/api/ucetni/prehled') { s.prehledy.push(u.search); return json(prehled(u.searchParams.get('od'), u.searchParams.get('do'))); }
    if (path === '/api/ucetni/nastaveni') {
      if (m === 'PATCH') {
        const b = JSON.parse(req.postData() || '{}'); s.patche.push(b);
        if (b.email !== undefined) s.nastaveni.email = b.email;
        if (b.auto !== undefined) s.nastaveni.auto = b.auto;
        if (b.mzdy !== undefined) s.nastaveni.mzdy = b.mzdy;
      }
      return json(s.nastaveni);
    }
    if (path === '/api/ucetni/odkaz' && m === 'POST') { s.odkazy.push(JSON.parse(req.postData() || '{}')); return json({ ok: true, url: `${BASE}/api/ucetni/odkaz?t=1.20261001.20261031.0.1.9999999999.podpisPodpisPodpisPodpis`, vyprsi: '2026-12-07T06:00:00.000Z', sMzdami: false }); }
    if (path === '/api/ucetni/poslat' && m === 'POST') { s.poslano.push(JSON.parse(req.postData() || '{}')); return json({ ok: true, komu: s.nastaveni.email, sMzdami: false }); }
    return undefined;
  };
}
const novyStav = () => ({ prehledy: [], patche: [], odkazy: [], poslano: [], exporty: [],
  nastaveni: { email: 'ucetni@firma.cz', auto: true, mzdy: false, posledni: minuly, denAutomatu: 3, smiMzdy: true, ico: '12345678', dic: 'CZ12345678' } });

/** Kontext, kde /api/ucetni/export odpoví malým ZIPem jako příloha (stažení), ne přes obecný podvrh. */
async function kontextUcetni(volby, s) {
  const k = await kontext({ ...volby, dalsi: podvrh(s) });
  // Stažení přes <a download> Chromium posílá mimo podvrh rout i mimo události požadavků — zachytí se událost stažení.
  k.p.on('download', d => s.exporty.push(new URL(d.url()).search));
  await k.ctx.route('**/api/ucetni/export**', route => {
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="podklady.zip"' }, body: Buffer.from('PK\u0005\u0006' + '\0'.repeat(18), 'binary') });
  });
  return k;
}

const pretok = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);

// ===========================================================================
// A + B) Monitor
// ===========================================================================
{
  const s = novyStav();
  const { ctx, p, chyby } = await kontextUcetni({ viewport: { width: 1280, height: 950 } }, s);
  await jdi(p, BASE + '/employer/overview?view=ucetni');
  const koren = p.locator('[data-ucetni]');
  await koren.waitFor({ timeout: 15000 });
  tvrdi('A1: nadpis „Pro účetní"', await p.getByRole('heading', { name: 'Pro účetní', level: 1 }).isVisible());
  tvrdi('A1: položka „Pro účetní" v navigaci', (await p.getByRole('navigation').getByRole('button', { name: /Pro účetní/ }).count()) + (await p.getByRole('navigation').getByRole('link', { name: /Pro účetní/ }).count()) >= 1);
  await dokud(async () => s.prehledy.length > 0 && (await koren.getByText('Co účetní dostane').isVisible()), 8000);
  tvrdi('A2: výchozí období je minulý měsíc (celý)', s.prehledy.some(q => q.includes(`od=${minuly}-01`) && q.includes(`do=${posledni}`)), s.prehledy.join(' '));
  await dokud(async () => (await koren.locator('[data-varovani]').count()) === 1, 5000);
  const varovani = (await koren.locator('[data-varovani]').innerText()).replace(/\s+/g, ' ');
  tvrdi('A3: varování z náhledu (účtenka bez fotky, příjemka bez dokladu, neschválené uzávěrky)',
    /1 účtenka nemá fotku/.test(varovani) && /1 příjemka nemá číslo dokladu ani fotku/.test(varovani) && /2 uzávěrky čekají na schválení/.test(varovani), varovani);
  const nahled = (await koren.innerText()).replace(/\s+/g, ' ');
  tvrdi('A3: počty a DPH z pokladny', /Účtenky/.test(nahled) && /Příjemky/.test(nahled) && /Fotky dokladů/.test(nahled) && /DPH 21 %/.test(nahled) && /DPH 12 %/.test(nahled), nahled.slice(0, 300));

  // Stáhnout ZIP
  const stahnout = koren.getByRole('button', { name: 'Stáhnout ZIP pro účetní' });
  tvrdi('A4: tlačítko Stáhnout ZIP je aktivní', await stahnout.isEnabled());
  const stazeni = p.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await stahnout.click();
  const d = await stazeni;
  await dokud(async () => s.exporty.length > 0, 5000);
  tvrdi('A4: stažení jde na /api/ucetni/export se stejným obdobím', s.exporty.some(q => q.includes(`od=${minuly}-01`) && q.includes(`do=${posledni}`)) && d !== undefined, s.exporty.join(' '));

  // Zkopírovat odkaz
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await koren.getByRole('button', { name: 'Zkopírovat odkaz (14 dní)' }).click();
  await dokud(async () => (await koren.locator('#ucetni-odkaz').count()) === 1, 5000);
  tvrdi('A5: odkaz se vytvoří pro vybrané období (POST)', s.odkazy.length === 1 && s.odkazy[0].od === `${minuly}-01` && s.odkazy[0].do === posledni, JSON.stringify(s.odkazy));
  tvrdi('A5: odkaz je vidět v poli jen ke čtení', /\/api\/ucetni\/odkaz\?t=/.test(await koren.locator('#ucetni-odkaz').inputValue()) && await koren.locator('#ucetni-odkaz').evaluate(i => i.readOnly));

  // Poslat účetní
  await koren.getByRole('button', { name: 'Poslat účetní' }).click();
  await dokud(async () => s.poslano.length === 1, 5000);
  await dokud(async () => (await p.getByText('Odesláno účetní na ucetni@firma.cz.').count()) > 0, 4000);
  tvrdi('A6: Poslat účetní pošle POST a ohlásí adresu', s.poslano.length === 1 && (await p.getByText('Odesláno účetní na ucetni@firma.cz.').count()) > 0, JSON.stringify(s.poslano));

  // Vlastní období
  await koren.getByRole('tab', { name: 'Vlastní období' }).click();
  await koren.locator('#ucetni-od').fill(`${minuly}-05`);
  await koren.locator('#ucetni-do').fill(`${minuly}-12`);
  await dokud(async () => s.prehledy.some(q => q.includes(`od=${minuly}-05`) && q.includes(`do=${minuly}-12`)), 5000);
  tvrdi('A7: vlastní období přepne dotaz náhledu', s.prehledy.some(q => q.includes(`od=${minuly}-05`) && q.includes(`do=${minuly}-12`)), s.prehledy.slice(-2).join(' '));
  await koren.locator('#ucetni-do').fill(`${minuly}-01`);
  await koren.locator('#ucetni-od').fill(`${minuly}-20`);
  await dokud(async () => (await koren.getByText('Konec období je před jeho začátkem.').count()) > 0, 3000);
  tvrdi('A7: obrácené období = chyba u pole a zamčené akce', (await koren.getByText('Konec období je před jeho začátkem.').count()) > 0 && !(await stahnout.isEnabled()));

  // B) Nastavení účetní
  tvrdi('B1: e-mail účetní z nastavení', (await koren.locator('#ucetni-email').inputValue()) === 'ucetni@firma.cz');
  const auto = koren.getByRole('switch', { name: /Posílat automaticky každý měsíc/ });
  tvrdi('B2: automat je zapnutý podle nastavení', (await auto.getAttribute('aria-checked')) === 'true');
  await auto.click();
  await dokud(async () => s.patche.some(b => b.auto === false), 4000);
  tvrdi('B2: vypnutí automatu pošle PATCH { auto: false }', s.patche.some(b => b.auto === false), JSON.stringify(s.patche));
  await koren.getByRole('button', { name: 'Zneplatnit všechny odkazy' }).click();
  const okno = p.getByRole('dialog', { name: 'Zneplatnit všechny odkazy?' });
  await dokud(() => okno.isVisible(), 3000);
  tvrdi('B3: zneplatnění se nejdřív zeptá', await okno.isVisible());
  await okno.getByRole('button', { name: 'Zneplatnit', exact: true }).click();
  await dokud(async () => s.patche.some(b => b.zneplatnit === true), 4000);
  tvrdi('B3: potvrzení pošle PATCH { zneplatnit: true }', s.patche.some(b => b.zneplatnit === true), JSON.stringify(s.patche));
  tvrdi('A/B: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  tvrdi('A/B 1280: bez vodorovného přetečení', (await pretok(p)) <= 0);
  await p.screenshot({ path: OUT + 'ucetni-1280.png', fullPage: true });
  await ctx.close();
}

// ===========================================================================
// C) Telefon
// ===========================================================================
for (const w of [390, 320]) {
  const s = novyStav();
  const { ctx, p } = await kontextUcetni({ viewport: { width: w, height: 844 }, mobil: true }, s);
  await jdi(p, BASE + '/employer/overview?view=ucetni');
  const koren = p.locator('[data-ucetni]');
  await koren.waitFor({ timeout: 15000 });
  await dokud(async () => (await koren.locator('[data-varovani]').count()) === 1, 8000);
  tvrdi(`C ${w}: bez vodorovného přetečení`, (await pretok(p)) <= 0, String(await pretok(p)));
  const akce = koren.locator('[data-akce]');
  const boxy = await akce.evaluateAll(xs => xs.map(x => { const r = x.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), h: Math.round(r.height), r: Math.round(r.right) }; }));
  tvrdi(`C ${w}: tři akce pod sebou, každá ≥ 44 px vysoká a uvnitř obrazovky`, boxy.length === 3 && boxy.every(b => b.h >= 44 && b.r <= w) && boxy[1].t > boxy[0].t && boxy[2].t > boxy[1].t, JSON.stringify(boxy));
  await p.screenshot({ path: OUT + `ucetni-${w}.png`, fullPage: true });
  await ctx.close();
}

// ===========================================================================
// D) Role bez finance.exportovat
// ===========================================================================
{
  const s = novyStav();
  const bez = mine(ROLE.ja.opravneni.filter(k => k !== 'finance.exportovat'), { klic: 'vedeni', roleId: null, nazev: 'Provozní', typ: 'vedeni', jeVlastnik: false });
  const { ctx, p } = await kontextUcetni({ viewport: { width: 1280, height: 950 }, mineData: bez }, s);
  await jdi(p, BASE + '/employer/overview?view=ucetni');
  await p.waitForTimeout(1500);
  tvrdi('D: bez finance.exportovat se pohled neotevře', (await p.locator('[data-ucetni]').count()) === 0);
  tvrdi('D: a v navigaci položka není', (await p.getByRole('navigation').getByText('Pro účetní', { exact: true }).count()) === 0);
  tvrdi('D: náhled se vůbec nevolá', s.prehledy.length === 0);
  await ctx.close();
}

// ===========================================================================
// E) Příjem objednávky s dokladem
// ===========================================================================
{
  const patche = [];
  const nahrano = [];
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  const dalsi = (req, json) => {
    const u = new URL(req.url()); const path = u.pathname; const m = req.method();
    if (m === 'PATCH' && path === '/api/orders') { patche.push(JSON.parse(req.postData() || '{}')); return json({ ok: true, restocked: 2 }); }
    if (m === 'POST' && path === '/api/upload') { nahrano.push(1); return json({ url: '/api/upload/77' }); }
    if (m !== 'GET') return undefined;
    const mapa = { '/api/inventory/categories': 'k69-b3-categories', '/api/orders': 'k69-b3-orders', '/api/inventory': 'k69-b3-inventory', '/api/suppliers': 'suppliers', '/api/inventory/reports': 'k69-b3-reports', '/api/production': 'k69-b3-production' };
    if (path === '/api/inventory/log') return json([]);
    if (mapa[path]) return json(nacti(mapa[path]));
    return undefined;
  };
  const { ctx, p } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, fix: nacti('k69-b3-rozlozeni-sklad'), dalsi });
  await ctx.route('**/api/upload/77', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await otevri(p, '/employer/inventory', 'vedeni.sklad');
  const obj = p.locator('[data-plocha] li[data-widget="sklad.objednavky"]');
  await dokud(() => obj.getByRole('button', { name: 'Přijmout', exact: true }).first().isVisible(), 6000);
  await obj.getByRole('button', { name: 'Přijmout', exact: true }).first().click();
  const okno = p.getByRole('dialog', { name: /Přišlo od Makro\?/ });
  await dokud(() => okno.isVisible(), 3000);
  const cislo = okno.getByLabel('Číslo dodacího listu / faktury');
  tvrdi('E1: okno příjmu má pole čísla dokladu', await cislo.isVisible());
  await cislo.fill('FA 2026/15');
  const [vyber] = await Promise.all([p.waitForEvent('filechooser'), okno.getByRole('button', { name: 'Vyfotit dodací list / fakturu' }).click()]);
  await vyber.setFiles({ name: 'doklad.png', mimeType: 'image/png', buffer: PNG });
  await dokud(async () => (await okno.locator('[data-fotky-prijemky] img').count()) === 1, 6000);
  tvrdi('E2: fotka dokladu se nahraje a ukáže náhled', nahrano.length === 1 && (await okno.locator('[data-fotky-prijemky] img').count()) === 1);
  const m = await okno.evaluate(el => el.scrollWidth - el.clientWidth);
  tvrdi('E3: okno s dokladem nepřetéká (390)', m <= 0 && (await pretok(p)) <= 0, String(m));
  await okno.getByRole('button', { name: 'Přijmout a naskladnit' }).click();
  await dokud(async () => patche.length === 1, 5000);
  tvrdi('E4: PATCH /api/orders nese číslo dokladu a fotku', patche[0]?.action === 'received' && patche[0]?.docNumber === 'FA 2026/15' && JSON.stringify(patche[0]?.docPhotos) === '["/api/upload/77"]', JSON.stringify(patche));
  await ctx.close();
}

await konec();
