// Úkoly vedení i zaměstnance: statistické karty, hledání a záložky stavu s počty, panel Filtry (priorita, dny v týdnu),
// detail úkolu v okně (popis, kroky, kdo a kdy, Označit jako hotový), pohledy Seznam / Týden / Měsíc / Přehled
// (měsíční kalendář s úkoly dne, graf splněno/založeno/termíny s lištou období a srovnáním), telefon 390 bez přetečení.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, roleMine, fixtura, DIR, OUT } from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PREDVCEREM: praha(-2), ZITRA: praha(1), POZDEJI: praha(20) };
const CASY = { CAS_DNES: new Date(Date.now() - 60000).toISOString(), CAS_PREDVCEREM: new Date(Date.now() - 2 * 86400000).toISOString() };
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries({ ...DNY, ...CASY })) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t);
};
const podvrh = (req, json, stav) => {
  const { pathname: path } = new URL(req.url()); const m = req.method();
  if (path === '/api/tasks') {
    if (m === 'PATCH') { const t = req.postDataJSON(); (stav.ukolyPatche ??= []).push(t); return json({ id: t.id, ...t }); }
    if (m === 'POST') { stav.novyUkol = req.postDataJSON(); return json({ id: 99, ...stav.novyUkol }); }
    if (m === 'GET') {
      // Vrátí i čas založení, ať má graf „Založeno" z čeho kreslit.
      return json(nacti('k69-b6a-tasks').map((u, i) => ({ ...u, createdAt: new Date(Date.now() - (i % 4) * 86400000).toISOString() })));
    }
  }
  if (path === '/api/teams' && m === 'GET') return json(nacti('k69-b6a-teams'));
  return undefined;
};
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1);

