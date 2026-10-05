// „S kým mám směnu" — Moje směny a widget Nejbližší směna ukážou, kdo stojí ve stejnou dobu jako ty.
// Kryje: kolegové u každé směny (jen překryv, dotyk ne, čas jen u nepřesné shody), „Zatím nikdo další",
// žádný dotaz na tým bez rozvrh.nahled, na telefonu bez vodorovného přetečení, widget na Přehledu.
import { kontext, konec, tvrdi, BASE, OUT, fixtura, roleMine, dotazyNa, dokud } from './k68-spolecne.mjs';
import { dayPlus, pragueToday } from '../../lib/pragueTime.ts';

const dnes = pragueToday();
const D1 = dayPlus(dnes, 1), D2 = dayPlus(dnes, 2), D3 = dayPlus(dnes, 3);
const mojeSmeny = [
  { id: 1, date: D1, startTime: '10:00', endTime: '18:00', type: 'custom' },
  { id: 2, date: D2, startTime: '14:00', endTime: '22:00', type: 'custom' },
  { id: 3, date: D3, startTime: '08:00', endTime: '16:00', type: 'custom' },
];
const t = (id, jmeno, date, od, doC, x = {}) => ({ id, employeeId: 100 + id, employeeName: jmeno, employeeAvatar: '🙂', date, startTime: od, endTime: doC, type: 'custom', isMine: false, ...x });
const tym = [
  ...mojeSmeny.map(s => ({ ...s, employeeId: 99, employeeName: 'Já', employeeAvatar: '🙂', isMine: true })),
  t(11, 'Anna', D1, '08:00', '16:00'), t(12, 'Tomáš', D1, '12:00', '20:00'), t(13, 'Karel', D1, '18:00', '22:00'),
  t(14, 'Zuzana', D2, '14:00', '22:00'),
];
const dalsi = (req, json) => {
  const u = new URL(req.url()); if (req.method() !== 'GET') return undefined;
  if (u.pathname === '/api/shifts' && u.searchParams.get('team') === '1') {
    const m = u.searchParams.get('month');
    return json({ enabled: true, shifts: tym.filter(s => s.date.startsWith(m)) });
  }
  if (u.pathname === '/api/shifts' && u.searchParams.get('employeeId')) return json(mojeSmeny);
  if (u.pathname === '/api/shifts/offers') return json({ offers: [] });
  return undefined;
};
const radek = (p, d) => p.locator('ul.list > li').filter({ hasText: /Zítra|Pozítří|\d+\. \d+\./ }).nth(d);

for (const w of [390, 1280]) {
  const mobil = w < 600;
  const { ctx, p, stav } = await kontext({ viewport: { width: w, height: 900 }, role: 'employee', mobil, mineData: roleMine('barista'), dalsi });
  await p.goto(BASE + '/employee/shifts?view=my-shifts', { waitUntil: 'networkidle' });
  await p.getByRole('heading', { name: 'Nadcházející směny' }).waitFor({ timeout: 15000 });
  await dokud(async () => (await p.getByText('S tebou').count()) > 0, 6000);
  const text = await p.getByRole('region', { name: 'Nadcházející směny' }).innerText().catch(async () => await p.locator('#nadchazejici-smeny').locator('..').innerText());
  const r = text.split('\n').join(' ');
  tvrdi(`${w}: zítra jsou s tebou Anna a Tomáš (s časy), Karel ne`, /S tebou: Anna 08:00–16:00 · Tomáš 12:00–20:00/.test(r) && !/Karel/.test(r), r.slice(0, 300));
  // Čas za jménem patří jmenovce (<span> s jménem + čas), čas hned za řádkem je „value" mojí směny — proto DOM, ne text.
  const zuzana = await p.evaluate(() => [...document.querySelectorAll('span')].find(e => e.textContent?.trim().startsWith('Zuzana') && e.children.length <= 1 && e.parentElement?.textContent?.includes('S tebou'))?.textContent?.trim());
  tvrdi(`${w}: Zuzana, která stojí přesně stejně, je bez času`, zuzana === 'Zuzana', String(zuzana));
  tvrdi(`${w}: den bez kolegy řekne „Zatím nikdo další"`, r.includes('Zatím nikdo další'), r.slice(0, 300));
  tvrdi(`${w}: dotaz na tým šel jednou na měsíc, ne na každou směnu`, dotazyNa(stav, ['/api/shifts']).filter(d => d.u.includes('team=1')).length <= 2);
  const pres = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  tvrdi(`${w}: bez vodorovného přetečení`, pres <= 0, String(pres));
  if (w === 390) await p.screenshot({ path: OUT + 's-kym-moje.png' });
  await ctx.close();
}

// Role bez rozvrh.nahled: žádný řádek „S tebou", žádný dotaz na tým.
{
  const { ctx, p, stav } = await kontext({ viewport: { width: 390, height: 900 }, role: 'employee', mobil: true, mineData: roleMine('barista', ['rozvrh.nahled']), dalsi });
  await p.goto(BASE + '/employee/shifts?view=my-shifts', { waitUntil: 'networkidle' });
  await p.getByRole('heading', { name: 'Nadcházející směny' }).waitFor({ timeout: 15000 });
  await p.waitForTimeout(1500);
  tvrdi('bez oprávnění: žádné „S tebou" ani „Zatím nikdo další"', !(await p.getByText('S tebou').count()) && !(await p.getByText('Zatím nikdo další').count()));
  tvrdi('bez oprávnění: na tým se neptá', dotazyNa(stav, ['/api/shifts']).every(d => !d.u.includes('team=1')));
  await ctx.close();
}

// Přehled: Nejbližší směna (M) ukáže kolegy té nejbližší směny.
{
  const fix = { ...fixtura('k68-rozlozeni-domu'), polozky: [{ id: 'moje-nejblizsi-smena', widget: 'moje.nejblizsi_smena', velikost: 'M' }, { id: 'kdo-ma-smenu', widget: 'rozvrh.tym_nahled', velikost: 'M' }] };
  const { ctx, p } = await kontext({ viewport: { width: 390, height: 900 }, role: 'employee', mobil: true, mineData: roleMine('barista'), fix, dalsi });
  await p.goto(BASE + '/employee/shifts', { waitUntil: 'networkidle' });
  await p.locator('[data-plocha] li[data-instance]').first().waitFor({ timeout: 15000 });
  await dokud(async () => (await p.getByText('S tebou').count()) > 0, 6000);
  const prvni = await p.locator('[data-plocha] li[data-instance="moje-nejblizsi-smena"]').innerText();
  tvrdi('Přehled: Nejbližší směna ukáže, kdo je s tebou', /S tebou: Anna/.test(prvni.replace(/\n/g, ' ')), prvni.replace(/\n/g, ' ').slice(0, 200));
  const druhy = await p.locator('[data-plocha] li[data-instance="kdo-ma-smenu"]').innerText();
  tvrdi('Přehled: widget Kdo má směnu ukáže tým (Anna, Tomáš)', /Anna/.test(druhy) && /Tomáš/.test(druhy), druhy.replace(/\n/g, ' ').slice(0, 200));
  await p.screenshot({ path: OUT + 's-kym-prehled.png' });
  await ctx.close();
}
await konec();
