// Rozvrh — úpravy vygenerovaného návrhu se nesmí ztratit a okno dne ukazuje tým
// s dostupností.
//
// Chyba, kterou sonda hlídá: po „Vygenerovat rozvrh" a ručních úpravách v okně
// dne (někoho odebrat, někoho přidat) a kliknutí na „Publikovat" se v rozvrhu
// objevil původní návrh. Příčina: „Přidat směnu" v okně dne zapisovalo rovnou
// do uložených směn (POST /api/schedule), zatímco návrh zůstal jen v prohlížeči;
// Publikovat poslal jen {month} a návrh ignoroval, a pozdější „Potvrdit
// a uložit" (výchozí s přepsáním měsíce) ruční přidání smazalo a uložilo
// původní návrh. Teď: přidání jde do návrhu, Publikovat návrh nejdřív uloží
// (tělo commitu = přesně to, co je vidět) a teprve pak publikuje.
//
// Okno dne: celý tým se stavem na ten den (může / jen typ / nemůže / volno /
// nevyplněno), poznámka, pořadí, „Přidat" s výběrem typu, u „nemůže" jen
// s potvrzením, bez dostupnost.zobrazit se sekce nekreslí ani nenačítá.
//
// Po review navíc: upravený návrh se bez ptaní nezahodí (Vygenerovat znovu,
// Zahodit náhled, přepnutí přepisu měsíce), s návrhem nejdou zápisy rovnou do
// DB (Import, Kopírovat týden, Upravit podle požadavků), odchod jinam se
// zeptá, přepis uložených směn se před publikováním potvrdí, dvě ukládací
// tlačítka = jeden commit, commit nese verzi měsíce a 409 návrh nechá.
//
// Fixtury: k69-b1-generate/-schedule (návrh a uložené směny) a rozvrh-navrh-*
// (dostupnost a volno na den PRISTI-06).
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, dotazyNa, mine, ROLE, DIR, OUT } from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const MESIC = praha(0).slice(0, 7);
const PRISTI = (() => { const [y, m] = MESIC.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
const nacti = (jmeno, mesic = PRISTI) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8')
  .replaceAll('PRISTI', PRISTI).replaceAll('"@-', `"${mesic}-`).replaceAll('"ZITRA"', `"${praha(1)}"`).replaceAll('"POZITRI"', `"${praha(2)}"`));

/**
 * Podvrh API rozvrhu; každý zápis (i commit návrhu) jde do `stav.zapisy` s pořadím.
 * `konflikt`: commit vrátí 409 (jiná záložka mezitím změnila měsíc).
 * `pomalyCommit`: commit odpoví až po 900 ms (na souběh dvou tlačítek).
 */
const podvrh = ({ konflikt = false, pomalyCommit = false } = {}) => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const q = url.searchParams;
  if (req.method() !== 'GET') {
    const body = req.postData() || '';
    if (path.startsWith('/api/schedule') || path === '/api/availability') {
      (stav.zapisy ??= []).push({ m: req.method(), path, body, i: (stav.zapisy ?? []).length });
    }
    if (path === '/api/schedule/generate') {
      if (!JSON.parse(body || '{}').commit) return json(nacti('k69-b1-generate'));
      if (konflikt) return json({ error: 'Rozvrh tohoto měsíce mezitím někdo změnil (jiné okno nebo zařízení). Nic se neuložilo — návrh zůstal otevřený, zkontroluj uložené směny a ulož znovu.', konflikt: true }, 409);
      if (pomalyCommit) return new Promise(res => setTimeout(() => res(json({ ok: true, inserted: 2 })), 900));
      return json({ ok: true, inserted: 2 });
    }
    if (path === '/api/schedule/publish') return json({ ok: true, notified: 3 });
    if (path === '/api/schedule') return json({ inserted: 1 });
    return undefined;
  }
  // `verze` = otisk uloženého měsíce; commit ho musí poslat zpátky (hlídání souběhu).
  if (path === '/api/schedule') return json({ ...nacti('k69-b1-schedule', q.get('month') ?? PRISTI), verze: 'verze-sonda' });
  if (path === '/api/schedule/rules') return json(nacti('k69-b1-rules'));
  if (path === '/api/availability') return json(q.get('mine') ? null : nacti('rozvrh-navrh-availability'));
  if (path === '/api/timeoff') return json(nacti('rozvrh-navrh-timeoff'));
  if (path === '/api/shifts/offers') return json([]);
  if (path === '/api/fixed-assignments') return json({ assignments: [] });
  if (path === '/api/events') return json({ events: [] });
  return undefined;
};

