// Tablet (/kiosk) na 768 × 1024 s dotykem: rozložení záložek a plochy Směna, a od
// kola 6 (balík B4) nástroj „Kdo teď pracuje" a výběr osoby:
//   - odchod člověka s PINem otevře číselník a PIN pošle (server ho u action=out chce);
//   - řádek na směně nese „od · délka · plán do" a chip „po plánu" / „bez rozpisu";
//   - výběr osoby: „Dnes na rozpisu" / „Ostatní", od devíti lidí hledání, prázdný výsledek;
//   - příchod proti rozpisu: chip „Přicházíš o N min později" / „Směna začíná za N min";
//   - záložky podle role tabletu: bez sklad.zobrazit není Sklad; odznaky Úkolů a Postupů.
// Rozpis se skládá z časů kolem „teď", ať sonda neplatí na to, kdy běží.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/kiosk.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, dokud, roleMine, DIR, BASE } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const FIX = nacti('k69-b9-rozlozeni-smena');
const KIOSK = roleMine('kiosk');
const STRANKA = 'kiosk.smena';

/** Pražské „HH:MM:SS" pro čas posunutý o minuty od teď (tvar, v jakém rozpis vrací Postgres). */
const prahaHMS = (posunMin) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  .format(new Date(Date.now() + posunMin * 60000));
const isoPred = (min) => new Date(Date.now() - min * 60000).toISOString();

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
  if (path === '/api/attendance' && m === 'POST') { (stav.dochazka ??= []).push(req.postDataJSON()); return json({ ok: true, action: req.postDataJSON().action, closingDone: true }); }
  if (path === '/api/closings/handover' && m === 'GET') return json(nacti('k69-b9-handover'));
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
  tvrdi('odchod s PINem: okno se zavřelo', await dokud(async () => (await okno.count()) === 0, 2000));

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
  await p.goto(BASE + '/kiosk', { waitUntil: 'load' });
  await dokud(() => zalozka(p, 'Směna').isVisible().catch(() => false), 8000);
  tvrdi('pozdní oprávnění: před odpovědí /api/teams/mine je v pásu jen Směna (useSmi je přísné)', await p.locator('nav button').count() === 1 && await zalozka(p, 'Směna').getAttribute('aria-current') === 'page');
  tvrdi('pozdní oprávnění: po dočtení role přibudou záložky bez Skladu a tablet je dál na Směně',
    await dokud(async () => (await p.locator('nav button').count()) === 6, 9000) && await zalozka(p, 'Sklad').count() === 0 && await zalozka(p, 'Směna').getAttribute('aria-current') === 'page');
  await ctx.close();
}

await konec();
