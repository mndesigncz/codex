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
  kontext, konec, tvrdi, otevri, lista, upravit, hotovo, vUpravach, dokud, poradi, poradiPutu, dotazyNa, roleMine, DIR, OUT, VLASTNIK,
} from './k68-spolecne.mjs';
import { STRANKA as STRANKA_ROZVRH } from '../../lib/widgety/stranky/vedeni.rozvrh.ts';

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
    if (['/api/timeoff', '/api/shifts/offers', '/api/schedule', '/api/availability', '/api/schedule/publish', '/api/availability/remind', '/api/shifts'].includes(path)) {
      (stav.zapisy ??= []).push({ m: req.method(), path, full, body: req.postData() });
      // Kolo 7 (R7-1): připomenutí dostupnosti, poznámka ke směně a stav publikování.
      if (path === '/api/availability/remind') return json({ notified: 3, ztlumeno: 0 });
      if (path === '/api/shifts' && req.method() === 'PATCH') { const b = JSON.parse(req.postData() || '{}'); return json({ ok: true, shift: { id: b.id, note: b.note ?? null } }); }
      if (path === '/api/schedule/publish') return json({ ok: true, notified: 3, publishedAt: new Date().toISOString() });
      // Schválení Terezina volna (71): ve dnech volna má dvě směny — server je vrátí v `conflicts` (kolo 6 UX).
      if (path === '/api/timeoff' && req.method() === 'PATCH') {
        const b = JSON.parse(req.postData() || '{}');
        const conflicts = b.id === 71 && b.status === 'approved' ? [{ date: DNY.ZA7, startTime: '10:00', endTime: '14:00' }, { date: DNY.ZA5, startTime: '08:00', endTime: '16:00' }] : [];
        return json({ ok: true, request: { id: b.id, status: b.status }, conflicts });
      }
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
  // Kolo 6 UX (V02): aktuální měsíc, dokud v něm jsou směny po dnešku; po 25. dni příští.
  // Fixtura má směny 2.–5. dne, takže od 5. dne v měsíci se otevře příští.
  const denDnes = Number(DNY.DNES.slice(8, 10));
  const cekanyMesic = denDnes > 25 || denDnes >= 5 ? 'Příští měsíc' : 'Tento měsíc';
  tvrdi(`R1: nástroj otevírá „${cekanyMesic}" (aktuální, dokud má směny po dnešku)`, await dokud(async () => (await nastroj.getByRole('button', { name: cekanyMesic }).getAttribute('aria-pressed')) === 'true', 3000));
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
  // S Týmem na den je formulář s vlastním časem sbalený pod „Přidat s vlastním časem…".
  await den.getByRole('button', { name: 'Přidat s vlastním časem…' }).click().catch(() => {});
  tvrdi('W1: …s oknem <Modal> a polem „Kdo" (ne confirm ani ruční overlay)', await dokud(() => den.getByLabel('Kdo').isVisible(), 1500));
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

// Kolo 7 (R7-1): stav publikování u měsíce, poznámka ke směně (okno dne, pilulka, úprava),
// připomenutí dostupnosti a zamítnutí volna s důvodem.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_ROZVRH, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  const nastroj = widgetLi(p, 'nastroj');
  const chip = nastroj.locator('[data-publikace]');
  tvrdi('R7-1: Chip „Publikováno 3. 10." vedle přepínače měsíce', await dokud(async () => (await chip.getAttribute('data-publikace').catch(() => null)) === 'publikovano', 3000)
    && /Publikováno 3\. 10\./.test(await chip.innerText()), await chip.innerText().catch(() => '—'));
  // Pilulka s poznámkou: ikona, poznámka v title a nic nepřetéká buňku.
  const pil = nastroj.locator('[data-poznamka]');
  const pm = await pil.first().evaluate(el => ({ title: el.getAttribute('title'), ikona: !!el.querySelector('svg'), pres: el.scrollWidth - el.clientWidth, bunka: el.closest('button')?.scrollWidth - el.closest('button')?.clientWidth }));
  tvrdi('R7-2: pilulka směny s poznámkou má ikonu a poznámku v title, nepřetéká', await pil.count() >= 1 && pm.ikona && /klíče u Petry/.test(pm.title ?? '') && pm.bunka <= 1, JSON.stringify(pm));
  // Okno dne s poznámkou u směny, pole Poznámka a úprava tužkou.
  await pil.first().click();
  const den = p.getByRole('dialog');
  tvrdi('R7-3: okno dne ukazuje poznámku u uložené směny', await dokud(() => den.locator('[data-poznamka-smeny]').first().isVisible(), 3000) && /klíče u Petry/.test(await den.locator('[data-poznamka-smeny]').first().innerText()));
  await den.getByRole('button', { name: /Upravit poznámku ke směně/ }).first().click();
  const pole = den.getByLabel(/Poznámka ke směně — /);
  await pole.fill('Klíče jsou v trezoru');
  await den.getByRole('button', { name: 'Uložit' }).click();
  tvrdi('R7-3: tužka → Uložit pošle PATCH /api/shifts s poznámkou', await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/shifts' && z.m === 'PATCH' && z.body.includes('Klíče jsou v trezoru')), 2000));
  await den.getByRole('button', { name: 'Přidat s vlastním časem…' }).click().catch(() => {});
  await den.getByLabel('Kdo').selectOption({ label: 'Jakub Horák' }).catch(() => {});
  await den.getByLabel('Poznámka ke směně (nepovinné)').fill('Rozvoz v 9:00');
  tvrdi('R7-4: pole Poznámka má maxLength 200', await den.getByLabel('Poznámka ke směně (nepovinné)').getAttribute('maxlength') === '200');
  await den.getByRole('button', { name: /^(Přidat směnu|Přesto přidat)$/ }).last().click();
  tvrdi('R7-4: přidání směny pošle POST /api/schedule s poznámkou', await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/schedule' && z.m === 'POST' && z.body.includes('"note":"Rozvoz v 9:00"')), 2000),
    JSON.stringify((stav.zapisy ?? []).filter(z => z.path === '/api/schedule').map(z => z.body).slice(-1)));
  await den.getByRole('button', { name: 'Zavřít', exact: true }).last().click().catch(() => {});
  await dokud(async () => !(await den.isVisible()), 2000);
  // Připomenout dostupnost.
  const dost = widgetLi(p, 'rozvrh.dostupnost_tymu');
  const pripomenout = dost.getByRole('button', { name: /^Připomenout \(\d+\)$/ });
  tvrdi('R7-5: Dostupnost týmu má „Připomenout (n)"', await pripomenout.count() === 1, await dost.innerText().catch(() => '').then(x => x.slice(0, 120)));
  await pripomenout.click();
  tvrdi('R7-5: …pošle POST /api/availability/remind s měsícem widgetu', await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/availability/remind' && /"month":"\d{4}-\d{2}"/.test(z.body)), 2000));
  tvrdi('R7-5: …Toast „Připomenuto 3 lidem" a tlačítko „Připomenuto" zakázané', await dokud(() => p.getByText('Připomenuto 3 lidem').isVisible(), 2000)
    && await dost.getByRole('button', { name: 'Připomenuto' }).isDisabled());
  // Zamítnout s důvodem.
  const volno = widgetLi(p, 'rozvrh.zadosti_volno');
  await volno.getByRole('button', { name: /Další akce se žádostí/ }).first().click();
  await p.getByRole('menuitem', { name: /Zamítnout s důvodem/ }).click();
  const okno = p.getByRole('dialog', { name: 'Zamítnout žádost o volno' });
  tvrdi('R7-6: „···" › Zamítnout s důvodem… otevře okno s polem „Důvod (uvidí žadatel)"', await dokud(() => okno.isVisible(), 2000) && await okno.getByLabel('Důvod (uvidí žadatel)').isVisible());
  await okno.getByLabel('Důvod (uvidí žadatel)').fill('Ten týden už má volno Petr');
  await okno.getByRole('button', { name: 'Zamítnout' }).click();
  tvrdi('R7-6: …PATCH /api/timeoff rejected s note', await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/timeoff' && z.m === 'PATCH' && z.body.includes('rejected') && z.body.includes('Ten týden už má volno Petr')), 2000));
  tvrdi('R7-6: Zamítnout v řádku zůstává jedním klikem (bez okna)', await volno.getByRole('button', { name: 'Zamítnout', exact: true }).count() >= 1);
  tvrdi('R7: bez chyb v konzoli', chyby.filter(c => !/hydrat|same key/i.test(c)).length === 0, chyby.slice(0, 3).join(' | '));
  await p.screenshot({ path: OUT + 'k83-rozvrh-desk.png', fullPage: true });
  await ctx.close();
}
// …a „Změněno od publikování" s „Publikovat změny".
{
  const zmeneno = (req, json, stav) => {
    const u = new URL(req.url());
    if (u.pathname === '/api/schedule' && req.method() === 'GET') {
      const d = nacti('k69-b1-schedule', u.searchParams.get('month') ?? MESIC);
      return json({ ...d, publication: { ...d.publication, zmeneno: true } });
    }
    return podvrh()(req, json, stav);
  };
  const { ctx, p } = await kontext({ fix: FIX_ROZVRH, dalsi: zmeneno });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  const chip = widgetLi(p, 'nastroj').locator('[data-publikace]');
  tvrdi('R7-7: změněný měsíc — Chip „Změněno od publikování" a tlačítko „Publikovat změny"',
    await dokud(async () => (await chip.getAttribute('data-publikace').catch(() => null)) === 'zmeneno', 3000) && await p.getByRole('button', { name: 'Publikovat změny' }).first().isVisible());
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
  // Audit 2026-10 (V06): na telefonu je v segmentu jen Rozvrh | Kalendář — šest záložek v pásu
  // se na 390 px uřízlo („Otevírací d…"). Nastavení rozvrhu (Typy směn, Otevírací doba, Pevné dny,
  // Pravidla) je v „···" hlavičky; otevřená část se do segmentu přidá, ať je vidět, kde jsem.
  const pas = await p.getByRole('tablist', { name: 'Část rozvrhu' }).evaluate(el => {
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    return { nazvy: tabs.map(t => t.textContent.trim()), radku: new Set(tabs.map(t => Math.round(t.getBoundingClientRect().top))).size, posuvny: el.scrollWidth > el.clientWidth + 1, sirka: Math.round(el.getBoundingClientRect().right), vw: document.documentElement.clientWidth };
  });
  tvrdi('T1: segment Rozvrhu na telefonu jen Rozvrh a Kalendář, v jednom řádku, nic se neuřízne', pas.nazvy.join('|') === 'Rozvrh|Kalendář' && pas.radku === 1 && !pas.posuvny && pas.sirka <= pas.vw, JSON.stringify(pas));
  await p.getByRole('button', { name: /Další akce|Možnosti stránky/ }).first().click();
  await p.getByRole('menuitem', { name: 'Pravidla' }).click();
  tvrdi('T1: Pravidla z „···" otevřou záložku a segment ji ukáže vybranou', await dokud(async () => (await p.getByRole('tab', { name: 'Pravidla' }).getAttribute('aria-selected')) === 'true', 2000));
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
  // Od filtru rozvrhu (rozvrh-filtr) stojí tečky typů v pásu typů nad mřížkou
  // a legenda je podruhé nekreslí — hlídá se obojí místo.
  const kde = ['[aria-label="Legenda"]', '[data-pas="typy"]'].map(m => `[data-plocha] li[data-widget="nastroj"] ${m}`);
  const tecky = await p.locator(kde.flatMap(m => [`${m} [class*="cat-dot-"]`, `${m} .bg-black\\/15`]).join(', ')).count();
  tvrdi('T11: tečky typů v legendě a pásu typů jsou třídy kategorií, ne inline hex', tecky > 0 && await p.locator(kde.map(m => `${m} [style*="background"]`).join(', ')).count() === 0, `${tecky}`);
  await p.screenshot({ path: OUT + 'k69-b1-rozvrh-tmavy.png', fullPage: true });
  tvrdi('T11: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Kolo 6 UX (B1): víc údajů v mřížce, týdenní pohled, Kč, kolize volna, výchozí rozložení
// ---------------------------------------------------------------------------
// Výchozí rozložení přímo z kódu (dostupnost M a hned za ní plánovač) — fixtura
// k69-b1-rozlozeni-rozvrh je uložené rozložení podniku a nový default se jí netýká.
const FIX_VYCHOZI = {
  ...FIX_ROZVRH, zdroj: 'aplikace',
  polozky: STRANKA_ROZVRH.vychozi['typ:vedeni'].map(x => ({ id: x.w === 'nastroj' ? 'nastroj' : x.w.replace(/[._]/g, '-'), widget: x.w, velikost: x.s ?? 'L' })),
};
const mrizka = (p) => widgetLi(p, 'nastroj').locator('[aria-label="Mřížka rozvrhu"]');
const bunkaDne = (p, d) => widgetLi(p, 'nastroj').locator('[aria-label="Mřížka rozvrhu"] + div > button').filter({ has: p.locator(`span:text-is("${Number(d.slice(8, 10))}")`) }).first();

// Redesign v3: na telefonu nad mřížkou není „Tento / Příští měsíc" (jen ‹ měsíc › a Filtry);
// měsíc se tam přepíná šipkami podle nadpisu plánovače (sr-only, pro odečítač).
async function mesicSipkami(p, posun) {
  const ted = new Date(); const d = new Date(Date.UTC(ted.getUTCFullYear(), ted.getUTCMonth() + posun, 15));
  const cil = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric', timeZone: 'Europe/Prague' }).format(d).toLowerCase();
  const nadpis = p.locator('#planovac-nadpis');
  const text = async () => (await nadpis.innerText()).trim().toLowerCase();
  for (let i = 0; i < 3 && (await text()) !== cil; i++) {
    await p.getByRole('button', { name: posun > 0 ? 'Další měsíc' : 'Předchozí měsíc' }).first().click();
    await dokud(async () => (await text()) === cil, 1500);
  }
  return (await text()) === cil;
}
async function naTentoMesic(p) {
  const b = widgetLi(p, 'nastroj').getByRole('button', { name: 'Tento měsíc' });
  if (!(await b.isVisible())) { await mesicSipkami(p, 0); await dokud(() => mrizka(p).isVisible(), 3000); await p.waitForTimeout(300); return; }
  if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
  await dokud(async () => (await b.getAttribute('aria-pressed')) === 'true' && await mrizka(p).isVisible(), 3000);
  await p.waitForTimeout(300);
}
/** Prvky uvnitř kořene, které vyčuhují z rodiče nebo mají obsah širší než sebe (bez posuvných pásů a ořezu). */
const vycuhuje = (p, sel) => p.locator(sel).first().evaluate(koren => [...koren.querySelectorAll('*')].filter(el => {
  const r = el.getBoundingClientRect(); const rod = el.parentElement.getBoundingClientRect();
  if (r.width === 0) return false;
  const ven = r.right > rod.right + 1 || r.left < rod.left - 1;
  const cs = getComputedStyle(el);
  const sire = el.scrollWidth > el.clientWidth + 1 && !['auto', 'scroll', 'hidden'].includes(cs.overflowX) && cs.textOverflow !== 'ellipsis';
  return ven || sire;
}).slice(0, 5).map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`));

// K1) Telefon 390 s novým výchozím rozložením: mřížka bez scrollu, pilulky s avatarem v buňce, bez patičky.
{
  const { ctx, p, chyby } = await kontext({ fix: FIX_VYCHOZI, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  // Audit 2026-10 (V06): na telefonu je výchozí seznam dnů; měsíční mřížka je za přepínačem
  // (ikonové tlačítko vedle měsíce). K1 dál měří mřížku — přepne se na ni.
  tvrdi('K1: na telefonu je výchozí seznam dnů', await dokud(() => widgetLi(p, 'nastroj').locator('[data-agenda-rozvrhu]').isVisible(), 6000));
  await widgetLi(p, 'nastroj').locator('[data-prepinac-pohledu-tel]').click();
  await dokud(() => mrizka(p).isVisible(), 4000);
  tvrdi('K1: výchozí rozložení — Dostupnost týmu střední a hned za ní plánovač', JSON.stringify((await poradi(p)).slice(0, 2)) === JSON.stringify(['rozvrh-dostupnost-tymu', 'nastroj']), JSON.stringify(await poradi(p)));
  const top = await mrizka(p).evaluate(el => Math.round(el.getBoundingClientRect().top));
  tvrdi('K1: po načtení je mřížka vidět bez scrollu (začíná nad dokem)', top > 0 && top < 844 - 90, `top ${top}`);
  tvrdi('K1: přepínač Měsíc | Týden na telefonu není (pohled je vždy měsíc)', await widgetLi(p, 'nastroj').getByRole('tab', { name: 'Týden' }).isHidden());
  await naTentoMesic(p);
  const mira = await p.evaluate(() => {
    const bunky = [...document.querySelectorAll('[aria-label="Mřížka rozvrhu"] + div > button')];
    const pilulky = bunky.flatMap(b => [...b.querySelectorAll('span[title]')].map(s => ({ s, b })));
    return {
      pilulek: pilulky.length,
      venku: pilulky.filter(({ s, b }) => { const r = s.getBoundingClientRect(); const o = b.getBoundingClientRect(); return r.right > o.right + 0.5 || r.left < o.left - 0.5; }).length,
      orez: pilulky.filter(({ s }) => s.scrollWidth > s.clientWidth + 1).length,
      paticky: [...document.querySelectorAll('[data-paticka-dne]')].filter(e => e.getClientRects().length > 0).length,
      sirka: Math.round(bunky[0]?.getBoundingClientRect().width ?? 0),
    };
  });
  tvrdi('K1: pilulky v buňce nepřetékají ani se neořezávají (tečka + avatar)', mira.pilulek >= 4 && mira.venku === 0 && mira.orez === 0, JSON.stringify(mira));
  tvrdi('K1: patička dne „3 · 24 h" se na telefonu nekreslí', mira.paticky === 0, JSON.stringify(mira));
  const jakub = bunkaDne(p, `${MESIC}-04`).locator('span[title^="Jakub Horák"]');
  tvrdi('K1: Jakub s výchozím „👤" má v pilulce iniciály JH, ne emoji', (await jakub.innerText()).includes('JH') && !(await jakub.innerText()).includes('👤'), await jakub.innerText().catch(() => ''));
  tvrdi('K1: telefon bez vodorovného přetečení', await bezPreteceni(p));
  await widgetLi(p, 'nastroj').scrollIntoViewIfNeeded().catch(() => {});
  await p.getByRole('button', { name: 'Další akce' }).first().click();
  tvrdi('K1: v „···" je Publikovat s počtem směn měsíce', await dokud(() => p.getByRole('menuitem', { name: /Publikovat rozvrh \(4\)/ }).isVisible(), 1500));
  await p.keyboard.press('Escape');
  await p.screenshot({ path: OUT + 'k69-b1-k6-tel.png' });
  tvrdi('K1: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// K2) Monitor: jméno a od–do v pilulce, patička dne, souhrn hodin a Kč, týdenní pohled.
for (const [nazev, viewport] of [['1280', { width: 1280, height: 950 }], ['768', { width: 768, height: 1024 }]]) {
  const { ctx, p, chyby } = await kontext({ fix: FIX_ROZVRH, viewport, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await naTentoMesic(p);
  const nastroj = widgetLi(p, 'nastroj');
  if (nazev === '1280') {
    const eva = bunkaDne(p, `${MESIC}-02`);
    tvrdi('K2: pilulka nese krátké jméno a „08–16"', /Eva\s*08–16/.test(await eva.locator('span[title]').first().innerText()), await eva.innerText());
    tvrdi('K2: patička dne „1 · 8 h"', (await eva.locator('[data-paticka-dne]').innerText()).replace(/\s+/g, ' ') === '1 · 8 h', await eva.locator('[data-paticka-dne]').innerText().catch(() => ''));
    const souhrn = (await nastroj.locator('[data-naklad-planu]').innerText()).replace(/\s+/g, ' ');
    tvrdi('K2: nad mřížkou „Naplánováno 32 h" a mzdový náklad 5 280 Kč (Eva 16 h × 180, Jakub 12 h × 200)', /Naplánováno 32 ?h/i.test(souhrn) && /5\s280\sKč/.test(souhrn), souhrn);
    tvrdi('K2: …a chip „1 člověk bez sazby" (Tereza má sazbu 0)', souhrn.includes('1 člověk bez sazby'), souhrn);
    const hod = (await widgetLi(p, 'rozvrh.hodiny_lidi').innerText()).replace(/\s+/g, ' ');
    tvrdi('K2: widget Naplánované hodiny má pod hodinami Kč (Eva 2 880 Kč)', /2\s880\sKč/.test(hod), hod.slice(0, 200));
  }
  await nastroj.getByRole('tab', { name: 'Týden' }).click();
  const tyden = nastroj.locator('[data-tydenni-pohled]');
  tvrdi(`K3 ${nazev}: Segmented Týden ukáže tabulku lidé × dny`, await dokud(() => tyden.isVisible(), 2000) && await tyden.locator('[data-radek-tydne]').count() >= 3);
  tvrdi(`K3 ${nazev}: souhrn hodin zůstává i nad týdenním pohledem`, await nastroj.locator('[data-naklad-planu]').isVisible());
  tvrdi(`K3 ${nazev}: nic v tabulce nevyčuhuje ani nepřetéká`, (await vycuhuje(p, '[data-tydenni-pohled]')).length === 0, JSON.stringify(await vycuhuje(p, '[data-tydenni-pohled]')));
  tvrdi(`K3 ${nazev}: tabulka se vejde do šířky karty (bez posuvu do strany)`, await tyden.evaluate(el => el.scrollWidth <= el.clientWidth + 1) && await bezPreteceni(p));
  tvrdi(`K3 ${nazev}: řádek „Celkem" a sloupec hodin za týden`, (await tyden.locator('tfoot').innerText()).includes('Celkem'));
  if (nazev === '1280') {
    await p.reload({ waitUntil: 'networkidle' });
    await dokud(() => widgetLi(p, 'nastroj').locator('[data-tydenni-pohled]').isVisible(), 5000);
    tvrdi('K3: pohled Týden si plánovač pamatuje po znovunačtení', await widgetLi(p, 'nastroj').locator('[data-tydenni-pohled]').isVisible());
    await widgetLi(p, 'nastroj').locator('[data-tydenni-pohled] tbody button').first().click();
    tvrdi('K3: klepnutí na buňku otevře okno dne', await dokud(() => p.getByRole('dialog').getByText('Přiřazené směny').isVisible(), 3000));
    await p.keyboard.press('Escape');
  }
  await p.screenshot({ path: OUT + `k69-b1-k6-tyden-${nazev}.png`, fullPage: true });
  tvrdi(`K3 ${nazev}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// K4) Kolize volna se směnami: chip u čekající žádosti, po schválení toast s „Upravit rozvrh".
{
  const { ctx, p, stav } = await kontext({ fix: FIX_ROZVRH, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  const zad = widgetLi(p, 'rozvrh.zadosti_volno');
  const tereza = zad.locator('.list-row').filter({ hasText: 'Tereza Malá' }).first();
  const ondrej = zad.locator('.list-row').filter({ hasText: 'Ondřej Kučera' }).first();
  tvrdi('K4: čekající žádost s kolizí má chip „2 směny v rozvrhu"', (await tereza.innerText()).includes('2 směny v rozvrhu'), await tereza.innerText());
  tvrdi('K4: žádost bez kolize chip nemá', !(await ondrej.innerText()).includes('v rozvrhu'), await ondrej.innerText());
  await tereza.getByRole('button', { name: 'Schválit' }).click();
  const toast = p.getByText('Volno schváleno, ale 2 směny zůstaly v rozvrhu');
  tvrdi('K4: schválení projde a toast řekne, že směny zůstaly v rozvrhu', await dokud(() => toast.isVisible(), 3000)
    && (stav.zapisy ?? []).some(z => z.path === '/api/timeoff' && z.m === 'PATCH' && z.body.includes('approved')));
  await p.getByRole('button', { name: 'Upravit rozvrh' }).click();
  const okno = p.getByRole('dialog');
  tvrdi('K4: „Upravit rozvrh" otevře v plánovači první den volna se směnou', await dokud(() => okno.getByText('Přiřazené směny').isVisible(), 3000)
    && (await widgetLi(p, 'nastroj').getByRole('button', { name: 'Tento měsíc' }).getAttribute('aria-pressed')) === (DNY.ZA5.slice(0, 7) === MESIC ? 'true' : 'false'));
  await p.screenshot({ path: OUT + 'k69-b1-k6-kolize.png' });
  await ctx.close();
}

// K5) Bez finance.mzdy: hodiny ano, Kč ani „bez sazby" ne — ani v plánovači, ani ve widgetu.
{
  const bezMezd = { ...VLASTNIK, opravneni: VLASTNIK.opravneni.filter(k => k !== 'finance.mzdy') };
  const { ctx, p } = await kontext({ fix: FIX_ROZVRH, mineData: bezMezd, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await naTentoMesic(p);
  const souhrn = (await widgetLi(p, 'nastroj').locator('[data-naklad-planu]').innerText()).replace(/\s+/g, ' ');
  tvrdi('K5: bez finance.mzdy souhrn jen s hodinami', /Naplánováno/i.test(souhrn) && !souhrn.includes('Kč') && !souhrn.includes('bez sazby'), souhrn);
  tvrdi('K5: …a widget Naplánované hodiny bez Kč', !(await widgetLi(p, 'rozvrh.hodiny_lidi').innerText()).includes('Kč'));
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
  // Kolo 6 (Z10): „Nabídnout" je přímo u směny jako tlačítko (u zaměstnance i vedení), ne v „···".
  await nastroj.getByRole('button', { name: /^Nabídnout do burzy směnu/ }).first().click();
  const okno = p.getByRole('dialog', { name: 'Nabídnout směnu do burzy' });
  tvrdi('MV2: „Nabídnout" u směny otevře okno s poznámkou', await dokud(() => okno.isVisible(), 2000) && await okno.getByLabel('Proč směnu nabízíš?').isVisible());
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
  tvrdi('MO1: …ani nabídka u směny', await widgetLi(p, 'nastroj').getByRole('button', { name: /^Nabídnout do burzy směnu/ }).count() === 0);
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
  const menu = widgetLi(p, 'nastroj').getByRole('button', { name: /^Nabídnout do burzy směnu/ }).first();
  tvrdi('MT1: „Nabídnout" u směny je na telefonu vidět a klikatelné', await menu.isVisible() && await menu.isEnabled());
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
