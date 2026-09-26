// Kolo 68 — plocha z klávesnice (spec §4.9, §7.2 k68-klavesnice, AK-9, AK-12).
//
// Tah nikdy není jediná cesta: Enter na „Upravit" vstoupí do úprav a fokus
// skočí na první widget, šipky přesouvají hned a bez animace (emil: akce
// z klávesnice se neanimují), odečítač hlásí „pozice i z n", Enter otevře
// menu s Posunout výš/níž, Delete odebere, Ctrl+Z vrátí a Escape úpravy
// ukončí s fokusem zpátky na „Upravit". Každá změna se uloží PUTem.
import { kontext, konec, tvrdi, otevri, poradi, upravit, vUpravach, hlaseni, dokud, poradiPutu, FIX_VEDENI } from './k68-spolecne.mjs';

const PUVODNI = FIX_VEDENI.polozky.map(x => x.id);
const { ctx, p, stav, chyby } = await kontext();
await otevri(p, '/employer/overview');
const aktivni = () => p.evaluate(() => {
  const a = document.activeElement;
  return { tag: a?.tagName ?? null, instance: a?.getAttribute('data-instance') ?? null, text: (a?.textContent ?? '').trim().slice(0, 30), role: a?.getAttribute('role') ?? null };
});

// 1) Fokus na „Upravit", Enter → úpravy, fokus na prvním widgetu.
await upravit(p).focus();
await p.keyboard.press('Enter');
tvrdi('1: Enter na „Upravit" vstoupí do úprav', await dokud(() => vUpravach(p), 1500));
tvrdi('1: fokus skočí na první widget', await dokud(async () => (await aktivni()).instance === PUVODNI[0], 1500), JSON.stringify(await aktivni()));
const popis = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
tvrdi('1: widget v úpravách má jméno „název, velikost, pozice i z n"', /^Docházející zásoby, malý widget, pozice 1 z 8$/.test(popis ?? ''), popis);
tvrdi('1: hlášení vstupu do úprav', (await hlaseni(p)).startsWith('Úpravy stránky.'), await hlaseni(p));

// 2) ArrowDown → o místo dál, hlášení „pozice 2 z 8", hned bez transformace, PUT do 1 s.
await p.keyboard.press('ArrowDown');
const hned = await p.evaluate(() => {
  const li = document.querySelector('[data-plocha] li[data-instance="sklad-dochazi"]');
  return { t: li?.style.transform ?? null, index: li ? [...li.parentElement.querySelectorAll(':scope > li[data-instance]')].indexOf(li) : -1 };
});
tvrdi('2: šipka přesune widget hned o jedno místo dál', hned.index === 1, JSON.stringify(hned));
tvrdi('2: přesun z klávesnice se neanimuje (transform prázdný hned po stisku)', hned.t === '' || hned.t === 'none', hned.t);
tvrdi('2: hlášení „pozice 2 z 8"', await dokud(async () => (await hlaseni(p)).includes('pozice 2 z 8'), 1000), await hlaseni(p));
tvrdi('2: fokus zůstal na přesunutém widgetu', (await aktivni()).instance === 'sklad-dochazi');
await dokud(() => stav.puty.length > 0, 1000);
tvrdi('2: do 1 s odejde PUT s novým pořadím', stav.puty.length === 1 && poradiPutu(stav.puty[0])[1] === 'sklad-dochazi', JSON.stringify(poradiPutu(stav.puty[0])));
await p.keyboard.press('Home');
tvrdi('2: Home vrátí widget na začátek', await dokud(async () => (await poradi(p))[0] === 'sklad-dochazi', 1000), JSON.stringify(await poradi(p)));

