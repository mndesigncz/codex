// Kolo 69, balík B3 — Sklad (vedení) a Sklad (zaměstnanec) jako plocha s widgety (spec §7.4).
//
// Pro obě stránky: jeden h1 jako první, nástroj v klidu vidět, v úpravách
// sbalený bez „−" a přesunutelný nad widget i pod něj (PUT), galerie nabízí
// widgety skladu v „Doporučené", role bez klíče widget nevidí a jeho endpoint
// se nevolá, 500 na jednom endpointu shodí jen jeden widget, telefon 390 bez
// přetečení s použitelnou hlavní akcí a rozepsané v nástroji přežije úpravy.
// Navíc to, co balík opravoval: Suroviny bez ceny jen se sklad.ceny (N4),
// docházející bez archivovaných a návrhů (N7), schválení návrhu v řádku
// primary a widgety mluví s nástrojem (Objednat → nákupní seznam, řádek
// suroviny bez ceny → úprava položky).
//
// Fixtury: scripts/sondy/fixtury/k69-b3-*.json.
import { readFileSync } from 'node:fs';
import {
  kontext, konec, tvrdi, otevri, lista, upravit, hotovo, vUpravach, dokud, poradi, poradiPutu, dotazyNa, roleMine, DIR, OUT, BASE,
} from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const FIX_VEDENI = nacti('k69-b3-rozlozeni-sklad');
const FIX_ZAM = nacti('k69-b3-rozlozeni-sklad-zam');

/** Podvrh API skladu; `stav.chyby[cesta]` = kód chyby (vyřizuje k68-spolecne). */
const podvrh = () => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  if (stav.chyby[path]) return json({ error: 'Server spadl' }, stav.chyby[path]);
  // Příjem objednávky: tělo si schováme, ať sonda ověří, že cena odešla (review B3).
  if (req.method() === 'PATCH' && path === '/api/orders') { stav.prijem = req.postDataJSON(); return json({ ok: true, restocked: 2 }); }
  if (req.method() !== 'GET') return undefined;
  const mapa = {
    '/api/inventory': 'k69-b3-inventory',
    '/api/inventory/categories': 'k69-b3-categories',
    '/api/pos/usage': 'k69-b3-pos-usage',
    '/api/inventory/reports': 'k69-b3-reports',
    '/api/orders': 'k69-b3-orders',
    '/api/stocktake': 'k69-b3-stocktake',
    '/api/inventory/log': 'k69-b3-log',
    '/api/production': 'k69-b3-production',
  };
  if (path === '/api/inventory/log' && url.searchParams.get('itemId')) return json([]);
  if (mapa[path]) return json(nacti(mapa[path]));
  if (path === '/api/suppliers') return json({ suppliers: [{ id: 1, name: 'Makro', email: 'objednavky@makro.cz' }] });
  return undefined;
};

