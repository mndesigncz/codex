// Kolo 8, balík R8-7 — Managero client: rezervace, hodnocení (obsluha u dveří z telefonu).
//
// Rezervace (1280 i 390×844 s dotykem):
//  • Jana (19:00, ve 20:00 už půl hodiny po čase) má vedle „Usadit" tlačítko „Nedorazil", Petr (21:00)
//    ho má jen v „···"; „Nedorazil" pošle PATCH { status: 'no_show' } a toast nabídne „Vrátit";
//  • Petr nese Chip „2× nedorazil", Jana skupiny „VIP · Štamgasti · +1", varování „Alergie na ořechy"
//    a „host potvrdil"; nadpis dne „· 3 rezervace · 9 osob · špička 21:00" (nedorazivší se nepočítá);
//  • hledání „Nov" pošle GET ?q=Nov a ukáže výsledky; „Den" otevře kalendář (GET ?month=), den s tečkou
//    pošle GET ?date=; Minulé mají pilulky „Vše · 240 / Nedorazili · 6", „Zobrazeno 3 z 240" a
//    „Načíst další" (GET limit=200); klepnutí na jméno otevře okno Host s „9 · 2× nedorazil" a poznámkami,
//    „Přidat poznámku" pošle POST /api/client/admin/notes.
// Hodnocení: pilulky s počty, „1–2 ★" zúží seznam, „Odpovědět" → okno → PATCH { id, reply, resolved }.
// Objednávky: výchozí rozložení (fixtura k84-klient-rozlozeni-objednavky) už nemá widget Dnešní rezervace —
//   dnešní rezervace kreslí jen nástroj, host je na stránce jednou.
// Host (390): stránka podniku ?tab=reserve&rezervace=11 zvýrazní rezervaci, „Potvrdit" pošle
//   PATCH /api/client/b/<slug>/reservations { id, action: 'confirm' } a ukáže „Potvrzeno tebou";
//   Moje stránka má sekci „Odpovědi na tvoje hodnocení" a u rezervace odkaz „Potvrdit nebo zrušit".
//
// Hodiny prohlížeče se posouvají na 20:00 pražského času (posunCasu), dny fixtur se skládají z dneška.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, dokud, otevri, BASE, DIR, OUT } from './k68-spolecne.mjs';

const TEL = { width: 390, height: 844 };
const DESK = { width: 1280, height: 900 };
const dnes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
const posun = (d, o) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + o); return x.toISOString().slice(0, 10); };
const zitra = posun(dnes, 1), vcera = posun(dnes, -1), predevcirem = posun(dnes, -2);
const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8')
  .replaceAll('"PREDEVCIREM', `"${predevcirem}`).replaceAll('"VCERA', `"${vcera}`).replaceAll('"ZITRA', `"${zitra}`).replaceAll('"DNES', `"${dnes}`).replaceAll('"MESIC"', `"${dnes.slice(0, 7)}"`));

/** Posun hodin tak, aby v Praze bylo právě `hh:mm`. */
function posunNa(hh, mm = 0) {
  const c = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
  const [h, m, s] = c.split(':').map(Number);
  return ((hh * 60 + mm) * 60 - (h * 3600 + m * 60 + s)) * 1000;
}

const CLIENT = (tab) => `/employer/overview?mode=client&tab=${tab}`;
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const dotazy = (stav, cast) => stav.dotazy.filter(d => d.m === 'GET' && d.u.includes(cast));
// Posunuté hodiny mění pozdrav na Přehledu („Dobrý den" → „Dobrý večer") a dev server hlásí
// hydratační rozdíl — to je rozdíl hodin sondy, ne chyba balíku (brief: dev-only hydratace se ignoruje).
const chybyBezHydratace = (chyby) => chyby.filter(c => !/Hydration failed|hydration-mismatch|hydrat/i.test(c));

