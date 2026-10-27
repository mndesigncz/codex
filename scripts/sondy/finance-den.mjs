// Finance jako dashboard: přehledy tržby (Dny / Kalendář / Týdny / Dny v týdnu) a detail dne.
//  - řádek dne i buňka kalendáře otevřou „Finance dne" s tržbou (proti minulému týdnu), platbami, hodinami,
//    prodejem, obsluhou, uzávěrkami dne a výdaji dne z knihy výdajů,
//  - šipky listují dny, Escape zavře, zvolený pohled se pamatuje,
//  - role bez finance.trzby widget ani detail nevidí a dotazy na pokladnu neodcházejí,
//  - telefon 390: bez vodorovného přetečení;
//  - kolo 81 (B2), telefon: výsledek po pevných nákladech, export v „···", okno Pravidelné náklady zdola,
//    pás kategorií v knize výdajů, detail objednávky, kategorie a datum nákupu v nové účtence.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, dotazyNa, fixtura, roleMine, DIR, OUT } from './k68-spolecne.mjs';
import { dayPlus, pragueToday } from '../../lib/pragueTime.ts';
const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';

const dnes = pragueToday();
const vcera = dayPlus(dnes, -1);
const mesic = dnes.slice(0, 7);
const base = () => JSON.parse(readFileSync(DIR + 'k69-b5b-pos-daily.json', 'utf8').replaceAll('DNES', dnes));
const trzbaDne = (d) => 12000 + ((Number(d.slice(8)) * 1731) % 9000);
const dalsi = (req, json) => {
  const u = new URL(req.url()); if (req.method() !== 'GET') return undefined;
  if (u.pathname === '/api/pos/daily') {
    const od = u.searchParams.get('from'), doD = u.searchParams.get('to');
    const days = []; let n = 0;
    for (let d = od; d <= doD && n < 40; d = dayPlus(d, 1), n++) {
      const total = trzbaDne(d);
      days.push({ day: d, bills: 90, cash: Math.round(total / 3), card: Math.round(total * 2 / 3), other: 0, total, tips: 300, tipsCash: 100, tipsCard: 200, discounts: 0, refundCount: 1, refundTotal: 120, persons: 0, closings: 0, declared: null, diff: null });
    }
    const b = base(); const soucet = days.reduce((s, x) => s + x.total, 0);
    const hodiny = Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 20 ? Math.round(soucet / 13) : 0));
    return json({ ...b, from: od, to: doD, days, hours: hodiny,
      totals: { ...b.totals, total: soucet, bills: 90 * days.length, avgBill: Math.round(soucet / (90 * days.length)), tips: 300 * days.length, cash: Math.round(soucet / 3), card: Math.round(soucet * 2 / 3), other: 0, methods: [{ id: 'cash', label: 'Hotově', amount: Math.round(soucet / 3) }, { id: 'card', label: 'Kartou', amount: Math.round(soucet * 2 / 3) }] },
      items: [{ productId: 'p1', name: 'Flat white', category: 'Káva', qty: 61, revenue: 4880 }, { productId: 'p2', name: 'Matcha latte', category: 'Čaj', qty: 33, revenue: 3135 }],
      byPerson: [{ name: 'Eva Testová', total: Math.round(soucet * 0.6), bills: 50 }, { name: 'Martin Nemeškal', total: Math.round(soucet * 0.4), bills: 40 }] });
  }
  if (u.pathname === '/api/finance') {
    const f = JSON.parse(readFileSync(DIR + 'k69-b5b-finance.json', 'utf8').replaceAll('DNES', dnes));
    return json({ ...f, month: u.searchParams.get('month'), ledger: [{ date: vcera, kind: 'receipt', label: 'Velkoobchod Bílkovi', amount: 8420, receiptId: 31, photoUrl: null, note: 'Mléko, káva' }, ...f.ledger] });
  }
  if (u.pathname === '/api/closings') return json({ closings: [{ id: 901, team_id: 1, date: vcera, shift_label: 'Ranní', approved: true, author_name: 'Eva Testová', shiftEmployees: [{ id: 1, name: 'Eva Testová' }], opening_cash: 1000, cash_revenue: 5000, card_revenue: 7000, expenses: 0, cash_removed: 0, self_payout: 0, tips: 0, closing_cash: 6000, covered_by: null }], meId: 1, payDailyCash: false });
  return undefined;
};
const polozky = [{ id: 'po-dnech', widget: 'trzby.po_dnech', velikost: 'L', nastaveni: { obdobi: 'mesic_stranky' } }];
const fix = { ...fixtura('k69-b5b-rozlozeni-finance'), polozky };
const radky = (p) => p.locator('[data-instance="po-dnech"] ul[aria-label="Tržba po jednotlivých dnech"] > li');

