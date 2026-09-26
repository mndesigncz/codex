// Kolo 69, balík B2 — Docházka a Tým jako plocha s widgety (spec §7.4).
//
// Pro obě stránky: jeden h1 jako první, nástroj v klidu vidět, v úpravách
// sbalený bez „−" a přesunutelný nad widget i pod něj (PUT), galerie nabízí
// widgety balíku v „Doporučené", role bez klíče widget nevidí a jeho endpoint
// se nevolá, 500 na jednom endpointu shodí jen jeden widget, telefon 390 bez
// přetečení s použitelnou hlavní akcí a rozepsané hledání přežije úpravy.
// Navíc to, co balík opravoval: přepínač období řídí i widgety („Podle
// stránky"), Otevřené příchody ukončí odchod na plánovaný konec (ne „teď"),
// žádný ruční přepínač ani confirm(), a Provozní nevidí mzdy ani export.
//
// Fixtury: scripts/sondy/fixtury/k69-b2-*.json. Časy jsou tokeny, ať sonda
// nezestárne: "@<min>" = ISO před tolika minutami, "@HM±<min>" = pražské
// HH:MM posunuté od teď, "DNES" / "VCERA" / "PREDEVCIREM" / "PRED5" = pražské dny.
import { readFileSync } from 'node:fs';
import {
  kontext, konec, tvrdi, otevri, lista, upravit, hotovo, vUpravach, dokud, poradi, poradiPutu, dotazyNa, roleMine, DIR, OUT,
} from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const hmPraha = (min) => new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(Date.now() + min * 60000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PREDEVCIREM: praha(-2), PRED5: praha(-5) };
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  t = t.replace(/"@HM([+-]\d+)"/g, (_, m) => `"${hmPraha(Number(m))}"`);
  t = t.replace(/"@(\d+)"/g, (_, m) => `"${new Date(Date.now() - Number(m) * 60000).toISOString()}"`);
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t);
};
const FIX_DOCHAZKA = nacti('k69-b2-rozlozeni-dochazka');
const FIX_TYM = nacti('k69-b2-rozlozeni-tym');

/** Podvrh API docházky a týmu; zápisy si zapíše do `stav.zapisy`. */
const podvrh = () => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  if (stav.chyby[path]) return json({ error: 'Server spadl' }, stav.chyby[path]);
  if (req.method() !== 'GET' && /^\/api\/(attendance|teams|invitations)/.test(path)) {
    (stav.zapisy ??= []).push({ m: req.method(), path, telo: req.postData() });
    return json({ ok: true, entry: {} });
  }
  if (req.method() !== 'GET') return undefined;
  if (path === '/api/attendance') return json(nacti('k69-b2-attendance'));
  if (path === '/api/closings') return json(nacti('k69-b2-closings'));
  if (path === '/api/teams') return json(nacti('k69-b2-teams'));
  if (path === '/api/invitations') return json(nacti('k69-b2-invitations'));
  if (/^\/api\/employees\/\d+$/.test(path)) return json(nacti('k69-b2-employee'));
  return undefined;
};

