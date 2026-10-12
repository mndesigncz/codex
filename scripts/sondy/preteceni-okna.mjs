// Přetečení — okna a listy na nejužším telefonu (320 px, česky i německy) a na 390 px:
// „Přidat záznam" (Docházka), „Nový úkol" (Úkoly), „Přidat položku" (Sklad), nastavení
// widgetu (podržení widgetu → „Upravit stránku" → klepnutí na widget) a okno Období
// (Docházka, Finance). Okno (.modal-sheet) se měří jako karta: nic z něj nesmí vyčuhovat,
// stránka pod ním nesmí dostat vodorovný posuv. Co se měří a proč: preteceni-jadro.mjs.
// Kolo 6 (B3): Nastavení na 390 px je svislý seznam sekcí (klik na Role otevře sekci,
// Zpět se vrátí), Centrum oznámení má klikatelné řádky a filtr Nepřečtené, Tým ukáže
// u lidí telefon a sazbu — nic z toho nepřetéká.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-okna.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, dokud, viewport, url, nastavJazyk, otevriStranku, prover } from './preteceni-jadro.mjs';
import { li, stred, dotyk, podrzPrstem, klepniPrstem, vUpravach, fixtura, DIR } from './k68-spolecne.mjs';
import { dayPlus, pragueToday } from '../../lib/pragueTime.ts';

