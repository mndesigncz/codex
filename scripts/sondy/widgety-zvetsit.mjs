// Zvětšení widgetu: střední karta s velkou podobou nabízí „Zvětšit widget"; okno ukáže velkou podobu (s tlačítkem období a
// grafem), Escape i klepnutí mimo ho zavřou a klepnutí do okna ani mimo něj NEotevře cíl widgetu (stránka Finance).
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, fixtura, DIR } from './k68-spolecne.mjs';
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
const polozky = [{ id: 'po-dnech', widget: 'trzby.po_dnech', velikost: 'M', nastaveni: { obdobi: '30_dni' } }, { id: 'sirka', widget: 'trzby.platby', velikost: 'M' }];
const fix = { ...fixtura('k68-rozlozeni-vedeni'), polozky };

for (const w of [1280, 390]) {
  const { ctx, p, chyby } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, fix, dalsi });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  const karta = p.locator('[data-instance="po-dnech"]');
  await karta.waitFor({ timeout: 12000 });
  const tlacitko = karta.getByRole('button', { name: 'Zvětšit widget' });
  if (w < 640) {
    // v4 (spec-skladba V1): hlavička widgetu má na telefonu nejvýš DVĚ ikonová tlačítka (› a Sbalit) —
    // Zvětšit by byl třetí a titul by se zalomil. Zvětšení je od sm; na telefonu karta už je přes celou šířku.
    await dokud(async () => await karta.getByRole('button', { name: 'Sbalit widget' }).count() === 1, 8000);
    tvrdi(`${w}: na telefonu hlavička nenabízí „Zvětšit widget" (nejvýš dvě ikony, V1)`, await tlacitko.count() === 0);
    tvrdi(`${w}: … a „Sbalit widget" zůstává`, await karta.getByRole('button', { name: 'Sbalit widget' }).count() === 1);
    tvrdi(`${w}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 2).join(' | '));
    await ctx.close();
    continue;
  }
  tvrdi(`${w}: střední karta s velkou podobou nabízí „Zvětšit widget"`, await dokud(async () => await tlacitko.count() === 1, 8000));
  tvrdi(`${w}: „Zvětšit widget" je v hlavičce před „Sbalit widget" (Sbalit zůstává vpravo)`, await karta.locator('button[aria-label="Zvětšit widget"], button[aria-label="Sbalit widget"]').evaluateAll(b => b.map(x => x.getAttribute('aria-label')).join()) === 'Zvětšit widget,Sbalit widget');
  await tlacitko.click();
  const okno = p.getByRole('dialog', { name: 'Tržba po dnech' });
  await okno.waitFor({ timeout: 6000 });
  tvrdi(`${w}: okno ukáže velkou podobu (tlačítko období a graf)`, await dokud(async () => await okno.getByRole('group', { name: 'Období', exact: true }).count() === 1 && await okno.locator('[role=group][aria-label^="Tržba po dnech"]').count() >= 1, 8000));
  tvrdi(`${w}: v okně není druhá hlavička karty (název nese jen okno)`, await okno.getByRole('heading', { name: 'Tržba po dnech' }).count() === 1);
  // dispatchEvent místo click: okno ještě dojíždí (animace), a Playwright pak hlásil „outside of the viewport"; bublání události stejně testuje totéž.
  await okno.getByText('Tržba za období', { exact: false }).first().dispatchEvent('click');
  tvrdi(`${w}: klepnutí do okna nenaviguje (stále Přehled)`, await p.locator('[data-plocha="vedeni.prehled"]').count() === 1 && await okno.isVisible());
  await p.keyboard.press('Escape');
  tvrdi(`${w}: Escape okno zavře`, await dokud(async () => await p.getByRole('dialog', { name: 'Tržba po dnech' }).count() === 0, 3000));
  await tlacitko.click();
  await okno.waitFor({ timeout: 6000 });
  await p.mouse.click(4, 4);
  tvrdi(`${w}: klepnutí vedle okno zavře a nenaviguje`, await dokud(async () => await p.getByRole('dialog', { name: 'Tržba po dnech' }).count() === 0, 3000) && await p.locator('[data-plocha="vedeni.prehled"]').count() === 1);
  tvrdi(`${w}: malá karta bez velké podoby (Platby jsou S/M bez L) nemá „Zvětšit"`, await p.locator('[data-instance="sirka"]').getByRole('button', { name: 'Zvětšit widget' }).count() === 0);
  tvrdi(`${w}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}
await konec();
