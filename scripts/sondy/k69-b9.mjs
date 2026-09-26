// Kolo 69, balík B9 — tablet: Směna jako plocha s widgety (spec §7.4), chat a Nastavení.
//
// Tablet si rozložení neupravuje (sdílené zařízení, PlochaWidgetu rezim="jen-cteni"),
// takže body šablony o úpravách (2, 3, 7) se tu ověřují obráceně: žádné „Upravit",
// podržení widgetu nic neotevře, UI nepošle PUT — a skládání Směny jde z Nastavení
// → Stránky u vedení, kde galerie nabízí widgety tabletu v „Doporučené". Dál:
// jeden h1, nástroj „Kdo teď pracuje" v klidu vidět (seznam, ne karty v kartě),
// proklik z widgetu přepne záložku tabletu, pohled mimo tablet se nekreslí, role bez
// klíče widget nevidí a jeho endpoint se nevolá, 500 shodí jen jeden widget, telefon
// 390 bez přetečení s použitelným „Další příchod", zamčený tablet bez směny, písmo
// na tabletu nejméně 14 px. A Nastavení: přepínače SwitchRow, motiv Segmented,
// pokladna bez confirm(); chat: filtr, odznak a ankety oknem.
//
// Fixtury: scripts/sondy/fixtury/k69-b9-*.json (rozložení Směny a výchozí pro Nastavení).
import { readFileSync } from 'node:fs';
import {
  kontext, konec, tvrdi, dokud, dotazyNa, podrzMysi, stred, roleMine, mine, ROLE, DIR, OUT, BASE,
} from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const FIX = nacti('k69-b9-rozlozeni-smena');
const KIOSK = roleMine('kiosk');
const KIOSK_URL = '/kiosk';
const STRANKA = 'kiosk.smena';

const nikdoNaSmene = () => {
  const a = nacti('attendance');
  return { ...a, roster: a.roster.map(r => ({ ...r, openSince: null, openEntryId: null })) };
};

/** Podvrh navíc: prázdná rozpracovaná anketa, výchozí Směny pro Nastavení, `stav.roster`. */
const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (stav.chyby[path]) return json({ error: 'Server spadl' }, stav.chyby[path]);
  if (path === '/api/attendance' && m === 'GET' && stav.roster) return json(stav.roster);
  // Předávka a dnešní průběhy postupů ve tvaru skutečných rout (obecné fixtury je nemají).
  if (path === '/api/closings/handover' && m === 'GET') return json(nacti('k69-b9-handover'));
  if (path === '/api/procedures/runs' && m === 'GET') return json(nacti('k69-b6b-runs'));
  if (path === '/api/rozlozeni/vychozi' && url.searchParams.get('stranka') === STRANKA) {
    if (m === 'PUT') { stav.vychoziPuty.push({ stranka: STRANKA, ...JSON.parse(req.postData() || '{}') }); return json({ ok: true, polozky: [], zamceno: false, verze: 1 }); }
    return json(nacti('k69-b9-vychozi-smena'));
  }
  if (path === '/api/polls' && m === 'GET') {
    return json({ polls: [{ id: 7, question: 'Kam na firemní večírek?', options: ['Bowling', 'Grilovačka'], counts: [2, 1], total: 3, myVote: 0, createdBy: 15, authorName: 'Martin Nemeškal' }] });
  }
  if (path === '/api/polls' && m === 'PATCH') { (stav.ankety ??= []).push(req.postDataJSON()); return json({ ok: true }); }
  if (path === '/api/account' && m === 'PATCH') { (stav.ucet ??= []).push(req.postDataJSON()); return json({ ok: true, user: {} }); }
  if (path === '/api/pos' && m === 'GET') return json({ connected: true, placeName: 'Kavárna Vinohrady', clientIdMasked: 'ab…12' });
  if (path === '/api/pos/status' && m === 'GET') {
    return json({ connected: true, billsCount: 1234, firstDay: '2026-03-01', productsWithPrice: 40, productsCount: 42, lastSyncAt: '2026-09-26 08:00:00', itemsPending: 0, historyComplete: true, webhookSecret: null });
  }
  if (path === '/api/pos' && m === 'DELETE') {
    if (stav.posDeleteChyba) { stav.posDeletePokusy = (stav.posDeletePokusy ?? 0) + 1; return json({ error: 'Server spadl' }, 500); }
    stav.posOdpojeno = true; return json({ ok: true });
  }
  return undefined;
};

