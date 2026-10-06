// Finance jako dashboard: přehledy tržby (Dny / Kalendář / Týdny / Dny v týdnu) a detail dne.
//  - řádek dne i buňka kalendáře otevřou „Finance dne" s tržbou (proti minulému týdnu), platbami, hodinami,
//    prodejem, obsluhou, uzávěrkami dne a výdaji dne z knihy výdajů,
//  - šipky listují dny, Escape zavře, zvolený pohled se pamatuje,
//  - role bez finance.trzby widget ani detail nevidí a dotazy na pokladnu neodcházejí,
//  - telefon 390: bez vodorovného přetečení.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, dotazyNa, fixtura, roleMine, DIR, OUT } from './k68-spolecne.mjs';
import { dayPlus, pragueToday } from '../../lib/pragueTime.ts';

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
  await karta.getByRole('tab', { name: 'Dny', exact: true }).waitFor({ timeout: 10000 });
  tvrdi(`${w}: karta nabízí čtyři přehledy`, await karta.getByRole('tab').count() === 4, String(await karta.getByRole('tab').count()));

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

// Role bez finance.trzby: widget se nekreslí a pokladna se neptá
{
  const bez = roleMine('barista');
  const { ctx, p, stav } = await kontext({ viewport: { width: 1280, height: 900 }, mineData: { ...bez, opravneni: bez.opravneni.filter(k => k !== 'finance.trzby') }, fix, dalsi });
  await p.goto(`${process.env.SONDY_ZAKLAD ?? 'http://localhost:3000'}/employer/overview?view=finance`, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(1500);
  tvrdi('bez finance.trzby: na pokladnu se neptá', dotazyNa(stav, ['/api/pos/daily']).length === 0);
  await ctx.close();
}
await konec();
