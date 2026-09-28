// Rozvrh — filtr mřížky podle lidí, typu směny a dnů s dírou; přehled
// „Směny podle lidí".
//
// Martin: „Primárně potřebuju filtraci podle lidí, ať vidím, kolik mají
// směn." Sonda hlídá, že pás lidí nese správné počty (z uložených směn, po
// vygenerování z návrhu), výběr člověka ostatní směny SKRYJE (ne ztlumí),
// díry zůstanou vidět jako tenká značka, filtry se kombinují (lidé ∧ typ
// ∧ jen díry), přehled hlásí „nad max." a „bez směny", klepnutí v přehledu
// vyfiltruje mřížku, filtr přežije přepnutí měsíce i znovunačtení, lišta
// „Filtr: … — Zrušit filtr" je vidět a export CSV bere vždy celý měsíc.
//
// Fixtury rozvrh-filtr-*: uložené směny (Eva 5, Jakub 3, Tereza 1, Lukáš
// 1 vlastní), díry 8. (povinná) a 12. (žádoucí), návrh (Eva 2, Jakub 4,
// Nikola 1), dostupnost (Eva chce max. 3, Nikola zadala a nemá směnu).
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, DIR, OUT } from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const MESIC = praha(0).slice(0, 7);
const PRISTI = (() => { const [y, m] = MESIC.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
const nacti = (jmeno, mesic = PRISTI) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8')
  .replaceAll('PRISTI', PRISTI).replaceAll('"@-', `"${mesic}-`));

const podvrh = () => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const q = url.searchParams;
  if (req.method() !== 'GET') {
    if (path === '/api/schedule/generate') {
      const telo = JSON.parse(req.postData() || '{}');
      (stav.zapisy ??= []).push({ path, body: telo });
      return json(telo.commit ? { ok: true, inserted: 7 } : nacti('rozvrh-filtr-generate'));
    }
    if (path === '/api/schedule/publish') { (stav.zapisy ??= []).push({ path, body: JSON.parse(req.postData() || '{}') }); return json({ ok: true, notified: 3 }); }
    return undefined;
  }
  if (path === '/api/schedule') return json({ ...nacti('rozvrh-filtr-schedule', q.get('month') ?? PRISTI), verze: 'verze-filtr' });
  if (path === '/api/shift-types') return json(nacti('rozvrh-filtr-shift-types'));
  if (path === '/api/opening-hours') return json(nacti('rozvrh-filtr-opening-hours'));
  if (path === '/api/availability') return json(q.get('mine') ? null : nacti('rozvrh-filtr-availability'));
  if (path === '/api/timeoff') return json({ requests: [] });
  if (path === '/api/fixed-assignments') return json({ assignments: [] });
  if (path === '/api/events') return json({ events: [] });
  if (path === '/api/schedule/rules') return json({ teamMax: null, members: [] });
  return undefined;
};

const FIX = { ...nacti('k69-b1-rozlozeni-rozvrh'), polozky: [{ id: 'nastroj', widget: 'nastroj', velikost: 'L' }] };
const ROZVRH = '/employer/overview?view=shifts';
const nazevDne = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }); };
const den = (dd, mesic = PRISTI) => `${mesic}-${dd}`;
const bunka = (p, d) => p.locator(`[data-plocha] button[aria-label^="${nazevDne(d)}:"]`);
const popisDne = (p, d) => bunka(p, d).getAttribute('aria-label');
const pas = (p) => p.locator('[data-pas="lide"]');
const clovek = (p, id) => pas(p).locator(`button[data-clovek="${id}"]`);
const vsichni = (p) => pas(p).getByRole('button', { name: /^Všichni/ });
const typ = (p, n) => p.locator(`[data-pas="typy"] button[data-typ="${n}"]`);
const jenDiry = (p) => p.locator('[data-pas="typy"] button[data-jen-diry]');
const lista = (p) => p.locator('[data-filtr-lista]');
const stisknuto = async (loc) => (await loc.getAttribute('aria-pressed')) === 'true';
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function nactiRozvrh(p) {
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  return dokud(() => pas(p).isVisible(), 6000);
}

