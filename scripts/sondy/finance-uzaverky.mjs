// Finance a Uzávěrky — „jaký den jaká tržba" a filtry uzávěrek.
//  A) Finance (výchozí rozložení z kódu): jen podstatné widgety, Tržba po dnech jde za měsíc z hlavičky
//     (celý minulý měsíc po přepnutí), seznam dnů je nejnovější nahoře a rozbalí se.
//  B) Uzávěrky: hledání bez diakritiky, stav, kasa, směna, rozmezí dnů, řazení, „Zrušit filtry", prázdný výsledek,
//     telefon 390 bez přetečení.
//  C) Uzávěrky: období jedním prvkem v hlavičce nástroje (Vše | Měsíc + MonthNav, kolo 7) — šipky mění měsíc
//     i jméno exportu, export bere to, co je vidět (i po filtru), meta „· 84 hostů"; 320/390 bez přetečení.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, dotazyNa, fixtura, DIR, OUT, BASE } from './k68-spolecne.mjs';
import { dayPlus, pragueToday } from '../../lib/pragueTime.ts';

const dnes = pragueToday();
const mesic = dnes.slice(0, 7);
const minuly = (() => { const [y, m] = mesic.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
const text = async (p, w) => (await p.locator(`[data-plocha] li[data-widget="${w}"]`).innerText().catch(() => '')).replace(/ /g, ' ');

// ===========================================================================
// A) Finance
// ===========================================================================
{
  // Výchozí rozložení bere server z kódu; sonda podvrhuje /api/rozlozeni, proto ho poskládá ze zdroje.
  const src = readFileSync(new URL('../../lib/widgety/stranky/vedeni.finance.ts', import.meta.url), 'utf8');
  const blok = src.slice(src.indexOf("'typ:vedeni': ["), src.indexOf('],', src.indexOf("'typ:vedeni': [")));
  const polozky = [...blok.matchAll(/\{ w: '([^']+)'(?:, s: '([SML])')?(?:, o: (\{[^}]*\}))?/g)]
    .map(m => ({ id: m[1].replace(/[._]/g, '-'), widget: m[1], ...(m[2] ? { velikost: m[2] } : {}), ...(m[3] ? { nastaveni: JSON.parse(m[3].replace(/(\w+):/g, '"$1":').replace(/'/g, '"')) } : {}) }));
  tvrdi('A0: výchozí Finance je přehledný dashboard (8 dílů včetně knihy výdajů, ne dvacet)', polozky.length === 8, polozky.map(x => x.widget).join(', '));
  const fix = { ...fixtura('k69-b5b-rozlozeni-finance'), polozky };

  const dalsi = (req, json) => {
    const u = new URL(req.url()); if (req.method() !== 'GET') return undefined;
    if (u.pathname === '/api/pos/daily') {
      const od = u.searchParams.get('from'), doD = u.searchParams.get('to');
      const days = []; let n = 0;
      for (let d = od; d <= doD && n < 40; d = dayPlus(d, 1), n++) {
        const total = 12000 + ((Number(d.slice(8)) * 1731) % 9000);
        days.push({ day: d, bills: 90, cash: total / 3, card: total * 2 / 3, other: 0, total, tips: 0, tipsCash: 0, tipsCard: 0, discounts: 0, refundCount: 0, refundTotal: 0, persons: 0, closings: 0, declared: null, diff: null });
      }
      const base = JSON.parse(readFileSync(DIR + 'k69-b5b-pos-daily.json', 'utf8').replaceAll('DNES', dnes));
      return json({ ...base, from: od, to: doD, days, totals: { ...base.totals, total: days.reduce((s2, x) => s2 + x.total, 0) } });
    }
    if (u.pathname === '/api/finance') return json({ ...JSON.parse(readFileSync(DIR + 'k69-b5b-finance.json', 'utf8').replaceAll('DNES', dnes)), month: u.searchParams.get('month') });
    return undefined;
  };
  for (const w of [1280, 390]) {
    const { ctx, p, stav } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, fix, dalsi });
    await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
    await dokud(async () => /Tržba po jednotlivých dnech|Dny bez tržby|bez tržby/.test(await text(p, 'trzby.po_dnech')) || (await p.getByRole('list', { name: 'Tržba po jednotlivých dnech' }).count()) > 0, 8000);
    const radky = p.locator('[data-plocha] li[data-widget="trzby.po_dnech"] ul[aria-label="Tržba po jednotlivých dnech"] > li');
    const n1 = await radky.count();
    tvrdi(`A1 ${w}: Tržba po dnech ukazuje seznam dnů s částkami (aspoň dnešek)`, n1 >= 1, String(n1));
    const prvni = (await radky.first().innerText()).replace(/\s+/g, ' ');
    tvrdi(`A1 ${w}: nejnovější den je nahoře a má částku v Kč`, /Kč/.test(prvni) && new RegExp(`${Number(dnes.slice(8))}\\. ${Number(dnes.slice(5, 7))}\\.`).test(prvni), prvni);
    const poz1 = dotazyNa(stav, ['/api/pos/daily']).map(d => d.u);
    tvrdi(`A2 ${w}: tento měsíc se ptá od 1. dne měsíce`, poz1.some(u => u.includes(`from=${mesic}-01`)), poz1.join(' '));

    await p.getByRole('button', { name: 'Předchozí měsíc' }).click();
    const posl = dayPlus(`${mesic}-01`, -1);
    await dokud(async () => (await p.locator('[data-plocha] li[data-widget="trzby.po_dnech"] ul[aria-label="Tržba po jednotlivých dnech"] > li').count()) === Number(posl.slice(8)), 8000);
    const poz2 = dotazyNa(stav, ['/api/pos/daily']).map(d => d.u);
    tvrdi(`A3 ${w}: po přepnutí na minulý měsíc se widget ptá na celý minulý měsíc`, poz2.some(u => u.includes(`from=${minuly}-01`) && u.includes(`to=${posl}`)), poz2.join(' '));
    const karta = p.locator('[data-plocha] li[data-widget="trzby.po_dnech"]');
    tvrdi(`A4 ${w}: celý minulý měsíc je dlouhý — obsah je zkrácený a nabízí „Zobrazit vše"`, await karta.locator('[data-zkraceno]').count() === 1 && await karta.getByRole('button', { name: 'Zobrazit vše', exact: true }).count() === 1);
    await karta.getByRole('button', { name: 'Zobrazit vše', exact: true }).click();
    const n3 = await karta.locator('ul[aria-label="Tržba po jednotlivých dnech"] > li').count();
    tvrdi(`A5 ${w}: po rozbalení jsou všechny dny měsíce (${posl.slice(8)})`, n3 === Number(posl.slice(8)), String(n3));
    const pres = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    tvrdi(`A6 ${w}: Finance bez vodorovného přetečení`, pres <= 0, String(pres));
    if (w === 390) await p.screenshot({ path: OUT + 'finance-po-dnech.png', fullPage: false });
    await ctx.close();
  }
}

// ===========================================================================
// B) Uzávěrky
// ===========================================================================
{
  const DNY = Object.fromEntries(['DNES', 'VCERA', 'PREDEVCIREM', 'PRED3', 'PRED4', 'PRED5', 'PRED6'].map((k, i) => [k, dayPlus(dnes, -i)]));
  const nacti = (j) => { let t = readFileSync(DIR + j + '.json', 'utf8'); for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`); return JSON.parse(t.replaceAll('"MESIC"', `"${mesic}"`)); };
  const dalsi = (req, json) => {
    const u = new URL(req.url()); if (req.method() !== 'GET') return undefined;
    if (u.pathname === '/api/closings') return json(nacti('k69-b5a-closings'));
    if (u.pathname === '/api/closings/calendar') return json({ ...nacti('k69-b5a-calendar'), month: u.searchParams.get('month') ?? mesic });
    if (u.pathname === '/api/closings/handover') return json(nacti('k69-b5a-handover'));
    return undefined;
  };
  const radky = (p) => p.locator('li[data-widget="nastroj"] ul.list > li');
  const nastroj = (p) => p.locator('li[data-widget="nastroj"]');
  for (const w of [1280, 390]) {
    const { ctx, p } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, fix: nacti('k69-b5a-rozlozeni-uzaverky'), dalsi });
    await otevri(p, '/employer/overview?view=reports', 'vedeni.uzaverky');
    await radky(p).first().waitFor({ timeout: 10000 });
    const vse = await radky(p).count();
    tvrdi(`B1 ${w}: seznam má 5 uzávěrek a nad ním filtry`, vse === 5 && await p.getByRole('search', { name: 'Filtry uzávěrek' }).isVisible(), String(vse));
    const hled = nastroj(p).getByRole('combobox', { name: 'Hledat v uzávěrkách' }).or(nastroj(p).getByRole('searchbox', { name: 'Hledat v uzávěrkách' })).or(nastroj(p).getByPlaceholder(/Hledat podle dne/));
    await hled.first().fill('petr novak');
    tvrdi(`B2 ${w}: hledání bez diakritiky najde „Petr Novák"`, await dokud(async () => (await radky(p).count()) === 1, 3000) && /Petr/.test(await radky(p).first().innerText()));
    tvrdi(`B2 ${w}: nad seznamem stojí „Zobrazeno 1 z 5"`, /Zobrazeno 1 z 5/.test(await nastroj(p).innerText()));
    await nastroj(p).getByRole('button', { name: 'Zrušit filtry' }).first().click();
    tvrdi(`B3 ${w}: „Zrušit filtry" vrátí všech 5`, await dokud(async () => (await radky(p).count()) === 5, 3000));

    await hled.first().fill('neexistuje');
    tvrdi(`B4 ${w}: bez shody je srozumitelný prázdný stav s tlačítkem „Zrušit filtry"`, await dokud(async () => (await nastroj(p).innerText()).includes('Žádná uzávěrka neodpovídá filtrům'), 3000));
    await nastroj(p).getByRole('button', { name: 'Zrušit filtry' }).last().click();
    await dokud(async () => (await radky(p).count()) === 5, 3000);

    // Redesign v3: stav je v panelu „Filtry" (nad seznamem jen hledání a Filtry v jedné řadě).
    tvrdi(`B4b ${w}: nad seznamem jen hledání a „Filtry" — segment stavu je až v panelu`, await nastroj(p).getByRole('tablist', { name: 'Stav uzávěrky' }).count() === 0);
    await nastroj(p).getByRole('button', { name: /^Filtry/ }).click();
    const stavTab = (jmeno) => nastroj(p).getByRole('tablist', { name: 'Stav uzávěrky' }).getByRole('tab', { name: jmeno });
    await stavTab(/^Ke schválení/).click();
    tvrdi(`B5 ${w}: stav „Ke schválení" nechá jen jednu (Petr Novák)`, await dokud(async () => (await radky(p).count()) === 1, 3000) && /Čeká na schválení/.test(await radky(p).first().innerText()));
    await stavTab('Schválené').click();
    tvrdi(`B6 ${w}: stav „Schválené" nechá čtyři`, await dokud(async () => (await radky(p).count()) === 4, 3000));
    await stavTab('Vše').click();
    await dokud(async () => (await radky(p).count()) === 5, 3000);

    const kasaTab = (jmeno) => nastroj(p).getByRole('tablist', { name: 'Rozdíl v kase' }).getByRole('tab', { name: jmeno });
    await kasaTab('Sedí').click();
    const sedi = await dokud(async () => { const n = await radky(p).count(); return n >= 1 && n < 5; }, 3000);
    const texty = (await radky(p).allInnerTexts()).join(' ');
    tvrdi(`B7 ${w}: kasa „Sedí" nechá jen uzávěrky, u kterých kasa sedí`, sedi && /Sedí/.test(texty) && !/Čeká na schválení/.test(texty), texty.replace(/\s+/g, ' ').slice(0, 200));
    await kasaTab('Manko').click();
    await dokud(async () => (await radky(p).count()) < 5, 3000);
    tvrdi(`B8 ${w}: kasa „Manko" ukáže jen záporné rozdíly`, (await radky(p).allInnerTexts()).every(x => /−|-\d/.test(x)) || (await radky(p).count()) === 0);
    await kasaTab('Vše').click();

    // Rozmezí dnů: od dne PRED3 do VCERA = 3 uzávěrky.
    await nastroj(p).getByLabel('Od dne').fill(DNY.PRED3);
    await nastroj(p).getByLabel('Do dne').fill(DNY.VCERA);
    tvrdi(`B9 ${w}: rozmezí dnů zúží na tři dny`, await dokud(async () => (await radky(p).count()) === 3, 3000), String(await radky(p).count()));

    // Řazení podle tržby: nejvyšší nahoře (505 má 15 100 Kč hotově).
    await nastroj(p).getByLabel('Řadit').selectOption('trzba');
    await nastroj(p).getByLabel('Od dne').fill(''); await nastroj(p).getByLabel('Do dne').fill('');
    await dokud(async () => (await radky(p).count()) === 5, 3000);
    const prvniRadek = (await radky(p).first().innerText()).replace(/\s+/g, ' ');
    tvrdi(`B10 ${w}: řazení podle tržby dá nahoru nejvyšší (15 100)`, /15\s?100|17\s?100/.test(prvniRadek) || /Eva/.test(prvniRadek), prvniRadek);
    const pres = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    tvrdi(`B11 ${w}: Uzávěrky bez vodorovného přetečení`, pres <= 0, String(pres));
    if (w === 390) { await nastroj(p).scrollIntoViewIfNeeded(); await p.screenshot({ path: OUT + 'uzaverky-filtry.png' }); }
    await ctx.close();
  }
}

// ===========================================================================
// C) Uzávěrky: Vše | Měsíc + MonthNav místo pásu pilulek, export podle výběru
// ===========================================================================
{
  const DNY = Object.fromEntries(['DNES', 'VCERA', 'PREDEVCIREM', 'PRED3', 'PRED4', 'PRED5', 'PRED6'].map((k, i) => [k, dayPlus(dnes, -i)]));
  const nacti = (j) => { let t = readFileSync(DIR + j + '.json', 'utf8'); for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`); return JSON.parse(t.replaceAll('"MESIC"', `"${mesic}"`)); };
  // Fixtura je z posledních dní; k ní dvě uzávěrky z předminulého měsíce, ať je co listovat
  // (pás pilulek by tu měl tři položky, MonthNav jde od nejstaršího do tohoto měsíce).
  const predminuly = (() => { const [y, m] = mesic.split('-').map(Number); const d = new Date(Date.UTC(y, m - 3, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
  const zaklad = nacti('k69-b5a-closings');
  const stare = [10, 11].map((dd, i) => ({ ...zaklad.closings[2], id: 900 + i, date: `${predminuly}-${dd}`, shift_date: `${predminuly}-${dd}`, approved: true, customers: null }));
  const seznam = { ...zaklad, closings: [...zaklad.closings, ...stare] };
  const vTomtoMesici = seznam.closings.filter(c => c.date.slice(0, 7) === mesic).length;
  const dalsi = (req, json) => {
    const u = new URL(req.url()); if (req.method() !== 'GET') return undefined;
    if (u.pathname === '/api/closings') return json(seznam);
    if (u.pathname === '/api/closings/calendar') return json({ ...nacti('k69-b5a-calendar'), month: u.searchParams.get('month') ?? mesic });
    if (u.pathname === '/api/closings/handover') return json(nacti('k69-b5a-handover'));
    return undefined;
  };
  const radky = (p) => p.locator('li[data-widget="nastroj"] ul.list > li');
  const nastroj = (p) => p.locator('li[data-widget="nastroj"]');
  for (const w of [1280, 390, 320]) {
    const { ctx, p } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, fix: nacti('k69-b5a-rozlozeni-uzaverky'), dalsi });
    await otevri(p, '/employer/overview?view=reports', 'vedeni.uzaverky');
    await radky(p).first().waitFor({ timeout: 10000 });
    tvrdi(`C1 ${w}: nad seznamem není pás pilulek měsíců (žádné .filter-pill s aria-pressed)`, await nastroj(p).locator('button.filter-pill[aria-pressed]').count() === 0);
    const obdobi = nastroj(p).getByRole('tablist', { name: 'Období' });
    tvrdi(`C1 ${w}: v hlavičce nástroje je přepínač Vše | Měsíc, výchozí Vše`, await obdobi.isVisible() && await obdobi.getByRole('tab', { name: 'Vše' }).getAttribute('aria-selected') === 'true');
    tvrdi(`C1 ${w}: Vše ukáže všech ${seznam.closings.length}`, await radky(p).count() === seznam.closings.length, String(await radky(p).count()));
    await obdobi.getByRole('tab', { name: 'Měsíc' }).click();
    const nav = nastroj(p).getByRole('group', { name: 'Měsíc' });
    tvrdi(`C2 ${w}: Měsíc ukáže MonthNav a seznam nejnovějšího měsíce v datech (${vTomtoMesici})`, await nav.isVisible() && await dokud(async () => (await radky(p).count()) === vTomtoMesici, 3000), String(await radky(p).count()));
    tvrdi(`C2 ${w}: šipka „Další měsíc" je na tomto měsíci zamčená (max = tento měsíc)`, await nav.getByRole('button', { name: 'Další měsíc' }).getAttribute('aria-disabled') === 'true');
    await nav.getByRole('button', { name: 'Předchozí měsíc' }).click();
    await nav.getByRole('button', { name: 'Předchozí měsíc' }).click();
    tvrdi(`C3 ${w}: dvě šipky zpět = předminulý měsíc se dvěma uzávěrkami`, await dokud(async () => (await radky(p).count()) === 2, 3000), String(await radky(p).count()));
    tvrdi(`C3 ${w}: na nejstarším měsíci je šipka zpět zamčená (min = nejstarší v datech)`, await nav.getByRole('button', { name: 'Předchozí měsíc' }).getAttribute('aria-disabled') === 'true');
    if (w === 1280) {
      // Export za předminulý měsíc: jméno souboru z měsíce, v CSV jen dva dny.
      await p.getByRole('button', { name: 'Další akce', exact: true }).first().click();
      const polozka = p.getByRole('menuitem', { name: 'Export CSV' });
      if (await polozka.count()) {
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), polozka.click()]);
        const jmeno = dl?.suggestedFilename() ?? '';
        tvrdi(`C4 ${w}: export po šipkách se jmenuje podle měsíce (uzaverky-${predminuly}.csv)`, jmeno === `uzaverky-${predminuly}.csv`, jmeno);
        if (dl) { const obsah = readFileSync(await dl.path(), 'utf8'); tvrdi(`C4 ${w}: v CSV jsou jen dvě uzávěrky toho měsíce (+ hlavička)`, obsah.trim().split('\n').length === 3, String(obsah.trim().split('\n').length)); }
      } else tvrdi(`C4 ${w}: menu „···" nabízí Export CSV`, false, 'položka nenalezena');
      // Zpět na Vše a hledání → export bere jen to, co je vidět.
      await obdobi.getByRole('tab', { name: 'Vše' }).click();
      await nastroj(p).getByPlaceholder(/Hledat podle dne/).first().fill('petr novak');
      await dokud(async () => (await radky(p).count()) === 1, 3000);
      await p.getByRole('button', { name: 'Další akce', exact: true }).first().click();
      const pol2 = p.getByRole('menuitem', { name: 'Export CSV' });
      if (await pol2.count()) {
        const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), pol2.click()]);
        const obsah = dl2 ? readFileSync(await dl2.path(), 'utf8') : '';
        tvrdi(`C5 ${w}: export po hledání má jen zobrazenou uzávěrku`, obsah.trim().split('\n').length === 2 && /Petr Novák/.test(obsah), obsah.slice(0, 200));
      }
      await nastroj(p).getByPlaceholder(/Hledat podle dne/).first().fill('');
    }
    // Hosté u řádku: fixtura má u části uzávěrek vyplněné zákazníky (84), u části ne.
    await obdobi.getByRole('tab', { name: 'Vše' }).click();
    await dokud(async () => (await radky(p).count()) === seznam.closings.length, 3000);
    const texty = (await radky(p).allInnerTexts()).map(x => x.replace(/\s+/g, ' '));
    tvrdi(`C6 ${w}: řádek s vyplněnými zákazníky má „84 hostů"`, texty.some(x => /84 hostů/.test(x)), texty.join(' | ').slice(0, 300));
    tvrdi(`C6 ${w}: řádek bez zákazníků „hostů" nemá`, texty.some(x => !/host/.test(x)));
    await obdobi.getByRole('tab', { name: 'Měsíc' }).click();
    const pres = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const presKarta = await nastroj(p).evaluate(el => el.scrollWidth - el.clientWidth);
    tvrdi(`C7 ${w}: hlavička s MonthNav nepřetéká (stránka ${pres}, nástroj ${presKarta})`, pres <= 0 && presKarta <= 0);
    if (w <= 390) {
      const box = await nastroj(p).getByRole('group', { name: 'Měsíc' }).boundingBox();
      // Šipka je kreslená 36 px, dotyková plocha 44 px dodá ::before z .tap-target.
      const tlac = await nastroj(p).getByRole('group', { name: 'Měsíc' }).getByRole('button').evaluateAll(bs => bs.map(b =>
        Math.round(Math.max(b.getBoundingClientRect().height, parseFloat(getComputedStyle(b, '::before').height) || 0))));
      tvrdi(`C7 ${w}: šipky MonthNav mají dotykovou plochu aspoň 44 px`, tlac.every(h => h >= 44), tlac.join(','));
      tvrdi(`C7 ${w}: MonthNav se vejde do šířky`, box && box.x >= 0 && box.x + box.width <= w, JSON.stringify(box));
      await nastroj(p).scrollIntoViewIfNeeded();
      await p.screenshot({ path: OUT + `k83-uzaverky-monthnav-${w}.png` });
    }
    await ctx.close();
  }
}
await konec();
