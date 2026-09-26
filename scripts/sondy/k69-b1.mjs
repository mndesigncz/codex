// Kolo 69, balík B1 — Rozvrh, Moje směny (vedení i zaměstnanec) a Dostupnost jako plochy
// s widgety (spec §7.4).
//
// Pro každou stránku: jeden h1 jako první, nástroj v klidu vidět, v úpravách sbalený bez „−"
// a přesunutelný nad widget i pod něj (PUT), galerie nabízí widgety balíku v „Doporučené",
// role bez klíče widget nevidí a jeho endpoint se nevolá, 500 na jednom endpointu shodí jen
// jeden widget, telefon 390 bez přetečení s použitelnou hlavní akcí a rozepsaný formulář
// (nebo návrh rozvrhu) přežije úpravy. Navíc to, co balík opravoval: jediná limetka na Rozvrhu
// (dřív devět), schválení v řádku `primary`, náhled rozvrhu pro roli bez plánovače bez dotazu
// na /api/schedule, widgety mluví s plánovačem (Díry → okno dne, schválení → plánovač se znovu
// načte) a burza se nabízí přímo u směny.
//
// Fixtury: scripts/sondy/fixtury/k69-b1-*.json; dny (DNES, ZITRA…) a měsíce (MESIC, PRISTI,
// „@" = požadovaný měsíc) se doplní při podvrhu podle pražského dne, ať sonda nezestárne.
import { readFileSync } from 'node:fs';
import {
  kontext, konec, tvrdi, otevri, lista, upravit, hotovo, vUpravach, dokud, poradi, poradiPutu, dotazyNa, roleMine, DIR, OUT,
} from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PRED3: praha(-3), ZITRA: praha(1), POZITRI: praha(2), ZA3: praha(3), ZA5: praha(5), ZA7: praha(7), ZA10: praha(10) };
const MESIC = DNY.DNES.slice(0, 7);
const pristi = (() => { const [y, m] = MESIC.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
const nacti = (jmeno, mesic = MESIC) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t.replaceAll('PRISTI', pristi).replaceAll('"MESIC"', `"${MESIC}"`).replaceAll('"@-', `"${mesic}-`));
};

/** Podvrh API rozvrhu; `stav.chyby` = cesty, které vrátí 500; `stav.zapisy` = zápisy (POST/PATCH/DELETE). */
const podvrh = ({ mineId = 15 } = {}) => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const q = url.searchParams;
  const full = path + url.search;
  if (stav.chyby[path] || stav.chyby[full]) return json({ error: 'Server spadl' }, stav.chyby[path] || stav.chyby[full]);
  if (req.method() !== 'GET') {
    if (path === '/api/schedule/generate' && !JSON.parse(req.postData() || '{}').commit) return json(nacti('k69-b1-generate'));
    if (['/api/timeoff', '/api/shifts/offers', '/api/schedule', '/api/availability', '/api/schedule/publish'].includes(path)) {
      (stav.zapisy ??= []).push({ m: req.method(), path, full, body: req.postData() });
      return json({ ok: true, notified: 3 });
    }
    return undefined;
  }
  if (path === '/api/schedule') return json(nacti('k69-b1-schedule', q.get('month') ?? MESIC));
  if (path === '/api/schedule/rules') return json(nacti('k69-b1-rules'));
  if (path === '/api/availability') {
    if (q.get('mine')) return json(null);
    return json(nacti('k69-b1-availability'));
  }
  if (path === '/api/timeoff') return json(nacti(q.get('mine') === '1' ? 'k69-b1-timeoff-mine' : 'k69-b1-timeoff'));
  if (path === '/api/shifts/offers') return json(nacti('k69-b1-offers'));
  if (path === '/api/shifts' && q.get('team') === '1') return json(nacti('k69-b1-shifts-team'));
  if (path === '/api/shifts' && q.get('employeeId')) return json(nacti('k69-b1-shifts-mine').map(s => ({ ...s, employeeId: mineId })));
  if (path === '/api/fixed-assignments') return json({ assignments: [] });
  if (path === '/api/events') return json({ events: [] });
  return undefined;
};

