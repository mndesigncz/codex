// Kolo 7, balík R7-7 — Nastavení a tablet.
//
// Vedení (telefon 390 × 844 s dotykem i počítač 1280):
//  • Předplatné: karta Váš plán má StatRow čerpání „Lidé v týmu 2 / 3", „Sdílené odkazy 1 / 1",
//    Chip wait „Zbývá 1 místo", Chip bad „Plno" a vedlejší „Přejít na Pro" (žádná limetka navíc);
//    na telefonu je srovnání tarifů seznam, ne tabulka s posuvem.
//  • Všechny podniky s vypnutým přehledem: nápověda „Zapíná se v Nastavení › Organizace." a tlačítko
//    „Otevřít nastavení" vede rovnou na sekci Organizace.
//  • Přepínač podniku: položka „Nastavení organizace" (cíl ≥ 44 px) otevře Nastavení › Organizace.
//  • Bez organizace (routa /api/organization vrátí null): sekce v Nastavení není, ?tab=organizace
//    spadne do Účtu a přepínač položku nenabízí.
// Tablet (768 × 1024 na výšku a 1024 × 768 na šířku, dotyk): okno souhrnu po odchodu, Sklad
// s filtrem Dochází a týdenní rozpis Kdo má směnu — čitelné, bez přetečení; snímky do shots/.
// Historie změn a Organizace jako sekce jsou v k69-b9.mjs (bloky H a O), tablet do hloubky v kiosk.mjs.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/k83-nastaveni.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, dokud, roleMine, VLASTNIK, DIR, OUT, BASE } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const text = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/ /g, ' ').replace(/\s+/g, ' ');
const LIMETKA = 'button.on-accent:visible, .btn-accent:visible';
const ROZMERY = [[390, 844, true], [1280, 900, false]];

