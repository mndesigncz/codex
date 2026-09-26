// Kolo 69, balík B5a — Uzávěrky (vedení) a Uzávěrka (zaměstnanec) jako plocha s widgety (spec §7.4).
//
// Pro obě stránky: jeden h1 jako první, nástroj v klidu vidět, v úpravách
// sbalený bez „−" a přesunutelný nad widget i pod něj (PUT), galerie nabízí
// widgety uzávěrek v „Doporučené", role bez klíče widget nevidí a jeho
// endpoint se nevolá, 500 na jednom endpointu shodí jen jeden widget,
// telefon 390 bez přetečení s použitelnou hlavní akcí a rozepsaný formulář
// přežije úpravy. Navíc to, co balík opravoval: dnešní běžící směna už
// nesvítí jako chybějící uzávěrka (N9), Provozní bez tržeb nevidí nuly (N3)
// a widgety mluví s nástrojem (Vyplnit → formulář na ten den, den
// v kalendáři → zúžený seznam).
//
// Fixtury: scripts/sondy/fixtury/k69-b5a-*.json; datumy (DNES, VCERA…) se
// doplní při podvrhu podle pražského dne, ať sonda nezestárne.
import { readFileSync } from 'node:fs';
import {
  kontext, konec, tvrdi, otevri, lista, upravit, hotovo, vUpravach, dokud, poradi, poradiPutu, dotazyNa, roleMine, VLASTNIK, DIR, OUT, BASE,
} from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PREDEVCIREM: praha(-2), PRED3: praha(-3), PRED4: praha(-4), PRED5: praha(-5), PRED6: praha(-6) };
const MESIC = DNY.DNES.slice(0, 7);
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t.replaceAll('"MESIC"', `"${MESIC}"`));
};
const FIX_UZAVERKY = nacti('k69-b5a-rozlozeni-uzaverky');
const FIX_UZAVERKA = nacti('k69-b5a-rozlozeni-uzaverka');

/** Podvrh API uzávěrek; `chyby` = cesty, které mají vrátit 500; `closings` = jiná fixtura seznamu. */
const podvrh = ({ closings = 'k69-b5a-closings', upravit: uprav = null } = {}) => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  if (stav.chyby[path]) return json({ error: 'Server spadl' }, stav.chyby[path]);
  if (req.method() !== 'GET') return undefined;
  if (path === '/api/closings') { const d = nacti(closings); return json(uprav ? uprav(d) : d); }
  if (path === '/api/closings/calendar') return json({ ...nacti('k69-b5a-calendar'), month: url.searchParams.get('month') ?? MESIC });
  if (path === '/api/closings/handover') return json(nacti('k69-b5a-handover'));
  if (path === '/api/finance') return json(JSON.parse(readFileSync(DIR + 'finance_month_2026-09.json', 'utf8')));
  return undefined;
};

