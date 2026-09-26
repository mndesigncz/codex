// Kolo 69, balík B4 — Receptury a Menu jako plocha s widgety (spec §7.4).
//
// Pro obě stránky: jeden h1 jako první, nástroj v klidu vidět, v úpravách
// sbalený bez „−" a přesunutelný nad widget i pod něj (PUT), galerie nabízí
// widgety balíku v „Doporučené", role bez klíče widget ani tlačítko nevidí a
// endpoint se nevolá, 500 na jednom endpointu shodí jen jeden widget, telefon
// 390 bez přetečení s použitelnou hlavní akcí a rozepsané v nástroji přežije
// úpravy. Navíc to, co balík opravoval: „Odepsat prodeje" volá POST
// /api/pos/sync (N1), řádek „Prodává se, ale neodepisuje" otevře editor
// receptury v nástroji, přepnutí vyprodaného ve widgetu se propíše do editoru
// menu (další Uložit ho nevrátí) a zrušení PINu je částečná změna.
//
// Stránka Menu bydlí v Managero client (záložka Menu v ClientAdmin, balík B8).
// Dokud ji integrace nepřepne na <MenuEditor /> s plochou, projde část Menu
// jen v kopii, kde to restart.sh emuluje (EMULUJ_B8=1).
//
// Fixtury: scripts/sondy/fixtury/k69-b4-*.json.
import { readFileSync } from 'node:fs';
import {
  kontext, konec, tvrdi, otevri, lista, upravit, hotovo, vUpravach, dokud, poradi, poradiPutu, dotazyNa, roleMine, mine, ROLE, DIR, OUT, BASE,
} from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const FIX_RECEPTURY = nacti('k69-b4-rozlozeni-receptury');
const FIX_MENU = nacti('k69-b4-rozlozeni-menu');

/** Podvrh API receptur a menu; `stav.chyby[cesta]` = kód chyby. */
const podvrh = () => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (stav.chyby[path]) return json({ error: 'Server spadl' }, stav.chyby[path]);
  if (m === 'POST' && path === '/api/pos/sync') { stav.sync = (stav.sync ?? 0) + 1; return json({ connected: true, processed: 3, deducted: [{ name: 'Mléko', amount: 0.4 }, { name: 'Káva', amount: 0.018 }] }); }
  if (m === 'POST' && path === '/api/pos/products') { stav.receptura = req.postDataJSON(); return json({ ok: true }); }
  if (m === 'POST' && /^\/api\/menu\/public\/[^/]+\/soldout$/.test(path)) { stav.soldout = req.postDataJSON(); return json({ ok: true }); }
  if (m === 'PUT' && path === '/api/menu') {
    const t = req.postDataJSON();
    (stav.menuPuty ??= []).push(t);
    return json({ board: nacti('k69-b4-menu').boards.find(b => b.id === t.id) });
  }
  if (m !== 'GET') return undefined;
  if (path === '/api/pos/products') return json(nacti('k69-b4-pos-products'));
  if (path === '/api/inventory') return json(nacti('k69-b4-inventory'));
  if (path === '/api/inventory/categories') return json([{ id: 1, name: 'Bar' }]);
  if (path === '/api/guides') return json({ guides: [] });
  if (path === '/api/pos/margins') return json({ connected: true, totals: { marginPct: 68, margin: 1000, noRecipe: 1 }, items: [{ productId: 'p1', name: 'Latte', qty: 40, revenue: 3000, cost: 12, marginPct: 68 }] });
  if (path === '/api/pos/status') return json({ connected: true });
  if (path === '/api/client/admin/profile') return json({ profile: { ordering_on: false } });
  if (path === '/api/menu') {
    const f = nacti('k69-b4-menu');
    if (url.searchParams.get('jen') === 'vyprodano') {
      return json({ boards: f.boards.filter(b => b.enabled).map(b => ({ id: b.id, slug: b.slug, name: b.name, enabled: true,
        sections: b.sections.map(s => ({ title: s.title, items: s.items.map(i => ({ id: i.id, name: i.name, soldOut: i.soldOut })) })) })) });
    }
    return json(f);
  }
  if (/^\/api\/menu\/public\/akce$/.test(path)) return json({ ok: true });
  return undefined;
};