// 3) Enter → menu s Posunout výš / Posunout níž; Escape → fokus zpět na widget.
await p.keyboard.press('Enter');
const menu = p.getByRole('menu');
await menu.waitFor({ timeout: 2000 }).catch(() => {});
const polozky = (await menu.getByRole('menuitem').allInnerTexts()).map(s => s.trim());
tvrdi('3: Enter otevře menu s Posunout výš a Posunout níž', polozky.includes('Posunout výš') && polozky.includes('Posunout níž') && polozky.includes('Odebrat widget'), JSON.stringify(polozky));
tvrdi('3: fokus je v menu', await dokud(async () => (await aktivni()).role === 'menuitem', 1000), JSON.stringify(await aktivni()));
await p.keyboard.press('Escape');
tvrdi('3: Escape menu zavře a vrátí fokus na widget', await dokud(async () => (await p.getByRole('menu').count()) === 0 && (await aktivni()).instance === 'sklad-dochazi', 1000), JSON.stringify(await aktivni()));
tvrdi('3: Escape z menu úpravy neukončí', await vUpravach(p));
// Posunout níž z menu (cesta pro odečítač na dotyku).
await p.keyboard.press('Enter');
await menu.waitFor({ timeout: 2000 }).catch(() => {});
await p.getByRole('menuitem', { name: 'Posunout níž' }).click();
tvrdi('3: „Posunout níž" přesune widget', await dokud(async () => (await poradi(p))[1] === 'sklad-dochazi', 1000), JSON.stringify(await poradi(p)));

// 4) Delete → pryč + toast Vrátit; Ctrl+Z → zpátky, „Vráceno", PUT.
await p.locator('[data-plocha] li[data-instance="sklad-dochazi"]').focus();
const putu = stav.puty.length;
await p.keyboard.press('Delete');
tvrdi('4: Delete widget odebere', await dokud(async () => !(await poradi(p)).includes('sklad-dochazi'), 1000));
tvrdi('4: toast s „Vrátit"', await dokud(() => p.getByRole('button', { name: 'Vrátit' }).isVisible(), 1000));
tvrdi('4: hlášení „odebrán. Vrátit: Ctrl+Z."', (await hlaseni(p)).includes('odebrán. Vrátit: Ctrl+Z.'), await hlaseni(p));
tvrdi('4: fokus přešel na další widget', (await aktivni()).instance === PUVODNI[2] || (await aktivni()).tag === 'LI', JSON.stringify(await aktivni()));
await p.keyboard.press('Control+z');
tvrdi('4: Ctrl+Z widget vrátí na jeho místo', await dokud(async () => (await poradi(p))[1] === 'sklad-dochazi', 1000), JSON.stringify(await poradi(p)));
tvrdi('4: toast „Vráceno"', await dokud(() => p.getByText('Vráceno', { exact: true }).isVisible(), 1000));
await dokud(() => stav.puty.length >= putu + 1, 2000);
await p.waitForTimeout(600);
tvrdi('4: poslední PUT má widget zpátky', poradiPutu(stav.puty.at(-1)).includes('sklad-dochazi') && stav.puty.length > putu, `${stav.puty.length - putu} PUT`);