// Plocha jen s nástrojem — widgety sonda neřeší, jen by přidávaly dotazy.
const FIX = { ...nacti('k69-b1-rozlozeni-rozvrh'), polozky: [{ id: 'nastroj', widget: 'nastroj', velikost: 'L' }] };
const ROZVRH = '/employer/overview?view=shifts';
const DEN = `${PRISTI}-06`;
const nazevDne = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }); };
const bunka = (p, d) => p.locator(`[data-plocha] button[aria-label^="${nazevDne(d)}:"]`);
const okno = (p) => p.getByRole('dialog');
const tym = (p) => okno(p).locator('[data-tym-den]');
const radek = (p, jmeno) => tym(p).locator('li.list-row').filter({ hasText: jmeno });
const commity = (stav) => (stav.zapisy ?? []).filter(z => z.path === '/api/schedule/generate' && JSON.parse(z.body || '{}').commit);
const publikace = (stav) => (stav.zapisy ?? []).filter(z => z.path === '/api/schedule/publish');
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function vygeneruj(p) {
  await p.getByRole('button', { name: 'Vygenerovat rozvrh' }).click();
  return dokud(() => p.getByText('Navržený rozvrh').isVisible(), 4000);
}
async function otevriDen(p, d) {
  await bunka(p, d).click();
  return dokud(() => okno(p).getByText('Přiřazené směny').isVisible(), 3000);
}

