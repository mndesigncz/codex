// Kolo 69, balík B4 (Receptury a menu) — jednotkové testy.
//
// Čistá logika je v lib/recepturyPrehled.ts: výběr dat z /api/pos/products
// a /api/menu, pokrytí recepturou, fronta prodejů bez receptury, věta odpisu
// (N1) a výběry pro widgety menu. Hlídá se hlavně to, co se dřív pokazilo:
// pokrytí nad 100 % (receptura k produktu, který kasa už nevede), nuly místo
// chyby u nečekané odpovědi, vyprodáno nabízené i u vypnutého menu (veřejný
// endpoint ho odmítne) a „Odepsat prodeje" volající PATCH, který neexistuje.
// K tomu katalog a stránky balíku a pár pojistek nad zdrojáky.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import type { Divak } from '../../lib/widgety/typy.ts';
import {
  vyberReceptury, pokryti, prodejeBezReceptury, vetaOdpisu, vyberMenu, hlavniDeska, wifiMenu, nesparovano,
  radkyVyprodano, pocetVyprodanych,
} from '../../lib/recepturyPrehled.ts';
import { WIDGETY as RECEPTURY } from '../../lib/widgety/katalog/receptury.ts';
import { WIDGETY as MENU } from '../../lib/widgety/katalog/menu.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { stranka } from '../../lib/widgety/stranky/index.ts';
import { vyresRozlozeni, jeViditelny } from '../../lib/widgety/rozlozeni.ts';
import { KATALOG, SYSTEMOVE_ROLE } from '../../lib/opravneni.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Kód bez komentářů — komentáře popisují, co se opravilo („dřív confirm()"), a pojistky by chytaly je. */
const kod = (cesta: string) => zdroj(cesta).split('\n').filter(r => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(r)).join('\n');

const produkty = {
  connected: true,
  products: [
    { productId: 'p1', name: 'Latte', category: 'Káva', price: 75 },
    { productId: 'p2', name: 'Espresso', category: 'Káva', price: 55 },
    { productId: 'p3', name: 'Limonáda', category: 'Nápoje', price: null },
    { productId: 'p4', name: 'Blue Lagoon', category: 'Drinky', price: 160 },
  ],
  recipes: [
    { productId: 'p1', productName: 'Latte', ingredients: [{ itemId: 1, amount: 0.2, itemName: 'Mléko', itemUnit: 'l' }] },
    { productId: 'p2', productName: 'Espresso', ingredients: [{ itemId: 2, amount: 0.009, itemName: 'Káva', itemUnit: 'kg' }] },
    // Receptura k produktu, který kasa už nevede — pokrytí nesmí zvednout.
    { productId: 'stary', productName: 'Svařák', ingredients: [{ itemId: 3, amount: 0.2 }] },
    // Prázdná receptura není receptura.
    { productId: 'p4', productName: 'Blue Lagoon', ingredients: [] },
  ],
  unmapped: [
    { productId: 'p3', productName: 'Limonáda', soldCount: 12 },
    { productId: 'p4', productName: 'Blue Lagoon', soldCount: 30 },
    { productId: 'p1', productName: 'Latte', soldCount: 99 }, // mezitím dostal recepturu
    { productId: 'p4', productName: 'Blue Lagoon', soldCount: 1 }, // dvakrát ze serveru
  ],
};

const menuRaw = {
  boards: [
    {
      id: 1, slug: 'stala', name: 'Stálá nabídka', enabled: true, hasPin: true, wifiSsid: null, wifiPassword: null,
      sections: [{ title: 'Káva', items: [
        { id: 11, name: 'Latte', price: 75, soldOut: false, posProductId: 'p1' },
        { id: 12, name: 'Mražená káva', price: 0, soldOut: true, posProductId: null },
      ] }],
    },
    {
      id: 2, slug: 'akce', name: 'Venkovní akce', enabled: true, wifiSsid: 'Kavarna-host', wifiPassword: 'kafe2026',
      sections: [{ title: 'Drinky', items: [
        { id: 21, name: 'Mojito', price: 150, soldOut: true },
        { id: 22, name: 'Limonáda', price: 60, soldOut: false },
      ] }],
    },
    {
      id: 3, slug: 'zima', name: 'Zimní menu', enabled: false,
      sections: [{ title: 'Teplé', items: [{ id: 31, name: 'Svařák', price: 90, soldOut: true }] }],
    },
  ],
};