// 4b) Galerie z klávesnice: po přidání má fokus nový widget, ne „Přidat widget"
//     v liště (useModal vracel fokus na spouštěč až po layout efektu plochy).
{
  const tlacitko = p.getByRole('region', { name: 'Úpravy stránky' }).getByRole('button', { name: 'Přidat widget' });
  await tlacitko.focus();
  await p.keyboard.press('Enter');
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await galerie.getByLabel('Hledat widget').first().fill('dnesni smeny');
  await p.waitForTimeout(300);
  await galerie.getByRole('button', { name: 'Dnešní směny' }).focus();
  await p.keyboard.press('Enter');
  const detail = p.getByRole('dialog', { name: 'Dnešní směny' });
  await dokud(() => detail.isVisible(), 1500);
  await detail.getByRole('button', { name: 'Přidat widget' }).focus();
  await p.keyboard.press('Enter');
  await dokud(async () => (await p.getByRole('dialog').count()) === 0, 1500);
  // Nový widget se k sobě plynule doroluje a nabídka se rolováním zavírá — počkat, až dojede.
  await p.waitForTimeout(900);
  const fokus = await aktivni();
  const novy = (await poradi(p)).find(id => id?.startsWith('rozvrh'));
  tvrdi('4b: po přidání z galerie má fokus nový widget', !!novy && fokus.instance === novy, JSON.stringify({ fokus, novy }));
  // Enter → Nastavit widget → Escape: fokus zpátky na widget, ne na <body>.
  await p.keyboard.press('Enter');
  const menuN = p.getByRole('menu');
  await menuN.waitFor({ timeout: 2000 }).catch(() => {});
  const nastavit = menuN.getByRole('menuitem', { name: 'Nastavit widget' });
  if (await nastavit.count()) {
    await nastavit.focus();
    await p.keyboard.press('Enter');
    await dokud(async () => (await p.getByRole('dialog').count()) === 1, 1500);
    await p.keyboard.press('Escape');
    await dokud(async () => (await p.getByRole('dialog').count()) === 0, 1500);
    await p.waitForTimeout(200);
    const f2 = await aktivni();
    tvrdi('4b: po zavření nastavení otevřeného z nabídky je fokus zpátky na widgetu', f2.instance === novy, JSON.stringify(f2));
  } else {
    tvrdi('4b: nový widget má v nabídce „Nastavit widget"', false, JSON.stringify(await menuN.getByRole('menuitem').allInnerTexts()));
    await p.keyboard.press('Escape');
  }
  tvrdi('4b: po oknech plocha zůstala v úpravách', await vUpravach(p));
  // Nový widget zase pryč, ať kroky dál počítají s původní plochou.
  await p.locator(`[data-plocha] li[data-instance="${novy}"]`).focus();
  await p.keyboard.press('Delete');
  await dokud(async () => !(await poradi(p)).includes(novy), 1000);
}

// 5) Escape → úpravy skončí, fokus na „Upravit".
await p.locator('[data-plocha] li[data-instance="sklad-dochazi"]').focus();
await p.keyboard.press('Escape');
tvrdi('5: Escape úpravy ukončí', await dokud(async () => !(await vUpravach(p)), 1500));
tvrdi('5: fokus se vrátí na „Upravit"', await dokud(async () => (await aktivni()).text === 'Upravit', 1000), JSON.stringify(await aktivni()));
tvrdi('5: v klidu nemají widgety tabIndex (nejsou v Tabu navíc)', await p.$$eval('[data-plocha] li[data-widget]', els => els.every(e => !e.hasAttribute('tabindex'))));

// Shift+F10 v klidu na odkazu uvnitř widgetu otevře jeho menu (Nastavit / Upravit stránku / Odebrat).
const odkaz = p.locator('[data-plocha] li[data-instance="pokladna-dnes"] button').first();
if (await odkaz.count()) {
  await odkaz.focus();
  await p.keyboard.press('Shift+F10');
  const t = (await p.getByRole('menu').getByRole('menuitem').allInnerTexts().catch(() => [])).map(s => s.trim());
  tvrdi('klid: Shift+F10 uvnitř widgetu otevře jeho menu', t.includes('Upravit stránku'), JSON.stringify(t));
  await p.keyboard.press('Escape');
}
// Klepnutí mimo (mezera mřížky) úpravy ukončí.
await upravit(p).click();
await dokud(() => vUpravach(p), 1500);
// Klepnutí do 400 ms po vstupu se za „mimo" nepočítá (dvojklik na „Upravit").
await p.waitForTimeout(500);
const a = await p.locator('[data-plocha] li[data-widget]').nth(0).boundingBox();
const b = await p.locator('[data-plocha] li[data-widget]').nth(1).boundingBox();
await p.mouse.click((a.x + a.width + b.x) / 2, a.y + a.height / 2);
tvrdi('klepnutí na prázdné místo úpravy ukončí', await dokud(async () => !(await vUpravach(p)), 1500));
tvrdi('bez chyb v konzoli', chyby.length === 0, chyby.join(' | ').slice(0, 300));
await ctx.close();
await konec();