const DOCHAZKA = '/employer/overview?view=attendance';
const TYM = '/employer/overview?view=team-settings';
const naPlose = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`).count();
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const jedenH1 = (p) => p.evaluate(() => {
  const plocha = document.querySelector('[data-plocha]');
  const prvni = plocha?.querySelector('h1, h2, h3');
  const viditelne = [...document.querySelectorAll('h1')].filter(h => h.offsetParent !== null);
  return { pocet: viditelne.length, prvniJeH1: prvni?.tagName === 'H1', text: viditelne[0]?.textContent?.trim() };
});
const doporucene = async (p) => {
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(400);
  const dop = await galerie.evaluate(el => [...el.querySelectorAll('h4')].find(x => x.textContent?.includes('Doporučené'))?.parentElement?.innerText ?? '');
  const vse = await galerie.innerText();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  return { dop, vse };
};

// ---------------------------------------------------------------------------
// Docházka
// ---------------------------------------------------------------------------

// 1–3, 7) Hlavička, nástroj, úpravy, galerie, rozepsané hledání.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_DOCHAZKA, dalsi: podvrh() });
  await otevri(p, DOCHAZKA, 'vedeni.dochazka');
  const h1 = await jedenH1(p);
  tvrdi('D1: právě jeden viditelný h1 „Docházka" a je první nadpis plochy', h1.pocet === 1 && h1.prvniJeH1 && h1.text === 'Docházka', JSON.stringify(h1));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('D1: plocha má nástroj „Záznamy docházky" a v klidu je vidět', await nastroj.count() === 1 && await nastroj.getByRole('heading', { name: /Záznamy docházky/ }).isVisible());
  tvrdi('D1: nástroj ukazuje záznamy po dnech (Eva, Petra) v jedné kartě s .list', (await nastroj.innerText()).includes('Petra Malá') && await nastroj.locator('ul.list').count() > 0);
  tvrdi('D1: jediná limetka v hlavičce je „Přidat záznam"', await p.locator('[data-plocha] button.on-accent:visible').count() === 1 && await p.getByRole('button', { name: 'Přidat záznam' }).isVisible(),
    `${await p.locator('[data-plocha] button.on-accent:visible').count()}×`);
  tvrdi('D1: Export CSV je vidět (vlastník má dochazka.exportovat)', await p.getByRole('button', { name: 'Export CSV' }).isVisible());
  // Odkaz na profil v záznamu nese jméno (dřív avatar s aria-hidden = „Zobrazit profil" bez jména).
  tvrdi('D1: profil v záznamu je tlačítko se jménem „Profil: Petra Malá"', await nastroj.getByRole('button', { name: 'Profil: Petra Malá' }).first().isVisible()
    && await nastroj.locator('[title="Zobrazit profil"]').count() === 0);
  tvrdi('D1: žádný ruční přepínač ani kolečko načítání', await p.locator('[data-plocha] .spinner, [data-plocha] .animate-spin').count() === 0);
  const prave = await widgetLi(p, 'dochazka.prave_na_smene').innerText();
  tvrdi('D1: Právě na směně ukazuje Evu i Jakuba', prave.includes('Eva Testová') && prave.includes('Jakub Horák'), prave.slice(0, 200));
  const otevrene = widgetLi(p, 'dochazka.dlouhe_prichody');
  tvrdi('D1: Otevřené příchody (S) počítají Jakuba (směna skončila před hodinou)', (await otevrene.innerText()).includes('1'), (await otevrene.innerText()).slice(0, 120));
  const mzdy = await widgetLi(p, 'dochazka.mzdy_za_obdobi').innerText();
  tvrdi('D1: Mzdy za období mají náklady i podíl na tržbách s cílem', /Mzdové náklady/i.test(mzdy) && /Podíl na tržbách/i.test(mzdy) && /cíl/i.test(mzdy), mzdy.slice(0, 200));
  tvrdi('D1: Chybí sazba počítá Jakuba (vlastník se nepočítá)', (await widgetLi(p, 'tym.bez_sazby').innerText()).includes('1'));
  const souhrn = await widgetLi(p, 'dochazka.souhrn_hodin').innerText();
  tvrdi('D1: Souhrn hodin v jedné kartě s řádky lidí a „30 dní"', souhrn.includes('Petra Malá') && souhrn.includes('30 dní'), souhrn.slice(0, 200));
  await p.screenshot({ path: OUT + 'k69-b2-dochazka-desk.png', fullPage: true });

  // Období stránky řídí widgety „Podle stránky" (Souhrn hodin) i nástroj.
  await p.getByRole('tab', { name: '7 dní' }).click();
  tvrdi('D1: přepínač 7 dní pošle dotaz days=7', await dokud(() => dotazyNa(stav, ['/api/attendance']).some(d => d.u.includes('days=7')), 3000));
  tvrdi('D1: …a Souhrn hodin přepne na „7 dní"', await dokud(async () => (await widgetLi(p, 'dochazka.souhrn_hodin').innerText()).includes('7 dní'), 3000));

  // 7) Rozepsané hledání v nástroji přežije úpravy.
  const hledani = nastroj.getByLabel('Hledat člověka v docházce');
  await hledani.fill('Petra');
  tvrdi('D7: hledání zúží záznamy na Petru', await dokud(async () => !(await nastroj.innerText()).includes('Eva Testová'), 2000));

  // 2) Úpravy: nástroj je zástupce bez „−", přesun šipkami nad widget i pod něj.
  await upravit(p).click();
  tvrdi('D2: vstup do úprav', await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + 'k69-b2-dochazka-desk-upravy.png', fullPage: true });
  tvrdi('D2: nástroj je v úpravách sbalený do zástupce bez „−"', await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible() && await nastroj.locator('[data-odznak]').count() === 0);
  tvrdi('D2: widgety „−" mají', await widgetLi(p, 'dochazka.souhrn_hodin').locator('[data-odznak]').count() === 1);
  await nastroj.focus();
  await p.keyboard.press('Home');
  tvrdi('D2: nástroj jde přesunout nad všechny widgety', await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi('D2: …a odejde PUT s nástrojem nahoře', poradiPutu(stav.puty.at(-1))[0] === 'nastroj', JSON.stringify(poradiPutu(stav.puty.at(-1))));
  await p.keyboard.press('ArrowDown');
  tvrdi('D2: …a zpátky pod widget', await dokud(async () => (await poradi(p))[1] === 'nastroj', 1500), JSON.stringify(await poradi(p)));

  // 3) Galerie: Doporučené, které na ploše nejsou.
  const g = await doporucene(p);
  for (const nazev of ['Dnes v podniku', 'Píchačky']) tvrdi(`D3: galerie nabízí „${nazev}" v Doporučených`, g.dop.includes(nazev), g.dop.slice(0, 300));
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('D7: rozepsané hledání „Petra" přežilo úpravy', await hledani.inputValue() === 'Petra');
  tvrdi('D: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Otevřené příchody M: Ukončit nabídne plánovaný konec, ne „teď"; úprava záznamu přes Modal.
{
  const fix = { ...FIX_DOCHAZKA, polozky: FIX_DOCHAZKA.polozky.map(x => (x.widget === 'dochazka.dlouhe_prichody' ? { ...x, velikost: 'M' } : x)) };
  const { ctx, p, stav } = await kontext({ fix, dalsi: podvrh() });
  await otevri(p, DOCHAZKA, 'vedeni.dochazka');
  const w = widgetLi(p, 'dochazka.dlouhe_prichody');
  const tl = w.getByRole('button', { name: 'Ukončit příchod: Jakub Horák' });
  tvrdi('U1: Otevřené příchody (M) mají u Jakuba „Ukončit"', await tl.isVisible());
  await tl.click();
  const okno = p.getByRole('dialog', { name: 'Ukončit příchod' });
  tvrdi('U1: otevře se okno s časem odchodu', await dokud(() => okno.isVisible(), 2000));
  const cas = await okno.getByLabel('Odchod').inputValue();
  // Vstup datetime-local je v místním čase prohlížeče — porovná se tam, s tolerancí na přelom minuty.
  const odchylka = await p.evaluate(v => Math.abs(new Date(v).getTime() - (Date.now() - 3600_000)) / 60000, cas);
  tvrdi('U1: předvyplněný je plánovaný konec směny (před hodinou), ne teď', odchylka < 3, `${cas}: ${odchylka.toFixed(1)} min od konce plánu`);
  await okno.getByRole('button', { name: 'Uložit odchod' }).click();
  await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'PATCH'), 2000);
  const patch = (stav.zapisy ?? []).find(z => z.m === 'PATCH');
  tvrdi('U1: PATCH /api/attendance s id záznamu a časem odchodu', !!patch && /"id":902/.test(patch.telo) && /"clockOut":"20/.test(patch.telo), patch?.telo);
  // Mazání: potvrzení v okně, ne confirm().
  let dialogProhlizece = false;
  p.on('dialog', d => { dialogProhlizece = true; d.dismiss().catch(() => {}); });
  await widgetLi(p, 'nastroj').getByRole('button', { name: /^Smazat záznam: / }).first().click();
  const smazat = p.getByRole('dialog', { name: 'Smazat záznam?' });
  tvrdi('U2: Smazat otevře potvrzovací okno (Modal), ne confirm()', await dokud(() => smazat.isVisible(), 2000) && !dialogProhlizece);
  tvrdi('U2: …s červeným „Smazat" vpravo a „Zrušit"', await smazat.getByRole('button', { name: 'Smazat' }).isVisible() && await smazat.getByRole('button', { name: 'Zrušit' }).isVisible());
  await smazat.getByRole('button', { name: 'Zrušit' }).click();
  await ctx.close();
}