export default function ({ eq, ok }: Testy) {
  // ---- receptury ----
  const d = vyberReceptury(produkty);
  eq('receptury: výběr produktů, cena null zůstává null (ne 0)', [d.propojeno, d.produkty.length, d.produkty[2].price], [true, 4, null]);
  eq('receptury: nepřipojená pokladna je platná odpověď', vyberReceptury({ connected: false, products: [], recipes: [], unmapped: [] }).propojeno, false);
  for (const spatne of [null, [], 'x']) {
    let hodila = false; try { vyberReceptury(spatne); } catch { hodila = true; }
    ok(`receptury: nečekaný tvar (${JSON.stringify(spatne)}) je chyba widgetu, ne nuly`, hodila);
  }
  const sklad = [{ id: 1 }, { id: 2 }, { id: 3, archived: true }, { id: 4, approved: false }, null];
  const p = pokryti(d, sklad);
  eq('pokrytí: průnik produktů kasy a neprázdných receptur (2 ze 4 = 50 %), stará receptura ani prázdná se nepočítá',
    [p.procento, p.sRecepturou, p.produktu], [50, 2, 4]);
  eq('pokrytí: sklad bez odložených a neschválených návrhů', p.polozekSkladu, 2);
  eq('pokrytí: sklad nenačtený / bez oprávnění = null, ne 0', pokryti(d, null).polozekSkladu, null);
  eq('pokrytí: kasa bez položek = null procent (ne dělení nulou)', pokryti(vyberReceptury({ connected: true }), []).procento, null);
  const vsechnyRec = vyberReceptury({ ...produkty, recipes: [...produkty.recipes, ...['p3', 'p4', 'x1', 'x2'].map(id => ({ productId: id, ingredients: [{ itemId: 1, amount: 1 }] }))] });
  ok('pokrytí: nikdy přes 100 % (dřív recipes.length / products.length)', (pokryti(vsechnyRec, []).procento ?? 0) <= 100);
  eq('bez receptury: nejprodávanější první, bez produktů s recepturou, bez duplicit',
    prodejeBezReceptury(d).map(u => [u.productId, u.prodano]), [['p4', 30], ['p3', 12]]);
  eq('bez receptury: strop (M = 5, L = 20)', prodejeBezReceptury(d, 1).length, 1);
  eq('pokrytí: „prodává se bez" = délka fronty po očištění', p.prodavaSeBez, 2);

  // ---- N1: věta odpisu ----
  eq('odpis (N1): nepřipojená pokladna, chyba serveru, běžící odpis',
    [vetaOdpisu({ connected: false }).chyba, vetaOdpisu({ connected: true, error: 'Zrcadlo chybí' }).text, vetaOdpisu({ connected: true, throttled: true }).chyba],
    [true, 'Zrcadlo chybí', false]);
  eq('odpis (N1): nic nového / prodeje bez receptur', [vetaOdpisu({ connected: true, processed: 0, deducted: [] }).text, vetaOdpisu({ connected: true, processed: 3, deducted: [] }).text],
    ['Žádné nové prodeje k odepsání.', 'Prodeje prošly, ale nebylo co odepsat — položky nemají recepturu.']);
  eq('odpis (N1): tři tvary po číslovce', [
    vetaOdpisu({ connected: true, processed: 1, deducted: [{}] }).text,
    vetaOdpisu({ connected: true, processed: 3, deducted: [{}, {}, {}] }).text,
    vetaOdpisu({ connected: true, processed: 5, deducted: [{}, {}, {}, {}, {}] }).text,
  ], ['Odepsáno ze skladu: 1 položka z 1 účtenky.', 'Odepsáno ze skladu: 3 položky z 3 účtenek.', 'Odepsáno ze skladu: 5 položek z 5 účtenek.']);

  // ---- menu ----
  const m = vyberMenu(menuRaw);
  eq('menu: počty položek, bez ceny a spárovaných', m.desky.map(x => [x.polozek, x.bezCeny, x.sparovano]), [[2, 1, 1], [2, 0, 0], [1, 0, 0]]);
  eq('menu: nespárované jen u menu, které párování používá', m.desky.map(nesparovano), [1, 0, 0]);
  eq('menu: nezmigrovaná databáze = platná odpověď', vyberMenu({ boards: [], notMigrated: true }), { nezmigrovano: true, desky: [] });
  let bezDesek = false; try { vyberMenu({}); } catch { bezDesek = true; }
  ok('menu: odpověď bez seznamu menu je chyba, ne „žádné menu"', bezDesek);
  eq('menu: hlavní = s adresou „akce", jinak první zapnuté', [hlavniDeska(m.desky)?.id, hlavniDeska(m.desky.filter(x => x.id !== 2))?.id, hlavniDeska([])], [2, 1, null]);
  eq('menu: Wi-Fi z hlavního menu, jinak z prvního, které ji má', [wifiMenu(m.desky)?.wifiSsid, wifiMenu(m.desky.filter(x => x.id !== 2))], ['Kavarna-host', null]);
  eq('vyprodáno: jen zapnutá menu (vypnuté Zimní se nepočítá ani nenabízí)', [pocetVyprodanych(m.desky), radkyVyprodano(m.desky).map(r => r.id)], [2, [21, 12]]);
  eq('vyprodáno: hledání bez diakritiky najde i nevyprodané, vyprodané první',
    radkyVyprodano(m.desky, 'mrazena').map(r => [r.id, r.vyprodano]), [[12, true]]);
  eq('vyprodáno: hledání přes sekci, řádek nese adresu menu (pro přepnutí)',
    radkyVyprodano(m.desky, 'drinky').map(r => [r.id, r.slug]), [[21, 'akce'], [22, 'akce']]);
  const slaby = vyberMenu({ boards: [{ id: 2, slug: 'akce', name: 'Akce', enabled: true, sections: [{ title: 'Drinky', items: [{ id: 21, name: 'Mojito', soldOut: true }] }] }] });
  eq('menu: slabá odpověď (jen=vyprodano) bez cen nehlásí „bez ceny"', [slaby.desky[0].bezCeny, pocetVyprodanych(slaby.desky)], [0, 1]);

  // ---- katalog a stránky balíku ----
  const moje = [...RECEPTURY, ...MENU];
  eq('katalog B4: všech 5 widgetů receptur a menu je hotových', moje.filter(w => w.stav !== 'hotovo').map(w => w.id), []);
  eq('katalog B4: ikony se v oblastech neopakují (AK-19)', [...new Set(moje.map(w => w.ikona))].length, moje.length);
  eq('katalog B4: Vyprodáno vidí i role jen s menu.vyprodano (Barista, tablet), přepíná jen s ním',
    [widget('menu.vyprodano')?.opravneni.nektere, widget('menu.vyprodano')?.opravneni.pole?.['akce:prepnout_vyprodano']], [['menu.zobrazit', 'menu.vyprodano'], 'menu.vyprodano']);
  eq('katalog B4: Doplnit recepturu jen s receptury.upravit, Zveřejnit jen s menu.zverejnit',
    [widget('receptury.bez_receptury')?.opravneni.pole?.['akce:doplnit_recepturu'], widget('menu.stav')?.opravneni.pole?.['akce:zverejnit']], ['receptury.upravit', 'menu.zverejnit']);
  eq('katalog B4: Wi-Fi a Stav menu chtějí menu.zobrazit (heslo Wi-Fi patří pod něj)', [widget('menu.wifi')?.opravneni.vse, widget('menu.stav')?.opravneni.vse], [['menu.zobrazit'], ['menu.zobrazit']]);

  for (const id of ['vedeni.receptury', 'vedeni.menu'] as const) ok(`stránka ${id}: aktivní`, stranka(id)?.aktivni === true);
  eq('stránky: nástroj Receptur a editor menu mají své jméno a ikonu', [stranka('vedeni.receptury')?.nastroj?.nazev, stranka('vedeni.menu')?.nastroj?.nazev], ['Receptury z kasy', 'Editor menu']);

  const role = (klic: string, tarif: 'zdarma' | 'max' = 'max'): Divak => {
    const r = SYSTEMOVE_ROLE.find(x => x.klic === klic)!;
    return { userId: 1, typ: r.typ, klic, roleId: null, zdrojRole: null, opravneni: new Set(r.opravneni), tarif, jeSpravce: false };
  };
  const vid = (sid: string, dv: Divak) => vyresRozlozeni({ stranka: stranka(sid as any)!, divak: dv, osobni: null, vychozi: [] }).polozky.map(x => x.widget);
  const vlastnik: Divak = { ...role('vedeni'), opravneni: new Set(KATALOG.map(x => x.id)), jeSpravce: true };
  eq('výchozí Receptur pro vlastníka: pokrytí, marže, suroviny bez ceny, fronta, nástroj',
    vid('vedeni.receptury', vlastnik), ['receptury.pokryti', 'finance.marze', 'sklad.chybi_udaje', 'receptury.bez_receptury', 'nastroj']);
  eq('výchozí Menu pro vlastníka: stav, vyprodáno, Wi-Fi, editor', vid('vedeni.menu', vlastnik), ['menu.stav', 'menu.vyprodano', 'menu.wifi', 'nastroj']);
  ok('výchozí Menu bez tarifu Max: widgety menu (Max) se nekreslí, editor ano',
    (() => { const w = vid('vedeni.menu', { ...vlastnik, tarif: 'zdarma' }); return w.join() === 'nastroj'; })());
  for (const klic of ['provozni', 'skladnik', 'ucetni']) {
    const dv = role(klic);
    const w = vid('vedeni.receptury', dv).filter(x => x !== 'nastroj');
    ok(`výchozí Receptur pro ${klic}: jen widgety, na které má oprávnění`, w.every(id => jeViditelny(widget(id)!, dv)));
  }
  ok('Barista (Max) vidí Vyprodáno, ale ne Stav menu ani Wi-Fi', jeViditelny(widget('menu.vyprodano')!, role('barista')) && !jeViditelny(widget('menu.stav')!, role('barista')) && !jeViditelny(widget('menu.wifi')!, role('barista')));

  // ---- pojistky nad zdrojáky ----
  const recipes = kod('components/inventory/RecipesView.tsx');
  ok('Receptury (N1): odpis přes POST /api/pos/sync, ne neexistující PATCH /api/pos/products',
    recipes.includes("'/api/pos/sync'") && !/method: 'PATCH'/.test(recipes));
  ok('Receptury (N1): „Odepsat prodeje" jen s pokladna.synchronizovat', /ma\('pokladna\.synchronizovat'\)/.test(recipes));
  ok('Receptury: plocha vedeni.receptury s hlavičkou (žádný vlastní h1)', recipes.includes('stranka="vedeni.receptury"') && !/<h1/.test(recipes));
  ok('Receptury: smazání receptury bez setTimeout(save) (dřív odešla stará receptura)', !/setTimeout\(save/.test(recipes));
  const editor = kod('components/employer/MenuEditor.tsx');
  ok('Menu: plocha vedeni.menu, žádné prompt()/confirm(), ruční okno ani znaky ↑ ↓ × ↗ ＋', editor.includes('stranka="vedeni.menu"')
    && !/prompt\(|confirm\(|modal-overlay|[↑↓×↗＋]/.test(editor));
  ok('Menu: zrušení PINu jako částečná změna (dřív smazalo nadpis, Wi-Fi a poznámku)', /castecne: true, pin: ''/.test(editor));
  ok('Menu: pole podle oprávnění (ceny, zveřejnění, mazání)', ['menu.ceny', 'menu.zverejnit', 'menu.mazat', 'menu.vyprodano'].every(k => editor.includes(`smi('${k}')`)));
  const api = zdroj('app/api/menu/route.ts');
  ok('API menu: jen=vyprodano pustí menu.zobrazit i menu.vyprodano a nevrací ceny ani Wi-Fi',
    /jenVyprodano \? \['menu\.zobrazit', 'menu\.vyprodano'\]/.test(api) && /items: s\.items\.map\(i => \(\{ id: i\.id, name: i\.name, soldOut: i\.soldOut \}\)\)/.test(api));
  ok('API menu: částečná změna hlídá menu.zverejnit', /castecne === true\) \{\s*\n\s*if \(!c\.role\.opravneni\.has\('menu\.zverejnit'\)\)/.test(api));
  for (const soubor of ['components/widgety/oblasti/receptury.tsx', 'components/widgety/oblasti/menu.tsx']) {
    const s = zdroj(soubor);
    const cteni = [...s.matchAll(/fetch\(([^)]*)\)/g)].filter(x => !/method:/.test(s.slice(x.index!, x.index! + 200)));
    eq(`${soubor}: fetch jen pro zápis (čtení přes useDataWidgetu)`, cteni.map(x => x[0]), []);
    ok(`${soubor}: widget nikdy s limetkou ani pulzováním`, !/variant="accent"|animate-(pulse|ping)|btn-accent/.test(s));
  }
  const klice = (s: string) => [...(s.split('export const KOMPONENTY')[1] ?? '').matchAll(/'([a-z_.]+)':/g)].map(x => x[1]).sort();
  eq('oblasti B4: komponenty = hotové widgety katalogu (AK-20)',
    [...klice(zdroj('components/widgety/oblasti/receptury.tsx')), ...klice(zdroj('components/widgety/oblasti/menu.tsx'))].sort(), moje.map(w => w.id).sort());
  const drobne = ['components/inventory/ProductionRecipe.tsx', 'components/inventory/ItemRecipeLinks.tsx', 'components/inventory/ProductionGuideLink.tsx'].map(kod).join('\n');
  ok('okno položky: bez ručně tónovaných boxů, ručního přepínače a natvrdo „Kč"', !/bg-\[#0A84FF\]|bg-\[#C8F542\]\/\[0\.09\]|role="switch"| Kč`/.test(drobne) && /<Switch /.test(drobne));
}
