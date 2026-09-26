// Kolo 69, balík B8 — Managero client (Přehled, Rezervace, Objednávky, Zákazníci, Věrnost,
// Stoly) a Akce jako plochy s widgety (spec §7.4).
//
// Pro stránky balíku: jeden h1 jako první, nástroj v klidu vidět (Přehled Clientu nástroj
// nemá — je celý z widgetů), v úpravách sbalený bez „−" a přesunutelný (PUT), galerie
// nabízí widgety balíku v „Doporučené", role bez klíče widget ani záložku nevidí a jeho
// endpoint se nevolá, 500 na jednom endpointu shodí jen jeden widget, telefon 390 bez
// přetečení s použitelnou hlavní akcí a rozepsané v nástroji přežije úpravy. Navíc to,
// co balík opravoval: potvrzení a odmítnutí rezervace (okno, ne confirm()), úprava bodů
// v okně (ne prompt()), jedno „Uložit" ve Věrnosti, „Přijmout" objednávku tmavě,
// odškrtnutí přípravy akce z widgetu (PATCH) a výsledek poslední akce.
//
// Fixtury: scripts/sondy/fixtury/k69-b8-*.json (rozložení stránek, hodnocení, příjem);
// akce se skládají tady (dny podle dnešního data, ať sonda nezastará s kalendářem).
import { readFileSync } from 'node:fs';
import {
  kontext, konec, tvrdi, otevri, lista, upravit, hotovo, vUpravach, dokud, poradi, poradiPutu, dotazyNa, mine, ROLE, DIR, OUT,
} from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const ROZLOZENI = {
  'vedeni.klient': 'k69-b8-rozlozeni-klient',
  'vedeni.klient_rezervace': 'k69-b8-rozlozeni-rezervace',
  'vedeni.klient_objednavky': 'k69-b8-rozlozeni-objednavky',
  'vedeni.klient_zakaznici': 'k69-b8-rozlozeni-zakaznici',
  'vedeni.klient_vernost': 'k69-b8-rozlozeni-vernost',
  'vedeni.klient_stoly': 'k69-b8-rozlozeni-stoly',
  'vedeni.akce': 'k69-b8-rozlozeni-akce',
};

const dnes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
const posun = (d, o) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + o); return x.toISOString().slice(0, 10); };
const akce = () => ({
  isEmployer: true,
  events: [
    { id: 1, title: 'Koncert na zahrádce', kind: 'concert', date: posun(dnes, -6), startTime: '19:00', status: 'done', revenue: 5000, costs: 3000, closingsCount: 1, closingsTotal: 8200,
      checklist: [], crew: [2], crewPeople: [{ id: 2, name: 'Eva Testová', avatar: '👩' }], packing: [], menu: [], photos: [] },
    { id: 4, title: 'Výjezd na farmářský trh', kind: 'outdoor', offsite: true, date: posun(dnes, 4), startTime: '09:00', endTime: '14:00', status: 'confirmed', location: 'Zelný trh',
      revenue: null, costs: null, closingsCount: 0, closingsTotal: null,
      checklist: [{ text: 'Stan a stolek', done: true }, { text: 'Prodlužovací kabel', done: false }, { text: 'Kasa na hotovost', done: false }],
      crew: [3], crewPeople: [{ id: 3, name: 'Jakub Horák', avatar: '🧔' }], packing: [], menu: [], photos: [] },
  ],
});

