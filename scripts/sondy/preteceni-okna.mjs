// Přetečení — okna a listy na nejužším telefonu (320 px, česky i německy) a na 390 px:
// „Přidat záznam" (Docházka), „Nový úkol" (Úkoly), „Přidat položku" (Sklad), nastavení
// widgetu (podržení widgetu → „Upravit stránku" → klepnutí na widget) a okno Období
// (Docházka, Finance). Okno (.modal-sheet) se měří jako karta: nic z něj nesmí vyčuhovat,
// stránka pod ním nesmí dostat vodorovný posuv. Co se měří a proč: preteceni-jadro.mjs.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-okna.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, dokud, viewport, url, nastavJazyk, otevriStranku, prover } from './preteceni-jadro.mjs';
import { li, stred, dotyk, podrzPrstem, klepniPrstem, vUpravach, fixtura, DIR } from './k68-spolecne.mjs';
import { dayPlus, pragueToday } from '../../lib/pragueTime.ts';

// Názvy tlačítek v jazyce (sonda klepe podle jména, jako člověk).
const T = {
  cs: { pridatZaznam: 'Přidat záznam', novyUkol: 'Nový úkol', pridatPolozku: 'Přidat položku', obdobi: 'Období', upravitStranku: 'Upravit stránku' },
  de: { pridatZaznam: 'Eintrag hinzufügen', novyUkol: 'Neue Aufgabe', pridatPolozku: 'Artikel hinzufügen', obdobi: 'Zeitraum', upravitStranku: 'Seite bearbeiten' },
};

// Finance: lišta Období patří widgetu „Tržba po dnech" — stejná fixtura a podvrh
// /api/pos/daily jako v obdobi-graf.mjs (výchozí rozložení ho nemá).
const dnes = pragueToday();
const trzbaDne = (d) => 12000 + ((Number(d.slice(8)) * 1731) % 9000);
const podvrhFinanci = (req, json) => {
  const u = new URL(req.url()); if (req.method() !== 'GET') return undefined;
  if (u.pathname === '/api/pos/daily') {
    const od = u.searchParams.get('from'), doD = u.searchParams.get('to');
    const days = []; let n = 0;
    for (let d = od; d <= doD && n < 800; d = dayPlus(d, 1), n++) {
      const total = trzbaDne(d);
      days.push({ day: d, bills: 90, cash: Math.round(total / 3), card: Math.round(total * 2 / 3), other: 0, total, tips: 300, tipsCash: 100, tipsCard: 200, discounts: 0, refundCount: 0, refundTotal: 0, persons: 0, closings: 0, declared: null, diff: null });
    }
    const b = JSON.parse(readFileSync(DIR + 'k69-b5b-pos-daily.json', 'utf8').replaceAll('DNES', dnes)); const soucet = days.reduce((s, x) => s + x.total, 0);
    return json({ ...b, from: od, to: doD, days, hours: Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 20 ? Math.round(soucet / 13) : 0)), open: b.open ?? { pocet: 0, soucet: 0, ucty: [], nejstarsi: null },
      totals: { ...b.totals, total: soucet, bills: 90 * days.length, avgBill: Math.round(soucet / (90 * days.length || 1)), tips: 300 * days.length, cash: Math.round(soucet / 3), card: Math.round(soucet * 2 / 3), other: 0, methods: [] },
      items: [], byPerson: [] });
  }
  if (u.pathname === '/api/finance') { const f = JSON.parse(readFileSync(DIR + 'k69-b5b-finance.json', 'utf8').replaceAll('DNES', dnes)); return json({ ...f, month: u.searchParams.get('month') }); }
  if (u.pathname === '/api/closings') return json({ closings: [], meId: 1, payDailyCash: false });
  return undefined;
};
const fixFinanci = { ...fixtura('k69-b5b-rozlozeni-finance'), polozky: [{ id: 'po-dnech', widget: 'trzby.po_dnech', velikost: 'L', nastaveni: { obdobi: 'mesic_stranky' } }] };

async function klikni(p, jmeno, popis) {
  const tl = p.getByRole('button', { name: jmeno, exact: true }).first();
  const je = await dokud(() => tl.isVisible().catch(() => false), 5000);
  tvrdi(`${popis}: tlačítko „${jmeno}" je na obrazovce`, je);
  if (!je) return false;
  await tl.click();
  await p.waitForTimeout(700);
  return true;
}
const dialog = (p) => p.getByRole('dialog').last();

