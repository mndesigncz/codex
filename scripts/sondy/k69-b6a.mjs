// Kolo 69, balík B6a — Úkoly, Plánování a Nápady jako plochy s widgety (spec §7.4).
//
// Pro všech pět stránek (Úkoly vedení i zaměstnance, Plánování, Nápady vedení
// i zaměstnance): jeden h1 jako první, nástroj v klidu vidět, v úpravách sbalený
// bez „−" a přesunutelný nad widget i pod něj (PUT), galerie nabízí widgety balíku
// v „Doporučené", role bez klíče widget ani tlačítko nevidí, 500 na jednom endpointu
// shodí jen jeden widget, telefon 390 bez přetečení s použitelnou hlavní akcí
// a rozepsaný formulář v nástroji přežije úpravy (Úkoly a Plánování — Nápady mají
// formulář v okně, do úprav se s otevřeným oknem vstoupit nedá).
// Navíc to, co balík opravoval: widgety mluví s nástrojem (Podle lidí filtruje
// seznam, Schválit ve widgetu přesune kartu na tabuli, hlas ve widgetu se ukáže
// v seznamu), confirm() je okno, API vrací completedAt pro Splněno dnes.
//
// Fixtury: scripts/sondy/fixtury/k69-b6a-*.json; datumy (DNES, VCERA…) se doplní
// při podvrhu podle pražského dne, ať sonda nezestárne.
import { readFileSync } from 'node:fs';
import {
  kontext, konec, tvrdi, otevri, lista, upravit, hotovo, vUpravach, dokud, poradi, poradiPutu, dotazyNa, roleMine, mine, ROLE, DIR, OUT, BASE,
} from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PREDVCEREM: praha(-2), ZITRA: praha(1), POZDEJI: praha(20) };
const CASY = { CAS_DNES: new Date(Date.now() - 60000).toISOString(), CAS_PREDVCEREM: new Date(Date.now() - 2 * 86400000).toISOString() };
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries({ ...DNY, ...CASY })) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t);
};

/** Podvrh API balíku; `stav.chyby[cesta]` = kód chyby, `napadySpravuje` = isEmployer v odpovědi nápadů. */
const podvrh = ({ napadySpravuje = true } = {}) => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (stav.chyby[path]) return json({ error: 'Server spadl' }, stav.chyby[path]);
  if (path === '/api/tasks') {
    if (m === 'PATCH') { const t = req.postDataJSON(); (stav.ukolyPatche ??= []).push(t); return json({ id: t.id, ...t, pointsEarned: t.status === 'done' ? 5 : null }); }
    if (m === 'POST') { stav.novyUkol = req.postDataJSON(); return json({ id: 99, ...stav.novyUkol }); }
    if (m === 'GET') return json(nacti('k69-b6a-tasks'));
  }
  if (path === '/api/teams' && m === 'GET') return json(nacti('k69-b6a-teams'));
  if (path === '/api/planning') {
    if (m === 'POST') { stav.novaKarta = req.postDataJSON(); return json({ id: 50, ...stav.novaKarta }); }
    if (m === 'GET') {
      // Po schválení ve widgetu vrací server kartu už v Hotovo (jinak by ji obnovení vrátilo zpátky).
      const karty = nacti('k69-b6a-planning');
      for (const pp of stav.kartyPatche ?? []) { const k = karty.find(c => c.id === pp.id); if (k) Object.assign(k, pp.telo); }
      return json(karty);
    }
  }
  if (/^\/api\/planning\/\d+$/.test(path) && m === 'PATCH') { (stav.kartyPatche ??= []).push({ id: Number(path.split('/').pop()), telo: req.postDataJSON() }); return json({ ok: true }); }
  if (path === '/api/noisium') return json({ connected: false });
  if (path === '/api/suggestions') {
    if (m === 'POST') { stav.novyPodnet = req.postDataJSON(); return json({ ok: true }); }
    if (m === 'GET') {
      const d = nacti('k69-b6a-suggestions');
      for (const h of stav.hlasy ?? []) { const s = d.suggestions.find(x => x.id === h); if (s) { s.votes += s.hasVoted ? -1 : 1; s.hasVoted = !s.hasVoted; } }
      return json({ ...d, isEmployer: napadySpravuje });
    }
  }
  if (/^\/api\/suggestions\/\d+$/.test(path) && m === 'PATCH') {
    const id = Number(path.split('/').pop()); const t = req.postDataJSON();
    (stav.podnetyPatche ??= []).push({ id, ...t });
    if (t.toggleVote) { (stav.hlasy ??= []).push(id); return json({ ok: true, votes: 5, hasVoted: true }); }
    return json({ ok: true });
  }
  return undefined;
};