// Právě na směně (L): „Ukončit" má stejné okno jako Otevřené příchody — plánovaný
// konec, ne „teď" — a po uložení obnoví i záznamy nástroje (days=30), ne jen days=1.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_DOCHAZKA, dalsi: podvrh() });
  await otevri(p, DOCHAZKA, 'vedeni.dochazka');
  const w = widgetLi(p, 'dochazka.prave_na_smene');
  const tl = w.getByRole('button', { name: 'Ukončit směnu: Jakub Horák' });
  tvrdi('R1: Právě na směně (L) má u Jakuba „Ukončit"', await dokud(() => tl.isVisible(), 3000));
  await tl.click();
  const okno = p.getByRole('dialog', { name: 'Ukončit příchod' });
  tvrdi('R1: otevře okno s časem odchodu (ne „zapíše se na teď")', await dokud(() => okno.isVisible(), 2000) && !(await okno.innerText()).includes('zapíše na teď'));
  const cas = await okno.getByLabel('Odchod').inputValue();
  const odchylka = await p.evaluate(v => Math.abs(new Date(v).getTime() - (Date.now() - 3600_000)) / 60000, cas);
  tvrdi('R1: předvyplněný je plánovaný konec (před hodinou)', odchylka < 3, `${cas}: ${odchylka.toFixed(1)} min od konce plánu`);
  const pred30 = dotazyNa(stav, ['/api/attendance']).filter(d => d.u.includes('days=30')).length;
  await okno.getByRole('button', { name: 'Uložit odchod' }).click();
  await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'PATCH'), 2000);
  const patch = (stav.zapisy ?? []).find(z => z.m === 'PATCH');
  tvrdi('R1: PATCH s id 902 a clockOut', !!patch && /"id":902/.test(patch.telo) && /"clockOut":"20/.test(patch.telo), patch?.telo);
  tvrdi('R1: …a obnoví i 30denní záznamy nástroje', await dokud(() => dotazyNa(stav, ['/api/attendance']).filter(d => d.u.includes('days=30')).length > pred30, 3000));
  await ctx.close();
}

