// Kolo 69, balík B7 — Odměny (vedení i zaměstnanec) jako plocha s widgety (spec §7.4).
//
// Pro obě stránky: jeden h1 jako první, nástroj v klidu vidět, v úpravách sbalený
// bez „−" a přesunutelný nad widget i pod něj (PUT), galerie nabízí widgety balíku
// v „Doporučené", role bez klíče widget nevidí a jeho endpoint se nevolá, 500 na
// jednom endpointu shodí jen jeden widget, telefon 390 bez přetečení s použitelnou
// hlavní akcí a rozepsané v nástroji přežije úpravy. Navíc to, co balík opravoval:
// žádost o odměnu se schválí z widgetu (PATCH), Nehodnocené směny otevřou kalendář
// na dni, katalog se spravuje v Nastavení (Switch „Nabízet", mazání přes okno),
// zaměstnanec vymění body přes potvrzovací okno (ne confirm()) a „Vyměnit" nesvítí
// na body, které drží čekající žádost.
//
// Fixtury: scripts/sondy/fixtury/k69-b7-*.json; měsíční soupiska hodnocení se skládá
// tady (dny podle dnešního data, ať sonda neztratí platnost s kalendářem).
import { readFileSync } from 'node:fs';
import {
  kontext, konec, tvrdi, otevri, lista, upravit, hotovo, vUpravach, dokud, poradi, poradiPutu, dotazyNa, roleMine, mine, ROLE, DIR, OUT,
} from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const FIX_VEDENI = nacti('k69-b7-rozlozeni-odmeny');
const FIX_ZAM = nacti('k69-b7-rozlozeni-odmeny-zam');

const dnes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
const posun = (d, o) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + o); return x.toISOString().slice(0, 10); };
// Nejstarší nehodnocený den: 1. v měsíci, ledaže je dnes 1. (pak dnešek).
const prvni = `${dnes.slice(0, 7)}-01`;
const zitra = posun(dnes, 1);
const mesicni = () => ({
  month: dnes.slice(0, 7),
  days: [
    { date: prvni, pending: 2, staff: [{ id: 2, name: 'Eva Testová', avatar: '👩', reviewed: false, rating: 0, flagged: false }, { id: 4, name: 'Tereza Malá', avatar: null, reviewed: false, rating: 0, flagged: false }] },
    ...(dnes !== prvni ? [{ date: dnes, pending: 1, staff: [{ id: 3, name: 'Jakub Horák', avatar: '🧔', reviewed: false, rating: 0, flagged: false }] }] : []),
    // Zítřejší naplánovaná směna: hodnotit nejde, do počtu se nesmí započítat.
    ...(zitra.slice(0, 7) === dnes.slice(0, 7) ? [{ date: zitra, pending: 3, staff: [{ id: 2, name: 'Eva Testová' }, { id: 3, name: 'Jakub Horák' }, { id: 4, name: 'Tereza Malá' }] }] : []),
  ],
});
const cekaCelkem = 2 + (dnes !== prvni ? 1 : 0);

