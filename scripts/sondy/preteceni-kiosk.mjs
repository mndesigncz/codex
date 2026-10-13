// Přetečení — tablet a veřejné stránky: /kiosk se všemi záložkami (Směna … Návody)
// na 744 × 1133 (iPad mini na výšku) a 1024 × 768, česky a německy; /login, /register
// a /client/login na 320/390/768/1024 px. Co se měří a proč: preteceni-jadro.mjs.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-kiosk.mjs
import { kontext, konec, tvrdi, dokud, BASE, SIRKY, KIOSK_ZALOZKY, VEREJNE, viewport, nastavJazyk, otevriStranku, prover, projdi } from './preteceni-jadro.mjs';

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
    // Odznak na záložce (Úkoly, Postupy, Objednávky) přidává do jména i skrytý popisek počtu — hledá se podle začátku.
    const tl = p.locator('nav').getByRole('button', { name: new RegExp(`^${nazev}`) }).first();
    const je = await tl.isVisible().catch(() => false);
    if (!je) { tvrdi(`tablet ${jazyk} ${vp.width}: záložka „${nazev}" existuje`, false, 'tlačítko nenalezeno'); continue; }
    await tl.click();
    await p.waitForTimeout(900);
    await prover(p, `tablet ${jazyk} ${vp.width} ${KIOSK_ZALOZKY[i]}`);
  }
  await ctx.close();
}