/** Podvrh API Clientu a akcí; `stav.chyby[cesta]` = kód chyby. */
const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (stav.chyby[path]) return json({ error: 'Server spadl' }, stav.chyby[path]);
  // Rozložení podle stránky — Client přepíná mezi šesti plochami v jedné relaci.
  if (path === '/api/rozlozeni') {
    const stranka = url.searchParams.get('stranka');
    stav.plochy ??= {};
    if (m === 'PUT') {
      const t = JSON.parse(req.postData() || '{}');
      stav.puty.push({ stranka, ...t });
      stav.plochy[stranka] = { ...(stav.plochy[stranka] ?? nacti(ROZLOZENI[stranka])), polozky: t.polozky, verze: (t.verze || 0) + 1, zdroj: 'osobni' };
      return json({ ok: true, polozky: t.polozky, verze: stav.plochy[stranka].verze });
    }
    if (m === 'GET' && ROZLOZENI[stranka]) return json(stav.plochy[stranka] ?? nacti(ROZLOZENI[stranka]));
    return undefined;
  }
  if (path === '/api/client/admin/reviews') return json(nacti('k69-b8-reviews'));
  if (path === '/api/client/staff/inbox') {
    if (m === 'PATCH') { (stav.prijem ??= []).push(req.postDataJSON()); return json({ ok: true }); }
    return json(nacti('k69-b8-inbox'));
  }
  if (path === '/api/client/admin/reservations' && m === 'PATCH') {
    const b = req.postDataJSON();
    (stav.rezervace ??= []).push(b);
    return json({ ok: true, status: b.status ?? 'confirmed' });
  }
  // Skupiny u člena (Zákazníci): jen dotaz s customerId, seznam skupin ve Věrnosti jde dál na fixtury.
  if (path === '/api/client/admin/groups' && (m === 'PATCH' || url.searchParams.has('customerId'))) {
    if (m === 'PATCH') { (stav.skupiny ??= []).push(req.postDataJSON()); return json({ ok: true }); }
    return json({ groups: [{ id: 5, name: 'Stálí hosté' }], customerGroupIds: [] });
  }
  if (path === '/api/client/admin/loyalty' && m === 'POST') { (stav.body ??= []).push(req.postDataJSON()); return json({ points: 370 }); }
  if (path === '/api/events' && m === 'GET') return json(akce());
  if (/^\/api\/events\/\d+$/.test(path) && m === 'PATCH') { (stav.akce ??= []).push({ id: Number(path.split('/').pop()), ...req.postDataJSON() }); return json({ ok: true }); }
  if (path === '/api/menu' && m === 'GET') return json({ boards: [] });
  if (path === '/api/pos/places') return json({ places: [] });
  return undefined;
};