for (const [w, jazyk] of [[320, 'cs'], [320, 'de'], [390, 'cs']]) {
  const t = T[jazyk];
  const popis = `okna ${jazyk} ${w}`;
  {
    const { ctx, p } = await kontext({ viewport: viewport(w), role: 'employer', mobil: true });
    await nastavJazyk(ctx, jazyk);

    // Docházka: Přidat záznam, pak Období
    await otevriStranku(p, url('employer', 'attendance'));
    if (await klikni(p, t.pridatZaznam, popis)) {
      tvrdi(`${popis}: okno „${t.pridatZaznam}" se otevřelo`, await dokud(() => dialog(p).isVisible().catch(() => false), 4000));
      await prover(p, `${popis} Přidat záznam`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
    }
    const obdobi = p.getByRole('group', { name: t.obdobi, exact: true }).first().getByRole('button').first();
    if (await dokud(() => obdobi.isVisible().catch(() => false), 4000)) {
      await obdobi.click();
      tvrdi(`${popis}: okno „${t.obdobi}" (Docházka) se otevřelo`, await dokud(() => dialog(p).isVisible().catch(() => false), 4000));
      await prover(p, `${popis} Období Docházka`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
    } else tvrdi(`${popis}: Docházka má lištu Období`, false, 'tlačítko období nenalezeno');

    // Úkoly: Nový úkol (formulář v listu)
    await otevriStranku(p, url('employer', 'tasks'));
    if (await klikni(p, t.novyUkol, popis)) await prover(p, `${popis} Nový úkol`);

    // Sklad: Přidat položku
    await otevriStranku(p, url('employer', 'inventory'));
    if (await klikni(p, t.pridatPolozku, popis)) {
      tvrdi(`${popis}: okno „${t.pridatPolozku}" se otevřelo`, await dokud(() => dialog(p).isVisible().catch(() => false), 4000));
      await prover(p, `${popis} Přidat položku`);
    }

    // Přehled: podržení prstem na widgetu → „Upravit stránku" → klepnutí na widget → jeho nastavení
    await otevriStranku(p, url('employer', 'overview'));
    await p.locator('[data-plocha] li[data-instance]:not([hidden])').first().waitFor({ timeout: 15000 }).catch(() => {});
    const cdp = await dotyk(p);
    const s = await stred(li(p, 'sklad-dochazi'));
    await podrzPrstem(cdp, p, s.x, s.y);
    const polozka = p.getByRole('menuitem', { name: t.upravitStranku });
    if (await dokud(() => polozka.isVisible().catch(() => false), 2000)) {
      await polozka.click();
      tvrdi(`${popis}: „${t.upravitStranku}" vstoupí do úprav`, await dokud(() => vUpravach(p), 2000));
      const s2 = await stred(li(p, 'sklad-dochazi'));
      await klepniPrstem(cdp, p, s2.x, s2.y);
      tvrdi(`${popis}: nastavení widgetu se otevřelo`, await dokud(() => dialog(p).isVisible().catch(() => false), 4000));
      await prover(p, `${popis} Nastavení widgetu`);
    } else tvrdi(`${popis}: podržení widgetu nabídne „${t.upravitStranku}"`, false, 'položka menu nenalezena');
    await ctx.close();
  }

  // Finance: Období (vlastní kontext s fixturou grafu po dnech)
  {
    const { ctx, p } = await kontext({ viewport: viewport(w), role: 'employer', mobil: true, fix: fixFinanci, dalsi: podvrhFinanci });
    await nastavJazyk(ctx, jazyk);
    await otevriStranku(p, url('employer', 'finance'));
    const obdobiF = p.getByRole('group', { name: t.obdobi, exact: true }).first().getByRole('button').first();
    if (await dokud(() => obdobiF.isVisible().catch(() => false), 8000)) {
      await obdobiF.click();
      tvrdi(`${popis}: okno „${t.obdobi}" (Finance) se otevřelo`, await dokud(() => dialog(p).isVisible().catch(() => false), 4000));
      await prover(p, `${popis} Období Finance`);
    } else tvrdi(`${popis}: Finance mají lištu Období`, false, 'tlačítko období nenalezeno');
    await ctx.close();
  }
}
await konec();
