// Kolo 82 — Sklad „na první dobrou": jednotky u každého čísla, formulář položky
// (co to je → v čem to počítáš → kolik je teď → Další nastavení), inventura jako
// počítací list (velké pole s jednotkou, ±, „Sedí", filtr kategorií, souhrn v Kč
// před zapsáním), zápis stavu zaměstnance s jednotkou v poli, záložky
// Sklad › Položky / Receptury z kasy / Inventura oběma směry, proklik z receptury
// na položku a žádné vodorovné přetečení na 320 a 390 px (stránka i každý widget).
//
// Fixtury: scripts/sondy/fixtury/k69-b3-*.json (sklad) a k69-b4-pos-products.json (kasa);
// kategorie Alkohol se tu podvrhuje jako balená (0,7 l), ať je vidět načaté balení.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, DIR, OUT } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const FIX_VEDENI = nacti('k69-b3-rozlozeni-sklad');
const FIX_ZAM = nacti('k69-b3-rozlozeni-sklad-zam');
const FIX_RECEPTURY = nacti('k69-b4-rozlozeni-receptury');

const kategorie = () => nacti('k69-b3-categories').map(c => c.name === 'Alkohol'
  ? { ...c, tracksOpen: true, contentUnit: 'l', defaultPackageSize: 0.7, thresholdUnit: 'package' } : c);
const inventory = () => nacti('k69-b3-inventory').map(i => i.name === 'Gin London Dry' ? { ...i, effectivePackageSize: 0.7, effectiveContentUnit: 'l' } : i);
// Inventura: k fixtuře přibude balený gin a cukr; ceny, ať jde souhrn v penězích ověřit.
const stocktake = (stav) => {
  if (stav.inventura) return stav.inventura;
  const s = nacti('k69-b3-stocktake');
  s.open.data[0].unitCost = 25; s.open.data[1].unitCost = 55; s.open.data[2].unitCost = 2;
  s.open.data.push({ itemId: 3, name: 'Gin London Dry', category: 'Alkohol', unit: 'lahev', expected: 3, counted: null, packageSize: 0.7, contentUnit: 'l', expectedOpen: 0.35, countedOpen: null, unitCost: 420 });
  s.open.data.push({ itemId: 4, name: 'Cukr třtinový', category: 'Suroviny', unit: 'kg', expected: 5, counted: null, unitCost: 40 });
  stav.inventura = s;
  return s;
};

/** Podvrh API skladu i kasy; PATCH inventury si zapisuje do `stav.patche` a promítá počty do snímku. */
const podvrh = () => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (m === 'PATCH' && path === '/api/stocktake') {
    const t = req.postDataJSON();
    (stav.patche ??= []).push(t);
    const s = stocktake(stav);
    for (const [id, v] of Object.entries(t.counts ?? {})) { const r = s.open.data.find(x => String(x.itemId) === id); if (r) r.counted = v; }
    for (const [id, v] of Object.entries(t.opens ?? {})) { const r = s.open.data.find(x => String(x.itemId) === id); if (r) r.countedOpen = v; }
    if (t.complete) { stav.dokonceno = true; return json({ ok: true, applied: 3, diffs: 1 }); }
    return json({ ok: true });
  }
  if (m === 'PATCH' && /^\/api\/inventory\/\d+$/.test(path)) { (stav.patche ??= []).push({ cesta: path, ...req.postDataJSON() }); return json({ ok: true, id: Number(path.split('/').pop()), ...req.postDataJSON() }); }
  if (m !== 'GET') return json({ ok: true });
  if (path === '/api/inventory') return json(inventory());
  if (path === '/api/inventory/categories') return json(kategorie());
  if (path === '/api/stocktake') return json(stav.dokonceno ? { open: null, history: [] } : stocktake(stav));
  if (path === '/api/inventory/format') return json({ mnozstvi: true, prahy: true });
  if (path === '/api/inventory/log' && url.searchParams.get('itemId')) return json([]);
  const mapa = { '/api/pos/usage': 'k69-b3-pos-usage', '/api/inventory/reports': 'k69-b3-reports', '/api/orders': 'k69-b3-orders', '/api/inventory/log': 'k69-b3-log', '/api/production': 'k69-b3-production', '/api/pos/products': 'k69-b4-pos-products' };
  if (mapa[path]) return json(nacti(mapa[path]));
  if (path === '/api/suppliers') return json({ suppliers: [{ id: 1, name: 'Makro', email: 'objednavky@makro.cz' }] });
  if (path === '/api/inventory/shrinkage') return json({ ready: false });
  if (path === '/api/guides') return json({ guides: [] });
  if (path === '/api/pos/margins') return json({ connected: true, totals: { marginPct: 68, margin: 1000, noRecipe: 1 }, items: [] });
  if (path === '/api/pos/status') return json({ connected: true });
  if (/^\/api\/inventory\/\d+\/production$/.test(path)) return json({ itemId: 3, name: 'Gin', unit: 'lahev', madeInHouse: false, batchYield: null, batchSteps: '', productionLabel: '', taskTitle: '', status: 'ok', batches: 0, ingredients: [] });
  return undefined;
};