const RECEPTURY = '/employer/recipes';
const MENU = '/employer/overview?view=menu';
const naPlose = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`).count();
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const limetek = (p) => p.locator('[data-plocha] button.on-accent:visible, [data-plocha] .btn-accent:visible').count();
const h1 = (p) => p.evaluate(() => {
  const vid = [...document.querySelectorAll('h1')].filter(h => h.offsetParent !== null);
  const prvni = document.querySelector('[data-plocha]')?.querySelector('h1, h2, h3');
  return { pocet: vid.length, prvniJeH1: prvni?.tagName === 'H1', text: vid[0]?.textContent?.trim() };
});
const doporucene = (galerie) => galerie.evaluate(el => {
  const h = [...el.querySelectorAll('h4')].find(x => x.textContent?.includes('Doporučené'));
  return h?.parentElement?.innerText ?? '';
});
/** Pravý okraj každého tlačítka a pole ≤ okraj jeho karty (useknuté tlačítko scrollWidth nezvětší). */
const presahy = (loc) => loc.evaluate(li => {
  const out = [];
  for (const card of li.querySelectorAll('.card')) {
    const c = card.getBoundingClientRect();
    for (const b of card.querySelectorAll('button, input, select')) {
      const r = b.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > c.right + 0.5 || r.left < c.left - 0.5) out.push(`${b.getAttribute('aria-label') || b.textContent?.trim().slice(0, 20)} ${Math.round(r.left)}–${Math.round(r.right)} / karta ${Math.round(c.right)}`);
    }
  }
  return out;
});

// ---------------------------------------------------------------------------
// Receptury
// ---------------------------------------------------------------------------

// 1–3, 7) Hlavička, nástroj, widgety, N1, úpravy, galerie, rozepsané hledání.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_RECEPTURY, dalsi: podvrh() });
  await otevri(p, RECEPTURY, 'vedeni.receptury');
  const h = await h1(p);
  tvrdi('R1: právě jeden viditelný h1 „Receptury" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Receptury', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('R1: nástroj v klidu vidět (hledání a seznam položek menu)', await nastroj.getByLabel('Hledat položku menu').isVisible()
    && (await nastroj.innerText()).includes('Blue Lagoon'));
  tvrdi('R1: v hlavičce žádná limetka (hlavní akce stránky je až v editoru)', await limetek(p) === 0, `${await limetek(p)}×`);
  const pokr = await widgetLi(p, 'receptury.pokryti').innerText();
  tvrdi('R1: Pokrytí recepturou — 40 % (2 z 5), 2 se prodávají bez, 3 položky ve skladu (bez odložené a návrhu)',
    /40\s%/.test(pokr) && pokr.includes('2 z 5') && /Ve skladu\s*3/i.test(pokr.replace(/\n/g, ' ').replace(/VE SKLADU/i, 'Ve skladu')), pokr.replace(/\n/g, ' | '));
  const bez = widgetLi(p, 'receptury.bez_receptury');
  const tBez = await bez.innerText();
  tvrdi('R1: Prodává se, ale neodepisuje — Blue Lagoon (30×) před limonádou (12×)', tBez.indexOf('Blue Lagoon') >= 0 && tBez.indexOf('Blue Lagoon') < tBez.indexOf('Limonáda'), tBez.slice(0, 200));
  tvrdi('R1: Marže (finance.marze) je na ploše pro vlastníka', await naPlose(p, 'finance.marze') === 1);
  tvrdi('R1: nad seznamem už nejsou ručně tónované bloky', await p.locator('[data-plocha] [class*="bg-wait/[0.0"], [data-plocha] [class*="bg-[#C8F542]/15"]').count() === 0);
  await p.screenshot({ path: OUT + 'k69-b4-receptury-desk.png', fullPage: true });

  // N1: „Odepsat prodeje" → POST /api/pos/sync a Toast s výsledkem.
  await p.locator('[data-plocha]').getByRole('button', { name: 'Odepsat prodeje' }).click();
  tvrdi('R-N1: „Odepsat prodeje" pošle POST /api/pos/sync (ne PATCH /api/pos/products)', await dokud(() => stav.sync === 1, 2000)
    && !stav.dotazy.some(d => d.m === 'PATCH' && d.path === '/api/pos/products'));
  tvrdi('R-N1: …a ohlásí výsledek „Odepsáno ze skladu: 2 položky z 3 účtenek."', await dokud(() => p.getByText('Odepsáno ze skladu: 2 položky z 3 účtenek.').isVisible(), 2000));

  // Widget → nástroj: řádek Blue Lagoon otevře editor receptury.
  await bez.locator('button.list-row').first().click();
  tvrdi('R-W: řádek „Blue Lagoon" otevře editor receptury v nástroji', await dokud(() => nastroj.getByRole('heading', { name: 'Blue Lagoon' }).isVisible(), 2000));
  tvrdi('R-W: editor má jedinou limetku „Uložit recepturu"', await limetek(p) === 1 && await nastroj.getByRole('button', { name: 'Uložit recepturu' }).isVisible());
  await nastroj.getByLabel('Surovina').first().selectOption('3');
  await nastroj.getByLabel('Množství').first().fill('4');
  await nastroj.getByRole('tab', { name: 'cl', exact: true }).first().click();
  tvrdi('R-W: z balení 0,7 l při 4 cl vyjde 17 porcí', (await nastroj.innerText()).includes('17×'));

  // 7) Rozepsaná receptura přežije vstup do úprav a výstup z nich.
  await upravit(p).click();
  tvrdi('R2: vstup do úprav', await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + 'k69-b4-receptury-desk-upravy.png', fullPage: true });
  tvrdi('R2: nástroj je v úpravách sbalený do zástupce bez „−"', await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible()
    && await nastroj.locator('[data-odznak]').count() === 0);
  tvrdi('R2: widgety „−" mají', await widgetLi(p, 'receptury.pokryti').locator('[data-odznak]').count() === 1);
  await nastroj.focus();
  await p.keyboard.press('Home');
  tvrdi('R2: nástroj jde přesunout nad všechny widgety', await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi('R2: …a odejde PUT s nástrojem nahoře', poradiPutu(stav.puty.at(-1))[0] === 'nastroj', JSON.stringify(poradiPutu(stav.puty.at(-1))));
  await p.keyboard.press('ArrowDown');
  tvrdi('R2: …a zpátky pod widget', await dokud(async () => (await poradi(p))[1] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('R7: rozepsaná receptura přežila úpravy (množství 4 cl)', await nastroj.getByLabel('Množství').first().inputValue() === '4');
  await nastroj.getByRole('button', { name: 'Uložit recepturu' }).click();
  tvrdi('R7: …Uložit pošle recepturu Blue Lagoon s 0,04 l vodky (v jednotce položky)', await dokud(() => stav.receptura != null, 2000)
    && stav.receptura.productId === 'p4' && stav.receptura.ingredients?.[0]?.itemId === 3 && Math.abs(stav.receptura.ingredients[0].amount - 0.04) < 1e-9, JSON.stringify(stav.receptura));
  tvrdi('R: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 3) Galerie: widget balíku v „Doporučené".
{
  const fix = { ...FIX_RECEPTURY, polozky: FIX_RECEPTURY.polozky.filter(x => x.widget !== 'receptury.bez_receptury') };
  const { ctx, p } = await kontext({ fix, dalsi: podvrh() });
  await otevri(p, RECEPTURY, 'vedeni.receptury');
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(500);
  const dop = await doporucene(galerie);
  tvrdi('R3: galerie nabízí „Prodává se, ale neodepisuje" v Doporučených', dop.includes('Prodává se, ale neodepisuje'), dop.slice(0, 300));
  tvrdi('R3: …i Suroviny bez ceny nebo balení a Top produkty', dop.includes('Suroviny bez ceny') && dop.includes('Top produkty'), dop.slice(0, 300));
  await ctx.close();
}

// 4) Oprávnění: Provozní (receptury.zobrazit bez upravit, marží, cen a synchronizace).
{
  const { ctx, p, stav } = await kontext({ fix: FIX_RECEPTURY, mineData: roleMine('provozni'), dalsi: podvrh() });
  await otevri(p, RECEPTURY, 'vedeni.receptury');
  await p.waitForTimeout(600);
  tvrdi('R4: Provozní nevidí Marže a na /api/pos/margins neodešel dotaz', await naPlose(p, 'finance.marze') === 0 && dotazyNa(stav, ['/api/pos/margins']).length === 0);
  tvrdi('R4: Provozní nemá „Odepsat prodeje" (N1: jen s pokladna.synchronizovat)', await p.getByRole('button', { name: 'Odepsat prodeje' }).count() === 0);
  const bez = widgetLi(p, 'receptury.bez_receptury');
  tvrdi('R4: fronta bez receptury je vidět, ale řádky nejsou klikací (bez receptury.upravit)', (await bez.innerText()).includes('Blue Lagoon') && await bez.locator('button.list-row').count() === 0);
  await widgetLi(p, 'nastroj').locator('button.list-row').first().click();
  tvrdi('R4: editor bez „Uložit recepturu", s vysvětlením', await dokud(() => widgetLi(p, 'nastroj').getByText('Recepturu mění jen ten, kdo smí receptury upravovat.').isVisible(), 2000)
    && await widgetLi(p, 'nastroj').getByRole('button', { name: 'Uložit recepturu' }).count() === 0);
  await ctx.close();
}

// 5) 500 na receptury → chyba ve widgetech receptur, Marže žije.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_RECEPTURY, dalsi: podvrh() });
  stav.chyby['/api/pos/margins'] = 500;
  await otevri(p, RECEPTURY, 'vedeni.receptury');
  await p.waitForTimeout(800);
  const marze = widgetLi(p, 'finance.marze');
  tvrdi('R5: Marže ukáže „Widget se nenačetl" se „Zkusit znovu"', await marze.getByText('Widget se nenačetl').isVisible() && await marze.getByRole('button', { name: 'Zkusit znovu' }).isVisible());
  tvrdi('R5: jen ona — Pokrytí, fronta i nástroj žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'receptury.pokryti').innerText()).includes('%') && (await widgetLi(p, 'nastroj').innerText()).includes('Latte'));
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, hledání a řádek použitelné, editor se vejde.
{
  const { ctx, p } = await kontext({ fix: FIX_RECEPTURY, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, RECEPTURY, 'vedeni.receptury');
  tvrdi('R6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const hledat = widgetLi(p, 'nastroj').getByLabel('Hledat položku menu');
  await hledat.scrollIntoViewIfNeeded();
  await hledat.fill('mrazena');
  tvrdi('R6: hledání bez diakritiky najde „Mražená malina"', await dokud(async () => (await widgetLi(p, 'nastroj').innerText()).includes('Mražená malina'), 1500));
  await p.screenshot({ path: OUT + 'k69-b4-receptury-tel.png', fullPage: true });
  await widgetLi(p, 'nastroj').locator('button.list-row').first().click();
  const ulozit = widgetLi(p, 'nastroj').getByRole('button', { name: 'Uložit recepturu' });
  await ulozit.scrollIntoViewIfNeeded();
  tvrdi('R6: editor na telefonu — „Uložit recepturu" vidět a povolené', await ulozit.isVisible() && await ulozit.isEnabled());
  tvrdi('R6: editor nepřetéká a nic nepřečnívá kartu', await bezPreteceni(p) && (await presahy(widgetLi(p, 'nastroj'))).length === 0, (await presahy(widgetLi(p, 'nastroj'))).slice(0, 3).join(' | '));
  await p.screenshot({ path: OUT + 'k69-b4-receptury-editor-tel.png', fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Menu (Managero client)
// ---------------------------------------------------------------------------

// 1–3, 7) Hlavička, nástroj, widgety, vyprodáno → editor, úpravy, galerie, rozepsaný název.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_MENU, dalsi: podvrh() });
  await otevri(p, MENU, 'vedeni.menu');
  const h = await h1(p);
  tvrdi('M1: právě jeden viditelný h1 „Menu" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Menu', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('M1: nástroj v klidu vidět (editor s adresou a sekcemi)', await nastroj.getByText('Adresa pro iPad a pro hosty').isVisible()
    && await nastroj.getByLabel('Název sekce menu').first().isVisible());
  tvrdi('M1: bez neuložených změn žádná limetka', await limetek(p) === 0, `${await limetek(p)}×`);
  const stavMenu = await widgetLi(p, 'menu.stav').innerText();
  tvrdi('M1: Stav menu — obě menu, vypnuté Zimní se „Zveřejnit", u akce 1 bez ceny a 2 bez vazby na kasu',
    stavMenu.includes('Venkovní akce') && stavMenu.includes('Zimní menu') && stavMenu.includes('1 bez ceny') && stavMenu.includes('2 bez vazby na kasu')
    && await widgetLi(p, 'menu.stav').getByRole('button', { name: 'Zveřejnit' }).count() === 1, stavMenu.replace(/\n/g, ' | '));
  tvrdi('M1: Wi-Fi ukazuje síť a heslo s kopírováním', (await widgetLi(p, 'menu.wifi').innerText()).includes('kafe2026')
    && await widgetLi(p, 'menu.wifi').getByRole('button', { name: 'Zkopírovat heslo Wi-Fi' }).isVisible());
  const vyp = widgetLi(p, 'menu.vyprodano');
  tvrdi('M1: Vyprodáno ukazuje Mojito (Svařák z vypnutého menu ne)', (await vyp.innerText()).includes('Mojito') && !(await vyp.innerText()).includes('Svařák'));
  await p.screenshot({ path: OUT + 'k69-b4-menu-desk.png', fullPage: true });

  // Vyprodáno ve widgetu → POST soldout a editor si to propíše.
  await vyp.getByLabel('Najít položku menu').fill('malina');
  await vyp.getByRole('switch', { name: 'Vyprodáno: Mražená malina' }).click();
  tvrdi('M-V: přepnutí pošle POST soldout s položkou 112', await dokud(() => stav.soldout?.itemId === 112 && stav.soldout?.soldOut === true, 2000), JSON.stringify(stav.soldout));
  const vypEditor = nastroj.getByRole('switch', { name: /Mražená malina/ });
  tvrdi('M-V: …a editor pod widgety ukazuje Mraženou malinu jako vyprodanou (další Uložit ji nevrátí)', await dokud(async () => (await vypEditor.getAttribute('aria-checked')) === 'true', 2000));

  // Zveřejnit Zimní menu ze Stavu menu = částečná změna.
  await widgetLi(p, 'menu.stav').getByRole('button', { name: 'Zveřejnit' }).click();
  tvrdi('M-S: „Zveřejnit" pošle PUT { id: 2, castecne, enabled } — ne celou desku', await dokud(() => (stav.menuPuty ?? []).some(t => t.id === 2 && t.castecne === true && t.enabled === true && !('sections' in t)), 2000),
    JSON.stringify(stav.menuPuty));

  // 7) Rozepsaný název menu přežije úpravy; neuložené změny = jedna limetka v liště.
  await nastroj.getByLabel('Nadpis', { exact: true }).fill('Letní nabídka');
  tvrdi('M7: s neuloženými změnami se ukáže lišta s jedinou limetkou „Uložit"', await dokud(() => p.getByRole('region', { name: 'Neuložené změny menu' }).isVisible(), 1500)
    && await p.locator('.btn-accent:visible').count() === 1);
  await upravit(p).click();
  tvrdi('M2: vstup do úprav', await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  tvrdi('M2: lišta neuložených změn se v úpravách schová (limetka je „Hotovo")', !(await p.getByRole('region', { name: 'Neuložené změny menu' }).isVisible()));
  await p.screenshot({ path: OUT + 'k69-b4-menu-desk-upravy.png', fullPage: true });
  tvrdi('M2: nástroj sbalený do zástupce bez „−"', await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible() && await nastroj.locator('[data-odznak]').count() === 0);
  await nastroj.focus();
  await p.keyboard.press('Home');
  tvrdi('M2: nástroj jde přesunout nad widgety', await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi('M2: …PUT s nástrojem nahoře', poradiPutu(stav.puty.at(-1))[0] === 'nastroj');
  await p.keyboard.press('ArrowDown');
  tvrdi('M2: …a zpátky pod widget', await dokud(async () => (await poradi(p))[1] === 'nastroj', 1500));
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('M7: rozepsaný nadpis přežil úpravy', await nastroj.getByLabel('Nadpis', { exact: true }).inputValue() === 'Letní nabídka');
  tvrdi('M: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 3) Galerie Menu: Wi-Fi v Doporučených, když na ploše není.
{
  const fix = { ...FIX_MENU, polozky: FIX_MENU.polozky.filter(x => x.widget !== 'menu.wifi') };
  const { ctx, p } = await kontext({ fix, dalsi: podvrh() });
  await otevri(p, MENU, 'vedeni.menu');
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(500);
  const dop = await doporucene(galerie);
  tvrdi('M3: galerie nabízí „Wi-Fi pro hosty" v Doporučených', dop.includes('Wi-Fi pro hosty'), dop.slice(0, 300));
  await ctx.close();
}

// 4) Oprávnění: menu vidí, ale nesmí upravovat, zveřejnit ani mazat (jen vyprodáno).
{
  const bezUprav = mine(ROLE.ja.opravneni.filter(k => !['menu.upravit', 'menu.ceny', 'menu.zverejnit', 'menu.mazat'].includes(k)),
    { klic: null, roleId: 9, nazev: 'Směnový', typ: 'vedeni', jeVlastnik: false });
  const { ctx, p, stav } = await kontext({ fix: FIX_MENU, mineData: bezUprav, dalsi: podvrh() });
  await otevri(p, MENU, 'vedeni.menu');
  await p.waitForTimeout(600);
  tvrdi('M4: bez menu.zverejnit žádné „Zveřejnit" ve Stavu menu', await widgetLi(p, 'menu.stav').getByRole('button', { name: 'Zveřejnit' }).count() === 0);
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('M4: bez menu.upravit je editor zamčený (název sekce nejde měnit, žádné Uložit ani Smazat menu)', await nastroj.getByLabel('Název sekce menu').first().isDisabled()
    && await nastroj.getByRole('button', { name: /Uložit menu|Uložit změny/ }).count() === 0 && await nastroj.getByRole('button', { name: 'Smazat menu' }).count() === 0);
  tvrdi('M4: …vyprodáno ale přepnout jde (menu.vyprodano)', await widgetLi(p, 'menu.vyprodano').getByRole('switch').first().isEnabled());
  tvrdi('M4: žádný zápis do /api/menu', !(stav.menuPuty ?? []).length);
  await ctx.close();
}
{
  // Jen menu.vyprodano (Barista na Domů): widget Vyprodáno čte slabou odpověď, ne plné menu.
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: { stranka: 'zamestnanec.domu', polozky: [{ id: 'menu-vyprodano', widget: 'menu.vyprodano', velikost: 'M' }], dostupne: ['menu.vyprodano'], tarifem: [], zdroj: 'podnik', rozsah: 'typ:zamestnanec', zamceno: false, smiUpravit: true, smiVychozi: false, verze: 0 },
    mineData: roleMine('barista'), dalsi: podvrh() });
  await otevri(p, '/employee/shifts', 'zamestnanec.domu');
  await p.waitForTimeout(600);
  tvrdi('M4b: Barista vidí Vyprodáno s Mojitem', (await widgetLi(p, 'menu.vyprodano').innerText()).includes('Mojito'));
  tvrdi('M4b: …čte jen /api/menu?jen=vyprodano (plné menu s Wi-Fi a cenami ne)', stav.dotazy.some(d => d.path === '/api/menu' && d.u.includes('jen=vyprodano'))
    && !stav.dotazy.some(d => d.path === '/api/menu' && !d.u.includes('jen=vyprodano')));
  await ctx.close();
}

// 5) 500 na slabé odpovědi vyprodaného → chyba jen ve Vyprodáno.
{
  const { ctx, p } = await kontext({ fix: FIX_MENU, dalsi: (req, json, stav) => {
    const u = new URL(req.url());
    if (u.pathname === '/api/menu' && u.searchParams.get('jen') === 'vyprodano') return json({ error: 'Server spadl' }, 500);
    return podvrh()(req, json, stav);
  } });
  await otevri(p, MENU, 'vedeni.menu');
  await p.waitForTimeout(800);
  tvrdi('M5: Vyprodáno ukáže „Widget se nenačetl"', await widgetLi(p, 'menu.vyprodano').getByText('Widget se nenačetl').isVisible());
  tvrdi('M5: jen ono — Stav menu, Wi-Fi i editor žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'menu.wifi').innerText()).includes('Kavarna-host') && await widgetLi(p, 'nastroj').getByText('Adresa pro iPad a pro hosty').isVisible());
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, položka menu jde upravit a uložit.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_MENU, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, MENU, 'vedeni.menu');
  tvrdi('M6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const nastroj = widgetLi(p, 'nastroj');
  const cena = nastroj.getByLabel(/^Cena — Mražená malina/);
  await cena.scrollIntoViewIfNeeded();
  tvrdi('M6: cena položky sedí vedle názvu (ne na vlastním řádku)', await cena.evaluate(el => {
    const n = el.parentElement?.querySelector('input'); const a = n?.getBoundingClientRect(); const b = el.getBoundingClientRect();
    return !!a && Math.abs(a.top - b.top) < 4 && b.left > a.left;
  }));
  tvrdi('M6: nic v editoru nepřečnívá kartu', (await presahy(nastroj)).length === 0, (await presahy(nastroj)).slice(0, 3).join(' | '));
  await cena.fill('65');
  const ulozit = p.getByRole('region', { name: 'Neuložené změny menu' }).getByRole('button', { name: 'Uložit' });
  tvrdi('M6: lišta s „Uložit" je vidět nad dokem', await dokud(() => ulozit.isVisible(), 1500));
  await p.screenshot({ path: OUT + 'k69-b4-menu-tel.png', fullPage: true });
  await ulozit.click();
  tvrdi('M6: …Uložit pošle celé menu s cenou 65', await dokud(() => (stav.menuPuty ?? []).some(t => t.sections?.[1]?.items?.[1]?.price === 65), 2000));
  await ctx.close();
}

await konec();
void BASE;
