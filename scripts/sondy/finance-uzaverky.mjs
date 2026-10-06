// Finance a Uzávěrky — „jaký den jaká tržba" a filtry uzávěrek.
//  A) Finance (výchozí rozložení z kódu): jen podstatné widgety, Tržba po dnech jde za měsíc z hlavičky
//     (celý minulý měsíc po přepnutí), seznam dnů je nejnovější nahoře a rozbalí se.
//  B) Uzávěrky: hledání bez diakritiky, stav, kasa, směna, rozmezí dnů, řazení, „Zrušit filtry", prázdný výsledek,
//     telefon 390 bez přetečení.
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

    await nastroj(p).getByRole('tab', { name: /^Ke schválení/ }).click();
    tvrdi(`B5 ${w}: stav „Ke schválení" nechá jen jednu (Petr Novák)`, await dokud(async () => (await radky(p).count()) === 1, 3000) && /Čeká na schválení/.test(await radky(p).first().innerText()));
    await nastroj(p).getByRole('tab', { name: 'Schválené' }).click();
    tvrdi(`B6 ${w}: stav „Schválené" nechá čtyři`, await dokud(async () => (await radky(p).count()) === 4, 3000));
    await nastroj(p).getByRole('tab', { name: 'Vše' }).first().click();
    await dokud(async () => (await radky(p).count()) === 5, 3000);

    await nastroj(p).getByRole('button', { name: /^Filtry/ }).click();
    await nastroj(p).getByRole('tab', { name: 'Sedí' }).click();
    const sedi = await dokud(async () => { const n = await radky(p).count(); return n >= 1 && n < 5; }, 3000);
    const texty = (await radky(p).allInnerTexts()).join(' ');
    tvrdi(`B7 ${w}: kasa „Sedí" nechá jen uzávěrky, u kterých kasa sedí`, sedi && /Sedí/.test(texty) && !/Čeká na schválení/.test(texty), texty.replace(/\s+/g, ' ').slice(0, 200));
    await nastroj(p).getByRole('tab', { name: 'Manko' }).click();
    await dokud(async () => (await radky(p).count()) < 5, 3000);
    tvrdi(`B8 ${w}: kasa „Manko" ukáže jen záporné rozdíly`, (await radky(p).allInnerTexts()).every(x => /−|-\d/.test(x)) || (await radky(p).count()) === 0);
    await nastroj(p).getByRole('tab', { name: 'Vše' }).last().click();

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
await konec();