// 1) Počty v pásu, výběr člověka, dva lidé, typ, jen díry, reset.
{
  const { ctx, p, chyby } = await kontext({ fix: FIX, dalsi: podvrh() });
  tvrdi('F0: pás lidí se ukázal nad mřížkou', await nactiRozvrh(p));
  const pocty = await pas(p).locator('button').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
  tvrdi('F1: pás nese počty směn (Eva 5, Jakub 3, Tereza 1, Lukáš 1, Nikola 0)',
    ['Eva Testová, 5 směn', 'Jakub Horák, 3 směny', 'Tereza Malá, 1 směna', 'Lukáš Beneš, 1 směna', 'Nikola Šťastná, 0 směn'].every(x => pocty.includes(x)), JSON.stringify(pocty));
  tvrdi('F1: „Všichni" = 10 směn a je vybraný', pocty[0] === 'Všichni, 10 směn' && await stisknuto(vsichni(p)), pocty[0]);
  tvrdi('F1: pilulka ukazuje krátké jméno a počet („Eva 5")', (await clovek(p, 16).innerText()).replace(/\s+/g, ' ').includes('Eva 5'), await clovek(p, 16).innerText());
  tvrdi('F1: vedoucí bez směny (Martin) v pásu není', await clovek(p, 15).count() === 0);
  tvrdi('F1: bez filtru žádná lišta filtru', await lista(p).count() === 0);
  tvrdi('F1: den 2. bez filtru: 2 směny, díra 8. plně červená', (await popisDne(p, den('02'))).includes(': 2 směny')
    && await bunka(p, den('08')).getAttribute('data-dira') === 'povinna' && await bunka(p, den('08')).getAttribute('data-znacka-diry') === null);

  await clovek(p, 16).click();
  tvrdi('F2: Eva vybraná (aria-pressed), „Všichni" ne', await stisknuto(clovek(p, 16)) && !(await stisknuto(vsichni(p))));
  tvrdi('F2: lišta „Filtr: Eva Testová — 5 směn" + Zrušit filtr', await dokud(async () => (await lista(p).innerText()).includes('Filtr: Eva Testová'), 1500)
    && (await lista(p).innerText()).includes('5 směn') && await lista(p).getByRole('button', { name: 'Zrušit filtr' }).isVisible(), await lista(p).innerText().catch(() => ''));
  tvrdi('F2: skrytý stav pro odečítač hlásí výsledek i při prvním zapnutí', (await p.locator('[data-stav-filtru]').textContent()).includes('Filtr: Eva Testová — 5 směn')
    && await lista(p).getAttribute('aria-live') === null);
  tvrdi('F2: lišta říká, že export a publikování berou celý měsíc', (await lista(p).innerText()).includes('Export, tisk i publikování berou vždy celý měsíc'));
  tvrdi('F2: den 2. ukazuje jen Evu (Jakubova směna skrytá)', (await popisDne(p, den('02'))).includes(': 1 směna podle filtru')
    && (await bunka(p, den('02')).locator('span[title]').evaluateAll(els => els.map(e => e.getAttribute('title')))).every(t => t.startsWith('Eva')));
  tvrdi('F2: den 5. (jen Jakub) je prázdný', (await popisDne(p, den('05'))).includes(': 0 směn podle filtru')
    && await bunka(p, den('05')).locator('span[title]').count() === 0);
  tvrdi('F2: díra 8. zůstala jen jako značka (ne plná červená), ale s výstražnou ikonou — ne jen barvou', await bunka(p, den('08')).getAttribute('data-znacka-diry') === 'ano'
    && !(await bunka(p, den('08')).getAttribute('class')).includes('bg-bad/15')
    && await bunka(p, den('08')).locator('svg').count() >= 1
    && (await popisDne(p, den('08'))).includes('nikdo neotevře'));
  tvrdi('F2: žádoucí díra 12. je tečka v sytém odstínu (bg-wait-ink)', await bunka(p, den('12')).locator('.bg-wait-ink').count() === 1);
  await p.screenshot({ path: OUT + 'rozvrh-filtr-eva.png' });

  await clovek(p, 17).click();
  tvrdi('F3: dva lidé najednou — „Eva, Jakub — 8 směn" (jména, ne „2 lidé")', await dokud(async () => (await lista(p).innerText()).includes('Filtr: Eva, Jakub'), 1500)
    && (await lista(p).innerText()).includes('8 směn') && await stisknuto(clovek(p, 16)) && await stisknuto(clovek(p, 17)));
  tvrdi('F3: den 2. ukazuje Evu i Jakuba', (await popisDne(p, den('02'))).includes(': 2 směny podle filtru'));
  tvrdi('F3: Tereza (6.) skrytá', (await popisDne(p, den('06'))).includes(': 0 směn'));

  await typ(p, 'Odpolední').click();
  tvrdi('F4: typ Odpolední ∧ lidé — „Eva, Jakub · Odpolední — 4 směny"', await dokud(async () => (await lista(p).innerText()).includes('Eva, Jakub · Odpolední'), 1500)
    && (await lista(p).innerText()).includes('4 směny'), await lista(p).innerText());
  tvrdi('F4: počty v pásu lidí pod filtrem typu (Eva 2 odpolední)', (await clovek(p, 16).getAttribute('aria-label')) === 'Eva Testová, 2 směny');
  tvrdi('F4: den 2. — Evina ranní skrytá, Jakubova odpolední vidět', (await popisDne(p, den('02'))).includes(': 1 směna podle filtru')
    && (await bunka(p, den('02')).locator('span[title]').first().getAttribute('title')).startsWith('Jakub'));

  await typ(p, 'Odpolední').click();
  await jenDiry(p).click();
  tvrdi('F5: „Jen dny s dírou" — dny bez díry jsou prázdná místa bez klepnutí', await dokud(async () => await p.locator('[data-mimo-filtr]').count() > 20, 1500)
    && await bunka(p, den('02')).count() === 0 && await bunka(p, den('08')).count() === 1 && await bunka(p, den('12')).count() === 1);
  tvrdi('F5: s „jen díry" je díra zase plně zvýrazněná', await bunka(p, den('08')).getAttribute('data-znacka-diry') === null);
  tvrdi('F5: lišta „Eva, Jakub · jen dny s dírou — 0 směn"', (await lista(p).innerText()).includes('Eva, Jakub · jen dny s dírou') && (await lista(p).innerText()).includes('0 směn'), await lista(p).innerText());
  tvrdi('F5: počty v pásu jsou taky jen za dny s dírou (Eva 0, ne 5)', (await clovek(p, 16).getAttribute('aria-label')) === 'Eva Testová, 0 směn', await clovek(p, 16).getAttribute('aria-label'));

  await bunka(p, den('08')).click();
  tvrdi('F5: okno dne říká, že filtr platí jen pro mřížku', await dokud(() => p.getByRole('dialog').locator('[data-okno-bez-filtru]').isVisible(), 2000));
  await p.getByRole('dialog').getByRole('button', { name: 'Zavřít' }).first().click();
  await dokud(async () => !(await p.getByRole('dialog').isVisible()), 2000);

  // Z klávesnice: tlačítko zmizí i s lištou — fokus nesmí spadnout na <body>.
  await lista(p).getByRole('button', { name: 'Zrušit filtr' }).focus();
  await p.keyboard.press('Enter');
  tvrdi('F6: po „Zrušit filtr" z klávesnice je fokus na „Všichni", ne na body', await dokud(() => p.evaluate(() => document.activeElement?.closest('[data-pas="lide"]') != null
    && (document.activeElement?.getAttribute('aria-label') ?? '').startsWith('Všichni')), 1500), await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)));
  tvrdi('F6: stav pro odečítač hlásí „Filtr vypnut"', (await p.locator('[data-stav-filtru]').textContent()).startsWith('Filtr vypnut'));
  tvrdi('F6: Zrušit filtr — lišta zmizela, „Všichni" vybraný, nic stisknuté', await dokud(async () => await lista(p).count() === 0, 1500)
    && await stisknuto(vsichni(p)) && !(await stisknuto(clovek(p, 16))) && !(await stisknuto(jenDiry(p))));
  tvrdi('F6: mřížka je zase celá (2. = 2 směny, žádné prázdné místo)', (await popisDne(p, den('02'))).includes(': 2 směny') && await p.locator('[data-mimo-filtr]').count() === 0);

  await clovek(p, 18).click();
  await clovek(p, 18).click();
  tvrdi('F6: druhý klik na tutéž pilulku výběr zruší (DESIGN.md)', !(await stisknuto(clovek(p, 18))) && await lista(p).count() === 0);
  tvrdi('F6: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 2) Přehled „Směny podle lidí": nad max., bez směny, řazení, klik = filtr.
{
  const { ctx, p } = await kontext({ fix: FIX, dalsi: podvrh() });
  await nactiRozvrh(p);
  const prehled = p.locator('[data-prehled-lidi]');
  const tlacitko = prehled.getByRole('button', { name: /Směny podle lidí/ });
  tvrdi('P1: přehled je sbalený a souhrn hlásí 2 upozornění', await tlacitko.getAttribute('aria-expanded') === 'false'
    && (await tlacitko.innerText()).includes('2 upozornění'), await tlacitko.innerText());
  await tlacitko.click();
  const radek = (id) => prehled.locator(`[data-radek-clovek="${id}"]`);
  tvrdi('P2: Eva 5 směn nad max. 3 („o 2 směny nad maximem", „chce nejvýš 3 směny za měsíc")', await dokud(() => radek(16).isVisible(), 1500)
    && (await radek(16).innerText()).includes('o 2 směny nad maximem') && (await radek(16).innerText()).includes('chce nejvýš 3 směny za měsíc'), await radek(16).innerText().catch(() => ''));
  tvrdi('P2: přístupné jméno řádku nese i číslo („o 2 směny nad maximem")', (await radek(16).getByRole('button').getAttribute('aria-label')).includes('o 2 směny nad maximem'));
  tvrdi('P2: Eva má hodiny a zavírací směny (30 h, 2× zavírá)', (await radek(16).innerText()).includes('30 h') && (await radek(16).innerText()).includes('2× zavírá'), await radek(16).innerText());
  tvrdi('P2: Nikola zadala dostupnost a nemá směnu (wait)', (await radek(22).innerText()).includes('chce pracovat, nemá směnu')
    && await radek(22).locator('.chip-wait').count() === 1);
  tvrdi('P2: nad max. je červený chip (bad)', await radek(16).locator('.chip-bad').count() === 1);
  const poradi = async () => prehled.locator('[data-radek-clovek]').evaluateAll(els => els.map(e => e.getAttribute('data-radek-clovek')));
  tvrdi('P3: výchozí řazení podle počtu (Eva, Jakub nahoře)', JSON.stringify((await poradi()).slice(0, 2)) === JSON.stringify(['16', '17']), JSON.stringify(await poradi()));
  await prehled.getByRole('tab', { name: 'Co řešit' }).click();
  tvrdi('P3: řazení „Co řešit" — Eva (nad max.), pak Nikola (bez směny)', await dokud(async () => JSON.stringify((await poradi()).slice(0, 2)) === JSON.stringify(['16', '22']), 1500), JSON.stringify(await poradi()));
  await prehled.getByRole('tab', { name: 'Jméno' }).click();
  // Celý tým (i zaměstnanci bez směny — „nemá směnu" je taky odpověď), česky abecedně.
  tvrdi('P3: řazení podle jména (Adam, Eva, Jakub, Klára, Lukáš, Nikola, Ondřej, Petra, Tereza)',
    await dokud(async () => JSON.stringify(await poradi()) === JSON.stringify(['23', '16', '17', '24', '21', '22', '19', '20', '18']), 1500), JSON.stringify(await poradi()));
  // S typem „Odpolední" v pásu: přehled říká, že počítá všechny typy, a klik
  // na člověka typ zruší — mřížka pak ukáže přesně číslo z řádku.
  await typ(p, 'Odpolední').click();
  tvrdi('P4: s filtrem typu souhrn přehledu říká „všechny typy směn"', await dokud(async () => (await tlacitko.innerText()).includes('všechny typy směn'), 1500), await tlacitko.innerText());
  await radek(18).getByRole('button').click();
  tvrdi('P4: klik na Terezu v přehledu vyfiltruje mřížku na ni (a zruší typ)', await dokud(async () => (await lista(p).innerText().catch(() => '')).includes('Filtr: Tereza Malá —'), 1500)
    && await stisknuto(clovek(p, 18)) && !(await stisknuto(typ(p, 'Odpolední'))) && (await popisDne(p, den('06'))).includes(': 1 směna podle filtru') && (await popisDne(p, den('02'))).includes(': 0 směn'));
  tvrdi('P4: stisknutý řádek říká, že klik filtr zruší', (await radek(18).getByRole('button').getAttribute('aria-label')).endsWith('Zrušit filtr na Tereza Malá.'));
  await clovek(p, 16).click();
  tvrdi('P4: se dvěma vybranými jsou v přehledu stisknutí oba', await dokud(async () => (await radek(16).getByRole('button').getAttribute('aria-pressed')) === 'true', 1500)
    && (await radek(18).getByRole('button').getAttribute('aria-pressed')) === 'true');
  await p.screenshot({ path: OUT + 'rozvrh-filtr-prehled.png', fullPage: true });
  await ctx.close();
}

// 3) Stav filtru přežije přepnutí měsíce i znovunačtení; export CSV bere celý měsíc.
{
  const { ctx, p } = await kontext({ fix: FIX, dalsi: podvrh() });
  await nactiRozvrh(p);
  await clovek(p, 16).click();
  await typ(p, 'Ranní').click();
  await p.getByRole('button', { name: 'Tento měsíc' }).click();
  tvrdi('M1: po přepnutí měsíce zůstala Eva i typ Ranní', await dokud(async () => (await p.getByRole('button', { name: 'Tento měsíc' }).getAttribute('aria-pressed')) === 'true', 3000)
    && await dokud(() => stisknuto(clovek(p, 16)), 3000) && await stisknuto(typ(p, 'Ranní'))
    && (await lista(p).innerText()).includes('Filtr: Eva Testová · Ranní'));
  tvrdi('M1: …a mřížka nového měsíce je vyfiltrovaná (2. = Evina ranní)', (await popisDne(p, den('02', MESIC))).includes(': 1 směna podle filtru')
    && (await popisDne(p, den('05', MESIC))).includes(': 0 směn'));
  await p.reload({ waitUntil: 'networkidle' });
  await dokud(() => pas(p).isVisible(), 6000);
  tvrdi('M2: po znovunačtení je filtr pořád zapnutý a lišta to říká', await dokud(() => stisknuto(clovek(p, 16)), 3000)
    && await dokud(async () => (await lista(p).innerText().catch(() => '')).includes('Filtr: Eva Testová · Ranní'), 2000));

  await p.getByRole('button', { name: 'Další akce' }).first().click();
  const polozka = p.getByRole('menuitem', { name: /Export CSV/ });
  await dokud(() => polozka.isVisible(), 1500);
  tvrdi('E1: položka Export CSV říká, že filtr se nepoužije', (await polozka.innerText()).includes('celý měsíc'), await polozka.innerText());
  const [stazeni] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), polozka.click()]);
  const csv = readFileSync(await stazeni.path(), 'utf8').replace(/^﻿/, '');
  const radky = csv.trim().split('\n');
  tvrdi('E1: export s filtrem obsahuje celý měsíc (10 směn, i Jakub a Tereza)', radky.length === 11 && csv.includes('Jakub Horák') && csv.includes('Tereza Malá') && csv.includes('Lukáš Beneš'), `${radky.length} řádků`);
  await ctx.close();
}