/** Podvrh API odměn; `stav.chyby[cesta]` = kód chyby. */
const podvrh = (zam = false) => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (stav.chyby[path]) return json({ error: 'Server spadl' }, stav.chyby[path]);
  if (path === '/api/rewards/catalog') {
    if (m === 'PATCH') { (stav.patche ??= []).push(req.postDataJSON()); return json({ ok: true }); }
    if (m === 'POST') { (stav.posty ??= []).push(req.postDataJSON()); return json({ redemption: { id: 99 } }); }
    if (m === 'DELETE') { (stav.mazani ??= []).push(url.searchParams.get('id')); return json({ ok: true }); }
    const k = nacti(zam ? 'k69-b7-catalog-zam' : 'k69-b7-catalog');
    // Dlouhá fronta (review B7): žádosti navíc, ať jich čeká víc než pět.
    for (let i = 0; i < (stav.zadostiNavic ?? 0); i++) {
      k.redemptions.push({ id: 100 + i, team_id: 1, employee_id: 4, reward_id: 1, title: `Káva zdarma ${i + 1}`, cost: 10, status: 'pending',
        created_at: `2026-09-18T10:${String(i).padStart(2, '0')}:00Z`, employee_name: 'Tereza Malá', employee_avatar: null });
    }
    return json(k);
  }
  if (path === '/api/rewards') {
    if (m === 'POST') { stav.markSeen = req.postDataJSON(); return json({ ok: true }); }
    return json(nacti(zam ? 'k69-b7-rewards-zam' : 'k69-b7-rewards'));
  }
  if (path === '/api/shift-reviews' && m === 'GET') {
    if (url.searchParams.get('month')) return json(mesicni());
    // Detail pro okno hodnocení (tvar skutečné routy — okno s ním počítá).
    if (url.searchParams.get('employeeId')) {
      return json({ employee: { id: Number(url.searchParams.get('employeeId')), name: 'Eva Testová' }, date: url.searchParams.get('date'), hadShift: true,
        shift: null, coworkers: [], tasks: [], procedures: [], closing: null, review: null, autoPoints: { total: 0, lines: [] } });
    }
    return json({ list: [] });
  }
  if (path === '/api/attendance') return json({ entries: [] });
  return undefined;
};

