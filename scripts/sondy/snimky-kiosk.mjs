// Pomůcka pro UX audit (není sonda, nic netvrdí): nafotí každou záložku tabletu (kiosku) do shots/kiosk-zalozka-<název>-<šířka>.png.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/snimky-kiosk.mjs [šířka]
import { kontext, BASE, OUT } from './k68-spolecne.mjs';

const sirka = Number(process.argv[2] ?? 1024);
const { ctx, p } = await kontext({ viewport: { width: sirka, height: Math.round(sirka * 0.75) }, role: 'kiosk', mobil: false });
await p.goto(`${BASE}/kiosk`, { waitUntil: 'networkidle', timeout: 45000 });
await p.waitForTimeout(900);
const nazvy = await p.locator('nav button, [role="tablist"] button, header ~ div button').evaluateAll(bs => bs.map(b => b.textContent?.trim()).filter(Boolean));
for (const n of ['Směna', 'Úkoly', 'Postupy', 'Sklad', 'Objednávky', 'Uzávěrka', 'Návody']) {
  try {
    // Odznak (Úkoly, Postupy, Objednávky) přidává do jména tlačítka skrytý popisek počtu — hledá se podle začátku.
    await p.locator('nav').getByRole('button', { name: new RegExp(`^${n}`) }).first().click({ timeout: 4000 });
    await p.waitForTimeout(900);
    const vyska = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.screenshot({ path: OUT + `kiosk-zalozka-${n}-${sirka}.png`, fullPage: true, clip: { x: 0, y: 0, width: sirka, height: Math.min(vyska, 1700) } });
  } catch (e) { console.log('✗', n, String(e).slice(0, 90)); }
}
await ctx.close();
process.exit(0);