// Podíl na tržbách jen s celými tržbami: bez uzaverky.zobrazit_vse vrátí
// /api/closings jen vlastní uzávěrky a podíl by vyšel násobně vyšší.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_DOCHAZKA, mineData: roleMine('vedeni', ['uzaverky.zobrazit_vse']), dalsi: podvrh() });
  await otevri(p, DOCHAZKA, 'vedeni.dochazka');
  const mzdy = widgetLi(p, 'dochazka.mzdy_za_obdobi');
  tvrdi('Z1: bez uzaverky.zobrazit_vse Mzdy za období ukážou náklady', await dokud(async () => /Mzdové náklady/i.test(await mzdy.innerText()), 3000));
  tvrdi('Z1: …ale bez Podílu na tržbách a bez dotazu na /api/closings', !/Podíl na tržbách/i.test(await mzdy.innerText()) && dotazyNa(stav, ['/api/closings']).length === 0, (await mzdy.innerText()).slice(0, 160));
  await ctx.close();
}

// 4) Oprávnění: Provozní (dochazka.zobrazit + upravit, bez finance.mzdy, mazat, exportovat).
{
  const { ctx, p, stav } = await kontext({ fix: FIX_DOCHAZKA, mineData: roleMine('provozni'), dalsi: podvrh() });
  await otevri(p, DOCHAZKA, 'vedeni.dochazka');
  await p.waitForTimeout(600);
  for (const w of ['dochazka.mzdy_za_obdobi', 'tym.bez_sazby']) tvrdi(`O1: Provozní nevidí ${w}`, await naPlose(p, w) === 0);
  tvrdi('O1: …a na /api/closings neodešel dotaz', dotazyNa(stav, ['/api/closings']).length === 0);
  tvrdi('O1: Souhrn hodin vidí, ale bez peněz (Kč)', await naPlose(p, 'dochazka.souhrn_hodin') === 1 && !/Kč/.test(await widgetLi(p, 'dochazka.souhrn_hodin').innerText()));
  tvrdi('O1: bez Export CSV a bez Smazat, Přidat záznam ano', await p.getByRole('button', { name: 'Export CSV' }).count() === 0
    && await p.getByRole('button', { name: /^Smazat záznam/ }).count() === 0 && await p.getByRole('button', { name: 'Přidat záznam' }).isVisible());
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  const g = await doporucene(p);
  tvrdi('O1: galerie Provozní nenabízí Mzdy ani Chybí sazba', !g.vse.includes('Mzdy za období') && !g.vse.includes('Chybí sazba'));
  await ctx.close();
}

