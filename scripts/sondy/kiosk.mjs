// Tablet (/kiosk) na 768 × 1024 s dotykem: rozložení záložek a plochy Směna, a od
// kola 6 (balík B4) nástroj „Kdo teď pracuje" a výběr osoby:
//   - odchod člověka s PINem otevře číselník a PIN pošle (server ho u action=out chce);
//   - řádek na směně nese „od · délka · plán do" a chip „po plánu" / „bez rozpisu";
//   - výběr osoby: „Dnes na rozpisu" / „Ostatní", od devíti lidí hledání, prázdný výsledek;
//   - příchod proti rozpisu: chip „Přicházíš o N min později" / „Směna začíná za N min";
//   - záložky podle role tabletu: bez sklad.zobrazit není Sklad; odznaky Úkolů a Postupů.
// Kolo 7 (R7-7):
//   - po odchodu okno „{jméno}, díky za směnu" s Příchod / Odchod / Odpracováno; bez uzávěrky
//     Chip „Uzávěrka chybí" a „Vyplnit uzávěrku" přepne záložku; samo se zavře po 20 s,
//     dotyk odpočet zastaví;
//   - Sklad: Segmented „Vše · Dochází (n) · Kriticky (n)" filtruje, řazení kriticky › dochází,
//     meta „min 2 kg · chybí 1"; proklik z widgetu Docházející zásoby otevře Sklad s Dochází;
//   - widget Kdo má směnu (rozvrh.tym_nahled) přidaný do rozložení tabletu kreslí týden týmu
//     z /api/shifts?team=1 a nekreslí odkaz Moje směny (tablet ho nemá kam vést).
// Rozpis se skládá z časů kolem „teď", ať sonda neplatí na to, kdy běží.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/kiosk.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, dokud, roleMine, DIR, BASE } from './k68-spolecne.mjs';
// Pevné „teď" pro fixtury i prohlížeč: dnes 14:30 v Praze. Směny se počítají od teď, a kolem půlnoci
// by se plán přehoupl přes den (CI v 23:49 → „po plánu" chyběl); tablet ve skutečnosti dostává jen dnešní směny.
const TED = (() => {
  const den = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
  const poledne = new Date(`${den}T12:00:00Z`);
  const posun = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', hour: 'numeric', hourCycle: 'h23' }).format(poledne)) - 12;
  const [r, mes, d] = den.split('-').map(Number);
  return Date.UTC(r, mes - 1, d, 14 - posun, 30);
})();


const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
/** Náhled rozvrhu týmu (/api/shifts?team=1) s dnešním a zítřejším pražským dnem místo DNES/ZITRA ve fixtuře. */
const tymoveSmeny = () => {
  const den = (n) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(TED + n * 86400000));
  return JSON.parse(readFileSync(DIR + 'k69-b1-shifts-team.json', 'utf8').replaceAll('"DNES"', `"${den(0)}"`).replaceAll('"ZITRA"', `"${den(1)}"`));
};
const FIX = nacti('k69-b9-rozlozeni-smena');
const KIOSK = roleMine('kiosk');
const STRANKA = 'kiosk.smena';

/** Pražské „HH:MM:SS" pro čas posunutý o minuty od teď (tvar, v jakém rozpis vrací Postgres). */
const prahaHMS = (posunMin) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  .format(new Date(TED + posunMin * 60000));
const isoPred = (min) => new Date(TED - min * 60000).toISOString();

/**
 * Roster kolem teď: Martin (PIN) na směně, která skončila před hodinou → „po plánu";
 * Jakub na směně bez rozpisu → „bez rozpisu"; Lucie přišla o půl hodiny pozdě,
 * Petr má nastoupit za tři čtvrtě hodiny; dalších sedm lidí, ať je nad mřížkou hledání.
 */
