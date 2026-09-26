// Kolo 69, balík B6b — Postupy a Návody jako plocha s widgety (spec §7.4).
//
// Pro obě stránky vedení: jeden h1 jako první, nástroj v klidu vidět, v úpravách
// sbalený bez „−" a přesunutelný nad widget i pod něj (PUT), galerie nabízí
// widgety balíku v „Doporučené", role bez klíče widget nevidí a jeho endpoint
// se nevolá, 500 na jednom endpointu shodí jen jeden widget, telefon 390 bez
// přetečení s použitelnou hlavní akcí a rozepsané hledání v nástroji přežije
// úpravy. Pro stránky zaměstnance: plocha, widgety a hlavní akce.
// Navíc to, co balík opravoval: widget otevře detail postupu / čtečku návodu
// v nástroji bez přechodu jinam, smazání jde přes okno (ne confirm()), povinné
// postupy dnes párují běh podle ID a „Potvrzuji přečtení" pošle markRead.
//
// Fixtury: scripts/sondy/fixtury/k69-b6b-*.json.
import { readFileSync } from 'node:fs';
import {
  kontext, konec, tvrdi, otevri, lista, upravit, hotovo, vUpravach, dokud, poradi, poradiPutu, dotazyNa, roleMine, DIR, OUT, BASE,
} from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const FIX_POSTUPY = nacti('k69-b6b-rozlozeni-postupy');
const FIX_POSTUPY_ZAM = nacti('k69-b6b-rozlozeni-postupy-zam');
const FIX_NAVODY = nacti('k69-b6b-rozlozeni-navody');
const FIX_NAVODY_ZAM = nacti('k69-b6b-rozlozeni-navody-zam');
const dnes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
const behy = () => JSON.parse(readFileSync(DIR + 'k69-b6b-runs.json', 'utf8').replaceAll('DNES', dnes));

/** Podvrh API postupů a návodů; `stav.chyby[cesta]` = kód chyby, `stav.chybaDnes` = 500 jen na ?today=team. */
const podvrh = () => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (stav.chyby[path]) return json({ error: 'Server spadl' }, stav.chyby[path]);
  if (path === '/api/procedures/runs') {
    if (m === 'POST') { stav.spusteno = req.postDataJSON(); return json({ active: { id: 99, procedureId: stav.spusteno.procedureId, name: 'Otevírací rutina', items: ['Zapnout kávovar', 'Zkontrolovat mléko'], checkedItems: [], skippedItems: [], totalItems: 2, startedAt: new Date().toISOString(), status: 'running' } }); }
    if (m !== 'GET') return json({ ok: true });
    if (url.searchParams.get('active')) return json({ active: null });
    if (url.searchParams.get('today') === 'team') {
      if (stav.chybaDnes) return json({ error: 'Dnešní postupy se nepodařilo načíst.' }, 500);
      return json({ runs: behy().runs.filter(r => r.procedure_id === 2) });
    }
    return json(behy());
  }
  if (path === '/api/procedures' && m === 'GET') return json(nacti('k69-b6b-procedures'));
  if (path === '/api/procedures' && m === 'POST') {
    const t = req.postDataJSON();
    stav.navrh = t;
    return json({ procedure: { id: 77, name: t.name, description: null, icon: t.icon ?? 'check', color: null, items: t.items ?? [], remindAt: null, remindDays: [], remindAnchor: 'time', requireBeforeClosing: false, approved: false, submittedBy: 5 } });
  }
  if (/^\/api\/procedures\/\d+$/.test(path)) { (stav.zapisyPostupu ??= []).push({ m, path, telo: req.postData() }); return json({ ok: true, procedure: nacti('k69-b6b-procedures').procedures[0] }); }
  if (path === '/api/guides' && m === 'GET') return json(nacti('k69-b6b-guides'));
  if (path === '/api/guides/ctenari') return json(nacti('k69-b6b-ctenari'));
  if (path === '/api/guides/categories') return json(nacti('guides_categories'));
  if (/^\/api\/guides\/\d+$/.test(path)) {
    if (m === 'GET') return json(nacti('k69-b6b-guide-1'));
    (stav.zapisyNavodu ??= []).push({ m, path, telo: req.postData() });
    return json({ ok: true });
  }
  if (/^\/api\/guides\/\d+\/reads$/.test(path)) return json(nacti('guides_1_reads'));
  if (path === '/api/organization/podniky' || path === '/api/organization') return json({ podniky: [] });
  return undefined;
};