const VEDENI = '/employer/overview?view=rewards';
const ZAM = '/employee/shifts?view=rewards';
const naPlose = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`).count();
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
// Limetka = Button accent (`on-accent`) nebo `btn-accent` (Hotovo v liště úprav, BulkBar).
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
const cast = (p, nazev) => p.locator('[data-plocha]').getByRole('tab', { name: nazev });

// ---------------------------------------------------------------------------
// Odměny — vedení
// ---------------------------------------------------------------------------

// 1, 2, 7) Hlavička, nástroj, widgety, úpravy, rozepsaná odměna v Nastavení.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_VEDENI, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.odmeny');
  const h = await h1(p);
  tvrdi('V1: právě jeden viditelný h1 „Odměny" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Odměny', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('V1: nástroj v klidu vidět (žebříček s Evou první)', await nastroj.getByRole('heading', { name: 'Žebříček' }).isVisible()
    && (await nastroj.innerText()).indexOf('Eva Testová') < (await nastroj.innerText()).indexOf('Jakub Horák'));
  tvrdi('V1: žebříček bez medailí 🥇🥈🥉, pořadí číslem', !/[🥇🥈🥉]/u.test(await nastroj.innerText()) && (await nastroj.innerText()).includes('1.'));
  tvrdi('V1: přepínač částí je pod hlavičkou (Žebříček / Kalendář / Nastavení)', await cast(p, 'Kalendář').isVisible() && await cast(p, 'Nastavení').isVisible());
  tvrdi('V1: v klidu žádná limetka (hlavička ani žebříček ji nemají)', await limetek(p) === 0, `${await limetek(p)}×`);
  const zadosti = widgetLi(p, 'odmeny.zadosti');
  tvrdi('V1: Žádosti o odměny — Eva a Jakub se Schválit (schválená žádost už ne)', (await zadosti.innerText()).includes('Eva Testová') && (await zadosti.innerText()).includes('Jakub Horák')
    && await zadosti.getByRole('button', { name: /^Schválit:/ }).count() === 2);
  const neh = await widgetLi(p, 'hodnoceni.nehodnocene').innerText();
  tvrdi(`V1: Nehodnocené směny — ${cekaCelkem} (zítřejší naplánovaná se nepočítá)`, neh.includes(String(cekaCelkem)) && !neh.includes(String(cekaCelkem + 3)), neh.replace(/\n/g, ' | '));
  const vyt = await widgetLi(p, 'odmeny.vytky_tymu').innerText();
  tvrdi('V1: Výtky v týmu — 3 celkem, 1 ještě nepotvrzená', vyt.includes('3') && vyt.includes('1 ještě nepotvrzeno'), vyt.replace(/\n/g, ' | '));
  // Review B7: odkaz „Odměny ›" by na téhle stránce vedl sem — widgety ho nekreslí.
  tvrdi('V-R: na stránce Odměny žádný widget nemá odkaz „Odměny"', await p.locator('[data-plocha] li[data-widget]:not([data-widget="nastroj"])').getByRole('button', { name: 'Odměny', exact: true }).count() === 0);
  // Review B7: body v žebříčku v jednom sloupci, i když má někdo chipy výtek a hodnocení.
  const praveHrany = await nastroj.locator('.list-value').evaluateAll(el => el.map(x => Math.round(x.getBoundingClientRect().right)));
  tvrdi('V-R: body v žebříčku leží pod sebou (stejná pravá hrana)', praveHrany.length >= 2 && new Set(praveHrany).size === 1, JSON.stringify(praveHrany));
  await p.screenshot({ path: OUT + 'k69-b7-vedeni-desk.png', fullPage: true });

  // Schválení z widgetu = PATCH { id, action: 'approve' }.
  await zadosti.getByRole('button', { name: 'Schválit: Eva Testová, Káva zdarma na směně' }).click();
  tvrdi('V-W: „Schválit" pošle PATCH { id: 21, action: approve }', await dokud(() => (stav.patche ?? []).some(b => b.id === 21 && b.action === 'approve'), 2000), JSON.stringify(stav.patche));

  // Nehodnocené směny → kalendář hodnocení na nejstarším dni.
  await widgetLi(p, 'hodnoceni.nehodnocene').getByRole('button', { name: 'Otevřít Nehodnocené směny' }).click();
  tvrdi('V-K: klepnutí na Nehodnocené směny přepne nástroj na Kalendář', await dokud(() => nastroj.getByRole('heading', { name: 'Kalendář hodnocení' }).isVisible(), 2000));
  tvrdi('V-K: …a rozbalí nejstarší den s Evou a Terezou k hodnocení', await dokud(async () => (await nastroj.innerText()).includes('Tereza Malá'), 2000)
    && await nastroj.getByRole('button', { name: /Ohodnotit celou směnu/ }).isVisible());
  await p.screenshot({ path: OUT + 'k69-b7-vedeni-kalendar.png', fullPage: true });

  // Nastavení: katalog — Switch „Nabízet" = PATCH manage, mazání přes okno (ne confirm()).
  await cast(p, 'Nastavení').click();
  const nabizet = nastroj.getByRole('switch', { name: 'Nabízet: Káva zdarma na směně' });
  tvrdi('V-N: Nastavení ukáže katalog se Switch „Nabízet"', await dokud(() => nabizet.isVisible(), 2000));
  tvrdi('V-N: cizí odměna z organizace bez přepínače i koše, se správcem', await nastroj.getByRole('switch', { name: /Volný den z organizace/ }).count() === 0
    && await nastroj.getByRole('button', { name: 'Smazat odměnu Volný den z organizace' }).count() === 0
    && (await nastroj.innerText()).includes('spravuje Kavárna Vinohrady'));
  await nabizet.click();
  tvrdi('V-N: vypnutí pošle PATCH { manage, id: 1, active: false }', await dokud(() => (stav.patche ?? []).some(b => b.manage === true && b.id === 1 && b.active === false), 2000));
  let dialog = false;
  p.on('dialog', d => { dialog = true; void d.dismiss(); });
  await nastroj.getByRole('button', { name: 'Smazat odměnu Volný pátek' }).click();
  const okno = p.getByRole('dialog', { name: /Smazat odměnu „Volný pátek"/ });
  tvrdi('V-N: mazání se ptá oknem, ne confirm()', await dokud(() => okno.isVisible(), 1500) && !dialog);
  await okno.getByRole('button', { name: 'Smazat' }).click();
  tvrdi('V-N: …a po potvrzení pošle DELETE ?id=2', await dokud(() => (stav.mazani ?? []).includes('2'), 2000));
  tvrdi('V-N: v Nastavení jediná limetka „Uložit nastavení"', await limetek(p) === 1 && await nastroj.getByRole('button', { name: 'Uložit nastavení' }).isVisible());

  // 7) Rozepsaná odměna přežije vstup do úprav a výstup z nich.
  await nastroj.getByLabel('Název odměny').fill('Pizza pro tým');
  await upravit(p).click();
  tvrdi('V2: vstup do úprav', await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + 'k69-b7-vedeni-upravy.png', fullPage: true });
  tvrdi('V2: nástroj je v úpravách sbalený do zástupce bez „−"', await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible()
    && await nastroj.locator('[data-odznak]').count() === 0);
  tvrdi('V2: widgety „−" mají', await widgetLi(p, 'odmeny.zadosti').locator('[data-odznak]').count() === 1);
  tvrdi('V2: v úpravách jediná limetka „Hotovo" (Uložit nastavení se schová)', await p.locator(LIMETKA).count() === 1, `${await p.locator(LIMETKA).count()}×`);
  await nastroj.focus();
  await p.keyboard.press('Home');
  tvrdi('V2: nástroj jde přesunout nad všechny widgety', await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi('V2: …a odejde PUT s nástrojem nahoře', poradiPutu(stav.puty.at(-1))[0] === 'nastroj', JSON.stringify(poradiPutu(stav.puty.at(-1))));
  await p.keyboard.press('ArrowDown');
  tvrdi('V2: …a zpátky pod widget', await dokud(async () => (await poradi(p))[1] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('V7: rozepsaný název odměny přežil úpravy', await nastroj.getByLabel('Název odměny').inputValue() === 'Pizza pro tým');
  tvrdi('V: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Review B7: fronta delší než pět se neusekne — rozbalí se a „Vybrat vše" bere celou frontu.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_VEDENI, dalsi: podvrh() });
  stav.zadostiNavic = 6;
  await otevri(p, VEDENI, 'vedeni.odmeny');
  const zadosti = widgetLi(p, 'odmeny.zadosti');
  await dokud(async () => (await zadosti.getByRole('button', { name: /^Schválit:/ }).count()) > 0, 3000);
  tvrdi('V-F: střední widget ukáže pět žádostí a „Ukázat všech 8"', await zadosti.getByRole('button', { name: /^Schválit:/ }).count() === 5
    && await zadosti.getByRole('button', { name: 'Ukázat všech 8' }).isVisible());
  await zadosti.getByRole('button', { name: 'Ukázat všech 8' }).click();
  tvrdi('V-F: …po rozbalení všech osm', await dokud(async () => (await zadosti.getByRole('button', { name: /^Schválit:/ }).count()) === 8, 1500));
  await zadosti.getByRole('button', { name: 'Vybrat víc' }).click();
  // Lišta BulkBar se ukáže, až je něco vybráno (vzor celé aplikace).
  await zadosti.getByRole('checkbox').first().click();
  tvrdi('V-F: hromadný výběr nabízí „Vybrat vše (8)"', await dokud(() => p.getByText('Vybrat vše (8)').isVisible(), 1500));
  tvrdi('V-F: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 3) Galerie: Ohodnotit směny a Žebříček v „Doporučené".
{
  const { ctx, p } = await kontext({ fix: FIX_VEDENI, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.odmeny');
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(600);
  const dop = await doporucene(galerie);
  tvrdi('V3: galerie nabízí Ohodnotit směny a Žebříček v Doporučených', dop.includes('Ohodnotit směny') && dop.includes('Žebříček'), dop.slice(0, 300));
  await ctx.close();
}

// 4) Oprávnění: jen žebříček (bez hodnocení, schvalování a katalogu).
{
  const jenZebricek = mine(ROLE.ja.opravneni.filter(k => !k.startsWith('hodnoceni.') && !['odmeny.schvalovat', 'odmeny.katalog', 'odmeny.nastaveni'].includes(k)),
    { klic: null, roleId: 9, nazev: 'Vedoucí směny', typ: 'vedeni', jeVlastnik: false });
  const { ctx, p, stav } = await kontext({ fix: FIX_VEDENI, mineData: jenZebricek, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.odmeny');
  await p.waitForTimeout(700);
  tvrdi('V4: bez odmeny.schvalovat nejsou Žádosti a /api/rewards/catalog se nevolá', await naPlose(p, 'odmeny.zadosti') === 0 && dotazyNa(stav, ['/api/rewards/catalog']).length === 0);
  tvrdi('V4: bez hodnoceni.zobrazit nejsou Nehodnocené ani Výtky a /api/shift-reviews se nevolá',
    await naPlose(p, 'hodnoceni.nehodnocene') === 0 && await naPlose(p, 'odmeny.vytky_tymu') === 0 && dotazyNa(stav, ['/api/shift-reviews']).length === 0);
  tvrdi('V4: přepínač částí zmizí (zbyl jen Žebříček), žádné „Ohodnotit"', await cast(p, 'Kalendář').count() === 0 && await cast(p, 'Nastavení').count() === 0
    && await p.getByRole('button', { name: /^Ohodnotit:/ }).count() === 0);
  tvrdi('V4: žebříček vidět', (await widgetLi(p, 'nastroj').innerText()).includes('Eva Testová'));
  await ctx.close();
}
{
  // Provozní: hodnocení i schvalování ano, katalog a nastavení ne.
  const { ctx, p, stav } = await kontext({ fix: FIX_VEDENI, mineData: roleMine('provozni'), dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.odmeny');
  await p.waitForTimeout(600);
  tvrdi('V4b: Provozní má Žádosti i Nehodnocené, ale ne část Nastavení', await naPlose(p, 'odmeny.zadosti') === 1 && await naPlose(p, 'hodnoceni.nehodnocene') === 1
    && await cast(p, 'Nastavení').count() === 0 && await cast(p, 'Kalendář').count() === 1);
  tvrdi('V4b: …a nic nezapisuje do katalogu', !(stav.patche ?? []).some(b => b.manage));
  await ctx.close();
}

// 5) 500 na hodnocení směn → chyba jen v Nehodnocených.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_VEDENI, dalsi: podvrh() });
  stav.chyby['/api/shift-reviews'] = 500;
  await otevri(p, VEDENI, 'vedeni.odmeny');
  await p.waitForTimeout(900);
  tvrdi('V5: Nehodnocené směny ukážou „Widget se nenačetl"', await widgetLi(p, 'hodnoceni.nehodnocene').getByText('Widget se nenačetl').isVisible());
  tvrdi('V5: jen ony — Žádosti, Výtky i žebříček žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'odmeny.zadosti').innerText()).includes('Eva Testová') && (await widgetLi(p, 'nastroj').innerText()).includes('Jakub Horák'));
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, Ohodnotit v žebříčku použitelné, přepínač v jednom řádku.
{
  const { ctx, p } = await kontext({ fix: FIX_VEDENI, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.odmeny');
  tvrdi('V6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const ohodnotit = widgetLi(p, 'nastroj').getByRole('button', { name: 'Ohodnotit: Eva Testová' });
  await ohodnotit.scrollIntoViewIfNeeded();
  tvrdi('V6: „Ohodnotit" v žebříčku vidět a povolené', await ohodnotit.isVisible() && await ohodnotit.isEnabled());
  await p.screenshot({ path: OUT + 'k69-b7-vedeni-tel.png', fullPage: true });
  await ohodnotit.click();
  tvrdi('V6: …otevře okno hodnocení Evy', await dokud(() => p.getByRole('dialog', { name: /Hodnotit směnu/ }).isVisible(), 3000));
  await p.keyboard.press('Escape');
  await cast(p, 'Nastavení').click();
  await p.waitForTimeout(500);
  tvrdi('V6: Nastavení na telefonu nepřetéká', await bezPreteceni(p));
  await p.screenshot({ path: OUT + 'k69-b7-vedeni-nastaveni-tel.png', fullPage: true });
  await ctx.close();
}

// Tmavý režim: plocha se nerozpadne (T11 hlídá sonda k68-design; tady jen snímek pro kontrolu oka).
{
  const { ctx, p, chyby } = await kontext({ fix: FIX_VEDENI, tmavy: true, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.odmeny');
  await p.screenshot({ path: OUT + 'k69-b7-vedeni-dark.png', fullPage: true });
  tvrdi('V-D: tmavý režim bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Odměny — zaměstnanec
// ---------------------------------------------------------------------------

{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: FIX_ZAM, mineData: roleMine('barista'), dalsi: podvrh(true) });
  await otevri(p, ZAM, 'zamestnanec.odmeny');
  const h = await h1(p);
  tvrdi('Z1: právě jeden viditelný h1 „Odměny" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Odměny', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  const tn = await nastroj.innerText();
  tvrdi('Z1: nástroj ukazuje úroveň Barista, body, pokrok do Mistra a výhody', tn.includes('Barista') && tn.includes('212') && tn.includes('Mistr') && tn.includes('Sleva 10 %')
    && await nastroj.getByRole('progressbar').count() === 1, tn.replace(/\n/g, ' | '));
  tvrdi('Z1: bez rozmazané skvrny a ručního štítku verzálkami', await nastroj.locator('[class*="blur"]').count() === 0);
  tvrdi('Z-R: Zpětná vazba na stránce Odměny bez odkazu „Odměny" (vedl by sem)', await widgetLi(p, 'moje.zpetna_vazba').getByRole('button', { name: 'Odměny', exact: true }).count() === 0);
  tvrdi('Z1: Zpětná vazba nahoře — nepotvrzená výtka a „Beru na vědomí"', (await widgetLi(p, 'moje.zpetna_vazba').innerText()).includes('něco k nápravě')
    && await widgetLi(p, 'moje.zpetna_vazba').getByRole('button', { name: 'Beru na vědomí' }).isVisible());
  const odkud = await widgetLi(p, 'moje.odkud_body').innerText();
  tvrdi('Z1: Odkud mám body = počet × sazba (úkoly 50, postupy 30, uzávěrky 60)', /\+50/.test(odkud) && /\+30/.test(odkud) && /\+60/.test(odkud), odkud.replace(/\n/g, ' | '));
  const kat = widgetLi(p, 'odmeny.katalog');
  const tk = await kat.innerText();
  tvrdi('Z1: katalog — volné body 162 (50 drží čekající žádost), káva „Čeká", volný den chybí', tk.includes('162') && tk.includes('Čeká') && tk.includes('chybí'), tk.replace(/\n/g, ' | '));
  tvrdi('Z4: Barista (bez odmeny.katalog) nemá „Přidat odměnu"', await kat.getByRole('button', { name: 'Přidat odměnu' }).count() === 0);
  tvrdi('Z1: Úrovně — Barista „Teď"', (await widgetLi(p, 'odmeny.urovne').innerText()).includes('Teď'));
  await p.screenshot({ path: OUT + 'k69-b7-zam-desk.png', fullPage: true });

  // Detail dne z Hodnocení mých směn.
  await widgetLi(p, 'moje.hodnoceni_smen').locator('button.list-row').first().click();
  const den = p.getByRole('dialog');
  tvrdi('Z-H: řádek dne otevře detail s poznámkou vedení', await dokud(() => den.getByText('Krásně uklizený bar, díky!').isVisible(), 2000));
  await den.getByRole('button', { name: 'Zavřít', exact: true }).last().click();

  // Beru na vědomí = POST markSeen.
  await widgetLi(p, 'moje.zpetna_vazba').getByRole('button', { name: 'Beru na vědomí' }).click();
  tvrdi('Z-V: „Beru na vědomí" pošle POST { markSeen: true }', await dokud(() => stav.markSeen?.markSeen === true, 2000));

  // Úpravy: nástroj sbalený a přesunutelný.
  await upravit(p).click();
  tvrdi('Z2: vstup do úprav', await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + 'k69-b7-zam-upravy.png', fullPage: true });
  tvrdi('Z2: nástroj sbalený do zástupce bez „−"', await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible() && await nastroj.locator('[data-odznak]').count() === 0);
  await nastroj.focus();
  await p.keyboard.press('Home');
  tvrdi('Z2: nástroj jde přesunout nad všechny widgety', await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi('Z2: …PUT s nástrojem nahoře', poradiPutu(stav.puty.at(-1))[0] === 'nastroj');
  await p.keyboard.press('End');
  tvrdi('Z2: …a na konec pod widgety', await dokud(async () => (await poradi(p)).at(-1) === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(600);
  const dop = await doporucene(galerie);
  tvrdi('Z3: galerie nabízí Tenhle měsíc v Doporučených', dop.includes('Tenhle měsíc'), dop.slice(0, 300));
  tvrdi('Z4: v galerii zaměstnance nejsou widgety vedení (Žádosti, Výtky)', !(await galerie.innerText()).includes('Žádosti o odměny') && !(await galerie.innerText()).includes('Výtky v týmu'));
  await p.keyboard.press('Escape');
  await hotovo(p).click().catch(() => {});
  tvrdi('Z4: zaměstnanec se neptá na /api/shift-reviews (hodnocení týmu)', dotazyNa(stav, ['/api/shift-reviews']).length === 0);
  tvrdi('Z: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 5) 500 na katalogu → chyba jen v katalogu.
{
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_ZAM, mineData: roleMine('barista'), dalsi: podvrh(true) });
  stav.chyby['/api/rewards/catalog'] = 500;
  await otevri(p, ZAM, 'zamestnanec.odmeny');
  await p.waitForTimeout(900);
  tvrdi('Z5: Katalog odměn ukáže „Widget se nenačetl"', await widgetLi(p, 'odmeny.katalog').getByText('Widget se nenačetl').isVisible());
  tvrdi('Z5: jen on — nástroj, Úrovně i Hodnocení směn žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'nastroj').innerText()).includes('Barista') && (await widgetLi(p, 'odmeny.urovne').innerText()).includes('Legenda'));
  await ctx.close();
}
{
  // 500 na /api/rewards → nástroj ukáže ErrorState, hlavička zůstane (dřív jen neviditelný h1).
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_ZAM, mineData: roleMine('barista'), dalsi: podvrh(true) });
  stav.chyby['/api/rewards'] = 500;
  await otevri(p, ZAM, 'zamestnanec.odmeny');
  await p.waitForTimeout(900);
  tvrdi('Z5b: výpadek /api/rewards — hlavička „Odměny" vidět a nástroj hlásí chybu se „Zkusit znovu"', (await h1(p)).text === 'Odměny'
    && await widgetLi(p, 'nastroj').getByText('Odměny se nenačetly').isVisible() && await widgetLi(p, 'nastroj').getByRole('button', { name: 'Zkusit znovu' }).isVisible());
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, Vyměnit → okno → POST.
{
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_ZAM, mineData: roleMine('barista'), viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh(true) });
  await otevri(p, ZAM, 'zamestnanec.odmeny');
  tvrdi('Z6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const vymenit = widgetLi(p, 'odmeny.katalog').getByRole('button', { name: 'Vyměnit body za Oběd na účet podniku' });
  await vymenit.scrollIntoViewIfNeeded();
  tvrdi('Z6: „Vyměnit" za dostupnou odměnu vidět a povolené; za volný pátek zakázané', await vymenit.isVisible() && await vymenit.isEnabled()
    && await widgetLi(p, 'odmeny.katalog').getByRole('button', { name: 'Vyměnit body za Volný pátek' }).isDisabled());
  await p.screenshot({ path: OUT + 'k69-b7-zam-tel.png', fullPage: true });
  let dialog = false;
  p.on('dialog', d => { dialog = true; void d.dismiss(); });
  await vymenit.click();
  const okno = p.getByRole('dialog', { name: /Vyměnit 120 bodů/ });
  tvrdi('Z6: výměna se ptá oknem (ne confirm())', await dokud(() => okno.isVisible(), 1500) && !dialog);
  await okno.getByRole('button', { name: 'Vyměnit' }).click();
  tvrdi('Z6: …potvrzení pošle POST { rewardId: 3 }', await dokud(() => (stav.posty ?? []).some(b => b.rewardId === 3), 2000), JSON.stringify(stav.posty));
  tvrdi('Z6: …a ohlásí „Žádost odeslána"', await dokud(() => p.getByText('Žádost odeslána — počká na schválení vedením.').isVisible(), 2000));
  await ctx.close();
}

await konec();