const roster = () => ({
  roster: [
    { id: 1, name: 'Martin Nemeškal', avatar: '🧑', hasPin: true, openSince: isoPred(180), openEntryId: 501, shiftStart: prahaHMS(-180), shiftEnd: prahaHMS(-60) },
    { id: 3, name: 'Jakub Horák', avatar: '🧔', hasPin: false, openSince: isoPred(95), openEntryId: 502, shiftStart: null, shiftEnd: null },
    { id: 8, name: 'Lucie Černá', avatar: '👩‍🦰', hasPin: true, openSince: null, openEntryId: null, shiftStart: prahaHMS(-30), shiftEnd: prahaHMS(450) },
    { id: 7, name: 'Petr Novák', avatar: '🧑‍🍳', hasPin: false, openSince: null, openEntryId: null, shiftStart: prahaHMS(45), shiftEnd: prahaHMS(500) },
    { id: 2, name: 'Eva Testová', avatar: '👩', hasPin: true, openSince: null, openEntryId: null, shiftStart: prahaHMS(120), shiftEnd: prahaHMS(600) },
    { id: 6, name: 'Zuzana Vedoucí', avatar: '👩‍💼', hasPin: false, openSince: null, openEntryId: null, shiftStart: null, shiftEnd: null },
    { id: 4, name: 'Tereza Malá', avatar: '👱‍♀️', hasPin: false, openSince: null, openEntryId: null, shiftStart: null, shiftEnd: null },
    { id: 5, name: 'Ondřej Kučera', avatar: null, hasPin: true, openSince: null, openEntryId: null, shiftStart: null, shiftEnd: null },
    { id: 9, name: 'Filip Dvořák', avatar: '🧑‍🦱', hasPin: false, openSince: null, openEntryId: null, shiftStart: null, shiftEnd: null },
    { id: 10, name: 'Karolína Šťastná', avatar: '👩‍🦱', hasPin: false, openSince: null, openEntryId: null, shiftStart: null, shiftEnd: null },
    { id: 11, name: 'Adam Brigádník', avatar: '🧑‍🎓', hasPin: false, openSince: null, openEntryId: null, shiftStart: null, shiftEnd: null },
  ],
  entries: [],
});

/** Podvrh: roster kolem teď, předávka a dnešní průběhy ve tvaru skutečných rout, zápis docházky se zaznamená. */
const podvrh = (req, json, stav) => {
  const path = new URL(req.url()).pathname;
  const m = req.method();
  if (path === '/api/attendance' && m === 'GET') return json(roster());
  if (path === '/api/attendance' && m === 'POST') {
    // Tvar skutečné routy: odchod vrací entry (clockIn, clockOut) a closingDone.
    const telo = req.postDataJSON();
    (stav.dochazka ??= []).push(telo);
    const clen = roster().roster.find(r => r.id === telo.employeeId);
    if (telo.action === 'out') return json({ ok: true, action: 'out', entry: { id: clen?.openEntryId ?? 1, clockIn: clen?.openSince ?? isoPred(60), clockOut: new Date(TED).toISOString() }, closingDone: stav.uzaverkaHotova ?? true });
    return json({ ok: true, action: telo.action, entry: { id: 900, clockIn: new Date(TED).toISOString(), clockOut: null } });
  }
  if (path === '/api/closings/handover' && m === 'GET') return json(nacti('k69-b9-handover'));
  // Tablet má od kola 7 rozvrh.nahled: Dnešní směny berou náhled rozvrhu týmu (tvar skutečné routy).
  if (path === '/api/shifts' && m === 'GET' && new URL(req.url()).searchParams.get('team') === '1') return json(tymoveSmeny());
  // Dnešní průběhy: jen otevírání hotové, Zavírací rutina (povinná) ještě neběžela → odznak Postupů.
  if (path === '/api/procedures/runs' && m === 'GET') return json({ runs: nacti('k69-b6b-runs').runs.filter(r => r.procedure_id !== 2) });
  return undefined;
};

