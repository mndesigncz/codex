// Přetečení — tablet a veřejné stránky: /kiosk se všemi záložkami (Směna … Návody)
// na 744 × 1133 (iPad mini na výšku) a 1024 × 768, česky a německy; /login, /register
// a /client/login na 320/390/768/1024 px. Co se měří a proč: preteceni-jadro.mjs.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-kiosk.mjs
import { kontext, konec, tvrdi, BASE, SIRKY, KIOSK_ZALOZKY, VEREJNE, viewport, nastavJazyk, otevriStranku, prover } from './preteceni-jadro.mjs';

// Záložky tabletu v jazyce (sonda klepe podle názvu; tablet nemá URL záložek).
const ZALOZKY = { cs: KIOSK_ZALOZKY, de: ['Schicht', 'Aufgaben', 'Abläufe', 'Lager', 'Bestellungen', 'Kassenabschluss', 'Anleitungen'] };

for (const [vp, jazyk] of [[{ width: 744, height: 1133 }, 'cs'], [{ width: 1024, height: 768 }, 'cs'], [{ width: 744, height: 1133 }, 'de']]) {
  const { ctx, p } = await kontext({ viewport: vp, role: 'kiosk', mobil: false });
  await nastavJazyk(ctx, jazyk);
  await otevriStranku(p, `${BASE}/kiosk`);
  const nav = p.locator('nav[aria-label] button, nav button').first();
  tvrdi(`tablet ${jazyk} ${vp.width}: záložky jsou na obrazovce`, await nav.isVisible().catch(() => false));
  for (let i = 0; i < KIOSK_ZALOZKY.length; i++) {
    const nazev = (ZALOZKY[jazyk] ?? ZALOZKY.cs)[i];
    const tl = p.getByRole('button', { name: nazev, exact: true }).first();
    const je = await tl.isVisible().catch(() => false);
    if (!je) { tvrdi(`tablet ${jazyk} ${vp.width}: záložka „${nazev}" existuje`, false, 'tlačítko nenalezeno'); continue; }
    await tl.click();
    await p.waitForTimeout(900);
    await prover(p, `tablet ${jazyk} ${vp.width} ${KIOSK_ZALOZKY[i]}`);
  }
  await ctx.close();
}

// Veřejné stránky: bez přihlášení (cookie se smaže), česky; na 320 px i německy a polsky.
for (const [w, jazyk] of [...SIRKY.map(w => [w, 'cs']), [320, 'de'], [320, 'pl']]) {
  const { ctx, p } = await kontext({ viewport: viewport(w), role: 'employer', mobil: w < 600 });
  await ctx.clearCookies();
  await nastavJazyk(ctx, jazyk);
  for (const cesta of VEREJNE) {
    await otevriStranku(p, BASE + cesta);
    await prover(p, `veřejné ${jazyk} ${w} ${cesta}`);
  }
  await ctx.close();
}
await konec();
