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
// Fixtury: k69-b1-generate/-schedule (návrh a uložené směny) a rozvrh-navrh-*
// (dostupnost a volno na den PRISTI-06).
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, dotazyNa, mine, ROLE, DIR, OUT } from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const MESIC = praha(0).slice(0, 7);
const PRISTI = (() => { const [y, m] = MESIC.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
const nacti = (jmeno, mesic = PRISTI) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8')
  .replaceAll('PRISTI', PRISTI).replaceAll('"@-', `"${mesic}-`).replaceAll('"ZITRA"', `"${praha(1)}"`).replaceAll('"POZITRI"', `"${praha(2)}"`));

/** Podvrh API rozvrhu; každý zápis (i commit návrhu) jde do `stav.zapisy` s pořadím. */
const podvrh = () => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const q = url.searchParams;
  if (req.method() !== 'GET') {
    const body = req.postData() || '';
    if (path.startsWith('/api/schedule') || path === '/api/availability') {
      (stav.zapisy ??= []).push({ m: req.method(), path, body, i: (stav.zapisy ?? []).length });
    }
    if (path === '/api/schedule/generate') {
      return JSON.parse(body || '{}').commit ? json({ ok: true, inserted: 2 }) : json(nacti('k69-b1-generate'));
    }
    if (path === '/api/schedule/publish') return json({ ok: true, notified: 3 });
    if (path === '/api/schedule') return json({ inserted: 1 });
    return undefined;
  }
  if (path === '/api/schedule') return json(nacti('k69-b1-schedule', q.get('month') ?? PRISTI));
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
  await okno(p).getByRole('button', { name: 'Vyhodit z návrhu — Eva Testová' }).click();
  tvrdi('N1: Eva z návrhu dne zmizela', await dokud(async () => await okno(p).getByRole('button', { name: 'Vyhodit z návrhu — Eva Testová' }).count() === 0, 1500));
  await radek(p, 'Lukáš Beneš').getByRole('button', { name: 'Přidat — Lukáš Beneš' }).click();
  const potvrdit = okno(p).getByRole('button', { name: 'Přidat do návrhu' }).first();
  tvrdi('N1: rozbalené přidání nabízí „Přidat do návrhu"', await dokud(() => potvrdit.isVisible(), 1500));
  await potvrdit.click();
  tvrdi('N1: Lukáš je v navržených směnách dne', await dokud(async () => await okno(p).getByRole('button', { name: 'Vyhodit z návrhu — Lukáš Beneš' }).count() === 1, 1500));
  tvrdi('N1: přidání do návrhu nic nezapsalo do uložených směn (žádný POST /api/schedule)', !(stav.zapisy ?? []).some(z => z.path === '/api/schedule'));
  await p.screenshot({ path: OUT + 'rozvrh-navrh-den.png' });
  await okno(p).getByRole('button', { name: 'Zavřít' }).first().click();
  await dokud(async () => !(await okno(p).isVisible()), 2000);
  await p.getByRole('button', { name: 'Uložit a publikovat' }).click();
  tvrdi('N1: Uložit a publikovat → publikace odešla', await dokud(() => publikace(stav).length === 1, 4000));
  const c = commity(stav);
  const telo = c[0] ? JSON.parse(c[0].body) : { shifts: [] };
  const naDen = telo.shifts.filter(s => s.date === DEN).map(s => s.employeeId);
  tvrdi('N1: návrh se uložil jedním commitem', c.length === 1, `${c.length}×`);
  tvrdi('N1: tělo commitu = upravený návrh (Lukáš místo Evy na den 6.)', naDen.includes(21) && !naDen.includes(16), JSON.stringify(telo.shifts));
  tvrdi('N1: …a zbytek návrhu zůstal (Jakub 7.)', telo.shifts.some(s => s.employeeId === 17 && s.date === `${PRISTI}-07`));
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
  tvrdi('D1: chip „jen Ranní" u Jakuba a „schválené volno" u Petry', (await radek(p, 'Jakub Horák').innerText()).includes('jen Ranní') && (await radek(p, 'Petra Dvořáková').innerText()).includes('schválené volno'));
  tvrdi('D1: poznámka pro vedení u řádku (Tereza, Lukáš)', (await radek(p, 'Tereza Malá').innerText()).includes('Rodinná oslava') && (await radek(p, 'Lukáš Beneš').innerText()).includes('Víkendy ano'));
  tvrdi('D1: kdo je v návrhu, je označený „má směnu"', (await radek(p, 'Eva Testová').innerText()).includes('má směnu'));
  tvrdi('D1: obecná preference u Nikoly', (await radek(p, 'Nikola Šťastná').innerText()).includes('preferuje odpolední'));
  tvrdi('D1: dostupnost se na otevření dne znovu nenačítá (jeden dotaz na měsíc)', dotazyNa(stav, ['/api/availability']).length === dotazyDostupnosti);

  // „nemůže" → přidání jen s potvrzením
  await radek(p, 'Tereza Malá').getByRole('button', { name: 'Přidat — Tereza Malá' }).click();
  tvrdi('D2: u „nemůže" je potvrzení „Přesto přidat" s vysvětlením', await dokud(() => okno(p).getByRole('button', { name: 'Přesto přidat' }).first().isVisible(), 1500)
    && await okno(p).getByText('Přidat jde, ale jen když to s ním máš domluvené.').isVisible());
  await okno(p).getByRole('button', { name: 'Zrušit' }).first().click();

  // Jakub: výchozí typ podle jeho volby, po přidání už Ranní nejde znovu (překryv)
  await radek(p, 'Jakub Horák').getByRole('button', { name: 'Přidat — Jakub Horák' }).click();
  tvrdi('D3: výchozí typ podle denní volby (Ranní)', await dokud(() => okno(p).getByText(/Ranní · 07:00–15:00/).isVisible(), 1500));
  await okno(p).getByRole('button', { name: 'Přidat do návrhu' }).first().click();
  tvrdi('D3: Jakub je v návrhu dne', await dokud(async () => await okno(p).getByRole('button', { name: 'Vyhodit z návrhu — Jakub Horák' }).count() === 1, 1500));
  tvrdi('D3: …a v týmu označený „má směnu 07:00–15:00"', await dokud(async () => (await radek(p, 'Jakub Horák').innerText()).includes('má směnu 07:00–15:00'), 1500));
  await radek(p, 'Jakub Horák').getByRole('button', { name: 'Přidat — Jakub Horák' }).click();
  tvrdi('D3: podruhé se nabízí jen typ, který se nepřekrývá (Noční, ne Ranní)', await dokud(() => okno(p).getByText(/Noční z organizace · 18:00–02:00/).isVisible(), 1500)
    && await tym(p).getByRole('tab', { name: 'Ranní' }).count() === 0);
  await okno(p).getByRole('button', { name: 'Zrušit' }).first().click();
  tvrdi('D3: nic z toho nešlo do uložených směn', !(stav.zapisy ?? []).some(z => z.path === '/api/schedule'));
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
