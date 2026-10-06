// Rozklik dne napříč aplikací + otevřené účty + poloha tlačítka Sbalit.
//  1) widget Otevřené účty (Finance): kolik je nezaplaceno, stoly, „dlouho otevřený"; bez finance.trzby se nekreslí,
//  2) Uzávěrky: „Celý den" u řádku i v detailu uzávěrky otevře detail dne s uzávěrkami nahoře,
//  3) zaměstnanec s náhledem rozvrhu: štítek dne v „Kdo má směnu" otevře „Den v podniku" jen se směnami (bez financí),
//  4) tlačítko Sbalit stojí vždy úplně vpravo v hlavičce karty, ať má karta odkaz („Finance ›"), nebo ne.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, dotazyNa, fixtura, roleMine, DIR, OUT } from './k68-spolecne.mjs';
import { dayPlus, pragueToday } from '../../lib/pragueTime.ts';

const dnes = pragueToday();
const mesic = dnes.slice(0, 7);
const pred3h = new Date(Date.now() - 3 * 3600_000).toISOString();
const pred20m = new Date(Date.now() - 20 * 60_000).toISOString();

const posDaily = (od, doD) => {
  const b = JSON.parse(readFileSync(DIR + 'k69-b5b-pos-daily.json', 'utf8').replaceAll('DNES', dnes));
  const days = []; let n = 0;
  for (let d = od; d <= doD && n < 40; d = dayPlus(d, 1), n++) { const total = 12000 + ((Number(d.slice(8)) * 1731) % 9000); days.push({ day: d, bills: 90, cash: Math.round(total / 3), card: Math.round(total * 2 / 3), other: 0, total, tips: 300, tipsCash: 100, tipsCard: 200, discounts: 0, refundCount: 0, refundTotal: 0, closings: 0, declared: null, diff: null }); }
  const open = od <= dnes && dnes <= doD ? {
    count: 2, total: 1350, oldestSince: pred3h, byDay: { [dnes]: { count: 2, total: 1350 } },
    items: [{ id: 'o1', desk: '7', since: pred3h, total: 900, persons: 3, who: 'Eva Testová', day: dnes }, { id: 'o2', desk: null, since: pred20m, total: 450, persons: null, who: 'Martin Nemeškal', day: dnes }],
  } : { count: 0, total: 0, oldestSince: null, byDay: {}, items: [] };
  return { ...b, from: od, to: doD, days, open, totals: { ...b.totals, total: days.reduce((s, x) => s + x.total, 0), avgBill: 200, methods: [] } };
};
const DNY = Object.fromEntries(['DNES', 'VCERA', 'PREDEVCIREM', 'PRED3', 'PRED4', 'PRED5', 'PRED6'].map((k, i) => [k, dayPlus(dnes, -i)]));
const nacti = (j) => { let t = readFileSync(DIR + j + '.json', 'utf8'); for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`); return JSON.parse(t.replaceAll('"MESIC"', `"${mesic}"`)); };

const dalsi = (req, json) => {
  const u = new URL(req.url()); if (req.method() !== 'GET') return undefined;
  const q = u.searchParams;
  if (u.pathname === '/api/pos/daily') return json(posDaily(q.get('from'), q.get('to')));
  if (u.pathname === '/api/finance') return json({ ...JSON.parse(readFileSync(DIR + 'k69-b5b-finance.json', 'utf8').replaceAll('DNES', dnes)), month: q.get('month') });
  if (u.pathname === '/api/closings') return json(nacti('k69-b5a-closings'));
  if (u.pathname === '/api/closings/calendar') return json({ ...nacti('k69-b5a-calendar'), month: q.get('month') ?? mesic });
  if (u.pathname === '/api/closings/handover') return json(nacti('k69-b5a-handover'));
  if (/^\/api\/closings\/\d+$/.test(u.pathname)) return json(nacti('k69-b5a-closing-detail'));
  if (u.pathname === '/api/shifts' && q.get('team') === '1') {
    const sm = (id, jm, od, d, x = {}) => ({ id, employeeId: id, employeeName: jm, employeeAvatar: '🙂', date: dnes, startTime: od, endTime: d, type: 'custom', isMine: false, ...x });
    return json({ enabled: true, shifts: [sm(1, 'Anna Kolegová', '08:00', '16:00'), sm(2, 'Já', '12:00', '20:00', { isMine: true })] });
  }
  return undefined;
};

// 1) Otevřené účty
for (const w of [1280, 390]) {
  const fix = { ...fixtura('k69-b5b-rozlozeni-finance'), polozky: [{ id: 'otevrene', widget: 'trzby.otevrene', velikost: 'M' }, { id: 'souhrn', widget: 'finance.souhrn_mesice', velikost: 'M' }] };
  const { ctx, p, stav } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, fix, dalsi });
  await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
  const karta = p.locator('[data-instance="otevrene"]');
  await dokud(async () => /nezaplaceno/i.test(await karta.innerText()), 8000);
  const t = (await karta.innerText()).replace(/\s+/g, ' ');
  tvrdi(`1 ${w}: Otevřené účty ukážou součet 1 350 a dva účty`, /1\s?350/.test(t) && /2 otevřené účty/.test(t), t.slice(0, 260));
  tvrdi(`1 ${w}: stůl 7 a účet bez stolu, hosté a obsluha`, /Stůl 7/.test(t) && /Bez stolu/.test(t) && /Eva Testová/.test(t) && /3 hosté/.test(t), t);
  tvrdi(`1 ${w}: tříhodinový účet je „dlouho otevřený", dvacetiminutový ne`, (t.match(/dlouho otevřený/g) ?? []).length === 1, t);
  // 4) poloha Sbalit: u karty bez odkazu i s odkazem na stejném svislém řezu (pravý okraj karty)
  const hrana = async (id) => p.evaluate((i) => {
    const li = document.querySelector(`[data-instance="${i}"]`);
    const card = li?.querySelector('section');
    const b = [...(li?.querySelectorAll('button') ?? [])].find(x => /widget$/.test(x.getAttribute('aria-label') ?? ''));
    if (!card || !b) return null;
    const c = card.getBoundingClientRect(), r = b.getBoundingClientRect();
    return { odOkraje: Math.round(c.right - r.right), vyska: Math.round(r.top - c.top) };
  }, id);
  const a = await hrana('otevrene'), bb = await hrana('souhrn');
  tvrdi(`4 ${w}: Sbalit je u obou karet stejně daleko od pravého okraje`, !!a && !!bb && Math.abs(a.odOkraje - bb.odOkraje) <= 1, JSON.stringify({ a, bb }));
  tvrdi(`4 ${w}: a ve stejné výšce hlavičky`, !!a && !!bb && Math.abs(a.vyska - bb.vyska) <= 2, JSON.stringify({ a, bb }));
  if (w === 390) await p.screenshot({ path: OUT + 'den-otevrene.png' });
  await ctx.close();
}
{
  const bez = roleMine('barista');
  const fix = { ...fixtura('k69-b5b-rozlozeni-finance'), polozky: [{ id: 'otevrene', widget: 'trzby.otevrene', velikost: 'M' }] };
  const { ctx, p, stav } = await kontext({ viewport: { width: 1280, height: 900 }, mineData: { ...bez, opravneni: bez.opravneni.filter(k => k !== 'finance.trzby') }, fix, dalsi });
  await p.goto(`${process.env.SONDY_ZAKLAD ?? 'http://localhost:3000'}/employer/overview?view=finance`, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(1500);
  tvrdi('1: bez finance.trzby se pokladna neptá', dotazyNa(stav, ['/api/pos/daily']).length === 0);
  await ctx.close();
}

// 2) Uzávěrky: rozklik dne
for (const w of [1280, 390]) {
  const { ctx, p } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, fix: nacti('k69-b5a-rozlozeni-uzaverky'), dalsi });
  await otevri(p, '/employer/overview?view=reports', 'vedeni.uzaverky');
  const nastroj = p.locator('li[data-widget="nastroj"]');
  await nastroj.locator('ul.list > li').first().waitFor({ timeout: 10000 });
  await nastroj.getByRole('button', { name: /^Celý den/ }).first().click();
  const okno = p.getByRole('dialog', { name: 'Uzávěrky dne' }).first();
  await okno.waitFor({ timeout: 8000 });
  await dokud(async () => /tržba/i.test(await okno.innerText()), 8000);
  const t = (await okno.innerText()).replace(/\s+/g, ' ');
  tvrdi(`2 ${w}: z řádku Uzávěrek se otevře „Uzávěrky dne"`, /uzávěrky dne/i.test(t), t.slice(0, 200));
  tvrdi(`2 ${w}: uzávěrky dne jsou NAD tržbou (z Uzávěrek je to první)`, t.toLowerCase().search(/ranní|8:00/) !== -1 && t.toLowerCase().indexOf('uzávěrky dne', 20) < t.toLowerCase().indexOf('tržba', 20), t.slice(0, 400));
  tvrdi(`2 ${w}: nad dnešní tržbou stojí otevřené účty a nikoli „Otevřít Uzávěrky"`, !/Otevřít Uzávěrky/.test(t));
  const pres = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  tvrdi(`2 ${w}: bez vodorovného přetečení`, pres <= 0, String(pres));
  if (w === 390) await p.screenshot({ path: OUT + 'den-uzaverky.png' });
  await p.keyboard.press('Escape');
  await dokud(async () => await p.getByRole('dialog', { name: 'Uzávěrky dne' }).count() === 0, 3000);
  // z detailu uzávěrky
  await nastroj.locator('ul.list > li').first().locator('button').first().click();
  await p.getByRole('button', { name: 'Celý den', exact: true }).first().click();
  tvrdi(`2 ${w}: „Celý den" z detailu uzávěrky otevře den`, await dokud(async () => await p.getByRole('dialog', { name: 'Uzávěrky dne' }).count() >= 1, 6000));
  await ctx.close();
}

