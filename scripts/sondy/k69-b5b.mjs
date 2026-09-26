// Kolo 69, balík B5b — Finance, TO GO a Všechny podniky jako plochy s widgety
// (spec §6.2, šablona §7.4). Pro každou stránku:
//  1. právě jeden h1 a je první; nástroj (li[data-widget="nastroj"]) je v klidu vidět;
//  2. v úpravách je nástroj sbalený do zástupce bez „−" a jde posunout mezi widgety → PUT;
//  3. galerie nabízí widgety balíku v „Doporučené";
//  4. role bez klíče widget nevidí a jeho endpoint se nevolá (N2 — tržby jen s finance.trzby);
//  5. 500 na jednom endpointu → ErrorState jen v jednom widgetu;
//  6. telefon 390: 0 přetečení, hlavní akce stránky vidět a klikatelná;
//  7. rozepsané hledání v nástroji přežije vstup do úprav a výstup z nich.
// Navíc: měsíc z přepínače v hlavičce řídí widgety i nástroj (jedna URL), skryté
// tržby podniku jsou „skryto" (ne „0 Kč"), TO GO má jedinou inkoustovou plochu.
//
// API je podvržené (k68-spolecne.mjs), data widgetů z fixtur k69-b5b-*.json.
import {
  kontext, konec, tvrdi, otevri, lista, upravit, vUpravach, dokud, dotazyNa, roleMine, VLASTNIK, fixtura, hotovo, OUT,
} from './k68-spolecne.mjs';

const dnes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
const s = (jmeno) => JSON.parse(JSON.stringify(fixtura(jmeno)).replaceAll('DNES', dnes));
const naPlose = (p, widget) => p.locator(`[data-plocha] li[data-widget="${widget}"]:not([hidden])`).count();
const text = async (p, widget) => (await p.locator(`[data-plocha] li[data-widget="${widget}"]`).innerText().catch(() => '')).replace(/ /g, ' ');

/** Obsluha datových endpointů widgetů balíku; `chyby` = cesta → HTTP kód. */
const data = (opts = {}) => (req, json) => {
  const u = new URL(req.url()); const path = u.pathname;
  if (req.method() !== 'GET') return undefined;
  if (opts.chyby?.[path]) return json({ error: 'Server spadl' }, opts.chyby[path]);
  if (path === '/api/finance') return json({ ...s('k69-b5b-finance'), month: u.searchParams.get('month') });
  if (path === '/api/finance/advice') return json(s('k69-b5b-finance-advice'));
  if (path === '/api/pos/daily') return json(s('k69-b5b-pos-daily'));
  if (path === '/api/pos/margins') return json(s('k69-b5b-pos-margins'));
  if (path === '/api/pos/status') return json(s('k69-b5b-pos-status'));
  if (path === '/api/receipts') return json(s('k69-b5b-receipts'));
  if (path === '/api/inventory/shrinkage') return json(s('k69-b5b-shrinkage'));
  if (path === '/api/organization/overview') return json(opts.prehled ?? { ...fixtura('organization_overview'), month: u.searchParams.get('month') });
  return undefined;
};

async function prvniH1(p) {
  return p.evaluate(() => {
    const h = [...document.querySelectorAll('h1')].filter(e => e.offsetParent !== null);
    const plocha = document.querySelector('[data-plocha]');
    const prvniLi = plocha?.querySelector('li[data-widget]:not([hidden])');
    return { pocet: h.length, nad: !!h[0] && !!prvniLi && h[0].getBoundingClientRect().top < prvniLi.getBoundingClientRect().top, text: h[0]?.innerText ?? '' };
  });
}
const pretece = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1
  || [...document.querySelectorAll('main')].some(m => m.scrollWidth > m.clientWidth + 1));