const UKOLY = '/employer/overview?view=tasks';
const UKOLY_ZAM = '/employee/shifts?view=tasks';
const PLANOVANI = '/employer/overview?view=planning';
const NAPADY = '/employer/overview?view=suggestions';
const NAPADY_ZAM = '/employee/shifts?view=suggestions';
const naPlose = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`).count();
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
// Limetka se září = akce (DP §0): Button accent i třída btn-accent. Limetkové kolečko splněného úkolu záři nemá.
const LIMETKA = '[data-plocha] button[class*="0_6px_18px"]:visible, [data-plocha] .btn-accent:visible';
const limetek = (p) => p.locator(LIMETKA).count();
const h1 = (p) => p.evaluate(() => {
  const vid = [...document.querySelectorAll('h1')].filter(h => h.offsetParent !== null);
  const prvni = document.querySelector('[data-plocha]')?.querySelector('h1, h2, h3');
  return { pocet: vid.length, prvniJeH1: prvni?.tagName === 'H1', text: vid[0]?.textContent?.trim() };
});
const doporucene = (galerie) => galerie.evaluate(el => {
  const h = [...el.querySelectorAll('h4')].find(x => x.textContent?.includes('Doporučené'));
  return h?.parentElement?.innerText ?? '';
});
const zkrat = (t) => t.replace(/\s+/g, ' ').slice(0, 240);

/** Úpravy: nástroj sbalený bez „−", Home ho dá nad widgety (PUT), ↓ zpátky pod první widget. */
async function upravyNastroje(p, stav, znacka) {
  await upravit(p).click();
  tvrdi(`${znacka}2: vstup do úprav`, await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi(`${znacka}2: nástroj je v úpravách sbalený do zástupce bez „−"`, await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible()
    && await nastroj.locator('[data-odznak]').count() === 0);
  await nastroj.focus();
  await p.keyboard.press('Home');
  tvrdi(`${znacka}2: nástroj jde přesunout nad widgety`, await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi(`${znacka}2: …a odejde PUT s nástrojem nahoře`, poradiPutu(stav.puty.at(-1))[0] === 'nastroj', JSON.stringify(poradiPutu(stav.puty.at(-1))));
  await p.keyboard.press('ArrowDown');
  tvrdi(`${znacka}2: …a zpátky pod widget`, await dokud(async () => (await poradi(p))[1] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
}

/** Galerie: text sekce „Doporučené". */
async function galerieDoporucene(p) {
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(500);
  return doporucene(galerie);
}

// ---------------------------------------------------------------------------
// Úkoly (vedení)
// ---------------------------------------------------------------------------
const FIX_UKOLY = nacti('k69-b6a-rozlozeni-ukoly');

// 1, 2, 7) Hlavička, nástroj, widgety, filtr z widgetu, úpravy, rozepsaný úkol.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_UKOLY, dalsi: podvrh() });
  await otevri(p, UKOLY, 'vedeni.ukoly');
  const h = await h1(p);
  tvrdi('U1: právě jeden viditelný h1 „Úkoly" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Úkoly', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  const tN = await nastroj.innerText();
  tvrdi('U1: nástroj v klidu vidět (sekce Po termínu a Dnes, úkol Umýt okna)', /PO TERMÍNU|Po termínu/.test(tN) && tN.includes('Umýt okna') && tN.includes('Doplnit sirupy'), zkrat(tN));
  tvrdi('U1: jediná limetka je „Nový úkol" v hlavičce', await limetek(p) === 1 && await p.locator(LIMETKA, { hasText: 'Nový úkol' }).count() === 1, `${await limetek(p)}×`);
  const po = await widgetLi(p, 'ukoly.po_terminu').innerText();
  tvrdi('U1: Po termínu — 2 (Umýt okna předevčírem, Vynést sklo včera; dnešní ne)', /Po termínu\s*2/i.test(po.replace(/\n/g, ' ').replace(/PO TERMÍNU/, 'Po termínu')), zkrat(po));
  const spl = await widgetLi(p, 'ukoly.splneno_dnes').innerText();
  tvrdi('U1: Splněno dnes — 1 (Ranní káva, splnila Eva; předevčírem ne)', /Splněno\s*1/i.test(spl.replace(/\n/g, ' ').replace(/SPLNĚNO/, 'Splněno')) && spl.includes('Eva Testová'), zkrat(spl));
  const lide = widgetLi(p, 'ukoly.podle_lidi');
  const tL = await lide.innerText();
  tvrdi('U1: Podle lidí — Eva (1 po termínu) před Petrem, pro kohokoli na konci; zítřejší výskyt série se nepočítá',
    tL.indexOf('Eva Testová') >= 0 && tL.indexOf('Eva Testová') < tL.indexOf('Petr Novák') && tL.indexOf('Petr Novák') < tL.indexOf('Pro kohokoli') && /1 po termínu/.test(tL), zkrat(tL));
  await p.screenshot({ path: OUT + 'k69-b6a-ukoly-desk.png', fullPage: true });

  // Widget → nástroj: klepnutí na Petra vyfiltruje seznam.
  await lide.getByRole('button', { name: /Petr Novák/ }).click();
  tvrdi('U-W: řádek „Petr Novák" v Podle lidí zapne filtr Petr v nástroji', await dokud(() => nastroj.getByRole('button', { name: /^Petr · / }).getAttribute('aria-pressed').then(v => v === 'true'), 1500));
  tvrdi('U-W: …a seznam ukáže jen Petrovy úkoly', await dokud(async () => { const t = await nastroj.innerText(); return t.includes('Objednat mléko') && !t.includes('Umýt okna'); }, 1500));
  await nastroj.getByRole('button', { name: /^Všichni · / }).click();

  // Splnit úkol s termínem jindy než dnes → okno (dřív confirm()).
  await nastroj.getByRole('checkbox', { name: 'Umýt okna' }).click();
  const okno = p.getByRole('dialog', { name: 'Tohle není dnešní úkol' });
  tvrdi('U-M: úkol po termínu se před splněním zeptá oknem, ne confirm()', await dokud(() => okno.isVisible(), 1500));
  await okno.getByRole('button', { name: 'Označit jako hotové' }).click();
  tvrdi('U-M: …potvrzení pošle PATCH status done', await dokud(() => (stav.ukolyPatche ?? []).some(t => t.id === 1 && t.status === 'done'), 2000), JSON.stringify(stav.ukolyPatche));

  // 7) Rozepsaný úkol přežije úpravy.
  await p.locator('[data-plocha]').getByRole('button', { name: 'Nový úkol' }).click();
  await nastroj.getByLabel('Název úkolu').fill('Koupit citrony');
  await upravyNastroje(p, stav, 'U');
  tvrdi('U7: rozepsaný název úkolu přežil úpravy', await nastroj.getByLabel('Název úkolu').inputValue() === 'Koupit citrony');
  await nastroj.getByLabel('Termín', { exact: true }).fill(DNY.DNES);
  await nastroj.getByRole('button', { name: 'Vytvořit úkol' }).click();
  tvrdi('U7: …Vytvořit pošle POST /api/tasks s názvem a termínem', await dokud(() => stav.novyUkol?.title === 'Koupit citrony' && stav.novyUkol?.dueDate === DNY.DNES, 2000), JSON.stringify(stav.novyUkol));
  tvrdi('U: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Review kola 69: Úkoly na týden — přesun jde i bez tažení (tlačítko na kartě → okno s volbou dne).
{
  const fix = { ...FIX_UKOLY, polozky: [{ id: 'ukoly-tyden', widget: 'ukoly.tyden', velikost: 'L' }, ...FIX_UKOLY.polozky] };
  const { ctx, p, stav, chyby } = await kontext({ fix, dalsi: podvrh() });
  await otevri(p, UKOLY, 'vedeni.ukoly');
  const tyden = widgetLi(p, 'ukoly.tyden');
  const presun = tyden.getByRole('button', { name: 'Přesunout úkol Doplnit sirupy na jiný den' });
  tvrdi('U-T: karta v Úkolech na týden má tlačítko přesunu (klávesnice, dotyk)', await dokud(() => presun.isVisible(), 2000));
  await presun.focus();
  await p.keyboard.press('Enter');
  const okno = p.getByRole('dialog', { name: 'Přesunout úkol' });
  tvrdi('U-T: …Enter otevře okno s volbou dne', await dokud(() => okno.isVisible(), 1500));
  await okno.getByRole('button', { name: 'O týden později' }).click();
  const za = praha(7);
  tvrdi('U-T: …„O týden později" pošle PATCH move s termínem +7 dní', await dokud(() => (stav.ukolyPatche ?? []).some(t => t.id === 2 && t.move && t.dueDate === za), 2000), JSON.stringify(stav.ukolyPatche));
  tvrdi('U-T: cizí úkol od jiného (Zavřít bar) přesunout jde jen s ukoly.upravit — vlastník ho má', await tyden.getByRole('button', { name: 'Přesunout úkol Zavřít bar na jiný den' }).count() === 1);
  tvrdi('U-T: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 3) Galerie Úkolů: Úkoly na týden a Úkoly na dnes v „Doporučené".
{
  const { ctx, p } = await kontext({ fix: FIX_UKOLY, dalsi: podvrh() });
  await otevri(p, UKOLY, 'vedeni.ukoly');
  const dop = await galerieDoporucene(p);
  tvrdi('U3: galerie nabízí „Úkoly na týden" a „Úkoly na dnes" v Doporučených', dop.includes('Úkoly na týden') && dop.includes('Úkoly na dnes'), zkrat(dop));
  await ctx.close();
}

// 4) Oprávnění: vedoucí jen se zadáváním úkolů (bez ukoly.zobrazit_tym) — týmové widgety se nekreslí.
{
  const jenZadava = mine(ROLE.ja.opravneni.filter(k => !['ukoly.zobrazit_tym', 'ukoly.upravit', 'ukoly.mazat', 'ukoly.plnit'].includes(k)),
    { klic: null, roleId: 9, nazev: 'Směnový', typ: 'vedeni', jeVlastnik: false });
  const { ctx, p } = await kontext({ fix: FIX_UKOLY, mineData: jenZadava, dalsi: podvrh() });
  await otevri(p, UKOLY, 'vedeni.ukoly');
  await p.waitForTimeout(600);
  tvrdi('U4: bez ukoly.zobrazit_tym nejsou na ploše Podle lidí ani Splněno dnes', await naPlose(p, 'ukoly.podle_lidi') === 0 && await naPlose(p, 'ukoly.splneno_dnes') === 0);
  const po = await widgetLi(p, 'ukoly.po_terminu').innerText();
  tvrdi('U4: Po termínu zůstává, ale jen moje a pro kohokoli (a řekne to)', /tvoje a pro kohokoli/.test(po), zkrat(po));
  await ctx.close();
}
// Review kola 69: vidí tým a zadává, ale nesmí plnit (bez ukoly.plnit) — cizí úkol má zamčené
// zaškrtávátko i body checklistu, jinak by klik skončil 403 a vrácením.
{
  const bezPlneni = mine(ROLE.ja.opravneni.filter(k => !['ukoly.upravit', 'ukoly.mazat', 'ukoly.plnit'].includes(k)),
    { klic: null, roleId: 9, nazev: 'Směnový', typ: 'vedeni', jeVlastnik: false });
  const { ctx, p, stav } = await kontext({ fix: FIX_UKOLY, mineData: bezPlneni, dalsi: podvrh() });
  await otevri(p, UKOLY, 'vedeni.ukoly');
  const nastroj = widgetLi(p, 'nastroj');
  await dokud(() => nastroj.getByRole('checkbox', { name: 'Led z výrobníku' }).isVisible(), 3000);
  tvrdi('U4b: cizí úkol (Zavřít bar od někoho jiného) bez ukoly.plnit — zaškrtávátko i body checklistu zamčené',
    await nastroj.getByRole('checkbox', { name: 'Led z výrobníku' }).isDisabled()
    && await nastroj.locator('li', { hasText: 'Zavřít bar' }).getByRole('button', { name: 'Odškrtnout vše' }).count() === 0);
  tvrdi('U4b: …vlastní zadaný úkol (Doplnit sirupy) jde odškrtávat dál', await nastroj.getByRole('checkbox', { name: 'Vanilka' }).isEnabled());
  await nastroj.getByRole('checkbox', { name: 'Led z výrobníku' }).click({ force: true }).catch(() => {});
  await p.waitForTimeout(300);
  tvrdi('U4b: …a klik na zamčený bod nic nepošle', !(stav.ukolyPatche ?? []).some(t => t.id === 9));
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, „Nový úkol" vidět a otevře formulář.
{
  const { ctx, p } = await kontext({ fix: FIX_UKOLY, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, UKOLY, 'vedeni.ukoly');
  tvrdi('U6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const novy = p.locator('[data-plocha]').getByRole('button', { name: 'Nový úkol' });
  tvrdi('U6: „Nový úkol" je vidět', await novy.isVisible());
  await novy.click();
  tvrdi('U6: …a otevře formulář bez přetečení', await dokud(() => widgetLi(p, 'nastroj').getByLabel('Název úkolu').isVisible(), 1500) && await bezPreteceni(p));
  await p.screenshot({ path: OUT + 'k69-b6a-ukoly-tel.png', fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Úkoly (zaměstnanec)
// ---------------------------------------------------------------------------
const FIX_UKOLY_ZAM = nacti('k69-b6a-rozlozeni-ukoly-zam');
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: FIX_UKOLY_ZAM, mineData: roleMine('barista'), dalsi: podvrh() });
  await otevri(p, UKOLY_ZAM, 'zamestnanec.ukoly');
  const h = await h1(p);
  tvrdi('Z1: právě jeden viditelný h1 „Úkoly" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Úkoly', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  const tN = await nastroj.innerText();
  tvrdi('Z1: nástroj ukazuje moje a pro kohokoli, ne Petrovy úkoly', tN.includes('Doplnit sirupy') && tN.includes('Vynést sklo') && !tN.includes('Objednat mléko'), zkrat(tN));
  tvrdi('Z1: skupina úkolů je jedna karta se seznamem (ne karta na úkol)', await nastroj.locator('ul.list li.list-row').count() >= 3);
  tvrdi('Z1: přepínač Seznam/Týden není ve slotu limetky (žádná limetka)', await limetek(p) === 0);
  const po = await widgetLi(p, 'ukoly.po_terminu').innerText();
  tvrdi('Z1: Po termínu — 2, jen moje a pro kohokoli', /2/.test(po) && /tvoje a pro kohokoli/.test(po), zkrat(po));
  await p.screenshot({ path: OUT + 'k69-b6a-ukoly-zam-desk.png', fullPage: true });

  await nastroj.getByRole('checkbox', { name: 'Doplnit sirupy' }).click();
  tvrdi('Z-S: dnešní úkol se odškrtne rovnou (PATCH done)', await dokud(() => (stav.ukolyPatche ?? []).some(t => t.id === 2 && t.status === 'done'), 2000));
  tvrdi('Z-S: …a ukáže body „+5 bodů za splněný úkol"', await dokud(() => p.getByText('+5 bodů za splněný úkol').isVisible(), 2000));
  await nastroj.getByRole('checkbox', { name: 'Umýt okna' }).click();
  const okno = p.getByRole('dialog', { name: 'Tohle není dnešní úkol' });
  tvrdi('Z-M: úkol po termínu se zeptá oknem (dřív confirm())', await dokud(() => okno.isVisible(), 1500));
  await okno.getByRole('button', { name: 'Zrušit' }).click();
  tvrdi('Z-M: Zrušit nic nepošle', !(stav.ukolyPatche ?? []).some(t => t.id === 1));

  await upravyNastroje(p, stav, 'Z');
  tvrdi('Z: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
{
  const { ctx, p } = await kontext({ role: 'employee', fix: FIX_UKOLY_ZAM, mineData: roleMine('barista'), viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, UKOLY_ZAM, 'zamestnanec.ukoly');
  tvrdi('Z6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Týden' }).click().catch(async () => p.locator('[data-plocha]').getByRole('button', { name: 'Týden' }).click());
  tvrdi('Z6: přepínač Týden funguje a tabule nepřetéká stránku', await dokud(() => widgetLi(p, 'nastroj').getByText('tento týden').isVisible(), 1500) && await bezPreteceni(p));
  await p.screenshot({ path: OUT + 'k69-b6a-ukoly-zam-tel.png', fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Plánování
// ---------------------------------------------------------------------------
const FIX_PLAN = nacti('k69-b6a-rozlozeni-planovani');
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_PLAN, dalsi: podvrh() });
  await otevri(p, PLANOVANI, 'vedeni.planovani');
  const h = await h1(p);
  tvrdi('P1: právě jeden viditelný h1 „Plánování" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Plánování', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('P1: nástroj = tabule se čtyřmi sloupci', await nastroj.getByRole('heading', { level: 3 }).count() === 4 && (await nastroj.innerText()).includes('Nová sezónní káva'));
  tvrdi('P1: hlavička má hlavní akci „Nová karta" (jediná limetka)', await limetek(p) === 1 && await p.locator('[data-plocha]').getByRole('button', { name: 'Nová karta' }).isVisible());
  const sou = await widgetLi(p, 'planovani.souhrn').innerText();
  tvrdi('P1: Plánovací nástěnka — rozpracováno 1, 2 ke schválení', /1/.test(sou) && sou.includes('2 ke schválení'), zkrat(sou));
  const fronta = widgetLi(p, 'planovani.ke_schvaleni');
  tvrdi('P1: Karty ke schválení — Letní terasa před Novým ceníkem', await dokud(async () => { const t = await fronta.innerText(); return t.indexOf('Letní terasa') >= 0 && t.indexOf('Letní terasa') < t.indexOf('Nový ceník'); }, 1500));
  await p.screenshot({ path: OUT + 'k69-b6a-planovani-desk.png', fullPage: true });

  await fronta.getByRole('button', { name: 'Schválit kartu Letní terasa' }).click();
  tvrdi('P-W: Schválit pošle PATCH /api/planning/3 do Hotovo', await dokud(() => (stav.kartyPatche ?? []).some(x => x.id === 3 && x.telo.column === 'done'), 2000), JSON.stringify(stav.kartyPatche));
  tvrdi('P-W: v řádku fronty žádné inkoustové (primary) tlačítko — jediná silná akce je limetka v hlavičce', await fronta.locator('button[class*="bg-[#16181A]"]').count() === 0);
  await fronta.getByRole('button', { name: 'Další akce s kartou Nový ceník' }).click();
  await p.getByRole('menuitem', { name: 'Vrátit do Rozpracováno' }).click();
  tvrdi('P-W: Vrátit (v menu řádku) pošle PATCH /api/planning/4 do Rozpracováno', await dokud(() => (stav.kartyPatche ?? []).some(x => x.id === 4 && x.telo.column === 'in_progress'), 2000), JSON.stringify(stav.kartyPatche));
  const hotovoSloupec = nastroj.locator('section', { has: p.getByRole('heading', { name: 'Hotovo' }) });
  tvrdi('P-W: …a karta je na tabuli pod widgetem ve sloupci Hotovo', await dokud(async () => (await hotovoSloupec.innerText()).includes('Letní terasa'), 2000));

  // 7) Rozepsaná karta přežije úpravy.
  await p.locator('[data-plocha]').getByRole('button', { name: 'Nová karta' }).click();
  await nastroj.getByLabel('Název karty').fill('Vánoční menu');
  await upravyNastroje(p, stav, 'P');
  tvrdi('P7: rozepsaná karta přežila úpravy', await nastroj.getByLabel('Název karty').inputValue() === 'Vánoční menu');
  await nastroj.getByRole('button', { name: 'Přidat', exact: true }).click();
  tvrdi('P7: …Přidat pošle POST /api/planning do Nápadů', await dokud(() => stav.novaKarta?.title === 'Vánoční menu' && stav.novaKarta?.column === 'ideas', 2000), JSON.stringify(stav.novaKarta));

  // Menu karty z ui (dřív ruční „···" bez klávesnice) a mazání oknem.
  await nastroj.getByRole('button', { name: 'Možnosti karty Nová sezónní káva' }).click();
  await p.getByRole('menuitem', { name: 'Smazat kartu…' }).click();
  tvrdi('P-M: smazání karty se ptá oknem, ne confirm()', await dokud(() => p.getByRole('dialog', { name: 'Smazat kartu?' }).isVisible(), 1500));
  tvrdi('P: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
{
  // 3) Galerie a 5) 500 na nápadech shodí jen Nejžádanější nápady.
  const fix = { ...FIX_PLAN, polozky: [...FIX_PLAN.polozky.slice(0, 2), { id: 'napady-nejzadanejsi', widget: 'napady.nejzadanejsi', velikost: 'M' }, FIX_PLAN.polozky[2]] };
  const { ctx, p, stav } = await kontext({ fix, dalsi: podvrh() });
  stav.chyby['/api/suggestions'] = 500;
  await otevri(p, PLANOVANI, 'vedeni.planovani');
  await p.waitForTimeout(800);
  const nej = widgetLi(p, 'napady.nejzadanejsi');
  tvrdi('P5: Nejžádanější nápady ukážou „Widget se nenačetl" se „Zkusit znovu"', await nej.getByText('Widget se nenačetl').isVisible() && await nej.getByRole('button', { name: 'Zkusit znovu' }).isVisible());
  tvrdi('P5: jen ony — souhrn, fronta i tabule žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'planovani.ke_schvaleni').innerText()).includes('Letní terasa') && (await widgetLi(p, 'nastroj').innerText()).includes('Oprava mlýnku'));
  const dop = await galerieDoporucene(p);
  tvrdi('P3: galerie nabízí „Nové podněty" v Doporučených', dop.includes('Nové podněty'), zkrat(dop));
  await ctx.close();
}
{
  // 4) Jen planovani.zobrazit: tabule a fronta ke čtení — bez Nové karty, Schválit, menu karet a přidávání.
  const jenCte = mine(ROLE.ja.opravneni.filter(k => k !== 'planovani.upravit'), { klic: null, roleId: 9, nazev: 'Směnový', typ: 'vedeni', jeVlastnik: false });
  const { ctx, p, stav } = await kontext({ fix: FIX_PLAN, mineData: jenCte, dalsi: podvrh() });
  await otevri(p, PLANOVANI, 'vedeni.planovani');
  await p.waitForTimeout(600);
  tvrdi('P4: bez planovani.upravit žádná „Nová karta" ani „Přidat kartu"', await p.getByRole('button', { name: /Nová karta|Přidat kartu/ }).count() === 0);
  tvrdi('P4: …fronta je vidět bez „Schválit" a karty bez menu', (await widgetLi(p, 'planovani.ke_schvaleni').innerText()).includes('Letní terasa')
    && await p.getByRole('button', { name: /^Schválit kartu/ }).count() === 0 && await p.getByRole('button', { name: /^Možnosti karty|^Další akce s kartou/ }).count() === 0);
  tvrdi('P4: …a nic se nezapsalo', !(stav.kartyPatche ?? []).length && !dotazyNa(stav, ['/api/noisium']).length);
  await ctx.close();
}
{
  // 6) Telefon 390.
  const { ctx, p } = await kontext({ fix: FIX_PLAN, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, PLANOVANI, 'vedeni.planovani');
  tvrdi('P6: telefon 390 — žádné vodorovné přetečení stránky (sloupce se posouvají uvnitř pásu)', await bezPreteceni(p));
  const nova = p.locator('[data-plocha]').getByRole('button', { name: 'Nová karta' });
  tvrdi('P6: „Nová karta" je vidět', await nova.isVisible());
  await nova.click();
  tvrdi('P6: …a otevře pole názvu karty', await dokud(() => widgetLi(p, 'nastroj').getByLabel('Název karty').isVisible(), 1500));
  await p.screenshot({ path: OUT + 'k69-b6a-planovani-tel.png', fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Nápady (vedení)
// ---------------------------------------------------------------------------
const FIX_NAPADY = nacti('k69-b6a-rozlozeni-napady');
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_NAPADY, dalsi: podvrh() });
  await otevri(p, NAPADY, 'vedeni.napady');
  const h = await h1(p);
  tvrdi('N1: právě jeden viditelný h1 „Nápady" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Nápady', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('N1: nástroj = seznam podnětů s filtrem', (await nastroj.innerText()).includes('Brunch v neděli') && await nastroj.getByRole('group', { name: 'Filtr podle stavu' }).isVisible());
  tvrdi('N1: jediná limetka je „Přidat podnět"', await limetek(p) === 1);
  const nove = widgetLi(p, 'napady.nove');
  const tNove = await nove.innerText();
  tvrdi('N1: Nové podněty — nejstarší první (Druhý mlýnek před Novými zástěrami), zamítnutý ne', tNove.indexOf('Druhý mlýnek') >= 0 && tNove.indexOf('Druhý mlýnek') < tNove.indexOf('Nové zástěry') && !tNove.includes('Brunch'), zkrat(tNove));
  const nej = widgetLi(p, 'napady.nejzadanejsi');
  const tNej = await nej.innerText();
  tvrdi('N1: Nejžádanější (nové) — Druhý mlýnek (4) před zástěrami (1), naplánované ne', tNej.indexOf('Druhý mlýnek') < tNej.indexOf('Nové zástěry') && !tNej.includes('Ovesné'), zkrat(tNej));
  await p.screenshot({ path: OUT + 'k69-b6a-napady-desk.png', fullPage: true });

  await nej.getByRole('button', { name: /^Podpořit: Druhý mlýnek/ }).click();
  tvrdi('N-W: hlas ve widgetu pošle PATCH toggleVote', await dokud(() => (stav.podnetyPatche ?? []).some(x => x.id === 11 && x.toggleVote), 2000));
  tvrdi('N-W: …a v seznamu pod ním je hlas taky (5, stisknuto)', await dokud(async () => (await nastroj.getByRole('button', { name: /Druhý mlýnek na kávu \(5 hlasů\)/ }).getAttribute('aria-pressed')) === 'true', 2000));
  await nove.getByRole('button', { name: 'Do plánování: Druhý mlýnek na kávu' }).click();
  tvrdi('N-W: „Do plánování" v Nových podnětech pošle toPlanning', await dokud(() => (stav.podnetyPatche ?? []).some(x => x.id === 11 && x.toPlanning), 2000));

  // Stav podnětu přes Segmented, mazání přes okno.
  await nastroj.getByRole('tablist', { name: 'Stav podnětu Nové zástěry' }).getByRole('tab', { name: 'Zamítnout' }).click();
  tvrdi('N-S: posun stavu přes Segmented pošle PATCH status declined', await dokud(() => (stav.podnetyPatche ?? []).some(x => x.id === 13 && x.status === 'declined'), 2000), JSON.stringify(stav.podnetyPatche));
  await nastroj.getByRole('button', { name: 'Další akce: Brunch v neděli' }).click();
  await p.getByRole('menuitem', { name: 'Smazat podnět…' }).click();
  tvrdi('N-M: mazání podnětu se ptá oknem, ne confirm()', await dokud(() => p.getByRole('dialog', { name: 'Smazat podnět?' }).isVisible(), 1500));
  await p.getByRole('dialog', { name: 'Smazat podnět?' }).getByRole('button', { name: 'Zrušit' }).click();

  await upravyNastroje(p, stav, 'N');
  tvrdi('N: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
{
  // 3) Galerie, 5) 500 na plánování shodí jen Plánovací nástěnku.
  const fix = { ...FIX_NAPADY, polozky: [{ id: 'planovani-souhrn', widget: 'planovani.souhrn', velikost: 'S' }, ...FIX_NAPADY.polozky] };
  const { ctx, p, stav } = await kontext({ fix, dalsi: podvrh() });
  stav.chyby['/api/planning'] = 500;
  await otevri(p, NAPADY, 'vedeni.napady');
  await p.waitForTimeout(800);
  tvrdi('N5: Plánovací nástěnka ukáže „Widget se nenačetl"', await widgetLi(p, 'planovani.souhrn').getByText('Widget se nenačetl').isVisible());
  tvrdi('N5: jen ona — Nové podněty, Nejžádanější i seznam žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'napady.nove').innerText()).includes('Druhý mlýnek') && (await widgetLi(p, 'nastroj').innerText()).includes('Ovesné mléko'));
  const fix2 = { ...FIX_NAPADY, polozky: FIX_NAPADY.polozky.filter(x => x.widget !== 'napady.nove') };
  await ctx.close();
  const k2 = await kontext({ fix: fix2, dalsi: podvrh() });
  await otevri(k2.p, NAPADY, 'vedeni.napady');
  const dop = await galerieDoporucene(k2.p);
  tvrdi('N3: galerie nabízí „Nové podněty" a „Plánovací nástěnka" v Doporučených', dop.includes('Nové podněty') && dop.includes('Plánovací nástěnka'), zkrat(dop));
  await k2.ctx.close();
}
{
  // 4) Skladník (jen napady.pridat): bez Nových podnětů a bez posunu stavu; server isEmployer=false.
  const { ctx, p, stav } = await kontext({ fix: FIX_NAPADY, mineData: roleMine('skladnik'), dalsi: podvrh({ napadySpravuje: false }) });
  await otevri(p, NAPADY, 'vedeni.napady');
  await p.waitForTimeout(600);
  tvrdi('N4: skladník nevidí Nové podněty (napady.spravovat)', await naPlose(p, 'napady.nove') === 0);
  tvrdi('N4: …vidí Nejžádanější a seznam bez posunu stavu', await naPlose(p, 'napady.nejzadanejsi') === 1
    && await widgetLi(p, 'nastroj').getByRole('tablist', { name: /^Stav podnětu/ }).count() === 0 && await widgetLi(p, 'nastroj').getByText('Zamítnout').count() === 0);
  tvrdi('N4: …a nic nezapsal', !(stav.podnetyPatche ?? []).length);
  await ctx.close();
}
{
  // 6) Telefon 390.
  const { ctx, p } = await kontext({ fix: FIX_NAPADY, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, NAPADY, 'vedeni.napady');
  tvrdi('N6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const pridat = p.locator('[data-plocha]').getByRole('button', { name: 'Přidat podnět' });
  tvrdi('N6: „Přidat podnět" je vidět a otevře okno', await pridat.isVisible() && (await pridat.click(), await dokud(() => p.getByRole('dialog', { name: 'Nový podnět' }).isVisible(), 1500)));
  await p.screenshot({ path: OUT + 'k69-b6a-napady-tel.png', fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Nápady (zaměstnanec)
// ---------------------------------------------------------------------------
{
  const FIX_NZ = nacti('k69-b6a-rozlozeni-napady-zam');
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: FIX_NZ, mineData: roleMine('barista'), dalsi: podvrh({ napadySpravuje: false }) });
  await otevri(p, NAPADY_ZAM, 'zamestnanec.napady');
  const h = await h1(p);
  tvrdi('NZ1: právě jeden viditelný h1 „Nápady" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Nápady', JSON.stringify(h));
  tvrdi('NZ1: Nejžádanější nápady a seznam vidět, bez posunu stavu', (await widgetLi(p, 'napady.nejzadanejsi').innerText()).includes('Druhý mlýnek')
    && await widgetLi(p, 'nastroj').getByText('Zamítnout').count() === 0);
  await p.locator('[data-plocha]').getByRole('button', { name: 'Přidat podnět' }).click();
  const okno = p.getByRole('dialog', { name: 'Nový podnět' });
  await okno.getByLabel('Co navrhuješ?').fill('Stojan na kola');
  await okno.getByRole('button', { name: 'Odeslat podnět' }).click();
  tvrdi('NZ-F: Nový podnět je <Modal> s popisky a odešle POST', await dokud(() => stav.novyPodnet?.title === 'Stojan na kola', 2000), JSON.stringify(stav.novyPodnet));
  await upravyNastroje(p, stav, 'NZ');
  tvrdi('NZ6: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
{
  const FIX_NZ = nacti('k69-b6a-rozlozeni-napady-zam');
  const { ctx, p } = await kontext({ role: 'employee', fix: FIX_NZ, mineData: roleMine('barista'), viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh({ napadySpravuje: false }) });
  await otevri(p, NAPADY_ZAM, 'zamestnanec.napady');
  tvrdi('NZ6: telefon 390 — žádné vodorovné přetečení a „Přidat podnět" vidět', await bezPreteceni(p) && await p.locator('[data-plocha]').getByRole('button', { name: 'Přidat podnět' }).isVisible());
  await ctx.close();
}

await konec();
void BASE;