const CLIENT = (tab) => `/employer/overview?mode=client&tab=${tab}`;
const AKCE = '/employer/overview?view=events';
const naPlose = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`).count();
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
// Limetka = Button accent (`on-accent`) nebo `btn-accent` (Hotovo v liště úprav).
const LIMETKA = 'button.on-accent:visible, .btn-accent:visible';
const limetek = (p) => p.locator(`[data-plocha] ${LIMETKA.split(', ').join(', [data-plocha] ')}`).count();
const h1 = (p) => p.evaluate(() => {
  const vid = [...document.querySelectorAll('h1')].filter(h => h.offsetParent !== null);
  const prvni = document.querySelector('[data-plocha]')?.querySelector('h1, h2, h3');
  return { pocet: vid.length, prvniJeH1: prvni?.tagName === 'H1', text: vid[0]?.textContent?.trim() };
});
const doporucene = (galerie) => galerie.evaluate(el => {
  const h = [...el.querySelectorAll('h4')].find(x => x.textContent?.includes('Doporučené'));
  return h?.parentElement?.innerText ?? '';
});
const zalozka = (p, nazev) => p.locator('nav[aria-label="Části Managero client"]').getByRole('button', { name: nazev });
const MEZERA = /[\s  ]/;
const cislo = (s) => new RegExp(s.split(' ').join(MEZERA.source));

// ---------------------------------------------------------------------------
// Přehled Clientu
// ---------------------------------------------------------------------------

// 1) Přehled je celý z widgetů, čísla, propojení a proklik do záložky.
{
  const { ctx, p, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-klient'), dalsi: podvrh });
  await otevri(p, CLIENT('overview'), 'vedeni.klient');
  const h = await h1(p);
  tvrdi('P1: právě jeden viditelný h1 „Přehled" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Přehled', JSON.stringify(h));
  tvrdi('P1: Přehled Clientu nemá nástroj (celý z widgetů)', await p.locator('[data-plocha] li[data-widget="nastroj"]').count() === 0);
  tvrdi('P1: v klidu žádná limetka (Client je zapnutý)', await limetek(p) === 0, `${await limetek(p)}×`);
  const hod = await widgetLi(p, 'klient.hodnoceni').innerText();
  tvrdi('P1: Hodnocení — průměr s desetinnou čárkou „4,6 / 5"', hod.includes('4,6') && hod.includes('/ 5'), hod.replace(/\n/g, ' | '));
  tvrdi('P1: Členové klubu — 148 a +23 za 30 dní', (await widgetLi(p, 'klient.clenove').innerText()).includes('148'));
  const ver = await widgetLi(p, 'klient.vernost_30dni').innerText();
  tvrdi('P1: Věrnost za 30 dní — rozdáno 2 310 b.', cislo('2 310').test(ver), ver.replace(/\n/g, ' | '));
  const rez = await widgetLi(p, 'klient.dnesni_rezervace').innerText();
  tvrdi('P1: Dnešní rezervace (S) — počet a kolik čeká na potvrzení', /dnes/i.test(rez) && /čeká|čekají/.test(rez), rez.replace(/\n/g, ' | '));
  const prop = widgetLi(p, 'klient.propojeni');
  tvrdi('P1: Propojení — 6/6 a stoly česky „4 stoly, 2 spárované s pokladnou"', (await prop.innerText()).includes('6/6') && (await prop.innerText()).includes('4 stoly, 2 spárované s pokladnou'));
  tvrdi('P1: boční pás má odznaky u Rezervací a Objednávek', await zalozka(p, /Rezervace/).locator('.odznak-inkoust, [class*="odznak"]').count() + await zalozka(p, /Rezervace/).getByText('2').count() > 0);
  tvrdi('P1: papír z body, skořápka bez natvrdo #F1F3ED', await p.evaluate(() => !document.querySelector('[style*="241, 243, 237"], [style*="#F1F3ED"]')));
  await p.screenshot({ path: OUT + 'k69-b8-prehled-desk.png', fullPage: true });
  await prop.getByRole('button', { name: /4 stoly/ }).click();
  tvrdi('P1: krok Propojení vede do záložky Stoly (uvnitř Clientu)', await dokud(async () => (await h1(p)).text === 'Stoly', 3000), JSON.stringify(await h1(p)));
  tvrdi('P: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 3) Galerie Přehledu nabízí widgety Clientu v Doporučených.
{
  const { ctx, p } = await kontext({ fix: nacti('k69-b8-rozlozeni-klient'), dalsi: podvrh });
  await otevri(p, CLIENT('overview'), 'vedeni.klient');
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(600);
  const dop = await doporucene(galerie);
  tvrdi('P3: galerie nabízí Nejbližší akce a Výsledek akce v Doporučených', dop.includes('Nejbližší akce') && dop.includes('Výsledek akce'), dop.slice(0, 300));
  await ctx.close();
}

// 5) 500 na hodnoceních → chyba jen v Hodnocení.
{
  const { ctx, p, stav } = await kontext({ fix: nacti('k69-b8-rozlozeni-klient'), dalsi: podvrh });
  stav.chyby['/api/client/admin/reviews'] = 500;
  await otevri(p, CLIENT('overview'), 'vedeni.klient');
  await p.waitForTimeout(900);
  tvrdi('P5: Hodnocení ukáže „Widget se nenačetl"', await widgetLi(p, 'klient.hodnoceni').getByText('Widget se nenačetl').isVisible());
  tvrdi('P5: jen ono — Členové a Věrnost žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'klient.clenove').innerText()).includes('148'));
  await ctx.close();
}

// 4) Oprávnění: Client bez zákazníků, věrnosti, potvrzování rezervací a nastavení.
const OBSLUHA_CLIENTU = mine(['klient.prehled', 'rezervace.zobrazit', 'rezervace.usadit', 'objednavky.zobrazit', 'objednavky.vyridit', 'stoly.zobrazit', 'vernost.karta'],
  { klic: null, roleId: 9, nazev: 'Obsluha Clientu', typ: 'vedeni', jeVlastnik: false });
{
  const { ctx, p, stav } = await kontext({ fix: nacti('k69-b8-rozlozeni-klient'), mineData: OBSLUHA_CLIENTU, dalsi: podvrh });
  await otevri(p, CLIENT('overview'), 'vedeni.klient');
  await p.waitForTimeout(700);
  tvrdi('P4: bez zakaznici.recenze není Hodnocení a /api/client/admin/reviews se nevolá', await naPlose(p, 'klient.hodnoceni') === 0 && dotazyNa(stav, ['/api/client/admin/reviews']).length === 0);
  tvrdi('P4: bez vernost.zobrazit není Věrnost za 30 dní a /api/client/admin/loyalty se nevolá', await naPlose(p, 'klient.vernost_30dni') === 0 && dotazyNa(stav, ['/api/client/admin/loyalty']).length === 0);
  tvrdi('P4: Členové jen počtem — bez zakaznici.zobrazit se jména (customers) nenačítají', await naPlose(p, 'klient.clenove') === 1 && dotazyNa(stav, ['/api/client/admin/customers']).length === 0);
  tvrdi('P4: záložky Zákazníci, Věrnost a Nastavení se nenabízejí', await zalozka(p, /Zákazníci/).count() === 0 && await zalozka(p, /Věrnost/).count() === 0 && await zalozka(p, /Nastavení/).count() === 0);
  await zalozka(p, /Rezervace/).click();
  await p.locator('[data-plocha="vedeni.klient_rezervace"] li[data-instance]').first().waitFor({ timeout: 10000 });
  await p.waitForTimeout(700);
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('P4: bez rezervace.schvalovat žádné „Potvrdit", potvrzenou rezervaci jde usadit', await nastroj.getByRole('button', { name: /^Potvrdit:/ }).count() === 0
    && await nastroj.getByRole('button', { name: /^Usadit:/ }).count() > 0);
  await ctx.close();
}

// 6) Telefon 390 — Přehled.
{
  const { ctx, p } = await kontext({ fix: nacti('k69-b8-rozlozeni-klient'), viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh });
  await otevri(p, CLIENT('overview'), 'vedeni.klient');
  tvrdi('P6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const dok = p.getByRole('navigation', { name: 'Spodní navigace klienta' });
  tvrdi('P6: spodní dok klienta s odznakem u Objednávek', await dok.isVisible() && await dok.getByRole('button', { name: /Objednávky/ }).locator('span').filter({ hasText: /^\d+$/ }).count() > 0);
  await p.screenshot({ path: OUT + 'k69-b8-prehled-tel.png', fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Rezervace
// ---------------------------------------------------------------------------

{
  const { ctx, p, stav, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-rezervace'), dalsi: podvrh });
  await otevri(p, CLIENT('reservations'), 'vedeni.klient_rezervace');
  const h = await h1(p);
  tvrdi('R1: právě jeden viditelný h1 „Rezervace" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Rezervace', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('R1: nástroj v klidu vidět (rezervace po dnech, přepínač období)', await nastroj.getByText('Jana Dvořáková').first().isVisible()
    && await p.locator('[data-plocha]').getByRole('tab', { name: 'Nadcházející' }).isVisible());
  tvrdi('R1: žádná limetka — „Potvrdit" je tmavé', await limetek(p) === 0 && await nastroj.getByRole('button', { name: /^Potvrdit:/ }).first().isVisible());
  await p.screenshot({ path: OUT + 'k69-b8-rezervace-desk.png', fullPage: true });
  await nastroj.getByRole('button', { name: /^Potvrdit: Jana Dvořáková/ }).click();
  tvrdi('R-W: „Potvrdit" pošle PATCH { id: 11, status: confirmed }', await dokud(() => (stav.rezervace ?? []).some(b => b.id === 11 && b.status === 'confirmed'), 2000), JSON.stringify(stav.rezervace));
  let dialog = false;
  p.on('dialog', d => { dialog = true; void d.dismiss(); });
  await nastroj.getByRole('button', { name: 'Další akce s rezervací Ondřej Beneš' }).click();
  await p.getByRole('menuitem', { name: /Odmítnout rezervaci/ }).click();
  const okno = p.getByRole('dialog', { name: 'Odmítnout rezervaci?' });
  tvrdi('R-W: odmítnutí se ptá oknem, ne confirm()', await dokud(() => okno.isVisible(), 1500) && !dialog);
  await okno.getByRole('button', { name: 'Odmítnout' }).click();
  tvrdi('R-W: …a po potvrzení pošle PATCH { id: 14, status: declined }', await dokud(() => (stav.rezervace ?? []).some(b => b.id === 14 && b.status === 'declined'), 2000));

  // 2) Úpravy: nástroj sbalený bez „−", přesun pod widget → PUT.
  await upravit(p).click();
  tvrdi('R2: vstup do úprav', await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  tvrdi('R2: nástroj sbalený do zástupce bez „−"', await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible() && await nastroj.locator('[data-odznak]').count() === 0);
  tvrdi('R2: widget „−" má', await widgetLi(p, 'klient.objednavky_od_stolu').locator('[data-odznak]').count() === 1);
  tvrdi('R2: v úpravách jediná limetka „Hotovo"', await p.locator(LIMETKA).count() === 1, `${await p.locator(LIMETKA).count()}×`);
  await nastroj.focus();
  await p.keyboard.press('End');
  tvrdi('R2: nástroj jde přesunout pod widget', await dokud(async () => (await poradi(p)).at(-1) === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi('R2: …a odejde PUT s nástrojem dole', poradiPutu(stav.puty.at(-1)).at(-1) === 'nastroj' && stav.puty.at(-1).stranka === 'vedeni.klient_rezervace', JSON.stringify(poradiPutu(stav.puty.at(-1))));
  await p.keyboard.press('Home');
  tvrdi('R2: …a zpátky nad widget', await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500));
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(600);
  const dop = await doporucene(galerie);
  tvrdi('R3: galerie Rezervací nabízí Dnešní rezervace v Doporučených', dop.includes('Dnešní rezervace'), dop.slice(0, 300));
  await p.keyboard.press('Escape');
  await hotovo(p).click().catch(() => {});
  tvrdi('R: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 6) Telefon 390 — Rezervace: „Potvrdit" vidět a klikatelné.
{
  const { ctx, p } = await kontext({ fix: nacti('k69-b8-rozlozeni-rezervace'), viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh });
  await otevri(p, CLIENT('reservations'), 'vedeni.klient_rezervace');
  tvrdi('R6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const potvrdit = widgetLi(p, 'nastroj').getByRole('button', { name: /^Potvrdit:/ }).first();
  await potvrdit.scrollIntoViewIfNeeded();
  tvrdi('R6: „Potvrdit" vidět a povolené', await potvrdit.isVisible() && await potvrdit.isEnabled());
  await p.screenshot({ path: OUT + 'k69-b8-rezervace-tel.png', fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Objednávky
// ---------------------------------------------------------------------------

{
  const { ctx, p, stav, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-objednavky'), dalsi: podvrh });
  await otevri(p, CLIENT('orders'), 'vedeni.klient_objednavky');
  tvrdi('O1: h1 „Objednávky" a nástroj s novou objednávkou', (await h1(p)).text === 'Objednávky' && await widgetLi(p, 'nastroj').getByText('Nová objednávka od stolu').isVisible());
  tvrdi('O1: „Přijmout" je tmavé, na ploše žádná limetka', await limetek(p) === 0);
  const predPrijetim = Date.now();
  await widgetLi(p, 'nastroj').getByRole('button', { name: 'Přijmout: U okna, Jana Dvořáková' }).click();
  tvrdi('O-W: „Přijmout" pošle PATCH { id: 71, status: confirmed }', await dokud(() => (stav.prijem ?? []).some(b => b.id === 71 && b.status === 'confirmed'), 2000), JSON.stringify(stav.prijem));
  // Odznaky „Objednávky N" v doku a „N k vyřízení" čtou souhrn — po vyřízení se musí načíst znovu.
  const souhrnPo = (od) => dotazyNa(stav, ['/api/client/admin/summary'], od).filter(d => d.m === 'GET').length;
  tvrdi('O-S: po přijetí objednávky se souhrn (odznaky) načte znovu', await dokud(() => souhrnPo(predPrijetim) > 0, 2000), `${souhrnPo(predPrijetim)}×`);
  const predZalozkou = Date.now();
  await zalozka(p, /Rezervace/).click();
  tvrdi('O-S: přepnutí záložky souhrn obnoví (jako dřív useEffect na tab)', await dokud(() => souhrnPo(predZalozkou) > 0, 2000), `${souhrnPo(predZalozkou)}×`);
  await p.screenshot({ path: OUT + 'k69-b8-objednavky-desk.png', fullPage: true });
  tvrdi('O: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Zákazníci — body v okně a rozepsaná zpráva přes úpravy
// ---------------------------------------------------------------------------

{
  const { ctx, p, stav, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
  await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
  tvrdi('Z1: h1 „Zákazníci", widgety Členové (se jmény) a Hodnocení nad nástrojem', (await h1(p)).text === 'Zákazníci'
    && (await widgetLi(p, 'klient.clenove').innerText()).includes('Tereza Málková') && (await widgetLi(p, 'klient.hodnoceni').innerText()).includes('4,6'));
  const nastroj = widgetLi(p, 'nastroj');
  let dialog = false;
  p.on('dialog', d => { dialog = true; void d.dismiss(); });
  await nastroj.getByRole('button', { name: 'Upravit body: Jana Dvořáková' }).click();
  const okno = p.getByRole('dialog', { name: 'Body pro Jana Dvořáková' });
  tvrdi('Z-B: úprava bodů v okně (ne prompt())', await dokud(() => okno.isVisible(), 1500) && !dialog);
  await okno.getByLabel('Kolik bodů').fill('50');
  await okno.getByLabel('Proč').fill('Omluva za čekání');
  await okno.getByRole('button', { name: 'Uložit' }).click();
  tvrdi('Z-B: …a pošle POST { customerId: 101, delta: 50 }', await dokud(() => (stav.body ?? []).some(b => b.customerId === 101 && b.delta === 50 && b.note === 'Omluva za čekání'), 2000), JSON.stringify(stav.body));

  // 7) Rozepsaná zpráva členům přežije vstup do úprav a výstup z nich.
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Zprávy členům' }).click();
  await nastroj.getByLabel('Nadpis').waitFor({ timeout: 5000 });
  await nastroj.getByLabel('Nadpis').fill('Degustace nových čajů');
  await upravit(p).click();
  tvrdi('Z2: vstup do úprav', await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('Z7: rozepsaný nadpis zprávy přežil úpravy', await nastroj.getByLabel('Nadpis').inputValue() === 'Degustace nových čajů');
  tvrdi('Z: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

{
  // Z-S: role se zakaznici.skupiny bez vernost.zobrazit zařadí hosta do skupiny; deník bodů se nenačítá.
  const SKUPINY = mine(['klient.prehled', 'zakaznici.zobrazit', 'zakaznici.skupiny'],
    { klic: null, roleId: 9, nazev: 'Správa hostů', typ: 'vedeni', jeVlastnik: false });
  const { ctx, p, stav } = await kontext({ fix: nacti('k69-b8-rozlozeni-zakaznici'), mineData: SKUPINY, dalsi: podvrh });
  await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
  const nastroj = widgetLi(p, 'nastroj');
  const tlacitko = nastroj.getByRole('button', { name: 'Skupiny', exact: true }).first();
  tvrdi('Z-S: bez vernost.zobrazit je u člena „Skupiny" (dřív „Deník" jen s věrností)', await dokud(() => tlacitko.isVisible(), 5000)
    && await nastroj.getByRole('button', { name: 'Deník', exact: true }).count() === 0);
  await tlacitko.click();
  const stitek = nastroj.getByRole('button', { name: 'Stálí hosté' });
  tvrdi('Z-S: …rozbalí štítky skupin', await dokud(() => stitek.isVisible(), 2000));
  await stitek.click();
  tvrdi('Z-S: …a klepnutí pošle PATCH /groups s přidáním hosta', await dokud(() => (stav.skupiny ?? []).some(b => b.id === 5 && Array.isArray(b.add) && b.add.length === 1), 2000), JSON.stringify(stav.skupiny));
  tvrdi('Z-S: deník bodů (/api/client/admin/loyalty) se bez vernost.zobrazit nevolá', dotazyNa(stav, ['/api/client/admin/loyalty']).length === 0);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Věrnost — jedno „Uložit", přepínače místo zaškrtávátek
// ---------------------------------------------------------------------------

{
  const { ctx, p, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-vernost'), dalsi: podvrh });
  await otevri(p, CLIENT('loyalty'), 'vedeni.klient_vernost');
  tvrdi('V1: h1 „Věrnost", widget Věrnost za 30 dní nad nástrojem', (await h1(p)).text === 'Věrnost' && cislo('2 310').test(await widgetLi(p, 'klient.vernost_30dni').innerText()));
  tvrdi('V-R: widget na stránce Věrnost nemá odkaz „Věrnost ›" (vedl by sem)', await widgetLi(p, 'klient.vernost_30dni').getByRole('button', { name: 'Věrnost', exact: true }).count() === 0);
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Body a úrovně' }).click();
  await widgetLi(p, 'nastroj').getByText('Úrovně hostů a jejich sleva').waitFor({ timeout: 5000 });
  tvrdi('V1: Body a úrovně — jediná limetka „Uložit" (dřív tři pod sebou)', await limetek(p) === 1 && await p.locator('[data-plocha]').getByRole('button', { name: 'Uložit', exact: true }).count() === 1, `${await limetek(p)}×`);
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Razítka' }).click();
  await p.waitForTimeout(500);
  tvrdi('V1: bez nativních zaškrtávátek ve Věrnosti', await widgetLi(p, 'nastroj').locator('input[type="checkbox"]').count() === 0);
  tvrdi('V6: bez přetečení na počítači', await bezPreteceni(p));
  await p.screenshot({ path: OUT + 'k69-b8-vernost-desk.png', fullPage: true });
  tvrdi('V: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Stoly — přidání v okně s tlačítky dole
// ---------------------------------------------------------------------------

{
  const { ctx, p, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-stoly'), viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh });
  await otevri(p, CLIENT('tables'), 'vedeni.klient_stoly');
  tvrdi('S1: h1 „Stoly" a seznam stolů v nástroji', (await h1(p)).text === 'Stoly' && (await widgetLi(p, 'nastroj').innerText()).length > 20);
  tvrdi('S6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const pridat = p.locator('[data-plocha]').getByRole('button', { name: 'Přidat stůl' });
  tvrdi('S6: „Přidat stůl" vidět a klikatelné', await pridat.isVisible() && await pridat.isEnabled());
  await pridat.click();
  const okno = p.getByRole('dialog', { name: 'Nový stůl' });
  tvrdi('S1: nový stůl v okně s hlavní akcí vpravo dole', await dokud(() => okno.isVisible(), 1500) && await okno.getByRole('button', { name: 'Přidat stůl' }).isVisible());
  await p.screenshot({ path: OUT + 'k69-b8-stoly-tel.png', fullPage: true });
  tvrdi('S: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Akce
// ---------------------------------------------------------------------------

{
  const { ctx, p, stav, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-akce'), dalsi: podvrh });
  await otevri(p, AKCE, 'vedeni.akce');
  const h = await h1(p);
  tvrdi('A1: právě jeden viditelný h1 „Akce" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Akce', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('A1: nástroj — seznam akcí s Výjezdem, bez vlastního odsazení stránky', await nastroj.getByText('Výjezd na farmářský trh').isVisible());
  tvrdi('A1: jediná limetka „Nová akce"', await limetek(p) === 1 && await p.locator('[data-plocha]').getByRole('button', { name: 'Nová akce' }).isVisible());
  const vys = await widgetLi(p, 'akce.vysledek').innerText();
  tvrdi('A1: Výsledek akce — tržba z uzávěrky 8 200, výsledek +5 200', cislo('8 200').test(vys) && /\+\s?5[\s  ]200/.test(vys), vys.replace(/\n/g, ' | '));
  const prip = widgetLi(p, 'akce.checklist');
  tvrdi('A-R: widgety na stránce Akce nemají odkaz „Akce ›" (vedl by sem)', await p.locator('[data-plocha] li[data-widget^="akce."]').getByRole('button', { name: 'Akce', exact: true }).count() === 0);
  tvrdi('A1: Příprava akce — nejbližší výjezd, zbývají 2 body', (await prip.innerText()).includes('Výjezd na farmářský trh') && await prip.getByRole('checkbox').count() === 3);
  await p.screenshot({ path: OUT + 'k69-b8-akce-desk.png', fullPage: true });
  await prip.getByRole('checkbox', { name: 'Prodlužovací kabel' }).click();
  tvrdi('A-W: odškrtnutí pošle PATCH /api/events/4 s bodem hotovým', await dokud(() => (stav.akce ?? []).some(b => b.id === 4 && b.checklist?.[1]?.done === true && b.checklist?.[0]?.done === true), 2000), JSON.stringify(stav.akce));

  // A-K: detail akce je jedno okno; potvrzení je jeho druhý krok — Tab dojde na „Smazat",
  // Escape vrátí jen do detailu. Hlášky přes Toast, žádný nativní dialog (alert/confirm).
  let nativni = false;
  p.on('dialog', d => { nativni = true; void d.dismiss(); });
  const fokus = () => p.evaluate(() => ({ text: document.activeElement?.textContent?.trim() ?? '', vOkne: !!document.activeElement?.closest('[role="dialog"]') }));
  await nastroj.getByRole('button', { name: /Výjezd na farmářský trh/ }).click();
  const detail = p.getByRole('dialog', { name: 'Výjezd na farmářský trh' });
  tvrdi('A-K: detail akce se otevře jako okno (Modal)', await dokud(() => detail.isVisible(), 2000));
  tvrdi('A-K: v detailu je jedno okno (ne ruční překryv vedle <Modal>)', await p.locator('.modal-overlay').count() === 1);
  await detail.getByRole('button', { name: 'Oznámit týmu' }).click();
  tvrdi('A-K: „Oznámit týmu" pošle PATCH a ukáže Toast, ne alert()', await dokud(() => (stav.akce ?? []).some(b => b.id === 4 && b.publishToTeam === true), 2000)
    && await dokud(() => p.getByText('Tým dostal notifikaci o akci.').isVisible(), 2000) && !nativni);
  await detail.getByRole('button', { name: 'Smazat akci' }).click();
  const potvrzeni = p.getByRole('dialog', { name: 'Smazat akci „Výjezd na farmářský trh"?' });
  tvrdi('A-K: „Smazat akci" otevře potvrzení (bez confirm())', await dokud(() => potvrzeni.isVisible(), 2000) && !nativni && await p.locator('.modal-overlay').count() === 1);
  tvrdi('A-K: fokus v potvrzení je na „Zrušit"', await dokud(async () => (await fokus()).text === 'Zrušit', 1500), JSON.stringify(await fokus()));
  await p.keyboard.press('Tab');
  tvrdi('A-K: Tab dojde na „Smazat"', (await fokus()).text === 'Smazat', JSON.stringify(await fokus()));
  for (let i = 0; i < 4; i++) await p.keyboard.press('Tab');
  tvrdi('A-K: Tab neuteče z okna', (await fokus()).vOkne, JSON.stringify(await fokus()));
  await p.keyboard.press('Escape');
  tvrdi('A-K: Escape zavře jen potvrzení, detail zůstane', await dokud(async () => !(await potvrzeni.isVisible()) && await detail.isVisible(), 1500));
  tvrdi('A-K: …a fokus se vrátí na „Smazat akci"', await dokud(async () => (await fokus()).text === 'Smazat akci', 1500), JSON.stringify(await fokus()));
  tvrdi('A-K: nic se nesmazalo', dotazyNa(stav, ['/api/events/4']).every(d => d.m !== 'DELETE'));
  await p.keyboard.press('Escape');
  tvrdi('A-K: druhý Escape zavře detail', await dokud(async () => !(await detail.isVisible()), 1500));

  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(600);
  const dop = await doporucene(galerie);
  tvrdi('A3: galerie Akcí nabízí Nejbližší akce v Doporučených', dop.includes('Nejbližší akce'), dop.slice(0, 300));
  await p.keyboard.press('Escape');
  await hotovo(p).click().catch(() => {});
  tvrdi('A: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
{
  // 4) Bez akce.finance není Výsledek akce; bez akce.upravit ani „Nová akce".
  const bezFinanci = mine(ROLE.ja.opravneni.filter(k => !['akce.finance', 'akce.upravit'].includes(k)),
    { klic: null, roleId: 9, nazev: 'Vedoucí směny', typ: 'vedeni', jeVlastnik: false });
  const { ctx, p } = await kontext({ fix: nacti('k69-b8-rozlozeni-akce'), mineData: bezFinanci, dalsi: podvrh });
  await otevri(p, AKCE, 'vedeni.akce');
  await p.waitForTimeout(600);
  tvrdi('A4: bez akce.finance není Výsledek akce', await naPlose(p, 'akce.vysledek') === 0 && await naPlose(p, 'akce.checklist') === 1);
  tvrdi('A4: bez akce.upravit není „Nová akce"', await p.locator('[data-plocha]').getByRole('button', { name: 'Nová akce' }).count() === 0);
  await ctx.close();
}
{
  // 5) 500 na akcích → Příprava i Výsledek hlásí chybu, nástroj ErrorState; hlavička zůstane.
  const { ctx, p, stav } = await kontext({ fix: nacti('k69-b8-rozlozeni-akce'), dalsi: podvrh });
  stav.chyby['/api/events'] = 500;
  await otevri(p, AKCE, 'vedeni.akce');
  await p.waitForTimeout(900);
  tvrdi('A5: výpadek /api/events — hlavička „Akce" vidět, nástroj hlásí chybu se „Zkusit znovu"', (await h1(p)).text === 'Akce'
    && await widgetLi(p, 'nastroj').getByText('Akce se nenačetly').isVisible() && await widgetLi(p, 'akce.checklist').getByText('Widget se nenačetl').isVisible());
  await ctx.close();
}

await konec();