// ===========================================================================
// Finance
// ===========================================================================
{
  const { ctx, p, stav, chyby } = await kontext({ fix: s('k69-b5b-rozlozeni-finance'), dalsi: data() });
  await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
  await p.waitForTimeout(1200);
  const h = await prvniH1(p);
  tvrdi('finance 1: právě jeden h1 „Finance" a leží nad widgety', h.pocet === 1 && h.nad && h.text === 'Finance', JSON.stringify(h));
  tvrdi('finance 1: nástroj (kniha výdajů) je v klidu vidět', await p.locator('[data-plocha] li[data-widget="nastroj"] >> text=Výdaje').first().isVisible());
  const souhrn = await text(p, 'finance.souhrn_mesice');
  tvrdi('finance 1: Souhrn měsíce ukazuje tržby 184 320', /184 320/.test(souhrn), souhrn.slice(0, 120));
  const inkoust = await p.$$eval('[data-plocha] li[data-widget] section', els => els.filter(e => getComputedStyle(e).backgroundColor === 'rgb(22, 24, 26)').length);
  tvrdi('finance 1: právě jedna inkoustová plocha (Souhrn měsíce)', inkoust === 1, String(inkoust));
  tvrdi('finance 1: podíl mezd proti cíli 28 %', /26 %/.test(await text(p, 'finance.trzby_vs_mzdy')) && /cíl 28 %/.test(await text(p, 'finance.trzby_vs_mzdy')), await text(p, 'finance.trzby_vs_mzdy'));
  tvrdi('finance 1: Kam šly peníze říká, co nejvíc leží ve skladu (N8)', /Káva Brazílie/.test(await text(p, 'finance.kam_sly_penize')));
  tvrdi('finance 1: žádná chyba v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));

  // Jeden dotaz na /api/finance pro souhrn, podíl mezd, Kam šly peníze i knihu výdajů.
  const financeDotazu = new Set(dotazyNa(stav, ['/api/finance']).filter(d => !d.path.includes('advice')).map(d => d.u)).size;
  tvrdi('finance 1: widgety a kniha výdajů sdílí jednu URL /api/finance', financeDotazu === 1, String(financeDotazu));

  // 7) Rozepsané hledání v nástroji přežije úpravy.
  const hledat = p.getByRole('combobox', { name: 'Hledat ve výdajích' }).or(p.getByLabel('Hledat ve výdajích')).first();
  await hledat.fill('Makro');
  await p.waitForTimeout(300);

  // 8) Měsíc z hlavičky řídí widgety i nástroj.
  const pred = stav.dotazy.length;
  await p.getByRole('button', { name: 'Předchozí měsíc' }).click();
  await p.waitForTimeout(1200);
  const nove = new Set(stav.dotazy.slice(pred).filter(d => d.path === '/api/finance').map(d => new URL(d.u).searchParams.get('month')));
  const [y, m] = dnes.split('-').map(Number);
  const minuly = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  tvrdi('finance 8: „Předchozí měsíc" načte minulý měsíc jednou URL pro widgety i knihu', nove.size === 1 && nove.has(minuly), [...nove].join(','));

  // 2) Úpravy: nástroj je zástupce bez „−" a jde posunout šipkou → PUT.
  await upravit(p).click();
  await dokud(() => vUpravach(p), 2000);
  const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
  tvrdi('finance 2: nástroj v úpravách bez „−"', await nastroj.locator('[data-odznak]').count() === 0);
  tvrdi('finance 2: nástroj sbalený do zástupce', /v úpravách je sbalená/.test(await nastroj.innerText()));
  const putu = stav.puty.length;
  await nastroj.focus();
  await p.keyboard.press('ArrowUp');
  await dokud(() => stav.puty.length > putu, 2500);
  const put = stav.puty[stav.puty.length - 1];
  const idx = (put?.polozky ?? []).findIndex(x => x.widget === 'nastroj');
  tvrdi('finance 2: posun nástroje nad widget pošle PUT s novým pořadím', stav.puty.length > putu && idx === (put.polozky.length - 2), `index ${idx} z ${put?.polozky?.length}`);

  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(400);
  const g = await galerie.innerText();
  const doporucene = g.split(/Doporučené pro tuto stránku/i)[1]?.split(/\n(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ ]{4,}\n)/)[0] ?? '';
  tvrdi('finance 3: galerie má „Doporučené" s widgety balíku', /Doporučené/i.test(g) && ['Tržba po dnech', 'Top produkty', 'Stav pokladny'].every(x => doporucene.includes(x)), doporucene.slice(0, 200));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await hotovo(p).click();
  await dokud(async () => !(await vUpravach(p)), 2000);
  tvrdi('finance 7: rozepsané hledání přežilo úpravy', (await hledat.inputValue()) === 'Makro', await hledat.inputValue());
  await p.screenshot({ path: OUT + 'k69-b5b-finance-desk.png', fullPage: true });
  await ctx.close();
}