/** Podvrh API vedení: rezervace podle dotazu, poznámky, hodnocení, příjem. */
const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (path === '/api/client/admin/reservations') {
    if (m === 'PATCH') { const b = req.postDataJSON(); (stav.patche ??= []).push(b); return json({ ok: true, status: b.status ?? 'confirmed' }); }
    if (url.searchParams.has('month')) return json(nacti('k84-klient-rezervace-mesic'));
    if (url.searchParams.has('customer')) return json(nacti('k84-klient-rezervace-host'));
    if (url.searchParams.has('q')) return json(nacti('k84-klient-rezervace-hledani'));
    if (url.searchParams.get('range') === 'past') return json(nacti('k84-klient-rezervace-minule'));
    return json(nacti('k84-klient-rezervace'));
  }
  if (path === '/api/client/admin/notes') {
    if (m === 'POST') { (stav.poznamky ??= []).push(req.postDataJSON()); return json({ ok: true, note: { id: 9, body: req.postDataJSON().body, created_at: `${dnes} 20:00:00`, autor: null } }); }
    return json(nacti('k84-klient-notes'));
  }
  if (path === '/api/client/admin/reviews') {
    if (m === 'PATCH') { (stav.odpovedi ??= []).push(req.postDataJSON()); return json({ ok: true }); }
    return json(nacti('k84-klient-reviews'));
  }
  if (path === '/api/client/staff/inbox') return json(nacti('k69-b8-inbox'));
  return undefined;
};