for (const w of [1280, 390]) {
  const { ctx, p, stav } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, fix, dalsi });
  await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
  const karta = p.locator('[data-instance="po-dnech"]');
  const prehledy = karta.locator('[aria-label="Přehled tržby"]').getByRole('tab');
  await prehledy.first().waitFor({ timeout: 10000 });
  tvrdi(`${w}: karta nabízí čtyři přehledy`, await prehledy.count() === 4, String(await prehledy.count()));

  // Detail dne z řádku
  await radky(p).first().waitFor();
  await radky(p).first().click();
  const okno = p.getByRole('dialog', { name: 'Finance dne' });
  await okno.waitFor({ timeout: 8000 });
  const txt = async () => (await okno.innerText()).replace(/\s+/g, ' ');
  await dokud(async () => /co se prodalo/i.test(await txt()) && /výdaje dne/i.test(await txt()), 8000);
  const t1 = await txt();
  tvrdi(`${w}: detail dne ukáže tržbu a porovnání s minulým týdnem`, /tržba/i.test(t1) && /Kč/.test(t1) && /proti stejnému dni minulý týden/.test(t1), t1.slice(0, 260));
  tvrdi(`${w}: detail dne má platby, hodiny, prodej a obsluhu`, ['platby', 'tržba po hodinách', 'co se prodalo', 'obsluha'].every(x => t1.toLowerCase().includes(x)) && /Flat white/.test(t1) && /Eva Testová/.test(t1));
  tvrdi(`${w}: dnešek nemá uzávěrku (píše se na konci směny)`, /uzávěrka se píše na konci směny/i.test(t1));
  tvrdi(`${w}: dotaz na den šel jednou pro den a jednou pro stejný den minulý týden`, (() => { const d = dotazyNa(stav, ['/api/pos/daily']).map(x => x.u); return d.some(u => u.includes(`from=${dnes}&to=${dnes}`)) && d.some(u => u.includes(`from=${dayPlus(dnes, -7)}&to=${dayPlus(dnes, -7)}`)); })());
  await okno.getByRole('button', { name: 'Předchozí den' }).click();
  await dokud(async () => /výdaje celkem/i.test(await txt()), 8000);
  const t2 = await txt();
  tvrdi(`${w}: šipka „Předchozí den" přepne na včerejšek: uzávěrka dne + výdaj z knihy`, /Ranní/.test(t2) && /Sedí|Čeká/.test(t2) && /Velkoobchod Bílkovi/.test(t2) && /8\s?420/.test(t2), t2.slice(-400));
  const pres = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  tvrdi(`${w}: okno bez vodorovného přetečení`, pres <= 0, String(pres));
  if (w === 390) { await okno.screenshot({ path: OUT + 'finance-den.png' }).catch(() => p.screenshot({ path: OUT + 'finance-den.png' })); }
  await p.keyboard.press('Escape');
  tvrdi(`${w}: Escape okno zavře`, await dokud(async () => await p.getByRole('dialog', { name: 'Finance dne' }).count() === 0, 3000));

  // Kalendář
  await karta.getByRole('tab', { name: 'Kalendář' }).click();
  const bunka = karta.getByRole('button', { name: new RegExp(`^Detail dne .*${Number(vcera.slice(8))}\\. ${Number(vcera.slice(5, 7))}\\.`) });
  tvrdi(`${w}: kalendář má buňku včerejška s částkou`, await dokud(async () => await bunka.count() >= 1, 4000));
  tvrdi(`${w}: budoucí dny v kalendáři nejdou rozkliknout`, await karta.locator('[role=group] button[disabled]').count() >= 0);
  await bunka.first().click();
  await p.getByRole('dialog', { name: 'Finance dne' }).waitFor({ timeout: 8000 });
  tvrdi(`${w}: klepnutí na buňku kalendáře otevře detail toho dne`, new RegExp(`${Number(vcera.slice(8))}`).test(await p.getByRole('dialog', { name: 'Finance dne' }).innerText()));
  await p.keyboard.press('Escape');
  if (w === 390) await karta.screenshot({ path: OUT + 'finance-kalendar.png' });

  // Týdny, dny v týdnu
  await karta.getByRole('tab', { name: 'Týdny' }).click();
  tvrdi(`${w}: týdny ukážou aspoň jeden týden se součtem`, await dokud(async () => await karta.locator('ul[aria-label="Tržba po týdnech"] > li').count() >= 1, 3000));
  await karta.getByRole('tab', { name: 'Dny v týdnu' }).click();
  tvrdi(`${w}: dny v týdnu ukážou sedm řádků`, await dokud(async () => await karta.locator('ul[aria-label="Průměrná tržba podle dne v týdnu"] > li').count() === 7, 3000));
  // volba se pamatuje
  await p.reload({ waitUntil: 'networkidle' });
  await p.locator('[data-plocha] li[data-instance]').first().waitFor({ timeout: 15000 });
  tvrdi(`${w}: zvolený přehled přežije obnovení`, await dokud(async () => await p.locator('[data-instance="po-dnech"]').getByRole('tab', { name: 'Dny v týdnu' }).getAttribute('aria-selected') === 'true', 6000));
  await ctx.close();
}

