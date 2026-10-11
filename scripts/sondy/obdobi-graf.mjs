// Tržba po dnech jako analytický graf: lišta období (rychlé volby, od–do, dny v týdnu, hrubost grafu),
// graf s porovnáním s předchozím obdobím, rozklik dne a přiblížení týdne/měsíce.
//  - výchozí období je měsíc z přepínače Financí, graf má sloupec za každý den a dotaz jde přes lite=1,
//  - „Rok" přepne graf na měsíce (dotaz na 365 dní), „7 dní" na sedm sloupců,
//  - filtr Pracovní dny vyhodí víkendy z grafu a zapíše se do popisku období,
//  - „Vlastní" ukáže od–do a rozmezí se dotáže přesně na zadané dny,
//  - porovnání pošle druhý dotaz na předchozí stejně dlouhé období a ukáže změnu v %,
//  - klepnutí na sloupec dne otevře detail dne; na sloupec měsíce přiblíží na jeho rozmezí,
//  - volba období přežije obnovení; telefon 390 bez vodorovného přetečení.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, dotazyNa, fixtura, DIR, OUT } from './k68-spolecne.mjs';
import { dayPlus, pragueToday } from '../../lib/pragueTime.ts';

const dnes = pragueToday();
const base = () => JSON.parse(readFileSync(DIR + 'k69-b5b-pos-daily.json', 'utf8').replaceAll('DNES', dnes));
const trzbaDne = (d) => 12000 + ((Number(d.slice(8)) * 1731) % 9000);
const dalsi = (req, json) => {
  const u = new URL(req.url()); if (req.method() !== 'GET') return undefined;
  if (u.pathname === '/api/pos/daily') {
    const od = u.searchParams.get('from'), doD = u.searchParams.get('to');
    const days = []; let n = 0;
    for (let d = od; d <= doD && n < 800; d = dayPlus(d, 1), n++) {
      const total = trzbaDne(d);
      days.push({ day: d, bills: 90, cash: Math.round(total / 3), card: Math.round(total * 2 / 3), other: 0, total, tips: 300, tipsCash: 100, tipsCard: 200, discounts: 0, refundCount: 0, refundTotal: 0, persons: 0, closings: 0, declared: null, diff: null });
    }
    const b = base(); const soucet = days.reduce((s, x) => s + x.total, 0);
    return json({ ...b, from: od, to: doD, days, hours: Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 20 ? Math.round(soucet / 13) : 0)), open: b.open ?? { pocet: 0, soucet: 0, ucty: [], nejstarsi: null },
      totals: { ...b.totals, total: soucet, bills: 90 * days.length, avgBill: Math.round(soucet / (90 * days.length || 1)), tips: 300 * days.length, cash: Math.round(soucet / 3), card: Math.round(soucet * 2 / 3), other: 0, methods: [] },
      items: [], byPerson: [] });
  }
  if (u.pathname === '/api/finance') { const f = JSON.parse(readFileSync(DIR + 'k69-b5b-finance.json', 'utf8').replaceAll('DNES', dnes)); return json({ ...f, month: u.searchParams.get('month') }); }
  if (u.pathname === '/api/closings') return json({ closings: [], meId: 1, payDailyCash: false });
  return undefined;
};
const polozky = [{ id: 'po-dnech', widget: 'trzby.po_dnech', velikost: 'L', nastaveni: { obdobi: 'mesic_stranky' } }];
const fix = { ...fixtura('k69-b5b-rozlozeni-finance'), polozky };