const plochaLi = (p, w) => p.locator(`[data-plocha="${STRANKA}"] li[data-widget="${w}"]`);
const naPlose = (p, w) => p.locator(`[data-plocha="${STRANKA}"] li[data-widget="${w}"]:not([hidden])`).count();
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const LIMETKA = 'button.on-accent:visible, .btn-accent:visible';
const otevriTablet = async (p) => {
  await p.goto(BASE + KIOSK_URL, { waitUntil: 'networkidle' });
  await p.locator(`[data-plocha="${STRANKA}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(900);
};
const zalozka = (p, nazev) => p.locator('nav').getByRole('button', { name: new RegExp(`^${nazev}`) });

// ---------------------------------------------------------------------------
// 1) Směna v klidu: h1, nástroj, widgety, bez úprav
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'kiosk', viewport: { width: 1024, height: 1366 }, mobil: true, fix: FIX, mineData: KIOSK, dalsi: podvrh });
  await otevriTablet(p);
  const h = await p.evaluate(() => {
    const vid = [...document.querySelectorAll('h1')].filter(x => x.offsetParent !== null || x.classList.contains('sr-only'));
    const prvni = document.querySelector('[data-plocha]')?.querySelector('h1, h2, h3');
    return { pocet: vid.length, prvniJeH1: prvni?.tagName === 'H1', text: prvni?.textContent?.trim() };
  });
  tvrdi('K1: právě jeden h1 (i se skrytými) a je první nadpis plochy „Směna"', h.pocet === 1 && h.prvniJeH1 && h.text === 'Směna', JSON.stringify(h));
  const nastroj = plochaLi(p, 'nastroj');
  // Vybraná záložka se odečítači ohlásí přes aria-current, ne jen třídou seg-on.
  tvrdi('K3: záložka Směna má aria-current="page", ostatní ne', await zalozka(p, 'Směna').getAttribute('aria-current') === 'page'
    && await p.locator('nav button[aria-current]').count() === 1);
  tvrdi('K1: nástroj „Kdo teď pracuje" v klidu vidět, Martin i Jakub na směně', await nastroj.getByRole('heading', { name: 'Kdo teď pracuje' }).isVisible()
    && (await nastroj.innerText()).includes('Martin Nemeškal') && (await nastroj.innerText()).includes('Jakub Horák'));
  tvrdi('K1: lidé jako řádky seznamu (.list), ne karty v kartě', await nastroj.locator('ul.list > li').count() === 2 && await nastroj.locator('.card .card, .card .glass-card').count() === 0);
  tvrdi('K1: výchozí rozložení — nástěnka nad nástrojem, předávka, objednávky od stolu, povinné postupy',
    await naPlose(p, 'oznameni.nastenka') === 1 && await naPlose(p, 'uzaverky.predavka') === 1 && await naPlose(p, 'klient.objednavky_od_stolu') === 1 && await naPlose(p, 'postupy.povinne_dnes') === 1);
  const ikony = await p.$$eval(`[data-plocha="${STRANKA}"] li[data-widget]:not([hidden])`, els => els.map(e => e.getAttribute('data-ikona')));
  tvrdi('K1: ikony na ploše se neopakují (AK-19)', ikony.length > 5 && new Set(ikony).size === ikony.length, JSON.stringify(ikony));
  tvrdi('K1: starý banner oznámení ani ruční „Nenačetlo se" pruh nejsou', await p.getByText(/Nenačetlo se:/).count() === 0);
  const padle = await p.$$eval('[data-plocha] li[data-widget]', els => els.filter(e => e.innerText.includes('Widget se nenačetl')).map(e => e.dataset.widget));
  tvrdi('K1: žádný widget na Směně nehlásí chybu', padle.length === 0, JSON.stringify(padle));
  tvrdi('K1: Předávka ukazuje vzkaz od Evy', (await plochaLi(p, 'uzaverky.predavka').innerText()).includes('Myčka hlásí chybu E3'));
  tvrdi('K1: tablet nemá „Upravit" ani „Upravit stránku"', await p.locator('[data-plocha]').getByRole('button', { name: 'Upravit', exact: true }).count() === 0
    && await p.getByRole('menuitem', { name: 'Upravit stránku' }).count() === 0);
  tvrdi('K1: vysvětlení, proč se Směna neupravuje', await p.getByText('Tablet si rozložení neupravuje — nastavuje ho vedení v Nastavení → Stránky.').isVisible());
  const w = plochaLi(p, 'uzaverky.predavka');
  const { x, y } = await stred(w);
  await podrzMysi(p, x, y);
  await p.waitForTimeout(300);
  tvrdi('K2: podržení widgetu na tabletu neotevře menu ani úpravy', await p.getByRole('menu').count() === 0
    && !(await p.evaluate(() => document.querySelector('[data-plocha]')?.hasAttribute('data-upravy'))));
  tvrdi('K2: v klidu nejvýš jedna limetka', await p.locator(LIMETKA).count() <= 1, `${await p.locator(LIMETKA).count()}×`);
  // DESIGN.md, Kiosk: na tabletu nic pod 14 px (emoji avatarů se nepočítají).
  const male = await p.evaluate(() => {
    const out = [];
    const root = document.querySelector('[data-plocha]');
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = n.textContent.trim();
      if (!t || /^\p{Extended_Pictographic}+$/u.test(t)) continue;
      const el = n.parentElement;
      if (!el || el.closest('.sr-only, [hidden], [aria-hidden="true"]') || el.offsetParent === null) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 14) out.push(`${fs}px „${t.slice(0, 24)}"`);
    }
    return out;
  });
  tvrdi('K1: na ploše tabletu žádné písmo pod 14 px', male.length === 0, male.slice(0, 6).join(' | '));
  // Přepnutí, kdo se zapisuje: chip „Zapisuje se" se přesune.
  await nastroj.getByRole('button', { name: 'Zapisovat jako Jakub Horák' }).click();
  tvrdi('K1: „Přepnout" u Jakuba → chip „Zapisuje se" u něj', await dokud(async () => (await nastroj.locator('li', { hasText: 'Jakub Horák' }).innerText()).includes('Zapisuje se'), 1500));
  await p.screenshot({ path: OUT + 'k69-b9-smena-tablet.png', fullPage: true });

  // Proklik z widgetu přepne záložku tabletu (Sklad), pohled mimo tablet se nekreslí.
  tvrdi('K3: Dnešní směny nekreslí odkaz na Rozvrh (pohled, který tablet nemá)',
    await plochaLi(p, 'rozvrh.dnesni_smeny').getByRole('button', { name: /^Rozvrh/ }).count() === 0);
  const odkazSklad = plochaLi(p, 'sklad.dochazi').getByRole('button', { name: 'Sklad', exact: true });
  tvrdi('K3: Docházející zásoby mají odkaz „Sklad"', await odkazSklad.isVisible());
  await odkazSklad.click();
  tvrdi('K3: …který přepne záložku tabletu na Sklad (aria-current)', await dokud(async () => (await zalozka(p, 'Sklad').getAttribute('aria-current')) === 'page', 1500)
    && await zalozka(p, 'Směna').getAttribute('aria-current') === null);
  await zalozka(p, 'Směna').click();
  await p.locator(`[data-plocha="${STRANKA}"]`).waitFor();
  tvrdi('K2: za celý scénář tablet neposlal ani jeden PUT rozložení', stav.puty.length === 0 && stav.vychoziPuty.length === 0);
  tvrdi('K: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 4) Oprávnění: tabletová role bez objednávek a skladu
// ---------------------------------------------------------------------------
{
  const bez = mine(KIOSK.opravneni.filter(k => !['objednavky.zobrazit', 'sklad.zobrazit'].includes(k)),
    { klic: null, roleId: 12, nazev: 'Tablet v kuchyni', typ: 'kiosk', jeVlastnik: false });
  const { ctx, p, stav } = await kontext({ role: 'kiosk', viewport: { width: 1024, height: 1366 }, mobil: true, fix: FIX, mineData: bez, dalsi: podvrh });
  await otevriTablet(p);
  await p.waitForTimeout(600);
  tvrdi('K4: bez objednavky.zobrazit nejsou Objednávky od stolu a /api/client/staff/inbox se z plochy nevolá',
    await naPlose(p, 'klient.objednavky_od_stolu') === 0);
  tvrdi('K4: bez sklad.zobrazit nejsou Docházející zásoby a /api/inventory se nevolá', await naPlose(p, 'sklad.dochazi') === 0 && dotazyNa(stav, ['/api/inventory']).length === 0);
  tvrdi('K4: ostatní widgety zůstaly (Předávka, Nástěnka)', await naPlose(p, 'uzaverky.predavka') === 1 && await naPlose(p, 'oznameni.nastenka') === 1);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 5) 500 na akcích → chyba jen v jednom widgetu
// ---------------------------------------------------------------------------
// (Ne předávka: /api/closings/handover čtou Předávka i Povinné postupy dnes — ty
// z něj berou, jestli jde uzávěrka odeslat —, takže 500 tam shodí dva widgety
// právem.)
{
  const { ctx, p, stav } = await kontext({ role: 'kiosk', viewport: { width: 1024, height: 1366 }, mobil: true, fix: FIX, mineData: KIOSK, dalsi: podvrh });
  stav.chyby['/api/events'] = 500;
  await otevriTablet(p);
  await p.waitForTimeout(900);
  tvrdi('K5: Nejbližší akce ukáže „Widget se nenačetl"', await plochaLi(p, 'akce.nejblizsi').getByText('Widget se nenačetl').isVisible());
  const padle = await p.$$eval('[data-plocha] li[data-widget]', els => els.filter(e => e.innerText.includes('Widget se nenačetl')).map(e => e.dataset.widget));
  tvrdi('K5: jen ona — nástroj, Předávka i Nástěnka žijí', padle.length === 1
    && (await plochaLi(p, 'nastroj').innerText()).includes('Martin Nemeškal'), JSON.stringify(padle));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 6) Telefon 390: bez přetečení, „Další příchod" použitelný
// ---------------------------------------------------------------------------
{
  const { ctx, p } = await kontext({ role: 'kiosk', viewport: { width: 390, height: 844 }, mobil: true, fix: FIX, mineData: KIOSK, dalsi: podvrh });
  await otevriTablet(p);
  tvrdi('K6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const dalsi = plochaLi(p, 'nastroj').getByRole('button', { name: 'Další příchod' });
  await dalsi.scrollIntoViewIfNeeded();
  tvrdi('K6: „Další příchod" vidět a povolené', await dalsi.isVisible() && await dalsi.isEnabled());
  await dalsi.click();
  tvrdi('K6: …otevře výběr s Evou (mimo směnu)', await dokud(() => plochaLi(p, 'nastroj').getByRole('button', { name: /Eva Testová/ }).isVisible(), 1500));
  tvrdi('K6: po rozbalení pořád bez přetečení', await bezPreteceni(p));
  await p.screenshot({ path: OUT + 'k69-b9-smena-tel.png', fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Zamčený tablet (nikdo na směně) a tmavý režim
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'kiosk', viewport: { width: 1024, height: 1366 }, mobil: true, fix: FIX, mineData: KIOSK, dalsi: podvrh });
  stav.roster = nikdoNaSmene();
  await otevriTablet(p);
  const nastroj = plochaLi(p, 'nastroj');
  tvrdi('K7: bez směny je nástrojem zamykací obrazovka „Tablet čeká na směnu" (h2, ne druhý h1)',
    await nastroj.getByRole('heading', { level: 2, name: 'Tablet čeká na směnu' }).isVisible() && await p.locator('h1').count() === 1);
  tvrdi('K7: „Jsem na směně" je jediná limetka', await nastroj.getByRole('button', { name: 'Jsem na směně' }).isVisible() && await p.locator(LIMETKA).count() === 1);
  await nastroj.getByRole('button', { name: 'Jsem na směně' }).click();
  tvrdi('K7: …a nabídne, kdo přichází', await dokud(() => nastroj.getByRole('heading', { name: 'Kdo přichází na směnu?' }).isVisible(), 1500));
  // K7b: zamčený tablet — widgety se zápisem nejdou použít (inert), nástroj ano.
  const zamek = await p.evaluate(() => {
    const li = [...document.querySelectorAll('[data-plocha] li[data-widget]:not([hidden])')];
    const widgety = li.filter(x => x.dataset.widget !== 'nastroj');
    const tlacitka = widgety.flatMap(x => [...x.querySelectorAll('button, a[href], input, select, textarea')]);
    return {
      widgetu: widgety.length,
      bezInert: widgety.filter(x => !x.hasAttribute('inert')).map(x => x.dataset.widget),
      tlacitek: tlacitka.length,
      zive: tlacitka.filter(b => !b.closest('[inert]')).map(b => b.textContent?.trim().slice(0, 20)),
      nastrojInert: !!document.querySelector('[data-plocha] li[data-widget="nastroj"]')?.closest('[inert]'),
      jmena: tlacitka.map(b => b.textContent?.trim()).filter(Boolean),
    };
  });
  tvrdi('K7b: bez směny jsou všechny widgety inert, nástroj živý', zamek.widgetu > 3 && zamek.bezInert.length === 0 && !zamek.nastrojInert, JSON.stringify(zamek.bezInert));
  tvrdi('K7b: žádné tlačítko widgetu („Zapsat novou věc", „Vyrobeno", „Přijmout"…) nejde ťuknout', zamek.tlacitek > 0 && zamek.zive.length === 0
    && zamek.jmena.some(t => t.includes('Zapsat novou věc')), JSON.stringify(zamek.zive));
  await plochaLi(p, 'sklad.zapsat_novou').getByRole('button', { name: 'Zapsat novou věc', includeHidden: true }).click({ force: true }).catch(() => {});
  await p.waitForTimeout(300);
  tvrdi('K7b: …ani silou — okno „Nová věc do skladu" se neotevře', await p.getByRole('dialog', { name: 'Nová věc do skladu' }).count() === 0);
  tvrdi('K7b: podtitulek říká, že je tablet zamčený', await p.getByText('Tablet je zamčený — widgety se odemknou, jakmile se někdo odpíchne.').isVisible());
  tvrdi('K7: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// K8: dva na směně, nikdo vybraný — zápis z widgetu se nejdřív zeptá, kdo stojí
// u tabletu (jako WhoFirst), a okno widgetu drží tabletová měřítka
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ role: 'kiosk', viewport: { width: 1024, height: 1366 }, mobil: true, fix: FIX, mineData: KIOSK, dalsi: podvrh });
  await otevriTablet(p);
  tvrdi('K8: <body> nese .kiosk-surface (portály oken widgetů dědí tabletová pravidla)', await p.evaluate(() => document.body.classList.contains('kiosk-surface')));
  await plochaLi(p, 'sklad.zapsat_novou').getByRole('button', { name: 'Zapsat novou věc' }).click();
  const kdo = p.getByRole('dialog', { name: 'Kdo teď u tabletu stojí?' });
  tvrdi('K8: „Zapsat novou věc" bez vybrané osoby otevře výběr osoby', await dokud(() => kdo.isVisible(), 1500));
  tvrdi('K8: …a ne okno zápisu', await p.getByRole('dialog', { name: 'Nová věc do skladu' }).count() === 0);
  await kdo.getByRole('button', { name: /Martin Nemeškal/ }).click();
  const okno = p.getByRole('dialog', { name: 'Nová věc do skladu' });
  tvrdi('K8: po výběru se ťuknutí zopakuje a otevře okno zápisu', await dokud(() => okno.isVisible(), 2000));
  tvrdi('K8: hlavička tabletu ukazuje, že se zapisuje jako Martin', await p.locator('header').getByText('Martin Nemeškal').isVisible());
  // Měřit až po dosednutí okna — během pop-in je zmenšené a všechno vyjde o 2 % menší.
  await p.waitForTimeout(700);
  // .filter-pill (12 px) a .btn-icon (36 px, zavírací křížek Modalu) tabletová pravidla
  // v globals.css zatím nemají — to není B9, předáno vlastníkovi globals.css. Tady se
  // hlídá, že okno pravidla .kiosk-surface dědí (text-xs, .field, .btn-sm…), a zbytek
  // se vypíše, ať nezmizí z očí.
  const miry = await okno.evaluate(root => {
    const mimo = (el) => el.closest('.filter-pill, .btn-icon');
    const male = []; const cile = []; const predano = [];
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = n.textContent.trim();
      const el = n.parentElement;
      if (!t || !el || el.closest('.sr-only, [hidden], [aria-hidden="true"]') || el.offsetParent === null) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 14) (mimo(el) ? predano : male).push(`${fs}px „${t.slice(0, 24)}"`);
    }
    for (const el of root.querySelectorAll('button, input:not([type="file"]):not([type="hidden"]), select, textarea')) {
      if (el.offsetParent === null) continue;
      if (mimo(el)) { if (el.getBoundingClientRect().height < 44 - 0.5) predano.push(`${Math.round(el.getBoundingClientRect().height)}px ${el.className.split(' ')[0]}`); continue; }
      const r = el.getBoundingClientRect();
      const pred = parseFloat(getComputedStyle(el, '::before').height) || 0;
      if (Math.max(r.height, pred) < 44 - 0.5) cile.push(`${Math.round(r.height)}px „${(el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 20)}"`);
    }
    return { male, cile, predano };
  });
  if (miry.predano.length) console.log(`   (K8 předáno globals.css: ${[...new Set(miry.predano)].slice(0, 4).join(' | ')})`);
  tvrdi('K8: v okně widgetu žádné písmo pod 14 px', miry.male.length === 0, miry.male.slice(0, 6).join(' | '));
  tvrdi('K8: v okně widgetu cíle nejméně 44 px', miry.cile.length === 0, miry.cile.slice(0, 6).join(' | '));
  await p.screenshot({ path: OUT + 'k69-b9-okno-zapis.png' });
  await p.keyboard.press('Escape');
  tvrdi('K8: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
{
  const { ctx, p, chyby } = await kontext({ role: 'kiosk', viewport: { width: 1024, height: 1366 }, mobil: true, fix: FIX, mineData: KIOSK, tmavy: true, dalsi: podvrh });
  await otevriTablet(p);
  await p.screenshot({ path: OUT + 'k69-b9-smena-dark.png', fullPage: true });
  tvrdi('K-D: tmavý režim bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 3) Nastavení → Stránky: Směnu skládá vedení, galerie nabízí widgety tabletu
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ dalsi: podvrh });
  await p.goto(BASE + '/employer/overview?view=settings', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Stránky/ }).filter({ visible: true }).first().click();
  const tablet = p.getByRole('region', { name: 'Tablet' });
  tvrdi('N3: Nastavení → Stránky nabízí u Tabletu stránku Směna', await dokud(() => tablet.getByText('Směna').isVisible(), 3000));
  await tablet.getByRole('button', { name: 'Upravit' }).first().click();
  const plocha = p.locator(`[data-plocha="${STRANKA}"]`);
  tvrdi('N3: editor výchozího ukáže plochu Směny v úpravách', await dokud(() => plocha.isVisible(), 3000) && await plocha.evaluate(el => el.hasAttribute('data-upravy')));
  tvrdi('N3: nástroj je v editoru zástupce bez „−"', await plocha.locator('li[data-widget="nastroj"] [data-odznak]').count() === 0
    && await plocha.locator('li[data-widget="nastroj"]').getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible());
  await p.getByRole('region', { name: 'Úpravy stránky' }).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(500);
  const dop = await galerie.evaluate(el => [...el.querySelectorAll('h4')].find(x => x.textContent?.includes('Doporučené'))?.parentElement?.innerText ?? '');
  tvrdi('N3: galerie nabízí widgety tabletu v „Doporučené" (Žebříček, Úkoly na dnes)', dop.includes('Žebříček') && dop.includes('Úkoly na dnes'), dop.slice(0, 300));
  tvrdi('N3: editor výchozího se neptá na data widgetů (schematicky)', dotazyNa(stav, ['/api/closings/handover', '/api/client/staff/inbox', '/api/inventory']).length === 0);
  await p.keyboard.press('Escape');
  tvrdi('N: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Nastavení: hlavička, přepínače, motiv, pokladna bez confirm()
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ dalsi: podvrh });
  let dialog = false;
  p.on('dialog', d => { dialog = true; void d.dismiss(); });
  await p.goto(BASE + '/employer/overview?view=settings', { waitUntil: 'networkidle' });
  tvrdi('S1: Nastavení má PageHeader s jediným h1', await p.getByRole('heading', { level: 1, name: 'Nastavení' }).isVisible() && await p.locator('h1:visible').count() === 1);
  await p.getByRole('button', { name: /Vzhled/ }).filter({ visible: true }).first().click();
  tvrdi('S2: motiv je Segmented (tablist), ne dvě limetkové volby', await dokud(() => p.getByRole('tab', { name: 'Tmavý' }).isVisible(), 1500) && await p.locator(LIMETKA).count() === 0);
  tvrdi('S2: nápovědy jako přepínač', await p.getByRole('switch', { name: /Zobrazovat nápovědy/ }).isVisible());
  // Zvonek v hlavičce se jmenuje taky „Notifikace" — sekce má i popisek „Centrum oznámení".
  await p.getByRole('button', { name: /Notifikace\s*Centrum oznámení/ }).filter({ visible: true }).first().click();
  const zpravy = p.getByRole('switch', { name: /Nové zprávy/ });
  tvrdi('S3: čtyři přepínače notifikací (SwitchRow)', await dokud(() => zpravy.isVisible(), 1500) && await p.getByRole('switch').count() === 4);
  const pred = await zpravy.getAttribute('aria-checked');
  await zpravy.click();
  tvrdi('S3: přepnutí „Nové zprávy" změní stav a uloží notifPrefs', await dokud(async () => (await zpravy.getAttribute('aria-checked')) !== pred, 1000)
    && await dokud(() => (stav.ucet ?? []).some(b => b.notifPrefs && 'messages' in b.notifPrefs), 1500));
  await p.getByRole('button', { name: /Pokladna/ }).filter({ visible: true }).first().click();
  tvrdi('S4: pokladna — Stat „Účtenek u nás" 1 234', await dokud(() => p.getByText('Účtenek u nás').isVisible(), 2000) && /1\s234/.test(await p.locator('main').innerText()));
  tvrdi('S4: ruční synchronizace je vedlejší akce (žádná limetka)', await p.getByRole('button', { name: 'Synchronizovat teď' }).isVisible() && await p.locator(LIMETKA).count() === 0);
  await p.getByRole('button', { name: 'Odpojit pokladnu' }).click();
  const okno = p.getByRole('dialog', { name: 'Odpojit pokladnu?' });
  tvrdi('S4: odpojení se ptá oknem, ne confirm()', await dokud(() => okno.isVisible(), 1500) && !dialog);
  await okno.getByRole('button', { name: 'Zrušit' }).click();
  tvrdi('S4: Zrušit nic neodpojí', !stav.posOdpojeno);
  await p.getByRole('button', { name: 'Odpojit pokladnu' }).click();
  await p.getByRole('dialog', { name: 'Odpojit pokladnu?' }).getByRole('button', { name: 'Odpojit pokladnu' }).click();
  tvrdi('S4: potvrzení pošle DELETE /api/pos a ohlásí „Pokladna odpojena."', await dokud(() => stav.posOdpojeno === true, 1500)
    && await dokud(() => p.getByText('Pokladna odpojena.').isVisible(), 1500));
  tvrdi('S: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
{
  // S4b: server odpojení odmítne — UI nesmí slavit, pokladna zůstává připojená.
  const { ctx, p, stav } = await kontext({ dalsi: podvrh });
  stav.posDeleteChyba = true;
  await p.goto(BASE + '/employer/overview?view=settings', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Pokladna/ }).filter({ visible: true }).first().click();
  await dokud(() => p.getByRole('button', { name: 'Odpojit pokladnu' }).isVisible(), 2000);
  await p.getByRole('button', { name: 'Odpojit pokladnu' }).click();
  await p.getByRole('dialog', { name: 'Odpojit pokladnu?' }).getByRole('button', { name: 'Odpojit pokladnu' }).click();
  tvrdi('S4b: DELETE 500 → note-danger „nepodařilo se odpojit"', await dokud(() => stav.posDeletePokusy === 1, 1500)
    && await dokud(() => p.locator('.note-danger', { hasText: 'Pokladnu se nepodařilo odpojit' }).isVisible(), 1500));
  tvrdi('S4b: …bez „Pokladna odpojena." a pokladna dál připojená', await p.getByText('Pokladna odpojena.').count() === 0
    && await p.getByRole('button', { name: 'Odpojit pokladnu' }).isVisible());
  await ctx.close();
}
{
  const { ctx, p } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh });
  await p.goto(BASE + '/employer/overview?view=settings', { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  tvrdi('S5: Nastavení na telefonu 390 bez přetečení, sekce jako posuvný pás', await bezPreteceni(p) && await p.getByRole('tablist', { name: 'Sekce nastavení' }).isVisible());
  await p.screenshot({ path: OUT + 'k69-b9-nastaveni-tel.png', fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Chat: filtr Nepřečtené, odznak, anketa oknem
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ dalsi: podvrh });
  let dialog = false;
  p.on('dialog', d => { dialog = true; void d.dismiss(); });
  await p.goto(BASE + '/employer/overview?view=chat', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const filtr = p.getByRole('button', { name: /^Nepřečtené · / });
  if (await filtr.count()) {
    const pad = await filtr.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
    tvrdi('C1: filtr Nepřečtené má vnitřní okraj (filter-pill)', pad >= 8, `${pad}px`);
  }
  tvrdi('C1: seznam konverzací bez ručně limetkových odznaků', await p.locator('main span.rounded-full[class*="bg-[#C8F542]"]').count() === 0);
  // Týmový kanál (první konverzace ve fixtuře) → anketa nahoře.
  await p.getByRole('button', { name: /Týmový chat/ }).first().click();
  const uzavrit = p.getByRole('button', { name: 'Uzavřít', exact: true });
  if (await dokud(() => uzavrit.isVisible(), 2500)) {
    await uzavrit.click();
    const okno = p.getByRole('dialog', { name: 'Uzavřít anketu?' });
    tvrdi('C2: uzavření ankety se ptá oknem, ne confirm()', await dokud(() => okno.isVisible(), 1500) && !dialog);
    await okno.getByRole('button', { name: 'Uzavřít anketu' }).click();
    tvrdi('C2: …potvrzení pošle PATCH { id: 7, close: true }', await dokud(() => (stav.ankety ?? []).some(b => b.id === 7 && b.close === true), 1500));
  } else {
    tvrdi('C2: týmový kanál ukáže anketu s „Uzavřít"', false, 'anketa se neukázala');
  }
  await p.screenshot({ path: OUT + 'k69-b9-chat.png', fullPage: true });
  tvrdi('C: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