const VEDENI = '/employer/overview?view=reports';
const ZAMESTNANEC = '/employee/shifts?view=closing';
const naPlose = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`).count();
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---------------------------------------------------------------------------
// Vedení: Uzávěrky
// ---------------------------------------------------------------------------

// 1–3) Hlavička, nástroj, úpravy (zástupce bez „−", přesun nad i pod widget → PUT), galerie.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_UZAVERKY, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.uzaverky');
  const h1 = await p.evaluate(() => {
    const vsechny = [...document.querySelectorAll('main h1, [data-plocha] h1')];
    const plocha = document.querySelector('[data-plocha]');
    const prvni = plocha?.querySelector('h1, h2, h3');
    return { pocet: [...document.querySelectorAll('h1')].filter(h => h.offsetParent !== null).length, prvniJeH1: prvni?.tagName === 'H1', text: vsechny[0]?.textContent?.trim() };
  });
  tvrdi('V1: právě jeden viditelný h1 a je první nadpis plochy', h1.pocet === 1 && h1.prvniJeH1, JSON.stringify(h1));
  tvrdi('V1: h1 = „Uzávěrky"', h1.text === 'Uzávěrky', h1.text);
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('V1: plocha má nástroj a v klidu je vidět (Seznam uzávěrek)', await nastroj.count() === 1 && await nastroj.getByText('Seznam uzávěrek').isVisible());
  tvrdi('V1: seznam ukazuje uzávěrky z fixtury (Petr Novák čeká na schválení)', (await nastroj.innerText()).includes('Čeká na schválení'));
  tvrdi('V1: jediná limetka v hlavičce je „Nová uzávěrka"', await p.locator('[data-plocha] button.on-accent:visible').count() === 1 && await p.getByRole('button', { name: 'Nová uzávěrka' }).isVisible(), `${await p.locator('[data-plocha] button.on-accent:visible').count()}×`);

  // N9: dnešní směna (starý server ji poslal v missingClosings) se nepočítá, PRED6 ano.
  const chyb = widgetLi(p, 'uzaverky.chybejici');
  const textChyb = await chyb.innerText();
  const dnesVetou = new Date(`${DNY.DNES}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  tvrdi('V N9: Chybějící uzávěrky neukazují dnešní běžící směnu', !textChyb.toLowerCase().includes(dnesVetou.toLowerCase()) && !textChyb.includes('Dnes ·'), textChyb.slice(0, 200));
  tvrdi('V N9: …ale starší den bez uzávěrky ano (s lidmi na směně)', textChyb.includes('Petr Novák'), textChyb.slice(0, 200));
  tvrdi('V: Ke schválení ukazuje Petra se „Schválit" (primary, ne limetka)', await widgetLi(p, 'uzaverky.ke_schvaleni').getByRole('button', { name: 'Schválit' }).count() === 1
    && await widgetLi(p, 'uzaverky.ke_schvaleni').locator('button.on-accent').count() === 0);
  tvrdi('V: Souhrn má čísla (Tržba) a žádnou dlaždici s ručním štítkem', (await widgetLi(p, 'uzaverky.souhrn').innerText()).includes('TRŽBA') || (await widgetLi(p, 'uzaverky.souhrn').innerText()).includes('Tržba'));

  // 2) Úpravy: nástroj je zástupce bez „−", přesun šipkami nad widget i pod něj.
  await upravit(p).click();
  tvrdi('V2: vstup do úprav', await dokud(() => vUpravach(p), 1500));
  tvrdi('V2: nástroj je v úpravách sbalený do zástupce', await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible());
  tvrdi('V2: zástupce nástroje nemá „−" (nejde odebrat)', await nastroj.locator('[data-odznak]').count() === 0);
  tvrdi('V2: widgety „−" mají', await widgetLi(p, 'uzaverky.souhrn').locator('[data-odznak]').count() === 1);
  await nastroj.focus();
  await p.keyboard.press('Home');
  tvrdi('V2: nástroj jde přesunout nad všechny widgety', await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi('V2: …a odejde PUT s nástrojem nahoře', poradiPutu(stav.puty.at(-1))[0] === 'nastroj', JSON.stringify(poradiPutu(stav.puty.at(-1))));
  await p.keyboard.press('ArrowDown');
  tvrdi('V2: …a zpátky pod widget', await dokud(async () => (await poradi(p))[1] === 'nastroj', 1500), JSON.stringify(await poradi(p)));

  // 3) Galerie: widgety uzávěrek v „Doporučené pro tuto stránku".
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(400);
  const dop = await galerie.evaluate(el => {
    const h = [...el.querySelectorAll('h4')].find(x => x.textContent?.includes('Doporučené'));
    return h?.parentElement?.innerText ?? '';
  });
  for (const nazev of ['Rozdíl pokladny', 'Trendy tržeb', 'Měsíc v číslech']) {
    tvrdi(`V3: galerie nabízí „${nazev}" v Doporučených`, dop.includes(nazev), dop.slice(0, 300));
  }
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('V: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Widget → nástroj: den z kalendáře zúží seznam, „Vyplnit" z Chybějících otevře formulář na ten den.
{
  const { ctx, p } = await kontext({ fix: FIX_UZAVERKY, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.uzaverky');
  const cislo = Number(DNY.VCERA.slice(8, 10));
  const kal = widgetLi(p, 'uzaverky.kalendar');
  const bunka = kal.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${cislo}`) }).first();
  if (DNY.VCERA.slice(0, 7) === MESIC && await bunka.count()) {
    await bunka.click();
    const nastroj = widgetLi(p, 'nastroj');
    tvrdi('W1: klepnutí na den v kalendáři zúží seznam (Zrušit výběr)', await dokud(() => nastroj.getByRole('button', { name: 'Zrušit výběr' }).isVisible(), 2000));
    tvrdi('W1: …a den je v kalendáři označený', await bunka.getAttribute('aria-pressed') === 'true');
  } else tvrdi('W1: (přeskočeno — včerejšek je v jiném měsíci)', true);
  const radek = widgetLi(p, 'uzaverky.chybejici').locator('button.list-row').first();
  await radek.click();
  tvrdi('W2: řádek Chybějících otevře formulář uzávěrky', await dokud(() => p.getByRole('button', { name: 'Zpět na uzávěrky' }).isVisible(), 3000));
  const datum = await p.getByLabel('Datum uzávěrky').inputValue().catch(() => '');
  tvrdi('W2: …předvyplněný na den, kdy uzávěrka chybí', datum === DNY.PRED6, `${datum} ≠ ${DNY.PRED6}`);
  await ctx.close();
}

// 4) Oprávnění: Provozní (bez finance.trzby / finance.mzdy) — zastaralý server pošle Souhrn i Trendy.
{
  const fix = { ...FIX_UZAVERKY, polozky: [...FIX_UZAVERKY.polozky, { id: 'uzaverky-trendy', widget: 'uzaverky.trendy', velikost: 'M' }, { id: 'uzaverky-mesic', widget: 'uzaverky.mesic_v_cislech', velikost: 'M' }] };
  // API cizím uzávěrkám tržby maže (trzbaSkryta) — tak jako skutečný server.
  const skryj = (d) => ({ ...d, closings: d.closings.map(c => {
    if (c.created_by === 15) return c;
    const { cash_revenue, card_revenue, tips, tips_card, closing_cash, ...r } = c; return { ...r, trzbaSkryta: true };
  }) });
  const { ctx, p, stav } = await kontext({ fix, mineData: roleMine('provozni'), dalsi: podvrh({ upravit: skryj }) });
  await otevri(p, VEDENI, 'vedeni.uzaverky');
  await p.waitForTimeout(600);
  for (const w of ['uzaverky.souhrn', 'uzaverky.trendy', 'uzaverky.mesic_v_cislech']) {
    tvrdi(`O1: Provozní nevidí ${w}`, await naPlose(p, w) === 0);
  }
  tvrdi('O1: …a na /api/finance neodešel dotaz', dotazyNa(stav, ['/api/finance']).length === 0);
  const text = await p.locator('[data-plocha]').innerText();
  tvrdi('O1 (N3): nikde „0 Kč" ani „Rozdíl kasy"', !/(^|\s)0\s?Kč/.test(text) && !text.includes('Rozdíl kasy'), text.match(/.{0,30}0\s?Kč.{0,30}/)?.[0] ?? '');
  tvrdi('O1: fronty a kalendář Provozní vidí', await naPlose(p, 'uzaverky.chybejici') === 1 && await naPlose(p, 'uzaverky.kalendar') === 1);
  tvrdi('O1: v seznamu u cizí uzávěrky bez tržeb není rozdíl kasy (chip „Sedí"/částka)', !(await widgetLi(p, 'nastroj').innerText()).includes('+'));
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(400);
  const g = await galerie.innerText();
  tvrdi('O1: galerie Provozní nenabízí Souhrn, Rozdíl pokladny ani Trendy', !g.includes('Souhrn uzávěrek') && !g.includes('Rozdíl pokladny') && !g.includes('Trendy tržeb'));
  await ctx.close();
}

// 5) 500 na kalendáři → ErrorState jen v kalendáři, ostatní widgety žijí.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_UZAVERKY, dalsi: podvrh() });
  stav.chyby['/api/closings/calendar'] = 500;
  await otevri(p, VEDENI, 'vedeni.uzaverky');
  await p.waitForTimeout(800);
  const kal = widgetLi(p, 'uzaverky.kalendar');
  tvrdi('E1: kalendář ukáže „Widget se nenačetl" se „Zkusit znovu"', await kal.getByText('Widget se nenačetl').isVisible() && await kal.getByRole('button', { name: 'Zkusit znovu' }).isVisible());
  tvrdi('E1: ostatní widgety a seznam žijí', await widgetLi(p, 'uzaverky.souhrn').getByText('Widget se nenačetl').count() === 0
    && await widgetLi(p, 'nastroj').getByText('Seznam uzávěrek').isVisible()
    && await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1);
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, „Nová uzávěrka" vidět a klikatelná.
{
  const { ctx, p } = await kontext({ fix: FIX_UZAVERKY, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.uzaverky');
  tvrdi('T1: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const nova = p.getByRole('button', { name: 'Nová uzávěrka' });
  tvrdi('T1: „Nová uzávěrka" je vidět a povolená', await nova.isVisible() && await nova.isEnabled());
  await p.screenshot({ path: OUT + 'k69-b5a-uzaverky-tel.png', fullPage: true });
  await nova.click();
  tvrdi('T1: …a otevře formulář', await dokud(() => p.getByRole('button', { name: 'Zpět na uzávěrky' }).isVisible(), 3000));
  tvrdi('T1: formulář na telefonu nepřetéká', await bezPreteceni(p));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Zaměstnanec: Uzávěrka
// ---------------------------------------------------------------------------
const BARISTA = roleMine('barista');

// 1–3, 7) Hlavička, nástroj = formulář, úpravy, rozepsaný formulář přežije úpravy.
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: FIX_UZAVERKA, mineData: BARISTA, dalsi: podvrh({ closings: 'k69-b5a-closings-zamestnanec' }) });
  await otevri(p, ZAMESTNANEC, 'zamestnanec.uzaverka');
  const h1 = await p.evaluate(() => [...document.querySelectorAll('h1')].filter(h => h.offsetParent !== null).map(h => h.textContent?.trim()));
  tvrdi('Z1: právě jeden h1 „Uzávěrka"', h1.length === 1 && h1[0] === 'Uzávěrka', JSON.stringify(h1));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('Z1: nástroj = formulář uzávěrky, v klidu vidět', await nastroj.getByRole('heading', { name: 'Uzávěrka směny' }).isVisible());
  tvrdi('Z1: formulář nemá štítek „Krok 1/4"', !(await nastroj.innerText()).includes('Krok 1/4') && !(await nastroj.innerText()).toUpperCase().includes('KROK 1/4'));
  tvrdi('Z1: jediná limetka je „Odeslat uzávěrku"', await p.locator('[data-plocha] button.on-accent:visible').count() === 1 && await nastroj.getByRole('button', { name: 'Odeslat uzávěrku' }).count() === 1, `${await p.locator('[data-plocha] button.on-accent:visible').count()}×`);
  tvrdi('Z1: Moje uzávěrka hlásí neuzavřenou směnu', (await widgetLi(p, 'uzaverky.moje_uzaverka').innerText()).includes('Vyplň uzávěrku'));
  tvrdi('Z1: Moje uzávěrky ukazují vlastní historii', (await widgetLi(p, 'uzaverky.moje_historie').innerText()).includes('Čeká na schválení'));
  tvrdi('Z1: barista nemá tým v kalendáři — žádný dotaz na kalendář týmu', dotazyNa(stav, ['/api/closings/calendar']).filter(d => !d.u.includes('scope=me')).length === 0);

  // 7) Rozepsaný formulář přežije vstup do úprav a výstup z nich.
  const pole = nastroj.getByLabel('Kasa na začátku');
  await pole.fill('4321');
  await upravit(p).click();
  tvrdi('Z2: vstup do úprav', await dokud(() => vUpravach(p), 1500));
  tvrdi('Z2: formulář je sbalený do zástupce bez „−"', await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible() && await nastroj.locator('[data-odznak]').count() === 0);
  await nastroj.focus();
  await p.keyboard.press('End');
  tvrdi('Z2: nástroj jde přesunout pod widgety', await dokud(async () => (await poradi(p)).at(-1) === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi('Z2: …PUT s nástrojem na konci', poradiPutu(stav.puty.at(-1)).at(-1) === 'nastroj');
  await hotovo(p).click();
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('Z7: rozepsaná „Kasa na začátku" přežila úpravy', await nastroj.getByLabel('Kasa na začátku').inputValue() === '4321');

  // Galerie: Doporučené pro Uzávěrku.
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(400);
  // Doporučené, které už jsou na ploše, galerie jako „Doporučené" znovu nenabízí; oblast Uzávěrky je ukáže.
  const gz = await galerie.innerText();
  tvrdi('Z3: galerie má widgety uzávěrek (Moje uzávěrka, Moje uzávěrky, Předávka)', ['Moje uzávěrka', 'Moje uzávěrky', 'Předávka'].every(n => gz.includes(n)), gz.slice(0, 300));
  tvrdi('Z3: …a baristovi nenabízí týmové ani peněžní widgety uzávěrek', !gz.includes('Souhrn uzávěrek') && !gz.includes('Chybějící uzávěrky') && !gz.includes('Uzávěrky ke schválení'));
  await p.keyboard.press('Escape');

  // Moje uzávěrka → řádek směny → formulář na ten den.
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  await widgetLi(p, 'uzaverky.moje_uzaverka').locator('button.list-row').first().click();
  tvrdi('Z4: řádek směny v „Moje uzávěrka" nastaví formulář na ten den', await dokud(async () => (await nastroj.getByLabel('Datum uzávěrky').inputValue()) === DNY.PREDEVCIREM, 2000));
  tvrdi('Z: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 4) Kuchař (jen uzaverky.predavka): bez formuláře a bez dotazu na /api/closings, předávka zůstane.
{
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_UZAVERKA, mineData: roleMine('kuchar'), dalsi: podvrh({ closings: 'k69-b5a-closings-zamestnanec' }) });
  // Nástroj kuchaře je prázdný (formulář nedostane), první viditelná buňka je až předávka.
  await p.goto(BASE + ZAMESTNANEC, { waitUntil: 'networkidle' });
  await widgetLi(p, 'uzaverky.predavka').getByText('Ovesné mléko').waitFor({ timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(800);
  tvrdi('K1: kuchař nemá formulář uzávěrky', await p.getByRole('button', { name: 'Odeslat uzávěrku' }).count() === 0);
  tvrdi('K1: …ani Moje uzávěrka / Moje uzávěrky', await naPlose(p, 'uzaverky.moje_uzaverka') === 0 && await naPlose(p, 'uzaverky.moje_historie') === 0);
  tvrdi('K1: …a na /api/closings neodešel dotaz', dotazyNa(stav, ['/api/closings']).filter(d => d.path === '/api/closings').length === 0,
    dotazyNa(stav, ['/api/closings']).map(d => d.path).join(', '));
  tvrdi('K1: předávku vidí', (await widgetLi(p, 'uzaverky.predavka').innerText()).includes('Ovesné mléko'));
  await ctx.close();
}

// 5) 500 na předávce → chyba jen v předávce; 6) telefon 390.
{
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_UZAVERKA, mineData: BARISTA, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh({ closings: 'k69-b5a-closings-zamestnanec' }) });
  stav.chyby['/api/closings/handover'] = 500;
  await otevri(p, ZAMESTNANEC, 'zamestnanec.uzaverka');
  await p.waitForTimeout(800);
  tvrdi('ZE1: předávka ukáže „Widget se nenačetl"', await widgetLi(p, 'uzaverky.predavka').getByText('Widget se nenačetl').isVisible());
  tvrdi('ZE1: jen ona — formulář a Moje uzávěrky žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && await widgetLi(p, 'nastroj').getByRole('heading', { name: 'Uzávěrka směny' }).isVisible());
  tvrdi('ZT1: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const odeslat = p.getByRole('button', { name: 'Odeslat uzávěrku' });
  await odeslat.scrollIntoViewIfNeeded();
  const box = await odeslat.boundingBox();
  tvrdi('ZT1: „Odeslat uzávěrku" je vidět, povolená a přes celou šířku karty', !!box && box.width > 300 && await odeslat.isEnabled(), JSON.stringify(box));
  await p.screenshot({ path: OUT + 'k69-b5a-uzaverka-tel.png', fullPage: true });
  await ctx.close();
}

await konec();