const VEDENI = '/employer/inventory';
const ZAMESTNANEC = '/employee/shifts?view=inventory';
const naPlose = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`).count();
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const limetek = (p) => p.locator('[data-plocha] button.on-accent:visible').count();
const h1 = (p) => p.evaluate(() => {
  const vid = [...document.querySelectorAll('h1')].filter(h => h.offsetParent !== null);
  const prvni = document.querySelector('[data-plocha]')?.querySelector('h1, h2, h3');
  return { pocet: vid.length, prvniJeH1: prvni?.tagName === 'H1', text: vid[0]?.textContent?.trim() };
});
const doporucene = (galerie) => galerie.evaluate(el => {
  const h = [...el.querySelectorAll('h4')].find(x => x.textContent?.includes('Doporučené'));
  return h?.parentElement?.innerText ?? '';
});

// ---------------------------------------------------------------------------
// Vedení: Sklad
// ---------------------------------------------------------------------------

// 1–3, 7) Hlavička, nástroj, widgety, úpravy (zástupce bez „−", přesun → PUT), galerie, rozepsané hledání.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_VEDENI, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.sklad');
  const h = await h1(p);
  tvrdi('V1: právě jeden viditelný h1 a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1, JSON.stringify(h));
  tvrdi('V1: h1 = „Sklad"', h.text === 'Sklad', h.text);
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('V1: plocha má nástroj a v klidu je vidět (hledání a seznam položek)', await nastroj.count() === 1
    && await nastroj.getByRole('searchbox', { name: 'Hledat ve skladu' }).or(nastroj.getByLabel('Hledat ve skladu')).first().isVisible());
  tvrdi('V1: seznam ukazuje položky z fixtury (Ovesné mléko)', (await nastroj.innerText()).includes('Ovesné mléko'));
  tvrdi('V1 (N7): v seznamu není neschválený návrh ani odložená položka', !(await nastroj.innerText()).includes('Kokosové mléko') && !(await nastroj.innerText()).includes('Vanilkový sirup'));
  tvrdi('V1: jediná limetka je „Přidat položku"', await limetek(p) === 1 && await p.getByRole('button', { name: 'Přidat položku' }).isVisible(), `${await limetek(p)}×`);
  tvrdi('V1: hodnota zásob v podtitulu (N8: bez odložených, s načatým balením)', (await p.locator('[data-plocha] header, [data-plocha] > div').first().innerText()).includes('hodnota zásob'));

  // Widgety místo bloků nad seznamem.
  const navrhy = widgetLi(p, 'sklad.navrhy');
  tvrdi('V: Nové věci od týmu ukazují návrh Evy se „Schválit" (primary, ne limetka)',
    (await navrhy.innerText()).includes('Kokosové mléko') && await navrhy.getByRole('button', { name: 'Schválit' }).count() === 1
    && await navrhy.locator('button.on-accent').count() === 0);
  const dochazi = await widgetLi(p, 'sklad.dochazi').innerText();
  tvrdi('V (N7): Docházející zásoby bez archivovaného Vanilkového sirupu a bez návrhu', dochazi.includes('Ovesné mléko') && !dochazi.includes('Vanilkový') && !dochazi.includes('Kokosové'), dochazi.slice(0, 200));
  tvrdi('V: Suroviny bez ceny (S) hlásí 3 suroviny', (await widgetLi(p, 'sklad.chybi_udaje').innerText()).includes('3'));
  tvrdi('V: Hlášení ze skladu (S) hlásí 1 nové', (await widgetLi(p, 'sklad.hlaseni').innerText()).includes('1'));
  tvrdi('V: Objednávky ukazují Makro (čeká na příjem), přijatou Bidfood ne', (await widgetLi(p, 'sklad.objednavky').innerText()).includes('Makro')
    && !(await widgetLi(p, 'sklad.objednavky').innerText()).includes('Bidfood'));
  tvrdi('V: K výrobě ukazuje limonádu', (await widgetLi(p, 'vyroba.k_vyrobe').innerText()).includes('Limonáda'));
  tvrdi('V: nad seznamem už nejsou tónované bloky (card-wait/bg-wait)', await p.locator('[data-plocha] .card-wait, [data-plocha] [class*="bg-wait/[0.0"]').count() === 0);
  await p.screenshot({ path: OUT + 'k69-b3-sklad-desk.png', fullPage: true });

  // Schválení návrhu: PATCH approve na položku 8.
  await navrhy.getByRole('button', { name: 'Schválit' }).click();
  tvrdi('V: Schválit pošle PATCH /api/inventory/8', await dokud(() => stav.dotazy.some(d => d.m === 'PATCH' && d.path === '/api/inventory/8'), 2000));

  // 7) Rozepsané hledání v nástroji přežije úpravy.
  const hledat = nastroj.getByLabel('Hledat ve skladu').first();
  await hledat.fill('mléko');
  await upravit(p).click();
  tvrdi('V2: vstup do úprav', await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + 'k69-b3-sklad-desk-upravy.png', fullPage: true });
  tvrdi('V2: nástroj je v úpravách sbalený do zástupce', await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible());
  tvrdi('V2: zástupce nástroje nemá „−" (nejde odebrat)', await nastroj.locator('[data-odznak]').count() === 0);
  tvrdi('V2: widgety „−" mají', await widgetLi(p, 'sklad.dochazi').locator('[data-odznak]').count() === 1);
  await nastroj.focus();
  await p.keyboard.press('Home');
  tvrdi('V2: nástroj jde přesunout nad všechny widgety', await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi('V2: …a odejde PUT s nástrojem nahoře', poradiPutu(stav.puty.at(-1))[0] === 'nastroj', JSON.stringify(poradiPutu(stav.puty.at(-1))));
  await p.keyboard.press('ArrowDown');
  tvrdi('V2: …a zpátky pod widget', await dokud(async () => (await poradi(p))[1] === 'nastroj', 1500), JSON.stringify(await poradi(p)));

  // 3) Galerie: widgety skladu v „Doporučené pro tuto stránku".
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(400);
  const dop = await doporucene(galerie);
  for (const nazev of ['Nákupní seznam', 'Hodnota zásob', 'Poslední pohyby skladu', 'Inventura', 'Stav kategorie']) {
    tvrdi(`V3: galerie nabízí „${nazev}" v Doporučených`, dop.includes(nazev), dop.slice(0, 300));
  }
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('V7: rozepsané hledání v nástroji přežilo úpravy', await nastroj.getByLabel('Hledat ve skladu').first().inputValue() === 'mléko');
  tvrdi('V: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Widget → nástroj: „Objednat" v Nákupním seznamu otevře nákupní seznam, řádek Surovin bez ceny úpravu položky.
{
  const fix = { ...FIX_VEDENI, polozky: [
    { id: 'sklad-nakup', widget: 'sklad.nakupni_seznam', velikost: 'L' },
    { id: 'sklad-chybi', widget: 'sklad.chybi_udaje', velikost: 'M' },
    { id: 'sklad-hodnota', widget: 'sklad.hodnota_zasob', velikost: 'M' },
    { id: 'sklad-pohyby', widget: 'sklad.posledni_pohyby', velikost: 'M' },
    { id: 'nastroj', widget: 'nastroj', velikost: 'L' },
  ] };
  const { ctx, p, stav } = await kontext({ fix, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.sklad');
  const nakup = widgetLi(p, 'sklad.nakupni_seznam');
  const tNakup = await nakup.innerText();
  // Velký widget skupiny podle dodavatele (abecedně); uvnitř skupiny kritické první.
  const makro = tNakup.slice(tNakup.toUpperCase().indexOf('MAKRO'));
  tvrdi('W: Nákupní seznam — po dodavatelích, kritické první, vlastní výroba (limonáda) ne, cukr kvůli výrobě ano',
    makro.indexOf('Kelímky') >= 0 && makro.indexOf('Kelímky') < makro.indexOf('Cukr') && tNakup.includes('na výrobu: Limonáda')
    && !tNakup.includes('Limonáda domácí') && tNakup.toUpperCase().indexOf('BIDFOOD') < tNakup.toUpperCase().indexOf('MAKRO'), tNakup.slice(0, 300));
  tvrdi('W: Nákupní seznam — návrh množství do maxima (Ovesné mléko 1 → 10 l = 9 l)', /Ovesné mléko[\s\S]{0,40}9 l/.test(tNakup));
  // N8: bez odložených a návrhů bez ceny, Gin s podílem načatého balení: 200 + 55 + 240 + 0 + (3 + 0,35/0,7) × 420 = 1 965.
  const tHodnota = await widgetLi(p, 'sklad.hodnota_zasob').innerText();
  tvrdi('W (N8): Hodnota zásob 1 965 Kč — stejný vzorec jako Finance', /1\s965/.test(tHodnota), tHodnota.slice(0, 120));
  tvrdi('W: Poslední pohyby — odpis z kasy u Ginu z načatého balení', (await widgetLi(p, 'sklad.posledni_pohyby').innerText()).includes('z načatého'));
  await nakup.getByRole('button', { name: 'Objednat' }).click();
  tvrdi('W1: „Objednat" otevře okno Nákupní seznam', await dokud(() => p.getByRole('dialog', { name: 'Nákupní seznam' }).isVisible(), 2000));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await widgetLi(p, 'sklad.chybi_udaje').locator('button.list-row').first().click();
  tvrdi('W2: řádek Surovin bez ceny otevře úpravu položky', await dokud(() => p.getByRole('dialog', { name: 'Upravit položku' }).isVisible(), 2000));
  tvrdi('W2: …a na /api/pos/usage šel jeden dotaz (sdílí se s nástrojem)', dotazyNa(stav, ['/api/pos/usage']).length >= 1);
  await ctx.close();
}

// Review B3: Objednávky ve výchozí velikosti M — Přijmout v řádku, okno s cenou,
// cena jde jako totalCost; velký widget má historii přijatých a zrušených.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_VEDENI, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.sklad');
  const obj = widgetLi(p, 'sklad.objednavky');
  const prijmout = obj.getByRole('button', { name: 'Přijmout' });
  tvrdi('R1: Objednávky (M) mají „Přijmout" přímo v řádku', await dokud(() => prijmout.first().isVisible(), 3000));
  await prijmout.first().click();
  const okno = p.getByRole('dialog', { name: /Přišlo od Makro/ });
  tvrdi('R1: …otevře okno příjmu s položkami a polem Celková cena', await dokud(() => okno.isVisible(), 2000)
    && (await okno.innerText()).includes('Kelímky') && await okno.getByLabel(/Celková cena/).isVisible());
  tvrdi('R1: okno nabízí i Zrušit objednávku', await okno.getByRole('button', { name: /Zrušit objednávku/ }).isVisible());
  await okno.getByLabel(/Celková cena/).fill('3 200');
  await okno.getByRole('button', { name: 'Přijmout a naskladnit' }).click();
  tvrdi('R1: …PATCH /api/orders nese action received a totalCost 3200', await dokud(() => stav.prijem != null, 2000)
    && stav.prijem.action === 'received' && stav.prijem.totalCost === 3200, JSON.stringify(stav.prijem));
  await ctx.close();
}
{
  const fix = { ...FIX_VEDENI, polozky: [{ id: 'sklad-objednavky', widget: 'sklad.objednavky', velikost: 'L' }, { id: 'nastroj', widget: 'nastroj', velikost: 'L' }] };
  const { ctx, p } = await kontext({ fix, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.sklad');
  const obj = widgetLi(p, 'sklad.objednavky');
  const hist = obj.getByRole('button', { name: /^Historie/ });
  tvrdi('R2: velký widget Objednávek má rozbalovací Historii', await dokud(() => hist.isVisible(), 3000));
  await hist.click();
  tvrdi('R2: …s přijatou objednávkou Bidfood a košem „Smazat z historie"', (await obj.innerText()).includes('Bidfood')
    && await obj.getByRole('button', { name: /^Smazat z historie: Bidfood/ }).isVisible());
  await ctx.close();
}

// 4) Oprávnění: Provozní (bez sklad.ceny) — zastaralý server pošle i Suroviny bez ceny.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_VEDENI, mineData: roleMine('provozni'), dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.sklad');
  await p.waitForTimeout(600);
  tvrdi('O1 (N4): Provozní nevidí Suroviny bez ceny', await naPlose(p, 'sklad.chybi_udaje') === 0);
  tvrdi('O1: návrhy, hlášení a docházející vidí', await naPlose(p, 'sklad.navrhy') === 1 && await naPlose(p, 'sklad.hlaseni') === 1 && await naPlose(p, 'sklad.dochazi') === 1);
  tvrdi('O1: podtitul bez hodnoty zásob (ceny nevidí)', !(await p.locator('[data-plocha]').innerText()).includes('hodnota zásob'));
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(500);
  const g = await galerie.innerText();
  tvrdi('O1: galerie Provozní nenabízí Hodnotu zásob ani Suroviny bez ceny', !g.includes('Hodnota zásob') && !g.includes('Suroviny bez ceny'));
  tvrdi('O1: …a na /api/finance neodešel dotaz (ani z náhledu)', dotazyNa(stav, ['/api/finance']).length === 0);
  await ctx.close();
}

// 5) 500 na hlášeních → ErrorState jen v hlášeních, ostatní widgety žijí.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_VEDENI, dalsi: podvrh() });
  stav.chyby['/api/inventory/reports'] = 500;
  await otevri(p, VEDENI, 'vedeni.sklad');
  await p.waitForTimeout(800);
  const hl = widgetLi(p, 'sklad.hlaseni');
  tvrdi('E1: Hlášení ukáže „Widget se nenačetl" se „Zkusit znovu"', await hl.getByText('Widget se nenačetl').isVisible() && await hl.getByRole('button', { name: 'Zkusit znovu' }).isVisible());
  tvrdi('E1: jen ono — ostatní widgety a seznam žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'nastroj').innerText()).includes('Ovesné mléko'));
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, „Přidat položku" vidět a otevře formulář.
{
  const { ctx, p } = await kontext({ fix: FIX_VEDENI, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.sklad');
  tvrdi('T1: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  // Review B3: řádek Docházejících zásob je na telefonu jeden řádek textu +
  // meta a šipka sedí vedle názvu (dřív chip a šipka každý na vlastním řádku).
  const radky = await widgetLi(p, 'sklad.dochazi').locator('button.list-row').evaluateAll(els => els.map(b => {
    const r = b.getBoundingClientRect(); const s = b.querySelector('svg')?.getBoundingClientRect();
    return { h: Math.round(r.height), sipkaVRadku: !!s && s.top < r.top + r.height / 2 + 4 && s.right <= r.right + 1 };
  }));
  tvrdi('T1: Docházející zásoby — řádek do 72 px a šipka v řádku', radky.length > 0 && radky.every(r => r.h <= 72 && r.sipkaVRadku), JSON.stringify(radky));
  const pridat = p.getByRole('button', { name: 'Přidat položku' });
  tvrdi('T1: „Přidat položku" je vidět a povolené', await pridat.isVisible() && await pridat.isEnabled());
  await p.screenshot({ path: OUT + 'k69-b3-sklad-tel.png', fullPage: true });
  // Menu „···" vedle hlavní akce: panel zarovnaný k pravé hraně tlačítka dřív
  // na telefonu utekl z levého okraje a půlka položek byla mimo obrazovku.
  await p.locator('[data-plocha]').getByRole('button', { name: 'Další akce' }).first().click();
  const panel = p.getByRole('menu').first();
  await dokud(() => panel.isVisible(), 3000);
  await p.waitForTimeout(250);
  const r = await panel.evaluate(el => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), vw: document.documentElement.clientWidth, vh: window.innerHeight }; });
  tvrdi('T1: menu „···" na telefonu celé na obrazovce s okrajem (16 px)', r.l >= 15 && r.r <= r.vw - 15 && r.t >= 0 && r.b <= r.vh, JSON.stringify(r));
  await p.keyboard.press('Escape');
  await pridat.click();
  tvrdi('T1: …a otevře formulář Nová položka', await dokud(() => p.getByRole('dialog', { name: 'Nová položka' }).isVisible(), 3000));
  tvrdi('T1: formulář na telefonu nepřetéká', await bezPreteceni(p));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Zaměstnanec: Sklad
// ---------------------------------------------------------------------------
const BARISTA = roleMine('barista');

// 1–4, 7) Hlavička, nástroj, widgety, oprávnění baristy, úpravy, galerie, rozepsané množství.
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: FIX_ZAM, mineData: BARISTA, dalsi: podvrh() });
  await otevri(p, ZAMESTNANEC, 'zamestnanec.sklad');
  const h = await h1(p);
  tvrdi('Z1: právě jeden h1 „Sklad", první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Sklad', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('Z1: nástroj = Všechny položky, v klidu vidět', await nastroj.getByRole('heading', { name: 'Všechny položky' }).isVisible());
  tvrdi('Z1: nejvýš jedna limetka', await limetek(p) <= 1, `${await limetek(p)}×`);
  tvrdi('Z1: Inventura hlásí běžící počítání 1 z 3', (await widgetLi(p, 'sklad.inventura').innerText()).includes('1 z 3'));
  tvrdi('Z1: Zapsat novou věc a Nahlásit chybějící jsou tlačítka', await widgetLi(p, 'sklad.zapsat_novou').getByRole('button', { name: 'Zapsat novou věc', exact: true }).isVisible()
    && await widgetLi(p, 'sklad.nahlasit').getByRole('button', { name: 'Nahlásit chybějící', exact: true }).isVisible());
  tvrdi('Z1: v seznamu je návrh s chipem „čeká na potvrzení"', (await nastroj.innerText()).includes('čeká na potvrzení'));
  tvrdi('Z4: barista — žádný dotaz na hlášení, objednávky, receptury ani historii', dotazyNa(stav, ['/api/inventory/reports', '/api/orders', '/api/pos/usage', '/api/inventory/log']).length === 0,
    dotazyNa(stav, ['/api/inventory/reports', '/api/orders', '/api/pos/usage', '/api/inventory/log']).map(d => d.path).join(', '));
  await p.screenshot({ path: OUT + 'k69-b3-sklad-zam-desk.png', fullPage: true });

  // 7) Rozepsané množství přežije úpravy.
  const pole = nastroj.getByLabel(/^Množství — Mléko plnotučné/);
  await pole.fill('17');
  tvrdi('Z7: s rozepsanou změnou je „Uložit" povolené', await nastroj.getByRole('button', { name: 'Uložit' }).first().isEnabled().catch(() => false)
    || await nastroj.locator('button:has-text("Uložit"):not([disabled])').count() >= 1);
  await upravit(p).click();
  tvrdi('Z2: vstup do úprav', await dokud(() => vUpravach(p), 1500));
  tvrdi('Z2: nástroj je sbalený do zástupce bez „−"', await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible() && await nastroj.locator('[data-odznak]').count() === 0);
  await nastroj.focus();
  await p.keyboard.press('Home');
  tvrdi('Z2: nástroj jde přesunout nad widgety', await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi('Z2: …PUT s nástrojem nahoře', poradiPutu(stav.puty.at(-1))[0] === 'nastroj');
  await p.keyboard.press('ArrowDown');
  tvrdi('Z2: …a zpátky pod widget', await dokud(async () => (await poradi(p))[1] === 'nastroj', 1500));

  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(400);
  const gz = await galerie.innerText();
  tvrdi('Z3: galerie má Stav kategorie a K výrobě', gz.includes('Stav kategorie') && gz.includes('K výrobě'), gz.slice(0, 300));
  tvrdi('Z3: …a baristovi nenabízí vedoucí widgety skladu', !gz.includes('Nové věci od týmu') && !gz.includes('Hlášení ze skladu') && !gz.includes('Nákupní seznam') && !gz.includes('Hodnota zásob'));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('Z7: rozepsané množství přežilo úpravy', await nastroj.getByLabel(/^Množství — Mléko plnotučné/).inputValue() === '17');

  // Nahlásit chybějící: okno s výběrem, odeslání POST.
  await widgetLi(p, 'sklad.nahlasit').getByRole('button', { name: 'Nahlásit chybějící', exact: true }).click();
  const okno = p.getByRole('dialog', { name: 'Nahlásit chybějící' });
  tvrdi('Z5: Nahlásit chybějící otevře okno s výběrem položek', await dokud(() => okno.isVisible(), 2000));
  await okno.getByRole('checkbox', { name: 'Nahlásit Ovesné mléko' }).click();
  await okno.getByRole('button', { name: /^Odeslat/ }).click();
  tvrdi('Z5: …odeslání pošle POST /api/inventory/reports', await dokud(() => stav.dotazy.some(d => d.m === 'POST' && d.path === '/api/inventory/reports'), 2000));
  tvrdi('Z: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 5) 500 na inventuře → chyba jen v Inventuře; 6) telefon 390 s použitelným zápisem.
{
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_ZAM, mineData: BARISTA, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  stav.chyby['/api/stocktake'] = 500;
  await otevri(p, ZAMESTNANEC, 'zamestnanec.sklad');
  await p.waitForTimeout(800);
  tvrdi('ZE1: Inventura ukáže „Widget se nenačetl"', await widgetLi(p, 'sklad.inventura').getByText('Widget se nenačetl').isVisible());
  tvrdi('ZE1: jen ona — seznam a Docházející zásoby žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'sklad.dochazi').innerText()).includes('Ovesné mléko'));
  tvrdi('ZT1: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  // Review B3 (T9): scrollWidth nestačí — useknutá tlačítka uvnitř karty ho
  // nezvětší. Pravý okraj každého tlačítka nástroje ≤ pravý okraj jeho karty.
  const presahy = await widgetLi(p, 'nastroj').evaluate(li => {
    const out = [];
    for (const card of li.querySelectorAll('.card')) {
      const c = card.getBoundingClientRect();
      for (const b of card.querySelectorAll('button, input')) {
        const r = b.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.right > c.right + 0.5 || r.left < c.left - 0.5) out.push(`${b.getAttribute('aria-label') || b.textContent?.trim().slice(0, 20)} ${Math.round(r.left)}–${Math.round(r.right)} / karta ${Math.round(c.right)}`);
      }
    }
    return out;
  });
  tvrdi('ZT1: žádné tlačítko ani pole nástroje nepřečnívá kartu (390 px)', presahy.length === 0, presahy.slice(0, 4).join(' | '));
  const plus = widgetLi(p, 'nastroj').getByRole('button', { name: 'Přidat — Ovesné mléko' });
  await plus.scrollIntoViewIfNeeded();
  tvrdi('ZT1: krokovač v nástroji je vidět a klikatelný', await plus.isVisible() && await plus.isEnabled());
  await plus.click();
  const ulozit = widgetLi(p, 'nastroj').locator('button:has-text("Uložit"):not([disabled])').first();
  tvrdi('ZT1: …po změně jde uložit', await ulozit.isVisible());
  await p.screenshot({ path: OUT + 'k69-b3-sklad-zam-tel.png', fullPage: true });
  await ulozit.click();
  tvrdi('ZT1: …Uložit pošle PATCH /api/inventory/2', await dokud(() => stav.dotazy.some(d => d.m === 'PATCH' && d.path === '/api/inventory/2'), 2000));
  await ctx.close();
}

await konec();
void BASE;