// 3) Zaměstnanec: štítek dne v „Kdo má směnu"
{
  const fix = { ...fixtura('k68-rozlozeni-domu'), polozky: [{ id: 'kdo', widget: 'rozvrh.tym_nahled', velikost: 'M' }] };
  const { ctx, p } = await kontext({ viewport: { width: 390, height: 900 }, role: 'employee', mobil: true, mineData: roleMine('barista'), fix, dalsi });
  await p.goto(`${process.env.SONDY_ZAKLAD ?? 'http://localhost:3000'}/employee/shifts`, { waitUntil: 'networkidle' });
  await p.locator('[data-plocha] li[data-instance]').first().waitFor({ timeout: 15000 });
  const stitek = p.locator('[data-instance="kdo"]').getByRole('button', { name: /^Detail dne/ }).first();
  await stitek.waitFor({ timeout: 8000 });
  await stitek.click();
  const okno = p.getByRole('dialog', { name: 'Den v podniku' });
  await okno.waitFor({ timeout: 8000 });
  await dokud(async () => /Anna Kolegová/.test(await okno.innerText()), 6000);
  const t = (await okno.innerText()).replace(/\s+/g, ' ');
  tvrdi('3: zaměstnanec vidí, kdo měl ten den směnu', /Anna Kolegová/.test(t) && /Ty/.test(t), t.slice(0, 300));
  tvrdi('3: bez práv na finance nejsou v detailu tržba, platby ani výdaje', !/tržba|platby|výdaje/i.test(t.replace(/Den v podniku/i, '')), t.slice(0, 300));
  await ctx.close();
}
await konec();