// 5) 500 na /api/closings → chyba jen ve Mzdách.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_DOCHAZKA, dalsi: podvrh() });
  stav.chyby['/api/closings'] = 500;
  await otevri(p, DOCHAZKA, 'vedeni.dochazka');
  await p.waitForTimeout(800);
  tvrdi('E1: Mzdy za období ukážou „Widget se nenačetl"', await widgetLi(p, 'dochazka.mzdy_za_obdobi').getByText('Widget se nenačetl').isVisible());
  tvrdi('E1: jen ony — ostatní widgety i záznamy žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'nastroj').innerText()).includes('Petra Malá'));
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, „Přidat záznam" vidět a otevře okno.
{
  const { ctx, p } = await kontext({ fix: FIX_DOCHAZKA, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, DOCHAZKA, 'vedeni.dochazka');
  tvrdi('T1: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const pridat = p.getByRole('button', { name: 'Přidat záznam' });
  tvrdi('T1: „Přidat záznam" je vidět a povolená', await pridat.isVisible() && await pridat.isEnabled());
  // Vedlejší akce se na telefonu schovají (DP §3.4) — Export CSV musí být v „···".
  await p.locator('[data-plocha] button[aria-haspopup="menu"][aria-label="Další akce"]:visible').first().click();
  const polozky = await p.getByRole('menuitem').allInnerTexts();
  tvrdi('T1: „···" na telefonu obsahuje Export CSV', polozky.some(t => t.includes('Export CSV')), polozky.join(' | '));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + 'k69-b2-dochazka-tel.png', fullPage: true });
  await pridat.click();
  const okno = p.getByRole('dialog', { name: 'Přidat záznam docházky' });
  tvrdi('T1: …a otevře okno s poli Kdo, Příchod, Odchod', await dokud(() => okno.isVisible(), 2000) && await okno.getByLabel('Kdo').isVisible() && await okno.getByLabel('Příchod').isVisible());
  tvrdi('T1: okno na telefonu nepřetéká', await bezPreteceni(p));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Tým
// ---------------------------------------------------------------------------

{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_TYM, dalsi: podvrh() });
  await otevri(p, TYM, 'vedeni.tym');
  const h1 = await jedenH1(p);
  tvrdi('M1: právě jeden viditelný h1 „Tým" a je první nadpis plochy', h1.pocet === 1 && h1.prvniJeH1 && h1.text === 'Tým', JSON.stringify(h1));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('M1: nástroj „Lidé v podniku" je v klidu vidět', await nastroj.getByRole('heading', { name: /Lidé v podniku/ }).isVisible());
  tvrdi('M1: nástroj má přepínač sekcí (Lidé, Podnik, Uzávěrka…)', await nastroj.getByRole('tablist', { name: 'Sekce nastavení týmu' }).isVisible());
  tvrdi('M1: jediná limetka je „Pozvat člena"', await p.locator('[data-plocha] button.on-accent:visible').count() === 1 && await p.getByRole('button', { name: 'Pozvat člena' }).isVisible());
  tvrdi('M1: členové bez emoji 👤 a bez tří těžkých tlačítek v řádku', !(await nastroj.innerText()).includes('👤') && await nastroj.locator('.btn-primary').count() === 0);
  const poz = await widgetLi(p, 'tym.pozvanky').innerText();
  tvrdi('M1: Pozvánky ukazují kód a dvě čekající', poz.includes('K69B2X') && /2 čekající/.test(poz), poz.slice(0, 160));
  // Jeden zdroj pravdy: kód a „Kopírovat" jen ve widgetu, karta v nástroji spravuje pozvánky.
  tvrdi('M1: nástroj kód neopakuje (bez druhého K69B2X a Kopírovat), Nový kód a Zrušit ano', !(await nastroj.innerText()).includes('K69B2X')
    && await nastroj.getByRole('button', { name: 'Kopírovat' }).count() === 0 && await nastroj.getByRole('button', { name: 'Nový kód' }).isVisible()
    && await nastroj.getByRole('button', { name: /^Zrušit pozvánku: / }).count() > 0);
  await p.locator('[data-plocha] button[aria-haspopup="menu"][aria-label="Další akce"]:visible').first().click();
  const menuTym = await p.getByRole('menuitem').allInnerTexts();
  tvrdi('M1: kód jde zkopírovat i z „···" (kdyby widget z plochy zmizel)', menuTym.some(t => t.includes('Kopírovat kód K69B2X')), menuTym.join(' | '));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  tvrdi('M1: Chybí sazba = 1 (Jakub; vlastník se nepočítá)', (await widgetLi(p, 'tym.bez_sazby').innerText()).includes('1'));
  const role = await widgetLi(p, 'tym.role').innerText();
  tvrdi('M1: Role v podniku řadí Baristu (4 lidé) a bez tabletu', role.includes('Barista') && role.includes('4 lidé') && !role.includes('Tablet'), role.slice(0, 200));
  await p.screenshot({ path: OUT + 'k69-b2-tym-desk.png', fullPage: true });

  // Sekce Uzávěrka: přepínače jsou SwitchRow z ui (role=switch s popiskem).
  await nastroj.getByRole('tab', { name: 'Uzávěrka' }).click();
  const prepinace = nastroj.getByRole('switch');
  tvrdi('M1: sekce Uzávěrka má tři přepínače se jménem', await dokud(async () => (await prepinace.count()) === 3, 2000) && !!(await prepinace.first().getAttribute('aria-labelledby')));
  await prepinace.first().click();
  tvrdi('M1: přepnutí uloží hned (PATCH /api/teams)', await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'PATCH' && z.path === '/api/teams'), 2000));
  await nastroj.getByRole('tab', { name: 'Lidé' }).click();

  // Profil z „···" u člena → okno profilu (Modal), ne ručně psané.
  await nastroj.getByRole('button', { name: 'Další akce: Eva Testová' }).click();
  await p.getByRole('menuitem', { name: 'Profil' }).click();
  const profil = p.getByRole('dialog').filter({ hasText: 'Zkušená' });
  tvrdi('M1: Profil otevře okno s odpracovanými hodinami (42 h)', await dokud(() => profil.isVisible(), 3000) && (await profil.innerText()).includes('42 h'));
  await profil.getByRole('button', { name: 'Zavřít' }).click();

  // 7) Rozepsané hledání přežije úpravy.
  const hledani = nastroj.getByLabel('Hledat člena týmu');
  await hledani.fill('Petra');
  await upravit(p).click();
  tvrdi('M2: vstup do úprav', await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + 'k69-b2-tym-desk-upravy.png', fullPage: true });
  tvrdi('M2: nástroj je sbalený do zástupce bez „−"', await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible() && await nastroj.locator('[data-odznak]').count() === 0);
  await nastroj.focus();
  await p.keyboard.press('Home');
  tvrdi('M2: nástroj jde přesunout nahoru', await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi('M2: …PUT s nástrojem nahoře', poradiPutu(stav.puty.at(-1))[0] === 'nastroj');
  await p.keyboard.press('End');
  tvrdi('M2: …a zpátky pod widgety', await dokud(async () => (await poradi(p)).at(-1) === 'nastroj', 1500));
  const g = await doporucene(p);
  for (const nazev of ['Tým', 'Právě na směně']) tvrdi(`M3: galerie nabízí „${nazev}" v Doporučených`, g.dop.includes(nazev), g.dop.slice(0, 300));
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('M7: rozepsané hledání „Petra" přežilo úpravy', await hledani.inputValue() === 'Petra');
  tvrdi('M: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Pozvat: Modal místo formuláře na stránce; zrušení pozvánky přes Modal.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_TYM, dalsi: podvrh() });
  await otevri(p, TYM, 'vedeni.tym');
  await p.getByRole('button', { name: 'Pozvat člena' }).click();
  const okno = p.getByRole('dialog', { name: 'Pozvat člena' });
  tvrdi('P1: „Pozvat člena" otevře okno s e-mailem a pozicí', await dokud(() => okno.isVisible(), 2000) && await okno.getByLabel('E-mail').isVisible() && await okno.getByLabel('Pozice (nepovinné)').isVisible());
  await okno.getByLabel('E-mail').fill('novy@example.cz');
  await okno.getByRole('button', { name: 'Odeslat pozvánku' }).click();
  tvrdi('P1: odešle POST /api/invitations', await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'POST' && z.path === '/api/invitations'), 2000));
  // Podvrh nevrací token (server poslal e-mail sám): okno se zavře a řekne to Toastem.
  tvrdi('P1: bez odkazu k přeposlání se okno zavře s hláškou', await dokud(async () => !(await okno.isVisible()), 2000)
    && await dokud(() => p.getByText('Pozvánka odešla na novy@example.cz.').isVisible(), 2000));
  await widgetLi(p, 'nastroj').getByRole('button', { name: 'Zrušit pozvánku: brigadnik@example.cz' }).click();
  const zrusit = p.getByRole('dialog', { name: 'Zrušit pozvánku?' });
  tvrdi('P2: zrušení pozvánky potvrzuje Modal (ne confirm())', await dokud(() => zrusit.isVisible(), 2000));
  await zrusit.getByRole('button', { name: 'Zrušit pozvánku' }).click();
  tvrdi('P2: …a pošle DELETE /api/invitations?id=72', await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'DELETE' && z.path === '/api/invitations'), 2000)
    && dotazyNa(stav, ['/api/invitations']).some(d => d.m === 'DELETE' && d.u.includes('id=72')));
  await ctx.close();
}