// 5) 500 na maržích → chyba jen v jednom widgetu.
{
  const { ctx, p } = await kontext({ fix: s('k69-b5b-rozlozeni-finance'), dalsi: data({ chyby: { '/api/pos/margins': 500 } }) });
  await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
  await p.waitForTimeout(1500);
  const sChybou = await p.$$eval('[data-plocha] li[data-widget]', els => els.filter(e => /Zkusit znovu/.test(e.textContent ?? '')).map(e => e.getAttribute('data-widget')));
  tvrdi('finance 5: 500 na /api/pos/margins → „Zkusit znovu" jen u Marže', sChybou.length === 1 && sChybou[0] === 'finance.marze', sChybou.join(','));
  tvrdi('finance 5: ostatní widgety žijí (souhrn má čísla)', /184 320/.test(await text(p, 'finance.souhrn_mesice')));
  await ctx.close();
}

// 4) Oprávnění: Provozní (bez financí) — žádný finanční widget ani dotaz; kniha výdajů vysvětlí proč.
{
  const { ctx, p, stav } = await kontext({ fix: s('k69-b5b-rozlozeni-finance'), mineData: roleMine('provozni'), dalsi: data() });
  await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
  await p.waitForTimeout(1500);
  const vidim = await p.$$eval('[data-plocha] li[data-widget]:not([hidden])', els => els.map(e => e.getAttribute('data-widget')));
  tvrdi('finance 4: Provozní nevidí žádný widget financí ani tržeb', vidim.every(w => w === 'nastroj'), vidim.join(','));
  const zakazane = dotazyNa(stav, ['/api/finance', '/api/pos/daily', '/api/pos/margins', '/api/inventory/shrinkage', '/api/receipts']);
  tvrdi('finance 4: a jejich endpointy se nevolají', zakazane.length === 0, zakazane.map(d => d.path).join(','));
  tvrdi('finance 4: kniha výdajů místo 403 řekne, kdo ji vidí', /vidí jen role s přístupem k financím/.test(await p.locator('[data-plocha]').innerText()));
  await ctx.close();
}
{
  // Účetní bez finance.mzdy: podíl mezd není, souhrn ano.
  const { ctx, p } = await kontext({ fix: s('k69-b5b-rozlozeni-finance'), mineData: roleMine('ucetni', ['finance.mzdy']), dalsi: data() });
  await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
  await p.waitForTimeout(1200);
  tvrdi('finance 4: bez finance.mzdy není Tržby vs. mzdy, Souhrn měsíce ano',
    await naPlose(p, 'finance.trzby_vs_mzdy') === 0 && await naPlose(p, 'finance.souhrn_mesice') === 1);
  await ctx.close();
}

// 6) Telefon 390.
{
  const { ctx, p } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, fix: s('k69-b5b-rozlozeni-finance'), dalsi: data() });
  await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
  await p.waitForTimeout(1200);
  tvrdi('finance 6: telefon bez vodorovného přetečení', !(await pretece(p)));
  const exp = p.getByRole('button', { name: 'Export pro účetní' });
  tvrdi('finance 6: hlavní akce Export pro účetní vidět a klikatelná', await exp.isVisible() && await exp.isEnabled());
  await exp.click();
  await p.waitForTimeout(500);
  tvrdi('finance 6: Export otevře okno (ne ruční překryv)', await p.getByRole('dialog', { name: 'Export pro účetní' }).isVisible());
  await p.screenshot({ path: OUT + 'k69-b5b-finance-tel.png', fullPage: true });
  await ctx.close();
}