const nastroj = (p) => p.locator(`[data-plocha="${STRANKA}"] li[data-widget="nastroj"]`);
const otevriTablet = async (p) => {
  await p.goto(BASE + '/kiosk', { waitUntil: 'networkidle' });
  await p.locator(`[data-plocha="${STRANKA}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(900);
};
const zalozka = (p, nazev) => p.locator('nav').getByRole('button', { name: new RegExp(`^${nazev}`) });

// ---------------------------------------------------------------------------
// 1) Rozložení a „Kdo teď pracuje": plán proti skutečnosti, odchod s PINem, výběr osoby
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'kiosk', viewport: { width: 768, height: 1024 }, mobil: true, fix: FIX, mineData: KIOSK, dalsi: podvrh });
  await ctx.clock.install({ time: TED });
  await otevriTablet(p);
  console.log(await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('main .card, main > div').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.height < 30) return;
      out.push(`${Math.round(r.left)}–${Math.round(r.right)} (${Math.round(r.width)}px) ${(el.textContent || '').trim().slice(0, 32)}`);
    });
    const nav = document.querySelector('nav');
    if (nav) out.push(`NAV scrollWidth ${nav.scrollWidth} clientWidth ${nav.clientWidth}`);
    return out.join('\n');
  }));
  tvrdi('rozložení: pás záložek bez vodorovného posuvu', await p.evaluate(() => { const n = document.querySelector('nav'); return !!n && n.scrollWidth <= n.clientWidth + 1; }));
  tvrdi('rozložení: stránka bez vodorovného přetečení', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  const radekMartin = nastroj(p).locator('ul.list > li', { hasText: 'Martin Nemeškal' });
  const radekJakub = nastroj(p).locator('ul.list > li', { hasText: 'Jakub Horák' });
  const textMartin = await radekMartin.innerText();
  tvrdi('na směně: řádek nese „od HH:MM", délku a „plán do"', /od \d{1,2}:\d{2}/.test(textMartin) && /\d+ h \d{2} min|\d+ min/.test(textMartin) && /plán do \d{1,2}:\d{2}/.test(textMartin), textMartin.replace(/\n/g, ' | '));
  tvrdi('na směně: směna skončila před hodinou → chip „po plánu +N min"', /po plánu \+(5\d|6\d) min/.test(textMartin), textMartin.replace(/\n/g, ' | '));
  tvrdi('na směně: bez rozpisu → chip „bez rozpisu", žádné „plán do"', (await radekJakub.innerText()).includes('bez rozpisu') && !(await radekJakub.innerText()).includes('plán do'));
  tvrdi('na směně: řádky zůstaly jednořádkové (ocas vpravo, ne pod jménem)', await radekMartin.evaluate(li => {
    const jmeno = li.querySelector('.font-medium')?.getBoundingClientRect();
    const chip = [...li.querySelectorAll('.chip')].pop()?.getBoundingClientRect();
    return !!jmeno && !!chip && Math.abs((jmeno.top + jmeno.height / 2) - (chip.top + chip.height / 2)) < jmeno.height * 1.5;
  }));
  tvrdi('na směně: nástroj bez přetečení', await nastroj(p).evaluate(li => li.scrollWidth <= li.clientWidth + 1));

  // Odchod člověka s PINem: číselník, PIN v těle požadavku.
  await radekMartin.getByRole('button', { name: 'Odchod – Martin Nemeškal' }).click();
  const okno = p.getByRole('dialog', { name: 'Martin Nemeškal' });
  tvrdi('odchod s PINem: okno se otevře a říká „Zadej PIN pro odchod"', await dokud(() => okno.getByText('Zadej PIN pro odchod').isVisible(), 2000));
  const odchod = okno.getByRole('button', { name: 'Odpíchnout odchod' });
  tvrdi('odchod s PINem: číselník je vidět a „Odpíchnout odchod" čeká na 4 číslice', await okno.getByRole('button', { name: '7', exact: true }).isVisible() && await odchod.isDisabled());
  for (const k of ['1', '2', '3', '4']) await okno.getByRole('button', { name: k, exact: true }).click();
  tvrdi('odchod s PINem: po 4 číslicích jde odpíchnout', await odchod.isEnabled());
  await odchod.click();
  tvrdi('odchod s PINem: POST /api/attendance nese action=out a pin', await dokud(() => (stav.dochazka ?? []).some(b => b.employeeId === 1 && b.action === 'out' && b.pin === '1234'), 2000), JSON.stringify(stav.dochazka));
  tvrdi('odchod s PINem: okno píchnutí se zavřelo', await dokud(async () => (await p.getByRole('dialog', { name: 'Martin Nemeškal', exact: true }).count()) === 0, 2000));
  // Souhrn směny: uzávěrka hotová → jen „Hotovo", žádná cesta k uzávěrce.
  const souhrn = p.getByRole('dialog', { name: 'Martin Nemeškal, díky za směnu' });
  tvrdi('souhrn: po odchodu okno „Martin Nemeškal, díky za směnu"', await dokud(() => souhrn.isVisible(), 2000));
  const textSouhrnu = (await souhrn.innerText().catch(() => '')).replace(/\s+/g, ' ');
  tvrdi('souhrn: Příchod · Odchod · Odpracováno „3 h 00 min"', /Příchod \d{1,2}:\d{2}/i.test(textSouhrnu) && /Odchod \d{1,2}:\d{2}/i.test(textSouhrnu) && /Odpracováno 3 h 0[01] min/i.test(textSouhrnu), textSouhrnu);
  tvrdi('souhrn: s hotovou uzávěrkou bez „Uzávěrka chybí" a bez „Vyplnit uzávěrku", hlavní „Hotovo"',
    !/Uzávěrka chybí/.test(textSouhrnu) && await souhrn.getByRole('button', { name: 'Vyplnit uzávěrku' }).count() === 0 && await souhrn.getByRole('button', { name: 'Hotovo' }).count() === 1);
  await souhrn.getByRole('button', { name: 'Hotovo' }).click();
  tvrdi('souhrn: „Hotovo" okno zavře', await dokud(async () => (await souhrn.count()) === 0, 2000));

  // Výběr osoby pro další příchod: skupiny, hledání, prázdný výsledek.
  await nastroj(p).getByRole('button', { name: 'Další příchod' }).click();
  const vyber = nastroj(p);
  tvrdi('výběr: od devíti lidí je nad mřížkou hledání bez autofocusu', await dokud(() => vyber.getByPlaceholder('Hledat jméno…').isVisible(), 1500)
    && await p.evaluate(() => document.activeElement?.getAttribute('placeholder') !== 'Hledat jméno…'));
  tvrdi('výběr: skupiny „Dnes na rozpisu" a „Ostatní"', await vyber.getByRole('heading', { name: 'Dnes na rozpisu' }).isVisible() && await vyber.getByRole('heading', { name: 'Ostatní' }).isVisible());
  const poradi = await vyber.locator('section button .t-card').allInnerTexts();
  tvrdi('výběr: nejdřív rozpis podle začátku (Lucie, Petr, Eva), pak ostatní abecedně (Adam … Zuzana)',
    poradi.slice(0, 3).join(',') === 'Lucie Černá,Petr Novák,Eva Testová' && poradi[3] === 'Adam Brigádník' && poradi.at(-1) === 'Zuzana Vedoucí', poradi.join(','));
  tvrdi('výběr: dlaždice drží „Dnes HH:MM–HH:MM" bez sekund', /Dnes \d{1,2}:\d{2}–\d{1,2}:\d{2}$/.test((await vyber.getByRole('button', { name: /Eva Testová/ }).innerText()).trim()), await vyber.getByRole('button', { name: /Eva Testová/ }).innerText());
  await vyber.getByPlaceholder('Hledat jméno…').fill('cerna');
  tvrdi('výběr: hledání bez diakritiky najde Lucii Černou a jen ji', await dokud(async () => (await vyber.locator('section button .t-card').allInnerTexts()).join() === 'Lucie Černá', 1500));
  tvrdi('výběr: při hledání bez nadpisu „Ostatní" (skupina prázdná)', await vyber.getByRole('heading', { name: 'Ostatní' }).count() === 0);
  await vyber.getByPlaceholder('Hledat jméno…').fill('xyz');
  tvrdi('výběr: nic nenalezeno → „Nikdo takový"', await dokud(() => vyber.getByText('Nikdo takový').isVisible(), 1500));
  await vyber.getByPlaceholder('Hledat jméno…').fill('');

  // Pozdní a brzký příchod — jen chipy, nic se neblokuje.
  await vyber.getByRole('button', { name: /Lucie Černá/ }).click();
  const oknoLucie = p.getByRole('dialog', { name: 'Lucie Černá' });
  tvrdi('příchod: půl hodiny po začátku → chip „Přicházíš o 30 min později"', await dokud(() => oknoLucie.getByText(/Přicházíš o (29|30|31) min později/).isVisible(), 2000));
  tvrdi('příchod: s PINem říká „Zadej PIN pro příchod"', await oknoLucie.getByText('Zadej PIN pro příchod').isVisible());
  tvrdi('příchod: pozdní příchod jde odpíchnout (tlačítko čeká jen na PIN)', await oknoLucie.getByRole('button', { name: 'Odpíchnout příchod' }).count() === 1);
  await oknoLucie.getByRole('button', { name: 'Zpět' }).click();
  await nastroj(p).getByRole('button', { name: 'Další příchod' }).click();
  await nastroj(p).getByRole('button', { name: /Petr Novák/ }).click();
  const oknoPetr = p.getByRole('dialog', { name: 'Petr Novák' });
  tvrdi('příchod: tři čtvrtě hodiny před začátkem → „Směna začíná za 45 min", bez číselníku', await dokud(() => oknoPetr.getByText(/Směna začíná za (44|45|46) min/).isVisible(), 2000)
    && await oknoPetr.getByText('Zadej PIN pro příchod').count() === 0);
  tvrdi('příchod: brzký příchod není zablokovaný', await oknoPetr.getByRole('button', { name: 'Odpíchnout příchod' }).isEnabled());
  await oknoPetr.getByRole('button', { name: 'Zpět' }).click();

  // Záložky: plná role tabletu má všech sedm, Úkoly a Postupy nesou odznak.
  tvrdi('záložky: plná role tabletu má Sklad i Objednávky', await zalozka(p, 'Sklad').count() === 1 && await zalozka(p, 'Objednávky').count() === 1);
  tvrdi('záložky: Úkoly nesou odznak s počtem (úkol po termínu z fixtury)', await dokud(() => zalozka(p, 'Úkoly').getByText(/^Nesplněné úkoly: [1-9]\d*$/).count().then(n => n === 1), 3000));
  tvrdi('záložky: Postupy nesou odznak (povinná Zavírací rutina ještě neběžela)', await dokud(() => zalozka(p, 'Postupy').getByText(/^Nehotové povinné postupy: [1-9]\d*$/).count().then(n => n === 1), 3000));
  tvrdi('záložky: Uzávěrka odznak nemá', await zalozka(p, 'Uzávěrka').locator('.pop-in').count() === 0);
  tvrdi('bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 2) Role tabletu bez sklad.zobrazit: záložka Sklad není, aktivní Sklad padá na Směnu
// ---------------------------------------------------------------------------
{
  const bez = roleMine('kiosk', ['sklad.zobrazit', 'objednavky.zobrazit']);
  const { ctx, p, stav } = await kontext({ role: 'kiosk', viewport: { width: 768, height: 1024 }, mobil: true, fix: FIX, mineData: bez, dalsi: podvrh });
  await ctx.clock.install({ time: TED });
  await otevriTablet(p);
  await p.waitForTimeout(600);
  tvrdi('role bez skladu: záložka Sklad ani Objednávky nejsou, Směna, Úkoly, Postupy, Uzávěrka a Návody ano',
    await zalozka(p, 'Sklad').count() === 0 && await zalozka(p, 'Objednávky').count() === 0 && await p.locator('nav button').count() === 5);
  tvrdi('role bez skladu: /api/inventory se z tabletu nevolá', stav.dotazy.filter(d => d.path.startsWith('/api/inventory')).length === 0);
  tvrdi('role bez skladu: Směna zůstává vybraná', await zalozka(p, 'Směna').getAttribute('aria-current') === 'page');
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 3) Oprávnění dorazí později: do té doby jen Směna (žádný záblesk Skladu), pak zbytek
// ---------------------------------------------------------------------------
{
  const bez = roleMine('kiosk', ['sklad.zobrazit']);
  const { ctx, p } = await kontext({ role: 'kiosk', viewport: { width: 768, height: 1024 }, mobil: true, fix: FIX, mineData: bez, mineZpozdeni: 6000, dalsi: podvrh });
  await ctx.clock.install({ time: TED });
  await p.goto(BASE + '/kiosk', { waitUntil: 'load' });
  await dokud(() => zalozka(p, 'Směna').isVisible().catch(() => false), 8000);
  tvrdi('pozdní oprávnění: před odpovědí /api/teams/mine je v pásu jen Směna (useSmi je přísné)', await p.locator('nav button').count() === 1 && await zalozka(p, 'Směna').getAttribute('aria-current') === 'page');
  tvrdi('pozdní oprávnění: po dočtení role přibudou záložky bez Skladu a tablet je dál na Směně',
    await dokud(async () => (await p.locator('nav button').count()) === 6, 9000) && await zalozka(p, 'Sklad').count() === 0 && await zalozka(p, 'Směna').getAttribute('aria-current') === 'page');
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 4) Souhrn směny bez uzávěrky: „Uzávěrka chybí", „Vyplnit uzávěrku" přepne záložku;
//    okno se samo zavře po 20 s a dotyk odpočet zastaví (sdílený tablet)
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav } = await kontext({ role: 'kiosk', viewport: { width: 810, height: 1080 }, mobil: true, fix: FIX, mineData: KIOSK, dalsi: podvrh });
  await ctx.clock.install({ time: TED });
  stav.uzaverkaHotova = false;
  await otevriTablet(p);
  const odpichni = async (jmeno) => {
    await nastroj(p).locator('ul.list > li', { hasText: jmeno }).getByRole('button', { name: `Odchod – ${jmeno}` }).click();
    const okno = p.getByRole('dialog', { name: jmeno, exact: true });
    await okno.waitFor({ timeout: 3000 });
    if (await okno.getByText('Zadej PIN pro odchod').isVisible().catch(() => false)) for (const k of ['1', '2', '3', '4']) await okno.getByRole('button', { name: k, exact: true }).click();
    await okno.getByRole('button', { name: 'Odpíchnout odchod' }).click();
    const souhrn = p.getByRole('dialog', { name: `${jmeno}, díky za směnu` });
    await dokud(() => souhrn.isVisible(), 3000);
    return souhrn;
  };
  const s1 = await odpichni('Martin Nemeškal');
  tvrdi('bez uzávěrky: Chip „Uzávěrka chybí"', await s1.getByText('Uzávěrka chybí').isVisible().catch(() => false));
  tvrdi('bez uzávěrky: odpočet „Zavře se samo za N s" je vidět', await s1.getByText(/Zavře se samo za \d+ s/).isVisible().catch(() => false));
  const cislo = await s1.locator('.stat-hodnota').first().evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  tvrdi('souhrn: čísla čitelná z metru (Stat 28 px)', cislo >= 28, String(cislo));
  const vyplnit = s1.getByRole('button', { name: 'Vyplnit uzávěrku' });
  tvrdi('bez uzávěrky: hlavní akce „Vyplnit uzávěrku" (tmavá, ne limetka) a cíl ≥ 48 px',
    // offsetHeight, ne boundingBox: okno ještě dojíždí animací (scale) a rámeček by byl menší.
    await vyplnit.count() === 1 && !/bg-\[#C8F542\]/i.test(await vyplnit.getAttribute('class') ?? '') && (await vyplnit.evaluate(e => e.offsetHeight)) >= 48,
    `${await vyplnit.getAttribute('class')} ${await vyplnit.evaluate(e => e.offsetHeight)}`);
  await vyplnit.click();
  tvrdi('„Vyplnit uzávěrku": okno se zavře a tablet přepne na záložku Uzávěrka',
    await dokud(async () => (await s1.count()) === 0 && (await zalozka(p, 'Uzávěrka').getAttribute('aria-current')) === 'page', 3000));

  // Samo se zavře: nikdo se tabletu nedotkne.
  await zalozka(p, 'Směna').click();
  await p.locator(`[data-plocha="${STRANKA}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 8000 });
  const s2 = await odpichni('Jakub Horák');
  tvrdi('samo: souhrn Jakuba je otevřený', await s2.isVisible().catch(() => false));
  const prvni = Number((await s2.getByText(/Zavře se samo za \d+ s/).innerText().catch(() => '')).match(/\d+/)?.[0]);
  await p.waitForTimeout(2200);
  const druhy = Number((await s2.getByText(/Zavře se samo za \d+ s/).innerText().catch(() => '')).match(/\d+/)?.[0]);
  tvrdi('samo: odpočet běží (číslo klesá)', prvni > druhy && druhy > 0, `${prvni} → ${druhy}`);
  tvrdi('samo: po 20 s bez dotyku okno zmizí', await dokud(async () => (await s2.count()) === 0, 21000, 250));

  // Dotyk odpočet zastaví.
  const s3 = await odpichni('Jakub Horák');
  await s3.getByText('Odpracováno').click();
  tvrdi('dotyk: odpočet se zastaví a okno to řekne', await dokud(() => s3.getByText('Okno zůstane otevřené, dokud ho nezavřeš.').isVisible(), 2000));
  await p.waitForTimeout(2500);
  tvrdi('dotyk: okno po dotyku zůstává otevřené', await s3.isVisible().catch(() => false));
  await s3.getByRole('button', { name: 'Hotovo' }).click();
  tvrdi('dotyk: „Hotovo" zavře', await dokud(async () => (await s3.count()) === 0, 2000));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 5) Sklad na tabletu: Dochází / Kriticky s počty, minimum v meta, proklik z widgetu
// ---------------------------------------------------------------------------
{
  // Jen Martin na směně → tablet ví, kdo u něj stojí (WhoFirst se neptá).
  const jeden = (req, json, stav) => {
    const u = new URL(req.url());
    if (u.pathname === '/api/attendance' && req.method() === 'GET') return json({ ...roster(), roster: roster().roster.map(r => (r.id === 1 ? r : { ...r, openSince: null, openEntryId: null })) });
    return podvrh(req, json, stav);
  };
  const { ctx, p, chyby } = await kontext({ role: 'kiosk', viewport: { width: 768, height: 1024 }, mobil: true, fix: FIX, mineData: KIOSK, dalsi: jeden });
  await ctx.clock.install({ time: TED });
  await otevriTablet(p);
  await zalozka(p, 'Sklad').click();
  const pas = p.getByRole('tablist', { name: 'Stav zásob' });
  tvrdi('sklad: nad kategoriemi Segmented „Stav zásob"', await dokud(() => pas.isVisible().catch(() => false), 8000));
  const dochazi = pas.getByRole('tab', { name: /^Dochází/ });
  const kriticky = pas.getByRole('tab', { name: /^Kriticky/ });
  tvrdi('sklad: počty Dochází 4 a Kriticky 3 (bez neschválených a odložených navíc)', await dokud(async () => (await dochazi.innerText()).replace(/\s+/g, '') === 'Dochází4' && (await kriticky.innerText()).replace(/\s+/g, '') === 'Kriticky3', 5000),
    `${await dochazi.innerText()} / ${await kriticky.innerText()}`);
  tvrdi('sklad: Segmented v jednom řádku bez posuvu, cíle ≥ 48 px', await pas.evaluate(e => e.scrollWidth <= e.clientWidth + 1) && ((await dochazi.boundingBox())?.height ?? 0) >= 47.5,
    `${await pas.evaluate(e => `${e.scrollWidth}/${e.clientWidth}`)} výška ${(await dochazi.boundingBox())?.height}`);
  // Název řádku = první textový uzel titulku ListRow (za ním je značka výrobce).
  const nazvy = () => p.locator('main ul.list > li span.block.font-medium.truncate').evaluateAll(els => els.map(e => e.childNodes[0]?.textContent?.trim()).filter(Boolean));
  tvrdi('sklad: řazení kriticky › dochází › ok, pak název', (await nazvy()).slice(0, 4).join('|') === 'Citrony|Domácí limonáda zázvorová|Sirup Monin Levandule|Matcha Ceremonial', (await nazvy()).join('|'));
  await dochazi.click();
  tvrdi('sklad: Dochází nechá jen 4 položky pod minimem', await dokud(async () => (await nazvy()).length === 4, 2000), (await nazvy()).join('|'));
  const matcha = p.locator('main ul.list > li', { hasText: 'Matcha Ceremonial' });
  const textMatcha = (await matcha.innerText()).replace(/\s+/g, ' ');
  tvrdi('sklad: meta „min 2 kg · chybí 1"', /min 2 kg · chybí 1/.test(textMatcha), textMatcha);
  tvrdi('sklad: u kritického sirupu „min 2 ks · chybí 2"', /min 2 ks · chybí 2/.test((await p.locator('main ul.list > li', { hasText: 'Sirup Monin' }).innerText()).replace(/\s+/g, ' ')));
  await kriticky.click();
  tvrdi('sklad: Kriticky nechá 3 položky', await dokud(async () => (await nazvy()).length === 3, 2000), (await nazvy()).join('|'));
  tvrdi('sklad: stránka bez přetečení', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  // Proklik z widgetu Docházející zásoby na Směně: řádek Matchy → Sklad s Dochází a kategorií.
  await zalozka(p, 'Směna').click();
  const widget = p.locator(`[data-plocha="${STRANKA}"] li[data-widget="sklad.dochazi"]`);
  await widget.waitFor({ timeout: 8000 });
  await widget.getByText('Matcha Ceremonial').click();
  tvrdi('proklik: tablet přepne na Sklad', await dokud(async () => (await zalozka(p, 'Sklad').getAttribute('aria-current')) === 'page', 3000));
  tvrdi('proklik: vybrané Dochází a kategorie Čaje sypané', await dokud(async () => (await pas.getByRole('tab', { name: /^Dochází/ }).getAttribute('aria-selected')) === 'true'
    && (await p.getByRole('button', { name: 'Čaje sypané', exact: true }).getAttribute('aria-pressed')) === 'true', 4000));
  tvrdi('proklik: seznam ukazuje jen Matchu', await dokud(async () => (await nazvy()).join('|') === 'Matcha Ceremonial', 2000), (await nazvy()).join('|'));
  tvrdi('sklad: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 6) Týdenní rozpis: vedení přidá tabletu widget Kdo má směnu (doporučený, ne výchozí)
// ---------------------------------------------------------------------------
{
  const dnesP = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(TED));
  const zaDni = (n) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(TED + n * 86400000));
  const fix = { ...FIX, polozky: [...FIX.polozky, { id: 'tym-nahled', widget: 'rozvrh.tym_nahled', velikost: 'L', nastaveni: { rozsah: 'tyden' } }] };
  const smeny = (req, json, stav) => {
    const u = new URL(req.url());
    if (u.pathname === '/api/shifts' && u.searchParams.get('team') === '1') {
      (stav.tymDotazy ??= []).push(u.search);
      // Tvar skutečné routy (app/api/shifts, team=1): enabled + shifts se jménem, časy a isMine.
      return json({ enabled: true, shifts: [
        { id: 71, date: dnesP, startTime: '08:00', endTime: '16:00', type: 'morning', employeeId: 2, employeeName: 'Eva Testová', employeeAvatar: '👩', isMine: false },
        { id: 72, date: dnesP, startTime: '14:00', endTime: '22:00', type: 'afternoon', employeeId: 3, employeeName: 'Jakub Horák', employeeAvatar: '🧔', isMine: false },
        { id: 73, date: zaDni(1), startTime: '07:00', endTime: '15:00', type: 'morning', employeeId: 8, employeeName: 'Lucie Černá', employeeAvatar: '👩‍🦰', isMine: false },
        { id: 74, date: zaDni(5), startTime: '10:00', endTime: '18:00', type: 'day', employeeId: 7, employeeName: 'Petr Novák', employeeAvatar: '🧑‍🍳', isMine: false },
      ] });
    }
    return podvrh(req, json, stav);
  };
  const { ctx, p, stav, chyby } = await kontext({ role: 'kiosk', viewport: { width: 810, height: 1080 }, mobil: true, fix, mineData: KIOSK, dalsi: smeny });
  await ctx.clock.install({ time: TED });
  await otevriTablet(p);
  const w = p.locator(`[data-plocha="${STRANKA}"] li[data-widget="rozvrh.tym_nahled"]`);
  tvrdi('rozpis: widget Kdo má směnu se na tabletu vykreslí', await dokud(() => w.isVisible().catch(() => false), 8000));
  tvrdi('rozpis: kreslí data z /api/shifts?team=1 (dnes i další dny týdne)', await dokud(async () => {
    const tx = await w.innerText().catch(() => '');
    return /Eva Testová/.test(tx) && /Lucie Černá/.test(tx) && /Petr Novák/.test(tx);
  }, 6000) && (stav.tymDotazy ?? []).some(q => q.includes('team=1')), (await w.innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 200));
  tvrdi('rozpis: bez odkazu Moje směny (tablet nemá kam vést)', await w.getByRole('link', { name: /Moje směny/ }).count() === 0 && await w.getByRole('button', { name: /Moje směny/ }).count() === 0);
  tvrdi('rozpis: widget bez přetečení', await w.evaluate(li => li.scrollWidth <= li.clientWidth + 1));
  tvrdi('rozpis: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