// 4) Oprávnění: Provozní (tym.zobrazit + profil, bez tym.pozvat a finance.mzdy).
{
  const { ctx, p, stav } = await kontext({ fix: FIX_TYM, mineData: roleMine('provozni'), dalsi: podvrh() });
  await otevri(p, TYM, 'vedeni.tym');
  await p.waitForTimeout(600);
  for (const w of ['tym.pozvanky', 'tym.bez_sazby']) tvrdi(`MO1: Provozní nevidí ${w}`, await naPlose(p, w) === 0);
  tvrdi('MO1: …a na /api/invitations neodešel dotaz', dotazyNa(stav, ['/api/invitations']).length === 0);
  tvrdi('MO1: bez „Pozvat člena" a bez „Upravit" u lidí', await p.getByRole('button', { name: 'Pozvat člena' }).count() === 0 && await widgetLi(p, 'nastroj').getByRole('button', { name: /^Upravit: / }).count() === 0);
  tvrdi('MO1: Role v podniku vidí (tym.zobrazit)', await naPlose(p, 'tym.role') === 1);
  await ctx.close();
}

// 5) 500 na /api/roles → chyba jen v Rolích; 6) telefon 390.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_TYM, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  stav.chyby['/api/roles'] = 500;
  await otevri(p, TYM, 'vedeni.tym');
  await p.waitForTimeout(800);
  tvrdi('ME1: Role v podniku ukážou „Widget se nenačetl"', await widgetLi(p, 'tym.role').getByText('Widget se nenačetl').isVisible());
  tvrdi('ME1: jen ony — Pozvánky a lidé žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'nastroj').innerText()).includes('Eva Testová'));
  tvrdi('MT1: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const pozvat = p.getByRole('button', { name: 'Pozvat člena' });
  tvrdi('MT1: „Pozvat člena" je vidět a povolená', await pozvat.isVisible() && await pozvat.isEnabled());
  await p.screenshot({ path: OUT + 'k69-b2-tym-tel.png', fullPage: true });
  await pozvat.click();
  tvrdi('MT1: …a otevře okno', await dokud(() => p.getByRole('dialog', { name: 'Pozvat člena' }).isVisible(), 2000));
  await ctx.close();
}

await konec();