// Názvy tlačítek v jazyce (sonda klepe podle jména, jako člověk).
const T = {
  cs: { pridatZaznam: 'Přidat záznam', novyUkol: 'Nový úkol', pridatPolozku: 'Přidat položku', obdobi: 'Období', upravitStranku: 'Upravit stránku', dalsiAkce: 'Další akce' },
  de: { pridatZaznam: 'Eintrag hinzufügen', novyUkol: 'Neue Aufgabe', pridatPolozku: 'Artikel hinzufügen', obdobi: 'Zeitraum', upravitStranku: 'Seite bearbeiten', dalsiAkce: 'Weitere Aktionen' },
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

// Akce stránky: tlačítko v hlavičce, nebo (kolo 6, B6) na telefonu v „···" hlavičky — vedení na telefonu
// má limetku pro to, co z telefonu dělá (Sklad: Nakoupit), a zakládání ustoupilo do nabídky.
async function klikni(p, jmeno, popis, dalsiAkce) {
  const tl = p.getByRole('button', { name: jmeno, exact: true }).first();
  let je = await dokud(() => tl.isVisible().catch(() => false), dalsiAkce ? 3000 : 5000);
  if (!je && dalsiAkce) {
    const vice = p.locator('main').getByRole('button', { name: dalsiAkce, exact: true }).first();
    if (await vice.isVisible().catch(() => false)) {
      await vice.click();
      const polozka = p.getByRole('menuitem', { name: jmeno, exact: true }).first();
      je = await dokud(() => polozka.isVisible().catch(() => false), 3000);
      if (je) { await polozka.click(); await p.waitForTimeout(700); }
      tvrdi(`${popis}: akce „${jmeno}" je v hlavičce nebo v „···"`, je);
      return je;
    }
  }
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
    if (await klikni(p, t.novyUkol, popis, t.dalsiAkce)) await prover(p, `${popis} Nový úkol`);

    // Sklad: Přidat položku
    await otevriStranku(p, url('employer', 'inventory'));
    if (await klikni(p, t.pridatPolozku, popis, t.dalsiAkce)) {
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
// Kolo 6 (B3): Nastavení a Tým na telefonu (390 px, česky).
{
  const ted = Date.now();
  const iso = (min) => new Date(ted - min * 60000).toISOString();
  const den = (o) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(ted + o * 86400000));
  const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8')
    .replace(/"@(\d+)"/g, (_, m) => `"${iso(Number(m))}"`)
    .replaceAll('"DNES"', `"${den(0)}"`).replaceAll('"VCERA"', `"${den(-1)}"`).replaceAll('"PRED5"', `"${den(-5)}"`));
  const OZNAMENI = [
    { id: 60, title: 'Uzávěrka čeká na schválení', body: 'Eva Testová odeslala uzávěrku za včerejšek — rozdíl v kase −120 Kč.', type: 'warning', link: '/employer/overview?view=reports', is_read: false, created_at: iso(6) },
    { id: 59, title: 'Nová zpráva od Jakuba', body: 'Zítra ráno to nestihnu, můžu přijít až v deset?', type: 'chat', link: '/employer/overview?view=chat', is_read: false, created_at: iso(48) },
    { id: 57, title: 'Pozvánka přijata', body: 'Lucie Dvořáková přijala pozvánku a připojila se do týmu.', type: 'invite', link: '/employer/overview?view=team-settings', is_read: true, created_at: iso(60 * 26) },
    { id: 55, title: 'Týdenní souhrn', body: null, type: 'info', link: '/', is_read: true, created_at: iso(60 * 24 * 9) },
  ];
  const podvrhB3 = (req, json) => {
    const u = new URL(req.url());
    if (req.method() !== 'GET') return undefined;
    if (u.pathname === '/api/notifications') {
      const q = u.searchParams;
      const vse = q.get('unread') === '1' ? OZNAMENI.filter(n => !n.is_read) : OZNAMENI;
      const druhy = {}; for (const n of vse) druhy[n.type] = (druhy[n.type] ?? 0) + 1;
      const seznam = vse.filter(n => !q.get('type') || n.type === q.get('type')).filter(n => !q.get('before') || n.id < Number(q.get('before')));
      return json({ notifications: seznam, unread: OZNAMENI.filter(n => !n.is_read).length, limit: Number(q.get('limit') ?? 30), ...(q.get('souhrn') === '1' ? { druhy } : {}) });
    }
    if (u.pathname === '/api/teams') return json(nacti('k69-b2-teams'));
    if (u.pathname === '/api/invitations') return json(nacti('k69-b2-invitations'));
    return undefined;
  };
  const popis = 'B3 390';
  {
    const { ctx, p, stav } = await kontext({ viewport: viewport(390), role: 'employer', mobil: true, dalsi: podvrhB3 });
    // 1) Seznam sekcí místo posuvného pásu; klik na Role otevře sekci, Zpět se vrátí.
    await otevriStranku(p, url('employer', 'settings'));
    const seznam = p.getByRole('navigation', { name: 'Sekce nastavení' });
    tvrdi(`${popis}: Nastavení je svislý seznam sekcí, ne posuvný pás`, await dokud(() => seznam.isVisible().catch(() => false), 8000)
      && await p.getByRole('tablist', { name: 'Sekce nastavení' }).count() === 0);
    tvrdi(`${popis}: seznam má skupiny Osobní a Podnik`, await seznam.getByRole('heading', { name: 'Osobní' }).isVisible() && await seznam.getByRole('heading', { name: 'Podnik' }).isVisible());
    await prover(p, `${popis} Nastavení seznam sekcí`);
    await seznam.getByRole('button', { name: /Role a oprávnění/ }).click();
    tvrdi(`${popis}: klik na „Role a oprávnění" otevře sekci s nadpisem`, await dokud(() => p.getByRole('heading', { name: 'Role a oprávnění', level: 1 }).isVisible().catch(() => false), 10000));
    await p.waitForTimeout(800);
    await prover(p, `${popis} Nastavení sekce Role`);
    await p.getByRole('button', { name: 'Zpět', exact: true }).click();
    tvrdi(`${popis}: Zpět se vrátí na seznam sekcí`, await dokud(() => seznam.isVisible().catch(() => false), 4000));

    // 2) Centrum oznámení: ?tab= otevře sekci rovnou, řádek s odkazem je tlačítko, Nepřečtené filtruje.
    await otevriStranku(p, url('employer', 'settings') + '&tab=notifications');
    tvrdi(`${popis}: ?tab=notifications otevře rovnou sekci Notifikace`, await dokud(() => p.getByRole('heading', { name: 'Notifikace', level: 1 }).isVisible().catch(() => false), 8000));
    const radek = p.getByRole('button', { name: /Uzávěrka čeká na schválení/ });
    tvrdi(`${popis}: řádek oznámení s odkazem je klikatelný`, await dokud(() => radek.isVisible().catch(() => false), 6000));
    tvrdi(`${popis}: oznámení bez odkazu tlačítko není`, await p.getByRole('button', { name: /Týdenní souhrn/ }).count() === 0 && await p.getByText('Týdenní souhrn').isVisible());
    await p.getByRole('heading', { name: 'Centrum oznámení' }).scrollIntoViewIfNeeded();
    await prover(p, `${popis} Centrum oznámení`);
    await p.getByRole('tab', { name: /Nepřečtené/ }).click();
    tvrdi(`${popis}: Nepřečtené se ptá serveru jen na nepřečtená (unread=1) a přečtená zmizí`,
      await dokud(() => stav.dotazy.some(d => d.path === '/api/notifications' && d.u.includes('unread=1')), 4000)
      && await dokud(async () => !(await p.getByText('Týdenní souhrn').isVisible().catch(() => false)), 4000));
    await prover(p, `${popis} Centrum oznámení Nepřečtené`);
    await radek.click();
    tvrdi(`${popis}: klepnutí na oznámení označí přečtené a vede na cíl`,
      await dokud(() => stav.dotazy.some(d => d.m === 'PATCH' && d.path === '/api/notifications'), 4000)
      && await dokud(() => p.url().includes('view=reports'), 10000));
    await ctx.close();
  }
  {
    // 3) Tým: lidé s telefonem (odkaz tel:) a sazbou ve sloupci, nic nepřetéká.
    const { ctx, p } = await kontext({ viewport: viewport(390), role: 'employer', mobil: true, fix: nacti('k69-b2-rozlozeni-tym'), dalsi: podvrhB3 });
    await otevriStranku(p, url('employer', 'team-settings'));
    const lide = p.locator('[data-plocha] li[data-widget="nastroj"]');
    tvrdi(`${popis}: Tým ukáže u lidí telefon jako odkaz tel:`, await dokud(() => lide.locator('a[href^="tel:"]').first().isVisible().catch(() => false), 10000));
    tvrdi(`${popis}: …a sazbu „150 Kč/h"`, await lide.getByText(/150\s*Kč\/h/).first().isVisible());
    tvrdi(`${popis}: čekající pozvánka nese roli a „Poslat znovu"`, await lide.getByRole('button', { name: 'Poslat znovu: brigadnik@example.cz' }).isVisible().catch(() => false)
      && await lide.getByText('Kuchař', { exact: true }).first().isVisible().catch(() => false));
    await prover(p, `${popis} Tým lidé s telefonem a sazbou`);
    await ctx.close();
  }
}
await konec();