// 1) BUG: úpravy návrhu + Publikovat → uloží se upravený návrh, pak teprve publikace.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  tvrdi('N1: Vygenerovat ukáže návrh', await vygeneruj(p));
  tvrdi('N1: s návrhem říká tlačítko „Uložit a publikovat"', await p.getByRole('button', { name: 'Uložit a publikovat' }).isVisible());
  tvrdi('N1: okno dne s návrhem se otevře', await otevriDen(p, DEN));
  await okno(p).getByRole('button', { name: 'Odebrat z návrhu — Eva Testová' }).click();
  tvrdi('N1: Eva z návrhu dne zmizela', await dokud(async () => await okno(p).getByRole('button', { name: 'Odebrat z návrhu — Eva Testová' }).count() === 0, 1500));
  await radek(p, 'Lukáš Beneš').getByRole('button', { name: 'Přidat — Lukáš Beneš' }).click();
  const potvrdit = okno(p).getByRole('button', { name: 'Přidat do návrhu' }).first();
  tvrdi('N1: rozbalené přidání nabízí „Přidat do návrhu"', await dokud(() => potvrdit.isVisible(), 1500));
  await potvrdit.click();
  tvrdi('N1: Lukáš je v navržených směnách dne', await dokud(async () => await okno(p).getByRole('button', { name: 'Odebrat z návrhu — Lukáš Beneš' }).count() === 1, 1500));
  tvrdi('N1: přidání ohlásí hláška (role=status) a fokus zůstane u Lukáše', await dokud(async () => (await okno(p).locator('[data-hlaska-tym]').innerText()).includes('Lukáš Beneš — přidáno do návrhu'), 1500)
    && await dokud(() => p.evaluate(() => { const a = document.activeElement; return a?.getAttribute('aria-label') === 'Přidat — Lukáš Beneš' || a?.hasAttribute('data-hlaska-tym'); }), 1500));
  tvrdi('N1: přidání do návrhu nic nezapsalo do uložených směn (žádný POST /api/schedule)', !(stav.zapisy ?? []).some(z => z.path === '/api/schedule'));
  await p.screenshot({ path: OUT + 'rozvrh-navrh-den.png' });
  await okno(p).getByRole('button', { name: 'Zavřít' }).first().click();
  await dokud(async () => !(await okno(p).isVisible()), 2000);
  tvrdi('N1: s návrhem je limetkou „Uložit a publikovat", „Vygenerovat znovu" jen sekundárně',
    await p.getByRole('button', { name: 'Uložit a publikovat' }).evaluate(el => el.classList.contains('on-accent'))
    && await p.getByRole('button', { name: 'Vygenerovat znovu' }).evaluate(el => !el.classList.contains('on-accent')));
  await p.getByRole('button', { name: 'Uložit a publikovat' }).click();
  tvrdi('N1: přepis měsíce s uloženými směnami se nejdřív zeptá („Nahradit uložené směny?")', await dokud(() => okno(p).getByText('Nahradit uložené směny?').isVisible(), 2000)
    && (await okno(p).innerText()).includes('zmizí 4 směny'));
  tvrdi('N1: …a do potvrzení nic neuložil', commity(stav).length === 0);
  await okno(p).getByRole('button', { name: 'Nahradit a publikovat' }).click();
  tvrdi('N1: Uložit a publikovat → publikace odešla', await dokud(() => publikace(stav).length === 1, 4000));
  const c = commity(stav);
  const telo = c[0] ? JSON.parse(c[0].body) : { shifts: [] };
  const naDen = telo.shifts.filter(s => s.date === DEN).map(s => s.employeeId);
  tvrdi('N1: návrh se uložil jedním commitem', c.length === 1, `${c.length}×`);
  tvrdi('N1: tělo commitu = upravený návrh (Lukáš místo Evy na den 6.)', naDen.includes(21) && !naDen.includes(16), JSON.stringify(telo.shifts));
  tvrdi('N1: …a zbytek návrhu zůstal (Jakub 7.)', telo.shifts.some(s => s.employeeId === 17 && s.date === `${PRISTI}-07`));
  tvrdi('N1: commit nese verzi uloženého měsíce (hlídání souběhu dvou záložek)', telo.verze === 'verze-sonda', String(telo.verze));
  tvrdi('N1: publish se zavolal až po commitu', c[0] && publikace(stav)[0] && c[0].i < publikace(stav)[0].i);
  tvrdi('N1: po uložení návrh zmizel a tlačítko je zase „Publikovat"', await dokud(async () => !(await p.getByText('Navržený rozvrh').isVisible()) && await p.getByRole('button', { name: 'Publikovat', exact: true }).isVisible(), 3000));
  tvrdi('N1: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 2) Přepnutí měsíce s neuloženým návrhem se zeptá — žádná tichá ztráta.
{
  const { ctx, p, stav } = await kontext({ fix: FIX, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await vygeneruj(p);
  await p.getByRole('button', { name: 'Tento měsíc' }).click();
  tvrdi('N2: přepnutí měsíce s návrhem otevře „Návrh není uložený"', await dokud(() => okno(p).getByText('Návrh není uložený').isVisible(), 2000));
  tvrdi('N2: …a měsíc se zatím nepřepnul', (await p.getByRole('button', { name: 'Příští měsíc' }).getAttribute('aria-pressed')) === 'true');
  await okno(p).getByRole('button', { name: 'Uložit a přepnout' }).click();
  tvrdi('N2: Uložit a přepnout návrh uloží', await dokud(() => commity(stav).length === 1, 3000));
  tvrdi('N2: …a pak přepne měsíc', await dokud(async () => (await p.getByRole('button', { name: 'Tento měsíc' }).getAttribute('aria-pressed')) === 'true', 3000));
  await ctx.close();
}

// 3) Okno dne: tým se stavy, poznámkou a pořadím; přidání a překryv.
{
  const { ctx, p, stav } = await kontext({ fix: FIX, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  const dotazyDostupnosti = dotazyNa(stav, ['/api/availability']).length;
  await vygeneruj(p);
  await otevriDen(p, DEN);
  tvrdi('D1: okno dne má sekci „Tým na tento den"', await okno(p).getByText('Tým na tento den').isVisible());
  const poradi = await tym(p).locator('li.list-row').evaluateAll(els => els.map(e => e.querySelector(':scope > span.min-w-0 > span')?.textContent?.trim()));
  const ocekavane = ['Lukáš Beneš', 'Nikola Šťastná', 'Jakub Horák', 'Eva Testová', 'Petra Dvořáková', 'Tereza Malá'];
  tvrdi('D1: pořadí může → omezení → má směnu → volno/nemůže → nevyplněno', JSON.stringify(poradi.slice(0, 6)) === JSON.stringify(ocekavane)
    && ['Adam Pokorný', 'Klára Vlčková', 'Martin Nemeškal', 'Ondřej Kučera'].every(j => poradi.slice(6).includes(j)), JSON.stringify(poradi));
  tvrdi('D1: každý člověk jednou (i když ho seznam týmu vrátí dvakrát)', new Set(poradi).size === poradi.length, JSON.stringify(poradi));
  const stavy = await tym(p).locator('li.list-row').evaluateAll(els => Object.fromEntries(els.map(e => [e.querySelector(':scope > span.min-w-0 > span')?.textContent?.trim(), e.querySelector('[data-stav]')?.getAttribute('data-stav')])));
  tvrdi('D1: stavy dne ze dostupnosti a volna', stavy['Lukáš Beneš'] === 'muze' && stavy['Jakub Horák'] === 'omezeni' && stavy['Tereza Malá'] === 'nemuze'
    && stavy['Petra Dvořáková'] === 'volno' && stavy['Ondřej Kučera'] === 'nevyplneno', JSON.stringify(stavy));
  tvrdi('D1: chip „jen Ranní" u Jakuba a „dovolená" u Petry', (await radek(p, 'Jakub Horák').innerText()).includes('jen Ranní') && (await radek(p, 'Petra Dvořáková').innerText()).includes('dovolená'));
  tvrdi('D1: poznámka pro vedení u řádku (Tereza, Lukáš)', (await radek(p, 'Tereza Malá').innerText()).includes('Rodinná oslava') && (await radek(p, 'Lukáš Beneš').innerText()).includes('Víkendy ano'));
  tvrdi('D1: kdo je v návrhu, je označený „má směnu"', (await radek(p, 'Eva Testová').innerText()).includes('má směnu'));
  tvrdi('D1: obecná preference u Nikoly', (await radek(p, 'Nikola Šťastná').innerText()).includes('preferuje odpolední'));
  tvrdi('D1: dostupnost se na otevření dne znovu nenačítá (jeden dotaz na měsíc)', dotazyNa(stav, ['/api/availability']).length === dotazyDostupnosti);

  // „nemůže" → přidání jen s potvrzením
  await radek(p, 'Tereza Malá').getByRole('button', { name: 'Přidat — Tereza Malá' }).click();
  tvrdi('D2: u „nemůže" je potvrzení „Přesto přidat" s vysvětlením', await dokud(() => okno(p).getByRole('button', { name: 'Přesto přidat' }).first().isVisible(), 1500)
    && await okno(p).getByText('Tereza Malá podle své dostupnosti tento den nemůže. Přidat jde, ale jen když je to domluvené.').isVisible());
  await okno(p).getByRole('button', { name: 'Zrušit' }).first().click();

  // Jakub: výchozí typ podle jeho volby, po přidání už Ranní nejde znovu (překryv)
  await radek(p, 'Jakub Horák').getByRole('button', { name: 'Přidat — Jakub Horák' }).click();
  tvrdi('D3: výchozí typ podle denní volby (Ranní)', await dokud(() => okno(p).getByText(/Ranní · 07:00–15:00/).isVisible(), 1500));
  await okno(p).getByRole('button', { name: 'Přidat do návrhu' }).first().click();
  tvrdi('D3: Jakub je v návrhu dne', await dokud(async () => await okno(p).getByRole('button', { name: 'Odebrat z návrhu — Jakub Horák' }).count() === 1, 1500));
  const poradiPo = await tym(p).locator('li.list-row').evaluateAll(els => els.map(e => e.querySelector(':scope > span.min-w-0 > span')?.textContent?.trim()));
  tvrdi('D3: po přidání řádky neuskočily (pořadí drží, dokud je okno otevřené)', JSON.stringify(poradiPo) === JSON.stringify(poradi), JSON.stringify(poradiPo));
  tvrdi('D3: …a v týmu označený „má směnu 07:00–15:00"', await dokud(async () => (await radek(p, 'Jakub Horák').innerText()).includes('má směnu 07:00–15:00'), 1500));
  await radek(p, 'Jakub Horák').getByRole('button', { name: 'Přidat — Jakub Horák' }).click();
  tvrdi('D3: podruhé se nabízí jen typ, který se nepřekrývá (Noční, ne Ranní)', await dokud(() => okno(p).getByText(/Noční z organizace · 18:00–02:00/).isVisible(), 1500)
    && await tym(p).getByRole('tab', { name: 'Ranní' }).count() === 0);
  await okno(p).getByRole('button', { name: 'Zrušit' }).first().click();
  tvrdi('D3: nic z toho nešlo do uložených směn', !(stav.zapisy ?? []).some(z => z.path === '/api/schedule'));

  // Escape v rozbaleném výběru sbalí jen výběr, okno dne zůstane.
  await radek(p, 'Lukáš Beneš').getByRole('button', { name: 'Přidat — Lukáš Beneš' }).click();
  await dokud(() => okno(p).getByRole('button', { name: 'Přidat do návrhu' }).first().isVisible(), 1500);
  await okno(p).getByRole('button', { name: 'Zrušit' }).first().focus();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(250);
  tvrdi('D4: Escape ve výběru typu nechá okno dne otevřené', await okno(p).getByText('Tým na tento den').isVisible());
  tvrdi('D4: …výběr se sbalil a fokus je zpět na „Přidat — Lukáš Beneš"', await radek(p, 'Lukáš Beneš').getByRole('button', { name: 'Přidat — Lukáš Beneš' }).getAttribute('aria-expanded') === 'false'
    && await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Přidat — Lukáš Beneš');
  tvrdi('D5: s Týmem na den patička okna nemá „Přidat do návrhu" (jen Zavřít)', await okno(p).getByRole('button', { name: /^Přidat (do návrhu|směnu)$/ }).count() === 0
    && await okno(p).getByRole('button', { name: 'Přidat s vlastním časem…' }).isVisible());
  await ctx.close();
}

// 7) Ruční úpravy se bez ptaní nezahodí; zápisy do DB s otevřeným návrhem nejdou; SPA navigace se zeptá.
{
  const { ctx, p, stav } = await kontext({ fix: FIX, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await vygeneruj(p);
  const generovani = () => (stav.zapisy ?? []).filter(z => z.path === '/api/schedule/generate' && !JSON.parse(z.body || '{}').commit);
  tvrdi('Z0: generování posílá, jestli se měsíc přepíše (nahradit)', JSON.parse(generovani()[0]?.body || '{}').nahradit === true, generovani()[0]?.body);
  await p.getByRole('button', { name: 'Vygenerovat znovu' }).click();
  tvrdi('Z1: neupravený návrh se přegeneruje bez ptaní', await dokud(() => generovani().length === 2, 2000) && await okno(p).count() === 0);
  await otevriDen(p, DEN);
  await okno(p).getByRole('button', { name: 'Odebrat z návrhu — Eva Testová' }).click();
  await okno(p).getByRole('button', { name: 'Zavřít' }).first().click();
  await dokud(async () => !(await okno(p).isVisible()), 2000);
  await p.getByRole('button', { name: 'Vygenerovat znovu' }).click();
  tvrdi('Z2: upravený návrh → „Vygenerovat znovu" se zeptá („Návrh má tvoje úpravy")', await dokud(() => okno(p).getByText('Návrh má tvoje úpravy').isVisible(), 1500));
  await okno(p).getByRole('button', { name: 'Nechat' }).click();
  tvrdi('Z2: „Nechat" návrh nechá (žádné nové generování)', generovani().length === 2 && await p.getByText('Navržený rozvrh').isVisible());
  await p.getByRole('button', { name: 'Zahodit náhled' }).click();
  tvrdi('Z3: „Zahodit náhled" u upraveného návrhu se taky zeptá', await dokud(() => okno(p).getByText('Návrh má tvoje úpravy').isVisible(), 1500));
  await okno(p).getByRole('button', { name: 'Nechat' }).click();
  await p.getByRole('switch', { name: 'Nahradit uložené směny měsíce' }).click();
  tvrdi('Z4: přepnutí „Nahradit uložené směny" u upraveného návrhu se zeptá', await dokud(() => okno(p).getByText('Návrh má tvoje úpravy').isVisible(), 1500));
  await okno(p).getByRole('button', { name: 'Zahodit a vygenerovat znovu' }).click();
  tvrdi('Z4: …po potvrzení se generuje bez přepisu (nahradit: false)', await dokud(() => generovani().length === 3, 2000) && JSON.parse(generovani()[2].body).nahradit === false, generovani()[2]?.body);

  await p.getByRole('button', { name: 'Další akce' }).first().click().catch(() => {});
  const polozka = (t) => p.getByRole('menuitem', { name: new RegExp(t) });
  await dokud(() => polozka('Import CSV').isVisible(), 1500);
  tvrdi('Z5: s návrhem jsou Import CSV, Kopírovat týden a Upravit podle požadavků vypnuté',
    await polozka('Import CSV').isDisabled() && await polozka('Kopírovat týden').isDisabled() && await polozka('Upravit podle nových požadavků').isDisabled());
  await p.keyboard.press('Escape');

  const kam = await p.evaluate(() => { const b = [...document.querySelectorAll('aside button, aside a')].find(e => /Docházka|Sklad/.test(e.textContent || '')); b?.click(); return b?.textContent ?? null; });
  tvrdi('Z6: odchod do jiné sekce s neuloženým návrhem se zeptá', !!kam && await dokud(() => p.locator('.discard-guard').isVisible(), 1500)
    && (await p.locator('.discard-guard').innerText()).includes('Navržený rozvrh'), String(kam));
  await p.locator('.discard-guard button', { hasText: /Zpět k úpravám/ }).click();
  tvrdi('Z6: „Zpět k úpravám" nechá návrh na místě', await dokud(() => p.getByText('Navržený rozvrh').isVisible(), 1500));
  await ctx.close();
}

// 8) Souběh: „Potvrdit a uložit" a hned „Uložit a publikovat" → jediný commit.
{
  const { ctx, p, stav } = await kontext({ fix: FIX, dalsi: podvrh({ pomalyCommit: true }) });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await vygeneruj(p);
  await p.getByRole('button', { name: 'Potvrdit a uložit' }).click();
  await p.getByRole('button', { name: 'Uložit a publikovat' }).click({ force: true, timeout: 1000 }).catch(() => {});
  await p.waitForTimeout(1500);
  tvrdi('S1: dvě ukládací tlačítka rychle za sebou = jeden commit', commity(stav).length === 1, `${commity(stav).length}×`);
  await ctx.close();
}

// 9) 409 od serveru (jiná záložka změnila měsíc): chyba, návrh zůstane, plánovač se znovu načte.
{
  const { ctx, p, stav } = await kontext({ fix: FIX, dalsi: podvrh({ konflikt: true }) });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await vygeneruj(p);
  const nacteniMesice = () => stav.dotazy.filter(d => d.path === '/api/schedule' && d.m === 'GET').length;
  const pred = nacteniMesice();
  await p.getByRole('button', { name: 'Potvrdit a uložit' }).click();
  tvrdi('K1: 409 ukáže „mezitím někdo změnil"', await dokud(() => p.getByText(/mezitím někdo změnil/).first().isVisible(), 2500));
  tvrdi('K1: …návrh zůstal otevřený', await p.getByText('Navržený rozvrh').isVisible());
  tvrdi('K1: …a uložený měsíc se znovu načetl (nová verze)', await dokud(() => nacteniMesice() > pred, 2000));
  await ctx.close();
}

// 4) Bez návrhu: „Přidat" v okně dne vytvoří rovnou směnu.
{
  const { ctx, p, stav } = await kontext({ fix: FIX, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await otevriDen(p, DEN);
  await radek(p, 'Lukáš Beneš').getByRole('button', { name: 'Přidat — Lukáš Beneš' }).click();
  await okno(p).getByRole('button', { name: 'Přidat směnu' }).first().click();
  const z = await dokud(() => (stav.zapisy ?? []).find(x => x.path === '/api/schedule' && x.m === 'POST'), 2000);
  tvrdi('U1: bez návrhu vytvoří směnu (POST /api/schedule) pro Lukáše na ten den', !!z && JSON.parse(z.body).shifts?.[0]?.employeeId === 21 && JSON.parse(z.body).shifts?.[0]?.date === DEN, z?.body);
  await ctx.close();
}

// 5) Bez dostupnost.zobrazit: sekce se nekreslí a dostupnost se nenačítá.
{
  const opravneni = ROLE.ja.opravneni.filter(k => k !== 'dostupnost.zobrazit' && k !== 'dostupnost.upravit');
  const { ctx, p, stav } = await kontext({ fix: FIX, dalsi: podvrh(), mineData: mine(opravneni, { klic: 'vedeni', roleId: null, nazev: 'Vedoucí', typ: 'vedeni', jeVlastnik: false }) });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await otevriDen(p, DEN);
  tvrdi('P1: bez dostupnost.zobrazit okno dne bez sekce týmu', await okno(p).getByText('Tým na tento den').count() === 0);
  tvrdi('P1: …a žádný dotaz na /api/availability', dotazyNa(stav, ['/api/availability']).length === 0, dotazyNa(stav, ['/api/availability']).map(d => d.u).join(', '));
  await ctx.close();
}

// 6) Telefon 390: okno dne s rozbaleným přidáním nepřetéká.
{
  const { ctx, p } = await kontext({ fix: FIX, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await vygeneruj(p);
  await otevriDen(p, DEN);
  await radek(p, 'Jakub Horák').getByRole('button', { name: 'Přidat — Jakub Horák' }).click();
  await p.waitForTimeout(300);
  const dlg = await okno(p).evaluate(el => {
    const r = el.getBoundingClientRect();
    const telo = el.querySelector('.overflow-y-auto');
    return { vlevo: r.left, vpravo: r.right, vw: innerWidth, dole: Math.round(r.bottom), vh: innerHeight, pretika: telo ? telo.scrollWidth > telo.clientWidth + 1 : false };
  });
  tvrdi('T1: okno dne na telefonu je list u spodní hrany a v šířce obrazovky', dlg.vlevo >= -1 && dlg.vpravo <= dlg.vw + 1 && Math.abs(dlg.dole - dlg.vh) <= 2, JSON.stringify(dlg));
  tvrdi('T1: obsah okna vodorovně nepřetéká', !dlg.pretika, JSON.stringify(dlg));
  tvrdi('T1: stránka bez vodorovného přetečení', await bezPreteceni(p));
  const cile = await tym(p).getByRole('button', { name: /^Přidat — / }).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
  tvrdi('T1: tlačítka „Přidat" mají aspoň 36 px (btn-sm) a jsou v týmu', cile.length > 3 && Math.min(...cile) >= 36, JSON.stringify(cile));
  await p.screenshot({ path: OUT + 'rozvrh-navrh-tel.png' });
  await ctx.close();
}

await konec();