// ---------------------------------------------------------------------------
// Rezervace: 1280 — Nedorazil, štítky hosta, nadpis dne, hledání, den, Minulé, okno Host
// ---------------------------------------------------------------------------
for (const [vp, mobil, jmeno] of [[DESK, false, 'desk'], [TEL, true, 'tel']]) {
  const { ctx, p, stav, chyby } = await kontext({ viewport: vp, mobil, fix: nacti('k69-b8-rozlozeni-rezervace'), posunCasu: posunNa(20, 0), dalsi: podvrh });
  await otevri(p, CLIENT('reservations'), 'vedeni.klient_rezervace');
  const nastroj = widgetLi(p, 'nastroj');
  const jana = nastroj.locator('li.list-row', { hasText: 'Jana Dvořáková' }).first();
  const petr = nastroj.locator('li.list-row', { hasText: 'Petr Novák' }).first();
  tvrdi(`R ${jmeno}: ve 20:00 má Jana (19:00) tlačítko „Nedorazil" vedle „Usadit"`, await dokud(() => jana.getByRole('button', { name: /^Nedorazil:/ }).isVisible(), 5000) && await jana.getByRole('button', { name: /^Usadit:/ }).isVisible());
  tvrdi(`R ${jmeno}: Petr (21:00) ho ještě nemá jako tlačítko`, await petr.getByRole('button', { name: /^Nedorazil:/ }).count() === 0);
  tvrdi(`R ${jmeno}: Petr nese Chip „2× nedorazil"`, await petr.getByText('2× nedorazil', { exact: true }).isVisible());
  tvrdi(`R ${jmeno}: Jana má skupiny VIP, Štamgasti a „+1", varování „Alergie na ořechy" a „host potvrdil"`,
    await jana.getByText('VIP', { exact: true }).isVisible() && await jana.getByText('Štamgasti', { exact: true }).isVisible() && await jana.getByText('+1', { exact: true }).isVisible()
    && await jana.getByText('Alergie na ořechy').first().isVisible() && await jana.getByText('host potvrdil').isVisible());
  tvrdi(`R ${jmeno}: Pavel (nedorazil) má stav „Nedorazil" a žádný hlavní krok`, await nastroj.locator('li.list-row', { hasText: 'Pavel Horák' }).getByText('Nedorazil', { exact: true }).isVisible()
    && await nastroj.locator('li.list-row', { hasText: 'Pavel Horák' }).getByRole('button', { name: /^(Potvrdit|Usadit|Hotovo):/ }).count() === 0);
  const nadpis = await nastroj.locator('h2', { hasText: /rezervace|rezervací/ }).first().innerText();
  tvrdi(`R ${jmeno}: nadpis dne „· 3 rezervace · 9 osob · špička 21:00" (nedorazivší se nepočítá)`, /3 rezervace/.test(nadpis) && /9 osob/.test(nadpis) && /špička 21:00/.test(nadpis), nadpis);
  tvrdi(`R ${jmeno}: bez přetečení`, await bezPreteceni(p));
  await p.screenshot({ path: OUT + `k84-klient-rezervace-${jmeno}.png`, fullPage: true });
  // Nedorazil jedním klepnutím → PATCH no_show, toast s „Vrátit".
  await jana.getByRole('button', { name: /^Nedorazil:/ }).click();
  tvrdi(`R ${jmeno}: „Nedorazil" pošle PATCH { id: 11, status: no_show }`, await dokud(() => (stav.patche ?? []).some(b => b.id === 11 && b.status === 'no_show'), 3000), JSON.stringify(stav.patche));
  tvrdi(`R ${jmeno}: toast „Jana Dvořáková: nedorazil." s tlačítkem „Vrátit"`, await dokud(() => p.getByText('Jana Dvořáková: nedorazil.').isVisible(), 3000) && await p.getByRole('button', { name: 'Vrátit' }).isVisible());
  await p.getByRole('button', { name: 'Vrátit' }).click();
  tvrdi(`R ${jmeno}: „Vrátit" pošle PATCH { id: 11, status: confirmed }`, await dokud(() => (stav.patche ?? []).some(b => b.id === 11 && b.status === 'confirmed'), 3000));
  // Hledání podle jména.
  const hledat = p.locator('[data-plocha]').getByPlaceholder('Jméno nebo telefon').first();
  tvrdi(`R ${jmeno}: pole „Jméno nebo telefon" nad seznamem`, await hledat.isVisible() && (await hledat.getAttribute('placeholder')) === 'Jméno nebo telefon');
  await hledat.fill('Nov');
  tvrdi(`R ${jmeno}: hledání pošle GET ?q=Nov`, await dokud(() => dotazy(stav, '/api/client/admin/reservations?q=Nov').length > 0, 3000));
  tvrdi(`R ${jmeno}: výsledky říkají „2 rezervace pro „Nov“" a mají Petra`, await dokud(() => p.getByText(/2 rezervace pro „Nov“/).isVisible(), 3000) && await nastroj.getByText('Petr Novák').first().isVisible());
  if (mobil) await p.screenshot({ path: OUT + `k84-klient-rezervace-hledani-${jmeno}.png`, fullPage: true });
  await hledat.fill('');
  await p.waitForTimeout(500);
  // Skok na den kalendářem.
  await p.locator('[data-plocha]').getByRole('button', { name: /Vybrat den v kalendáři/ }).click();
  const kal = p.getByRole('dialog', { name: 'Skok na den' });
  tvrdi(`R ${jmeno}: „Den" otevře kalendář a načte tečky (GET ?month=${dnes.slice(0, 7)})`, await dokud(() => kal.isVisible(), 3000) && await dokud(() => dotazy(stav, `month=${dnes.slice(0, 7)}`).length > 0, 3000));
  const bunkaZitra = kal.getByRole('button', { name: new RegExp(`^.*: 1 rezervace$`) }).first();
  tvrdi(`R ${jmeno}: zítřek má tečku „1 rezervace", dnešek „4 rezervace"`, await dokud(() => bunkaZitra.isVisible(), 3000) && await kal.getByRole('button', { name: /: 4 rezervace$/ }).isVisible());
  if (mobil) {
    // Okno zdola dojíždí ~400 ms — měřit až po dojezdu.
    await p.waitForTimeout(600);
    const box = await kal.boundingBox();
    tvrdi(`R ${jmeno}: kalendář vyjede zdola přes celou šířku`, !!box && Math.abs(box.y + box.height - 844) <= 2 && box.width >= 380, JSON.stringify(box));
    const bb = await bunkaZitra.boundingBox();
    tvrdi(`R ${jmeno}: den v kalendáři má aspoň 44 px`, !!bb && bb.height >= 44 && bb.width >= 44, JSON.stringify(bb));
    await p.screenshot({ path: OUT + `k84-klient-rezervace-kalendar-${jmeno}.png` });
  }
  await bunkaZitra.click();
  tvrdi(`R ${jmeno}: den pošle GET ?date=${zitra} a kalendář se zavře`, await dokud(() => dotazy(stav, `date=${zitra}`).length > 0, 3000) && await dokud(async () => !(await kal.isVisible()), 2000));
  tvrdi(`R ${jmeno}: tlačítko dne nese vybraný den a jde zrušit`, await p.locator('[data-plocha]').getByRole('button', { name: /Vybraný den/ }).isVisible() && await p.locator('[data-plocha]').getByRole('button', { name: 'Zrušit výběr dne' }).isVisible());
  await p.locator('[data-plocha]').getByRole('button', { name: 'Zrušit výběr dne' }).click();
  // Minulé: pilulky, oříznutí, Načíst další.
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Minulé' }).click();
  tvrdi(`R ${jmeno}: Minulé mají pilulky „Vše · 240" a „Nedorazili · 6"`, await dokud(() => p.getByRole('button', { name: 'Vše · 240' }).isVisible(), 4000) && await p.getByRole('button', { name: 'Nedorazili · 6' }).isVisible());
  tvrdi(`R ${jmeno}: oříznutí se hlásí „Zobrazeno 3 z 240" s „Načíst další"`, await p.getByText('Zobrazeno 3 z 240').isVisible() && await p.getByRole('button', { name: 'Načíst další' }).isVisible());
  await p.getByRole('button', { name: 'Načíst další' }).click();
  tvrdi(`R ${jmeno}: „Načíst další" pošle GET range=past&limit=200`, await dokud(() => dotazy(stav, 'range=past&limit=200').length > 0, 3000));
  await p.getByRole('button', { name: 'Nedorazili · 6' }).click();
  tvrdi(`R ${jmeno}: „Nedorazili" pošle GET status=no_show`, await dokud(() => dotazy(stav, 'status=no_show').length > 0, 3000));
  tvrdi(`R ${jmeno}: u minulé potvrzené (Ondřej) je „Nedorazil" tlačítko (zpětně)`, await dokud(() => nastroj.locator('li.list-row', { hasText: 'Ondřej Beneš' }).getByRole('button', { name: /^Nedorazil:/ }).isVisible(), 4000));
  if (mobil) await p.screenshot({ path: OUT + `k84-klient-rezervace-minule-${jmeno}.png`, fullPage: true });
  // Okno Host.
  await nastroj.getByRole('button', { name: 'Karta hosta Petr Novák' }).first().click();
  const host = p.getByRole('dialog', { name: 'Petr Novák' });
  tvrdi(`R ${jmeno}: klepnutí na jméno otevře okno Host s „9" rezervací a „2× nedorazil"`, await dokud(() => host.isVisible(), 3000) && await host.getByText('2× nedorazil').first().isVisible() && await host.getByText('Další rezervace se mu nepotvrdí sama — počká na tebe.').isVisible());
  tvrdi(`R ${jmeno}: okno Host načte poznámky (GET notes?customerId=102)`, await dokud(() => dotazy(stav, '/api/client/admin/notes?customerId=102').length > 0, 3000) && await dokud(() => host.getByText('Dort si přinesou sami.').isVisible(), 3000));
  await host.getByLabel('Nová poznámka').fill('Nesnáší mléko');
  await host.getByRole('button', { name: 'Přidat poznámku' }).click();
  tvrdi(`R ${jmeno}: „Přidat poznámku" pošle POST notes { customerId: 102, body }`, await dokud(() => (stav.poznamky ?? []).some(b => b.customerId === 102 && b.body === 'Nesnáší mléko'), 3000), JSON.stringify(stav.poznamky));
  if (mobil) {
    const box = await host.boundingBox();
    tvrdi(`R ${jmeno}: okno Host vyjede zdola`, !!box && Math.abs(box.y + box.height - 844) <= 2, JSON.stringify(box));
    await p.screenshot({ path: OUT + `k84-klient-rezervace-host-${jmeno}.png` });
  }
  await p.keyboard.press('Escape');
  tvrdi(`R ${jmeno}: bez chyb v konzoli`, chybyBezHydratace(chyby).length === 0, chybyBezHydratace(chyby).slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Hodnocení: pilulky, filtr, odpověď
// ---------------------------------------------------------------------------
for (const [vp, mobil, jmeno] of [[DESK, false, 'desk'], [TEL, true, 'tel']]) {
  const { ctx, p, stav, chyby } = await kontext({ viewport: vp, mobil, fix: nacti('k69-b8-rozlozeni-zakaznici'), posunCasu: posunNa(20, 0), dalsi: podvrh });
  await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Hodnocení' }).click();
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi(`H ${jmeno}: pilulky „Vše · 4", „1–2 ★ · 2", „S komentářem · 3", „Nevyřízené · 1"`, await dokud(() => nastroj.getByRole('button', { name: 'Vše · 4' }).isVisible(), 5000)
    && await nastroj.getByRole('button', { name: '1–2 ★ · 2' }).isVisible() && await nastroj.getByRole('button', { name: 'S komentářem · 3' }).isVisible() && await nastroj.getByRole('button', { name: 'Nevyřízené · 1' }).isVisible());
  tvrdi(`H ${jmeno}: Jana má Chip „odpovězeno · Martin" a text odpovědi, Ota „vyřízeno", Petr „nevyřízené"`,
    await nastroj.getByText('odpovězeno · Martin').isVisible() && await nastroj.getByText('Děkujeme, Jano! Těšíme se zas.').isVisible()
    && await nastroj.locator('li.list-row', { hasText: 'Ota Zima' }).getByText('vyřízeno', { exact: true }).isVisible() && await nastroj.locator('li.list-row', { hasText: 'Petr Novák' }).getByText('nevyřízené', { exact: true }).isVisible());
  await nastroj.getByRole('button', { name: '1–2 ★ · 2' }).click();
  tvrdi(`H ${jmeno}: „1–2 ★" nechá jen Petra a Otu`, await dokud(async () => (await nastroj.locator('li.list-row').count()) === 2, 2000) && await nastroj.getByText('Petr Novák').isVisible() && await nastroj.getByText('Ota Zima').isVisible());
  tvrdi(`H ${jmeno}: bez přetečení`, await bezPreteceni(p));
  await p.screenshot({ path: OUT + `k84-klient-hodnoceni-${jmeno}.png`, fullPage: true });
  await nastroj.getByRole('button', { name: /^Odpovědět: Petr Novák/ }).click();
  const okno = p.getByRole('dialog', { name: 'Odpověď pro Petr Novák' });
  tvrdi(`H ${jmeno}: „Odpovědět" otevře okno s polem a přepínačem „Označit jako vyřízené"`, await dokud(() => okno.isVisible(), 3000) && await okno.getByRole('switch', { name: /Označit jako vyřízené/ }).isVisible());
  await okno.getByLabel('Odpověď hostovi').fill('Omlouváme se, příště stůl držíme.');
  await okno.getByRole('switch', { name: /Označit jako vyřízené/ }).click();
  if (mobil) {
    const box = await okno.boundingBox();
    tvrdi(`H ${jmeno}: okno vyjede zdola`, !!box && Math.abs(box.y + box.height - 844) <= 2, JSON.stringify(box));
    await p.screenshot({ path: OUT + `k84-klient-hodnoceni-odpoved-${jmeno}.png` });
  }
  await okno.getByRole('button', { name: 'Odeslat odpověď' }).click();
  tvrdi(`H ${jmeno}: odeslání pošle PATCH { id: 2, reply, resolved: true }`, await dokud(() => (stav.odpovedi ?? []).some(b => b.id === 2 && b.reply === 'Omlouváme se, příště stůl držíme.' && b.resolved === true), 3000), JSON.stringify(stav.odpovedi));
  tvrdi(`H ${jmeno}: potvrzení „Petr Novák dostane tvoji odpověď."`, await dokud(() => p.getByText('Petr Novák dostane tvoji odpověď.').isVisible(), 3000));
  tvrdi(`H ${jmeno}: bez chyb v konzoli`, chybyBezHydratace(chyby).length === 0, chybyBezHydratace(chyby).slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Objednávky: dnešní rezervace jen jednou (v nástroji; výchozí rozložení bez widgetu)
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ fix: nacti('k84-klient-rozlozeni-objednavky'), dalsi: podvrh });
  await otevri(p, CLIENT('orders'), 'vedeni.klient_objednavky');
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('O: nástroj příjmu kreslí frontu i kartu „Dnešní rezervace" (ručně zapsaný host se jménem)', await dokud(() => nastroj.getByText('Nová objednávka od stolu').isVisible(), 5000)
    && await nastroj.getByRole('heading', { name: 'Dnešní rezervace' }).isVisible() && await nastroj.locator('li', { hasText: 'Pavel Horák' }).first().isVisible());
  tvrdi('O: widget Dnešní rezervace na stránce není — host je na ní jednou', await widgetLi(p, 'klient.dnesni_rezervace').count() === 0 && (await p.locator('[data-plocha]').getByText('Pavel Horák').count()) === 1);
  tvrdi('O: bez chyb v konzoli', chybyBezHydratace(chyby).length === 0, chybyBezHydratace(chyby).slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Host (390): připomínka → stránka podniku s Potvrdit / Zrušit; Moje stránka
// ---------------------------------------------------------------------------
{
  const stav = {};
  const podnik = () => {
    const d = nacti('client_b_kavarna-u-lipy');
    d.today = dnes; d.signedIn = true; d.business.reservationsOn = true;
    d.business.hours = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [String(i), { open: '08:00', close: '23:00' }]));
    d.me = { ...(d.me ?? {}), reservations: [{ id: 11, date: dnes, time: '19:00', party: 4, note: null, status: 'confirmed', created_at: `${vcera} 10:00:00`, guest_confirmed_at: null }, { id: 12, date: zitra, time: '18:00', party: 2, note: null, status: 'requested', created_at: `${vcera} 10:00:00`, guest_confirmed_at: null }] };
    return d;
  };
  const { ctx, p, chyby } = await kontext({ role: 'customer', viewport: TEL, mobil: true, posunCasu: posunNa(9, 0), dalsi: (req, json) => {
    const path = new URL(req.url()).pathname;
    if (path === '/api/client/b/kavarna-u-lipy') return json(podnik());
    if (path === '/api/client/b/kavarna-u-lipy/reservations' && req.method() === 'PATCH') { (stav.potvrzeni ??= []).push(req.postDataJSON()); return json({ ok: true, id: 11, guestConfirmed: true }); }
    if (path === '/api/client/b/kavarna-u-lipy/reviews') return json(nacti('k84-klient-host-odpovedi'));
    // Moje stránka: obecná fixtura nemá dnešek ani adresu podniku u rezervace — doplní se tady.
    if (path === '/api/client/me' && req.method() === 'GET') return json({ ...nacti('client_me'), today: dnes, reservations: [{ id: 11, date: dnes, time: '19:00', party: 4, note: null, status: 'confirmed', slug: 'kavarna-u-lipy', business: 'Kavárna U Lípy' }] });
    return undefined;
  } });
  await p.goto(`${BASE}/client/kavarna-u-lipy?tab=reserve&rezervace=11`, { waitUntil: 'networkidle' });
  await p.waitForSelector('h1', { timeout: 30000 });
  const radek = p.locator('#rezervace-11');
  tvrdi('G: rezervace z připomínky je zvýrazněná a nese výzvu „Dorazíš? Potvrď…"', await dokud(() => radek.isVisible(), 10000) && await radek.getByText(/Dorazíš\? Potvrď/).isVisible());
  const potvrdit = radek.getByRole('button', { name: /^Potvrdit rezervaci/ });
  const bb = await potvrdit.boundingBox();
  tvrdi('G: tlačítko „Potvrdit" vedle „Zrušit", dotyková plocha aspoň 44 px (tap-target-sm ::before)', await potvrdit.isVisible() && await radek.getByRole('button', { name: 'Zrušit' }).isVisible()
    && !!bb && (bb.height >= 44 || (await potvrdit.evaluate(a => parseFloat(getComputedStyle(a, '::before').height))) >= 44), JSON.stringify(bb));
  tvrdi('G: bez přetečení', await bezPreteceni(p));
  await p.screenshot({ path: OUT + 'k84-klient-host-pripominka-tel.png', fullPage: true });
  await potvrdit.click();
  tvrdi('G: „Potvrdit" pošle PATCH b/<slug>/reservations { id: 11, action: confirm }', await dokud(() => (stav.potvrzeni ?? []).some(b => b.id === 11 && b.action === 'confirm'), 3000), JSON.stringify(stav.potvrzeni));
  tvrdi('G: …ohlásí „Díky, podnik s tebou počítá." a ukáže „Potvrzeno tebou"', await dokud(() => p.getByText('Díky, podnik s tebou počítá.').isVisible(), 3000) && await dokud(() => radek.getByText('Potvrzeno tebou').isVisible(), 3000));
  tvrdi('G: žádost (requested) nemá „Potvrdit", jen „Zrušit"', await p.locator('#rezervace-12').getByRole('button', { name: /^Potvrdit/ }).count() === 0 && await p.locator('#rezervace-12').getByRole('button', { name: 'Zrušit' }).isVisible());
  // Moje stránka: odpovědi na hodnocení a odkaz k rezervaci.
  await p.goto(`${BASE}/client/me`, { waitUntil: 'networkidle' });
  tvrdi('G: Moje stránka má sekci „Odpovědi na tvoje hodnocení" s odpovědí podniku', await dokud(() => p.getByRole('heading', { name: 'Odpovědi na tvoje hodnocení' }).isVisible(), 15000) && await p.getByText('Děkujeme, Jano! Těšíme se zas.').isVisible());
  tvrdi('G: u nadcházející rezervace odkaz „Potvrdit nebo zrušit" na stránku podniku', await dokud(() => p.getByRole('link', { name: /Potvrdit nebo zrušit/ }).first().isVisible(), 5000)
    && /\/client\/kavarna-u-lipy\?tab=reserve&rezervace=\d+/.test((await p.getByRole('link', { name: /Potvrdit nebo zrušit/ }).first().getAttribute('href')) ?? ''));
  tvrdi('G: Moje stránka bez přetečení', await bezPreteceni(p));
  await p.screenshot({ path: OUT + 'k84-klient-host-moje-tel.png', fullPage: true });
  tvrdi('G: bez chyb v konzoli', chybyBezHydratace(chyby).length === 0, chybyBezHydratace(chyby).slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