for (const w of [1280, 390]) {
  const { ctx, p, stav, chyby } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, fix: nacti('k69-b6a-rozlozeni-ukoly'), dalsi: podvrh });
  await otevri(p, '/employer/overview?view=tasks', 'vedeni.ukoly');
  const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
  // Redesign v3: nad seznamem vedení je jedna řada (rychlé přidání · hledání · Filtry); pás stavů
  // je v panelu „Filtry" — seznam pod ním je podle stavu rozdělený do sekcí s počty.
  await nastroj.getByRole('group', { name: 'Filtry úkolů' }).waitFor({ timeout: 10000 });
  {
    const radek = await nastroj.evaluate(el => {
      const r = (sel) => el.querySelector(sel)?.getBoundingClientRect();
      const a = r('input[aria-label="Přidat úkol"]'), f = [...el.querySelectorAll('button')].find(b => /^Filtry/.test(b.textContent ?? ''))?.getBoundingClientRect();
      return a && f ? Math.abs((a.top + a.height / 2) - (f.top + f.height / 2)) : null;
    });
    tvrdi(`${w}: rychlé přidání a „Filtry" stojí v jedné řadě`, radek != null && radek <= 8, String(radek));
    tvrdi(`${w}: pás stavů není nad seznamem (je v panelu Filtry)`, await nastroj.getByRole('group', { name: 'Stav úkolů' }).count() === 0);
  }
  await nastroj.getByRole('button', { name: /^Filtry/ }).click();
  await nastroj.getByRole('group', { name: 'Stav úkolů' }).waitFor({ timeout: 5000 });

  // Karty a záložky stavu
  const txt = async () => (await nastroj.innerText()).replace(/\s+/g, ' ');
  const t0 = await txt();
  if (w >= 600) {
    tvrdi(`${w}: nahoře jedna věta o dni („1 z 4 hotovo") místo karet se statistikou`, /1\s*z 4 hotovo/.test(t0) && !/Splněno za 7 dní/i.test(t0), t0.slice(0, 200));
    tvrdi(`${w}: štítek „2 po termínu" zapne filtr`, await nastroj.getByRole('button', { name: '2 po termínu', exact: true }).count() === 1);
  } else {
    // Kolo 6 (B6, V11): na telefonu je souhrn dne podtitulkem stránky („Dnes 1 z 4 hotovo · 2 po termínu"),
    // nad prvním úkolem zůstane rychlé přidání, filtry a pás stavů; po termínu je první sekce seznamu.
    const hlavicka = (await p.locator('main').first().innerText()).replace(/\s+/g, ' ');
    tvrdi(`${w}: souhrn dne je v podtitulku stránky`, /Dnes 1 z 4 hotovo · 2 po termínu/.test(hlavicka) && !/Splněno za 7 dní/i.test(t0), hlavicka.slice(0, 200));
  }
  const stavy = nastroj.getByRole('group', { name: 'Stav úkolů' });
  tvrdi(`${w}: záložka Vše počítá všech 9 úkolů`, await stavy.getByRole('button', { name: /^Vše · 9$/ }).count() === 1, await stavy.innerText());
  tvrdi(`${w}: Po termínu = 2 (Umýt okna, Vynést sklo; dnešní ne)`, await stavy.getByRole('button', { name: /^Po termínu · 2$/ }).count() === 1, await stavy.innerText());
  tvrdi(`${w}: Dnes = 3 nehotové, Hotové = 2`, await stavy.getByRole('button', { name: /^Dnes · 3$/ }).count() === 1 && await stavy.getByRole('button', { name: /^Hotové · 2$/ }).count() === 1, await stavy.innerText());

  await stavy.getByRole('button', { name: /^Po termínu/ }).click();
  const seznam = nastroj.locator('ul[aria-label="Úkoly"] > li');
  tvrdi(`${w}: záložka Po termínu ukáže jen dva úkoly`, await dokud(async () => await seznam.count() === 2, 3000), String(await seznam.count()));
  await stavy.getByRole('button', { name: /^Vše/ }).click();
  await nastroj.getByRole('button', { name: /^Filtry/ }).click();

  // Hledání (na telefonu schované za lupou vedle rychlého přidání)
  const hledat = nastroj.getByRole('combobox', { name: 'Hledat v úkolech' }).or(nastroj.getByRole('textbox', { name: 'Hledat v úkolech' })).first();
  if (w < 600) {
    // Panel Filtry se právě zavírá: na pomalém runneru (CI) by klepnutí na lupu mohlo
    // přijít během animace. Počkat na doběhnutí animací a pole případně otevřít znovu.
    await p.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
    // v4 (P10): kde je nad seznamem přepínač pohledu, je pole hledání vidět rovnou (toolbar pod segmentem) — lupa tam není.
    const lupa = nastroj.getByRole('button', { name: 'Hledat v úkolech' });
    if (await lupa.count()) {
      await lupa.click();
      if (!(await dokud(() => hledat.isVisible().catch(() => false), 3000))) await lupa.click();
    }
  }
  await hledat.waitFor({ timeout: 10000 });
  await hledat.fill('mleko');
  tvrdi(`${w}: hledání bez diakritiky najde „Objednat mléko" (2 výskyty)`, await dokud(async () => (await nastroj.getByRole('button', { name: 'Objednat mléko', exact: true }).count()) === 2, 3000));
  await hledat.fill('');

  // Filtry: priorita Vysoká
  await nastroj.getByRole('button', { name: /^Filtry/ }).click();
  await nastroj.getByRole('group', { name: 'Komu úkol patří' }).getByRole('button', { name: /^Petr/ }).click();
  tvrdi(`${w}: filtr „Komu úkol patří" ukáže jen Petrovy úkoly a jde zrušit štítkem`, await dokud(async () => { const t = await txt(); return t.includes('Objednat mléko') && !t.includes('Umýt okna'); }, 3000) && await nastroj.getByRole('button', { name: /^Zrušit filtr: Petr/ }).count() === 1);
  await nastroj.getByRole('button', { name: /^Zrušit filtr: Petr/ }).click();
  await nastroj.getByRole('group', { name: 'Priorita' }).getByRole('button', { name: 'Vysoká', exact: true }).click();
  tvrdi(`${w}: filtr Vysoká priorita nechá Umýt okna a schová ostatní`, await dokud(async () => { const t = await txt(); return t.includes('Umýt okna') && !t.includes('Doplnit sirupy') && !t.includes('Vynést sklo'); }, 3000));
  tvrdi(`${w}: počet zapnutých filtrů je vidět na tlačítku`, await nastroj.getByRole('button', { name: /^Filtry · 1$/ }).count() === 1);
  await nastroj.getByRole('button', { name: 'Zrušit filtry' }).click();
  tvrdi(`${w}: Zrušit filtry vrátí všechny úkoly`, await dokud(async () => (await txt()).includes('Doplnit sirupy'), 3000));
  await nastroj.getByRole('button', { name: /^Filtry/ }).click();

  // Detail úkolu
  await nastroj.getByRole('button', { name: 'Doplnit sirupy', exact: true }).click();
  const okno = p.getByRole('dialog', { name: 'Doplnit sirupy' });
  await okno.waitFor({ timeout: 5000 });
  const tOkno = (await okno.innerText()).replace(/\s+/g, ' ');
  tvrdi(`${w}: detail ukáže popis, komu, termín, kroky a návod`, /Vanilka a karamel/.test(tOkno) && /Eva Testová/.test(tOkno) && /Termín/i.test(tOkno) && /Kroky/i.test(tOkno) && /Lískový oříšek/.test(tOkno) && /Sirupy na baru/.test(tOkno), tOkno.slice(0, 400));
  tvrdi(`${w}: detail nabízí Upravit, Smazat a Označit jako hotový`, await okno.getByRole('button', { name: 'Upravit' }).count() === 1 && await okno.getByRole('button', { name: 'Smazat' }).count() === 1 && await okno.getByRole('button', { name: 'Označit jako hotový' }).count() === 1);
  tvrdi(`${w}: nehotový úkol jde z detailu odložit`, await okno.getByRole('button', { name: /^Odložit/ }).count() === 1);
  await okno.getByRole('button', { name: 'Označit jako hotový' }).click();
  tvrdi(`${w}: Označit jako hotový pošle PATCH status done`, await dokud(() => (stav.ukolyPatche ?? []).some(t => t.id === 2 && t.status === 'done'), 3000), JSON.stringify(stav.ukolyPatche));
  await p.keyboard.press('Escape');
  tvrdi(`${w}: Escape detail zavře`, await dokud(async () => await p.getByRole('dialog').count() === 0, 3000));
  // Omylem odškrtnuté jde vrátit z toastu
  const vratit = p.getByRole('button', { name: 'Vrátit', exact: true });
  tvrdi(`${w}: po splnění toast „Úkol je hotový." s tlačítkem Vrátit`, await dokud(async () => await vratit.count() === 1, 3000) && /Úkol je hotový\./.test(await p.locator('body').innerText()));
  await vratit.click();
  tvrdi(`${w}: Vrátit pošle PATCH status pending`, await dokud(() => (stav.ukolyPatche ?? []).some(t => t.id === 2 && t.status === 'pending'), 3000), JSON.stringify(stav.ukolyPatche));

  // Rychlé přidání jedním řádkem: „zítra" na konci se přečte jako termín
  const rychle = nastroj.getByRole('textbox', { name: 'Přidat úkol' });
  await rychle.fill('Koupit citrony zítra');
  tvrdi(`${w}: rychlé přidání ukáže přečtený termín`, await dokud(async () => /Termín:/.test(await nastroj.innerText()), 2000));
  await rychle.press('Enter');
  tvrdi(`${w}: Enter pošle POST s názvem bez data a s termínem zítra`, await dokud(() => stav.novyUkol?.title === 'Koupit citrony' && stav.novyUkol?.dueDate === DNY.ZITRA, 3000), JSON.stringify(stav.novyUkol));

  // Měsíc
  const pohledy = p.locator('[data-plocha]').getByRole('tablist', { name: 'Zobrazení' }).or(p.locator('[aria-label="Zobrazení"]')).first();
  // Audit 2026-10 (V27): na telefonu jsou Měsíc a Přehled v „···" hlavičky (pět pohledů v pásu se
  // na 390 px uřízlo „Za b…"); od md zůstávají v segmentu.
  const prepniPohled = async (nazev) => {
    const tab = pohledy.getByRole('tab', { name: nazev, exact: true });
    if (await tab.count()) { await tab.click(); return; }
    await p.getByRole('button', { name: 'Další akce' }).first().click();
    await p.getByRole('menuitem', { name: nazev, exact: true }).click();
  };
  await prepniPohled('Měsíc');
  const kal = nastroj.getByRole('group', { name: 'Kalendář úkolů' });
  await kal.waitFor({ timeout: 5000 });
  const bunky = kal.locator('button');
  tvrdi(`${w}: měsíční kalendář má buňky dnů`, await bunky.count() >= 28, String(await bunky.count()));
  const dnesN = Number(DNY.DNES.slice(8));
  const dnesBunka = kal.getByRole('button', { name: new RegExp(`^\\S+ ${dnesN}\\. `) }).first();
  await dnesBunka.click();
  tvrdi(`${w}: klepnutí na dnešek ukáže jeho úkoly pod kalendářem`, await dokud(async () => { const t = await txt(); return t.includes('Zavřít bar') && t.includes('Doplnit sirupy'); }, 3000), (await txt()).slice(-300));
  if (w === 1280) await p.screenshot({ path: OUT + 'ukoly-mesic.png', fullPage: true });

  // Přehled (graf)
  await prepniPohled('Přehled');
  const lista = nastroj.getByRole('group', { name: 'Období', exact: true });
  await lista.waitFor({ timeout: 5000 });
  tvrdi(`${w}: Přehled má tlačítko období a graf`, await lista.getByRole('button').count() === 1 && await nastroj.locator('[role=group][aria-label^="Úkoly: "]').count() >= 1);
  await lista.getByRole('button').first().click();
  const okno2 = p.getByRole('dialog', { name: 'Období' });
  await okno2.getByRole('button', { name: 'Posledních 7 dní', exact: true }).click();
  const graf = nastroj.locator('[role=group][aria-label^="Úkoly: "]');
  tvrdi(`${w}: „7 dní" dá sedm sloupců`, await dokud(async () => await graf.locator('button').count() === 7, 3000), String(await graf.locator('button').count()));
  await nastroj.getByRole('tab', { name: 'Založeno', exact: true }).click();
  tvrdi(`${w}: graf přepne metriku (porovnání je zapnuté samo)`, await graf.locator('button').count() === 7);
  await graf.locator('button').last().click();
  tvrdi(`${w}: klepnutí na sloupec ukáže úkoly toho dne`, await dokud(async () => await nastroj.locator('section[aria-label^="Úkoly: "]').count() === 1, 3000));
  tvrdi(`${w}: Přehled ukazuje výkon podle lidí (vedení)`, /Výkon podle lidí/i.test(await txt()));
  if (w === 1280) await p.screenshot({ path: OUT + 'ukoly-prehled.png', fullPage: true });
  tvrdi(`${w}: bez vodorovného přetečení`, await bezPreteceni(p));

  // Týden zůstává
  await pohledy.getByRole('tab', { name: 'Týden', exact: true }).click();
  tvrdi(`${w}: týdenní tabule dál funguje`, await dokud(async () => await nastroj.getByText('Zavřít bar').count() >= 1, 3000));
  tvrdi(`${w}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
// Úkoly zaměstnance: stejné filtry, detail a pohledy, jen bez výkonu podle lidí a bez Upravit / Smazat.
for (const w of [1280, 390]) {
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', viewport: { width: w, height: 900 }, mobil: w < 600, fix: nacti('k69-b6a-rozlozeni-ukoly-zam'), mineData: roleMine('barista'), dalsi: podvrh });
  await otevri(p, '/employee/shifts?view=tasks', 'zamestnanec.ukoly');
  const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
  const stavy = nastroj.getByRole('group', { name: 'Stav úkolů' });
  if (w >= 600) {
    await stavy.waitFor({ timeout: 10000 });
    tvrdi(`Z ${w}: záložky stavu s počty (moje a pro kohokoli)`, await stavy.getByRole('button', { name: /^Vše · \d+$/ }).count() === 1 && await stavy.getByRole('button', { name: /^Po termínu · \d+$/ }).count() === 1, await stavy.innerText());
  } else {
    // Kolo 6 (B5, Z3): na telefonu je ovládání v jednom řádku (Seznam/Týden/Měsíc · lupa · Filtry)
    // a záložky stavu přibudou až od devíti úkolů — fixtura jich má méně, po termínu je první sekce seznamu.
    await nastroj.getByRole('button', { name: /^Filtry/ }).waitFor({ timeout: 10000 });
    tvrdi(`Z ${w}: na telefonu ovládání v jednom řádku, záložky stavu až od devíti úkolů`, !(await stavy.isVisible()));
  }
  await nastroj.getByRole('button', { name: 'Doplnit sirupy', exact: true }).click();
  const okno = p.getByRole('dialog', { name: 'Doplnit sirupy' });
  await okno.waitFor({ timeout: 5000 });
  tvrdi(`Z ${w}: detail ukáže popis a kroky, ale ne Upravit a Smazat`, /Vanilka a karamel/.test(await okno.innerText()) && await okno.getByRole('button', { name: 'Upravit' }).count() === 0 && await okno.getByRole('button', { name: 'Smazat' }).count() === 0);
  await okno.getByRole('button', { name: 'Označit jako hotový' }).click();
  tvrdi(`Z ${w}: Označit jako hotový pošle PATCH status done`, await dokud(() => (stav.ukolyPatche ?? []).some(t => t.id === 2 && t.status === 'done'), 3000));
  await p.keyboard.press('Escape');
  // Kolo 6 (B5): přepínač Seznam/Týden/Měsíc je ve stránce dvakrát — na telefonu v řádku filtrů,
  // od md v hlavičce nástroje; ten druhý je vždy skrytý. Bere se viditelný.
  const pohledy = p.locator('[aria-label="Zobrazení"]:visible').first();
  await pohledy.getByRole('tab', { name: 'Měsíc', exact: true }).click();
  tvrdi(`Z ${w}: měsíční kalendář`, await dokud(async () => await nastroj.getByRole('group', { name: 'Kalendář úkolů' }).locator('button').count() >= 28, 4000));
  tvrdi(`Z ${w}: zaměstnanec nemá Přehled (statistiky týmu patří vedení)`, await pohledy.getByRole('tab', { name: 'Přehled', exact: true }).count() === 0);
  tvrdi(`Z ${w}: bez vodorovného přetečení`, await bezPreteceni(p));
  tvrdi(`Z ${w}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
// Widget → Úkoly: klepnutí na „Po termínu" na Přehledu otevře Úkoly rovnou na záložce Po termínu.
{
  const fix = { ...fixtura('k68-rozlozeni-vedeni'), polozky: [{ id: 'po-terminu', widget: 'ukoly.po_terminu', velikost: 'S' }] };
  const { ctx, p } = await kontext({ viewport: { width: 1280, height: 900 }, fix, dalsi: podvrh });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  const karta = p.locator('[data-instance="po-terminu"]');
  await karta.waitFor({ timeout: 10000 });
  await karta.click({ position: { x: 40, y: 60 }, force: true });
  // Redesign v3: pás stavů je u vedení v panelu Filtry; zapnutý stav ukazuje štítek s křížkem.
  const stitek = p.locator('[data-plocha] li[data-widget="nastroj"]').getByRole('button', { name: /^Zrušit filtr: Po termínu/ });
  await stitek.waitFor({ timeout: 10000 });
  tvrdi('widget → Úkoly: stav „Po termínu" je rovnou zapnutý (štítek nad seznamem)', await dokud(async () => /Po termínu · 2/.test(await stitek.innerText()), 4000));
  await ctx.close();
}
await konec();