for (const w of [1280, 390]) {
  const { ctx, p, stav } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, fix, dalsi });
  await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
  const karta = p.locator('[data-instance="po-dnech"]');
  const lista = karta.getByRole('group', { name: 'Období', exact: true });
  await lista.waitFor({ timeout: 12000 });
  const okno = p.getByRole('dialog', { name: 'Období' });
  const otevriOkno = async () => { if (!(await okno.isVisible())) { await lista.getByRole('button').first().click(); await okno.waitFor({ timeout: 4000 }); } };
  const zavriOkno = async () => { if (await okno.isVisible()) { await okno.getByRole('button', { name: 'Hotovo' }).click(); await okno.waitFor({ state: 'hidden', timeout: 4000 }); } };
  /** Zvolí hotovou volbu: okno se po ní samo zavře. */
  const volba = async (nazev) => { await otevriOkno(); await okno.getByRole('button', { name: nazev, exact: true }).click(); await okno.waitFor({ state: 'hidden', timeout: 4000 }); };
  const graf = karta.locator('[role=group][aria-label^="Tržba po dnech"]');
  const sloupce = graf.locator('button');
  const pocet = async () => sloupce.count();
  await sloupce.first().waitFor({ timeout: 8000 });

  const dnuMesice = Number(dnes.slice(8)); // měsíc ze stránky = od prvního do dneška (budoucí dny tržbu nemají)
  tvrdi(`${w}: na ploše je jediné tlačítko období (žádná řada přepínačů)`, await lista.getByRole('button').count() === 1 && await lista.getByRole('tab').count() === 0);
  await otevriOkno();
  tvrdi(`${w}: okno období nabízí hotové volby a vlastní od–do`, (await Promise.all(['Dnes', 'Posledních 7 dní', 'Posledních 30 dní', 'Tento měsíc', 'Minulý měsíc', '3 měsíce', '6 měsíců', 'Rok'].map(x => okno.getByRole('button', { name: x, exact: true }).count()))).every(n => n === 1) && await okno.getByLabel('Od dne').count() === 1);
  tvrdi(`${w}: dny v týdnu a hrubost grafu jsou schované pod „Upřesnit"`, await okno.getByRole('button', { name: 'Pracovní dny' }).count() === 0 && await okno.getByRole('button', { name: /^Upřesnit/ }).count() === 1);
  await zavriOkno();
  tvrdi(`${w}: výchozí je měsíc ze stránky: sloupec za každý den do dneška`, await pocet() === dnuMesice, `${await pocet()} vs ${dnuMesice}`);
  tvrdi(`${w}: dotaz jde odlehčeně (lite=1)`, dotazyNa(stav, ['/api/pos/daily']).some(x => x.u.includes('lite=1')));
  tvrdi(`${w}: ukáže tržbu za období a průměr`, /Tržba za období/i.test(await karta.innerText()) && /průměr/i.test(await karta.innerText()));

  // 7 dní
  await volba('Posledních 7 dní');
  tvrdi(`${w}: „7 dní" dá sedm sloupců`, await dokud(async () => await pocet() === 7, 4000), String(await pocet()));
  tvrdi(`${w}: „7 dní" se dotáže přesně na týden`, await dokud(async () => dotazyNa(stav, ['/api/pos/daily']).some(x => x.u.includes(`from=${dayPlus(dnes, -6)}&to=${dnes}`)), 4000));

  // Dny v týdnu
  await otevriOkno();
  await okno.getByRole('button', { name: /^Upřesnit/ }).click();
  await okno.getByRole('button', { name: 'Pracovní dny' }).click();
  await zavriOkno();
  tvrdi(`${w}: filtr Pracovní dny vyhodí víkendy z grafu (≤5 sloupců)`, await dokud(async () => { const n = await pocet(); return n >= 3 && n <= 5; }, 4000), String(await pocet()));
  tvrdi(`${w}: popisek období zapíše vybrané dny`, /po, út, st, čt, pá/i.test(await lista.innerText()), (await lista.innerText()).slice(0, 200));
  await otevriOkno();
  await okno.getByRole('button', { name: 'Všechny dny' }).click();
  await zavriOkno();
  tvrdi(`${w}: „Všechny dny" vrátí sedm sloupců`, await dokud(async () => await pocet() === 7, 4000));

  // Rok → měsíce
  await volba('Rok');
  tvrdi(`${w}: „Rok" přepne graf na měsíce (≤13 sloupců)`, await dokud(async () => { const n = await pocet(); return n >= 12 && n <= 13; }, 5000), String(await pocet()));
  tvrdi(`${w}: „Rok" se dotáže na 365 dní`, dotazyNa(stav, ['/api/pos/daily']).some(x => x.u.includes(`from=${dayPlus(dnes, -364)}&to=${dnes}`)));
  // Měsíc → přiblížení na jeho rozmezí
  await sloupce.nth((await pocet()) - 2).click();
  tvrdi(`${w}: klepnutí na měsíc přiblíží na jeho dny (graf po dnech)`, await dokud(async () => { const n = await pocet(); return n >= 28 && n <= 31; }, 5000), String(await pocet()));
  tvrdi(`${w}: po přiblížení tlačítko ukazuje jen rozmezí (vlastní období)`, await dokud(async () => !/Rok|Posledních/.test(await lista.innerText()), 3000), await lista.innerText());

  // Vlastní rozmezí
  const od = dayPlus(dnes, -20), doD = dayPlus(dnes, -10);
  await otevriOkno();
  await okno.getByLabel('Od dne').fill(od);
  await okno.getByLabel('Do dne').fill(doD);
  await zavriOkno();
  tvrdi(`${w}: vlastní rozmezí se dotáže přesně na zadané dny`, await dokud(async () => dotazyNa(stav, ['/api/pos/daily']).some(x => x.u.includes(`from=${od}&to=${doD}`)), 4000));
  tvrdi(`${w}: vlastní rozmezí má sloupec za každý den (11)`, await dokud(async () => await pocet() === 11, 4000), String(await pocet()));

  // Porovnání je zapnuté samo (číslo bez srovnání nic neříká); vypíná se v okně období.
  tvrdi(`${w}: porovnání s předchozím obdobím je ve výchozím stavu zapnuté`, await dokud(async () => dotazyNa(stav, ['/api/pos/daily']).some(x => x.u.includes(`from=${dayPlus(od, -11)}&to=${dayPlus(od, -1)}`)), 5000));
  tvrdi(`${w}: ukáže změnu proti předchozím dnům`, await dokud(async () => /proti předchozím 11 dnům/.test(await karta.innerText()), 5000));
  await otevriOkno();
  await okno.getByRole('switch', { name: 'Porovnat s předchozím obdobím' }).click();
  await zavriOkno();
  tvrdi(`${w}: vypnuté porovnání schová změnu`, await dokud(async () => !/proti předchozím 11 dnům/.test(await karta.innerText()), 4000));

  // Rozklik dne
  await sloupce.nth(3).click();
  tvrdi(`${w}: klepnutí na den otevře Finance dne`, await p.getByRole('dialog', { name: 'Finance dne' }).waitFor({ timeout: 8000 }).then(() => true, () => false));
  await p.keyboard.press('Escape');

  const pres = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  tvrdi(`${w}: bez vodorovného přetečení`, pres <= 0, String(pres));
  if (w === 390 || w === 1280) await karta.screenshot({ path: OUT + `obdobi-graf-${w}.png` });

  // Volba přežije obnovení
  await p.reload({ waitUntil: 'networkidle' });
  await p.locator('[data-plocha] li[data-instance]').first().waitFor({ timeout: 15000 });
  const kratceOd = `${Number(od.slice(8))}. ${Number(od.slice(5, 7))}.`;
  tvrdi(`${w}: zvolené rozmezí přežije obnovení`, await dokud(async () => (await p.locator('[data-instance="po-dnech"] [role=group][aria-label="Období"]').innerText().catch(() => '')).includes(kratceOd), 6000));
  await ctx.close();
}
await konec();