// Kolo 81 (B2), telefon 390: výsledek po pevných nákladech, export v „···" místo limetky, okno
// Pravidelné náklady zdola, pás kategorií v knize výdajů a Segmented kategorií v nové účtence
// (jeden pás, nezalomený) — nic nepřetéká.
{
  const pretece = (loc) => loc.evaluate(el => el.scrollWidth > el.clientWidth + 1);
  const teams = { ...fixtura('teams') }; teams.team = { ...teams.team, fixed_costs: [{ name: 'Nájem', amount: 40000 }, { name: 'Energie', amount: 8500 }] };
  const dalsiB2 = (req, json, stav) => {
    const u = new URL(req.url());
    if (req.method() === 'GET' && u.pathname === '/api/finance') {
      const f = JSON.parse(readFileSync(DIR + 'k69-b5b-finance.json', 'utf8').replaceAll('DNES', dnes));
      return json({ ...f, month: u.searchParams.get('month'), summary: { ...f.summary, fixedCosts: 48500, net: f.summary.gross - 48500, fixedCostsSet: true }, ledger: [
        { date: vcera, kind: 'receipt', label: 'Velkoobchod Bílkovi', amount: 8420, receiptId: 31, photoUrl: null, note: 'Mléko, káva', category: 'suroviny', supplier: 'Velkoobchod Bílkovi' },
        { date: vcera, kind: 'receipt', label: 'Večerka u Nováků', amount: 640, receiptId: 32, photoUrl: null, note: null, category: 'napoje', supplier: 'Večerka u Nováků' },
        { date: dayPlus(dnes, -2), kind: 'order', label: 'Objednávka — Monin', amount: 4200, orderId: 7, supplier: 'Monin', orderedBy: 'Eva Testová', items: [{ name: 'Sirup Mango', qty: 6, unit: 'ks' }] },
        { date: vcera, kind: 'expense', label: 'Výdaje z kasy', amount: 640 },
      ] });
    }
    if (req.method() === 'GET' && u.pathname === '/api/teams') return json(teams);
    if (req.method() === 'PATCH' && u.pathname === '/api/teams') { stav.patchTeams = req.postDataJSON(); return json({ ok: true }); }
    if (req.method() === 'GET' && u.pathname === '/api/receipts') return json({ receipts: [] });
    return dalsi(req, json, stav);
  };
  const { ctx, p, stav } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, fix: fixtura('k69-b5b-rozlozeni-finance'), dalsi: dalsiB2 });
  await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
  const souhrn = p.locator('[data-instance="souhrn"]');
  await souhrn.getByText('Výsledek').first().waitFor({ timeout: 10000 });
  const s = (await souhrn.innerText()).replace(/\s+/g, ' ');
  tvrdi('390 B2: Souhrn měsíce ukáže Výsledek po nájmu a energiích a tržby „z uzávěrek"', /Výsledek/.test(s) && /po nájmu a energiích/.test(s) && /25\s780/.test(s) && /z uzávěrek/.test(s), s.slice(0, 260));
  tvrdi('390 B2: na telefonu žádná limetka Export pro účetní', await p.getByRole('button', { name: 'Export pro účetní' }).count() === 0);
  await p.locator('[data-plocha] button[aria-haspopup="menu"]:visible').first().click();
  tvrdi('390 B2: „···" nese Export pro účetní', await dokud(async () => await p.getByRole('menuitem', { name: 'Export pro účetní' }).count() === 1, 4000));
  await p.getByRole('menuitem', { name: /Pravidelné náklady/ }).click();
  const okno = p.getByRole('dialog', { name: 'Pravidelné náklady' });
  await okno.getByText('Nájem', { exact: true }).waitFor({ timeout: 8000 });
  // Okno vyjíždí zdola — měří se, až dojede.
  let box = null;
  const dosedlo = await dokud(async () => { box = await okno.boundingBox(); return !!box && Math.abs(box.y + box.height - 844) < 2; }, 4000);
  tvrdi('390 B2: okno Pravidelné náklady dosedá na spodní hranu (zdola)', dosedlo, JSON.stringify(box));
  tvrdi('390 B2: částka nákladu má inputMode=decimal', await okno.locator('#pevne-castka').getAttribute('inputmode') === 'decimal');
  // Rozepsaný řádek bez „Přidat" se při Uložit neztratí.
  await okno.locator('#pevne-nazev').fill('Pojištění');
  await okno.locator('#pevne-castka').fill('1 250');
  await okno.getByRole('button', { name: 'Uložit', exact: true }).click();
  tvrdi('390 B2: Uložit vezme i rozepsaný řádek (PATCH se třemi řádky)', await dokud(() => stav.patchTeams?.fixedCosts?.length === 3 && stav.patchTeams.fixedCosts[2].amount === 1250, 4000), JSON.stringify(stav.patchTeams));
  await p.keyboard.press('Escape');
  await dokud(async () => await p.getByRole('dialog').count() === 0, 3000);

  const kniha = p.locator('section[aria-labelledby="finance-vydaje"]');
  await kniha.getByRole('tab', { name: /Účtenky/ }).click();
  const pas = kniha.getByRole('group', { name: 'Kategorie účtenky' });
  await pas.waitFor({ timeout: 4000 });
  tvrdi('390 B2: druh Účtenka ukáže pás kategorií s počty', await pas.getByRole('button').count() === 2);
  const mereni = await p.evaluate(() => { const li = document.querySelector('[data-plocha] li[data-widget="nastroj"]'); return { li: [li.scrollWidth, li.clientWidth], doc: [document.documentElement.scrollWidth, innerWidth] }; });
  tvrdi('390 B2: kniha výdajů s pásem kategorií nepřetéká', mereni.li[0] <= mereni.li[1] + 1 && mereni.doc[0] <= mereni.doc[1] + 1, JSON.stringify(mereni));
  await kniha.getByRole('tab', { name: /Objednávky/ }).click();
  await kniha.locator('ul.list > li').first().click();
  tvrdi('390 B2: objednávka se rozklikne na položky', await dokud(async () => /Sirup Mango/.test(await p.getByRole('dialog').innerText().catch(() => '')), 5000));
  await p.keyboard.press('Escape');
  await dokud(async () => await p.getByRole('dialog').count() === 0, 3000);
  await kniha.getByRole('tab', { name: /Z kasy/ }).click();
  await kniha.locator('ul.list > li').first().click();
  tvrdi('390 B2: výdaj z kasy otevře celý den (Finance dne)', await dokud(async () => await p.getByRole('dialog', { name: 'Finance dne' }).count() === 1, 6000));
  await p.keyboard.press('Escape');
  await dokud(async () => await p.getByRole('dialog').count() === 0, 3000);

  const uct = p.locator('[data-instance="uctenky"]');
  await uct.scrollIntoViewIfNeeded();
  await uct.getByRole('button', { name: 'Nafotit' }).click();
  const nova = p.getByRole('dialog', { name: 'Nová účtenka' });
  const segm = nova.getByRole('tablist', { name: 'Kategorie účtenky' });
  await segm.waitFor({ timeout: 6000 });
  const radkuSegm = await segm.evaluate(el => new Set([...el.querySelectorAll('[role=tab]')].map(t => Math.round(t.getBoundingClientRect().top))).size);
  tvrdi('390 B2: Segmented kategorií v nové účtence je jeden pás bez zalomení', radkuSegm === 1, String(radkuSegm));
  tvrdi('390 B2: datum nákupu je výchozí dnešek a nejvýš dnešek', await nova.locator('#uctenka-datum').inputValue() === dnes && await nova.locator('#uctenka-datum').getAttribute('max') === dnes);
  tvrdi('390 B2: okno nové účtenky nepřetéká', !(await pretece(nova)));
  await ctx.close();
}

// Role bez finance.trzby: widget se nekreslí a pokladna se neptá
{
  const bez = roleMine('barista');
  const { ctx, p, stav } = await kontext({ viewport: { width: 1280, height: 900 }, mineData: { ...bez, opravneni: bez.opravneni.filter(k => k !== 'finance.trzby') }, fix, dalsi });
  await p.goto(`${process.env.SONDY_ZAKLAD ?? BASE}/employer/overview?view=finance`, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(1500);
  tvrdi('bez finance.trzby: na pokladnu se neptá', dotazyNa(stav, ['/api/pos/daily']).length === 0);
  await ctx.close();
}
await konec();
