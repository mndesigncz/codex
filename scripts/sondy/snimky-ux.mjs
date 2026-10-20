// Pomůcka pro UX kontrolu (není sonda, nic netvrdí): nafotí vybrané obrazovky v zadaných šířkách do shots/ux-*.png.
//   node scripts/sondy/snimky-ux.mjs ukoly finance      # jen vybrané sady
// Sady: ukoly (vedení: seznam, měsíc, přehled), finance (Tržba po dnech).
import { readFileSync } from 'node:fs';
import { kontext, otevri, dokud, roleMine, fixtura, DIR, OUT } from './k68-spolecne.mjs';
import { dayPlus, pragueToday } from '../../lib/pragueTime.ts';

const chci = new Set(process.argv.slice(2));
const sada = (n) => chci.size === 0 || chci.has(n);
const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PREDVCEREM: praha(-2), ZITRA: praha(1), POZDEJI: praha(20) };
const CASY = { CAS_DNES: new Date(Date.now() - 60000).toISOString(), CAS_PREDVCEREM: new Date(Date.now() - 2 * 86400000).toISOString() };
const nacti = (jmeno) => { let t = readFileSync(DIR + jmeno + '.json', 'utf8'); for (const [k, v] of Object.entries({ ...DNY, ...CASY })) t = t.replaceAll(`"${k}"`, `"${v}"`); return JSON.parse(t); };
// Stránka se posouvá ve vnitřním prvku, takže fullPage by ukázal jen první obrazovku: fotí se přímo prvek.
const foto = (p, jmeno, kde) => (kde ?? p.locator('[data-plocha] li[data-widget="nastroj"]')).screenshot({ path: OUT + `ux-${jmeno}.png` });

const ukolyPodvrh = (req, json, stav) => {
  const { pathname: path } = new URL(req.url()); const m = req.method();
  if (path === '/api/tasks') {
    if (m === 'PATCH') { const t = req.postDataJSON(); return json({ id: t.id, ...t }); }
    if (m === 'GET') return json(nacti('k69-b6a-tasks').map((u, i) => ({ ...u, createdAt: new Date(Date.now() - (i % 4) * 86400000).toISOString() })));
  }
  if (path === '/api/teams' && m === 'GET') return json(nacti('k69-b6a-teams'));
  return undefined;
};
const trzbaDne = (d) => 12000 + ((Number(d.slice(8)) * 1731) % 9000);
const dnes = pragueToday(); const vcera = dayPlus(dnes, -1);
const posPodvrh = (req, json) => {
  const u = new URL(req.url()); if (req.method() !== 'GET') return undefined;
  if (u.pathname === '/api/pos/daily') {
    const od = u.searchParams.get('from'), doD = u.searchParams.get('to'); const days = []; let n = 0;
    for (let d = od; d <= doD && n < 800; d = dayPlus(d, 1), n++) { const total = trzbaDne(d); days.push({ day: d, bills: 90, cash: Math.round(total / 3), card: Math.round(total * 2 / 3), other: 0, total, tips: 300, tipsCash: 100, tipsCard: 200, discounts: 0, refundCount: 0, refundTotal: 0, persons: 0, closings: 0, declared: null, diff: null }); }
    const b = JSON.parse(readFileSync(DIR + 'k69-b5b-pos-daily.json', 'utf8').replaceAll('DNES', dnes)); const soucet = days.reduce((s, x) => s + x.total, 0);
    return json({ ...b, from: od, to: doD, days, hours: Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 20 ? Math.round(soucet / 13) : 0)), totals: { ...b.totals, total: soucet, bills: 90 * days.length, avgBill: Math.round(soucet / (90 * days.length || 1)), tips: 300 * days.length, cash: Math.round(soucet / 3), card: Math.round(soucet * 2 / 3), other: 0, methods: [] }, items: [], byPerson: [] });
  }
  if (u.pathname === '/api/finance') { const f = JSON.parse(readFileSync(DIR + 'k69-b5b-finance.json', 'utf8').replaceAll('DNES', dnes)); return json({ ...f, month: u.searchParams.get('month') }); }
  if (u.pathname === '/api/closings') return json({ closings: [], meId: 1, payDailyCash: false });
  return undefined;
};

// SIRKY=768,390 a TMAVY=1 zúží šířky / zapne tmavý motiv (pojmenování souborů dostane příponu).
const SIRKY = (process.env.SIRKY ?? '1280,390').split(',').map(Number);
const TMAVY = process.env.TMAVY === '1';
const PRIPONA = TMAVY ? '-tmavy' : '';
for (const w of SIRKY) {
  if (sada('ukoly')) {
    const { ctx, p } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, tmavy: TMAVY, fix: nacti('k69-b6a-rozlozeni-ukoly'), dalsi: ukolyPodvrh });
    await otevri(p, '/employer/overview?view=tasks', 'vedeni.ukoly');
    const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
    // Redesign v3: pás stavů je v panelu „Filtry"; nad seznamem zůstává skupina „Filtry úkolů".
    await nastroj.getByRole('group', { name: 'Filtry úkolů' }).waitFor({ timeout: 10000 });
    await p.waitForTimeout(500); await foto(p, `ukoly-seznam-${w}${PRIPONA}`);
    const pohledy = p.locator('[aria-label="Zobrazení"]').first();
    await pohledy.getByRole('tab', { name: 'Měsíc', exact: true }).click(); await p.waitForTimeout(500); await foto(p, `ukoly-mesic-${w}${PRIPONA}`);
    await pohledy.getByRole('tab', { name: 'Přehled', exact: true }).click(); await p.waitForTimeout(700); await foto(p, `ukoly-prehled-${w}${PRIPONA}`);
    await ctx.close();
  }
  if (sada('finance')) {
    const fix = { ...fixtura('k69-b5b-rozlozeni-finance'), polozky: [{ id: 'po-dnech', widget: 'trzby.po_dnech', velikost: 'L', nastaveni: { obdobi: 'mesic_stranky' } }] };
    const { ctx, p } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, tmavy: TMAVY, fix, dalsi: posPodvrh });
    await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
    await p.locator('[data-instance="po-dnech"]').getByRole('group', { name: 'Období', exact: true }).waitFor({ timeout: 12000 });
    await p.waitForTimeout(600); await foto(p, `finance-po-dnech-${w}${PRIPONA}`, p.locator('[data-instance="po-dnech"]'));
    await p.locator('[data-instance="po-dnech"]').getByRole('group', { name: 'Období', exact: true }).getByRole('button').click(); await p.waitForTimeout(400); await p.screenshot({ path: OUT + `ux-finance-po-dnech-okno-${w}${PRIPONA}.png` });
    await ctx.close();
  }
}
process.exit(0);