// ---------------------------------------------------------------------------
// 1) Předplatné: čerpání limitu v kartě Váš plán; na telefonu tarify jako seznam
// ---------------------------------------------------------------------------
for (const [w, h, mobil] of ROZMERY) {
  const { ctx, p, chyby } = await kontext({ viewport: { width: w, height: h }, mobil });
  await p.goto(BASE + '/employer/overview?view=settings&tab=billing', { waitUntil: 'networkidle' });
  const karta = p.locator('.card', { hasText: 'Váš plán' }).first();
  // innerText vrací popisky Stat velkými písmeny (t-label) a jednotku hned za číslem („2/ 3").
  tvrdi(`P ${w}: karta Váš plán ukazuje „Lidé v týmu 2 / 3"`, await dokud(async () => /Lidé v týmu\s*2\s*\/\s*3/i.test(await text(karta)), 15000), await text(karta));
  const tx = await text(karta);
  tvrdi(`P ${w}: „Sdílené odkazy 1 / 1" s Chipem bad „Plno"`, /Sdílené odkazy\s*1\s*\/\s*1/i.test(tx) && await karta.locator('.chip-bad', { hasText: 'Plno' }).isVisible(), tx);
  tvrdi(`P ${w}: Chip wait „Zbývá 1 místo"`, await karta.locator('.chip-wait', { hasText: 'Zbývá 1 místo' }).isVisible());
  const pro = karta.getByRole('button', { name: 'Přejít na Pro' });
  tvrdi(`P ${w}: „Přejít na Pro" je vedlejší akce (secondary), limetka jen jednou na stránce (karta tarifu Pro)`,
    await pro.isVisible() && !(await pro.evaluate(b => b.classList.contains('on-accent'))) && await p.locator(LIMETKA).count() <= 1, `limetek ${await p.locator(LIMETKA).count()}`);
  if (mobil) {
    tvrdi('P 390: cíl „Přejít na Pro" ≥ 44 px', ((await pro.boundingBox())?.height ?? 0) >= 43.5);
    const seznam = p.getByRole('list', { name: 'Co je v jakém plánu' });
    tvrdi('P 390: srovnání tarifů je seznam (funkce pod sebou, tři sloupce), tabulka skrytá', await seznam.isVisible() && await p.locator('table:visible').count() === 0);
    tvrdi('P 390: Předplatné bez vodorovného posuvu (stránka i karty)', await bezPreteceni(p)
      && await p.locator('.card').evaluateAll(els => els.every(e => e.scrollWidth <= e.clientWidth + 1)));
  }
  await p.screenshot({ path: OUT + `k83-nastaveni-predplatne-${w}.png`, fullPage: mobil });
  tvrdi(`P ${w}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 2) Všechny podniky s vypnutým přehledem → nápověda a tlačítko do Nastavení › Organizace
// ---------------------------------------------------------------------------
const vypnuto = (req, json) => {
  if (new URL(req.url()).pathname !== '/api/organization/overview') return undefined;
  // Tvar skutečné routy (app/api/organization/overview): available false, reason, message.
  return json({ available: false, reason: 'vypnuto', message: 'Přehled za všechny podniky je vypnutý.' });
};
for (const [w, h, mobil] of ROZMERY) {
  const { ctx, p, chyby } = await kontext({ viewport: { width: w, height: h }, mobil, dalsi: vypnuto });
  await p.goto(BASE + '/employer/overview?view=org', { waitUntil: 'networkidle' });
  const hint = p.getByText('Zapíná se v Nastavení › Organizace.');
  tvrdi(`V ${w}: vypnutý přehled radí skutečnou cestu „Zapíná se v Nastavení › Organizace."`, await dokud(() => hint.isVisible().catch(() => false), 15000));
  tvrdi(`V ${w}: stará rada „v Nastavení týmu, v části Organizace" zmizela`, await p.getByText(/Nastavení týmu, v části Organizace/).count() === 0);
  const tl = p.getByRole('button', { name: 'Otevřít nastavení' });
  tvrdi(`V ${w}: „Otevřít nastavení" je vedlejší tlačítko s cílem ≥ 44 px`, await tl.isVisible() && !(await tl.evaluate(b => b.classList.contains('on-accent')))
    && ((await tl.boundingBox())?.height ?? 0) >= (mobil ? 43.5 : 35), `${(await tl.boundingBox())?.height}`);
  await p.screenshot({ path: OUT + `k83-nastaveni-org-vypnuto-${w}.png` });
  await tl.click();
  const karta = p.locator('[aria-labelledby="org-nadpis"]');
  tvrdi(`V ${w}: tlačítko otevře rovnou sekci Organizace (karta „Organizace: Moje kavárny")`, await dokud(() => karta.getByRole('heading', { name: 'Organizace: Moje kavárny' }).isVisible().catch(() => false), 15000));
  if (mobil) tvrdi('V 390: na telefonu rovnou sekce s hlavičkou „Organizace", ne seznam sekcí', await p.getByRole('heading', { level: 1, name: 'Organizace' }).isVisible());
  tvrdi(`V ${w}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 3) Přepínač podniku: „Nastavení organizace" vede do Nastavení › Organizace
// ---------------------------------------------------------------------------
for (const [w, h, mobil] of ROZMERY) {
  const { ctx, p, chyby } = await kontext({ viewport: { width: w, height: h }, mobil });
  await p.goto(BASE + '/employer/overview', { waitUntil: 'networkidle' });
  const prepinac = p.locator('button[title="Podnik: Kavárna Vinohrady"]').filter({ visible: true }).first();
  tvrdi(`S ${w}: přepínač podniku je na obrazovce`, await dokud(() => prepinac.isVisible().catch(() => false), 15000));
  await prepinac.click();
  const menu = p.getByRole('menu').first();
  const polozka = menu.getByRole('menuitem', { name: 'Nastavení organizace' });
  tvrdi(`S ${w}: nabídka má „Nastavení organizace" vedle „Všechny podniky"`, await dokud(() => polozka.isVisible().catch(() => false), 3000) && await menu.getByRole('menuitem', { name: /Všechny podniky/ }).isVisible());
  // Nabídka vyjíždí s animací — měřit až po ní (v CI byla výška 42–43 px uprostřed zvětšování).
  await menu.evaluate(m => Promise.all(m.getAnimations({ subtree: true }).map(a => a.finished.catch(() => null))));
  tvrdi(`S ${w}: položky nabídky jsou cíle ≥ 44 px`, await menu.getByRole('menuitem').evaluateAll(els => els.every(e => e.getBoundingClientRect().height >= 43.5)),
    JSON.stringify(await menu.getByRole('menuitem').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)))));
  tvrdi(`S ${w}: nabídka se vejde na obrazovku`, await menu.evaluate(m => { const r = m.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }));
  await p.screenshot({ path: OUT + `k83-nastaveni-prepinac-${w}.png` });
  await polozka.click();
  tvrdi(`S ${w}: klepnutí nabídku zavře`, await dokud(async () => (await menu.count()) === 0, 3000));
  const karta = p.locator('[aria-labelledby="org-nadpis"]');
  tvrdi(`S ${w}: položka otevře Nastavení › Organizace`, await dokud(() => karta.getByRole('heading', { name: 'Organizace: Moje kavárny' }).isVisible().catch(() => false), 15000),
    `h1: ${JSON.stringify(await p.locator('h1:visible').allInnerTexts())}`);
  tvrdi(`S ${w}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 4) Bez organizace: sekce není, ?tab=organizace spadne do Účtu, přepínač položku nenabízí
// ---------------------------------------------------------------------------
{
  const bezOrg = (req, json) => (new URL(req.url()).pathname === '/api/organization' ? json({ organization: null }) : undefined);
  const { ctx, p, chyby } = await kontext({ mineData: { ...VLASTNIK, organization: null }, dalsi: bezOrg });
  await p.goto(BASE + '/employer/overview?view=settings&tab=organizace', { waitUntil: 'networkidle' });
  const pas = p.getByRole('navigation', { name: 'Sekce nastavení' }).filter({ visible: true }).first();
  await dokud(() => pas.getByRole('button', { name: /^Profil podniku/ }).isVisible().catch(() => false), 15000);
  tvrdi('B: bez organizace v bočním pásu Organizace není', await pas.getByRole('button', { name: /^Organizace/ }).count() === 0);
  tvrdi('B: ?tab=organizace bez organizace otevře Účet (ne prázdnou sekci ani kostru navždy)', await dokud(() => p.getByText('Avatar', { exact: true }).isVisible().catch(() => false), 5000)
    && await p.locator('[aria-labelledby="org-nadpis"]').count() === 0);
  const prepinac = p.locator('button[title="Podnik: Kavárna Vinohrady"]').filter({ visible: true }).first();
  await prepinac.click();
  const menu = p.getByRole('menu').first();
  await dokud(() => menu.isVisible().catch(() => false), 3000);
  tvrdi('B: přepínač bez organizace „Nastavení organizace" nenabízí', await menu.getByRole('menuitem', { name: 'Nastavení organizace' }).count() === 0);
  tvrdi('B: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 5) Tablet: souhrn po odchodu, Sklad s Dochází, týdenní rozpis — 768 × 1024 a 1024 × 768
// ---------------------------------------------------------------------------
{
  const KIOSK = roleMine('kiosk');
  const STRANKA = 'kiosk.smena';
  const FIX = nacti('k69-b9-rozlozeni-smena');
  // Kdo má směnu (L, týden) přidaný vedením do rozložení tabletu — doporučený widget, ne výchozí.
  const fix = { ...FIX, polozky: [...FIX.polozky, { id: 'tym-nahled', widget: 'rozvrh.tym_nahled', velikost: 'L', nastaveni: { rozsah: 'tyden' } }] };
  const den = (n) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + n * 86400000));
  const isoPred = (min) => new Date(Date.now() - min * 60000).toISOString();
  // Jen Jakub (bez PINu) na směně 7 h 32 min → tablet ví, kdo u něj stojí, a odchod jde bez číselníku.
  const roster = () => ({
    roster: [
      { id: 3, name: 'Jakub Horák', avatar: '🧔', hasPin: false, openSince: isoPred(452), openEntryId: 502, shiftStart: null, shiftEnd: null },
      { id: 2, name: 'Eva Testová', avatar: '👩', hasPin: true, openSince: null, openEntryId: null, shiftStart: null, shiftEnd: null },
      { id: 8, name: 'Lucie Černá', avatar: '👩‍🦰', hasPin: false, openSince: null, openEntryId: null, shiftStart: null, shiftEnd: null },
    ],
    entries: [],
  });
  const podvrh = (req, json) => {
    const u = new URL(req.url());
    const m = req.method();
    if (u.pathname === '/api/attendance' && m === 'GET') return json(roster());
    if (u.pathname === '/api/attendance' && m === 'POST') {
      const telo = req.postDataJSON();
      // Tvar skutečné routy: odchod vrací entry (clockIn, clockOut) a closingDone.
      if (telo.action === 'out') return json({ ok: true, action: 'out', entry: { id: 502, clockIn: isoPred(452), clockOut: new Date().toISOString() }, closingDone: false });
      return json({ ok: true, action: 'in', entry: { id: 900, clockIn: new Date().toISOString(), clockOut: null } });
    }
    if (u.pathname === '/api/shifts' && u.searchParams.get('team') === '1') {
      return json({ enabled: true, shifts: [
        { id: 71, date: den(0), startTime: '08:00', endTime: '16:00', type: 'morning', employeeId: 2, employeeName: 'Eva Testová', employeeAvatar: '👩', isMine: false },
        { id: 72, date: den(0), startTime: '14:00', endTime: '22:00', type: 'afternoon', employeeId: 3, employeeName: 'Jakub Horák', employeeAvatar: '🧔', isMine: false },
        { id: 73, date: den(1), startTime: '07:00', endTime: '15:00', type: 'morning', employeeId: 8, employeeName: 'Lucie Černá', employeeAvatar: '👩‍🦰', isMine: false },
        { id: 74, date: den(2), startTime: '10:00', endTime: '18:00', type: 'day', employeeId: 2, employeeName: 'Eva Testová', employeeAvatar: '👩', isMine: false },
        { id: 75, date: den(5), startTime: '10:00', endTime: '18:00', type: 'day', employeeId: 3, employeeName: 'Jakub Horák', employeeAvatar: '🧔', isMine: false },
      ] });
    }
    if (u.pathname === '/api/closings/handover' && m === 'GET') return json(nacti('k69-b9-handover'));
    if (u.pathname === '/api/procedures/runs' && m === 'GET') return json(nacti('k69-b6b-runs'));
    return undefined;
  };
  const zalozka = (p, nazev) => p.locator('nav').getByRole('button', { name: new RegExp(`^${nazev}`) });
  for (const vp of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
    const { ctx, p, chyby } = await kontext({ role: 'kiosk', viewport: vp, mobil: true, fix, mineData: KIOSK, dalsi: podvrh });
    await p.goto(BASE + '/kiosk', { waitUntil: 'networkidle' });
    await p.locator(`[data-plocha="${STRANKA}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 20000 });
    await p.waitForTimeout(900);
    const w = vp.width;
    // Týdenní rozpis: jména a časy z /api/shifts?team=1, bez odkazu Moje směny.
    const rozpis = p.locator(`[data-plocha="${STRANKA}"] li[data-widget="rozvrh.tym_nahled"]`);
    tvrdi(`T ${w}: widget Kdo má směnu kreslí týden týmu (Eva, Jakub, Lucie)`, await dokud(async () => { const tx = await text(rozpis); return /Eva Testová/.test(tx) && /Lucie Černá/.test(tx); }, 10000), (await text(rozpis)).slice(0, 160));
    tvrdi(`T ${w}: rozpis bez odkazu Moje směny a bez přetečení`, await rozpis.getByRole('button', { name: /Moje směny/ }).count() === 0 && await rozpis.getByRole('link', { name: /Moje směny/ }).count() === 0
      && await rozpis.evaluate(li => li.scrollWidth <= li.clientWidth + 1));
    tvrdi(`T ${w}: Směna bez přetečení`, await bezPreteceni(p));
    await p.screenshot({ path: OUT + `k83-tablet-rozpis-${w}.png`, fullPage: true });
    // Souhrn po odchodu.
    const nastroj = p.locator(`[data-plocha="${STRANKA}"] li[data-widget="nastroj"]`);
    await nastroj.getByRole('button', { name: 'Odchod – Jakub Horák' }).click();
    await p.getByRole('dialog', { name: 'Jakub Horák', exact: true }).getByRole('button', { name: 'Odpíchnout odchod' }).click();
    const souhrn = p.getByRole('dialog', { name: 'Jakub Horák, díky za směnu' });
    tvrdi(`T ${w}: po odchodu okno „Jakub Horák, díky za směnu"`, await dokud(() => souhrn.isVisible().catch(() => false), 5000));
    // Okno vyjíždí 0,3 s (modal-sheet) — rozměry se měří až po animaci.
    await p.waitForTimeout(600);
    const ts = await text(souhrn);
    tvrdi(`T ${w}: Příchod · Odchod · Odpracováno 7 h 32 min, Chip „Uzávěrka chybí", primary „Vyplnit uzávěrku"`,
      /Příchod \d{1,2}:\d{2}/i.test(ts) && /Odchod \d{1,2}:\d{2}/i.test(ts) && /Odpracováno 7 h 3[23] min/i.test(ts) && /Uzávěrka chybí/.test(ts)
      && await souhrn.getByRole('button', { name: 'Vyplnit uzávěrku' }).isVisible(), ts.slice(0, 200));
    const velikost = await souhrn.locator('.stat-hodnota').first().evaluate(e => parseFloat(getComputedStyle(e).fontSize));
    tvrdi(`T ${w}: čísla souhrnu čitelná z metru (≥ 26 px), tlačítka ≥ 48 px`, velikost >= 26 && ((await souhrn.getByRole('button', { name: 'Vyplnit uzávěrku' }).boundingBox())?.height ?? 0) >= 47.5, `${velikost}px`);
    tvrdi(`T ${w}: okno souhrnu se vejde na obrazovku`, await souhrn.evaluate(d => { const r = d.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; }));
    await p.screenshot({ path: OUT + `k83-tablet-souhrn-${w}.png` });
    await souhrn.getByRole('button', { name: 'Hotovo' }).click();
    await dokud(async () => (await souhrn.count()) === 0, 3000);
    // Sklad s filtrem Dochází.
    await zalozka(p, 'Sklad').click();
    const pas = p.getByRole('tablist', { name: 'Stav zásob' });
    tvrdi(`T ${w}: Sklad má Segmented „Stav zásob" v jednom řádku s počty`, await dokud(() => pas.isVisible().catch(() => false), 10000)
      && await pas.evaluate(e => e.scrollWidth <= e.clientWidth + 1) && /Dochází\s*\d+/.test(await text(pas)), await text(pas));
    const dochazi = pas.getByRole('tab', { name: /^Dochází/ });
    tvrdi(`T ${w}: položky pásu jsou cíle ≥ 48 px`, ((await dochazi.boundingBox())?.height ?? 0) >= 47.5);
    await dochazi.click();
    await p.waitForTimeout(500);
    tvrdi(`T ${w}: po Dochází řádek nese „min … · chybí …"`, await dokud(async () => /min \d+(,\d+)? \S+ · chybí \d/.test(await text(p.locator('main ul.list').first())), 4000), (await text(p.locator('main ul.list').first())).slice(0, 160));
    tvrdi(`T ${w}: Sklad bez přetečení`, await bezPreteceni(p));
    await p.screenshot({ path: OUT + `k83-tablet-sklad-${w}.png`, fullPage: true });
    tvrdi(`T ${w}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

await konec();