// 4) Po vygenerování se počty berou z návrhu a říká se to.
{
  const { ctx, p, stav } = await kontext({ fix: FIX, dalsi: podvrh() });
  await nactiRozvrh(p);
  await p.getByRole('button', { name: 'Vygenerovat rozvrh' }).click();
  await dokud(() => p.getByText('Navržený rozvrh').isVisible(), 4000);
  const pocty = await pas(p).locator('button').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
  tvrdi('G1: pás počítá z návrhu (Eva 2, Jakub 4, Nikola 1 — „v návrhu")',
    ['Všichni, 7 směn v návrhu', 'Eva Testová, 2 směny v návrhu', 'Jakub Horák, 4 směny v návrhu', 'Nikola Šťastná, 1 směna v návrhu', 'Tereza Malá, 0 směn v návrhu'].every(x => pocty.includes(x)), JSON.stringify(pocty));
  const souhrn = await p.locator('[data-prehled-lidi] button').first().innerText();
  tvrdi('G1: přehled říká „v návrhu" a Eva už není nad max.', souhrn.includes('v návrhu') && !souhrn.includes('upozornění'), souhrn);
  await clovek(p, 17).click();
  tvrdi('G2: filtr na Jakuba v návrhu — „Jakub Horák — 4 směny v návrhu"', await dokud(async () => (await lista(p).innerText().catch(() => '')).includes('4 směny v návrhu'), 1500));
  tvrdi('G2: den 4. ukazuje Jakubův návrh, den 2. (Evin návrh) prázdný', (await popisDne(p, den('04'))).includes('v návrhu 1 směna')
    && !(await popisDne(p, den('02'))).includes('v návrhu'));
  await p.getByRole('button', { name: 'Uložit a publikovat' }).click();
  const nahradit = p.getByRole('dialog').getByRole('button', { name: 'Nahradit a publikovat' });
  if (await dokud(() => nahradit.isVisible(), 1500)) await nahradit.click();
  const commit = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/schedule/generate' && z.body.commit), 3000);
  tvrdi('G3: publikování s filtrem uloží celý návrh (7 směn, ne jen Jakubovy)', commit?.body?.shifts?.length === 7, JSON.stringify(commit?.body?.shifts?.length));
  tvrdi('G3: publish posílá jen měsíc (celý), žádný filtr', await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/schedule/publish' && Object.keys(z.body).join() === 'month'), 3000));
  await ctx.close();
}

// 5) Telefon 390: pás lidí posuvný bez zalamování, přehled čitelný, nic nepřetéká, jedna limetka.
{
  const { ctx, p } = await kontext({ fix: FIX, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await nactiRozvrh(p);
  const pasMira = await pas(p).evaluate(el => {
    const tops = [...el.querySelectorAll('button')].map(b => b.offsetTop);
    const r = el.getBoundingClientRect();
    return { jedenRadek: new Set(tops).size === 1, posuvny: el.scrollWidth > el.clientWidth, vlevo: r.left, vpravo: r.right, vw: innerWidth, vyska: Math.round([...el.querySelectorAll('button')][1].getBoundingClientRect().height) };
  });
  tvrdi('T1: pás lidí je jeden řádek a posouvá se do strany', pasMira.jedenRadek && pasMira.posuvny, JSON.stringify(pasMira));
  tvrdi('T1: pás v šířce obrazovky', pasMira.vlevo >= 0 && pasMira.vpravo <= pasMira.vw + 1, JSON.stringify(pasMira));
  const cil = await clovek(p, 16).evaluate(el => { const s = getComputedStyle(el, '::before'); return Math.min(parseFloat(s.width), parseFloat(s.height)); });
  tvrdi('T1: pilulka člověka má dotykovou plochu 44 px', cil >= 44, String(cil));
  await clovek(p, 16).click();
  await p.locator('[data-prehled-lidi]').getByRole('button', { name: /Směny podle lidí/ }).click();
  await p.waitForTimeout(300);
  tvrdi('T2: s filtrem a otevřeným přehledem stránka nepřetéká', await bezPreteceni(p));
  const videtRadku = () => p.locator('[data-radek-clovek]').evaluateAll(els => els.filter(e => e.getClientRects().length > 0).length);
  tvrdi('T2: na telefonu přehled ukáže 6 řádků a „Ukázat všech 9"', await videtRadku() === 6
    && await p.locator('[data-ukazat-vsechny]').isVisible() && (await p.locator('[data-ukazat-vsechny]').innerText()).includes('Ukázat všech 9'), String(await videtRadku()));
  await p.locator('[data-ukazat-vsechny]').click();
  const radkyMira = await p.locator('[data-radek-clovek]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth + 1 && r.left >= -1; }));
  tvrdi('T2: po „Ukázat všech" jsou řádky přehledu celé na obrazovce', radkyMira.length === 9 && radkyMira.every(Boolean), JSON.stringify(radkyMira));
  // Plná limetka (ne tónovaný podklad /20 jako u „TO GO" v liště aplikace, ne přepínač — ten je stav,
  // ne tečka typu směny cat-dot-1 — ta je kategorie, ne akce).
  const limetky = await p.evaluate(() => [...document.querySelectorAll('body *')]
    .filter(e => getComputedStyle(e).backgroundColor === 'rgb(200, 245, 66)' && e.getAttribute('role') !== 'switch')
    .filter(e => { const r = e.getBoundingClientRect(); return r.width >= 16 && r.height >= 16; }).map(e => (e.textContent || '').trim().slice(0, 30)));
  tvrdi('T3: na obrazovce je nejvýš jedna limetka', limetky.length <= 1, JSON.stringify(limetky));
  // Plocha na telefonu scrolluje uvnitř vlastního kontejneru — fullPage by ořízl obsah pod dokem.
  await p.locator('[data-prehled-lidi]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: OUT + 'rozvrh-filtr-tel.png' });
  // Otevřený přehled se na telefonu po znovunačtení neobnoví (odsunul by mřížku).
  await p.reload({ waitUntil: 'networkidle' });
  await dokud(() => pas(p).isVisible(), 6000);
  tvrdi('T4: po znovunačtení na telefonu je přehled sbalený', (await p.locator('[data-prehled-lidi]').getByRole('button', { name: /Směny podle lidí/ }).getAttribute('aria-expanded')) === 'false');
  await ctx.close();
}

// 7) Přidání v okně dne s filtrem: hláška „je mimo filtr" s akcí „Ukázat".
{
  const { ctx, p, chyby } = await kontext({ fix: FIX, dalsi: podvrh() });
  await nactiRozvrh(p);
  await p.getByRole('button', { name: 'Vygenerovat rozvrh' }).click();
  await dokud(() => p.getByText('Navržený rozvrh').isVisible(), 4000);
  await clovek(p, 17).click();
  await bunka(p, den('04')).click();
  const okno = p.getByRole('dialog');
  await dokud(() => okno.locator('[data-pridat="18"]').isVisible(), 3000);
  await okno.locator('[data-pridat="18"]').click();
  await okno.getByRole('button', { name: 'Přidat do návrhu' }).first().click();
  await dokud(async () => (await okno.locator('[data-hlaska-tym]').innerText()).includes('Tereza'), 2000);
  await okno.getByRole('button', { name: 'Zavřít' }).first().click();
  const toast = p.getByText('Přidáno — Tereza je mimo filtr');
  tvrdi('H1: po zavření okna hláška „Přidáno — Tereza je mimo filtr"', await dokud(() => toast.isVisible(), 2500));
  await p.getByRole('button', { name: 'Ukázat', exact: true }).click();
  tvrdi('H1: „Ukázat" přidá Terezu do filtru a její směna je v mřížce', await dokud(() => stisknuto(clovek(p, 18)), 1500)
    && await stisknuto(clovek(p, 17))
    && (await bunka(p, den('04')).locator('span[title]').evaluateAll(els => els.map(e => e.getAttribute('title')))).some(t => t.includes('Tereza Malá')));
  tvrdi('H1: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 6) Tmavý režim: pás a přehled se nakreslí (snímek pro oko).
{
  const { ctx, p, chyby } = await kontext({ fix: FIX, tmavy: true, dalsi: podvrh() });
  await nactiRozvrh(p);
  await clovek(p, 16).click();
  await p.locator('[data-prehled-lidi]').getByRole('button', { name: /Směny podle lidí/ }).click();
  await p.waitForTimeout(300);
  tvrdi('D1: tmavý režim bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await p.screenshot({ path: OUT + 'rozvrh-filtr-tmavy.png', fullPage: true });
  await ctx.close();
}

await konec();