// Nástroj „Kdo teď pracuje" s plánem proti skutečnosti (kolo 6, B4): řádek „od · délka · plán do"
// s chipy „po plánu" a „bez rozpisu", výběr osoby s hledáním a dvěma skupinami, okno příchodu
// s chipem zpoždění — na 810 × 1080 a 768 × 1024 nic nepřeteče. Rozpis se skládá kolem „teď".
const prahaHMS = (min) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(Date.now() + min * 60000));
const isoPred = (min) => new Date(Date.now() - min * 60000).toISOString();
const clen = (id, name, avatar, x = {}) => ({ id, name, avatar, hasPin: false, openSince: null, openEntryId: null, shiftStart: null, shiftEnd: null, ...x });
const rosterB4 = () => ({ roster: [
  clen(1, 'Martin Nemeškal', '🧑', { hasPin: true, openSince: isoPred(180), openEntryId: 501, shiftStart: prahaHMS(-180), shiftEnd: prahaHMS(-60) }),
  clen(3, 'Jakub Horák', '🧔', { openSince: isoPred(95), openEntryId: 502 }),
  clen(8, 'Lucie Černá', '👩‍🦰', { hasPin: true, shiftStart: prahaHMS(-30), shiftEnd: prahaHMS(450) }),
  clen(7, 'Petr Novák', '🧑‍🍳', { shiftStart: prahaHMS(45), shiftEnd: prahaHMS(500) }),
  clen(2, 'Eva Testová', '👩', { hasPin: true, shiftStart: prahaHMS(120), shiftEnd: prahaHMS(600) }),
  clen(6, 'Zuzana Vedoucí', '👩‍💼'), clen(4, 'Tereza Malá', '👱‍♀️'), clen(5, 'Ondřej Kučera', null), clen(9, 'Filip Dvořák', '🧑‍🦱'),
  clen(10, 'Karolína Šťastná', '👩‍🦱'), clen(11, 'Adam Brigádník', '🧑‍🎓'),
], entries: [] });
// Odchod vrací entry a closingDone jako skutečná routa (kolo 7: souhrn směny po odchodu).
const podvrhB4 = (req, json) => {
  if (new URL(req.url()).pathname !== '/api/attendance') return undefined;
  if (req.method() === 'GET') return json(rosterB4());
  if (req.method() === 'POST') {
    const telo = req.postDataJSON();
    const c = rosterB4().roster.find(r => r.id === telo.employeeId);
    return json(telo.action === 'out'
      ? { ok: true, action: 'out', entry: { id: c?.openEntryId ?? 1, clockIn: c?.openSince ?? isoPred(60), clockOut: new Date().toISOString() }, closingDone: false }
      : { ok: true, action: 'in', entry: { id: 900, clockIn: new Date().toISOString(), clockOut: null } });
  }
  return undefined;
};
for (const vp of [{ width: 810, height: 1080 }, { width: 768, height: 1024 }]) {
  const { ctx, p } = await kontext({ viewport: vp, role: 'kiosk', mobil: true, dalsi: podvrhB4 });
  await otevriStranku(p, `${BASE}/kiosk`);
  const nastroj = p.locator('[data-plocha="kiosk.smena"] li[data-widget="nastroj"]');
  const je = await nastroj.getByText('po plánu').first().isVisible().catch(() => false);
  tvrdi(`tablet ${vp.width}: „Kdo teď pracuje" s chipy „po plánu" a „bez rozpisu"`, je && await nastroj.getByText('bez rozpisu').isVisible().catch(() => false));
  await prover(p, `tablet ${vp.width} Směna – plán vs. skutečnost`);
  await nastroj.getByRole('button', { name: 'Další příchod' }).click();
  await p.waitForTimeout(600);
  tvrdi(`tablet ${vp.width}: výběr osoby má hledání a skupinu „Dnes na rozpisu"`, await nastroj.getByPlaceholder('Hledat jméno…').isVisible().catch(() => false)
    && await nastroj.getByRole('heading', { name: 'Dnes na rozpisu' }).isVisible().catch(() => false));
  await prover(p, `tablet ${vp.width} Směna – výběr osoby`);
  await nastroj.getByRole('button', { name: /Lucie Černá/ }).click();
  await p.waitForTimeout(800);
  tvrdi(`tablet ${vp.width}: okno příchodu s chipem zpoždění`, await p.getByRole('dialog').getByText(/Přicházíš o \d+ min později/).isVisible().catch(() => false));
  await prover(p, `tablet ${vp.width} Směna – okno příchodu`);
  // Souhrn směny po odchodu (kolo 7): Příchod · Odchod · Odpracováno, „Uzávěrka chybí", dvě tlačítka.
  await p.getByRole('dialog').getByRole('button', { name: 'Zpět' }).click();
  await p.waitForTimeout(400);
  await nastroj.locator('ul.list > li', { hasText: 'Jakub Horák' }).getByRole('button', { name: 'Odchod – Jakub Horák' }).click();
  await p.getByRole('dialog', { name: 'Jakub Horák', exact: true }).getByRole('button', { name: 'Odpíchnout odchod' }).click();
  const souhrn = p.getByRole('dialog', { name: 'Jakub Horák, díky za směnu' });
  tvrdi(`tablet ${vp.width}: okno souhrnu po odchodu s „Uzávěrka chybí"`, await dokud(() => souhrn.getByText('Uzávěrka chybí').isVisible().catch(() => false), 3000));
  await p.waitForTimeout(500);
  await prover(p, `tablet ${vp.width} Směna – souhrn po odchodu`);
  await souhrn.getByRole('button', { name: 'Hotovo' }).click().catch(() => {});
  // Sklad s filtrem stavu (kolo 7): Segmented „Vše · Dochází (n) · Kriticky (n)" a meta s minimem.
  await p.locator('nav').getByRole('button', { name: /^Sklad/ }).click();
  await p.waitForTimeout(700);
  if (await p.getByRole('button', { name: 'Vybrat sebe' }).isVisible().catch(() => false)) {
    await p.getByRole('button', { name: 'Vybrat sebe' }).click();
    await p.getByRole('dialog').getByRole('button', { name: /Martin Nemeškal/ }).first().click();
    await p.waitForTimeout(700);
  }
  const pasStavu = p.getByRole('tablist', { name: 'Stav zásob' });
  tvrdi(`tablet ${vp.width}: Sklad má Segmented stavu v jednom řádku`, await dokud(() => pasStavu.isVisible().catch(() => false), 6000)
    && await pasStavu.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
  await pasStavu.getByRole('tab', { name: /^Dochází/ }).click().catch(() => {});
  await p.waitForTimeout(500);
  await prover(p, `tablet ${vp.width} Sklad – Dochází`);
  await ctx.close();
}

// Veřejné stránky: bez přihlášení (cookie se smaže), česky; na 320 px i německy a polsky.
for (const [w, jazyk] of [...SIRKY.map(w => [w, 'cs']), [320, 'de'], [320, 'pl']]) {
  const { ctx, p } = await kontext({ viewport: viewport(w), role: 'employer', mobil: w < 600 });
  await ctx.clearCookies();
  await nastavJazyk(ctx, jazyk);
  await projdi(ctx, p, VEREJNE.map(c => [BASE + c, c]), `veřejné ${jazyk} ${w}`);
  await ctx.close();
}
await konec();