// ===========================================================================
// TO GO (telefon, režim togo)
// ===========================================================================
async function togo(opts) {
  const k = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, fix: s('k69-b5b-rozlozeni-togo'), dalsi: data(), ...opts });
  await k.ctx.addInitScript(() => { try { localStorage.setItem('managero-app-mode', 'togo'); } catch { /* soukromé okno */ } });
  await otevri(k.p, '/employer/overview', 'vedeni.togo');
  await k.p.waitForTimeout(1400);
  return k;
}
{
  const { ctx, p, chyby } = await togo();
  const h = await prvniH1(p);
  tvrdi('togo 1: právě jeden h1 s pozdravem nad widgety', h.pocet === 1 && h.nad && /Dobr|Hezk/.test(h.text), JSON.stringify(h));
  tvrdi('togo 1: TO GO nemá nástroj', await p.locator('[data-plocha] li[data-widget="nastroj"]').count() === 0);
  const inkoust = await p.$$eval('[data-plocha] li[data-widget] section', els => els.filter(e => getComputedStyle(e).backgroundColor === 'rgb(22, 24, 26)').map(e => e.closest('li')?.getAttribute('data-widget')));
  tvrdi('togo 1: jediná inkoustová plocha je Pokladna dnes', inkoust.length === 1 && inkoust[0] === 'pokladna.dnes', inkoust.join(','));
  tvrdi('togo 1: Tržba po dnech kreslí týden z pokladny', /z pokladny/.test(await text(p, 'trzby.po_dnech')));
  const dveS = await p.$$eval('[data-plocha] li[data-velikost="S"]:not([hidden])', els => els.slice(0, 2).map(e => e.getBoundingClientRect()).map(r => [Math.round(r.top), Math.round(r.left)]));
  tvrdi('togo 6: dva malé widgety vedle sebe', dveS.length === 2 && Math.abs(dveS[0][0] - dveS[1][0]) <= 1 && dveS[0][1] !== dveS[1][1], JSON.stringify(dveS));
  tvrdi('togo 6: bez vodorovného přetečení', !(await pretece(p)));
  const admin = p.getByRole('button', { name: 'Administrace' });
  tvrdi('togo 6: „Administrace" vidět a klikatelná (ne limetka)', await admin.isVisible() && !(await admin.getAttribute('class') ?? '').includes('C8F542'));
  tvrdi('togo 1: bez šipek-znaků a ručních odznaků', !/[↗↘→]/.test(await p.locator('body').innerText()));
  tvrdi('togo 1: žádná chyba v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await p.screenshot({ path: OUT + 'k69-b5b-togo-tel.png', fullPage: true });
  await ctx.close();
}
{
  const { ctx, p, stav } = await togo({ mineData: roleMine('provozni') });
  tvrdi('togo 4: Provozní (N2) nevidí tržbu ani týden tržeb', await naPlose(p, 'pokladna.dnes') === 0 && await naPlose(p, 'trzby.po_dnech') === 0);
  const zakazane = dotazyNa(stav, ['/api/pos/summary', '/api/pos/daily', '/api/closings/calendar']);
  tvrdi('togo 4: a na tržby neodešel žádný dotaz', zakazane.length === 0, zakazane.map(d => d.path).join(','));
  await ctx.close();
}
{
  const { ctx, p } = await togo({ dalsi: data({ chyby: { '/api/pos/daily': 500 } }) });
  const sChybou = await p.$$eval('[data-plocha] li[data-widget]', els => els.filter(e => /Zkusit znovu/.test(e.textContent ?? '')).map(e => e.getAttribute('data-widget')));
  tvrdi('togo 5: 500 na /api/pos/daily → chyba jen u widgetů z něj (týden, průměrná účtenka)',
    sChybou.length === 2 && sChybou.includes('trzby.po_dnech') && sChybou.includes('trzby.prumerna_uctenka'), sChybou.join(','));
  tvrdi('togo 5: Pokladna dnes žije', /Tržba/.test(await text(p, 'pokladna.dnes')));
  await ctx.close();
}

// ===========================================================================
// Všechny podniky
// ===========================================================================
{
  const { ctx, p, stav, chyby } = await kontext({ fix: s('k69-b5b-rozlozeni-podniky'), dalsi: data() });
  await otevri(p, '/employer/overview?view=org', 'vedeni.vsechny_podniky');
  await p.waitForTimeout(1200);
  const h = await prvniH1(p);
  tvrdi('podniky 1: právě jeden h1 „Všechny podniky" nad widgety', h.pocet === 1 && h.nad && h.text === 'Všechny podniky', JSON.stringify(h));
  const w = await text(p, 'organizace.podniky');
  tvrdi('podniky 1: widget sečte tržby 200 000 a mzdy 56 000 (28 %)', /200 000/.test(w) && /56 000/.test(w) && /28 %/.test(w), w.slice(0, 200));
  tvrdi('podniky 1: nástroj je vidět s kartou každého podniku', await p.locator('[data-plocha] li[data-widget="nastroj"] article').count() === 2);
  tvrdi('podniky 1: chip „chybí 2 uzávěrky" u Karlína', /chybí 2 uzávěrky/.test(await p.locator('[data-plocha] li[data-widget="nastroj"]').innerText()));
  tvrdi('podniky 1: mezi součty a seznamem je mezera (dřív 0 px)', await p.evaluate(() => {
    const a = document.querySelector('[data-plocha] li[data-widget="organizace.podniky"]')?.getBoundingClientRect();
    const b = document.querySelector('[data-plocha] li[data-widget="nastroj"]')?.getBoundingClientRect();
    return !!a && !!b && b.top - a.bottom >= 12;
  }));
  const pred = stav.dotazy.length;
  await p.getByRole('button', { name: 'Předchozí měsíc' }).click();
  await p.waitForTimeout(1000);
  const mesice = new Set(stav.dotazy.slice(pred).filter(d => d.path === '/api/organization/overview').map(d => new URL(d.u).searchParams.get('month')));
  tvrdi('podniky 8: předchozí měsíc = jedna nová URL pro widget i seznam', mesice.size === 1, [...mesice].join(','));
  tvrdi('podniky 1: žádná chyba v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await p.screenshot({ path: OUT + 'k69-b5b-podniky-desk.png', fullPage: true });

  // Úpravy: nástroj bez „−", posun → PUT.
  await upravit(p).click();
  await dokud(() => vUpravach(p), 2000);
  const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
  tvrdi('podniky 2: nástroj v úpravách bez „−"', await nastroj.locator('[data-odznak]').count() === 0);
  const putu = stav.puty.length;
  await nastroj.focus();
  await p.keyboard.press('ArrowUp');
  await dokud(() => stav.puty.length > putu, 2500);
  tvrdi('podniky 2: nástroj nad widget → PUT', stav.puty.length > putu && stav.puty.at(-1).polozky[0].widget === 'nastroj');
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  tvrdi('podniky 3: galerie má „Doporučené" s Všemi podniky', /Doporučené[\s\S]*Všechny podniky/i.test(await galerie.innerText()));
  await ctx.close();
}
{
  // Tržby a mzdy bez oprávnění v podniku (API null) → „skryto", ne „0 Kč".
  const prehled = { ...fixtura('organization_overview'), teams: fixtura('organization_overview').teams.map((t, i) => (i === 1 ? { ...t, revenue: null, wages: null } : t)), total: { ...fixtura('organization_overview').total, revenue: null, wages: null, laborPct: null } };
  const { ctx, p } = await kontext({ fix: s('k69-b5b-rozlozeni-podniky'), dalsi: data({ prehled }) });
  await otevri(p, '/employer/overview?view=org', 'vedeni.vsechny_podniky');
  await p.waitForTimeout(1200);
  const t = (await p.locator('[data-plocha]').innerText()).replace(/ /g, ' ');
  tvrdi('podniky 4: skryté tržby a mzdy jsou „skryto", nikde „0 Kč"', /skryto/.test(t) && !/\b0 Kč/.test(t), t.match(/.{0,30}0 Kč.{0,20}/)?.[0] ?? '');
  await ctx.close();
}
{
  // Vypnutý přehled: EmptyState s cestou do nastavení, widget v klidu mlčí.
  const prehled = { available: false, reason: 'vypnuto', message: 'Přehled za všechny podniky je v nastavení organizace vypnutý.' };
  const { ctx, p } = await kontext({ fix: s('k69-b5b-rozlozeni-podniky'), dalsi: data({ prehled }) });
  await otevri(p, '/employer/overview?view=org', 'vedeni.vsechny_podniky');
  await p.waitForTimeout(1200);
  const t = await p.locator('[data-plocha]').innerText();
  tvrdi('podniky 4: vypnutý přehled řekne proč a kde se zapíná', /vypnutý/.test(t) && /Nastavení týmu/.test(t));
  tvrdi('podniky 4: s tlačítkem „Otevřít nastavení" (žádná slepá ulička)', await p.getByRole('button', { name: 'Otevřít nastavení' }).count() === 1);
  await ctx.close();
}
{
  const { ctx, p } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, fix: s('k69-b5b-rozlozeni-podniky'), dalsi: data() });
  await otevri(p, '/employer/overview?view=org', 'vedeni.vsechny_podniky');
  await p.waitForTimeout(1200);
  tvrdi('podniky 6: telefon bez vodorovného přetečení', !(await pretece(p)));
  const otevrit = p.getByRole('button', { name: 'Otevřít' }).first();
  tvrdi('podniky 6: „Otevřít" u podniku vidět a klikatelné', await otevrit.isVisible() && await otevrit.isEnabled());
  await p.screenshot({ path: OUT + 'k69-b5b-podniky-tel.png', fullPage: true });
  await ctx.close();
}

await konec();