const POSTUPY = '/employer/overview?view=procedures';
const NAVODY = '/employer/overview?view=guides';
const POSTUPY_ZAM = '/employee/shifts?view=procedures';
const NAVODY_ZAM = '/employee/shifts?view=guides';
const naPlose = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`).count();
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
// Linky mezi KLIKACÍMI řádky: každý <li> v .list, který obsahuje button.list-row a není první,
// musí mít border-top (obal <li className="contents"> ji nevykreslí — DP §3.6).
const linkyKlikacich = (loc) => loc.evaluate(el => {
  const li = [...el.querySelectorAll('ul.list > li')].filter(x => x.querySelector(':scope button.list-row') && x.previousElementSibling);
  return { pocet: li.length, bez: li.filter(x => parseFloat(getComputedStyle(x).borderTopWidth) === 0 || getComputedStyle(x).display === 'contents').map(x => x.textContent?.slice(0, 30)) };
});
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const limetek = (p) => p.locator('[data-plocha] button.on-accent:visible, [data-plocha] .btn-accent:visible, [data-plocha] button[class*="bg-[#C8F542]"]:visible').count();
const h1 = (p) => p.evaluate(() => {
  const vid = [...document.querySelectorAll('h1')].filter(h => h.offsetParent !== null);
  const prvni = document.querySelector('[data-plocha]')?.querySelector('h1, h2, h3');
  return { pocet: vid.length, prvniJeH1: prvni?.tagName === 'H1', text: vid[0]?.textContent?.trim() };
});
const doporucene = (galerie) => galerie.evaluate(el => {
  const h = [...el.querySelectorAll('h4')].find(x => x.textContent?.includes('Doporučené'));
  return h?.parentElement?.innerText ?? '';
});
async function galerieDoporucene(p) {
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(500);
  return doporucene(galerie);
}
/** 2) Nástroj v úpravách sbalený bez „−", přesun nahoru (PUT) a zpátky pod widget. */
async function nastrojVUpravach(p, stav, znacka, vidget) {
  const nastroj = widgetLi(p, 'nastroj');
  await upravit(p).click();
  tvrdi(`${znacka}2: vstup do úprav`, await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  tvrdi(`${znacka}2: nástroj je v úpravách sbalený do zástupce bez „−"`, await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible()
    && await nastroj.locator('[data-odznak]').count() === 0);
  tvrdi(`${znacka}2: widgety „−" mají`, await widgetLi(p, vidget).locator('[data-odznak]').count() === 1);
  await nastroj.focus();
  await p.keyboard.press('Home');
  tvrdi(`${znacka}2: nástroj jde přesunout nad všechny widgety`, await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi(`${znacka}2: …a odejde PUT s nástrojem nahoře`, poradiPutu(stav.puty.at(-1))[0] === 'nastroj', JSON.stringify(poradiPutu(stav.puty.at(-1))));
  await p.keyboard.press('ArrowDown');
  tvrdi(`${znacka}2: …a zpátky pod widget`, await dokud(async () => (await poradi(p))[1] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
}

// ---------------------------------------------------------------------------
// Postupy (vedení)
// ---------------------------------------------------------------------------

{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_POSTUPY, dalsi: podvrh() });
  await otevri(p, POSTUPY, 'vedeni.postupy');
  const h = await h1(p);
  tvrdi('P1: právě jeden viditelný h1 „Postupy" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Postupy', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  const tNastroj = await nastroj.innerText();
  tvrdi('P1: nástroj v klidu vidět — seznam postupů se „Spustit" a návrhem „Čeká na schválení"', tNastroj.includes('Otevírací rutina') && tNastroj.includes('Čeká na schválení')
    && await nastroj.getByRole('button', { name: 'Spustit' }).first().isVisible(), tNastroj.slice(0, 200));
  // Časy v DB jsou UTC (07:40 UTC = 9:40 v Praze), proto jen minuty.
  tvrdi('P1: v řádku je poslední dokončení podle ID postupu („naposledy dnes …:40")', /naposledy dnes \d{1,2}:40/.test(tNastroj), tNastroj.slice(0, 300));
  tvrdi('P1: jediná limetka stránky je „Nový postup"', await limetek(p) === 1 && await p.locator('[data-plocha]').getByRole('button', { name: 'Nový postup' }).isVisible(), `${await limetek(p)}×`);
  const pov = await widgetLi(p, 'postupy.povinne_dnes').innerText();
  tvrdi('P1: Povinné postupy dnes — Kontrola lednic čeká (nahoře), Zavírání hotové (Jana), návrh se nepočítá',
    pov.indexOf('Kontrola lednic') >= 0 && pov.indexOf('Kontrola lednic') < pov.indexOf('Zavírání') && pov.includes('Hotovo') && pov.includes('Jana') && !pov.includes('Příjem zboží'), pov.replace(/\n/g, ' | '));
  const prub = await widgetLi(p, 'postupy.posledni_prubehy').innerText();
  tvrdi('P1: Poslední průběhy — Zavírání s „1 nedokončeno" a délkou 20:00', prub.includes('Zavírání') && prub.includes('1 nedokončeno') && prub.includes('20:00'), prub.replace(/\n/g, ' | '));
  const lPrub = await linkyKlikacich(widgetLi(p, 'postupy.posledni_prubehy'));
  tvrdi('P1: klikací řádky Posledních průběhů mají mezi sebou linku (vlastní <li>, ne display:contents)', lPrub.pocet >= 1 && lPrub.bez.length === 0, JSON.stringify(lPrub));
  // Řádek s akcemi: detail otevře celý řádek (ne jen ~20 px vysoký název), „Spustit" zůstává nad ním.
  const radekOR = nastroj.locator('ul.list > li').filter({ hasText: 'Otevírací rutina' }).first();
  const trefa = await radekOR.evaluate(li => {
    const r = li.getBoundingClientRect();
    const meta = li.querySelector('.text-\\[13px\\]') ?? li;
    const m = meta.getBoundingClientRect();
    const nahore = document.elementFromPoint(m.left + 4, m.top + m.height / 2);
    const sp = [...li.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Spustit');
    const s = sp?.getBoundingClientRect();
    const naSpustit = s ? document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2) : null;
    return { vyska: r.height, meta: !!nahore?.closest('button') && nahore.closest('button')?.textContent?.includes('Otevírací rutina'), spustit: !!naSpustit && !!sp?.contains(naSpustit) };
  });
  tvrdi('P1: klepnutí na meta řádku trefí tlačítko detailu (cíl = řádek ≥ 44 px)', trefa.meta && trefa.vyska >= 44, JSON.stringify(trefa));
  tvrdi('P1: …a „Spustit" v řádku zůstává klikací nad ním', trefa.spustit, JSON.stringify(trefa));
  tvrdi('P1: nad seznamem už není ApproveAllBar ani mřížka karet s inkoustovým „Spustit"', await nastroj.locator('.bg-\\[\\#16181A\\]').count() === 0);
  await p.screenshot({ path: OUT + 'k69-b6b-postupy-desk.png', fullPage: true });

  // Widget → nástroj: návrh ve widgetu otevře detail postupu (bez přechodu jinam).
  await widgetLi(p, 'postupy.navrhy').locator('button.list-row').first().click();
  const detail = p.getByRole('dialog', { name: 'Příjem zboží (návrh)' });
  tvrdi('P-W: řádek návrhu ve widgetu otevře detail postupu v okně', await dokud(() => detail.isVisible(), 2000));
  tvrdi('P-W: …s „Schválit" (návrh se spustit nedá)', await detail.getByRole('button', { name: 'Schválit' }).isVisible() && await detail.getByRole('button', { name: 'Spustit postup' }).count() === 0);
  await detail.getByRole('button', { name: 'Schválit' }).click();
  tvrdi('P-W: „Schválit" pošle PATCH /api/procedures/4 { approve: true }', await dokud(() => (stav.zapisyPostupu ?? []).some(z => z.m === 'PATCH' && z.path === '/api/procedures/4' && z.telo?.includes('approve')), 2000));
  await p.keyboard.press('Escape');
  await dokud(async () => !(await detail.isVisible()), 1500);

  // Průběh ve widgetu → detail průběhu (okno, ne emoji).
  await widgetLi(p, 'postupy.posledni_prubehy').locator('button.list-row').first().click();
  const dPrub = p.getByRole('dialog', { name: 'Zavírání' });
  tvrdi('P-W: průběh ve widgetu otevře detail s důvodem přeskočení', await dokud(() => dPrub.isVisible(), 2000) && (await dPrub.innerText()).includes('Nestíhal/a jsem'));
  tvrdi('P-W: …bez emoji ✅ ⏭️ ❌', !/[✅⏭❌]/u.test(await dPrub.innerText()));
  await p.keyboard.press('Escape');

  // Smazání přes „···" → okno (ne confirm()).
  let dialogConfirm = false;
  p.on('dialog', d => { dialogConfirm = true; d.dismiss().catch(() => {}); });
  await nastroj.getByRole('button', { name: 'Další akce s postupem Otevírací rutina' }).click();
  await p.getByRole('menuitem', { name: 'Smazat' }).click();
  const smazat = p.getByRole('dialog', { name: 'Smazat postup?' });
  tvrdi('P-D: Smazat z „···" otevře okno (ne confirm())', await dokud(() => smazat.isVisible(), 1500) && !dialogConfirm);
  await smazat.getByRole('button', { name: 'Zrušit' }).click();

  await nastrojVUpravach(p, stav, 'P', 'postupy.povinne_dnes');
  await p.screenshot({ path: OUT + 'k69-b6b-postupy-desk-upravy.png', fullPage: true });
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('P: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 3) Galerie Postupů: Přeskočené kroky, Připomínky a Spustit postup v Doporučených.
{
  const { ctx, p } = await kontext({ fix: FIX_POSTUPY, dalsi: podvrh() });
  await otevri(p, POSTUPY, 'vedeni.postupy');
  const dop = await galerieDoporucene(p);
  tvrdi('P3: galerie nabízí Přeskočené kroky, Připomínky dnes a Spustit postup', ['Přeskočené kroky', 'Připomínky dnes', 'Spustit postup'].every(t => dop.includes(t)), dop.slice(0, 300));
  await ctx.close();
}

// 4) Oprávnění: Skladník (bez průběhů týmu, uzávěrky, schvalování a úprav).
{
  const { ctx, p, stav } = await kontext({ fix: FIX_POSTUPY, mineData: roleMine('skladnik'), dalsi: podvrh() });
  await otevri(p, POSTUPY, 'vedeni.postupy');
  await p.waitForTimeout(700);
  tvrdi('P4: Skladník nevidí Povinné dnes a na ?today=team neodešel dotaz', await naPlose(p, 'postupy.povinne_dnes') === 0
    && !stav.dotazy.some(d => d.path === '/api/procedures/runs' && d.u.includes('today=team')));
  tvrdi('P4: …ani Návrhy postupů', await naPlose(p, 'postupy.navrhy') === 0);
  tvrdi('P4: Poslední průběhy vidí jako „Moje průběhy"', await naPlose(p, 'postupy.posledni_prubehy') === 1 && (await widgetLi(p, 'postupy.posledni_prubehy').innerText()).includes('Moje průběhy'));
  tvrdi('P4: bez „Nový postup" a v „···" jen Zobrazit kroky', await p.getByRole('button', { name: 'Nový postup' }).count() === 0 && await dokud(async () => {
    await widgetLi(p, 'nastroj').getByRole('button', { name: /Další akce s postupem/ }).first().click();
    const n = await p.getByRole('menuitem').allInnerTexts();
    await p.keyboard.press('Escape');
    return n.length === 1 && n[0].includes('Zobrazit kroky');
  }, 1500));
  await ctx.close();
}

// 5) 500 na dnešní průběhy → chyba jen v Povinných dnes.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_POSTUPY, dalsi: podvrh() });
  stav.chybaDnes = true;
  await otevri(p, POSTUPY, 'vedeni.postupy');
  await p.waitForTimeout(900);
  const pov = widgetLi(p, 'postupy.povinne_dnes');
  tvrdi('P5: Povinné dnes ukáže „Widget se nenačetl" se „Zkusit znovu"', await pov.getByText('Widget se nenačetl').isVisible() && await pov.getByRole('button', { name: 'Zkusit znovu' }).isVisible());
  tvrdi('P5: jen on — průběhy, návrhy i nástroj žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'postupy.posledni_prubehy').innerText()).includes('Zavírání') && (await widgetLi(p, 'nastroj').innerText()).includes('Otevírací rutina'));
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, „Spustit" vidět a spustí postup.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_POSTUPY, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, POSTUPY, 'vedeni.postupy');
  tvrdi('P6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const spustit = widgetLi(p, 'nastroj').getByRole('button', { name: 'Spustit' }).first();
  await spustit.scrollIntoViewIfNeeded();
  tvrdi('P6: „Spustit" je vidět a povolené', await spustit.isVisible() && await spustit.isEnabled());
  await p.screenshot({ path: OUT + 'k69-b6b-postupy-tel.png', fullPage: true });
  await spustit.click();
  tvrdi('P6: …pošle POST /api/procedures/runs s postupem 1', await dokud(() => stav.spusteno?.procedureId === 1, 2000), JSON.stringify(stav.spusteno));
  tvrdi('P6: běžec se otevře a nepřetéká', await dokud(() => p.getByRole('button', { name: 'Dokončit' }).isVisible(), 2000) && await bezPreteceni(p));
  await ctx.close();
}

// Zaměstnanec: plocha Postupů (barista).
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: FIX_POSTUPY_ZAM, mineData: roleMine('barista'), dalsi: podvrh() });
  await otevri(p, POSTUPY_ZAM, 'zamestnanec.postupy');
  const h = await h1(p);
  tvrdi('PZ1: zaměstnanec — jeden h1 „Postupy", nástroj se „Spustit"', h.pocet === 1 && h.text === 'Postupy' && await widgetLi(p, 'nastroj').getByRole('button', { name: 'Spustit' }).first().isVisible(), JSON.stringify(h));
  const prip = await widgetLi(p, 'postupy.pripominky').innerText();
  tvrdi('PZ1: Připomínky dnes — při otevření 7:30 a Kontrola lednic ve 14:00', prip.includes('07:30') && prip.includes('Při otevření') && prip.includes('14:00'), prip.replace(/\n/g, ' | '));
  tvrdi('PZ1: barista nevidí návrh postupu (API ho nevrací jen schvalovateli; v UI žádné „Schválit")', await p.getByRole('button', { name: 'Schválit' }).count() === 0);
  tvrdi('PZ1: barista (postupy.navrhnout bez vytvorit) má „Navrhnout postup", ne „Nový postup"', await p.getByRole('button', { name: 'Navrhnout postup' }).isVisible()
    && await p.getByRole('button', { name: 'Nový postup' }).count() === 0);
  await p.screenshot({ path: OUT + 'k69-b6b-postupy-zam-desk.png', fullPage: true });
  // Návrh baristy API autorovi nevrátí — po odeslání musí zůstat potvrzení, jinak ho pošle znovu.
  await p.getByRole('button', { name: 'Navrhnout postup' }).click();
  const ed = p.getByRole('dialog', { name: 'Navrhnout postup' });
  await dokud(() => ed.isVisible(), 2000);
  await ed.getByLabel('Název').fill('Sonda návrh');
  await ed.getByLabel('Krok 1', { exact: true }).fill('Otřít pult');
  await ed.getByRole('button', { name: 'Odeslat návrh' }).click();
  tvrdi('PZ2: „Odeslat návrh" pošle POST /api/procedures', await dokud(() => stav.navrh?.name === 'Sonda návrh', 2000), JSON.stringify(stav.navrh));
  await dokud(async () => !(await ed.isVisible()), 2000);
  await p.waitForTimeout(600);
  tvrdi('PZ2: po zavření okna zůstane potvrzení „Návrh … odeslán — schválí ho vedení"', await widgetLi(p, 'nastroj').getByRole('status').filter({ hasText: 'Sonda návrh' }).isVisible()
    && (await widgetLi(p, 'nastroj').innerText()).includes('schválí ho vedení'));
  tvrdi('PZ: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Návody (vedení)
// ---------------------------------------------------------------------------

{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_NAVODY, dalsi: podvrh() });
  await otevri(p, NAVODY, 'vedeni.navody');
  const h = await h1(p);
  tvrdi('N1: právě jeden viditelný h1 „Návody" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Návody', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('N1: nástroj v klidu vidět — hledání, kategorie a seznam', await nastroj.getByLabel('Hledat návody').isVisible()
    && await nastroj.getByRole('group', { name: 'Kategorie návodů' }).isVisible() && (await nastroj.innerText()).includes('Jak se dělá flat white'));
  tvrdi('N1: jediná limetka stránky je „Nový návod"', await limetek(p) === 1, `${await limetek(p)}×`);
  const kdo = await widgetLi(p, 'navody.kdo_necetl').innerText();
  tvrdi('N1: Kdo nečetl — flat white 4 z 6 nahoře, mlýnek „Všichni"', kdo.indexOf('flat white') >= 0 && kdo.indexOf('flat white') < kdo.indexOf('mlýnku') && kdo.includes('4 z 6') && kdo.includes('Všichni'), kdo.replace(/\n/g, ' | '));
  const lKdo = await linkyKlikacich(widgetLi(p, 'navody.kdo_necetl'));
  tvrdi('N1: klikací řádky „Kdo nečetl" mají mezi sebou linku', lKdo.pocet >= 1 && lKdo.bez.length === 0, JSON.stringify(lKdo));
  tvrdi('N1: Návrhy návodů — matcha tonic a „Schválit"', (await widgetLi(p, 'navody.navrhy').innerText()).includes('matcha') && await widgetLi(p, 'navody.navrhy').getByRole('button', { name: 'Schválit' }).isVisible());
  tvrdi('N1: vybraná kategorie je inkoustová pilulka (seg-on), ne limetka', await nastroj.locator('.filter-pill.seg-on').count() === 1);
  await p.screenshot({ path: OUT + 'k69-b6b-navody-desk.png', fullPage: true });

  // Widget → nástroj: řádek „Kdo nečetl" otevře čtečku (bez přechodu jinam).
  await widgetLi(p, 'navody.kdo_necetl').locator('button.list-row').first().click();
  const ctecka = p.getByRole('dialog', { name: 'Jak se dělá flat white' });
  tvrdi('N-W: řádek „Kdo nečetl" otevře čtečku návodu v okně', await dokud(() => ctecka.isVisible(), 2500));
  tvrdi('N-W: …s obsahem a checklistem, akce v „···"', await dokud(async () => (await ctecka.innerText()).includes('Namlít kávu'), 2000) && await ctecka.getByRole('button', { name: 'Akce s návodem' }).isVisible());
  await ctecka.getByRole('button', { name: 'Akce s návodem' }).click();
  await p.getByRole('menuitem', { name: 'Připnout k uzávěrce' }).click();
  tvrdi('N-W: „Připnout k uzávěrce" z „···" pošle PATCH { forClosing: true }', await dokud(() => (stav.zapisyNavodu ?? []).some(z => z.m === 'PATCH' && z.telo?.includes('"forClosing":true')), 2000));
  await p.keyboard.press('Escape');
  await dokud(async () => !(await ctecka.isVisible()), 1500);

  // Schválit ve widgetu → PATCH approve.
  await widgetLi(p, 'navody.navrhy').getByRole('button', { name: 'Schválit' }).click();
  tvrdi('N-W: „Schválit" ve widgetu pošle PATCH /api/guides/4 { approve: true }', await dokud(() => (stav.zapisyNavodu ?? []).some(z => z.path === '/api/guides/4' && z.telo?.includes('approve')), 2000));

  // 7) Rozepsané hledání přežije úpravy.
  await nastroj.getByLabel('Hledat návody').fill('mlýn');
  tvrdi('N7: hledání zúží seznam na „Čištění mlýnku"', await dokud(async () => { const t = await nastroj.innerText(); return t.includes('Čištění mlýnku') && !t.includes('flat white'); }, 1500));
  await nastrojVUpravach(p, stav, 'N', 'navody.navrhy');
  await p.screenshot({ path: OUT + 'k69-b6b-navody-desk-upravy.png', fullPage: true });
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('N7: rozepsané hledání přežilo úpravy („mlýn")', await nastroj.getByLabel('Hledat návody').inputValue() === 'mlýn');
  tvrdi('N: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 3) Galerie Návodů: Nově upravené a Návod k uzávěrce v Doporučených.
{
  const { ctx, p } = await kontext({ fix: FIX_NAVODY, dalsi: podvrh() });
  await otevri(p, NAVODY, 'vedeni.navody');
  const dop = await galerieDoporucene(p);
  tvrdi('N3: galerie nabízí Nově upravené návody, Povinné čtení a Návod k uzávěrce', ['Nově upravené návody', 'Povinné čtení', 'Návod k uzávěrce'].every(t => dop.includes(t)), dop.slice(0, 300));
  await ctx.close();
}

// 4) Oprávnění: Skladník (bez povinného čtení a schvalování).
{
  const { ctx, p, stav } = await kontext({ fix: FIX_NAVODY, mineData: roleMine('skladnik'), dalsi: podvrh() });
  await otevri(p, NAVODY, 'vedeni.navody');
  await p.waitForTimeout(700);
  tvrdi('N4: Skladník nevidí Kdo nečetl a na /api/guides/ctenari neodešel dotaz', await naPlose(p, 'navody.kdo_necetl') === 0 && dotazyNa(stav, ['/api/guides/ctenari']).length === 0);
  tvrdi('N4: …ani Návrhy návodů', await naPlose(p, 'navody.navrhy') === 0);
  tvrdi('N4: bez „Nový návod" a bez „···" v řádcích (nesmí upravovat ani mazat)', await p.getByRole('button', { name: 'Nový návod' }).count() === 0
    && await widgetLi(p, 'nastroj').getByRole('button', { name: /Další akce s návodem/ }).count() === 0);
  await ctx.close();
}

// 5) 500 na čtenáře → chyba jen v „Kdo nečetl".
{
  const { ctx, p, stav } = await kontext({ fix: FIX_NAVODY, dalsi: podvrh() });
  stav.chyby['/api/guides/ctenari'] = 500;
  await otevri(p, NAVODY, 'vedeni.navody');
  await p.waitForTimeout(900);
  const kdo = widgetLi(p, 'navody.kdo_necetl');
  tvrdi('N5: Kdo nečetl ukáže „Widget se nenačetl" se „Zkusit znovu"', await kdo.getByText('Widget se nenačetl').isVisible() && await kdo.getByRole('button', { name: 'Zkusit znovu' }).isVisible());
  tvrdi('N5: jen on — návrhy i knihovna žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'navody.navrhy').innerText()).includes('matcha') && (await widgetLi(p, 'nastroj').innerText()).includes('flat white'));
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, hledání a „Nový návod" použitelné.
{
  const { ctx, p } = await kontext({ fix: FIX_NAVODY, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, NAVODY, 'vedeni.navody');
  tvrdi('N6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const novy = p.locator('[data-plocha]').getByRole('button', { name: 'Nový návod' });
  tvrdi('N6: „Nový návod" vidět a povolené', await novy.isVisible() && await novy.isEnabled());
  const hledat = widgetLi(p, 'nastroj').getByLabel('Hledat návody');
  await hledat.scrollIntoViewIfNeeded();
  await hledat.fill('cisteni');
  tvrdi('N6: hledání bez diakritiky najde „Čištění mlýnku"', await dokud(async () => (await widgetLi(p, 'nastroj').innerText()).includes('Čištění mlýnku'), 1500));
  await p.screenshot({ path: OUT + 'k69-b6b-navody-tel.png', fullPage: true });
  await novy.scrollIntoViewIfNeeded();
  await novy.click();
  const editor = p.getByRole('dialog', { name: 'Nový návod' });
  tvrdi('N6: editor návodu se otevře jako okno a nepřetéká', await dokud(() => editor.isVisible(), 2000) && await bezPreteceni(p));
  await ctx.close();
}

// Zaměstnanec: plocha Návodů (barista) — povinné čtení → čtečka → potvrzení.
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: FIX_NAVODY_ZAM, mineData: roleMine('barista'), dalsi: podvrh() });
  await otevri(p, NAVODY_ZAM, 'zamestnanec.navody');
  const h = await h1(p);
  tvrdi('NZ1: zaměstnanec — jeden h1 „Návody", nástroj s hledáním', h.pocet === 1 && h.text === 'Návody' && await widgetLi(p, 'nastroj').getByLabel('Hledat návody').isVisible(), JSON.stringify(h));
  const lSez = await linkyKlikacich(widgetLi(p, 'nastroj'));
  tvrdi('NZ1: seznam návodů zaměstnance (celé řádky klikací) má linky mezi řádky', lSez.pocet >= 1 && lSez.bez.length === 0, JSON.stringify(lSez));
  const pov = await widgetLi(p, 'navody.povinne_cteni').innerText();
  tvrdi('NZ1: Povinné čtení — flat white (nepřečtený), mlýnek ne (přečtený)', pov.includes('flat white') && !pov.includes('mlýnku'), pov.replace(/\n/g, ' | '));
  await widgetLi(p, 'navody.povinne_cteni').locator('button.list-row').first().click();
  const ctecka = p.getByRole('dialog', { name: 'Jak se dělá flat white' });
  tvrdi('NZ1: řádek otevře čtečku', await dokud(() => ctecka.isVisible(), 2500));
  await dokud(() => ctecka.getByRole('button', { name: 'Potvrzuji přečtení' }).isVisible(), 2000);
  await ctecka.getByRole('button', { name: 'Potvrzuji přečtení' }).click();
  tvrdi('NZ1: „Potvrzuji přečtení" pošle POST { markRead: true }', await dokud(() => (stav.zapisyNavodu ?? []).some(z => z.m === 'POST' && z.telo?.includes('markRead')), 2000));
  await p.screenshot({ path: OUT + 'k69-b6b-navody-zam-desk.png', fullPage: true });
  tvrdi('NZ: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
void BASE;
