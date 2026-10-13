// Pomůcka pro UX audit (není sonda, nic netvrdí): nafotí každou záložku tabletu (kiosku) do shots/kiosk-zalozka-<název>-<šířka>.png.
// Kolo 7 (R7-7) navíc: Sklad s filtrem Dochází (shots/kiosk-sklad-dochazi-<šířka>.png) a okno souhrnu
// směny po odchodu (shots/kiosk-souhrn-<šířka>.png) — odchod vrací entry a closingDone jako skutečná routa.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/snimky-kiosk.mjs [šířka]
import { kontext, BASE, OUT } from './k68-spolecne.mjs';

const sirka = Number(process.argv[2] ?? 1024);
const odchod = (req, json) => {
  if (new URL(req.url()).pathname !== '/api/attendance' || req.method() !== 'POST') return undefined;
  const telo = req.postDataJSON();
  return json({ ok: true, action: telo.action, entry: { id: 1, clockIn: new Date(Date.now() - 452 * 60000).toISOString(), clockOut: new Date().toISOString() }, closingDone: false });
};
const { ctx, p } = await kontext({ viewport: { width: sirka, height: Math.round(sirka * 0.75) }, role: 'kiosk', mobil: false, dalsi: odchod });
await p.goto(`${BASE}/kiosk`, { waitUntil: 'networkidle', timeout: 45000 });
await p.waitForTimeout(900);
const fotka = async (jmeno) => {
  const vyska = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.screenshot({ path: OUT + `${jmeno}-${sirka}.png`, fullPage: true, clip: { x: 0, y: 0, width: sirka, height: Math.min(vyska, 1700) } });
};
for (const n of ['Směna', 'Úkoly', 'Postupy', 'Sklad', 'Objednávky', 'Uzávěrka', 'Návody']) {
  try {
    // Odznak (Úkoly, Postupy, Objednávky) přidává do jména tlačítka skrytý popisek počtu — hledá se podle začátku.
    await p.locator('nav').getByRole('button', { name: new RegExp(`^${n}`) }).first().click({ timeout: 4000 });
    await p.waitForTimeout(900);
    await fotka(`kiosk-zalozka-${n}`);
    if (n === 'Sklad') {
      // Na směně je víc lidí → tablet se nejdřív zeptá, kdo u něj stojí; vybere se první.
      const vybrat = p.getByRole('button', { name: 'Vybrat sebe' });
      if (await vybrat.isVisible().catch(() => false)) {
        await vybrat.click();
        await p.getByRole('dialog').locator('button').filter({ hasNotText: /^$/ }).nth(1).click({ timeout: 4000 }).catch(() => {});
        await p.waitForTimeout(700);
      }
      const dochazi = p.getByRole('tablist', { name: 'Stav zásob' }).getByRole('tab', { name: /^Dochází/ });
      if (await dochazi.isVisible().catch(() => false)) { await dochazi.click(); await p.waitForTimeout(500); await fotka('kiosk-sklad-dochazi'); }
    }
  } catch (e) { console.log('✗', n, String(e).slice(0, 90)); }
}
// Souhrn po odchodu: první člověk na směně odpíchne odchod (s PINem ho sonda naťuká, podvrh PIN nekontroluje).
try {
  await p.locator('nav').getByRole('button', { name: /^Směna/ }).first().click({ timeout: 4000 });
  await p.waitForTimeout(700);
  await p.getByRole('button', { name: /^Odchod – / }).first().click({ timeout: 4000 });
  const okno = p.getByRole('dialog');
  if (await okno.getByText('Zadej PIN pro odchod').isVisible().catch(() => false)) for (const k of ['1', '2', '3', '4']) await okno.getByRole('button', { name: k, exact: true }).click();
  await okno.getByRole('button', { name: 'Odpíchnout odchod' }).click({ timeout: 4000 });
  await p.getByText('díky za směnu').waitFor({ timeout: 4000 });
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + `kiosk-souhrn-${sirka}.png` });
} catch (e) { console.log('✗ souhrn', String(e).slice(0, 90)); }
await ctx.close();
process.exit(0);