const ROZVRH = '/employer/overview?view=shifts';
const MOJE_V = '/employer/overview?view=my-shifts';
const MOJE_Z = '/employee/shifts?view=my-shifts';
const DOSTUPNOST = '/employee/shifts?view=availability';
const naPlose = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`).count();
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const h1 = (p) => p.evaluate(() => {
  const plocha = document.querySelector('[data-plocha]');
  const prvni = plocha?.querySelector('h1, h2, h3');
  const viditelne = [...document.querySelectorAll('h1')].filter(h => h.offsetParent !== null);
  return { pocet: viditelne.length, prvniJeH1: prvni?.tagName === 'H1', text: viditelne[0]?.textContent?.trim() };
});
const limetky = (p) => p.locator('button.on-accent:visible, a.on-accent:visible').count();
/**
 * Tmavý režim: barva čáry (rámeček nebo prstenec) proti ploše pod prvkem. Vrací nejhorší
 * poměr kontrastu mezi prvky ze selektoru; černá čára na tmavé ploše vyjde kolem 1:1.
 */
const kontrastCar = (p, selektor, vlastnost = 'borderTopColor') => p.evaluate(([sel, vl]) => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const x = m[1].split(',').map(parseFloat); return { r: x[0], g: x[1], b: x[2], a: x.length > 3 ? x[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = (el) => { let acc = null; for (let n = el.parentElement; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (!c || c.a === 0) continue; acc = acc ? over(acc, c) : c; if (acc.a >= 0.999) return acc; } return acc ?? { r: 255, g: 255, b: 255, a: 1 }; };
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(); if (r.width < 1) continue;
    const cs = getComputedStyle(el);
    const c = parse(vl === 'boxShadow' ? cs.boxShadow : cs[vl]);
    if (!c) continue;
    const bg = bgOf(el); const e = over(c, bg);
    const l1 = lum(e), l2 = lum(bg);
    out.push(Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100);
  }
  return { pocet: out.length, nejhorsi: out.length ? Math.min(...out) : null };
}, [selektor, vlastnost]);
const doporucene = async (p) => {
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(400);
  const text = await galerie.evaluate(el => {
    const h = [...el.querySelectorAll('h4')].find(x => x.textContent?.includes('Doporučené'));
    return h?.parentElement?.innerText ?? '';
  });
  const vse = await galerie.innerText();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  return { text, vse };
};
/** Úpravy: nástroj sbalený do zástupce bez „−", Home ho dá nahoru (PUT), ↓ zpátky pod widget. */
async function upravyANastroj(p, stav, kod) {
  const nastroj = widgetLi(p, 'nastroj');
  await upravit(p).click();
  tvrdi(`${kod}2: vstup do úprav`, await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  tvrdi(`${kod}2: nástroj je v úpravách sbalený do zástupce`, await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible());
  tvrdi(`${kod}2: zástupce nástroje nemá „−" (nejde odebrat)`, await nastroj.locator('[data-odznak]').count() === 0);
  await nastroj.focus();
  const puty = stav.puty.length;
  if ((await poradi(p))[0] === 'nastroj') {
    // Nástroj je ve výchozím nahoře (Dostupnost): nejdřív pod všechny widgety, pak zpátky nad ně.
    await p.keyboard.press('End');
    tvrdi(`${kod}2: nástroj jde přesunout pod všechny widgety`, await dokud(async () => (await poradi(p)).at(-1) === 'nastroj', 1500), JSON.stringify(await poradi(p)));
    await dokud(() => stav.puty.length > puty, 1500);
    tvrdi(`${kod}2: …a odejde PUT s nástrojem dole`, poradiPutu(stav.puty.at(-1)).at(-1) === 'nastroj', JSON.stringify(poradiPutu(stav.puty.at(-1))));
    await p.keyboard.press('Home');
    tvrdi(`${kod}2: …a zpátky nad widgety`, await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
    return;
  }
  await p.keyboard.press('Home');
  tvrdi(`${kod}2: nástroj jde přesunout nad všechny widgety`, await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > puty, 1500);
  tvrdi(`${kod}2: …a odejde PUT s nástrojem nahoře`, poradiPutu(stav.puty.at(-1))[0] === 'nastroj', JSON.stringify(poradiPutu(stav.puty.at(-1))));
  await p.keyboard.press('ArrowDown');
  tvrdi(`${kod}2: …a zpátky pod widget`, await dokud(async () => (await poradi(p))[1] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
}

// ---------------------------------------------------------------------------
// Vedení: Rozvrh
// ---------------------------------------------------------------------------
const FIX_ROZVRH = nacti('k69-b1-rozlozeni-rozvrh');

// 1–3, 7) Hlavička, nástroj, jediná limetka, widgety, úpravy, galerie, návrh přežije úpravy.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_ROZVRH, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  const h = await h1(p);
  tvrdi('R1: právě jeden viditelný h1 „Rozvrh" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Rozvrh', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('R1: plocha má nástroj a v klidu je vidět (přepínač měsíce a mřížka)', await nastroj.count() === 1 && await nastroj.getByRole('group', { name: 'Měsíc', exact: true }).isVisible());
  tvrdi('R1: nástroj otevírá příští měsíc (plánuje se dopředu)', (await nastroj.getByRole('button', { name: 'Příští měsíc' }).getAttribute('aria-pressed')) === 'true');
  tvrdi('R1: jediná limetka je „Vygenerovat rozvrh" (dřív devět)', await limetky(p) === 1 && await p.getByRole('button', { name: 'Vygenerovat rozvrh' }).isVisible(), `${await limetky(p)}×`);
  tvrdi('R1: bez vlastní hlavičky a ručních pilulek — záložky jsou Segmented', await p.getByRole('radiogroup', { name: 'Část rozvrhu' }).or(p.locator('[aria-label="Část rozvrhu"]')).count() >= 1);
  const zad = widgetLi(p, 'rozvrh.zadosti_volno');
  tvrdi('R1: Žádosti o volno — Schválit je primary, ne limetka', await zad.getByRole('button', { name: 'Schválit' }).count() === 2 && await zad.locator('button.on-accent').count() === 0);
  tvrdi('R1: Žádosti o volno — schválené volno s nabídkou „···"', (await zad.innerText()).includes('Petra Dvořáková') && await zad.getByRole('button', { name: /Další akce s volnem/ }).count() === 1);
  const vym = widgetLi(p, 'rozvrh.vymeny');
  tvrdi('R1: Výměny — převzetí ke schválení i volná směna k převzetí', (await vym.innerText()).includes('Předává Jakub Horák, bere Tereza Malá') && await vym.getByRole('button', { name: 'Převzít' }).count() === 1);
  const hod = widgetLi(p, 'rozvrh.hodiny_lidi');
  tvrdi('R1: Naplánované hodiny — Jakub nad svým stropem 10 h, noční směna Evy 8 h (16 h celkem)', (await hod.innerText()).includes('Nad limitem') && (await hod.innerText()).includes('16 h'), (await hod.innerText()).slice(0, 200));
  const diry = widgetLi(p, 'rozvrh.diry');
  tvrdi('R1: Díry v obsazení — zítřek s časy a pozítří s neobsazeným typem', (await diry.innerText()).includes('Nikdo 14:00–16:00') && (await diry.innerText()).includes('Neobsazeno Odpolední'));
  tvrdi('R1: Dostupnost týmu — kolik zadalo a kdo chybí (chybějící první)', /zadalo \d+ z 11/.test(await widgetLi(p, 'rozvrh.dostupnost_tymu').innerText())
    && (await widgetLi(p, 'rozvrh.dostupnost_tymu').locator('.list-row').first().innerText()).includes('Chybí'));
  await p.screenshot({ path: OUT + 'k69-b1-rozvrh-desk.png', fullPage: true });

  // 7) Vygenerovaný návrh přežije vstup do úprav a výstup z nich.
  await p.getByRole('button', { name: 'Vygenerovat rozvrh' }).click();
  tvrdi('R7: Vygenerovat ukáže návrh v nástroji', await dokud(() => nastroj.getByText('Navržený rozvrh').isVisible(), 3000));
  tvrdi('R7: uložit návrh je primary (limetka zůstává jedna)', await limetky(p) === 1);
  await upravyANastroj(p, stav, 'R');
  await p.screenshot({ path: OUT + 'k69-b1-rozvrh-desk-upravy.png', fullPage: true });
  const g = await doporucene(p);
  tvrdi('R3: galerie nabízí „Poptávka z rezervací" a „Dnešní směny" v Doporučených', g.text.includes('Poptávka z rezervací') && g.text.includes('Dnešní směny'), g.text.slice(0, 300));
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('R7: návrh rozvrhu po úpravách pořád na místě', await nastroj.getByText('Navržený rozvrh').isVisible());
  tvrdi('R: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Widgety ↔ plánovač: Díry otevřou den, schválení volna znovu načte plánovač, záložka nastavení bez plochy.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_ROZVRH, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await widgetLi(p, 'rozvrh.diry').locator('.list-row, button').filter({ hasText: 'Nikdo 14:00–16:00' }).first().click();
  const den = p.getByRole('dialog');
  tvrdi('W1: řádek Děr otevře v plánovači okno toho dne', await dokud(() => den.getByText('Přiřazené směny').isVisible(), 3000));
  tvrdi('W1: …s oknem <Modal> a polem „Kdo" (ne confirm ani ruční overlay)', await den.getByLabel('Kdo').isVisible());
  await den.getByLabel('Kdo').selectOption({ label: 'Eva Testová' }).catch(() => {});
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  // Rozepsaný výběr hlídá DiscardGuard — potvrdit zahození, pokud se zeptá.
  const zahodit = p.getByRole('button', { name: /Zahodit/ });
  if (await zahodit.count()) await zahodit.first().click().catch(() => {});
  await dokud(async () => !(await den.isVisible()), 2000);

  const pred = dotazyNa(stav, ['/api/timeoff']).length;
  await widgetLi(p, 'rozvrh.zadosti_volno').getByRole('button', { name: 'Schválit' }).first().click();
  tvrdi('W2: Schválit pošle PATCH /api/timeoff se stavem approved', await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/timeoff' && z.m === 'PATCH' && z.body.includes('approved')), 2000));
  tvrdi('W2: …a plánovač i widget se znovu načtou (schválené volno blokuje dny)', await dokud(() => dotazyNa(stav, ['/api/timeoff']).length >= pred + 2, 3000), `${dotazyNa(stav, ['/api/timeoff']).length - pred} nových dotazů`);

  await p.locator('[aria-label="Část rozvrhu"]').getByText('Typy směn').click();
  tvrdi('W3: záložka Typy směn je bez plochy widgetů, hlavička zůstává (jeden h1)', await dokud(async () => (await p.locator('[data-plocha]').count()) === 0, 2000) && (await h1(p)).pocet === 1);
  tvrdi('W3: …a ukáže typy směn s „Přidat typ" (jediná limetka záložky)', await p.getByRole('button', { name: 'Přidat typ' }).isVisible() && await limetky(p) === 1);
  await ctx.close();
}

// 4) Oprávnění: Provozní bez dostupnosti a volna — zastaralý server widgety pošle, nesmí se ukázat ani ptát.
{
  const role = roleMine('provozni', ['dostupnost.zobrazit', 'dostupnost.upravit', 'volno.zobrazit', 'volno.schvalovat']);
  const { ctx, p, stav } = await kontext({ fix: FIX_ROZVRH, mineData: role, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await p.waitForTimeout(600);
  tvrdi('O1: bez volno.zobrazit není widget Žádosti o volno', await naPlose(p, 'rozvrh.zadosti_volno') === 0);
  tvrdi('O1: bez dostupnost.zobrazit není widget Dostupnost týmu', await naPlose(p, 'rozvrh.dostupnost_tymu') === 0);
  tvrdi('O1: …a na /api/timeoff ani /api/availability neodešel dotaz (ani z plánovače)', dotazyNa(stav, ['/api/timeoff', '/api/availability']).length === 0,
    dotazyNa(stav, ['/api/timeoff', '/api/availability']).map(d => d.u).join(', '));
  tvrdi('O1: Provozní bez rozvrh.mazat_mesic nemá „Vymazat měsíc"', await p.getByRole('menuitem', { name: /Vymazat měsíc/ }).count() === 0);
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  const g = await doporucene(p);
  tvrdi('O1: galerie nenabízí Žádosti o volno ani Dostupnost týmu', !g.vse.includes('Žádosti o volno') && !g.vse.includes('Dostupnost týmu'));
  await ctx.close();
}

// 4a) Provozní s dostupnost.zobrazit, ale bez dostupnost.upravit: to, co lidé zadali (dny,
// preference, poznámku pro vedení), musí vidět jen ke čtení — dřív to plánovač ukazoval
// na kartě člověka, po převodu na widgety to bez práva k úpravě nešlo otevřít vůbec.
{
  const role = roleMine('provozni', ['dostupnost.upravit']);
  const { ctx, p, stav } = await kontext({ fix: FIX_ROZVRH, mineData: role, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  const dost = widgetLi(p, 'rozvrh.dostupnost_tymu');
  const radky = await dost.locator('.list-row').count();
  tvrdi('O3: Dostupnost týmu L ukáže nejvýš 8 řádků a zbytek „…a dalších N" (dřív celý tým nad plánovačem)', radky <= 8 && await dost.getByRole('button', { name: /…a dalších/ }).count() === 1, `${radky} řádků`);
  // Chybějící jsou první; kdo zadal, je za „…a dalších N" (rozbalí se na místě).
  await dost.getByRole('button', { name: /…a dalších/ }).click();
  await dost.locator('.list-row').filter({ hasText: 'Eva Testová' }).first().click();
  const okno = p.getByRole('dialog', { name: /Dostupnost — Eva Testová/ });
  tvrdi('O3: klepnutí na člověka, který zadal, otevře jeho dostupnost i bez dostupnost.upravit', await dokud(() => okno.isVisible(), 3000));
  const text = await okno.innerText().catch(() => '');
  tvrdi('O3: …s poznámkou pro vedení, dnem „nemůže" a preferencí', text.includes('Škola ve středu') && /nemůže/i.test(text) && text.includes('Ranní'), text.slice(0, 300));
  tvrdi('O3: …jen ke čtení — bez „Uložit a upozornit" a bez PATCH', await okno.getByRole('button', { name: 'Uložit a upozornit' }).count() === 0
    && !(stav.zapisy ?? []).some(z => z.path === '/api/availability'));
  await ctx.close();
}

// 4b) Náhled rozvrhu (skladník: rozvrh.nahled bez rozvrh.zobrazit) — žádný plánovač, žádný 403.
{
  const { ctx, p, stav } = await kontext({ fix: { ...FIX_ROZVRH, polozky: [{ id: 'nastroj', widget: 'nastroj', velikost: 'L' }], dostupne: ['rozvrh.tym_nahled'] }, mineData: roleMine('skladnik'), dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await p.waitForTimeout(600);
  tvrdi('O2: náhled bez dotazu na /api/schedule (plánovač by skončil 403)', dotazyNa(stav, ['/api/schedule']).length === 0, dotazyNa(stav, ['/api/schedule']).map(d => d.u).join(', '));
  tvrdi('O2: …bere /api/shifts?team=1 a řekne, že je to náhled', dotazyNa(stav, ['/api/shifts']).some(d => d.u.includes('team=1')) && await p.getByText('Vidíš náhled rozvrhu týmu').isVisible());
  tvrdi('O2: bez Vygenerovat a bez limetky', await p.getByRole('button', { name: 'Vygenerovat rozvrh' }).count() === 0 && await limetky(p) === 0);
  await ctx.close();
}

// 5) 500 na burze → chyba jen ve Výměnách, ostatní widgety i plánovač žijí.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_ROZVRH, dalsi: podvrh() });
  stav.chyby['/api/shifts/offers'] = 500;
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await p.waitForTimeout(800);
  tvrdi('E1: Výměny ukážou „Widget se nenačetl" se „Zkusit znovu"', await widgetLi(p, 'rozvrh.vymeny').getByText('Widget se nenačetl').isVisible()
    && await widgetLi(p, 'rozvrh.vymeny').getByRole('button', { name: 'Zkusit znovu' }).isVisible());
  tvrdi('E1: jen ony — plánovač a ostatní widgety žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && await widgetLi(p, 'nastroj').getByRole('group', { name: 'Měsíc', exact: true }).isVisible());
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, „Vygenerovat rozvrh" vidět, klikatelné a návrh se ukáže.
{
  const { ctx, p } = await kontext({ fix: FIX_ROZVRH, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  tvrdi('T1: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const gen = p.getByRole('button', { name: 'Vygenerovat rozvrh' });
  tvrdi('T1: „Vygenerovat rozvrh" je vidět a povolené', await gen.isVisible() && await gen.isEnabled());
  // Řádek Dostupnosti týmu: jméno a stav na dvou řádcích, bez chipu a chevronu osiřelých na
  // třetím (dřív 105 px na řádek). Prázdný ocas ListRow na telefonu přidá jen mezeru řádku.
  const vysky = await widgetLi(p, 'rozvrh.dostupnost_tymu').locator('.list-row').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
  tvrdi('T1: Dostupnost týmu na telefonu — řádek na dva řádky textu (výška ≤ 80 px, dřív 105)', vysky.length > 0 && Math.max(...vysky) <= 80, JSON.stringify(vysky));
  // Záložky Rozvrhu (šest položek) jsou jeden posuvný pás, ne dva řádky textu.
  const pas = await p.getByRole('tablist', { name: 'Část rozvrhu' }).evaluate(el => {
    const tabs = [...el.querySelectorAll('[role="tab"]')].map(t => t.getBoundingClientRect().top);
    return { radku: new Set(tabs.map(Math.round)).size, posuvny: el.scrollWidth > el.clientWidth, sirka: Math.round(el.getBoundingClientRect().right), vw: document.documentElement.clientWidth };
  });
  tvrdi('T1: záložky Rozvrhu na telefonu v jednom řádku, posuvné do strany a uvnitř obrazovky', pas.radku === 1 && pas.posuvny && pas.sirka <= pas.vw, JSON.stringify(pas));
  await p.getByRole('tab', { name: 'Pravidla' }).click();
  const vZaberu = await p.getByRole('tab', { name: 'Pravidla' }).evaluate(t => { const r = t.getBoundingClientRect(); const l = t.closest('[role="tablist"]').getBoundingClientRect(); return r.left >= l.left - 1 && r.right <= l.right + 1; });
  tvrdi('T1: vybraná poslední záložka se posune do záběru', vZaberu);
  await p.getByRole('tab', { name: 'Rozvrh' }).click();
  await p.screenshot({ path: OUT + 'k69-b1-rozvrh-tel.png', fullPage: true });
  await gen.click();
  tvrdi('T1: …a ukáže návrh v nástroji', await dokud(() => widgetLi(p, 'nastroj').getByText('Navržený rozvrh').isVisible(), 3000));
  tvrdi('T1: s návrhem pořád bez přetečení', await bezPreteceni(p));
  await ctx.close();
}

// 11) Tmavý režim: přerušovaný rámeček návrhu v mřížce a tečka „Návrh" v legendě nesmí být
// černé na tmavé ploše (dřív border-black/30 a /50 bez tmavé náhrady).
{
  const { ctx, p, chyby } = await kontext({ fix: FIX_ROZVRH, tmavy: true, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  tvrdi('T11: stránka je v tmavém režimu', await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark');
  await p.getByRole('button', { name: 'Vygenerovat rozvrh' }).click();
  await dokud(() => widgetLi(p, 'nastroj').getByText('Navržený rozvrh').isVisible(), 3000);
  const navrh = await kontrastCar(p, '[data-plocha] li[data-widget="nastroj"] .border-dashed');
  tvrdi('T11: návrh v mřížce i tečka „Návrh" v legendě mají čitelný rámeček (≥ 2:1)', navrh.pocet > 1 && navrh.nejhorsi >= 2, JSON.stringify(navrh));
  const tecky = await p.locator('[data-plocha] li[data-widget="nastroj"] [aria-label="Legenda"] [class*="cat-dot-"], [data-plocha] li[data-widget="nastroj"] [aria-label="Legenda"] .bg-black\\/15').count();
  tvrdi('T11: tečky typů v legendě jsou třídy kategorií, ne inline hex', tecky > 0 && await p.locator('[data-plocha] li[data-widget="nastroj"] [aria-label="Legenda"] [style*="background"]').count() === 0, `${tecky}`);
  await p.screenshot({ path: OUT + 'k69-b1-rozvrh-tmavy.png', fullPage: true });
  tvrdi('T11: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Vedení: Moje směny
// ---------------------------------------------------------------------------
const FIX_MOJE_V = nacti('k69-b1-rozlozeni-moje-vedeni');

{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_MOJE_V, dalsi: podvrh() });
  await otevri(p, MOJE_V, 'vedeni.moje_smeny');
  const h = await h1(p);
  tvrdi('MV1: právě jeden h1 „Moje směny" (Dostupnost pod plochou má h2)', h.pocet === 1 && h.prvniJeH1 && h.text === 'Moje směny', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('MV1: nástroj „Nadcházející směny" v klidu vidět, jen nadcházející', await nastroj.getByRole('heading', { name: 'Nadcházející směny' }).isVisible()
    && (await nastroj.locator('.list-row').count()) === 2, `${await nastroj.locator('.list-row').count()} řádků`);
  const prehled = await widgetLi(p, 'moje.smeny_prehled').innerText();
  tvrdi('MV1: Moje směny v číslech — 2 nadcházející, odpracováno 12,5 h (noční 8 h)', prehled.includes("12,5") && /nadcházející[\s\S]*2/i.test(prehled), prehled.slice(0, 160));
  tvrdi('MV1: Moje volno jen vlastní (?mine=1)', dotazyNa(stav, ['/api/timeoff']).every(d => d.u.includes('mine=1')) && (await widgetLi(p, 'moje.schvalene_volno').innerText()).includes('Schváleno'));
  tvrdi('MV1: na stránce jediná limetka (Odeslat dostupnost pod plochou; Odeslat žádost je primary)', await limetky(p) <= 1, `${await limetky(p)}×`);

  // Burza u směny: nabídka → okno s poznámkou → POST.
  await nastroj.getByRole('button', { name: /Další akce se směnou/ }).first().click();
  await p.getByRole('menuitem', { name: 'Nabídnout do burzy…' }).click();
  const okno = p.getByRole('dialog', { name: 'Nabídnout směnu do burzy' });
  tvrdi('MV2: „Nabídnout do burzy…" otevře okno s poznámkou', await dokud(() => okno.isVisible(), 2000) && await okno.getByLabel('Proč směnu nabízíš?').isVisible());
  await okno.getByLabel('Proč směnu nabízíš?').fill('Svatba sestry');
  await okno.getByRole('button', { name: 'Nabídnout' }).click();
  tvrdi('MV2: …a pošle POST /api/shifts/offers s poznámkou', await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/shifts/offers' && z.m === 'POST' && z.body.includes('Svatba sestry')), 2000));

  await upravyANastroj(p, stav, 'MV');
  const g = await doporucene(p);
  tvrdi('MV3: galerie nabízí „Minulé směny" a „Kdo má směnu" v Doporučených', g.text.includes('Minulé směny') && g.text.includes('Kdo má směnu'), g.text.slice(0, 300));
  await hotovo(p).click().catch(() => {});
  tvrdi('MV: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 4) Oprávnění: bez burzy (ani schvalování) — žádná nabídka u směny, žádný dotaz na burzu, bez widgetu Výměny.
{
  const role = roleMine('provozni', ['rozvrh.burza', 'rozvrh.vymeny_schvalovat']);
  const { ctx, p, stav } = await kontext({ fix: FIX_MOJE_V, mineData: role, dalsi: podvrh() });
  await otevri(p, MOJE_V, 'vedeni.moje_smeny');
  await p.waitForTimeout(600);
  tvrdi('MO1: bez rozvrh.burza není widget Výměny směn', await naPlose(p, 'rozvrh.vymeny') === 0);
  tvrdi('MO1: …ani nabídka u směny', await widgetLi(p, 'nastroj').getByRole('button', { name: /Další akce se směnou/ }).count() === 0);
  tvrdi('MO1: …a na /api/shifts/offers neodešel dotaz', dotazyNa(stav, ['/api/shifts/offers']).length === 0);
  await ctx.close();
}

// 5) 500 na vlastním volnu → chyba jen v Mém volnu; 6) telefon 390.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_MOJE_V, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  stav.chyby['/api/timeoff?mine=1'] = 500;
  await otevri(p, MOJE_V, 'vedeni.moje_smeny');
  await p.waitForTimeout(800);
  tvrdi('ME1: Moje volno ukáže „Widget se nenačetl"', await widgetLi(p, 'moje.schvalene_volno').getByText('Widget se nenačetl').isVisible());
  tvrdi('ME1: jen ono — nástroj a čísla žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && await widgetLi(p, 'nastroj').getByRole('heading', { name: 'Nadcházející směny' }).isVisible());
  tvrdi('MT1: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const menu = widgetLi(p, 'nastroj').getByRole('button', { name: /Další akce se směnou/ }).first();
  tvrdi('MT1: nabídka u směny je na telefonu vidět a klikatelná', await menu.isVisible() && await menu.isEnabled());
  await p.screenshot({ path: OUT + 'k69-b1-moje-vedeni-tel.png', fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Zaměstnanec: Moje směny
// ---------------------------------------------------------------------------
const FIX_MOJE_Z = nacti('k69-b1-rozlozeni-moje-zamestnanec');
const BARISTA = roleMine('barista');

{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: FIX_MOJE_Z, mineData: BARISTA, dalsi: podvrh({ mineId: 16 }) });
  await otevri(p, MOJE_Z, 'zamestnanec.moje_smeny');
  const h = await h1(p);
  tvrdi('MZ1: právě jeden h1 „Moje směny"', h.pocet === 1 && h.text === 'Moje směny', JSON.stringify(h));
  tvrdi('MZ1: nástroj „Nadcházející směny" v klidu vidět', await widgetLi(p, 'nastroj').getByRole('heading', { name: 'Nadcházející směny' }).isVisible());
  const tym = widgetLi(p, 'rozvrh.tym_nahled');
  tvrdi('MZ1: Kdo má směnu — vlastní směna jako „Ty", kolegové jménem', (await tym.innerText()).includes('Ty') && (await tym.innerText()).includes('Jakub Horák'));
  const minule = widgetLi(p, 'moje.minule_smeny');
  tvrdi('MZ1: Minulé směny — hodnocení z /api/shifts chipem (bez ★ znaku), jinak „Bez hodnocení"', (await minule.innerText()).includes('5/5') && (await minule.innerText()).includes('Bez hodnocení') && !(await minule.innerText()).includes('★'));
  const vym = widgetLi(p, 'rozvrh.vymeny');
  tvrdi('MZ1: barista v burze vidí volnou směnu s „Převzít", ne schvalování', await vym.getByRole('button', { name: 'Převzít' }).count() === 1 && await vym.getByRole('button', { name: 'Schválit' }).count() === 0);
  tvrdi('MZ1: jediný h1 a žádná limetka na stránce', await limetky(p) === 0, `${await limetky(p)}×`);
  await p.screenshot({ path: OUT + 'k69-b1-moje-zamestnanec-desk.png', fullPage: true });
  await upravyANastroj(p, stav, 'MZ');
  const g = await doporucene(p);
  tvrdi('MZ3: galerie baristy nabízí Moje směny v číslech/Minulé směny, ne Žádosti o volno týmu', g.vse.includes('Minulé směny') && !g.vse.includes('Žádosti o volno') && !g.vse.includes('Naplánované hodiny'));
  await hotovo(p).click().catch(() => {});
  tvrdi('MZ: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Telefon 390 zaměstnance.
{
  const { ctx, p } = await kontext({ role: 'employee', fix: FIX_MOJE_Z, mineData: BARISTA, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh({ mineId: 16 }) });
  await otevri(p, MOJE_Z, 'zamestnanec.moje_smeny');
  tvrdi('MZT1: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  await p.screenshot({ path: OUT + 'k69-b1-moje-zamestnanec-tel.png', fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Zaměstnanec: Dostupnost
// ---------------------------------------------------------------------------
const FIX_DOST = nacti('k69-b1-rozlozeni-dostupnost');

{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: FIX_DOST, mineData: BARISTA, dalsi: podvrh({ mineId: 16 }) });
  await otevri(p, DOSTUPNOST, 'zamestnanec.dostupnost');
  const h = await h1(p);
  tvrdi('D1: právě jeden h1 „Dostupnost" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Dostupnost', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('D1: nástroj = kalendář dostupnosti, v klidu vidět', await nastroj.getByRole('heading', { name: 'Kalendář dostupnosti' }).isVisible());
  tvrdi('D1: jediná limetka je „Odeslat dostupnost" (Odeslat žádost o volno je primary)', await limetky(p) === 1 && await nastroj.getByRole('button', { name: 'Odeslat dostupnost' }).isVisible(), `${await limetky(p)}×`);

  // 7) Rozepsaná poznámka přežije vstup do úprav a výstup z nich.
  await nastroj.getByLabel('Poznámka pro vedení').fill('Ve středu škola');
  await upravyANastroj(p, stav, 'D');
  const g = await doporucene(p);
  tvrdi('D3: galerie nabízí „Kdo má směnu" a „Nejbližší směna" v Doporučených', g.text.includes('Kdo má směnu') && g.text.includes('Nejbližší směna'), g.text.slice(0, 300));
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('D7: rozepsaná poznámka přežila úpravy', await nastroj.getByLabel('Poznámka pro vedení').inputValue() === 'Ve středu škola');
  tvrdi('D: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 5) 500 na vlastním volnu → chyba jen v Mém volnu, kalendář žije; 6) telefon 390.
{
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_DOST, mineData: BARISTA, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh({ mineId: 16 }) });
  stav.chyby['/api/timeoff?mine=1'] = 500;
  await otevri(p, DOSTUPNOST, 'zamestnanec.dostupnost');
  await p.waitForTimeout(800);
  tvrdi('DE1: Moje volno ukáže „Widget se nenačetl", kalendář žije', await widgetLi(p, 'moje.schvalene_volno').getByText('Widget se nenačetl').isVisible()
    && await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1 && await widgetLi(p, 'nastroj').getByRole('heading', { name: 'Kalendář dostupnosti' }).isVisible());
  tvrdi('DT1: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const odeslat = p.getByRole('button', { name: 'Odeslat dostupnost' });
  await odeslat.scrollIntoViewIfNeeded();
  const box = await odeslat.boundingBox();
  tvrdi('DT1: „Odeslat dostupnost" je vidět, povolené a přes celou šířku karty', !!box && box.width > 300 && await odeslat.isEnabled(), JSON.stringify(box));
  await p.screenshot({ path: OUT + 'k69-b1-dostupnost-tel.png', fullPage: true });
  await ctx.close();
}

// 11) Tmavý režim Dostupnosti: obrys dne „Dostupný" (a prstenec dneška, je-li v měsíci) světlý.
{
  const { ctx, p, chyby } = await kontext({ role: 'employee', fix: FIX_DOST, mineData: BARISTA, tmavy: true, dalsi: podvrh({ mineId: 16 }) });
  await otevri(p, DOSTUPNOST, 'zamestnanec.dostupnost');
  const dny = await kontrastCar(p, '[data-plocha] li[data-widget="nastroj"] button[class*="border-black/10"]');
  tvrdi('T11: Dostupnost — obrys dnů je v tmavém režimu vidět (≥ 1,2:1, ne černý)', dny.pocet > 0 && dny.nejhorsi >= 1.2, JSON.stringify(dny));
  const dnes = await kontrastCar(p, '[data-plocha] li[data-widget="nastroj"] [class*="ring-black/30"]', 'boxShadow');
  tvrdi('T11: …a prstenec dneška (pokud je v měsíci) taky', dnes.pocet === 0 || dnes.nejhorsi >= 2, JSON.stringify(dnes));
  await p.screenshot({ path: OUT + 'k69-b1-dostupnost-tmavy.png', fullPage: true });
  tvrdi('T11: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