const VEDENI = '/employer/inventory';
const RECEPTURY = '/employer/recipes';
const ZAMESTNANEC = '/employee/shifts?view=inventory';
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
/** Přetečení: dokument, tělo, každý widget a otevřené okno. */
const preteceni = (p) => p.evaluate(() => {
  const out = [];
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.push(`dokument ${de.scrollWidth}>${de.clientWidth}`);
  if (document.body.scrollWidth > de.clientWidth + 1) out.push(`body ${document.body.scrollWidth}>${de.clientWidth}`);
  for (const li of document.querySelectorAll('li[data-widget]')) if (li.scrollWidth > li.clientWidth + 1) out.push(`widget ${li.dataset.widget} ${li.scrollWidth}>${li.clientWidth}`);
  for (const d of document.querySelectorAll('[role=dialog]')) if (d.scrollWidth > d.clientWidth + 1) out.push(`okno ${d.scrollWidth}>${d.clientWidth}`);
  return out;
});
/** Sufix jednotky v poli (span vedle inputu v PoleMnozstvi). */
const sufix = (loc) => loc.evaluate(el => el.parentElement?.querySelector('span[aria-hidden]')?.textContent?.trim() ?? '');
const otevriMenuPolozky = async (p, nazev) => {
  const radek = widgetLi(p, 'nastroj').getByRole('button', { name: new RegExp(`Další akce: ${nazev}`) }).first();
  await radek.scrollIntoViewIfNeeded();
  await radek.click();
  await p.getByRole('menuitem', { name: 'Upravit položku' }).click();
};

// ---------------------------------------------------------------------------
// Formulář položky: jednotka u každého čísla, pořadí a Další nastavení
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ fix: FIX_VEDENI, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.sklad');
  // Záložky pod hlavičkou.
  const zalozky = p.locator('[data-sklad-zalozky]').first();
  tvrdi('S1: pod hlavičkou Skladu jsou záložky Položky / Receptury z kasy a tlačítko Inventura',
    await zalozky.getByRole('tab', { name: 'Položky' }).isVisible() && await zalozky.getByRole('tab', { name: 'Receptury z kasy' }).isVisible()
    && await zalozky.getByRole('button', { name: 'Inventura' }).isVisible());
  tvrdi('S1: aktivní je Položky', await zalozky.getByRole('tab', { name: 'Položky' }).getAttribute('aria-selected') === 'true');

  await otevriMenuPolozky(p, 'Gin');
  const okno = p.getByRole('dialog', { name: 'Upravit položku' });
  tvrdi('F1: okno Upravit položku', await dokud(() => okno.isVisible(), 3000));
  const text = await okno.innerText();
  const poradi = ['Co to je', 'V čem to počítáš', 'Kolik je teď', 'Další nastavení'].map(s => text.toUpperCase().indexOf(s.toUpperCase()));
  tvrdi('F1: pořadí sekcí — Co to je → V čem to počítáš → Kolik je teď → Další nastavení', poradi.every((x, i) => x >= 0 && (i === 0 || x > poradi[i - 1])), JSON.stringify(poradi));
  tvrdi('F1: jednotka „lahev" je vlastní — pilulka Jiná… je zvolená a pole Vlastní jednotka ji nese',
    await okno.getByRole('button', { name: 'Jiná…' }).getAttribute('aria-pressed') === 'true' && await okno.getByLabel('Vlastní jednotka').inputValue() === 'lahev');
  tvrdi('F1: „1 lahev obsahuje" 0,7 l — velikost s českou čárkou a jednotka obsahu', await okno.getByLabel('1 lahev obsahuje').inputValue() === '0,7'
    && await okno.getByLabel('Jednotka obsahu').inputValue() === 'l');
  tvrdi('F1: věta o vedení: stav v lahvích, receptury a odpis z kasy v l', text.includes('1 lahev = 0,7 l') && text.includes('odpis z kasy jdou v l'));
  const zavrene = okno.getByLabel('Zavřených balení');
  tvrdi('F1: pole Zavřených balení má jednotku „lahev" přímo v poli a hodnotu 3', await zavrene.inputValue() === '3' && await sufix(zavrene) === 'lahev');
  const nacate = okno.getByLabel('V načatém balení zbývá');
  tvrdi('F1: pole V načatém balení zbývá má „l" v poli a 0,35', await nacate.inputValue() === '0,35' && await sufix(nacate) === 'l');
  tvrdi('F1: přepočet 3 × 0,7 l + 0,35 l = 2,45 l celkem', text.includes('3 × 0,7 l + 0,35 l = 2,45 l celkem'));
  await okno.getByRole('button', { name: 'Přidat — Gin London Dry' }).click();
  tvrdi('F1: ± u množství: po + je 4 lahve a přepočet 3,15 l', await zavrene.inputValue() === '4' && (await okno.innerText()).includes('4 × 0,7 l + 0,35 l = 3,15 l celkem'));
  const dalsi = okno.getByRole('button', { name: 'Další nastavení' });
  tvrdi('F1: Další nastavení je sbalené se souhrnem (hlídání od 2 lahev · cena 420 Kč · Makro)', await dalsi.getAttribute('aria-expanded') === 'false'
    && text.includes('hlídání od 2 lahev') && text.includes('cena 420 Kč') && text.includes('Makro'));
  tvrdi('F1: sbalené Další nastavení neukazuje prahy ani kasu', await okno.getByLabel('Upozornit při').count() === 0 && !text.includes('Používá se v kase'));
  await dalsi.click();
  await p.waitForTimeout(300);
  const min = okno.getByLabel('Upozornit při');
  tvrdi('F1: po rozbalení: Upozornit při s jednotkou lahev v poli, nápověda u hlídání, Cena za balení, Používá se v kase, Vyrábíme sami',
    await min.isVisible() && await sufix(min) === 'lahev' && (await okno.innerText()).includes('Pod „Upozornit při“')
    && await okno.getByLabel('Cena za balení').isVisible() && (await okno.innerText()).includes('Používá se v kase') && (await okno.innerText()).includes('Vyrábíme sami'));
  tvrdi('F1: cena za balení má v poli měnu', (await sufix(okno.getByLabel('Cena za balení'))).includes('Kč'));
  tvrdi('F1: okno nepřetéká', (await preteceni(p)).length === 0, (await preteceni(p)).join(' | '));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);

  // Nová položka: výchozí ks, přepnutí na balení a přepočet 2 × 1000 g.
  await p.getByRole('button', { name: 'Přidat položku' }).first().click();
  const nove = p.getByRole('dialog', { name: 'Nová položka' });
  tvrdi('F2: okno Nová položka', await dokud(() => nove.isVisible(), 3000));
  tvrdi('F2: výchozí jednotka ks je zvolená a věta říká, že všechno je v kusech', await nove.getByRole('button', { name: 'ks', exact: true }).getAttribute('aria-pressed') === 'true'
    && (await nove.innerText()).includes('Stav, limity i receptury píšeš v kusech.'));
  tvrdi('F2: Aktuální množství má „ks" v poli', await sufix(nove.getByLabel('Aktuální množství')) === 'ks');
  await nove.getByRole('button', { name: 'balení', exact: true }).click();
  tvrdi('F2: u balení bez velikosti radí doplnit obsah (jinak se z kasy odepisují jen celá balení)', (await nove.innerText()).includes('Doplň, kolik jedno balení obsahuje'));
  await nove.getByLabel('1 balení obsahuje').fill('1000');
  await nove.getByLabel('Jednotka obsahu').selectOption('g');
  await nove.getByLabel('Zavřených balení').fill('2');
  const tx = await nove.innerText();
  tvrdi('F2: 1 balení = 1000 g a přepočet 2 × 1000 g + 0 g = 2000 g celkem', tx.includes('1 balení = 1000 g') && tx.includes('2 × 1000 g + 0 g = 2000 g celkem'), tx.slice(0, 200));
  tvrdi('F2: V načatém balení zbývá má „g" v poli', await sufix(nove.getByLabel('V načatém balení zbývá')) === 'g');
  tvrdi('F: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Inventura jako počítací list (telefon 390)
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav } = await kontext({ fix: FIX_VEDENI, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.sklad');
  await p.locator('[data-sklad-zalozky]').first().getByRole('button', { name: 'Inventura' }).click();
  const okno = p.getByRole('dialog', { name: 'Inventura skladu' });
  tvrdi('I1: tlačítko Inventura v záložkách otevře okno', await dokud(() => okno.isVisible(), 3000));
  // Okno se otevře dřív, než dorazí položky (v CI i o pár set ms) — na data počkat, ne je číst hned.
  tvrdi('I1: pruh postupu a 1/5 spočítáno', await dokud(async () => await okno.getByRole('progressbar').isVisible() && (await okno.innerText()).includes('1/5 spočítáno'), 4000));
  const filtr = okno.getByRole('group', { name: 'Filtr inventury' });
  tvrdi('I1: filtr kategorií (Vše, Mléčné, Obaly, Alkohol, Suroviny) a Jen nespočítané', await dokud(async () => await filtr.getByRole('button', { name: /^Mléčné/ }).isVisible()
    && await filtr.getByRole('button', { name: /^Alkohol/ }).isVisible() && await filtr.getByRole('button', { name: /^Jen nespočítané/ }).isVisible(), 3000));
  const pole = okno.getByLabel('Spočítáno — Ovesné mléko (l)');
  tvrdi('I1: pole má jednotku „l" přímo v poli a je velké pro palec (≥ 44 px)', await sufix(pole) === 'l' && (await pole.boundingBox()).height >= 44);
  await okno.getByRole('button', { name: 'Přidat — Ovesné mléko' }).click();
  tvrdi('I1: + zapíše 1 l a odejde PATCH s counts {2: 1}', await pole.inputValue() === '1' && await dokud(() => (stav.patche ?? []).some(x => x.counts && x.counts['2'] === 1), 2500), JSON.stringify(stav.patche));
  await pole.fill('3');
  await pole.blur();
  tvrdi('I1: rozdíl +2 l hned vedle názvu', await dokud(async () => (await okno.innerText()).includes('+2 l'), 1500));
  await okno.getByRole('button', { name: 'Sedí s evidencí — Kelímky 0,4 l' }).click();
  tvrdi('I1: „Sedí" zapíše evidenci (0 ks) a ukáže sedí', await dokud(async () => (await okno.getByLabel('Spočítáno — Kelímky 0,4 l (ks)').inputValue()) === '0', 1500)
    && await dokud(() => (stav.patche ?? []).some(x => x.counts && x.counts['5'] === 0), 2500));
  await okno.getByRole('button', { name: 'Sedí s evidencí — Gin London Dry' }).click();
  tvrdi('I1: „Sedí" u baleného ginu zapíše i zbytek v načatém (0,35 l)', await dokud(async () => (await okno.getByLabel('Zbytek v načatém — Gin London Dry').inputValue().catch(() => '')) === '0,35'
    || (await okno.locator('#inv-o-3').inputValue()) === '0,35', 1500));
  tvrdi('I1: Načaté balení má „l" v poli', await sufix(okno.locator('#inv-o-3')) === 'l');
  // Filtr kategorie.
  await filtr.getByRole('button', { name: /^Mléčné/ }).click();
  await p.waitForTimeout(200);
  tvrdi('I1: filtr Mléčné nechá jen mléka', (await okno.innerText()).includes('Ovesné mléko') && !(await okno.innerText()).includes('Kelímky'));
  await filtr.getByRole('button', { name: /^Vše/ }).click();
  await filtr.getByRole('button', { name: /^Jen nespočítané/ }).click();
  await p.waitForTimeout(200);
  tvrdi('I1: Jen nespočítané nechá cukr, spočítané mléko ne', (await okno.innerText()).includes('Cukr') && !(await okno.innerText()).includes('Ovesné mléko'));
  await filtr.getByRole('button', { name: /^Jen nespočítané/ }).click();
  // Souhrn před zapsáním.
  await okno.getByRole('button', { name: 'Dokončit a zapsat' }).click();
  const souhrn = okno.getByRole('region', { name: 'Před zapsáním zkontroluj rozdíly' });
  tvrdi('I2: Dokončit otevře souhrn rozdílů', await dokud(() => souhrn.isVisible(), 2000));
  // Peníze mají nezlomitelnou mezeru („110 Kč") — porovnává se s obyčejnou.
  const st = (await souhrn.innerText()).replace(/\s/g, ' ');
  tvrdi('I2: souhrn — přibylo 1 (Ovesné mléko +2 l = +110 Kč), ubylo 0, rozdíl +110 Kč, 1 nespočítaná', st.includes('Ovesné mléko') && st.includes('+2 l') && st.includes('+110 Kč') && /Rozdíl v penězích/i.test(st)
    && st.includes('1 nespočítaná položka zůstane beze změny'), st.replace(/\n/g, ' | ').slice(0, 300));
  tvrdi('I2: okno ani stránka nepřetéká (390)', (await preteceni(p)).length === 0, (await preteceni(p)).join(' | '));
  await p.screenshot({ path: OUT + 'k82-inventura-souhrn-390.png' });
  await souhrn.getByRole('button', { name: /^Zapsat/ }).click();
  tvrdi('I2: Zapsat pošle PATCH s complete: true', await dokud(() => (stav.patche ?? []).some(x => x.complete === true), 2500));
  tvrdi('I2: …a okno hlásí Hotovo', await dokud(async () => (await okno.innerText()).includes('Hotovo'), 3000));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Zaměstnanec: zápis stavu s jednotkou v poli (390)
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_ZAM, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, ZAMESTNANEC, 'zamestnanec.sklad');
  const pole = widgetLi(p, 'nastroj').getByLabel(/^Množství — Mléko plnotučné/);
  await pole.scrollIntoViewIfNeeded();
  tvrdi('Z1: pole množství má „l" přímo v poli', await sufix(pole) === 'l');
  await widgetLi(p, 'nastroj').getByRole('button', { name: 'Přidat — Mléko plnotučné' }).click();
  tvrdi('Z1: + zvýší na 9 a Uložit se povolí', await pole.inputValue() === '9');
  await widgetLi(p, 'nastroj').locator('button:has-text("Uložit"):not([disabled])').first().click();
  tvrdi('Z1: Uložit pošle PATCH /api/inventory/1 s quantity 9', await dokud(() => (stav.patche ?? []).some(x => x.cesta === '/api/inventory/1' && x.quantity === 9), 2500), JSON.stringify(stav.patche));
  tvrdi('Z1: nic nepřetéká (390)', (await preteceni(p)).length === 0, (await preteceni(p)).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Struktura: záložky oběma směry, proklik z receptury na položku
// ---------------------------------------------------------------------------
{
  const { ctx, p } = await kontext({ fix: FIX_RECEPTURY, dalsi: podvrh() });
  await otevri(p, RECEPTURY, 'vedeni.receptury');
  const zalozky = p.locator('[data-sklad-zalozky]').first();
  tvrdi('R1: Receptury mají tytéž záložky, aktivní Receptury z kasy', await zalozky.getByRole('tab', { name: 'Receptury z kasy' }).getAttribute('aria-selected') === 'true');
  await widgetLi(p, 'nastroj').getByRole('button', { name: /Latte/ }).first().click();
  await p.waitForTimeout(500);
  const otevrit = widgetLi(p, 'nastroj').getByRole('button', { name: 'Otevřít ve skladu' }).first();
  tvrdi('R1: editor receptury nabízí Otevřít ve skladu u suroviny', await otevrit.isVisible());
  await otevrit.click();
  tvrdi('R1: …otevře Sklad s úpravou té položky (Mléko plnotučné) a rozbaleným Dalším nastavením', await dokud(() => p.getByRole('dialog', { name: 'Upravit položku' }).isVisible(), 5000)
    && (await p.getByRole('dialog', { name: 'Upravit položku' }).innerText()).includes('Mléko plnotučné')
    && await p.getByRole('dialog', { name: 'Upravit položku' }).getByRole('button', { name: 'Další nastavení' }).getAttribute('aria-expanded') === 'true');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await p.locator('[data-sklad-zalozky]').first().getByRole('tab', { name: 'Receptury z kasy' }).click();
  tvrdi('R2: záložka Receptury z kasy vede zpět na Receptury', await dokud(() => p.getByRole('heading', { level: 1, name: 'Receptury' }).isVisible(), 5000));
  await p.locator('[data-sklad-zalozky]').first().getByRole('button', { name: 'Inventura' }).click();
  tvrdi('R2: Inventura z Receptur otevře Sklad s oknem inventury', await dokud(() => p.getByRole('dialog', { name: 'Inventura skladu' }).isVisible(), 5000));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Přetečení: 320 a 390 — Sklad, Receptury, okna
// ---------------------------------------------------------------------------
for (const w of [320, 390]) {
  const { ctx, p } = await kontext({ fix: FIX_VEDENI, viewport: { width: w, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.sklad');
  tvrdi(`P${w}: Sklad bez přetečení`, (await preteceni(p)).length === 0, (await preteceni(p)).join(' | '));
  await otevriMenuPolozky(p, 'Gin');
  await dokud(() => p.getByRole('dialog', { name: 'Upravit položku' }).isVisible(), 3000);
  await p.getByRole('dialog', { name: 'Upravit položku' }).getByRole('button', { name: 'Další nastavení' }).click();
  await p.waitForTimeout(300);
  tvrdi(`P${w}: okno položky s rozbaleným Dalším nastavením bez přetečení`, (await preteceni(p)).length === 0, (await preteceni(p)).join(' | '));
  if (w === 320) await p.screenshot({ path: OUT + 'k82-polozka-320.png' });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await p.locator('[data-sklad-zalozky]').first().getByRole('button', { name: 'Inventura' }).click();
  await dokud(() => p.getByRole('dialog', { name: 'Inventura skladu' }).isVisible(), 3000);
  tvrdi(`P${w}: okno inventury bez přetečení`, (await preteceni(p)).length === 0, (await preteceni(p)).join(' | '));
  if (w === 320) await p.screenshot({ path: OUT + 'k82-inventura-320.png' });
  await ctx.close();
  const r = await kontext({ fix: FIX_RECEPTURY, viewport: { width: w, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(r.p, RECEPTURY, 'vedeni.receptury');
  tvrdi(`P${w}: Receptury bez přetečení`, (await preteceni(r.p)).length === 0, (await preteceni(r.p)).join(' | '));
  await widgetLi(r.p, 'nastroj').getByRole('button', { name: /Latte/ }).first().click();
  await r.p.waitForTimeout(500);
  tvrdi(`P${w}: editor receptury bez přetečení`, (await preteceni(r.p)).length === 0, (await preteceni(r.p)).join(' | '));
  await r.ctx.close();
}

await konec();
