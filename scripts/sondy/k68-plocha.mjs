// Kolo 68 — plocha s widgety na Přehledu vedení (spec §7.2 k68-plocha, AK-1–8, 10, 16, 20, 22).
//
// Monitor 1280 × 950, vlastník, osobní rozložení z fixtury (8 widgetů S/M/L).
// Tvrdí mechaniku úprav jako na iOS: podržení otevře menu (a pohyb ho zruší),
// podržení prázdného místa a „Upravit" vstoupí do úprav, widgety se vlní
// s různou fází, tah změní pořadí a pošle JEDEN PUT se správným pořadím
// a verzí, obnovení stránky pořadí drží, 409 převezme novější stav serveru,
// „−" odebere s Vrátit, galerie přidá widget ve zvolené velikosti, nastavení
// uloží velikost (Zrušit nic nepošle), omezený pohyb nic nehýbe a pád
// jednoho endpointu shodí jen jeden widget.
import {
  kontext, konec, tvrdi, otevri, poradi, li, lista, hotovo, upravit, vUpravach, hlaseni, stred, dokud,
  podrzMysi, tahniMysi, poradiPutu, FIX_VEDENI, OUT,
} from './k68-spolecne.mjs';

const PREHLED = '/employer/overview';
const PUVODNI = FIX_VEDENI.polozky.map(x => x.id);

// 1–8: jeden kontext, stav podvrhu rozložení se nese dál (jako skutečný server).
{
  const { ctx, p, stav, chyby } = await kontext();
  await otevri(p, PREHLED);
  tvrdi('výchozí pořadí z GET', JSON.stringify(await poradi(p)) === JSON.stringify(PUVODNI), JSON.stringify(await poradi(p)));

  // 1) Podržení widgetu myší → kontextové menu; pohyb o 20 px před 500 ms menu neotevře.
  const sklad = await stred(li(p, 'sklad-dochazi'));
  await podrzMysi(p, sklad.x, sklad.y);
  const menu = p.getByRole('menu');
  await menu.waitFor({ timeout: 2000 }).catch(() => {});
  const polozkyMenu = (await menu.getByRole('menuitem').allInnerTexts()).map(s => s.trim());
  tvrdi('1: podržení widgetu otevře menu Nastavit widget / Upravit stránku / Odebrat widget',
    JSON.stringify(polozkyMenu) === JSON.stringify(['Nastavit widget', 'Upravit stránku', 'Odebrat widget']), JSON.stringify(polozkyMenu));
  tvrdi('1: podržení nevstoupí do úprav', !(await vUpravach(p)));
  await p.keyboard.press('Escape');
  tvrdi('1: Escape menu zavře', await dokud(async () => (await p.getByRole('menu').count()) === 0, 1000));
  await p.mouse.move(sklad.x, sklad.y); await p.mouse.down();
  await p.mouse.move(sklad.x + 20, sklad.y, { steps: 4 });
  await p.waitForTimeout(650); await p.mouse.up();
  tvrdi('1: pohyb o 20 px před 500 ms menu neotevře', (await p.getByRole('menu').count()) === 0);
  tvrdi('1: po podržení se nic neuložilo', stav.puty.length === 0, `${stav.puty.length} PUT`);
  // Myš po puštění pošle click na natažený odkaz malé karty (tak to prohlížeč
  // dělá, když stisk i puštění trefí týž prvek) — Přehled se otevře znovu.
  if (!(await p.locator('[data-plocha="vedeni.prehled"]').count())) await otevri(p, PREHLED);

  // 2) Podržení prázdného místa (pruh pod mřížkou) → úpravy; Hotovo → klid; „Upravit" → úpravy.
  // Prázdné místo = mezera mřížky mezi prvními dvěma widgety (cíl je samotné <ul>).
  const a = await li(p, PUVODNI[0]).boundingBox(); const b2 = await li(p, PUVODNI[1]).boundingBox();
  await podrzMysi(p, (a.x + a.width + b2.x) / 2, a.y + a.height / 2);
  tvrdi('2: podržení prázdného místa vstoupí do úprav', await dokud(() => vUpravach(p), 1500));
  tvrdi('2: lišta úprav s „Hotovo" je vidět', await dokud(() => hotovo(p).isVisible(), 3000));
  await hotovo(p).click();
  tvrdi('2: „Hotovo" úpravy ukončí', await dokud(async () => !(await vUpravach(p)), 1500));
  await upravit(p).click();
  tvrdi('2: „Upravit" vstoupí do úprav', await dokud(() => vUpravach(p), 1500));
  tvrdi('2: v úpravách je právě jedna limetka („Hotovo")', await p.evaluate(() => {
    const vidim = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    return [...document.querySelectorAll('.btn-accent')].filter(vidim).length === 1;
  }));
  await p.waitForTimeout(400);

  // 3) Vlnění: animace kyv, nekonečná, úhel ≤ 1,2°, sousedé s různou fází.
  const kyv = await p.evaluate(() => [...document.querySelectorAll('[data-plocha] li[data-widget] .w-kyv')].slice(0, 3).map(el => {
    const a = el.getAnimations().find(x => x.animationName === 'kyv');
    return {
      jmeno: a?.animationName ?? getComputedStyle(el).animationName,
      opakovani: a ? a.effect.getTiming().iterations : null,
      zpozdeni: getComputedStyle(el).animationDelay,
      uhel: parseFloat(el.style.getPropertyValue('--kyv')),
    };
  }));
  tvrdi('3: widgety se vlní (animace kyv, nekonečná)', kyv.length === 3 && kyv.every(k => k.jmeno === 'kyv' && k.opakovani === Infinity), JSON.stringify(kyv));
  tvrdi('3: úhel vlnění ≤ 1,2° (a ≥ 0,15°)', kyv.every(k => k.uhel > 0.149 && k.uhel <= 1.2), JSON.stringify(kyv.map(k => k.uhel)));
  tvrdi('3: sousedé mají různou fázi', new Set(kyv.map(k => k.zpozdeni)).size === kyv.length, JSON.stringify(kyv.map(k => k.zpozdeni)));
  tvrdi('3: odznaky „−" u všech (nepovinných) widgetů', await p.locator('[data-plocha] [data-odznak]').count() === PUVODNI.length);

  // 4) Tah myší: první na místo třetího → pořadí v DOM, JEDEN PUT se stejným pořadím a verzí, karta se usadí.
  const z = await stred(li(p, PUVODNI[0]));
  const na = await stred(li(p, PUVODNI[2]));
  await tahniMysi(p, z, na);
  const poTahu = await poradi(p);
  tvrdi('4: tah myší přesune první widget na třetí místo', poTahu[2] === PUVODNI[0] && poTahu.length === PUVODNI.length, JSON.stringify(poTahu));
  await p.waitForTimeout(900);
  tvrdi('4: tah pošle právě jeden PUT', stav.puty.length === 1, `${stav.puty.length} PUT`);
  tvrdi('4: PUT nese nové pořadí', JSON.stringify(poradiPutu(stav.puty[0])) === JSON.stringify(poTahu), JSON.stringify(poradiPutu(stav.puty[0])));
  tvrdi('4: PUT nese verzi z GET (3)', stav.puty[0]?.verze === 3, String(stav.puty[0]?.verze));
  tvrdi('4: tažená karta se do 800 ms usadí (transform prázdný)', await li(p, PUVODNI[0]).evaluate(el => el.style.transform === '' || el.style.transform === 'none'),
    await li(p, PUVODNI[0]).evaluate(el => el.style.transform));
  tvrdi('4: hlášení „položen na pozici 3 z 8"', (await hlaseni(p)).includes('pozici 3 z 8'), await hlaseni(p));

  // 5) Obnovení stránky drží pořadí z PUT.
  await p.reload({ waitUntil: 'networkidle' });
  await p.locator('[data-plocha] li[data-instance]').first().waitFor();
  await p.waitForTimeout(700);
  tvrdi('5: po obnovení platí uložené pořadí', JSON.stringify(await poradi(p)) === JSON.stringify(poTahu), JSON.stringify(await poradi(p)));

  // 6) „−" odebere bez potvrzení; toast s Vrátit; PUT bez něj; Vrátit ho vrátí na stejné místo, další PUT, „Vráceno".
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await p.waitForTimeout(300);
  const indexSkladu = (await poradi(p)).indexOf('sklad-dochazi');
  const putu = stav.puty.length;
  // Odznak se vlní spolu s kartou, takže „stabilní" není nikdy — klik bez čekání na klid, jako prst.
  await p.getByRole('button', { name: 'Odebrat widget Docházející zásoby' }).click({ force: true });
  tvrdi('6: „−" widget odebere hned, bez potvrzení', await dokud(async () => (await li(p, 'sklad-dochazi').count()) === 0, 1500) && (await p.getByRole('dialog').count()) === 0);
  const toast = p.getByText('Widget odebrán');
  tvrdi('6: toast „Widget odebrán" s „Vrátit"', await dokud(() => toast.isVisible(), 1500) && await p.getByRole('button', { name: 'Vrátit' }).isVisible());
  await dokud(() => stav.puty.length > putu, 2000);
  tvrdi('6: PUT bez odebraného widgetu', stav.puty.length === putu + 1 && !poradiPutu(stav.puty.at(-1)).includes('sklad-dochazi'), JSON.stringify(poradiPutu(stav.puty.at(-1))));
  tvrdi('6: verze se nese dál (4)', stav.puty.at(-1)?.verze === 4, String(stav.puty.at(-1)?.verze));
  await p.getByRole('button', { name: 'Vrátit' }).click();
  tvrdi('6: Vrátit ho vrátí na stejné místo', await dokud(async () => (await poradi(p)).indexOf('sklad-dochazi') === indexSkladu, 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > putu + 1, 2000);
  tvrdi('6: Vrátit pošle další PUT s widgetem', stav.puty.length === putu + 2 && poradiPutu(stav.puty.at(-1)).includes('sklad-dochazi'));
  tvrdi('6: toast „Vráceno"', await dokud(() => p.getByText('Vráceno', { exact: true }).isVisible(), 1500));

  // 7) Galerie: hledání bez diakritiky, výběr velikosti, Přidat → na konci, PUT s velikostí.
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  tvrdi('7: „Přidat widget" otevře galerii', await dokud(() => galerie.isVisible(), 3000));
  await galerie.getByRole('searchbox', { name: 'Hledat widget' }).or(galerie.getByLabel('Hledat widget')).first().fill('zasoby');
  await p.waitForTimeout(400);
  const karta = galerie.getByRole('button', { name: 'Docházející zásoby' });
  tvrdi('7: „zasoby" najde Docházející zásoby (bez diakritiky)', await karta.count() === 1, `${await karta.count()}`);
  // sklad.dochazi na ploše už je a víckrát být nesmí — galerie ho má jako „Na ploše".
  tvrdi('7: widget, který už na ploše je, má „Na ploše" a nejde přidat', await karta.getAttribute('aria-disabled') === 'true');
  await galerie.getByLabel('Hledat widget').first().fill('tym');
  await p.waitForTimeout(300);
  const clenove = galerie.getByRole('button', { name: 'Tým', exact: true });
  const tymJe = await clenove.count();
  // Tým je na ploše taky — pro přidání se vezme „Dnešní směny", který na ploše není.
  await galerie.getByLabel('Hledat widget').first().fill('dnesni smeny');
  await p.waitForTimeout(300);
  await galerie.getByRole('button', { name: 'Dnešní směny' }).click();
  const detail = p.getByRole('dialog', { name: 'Dnešní směny' });
  tvrdi('7: klik na widget otevře detail s výběrem velikosti', await dokud(() => detail.isVisible(), 1500) && await detail.getByRole('tablist', { name: 'Velikost' }).isVisible());
  await detail.getByRole('tab', { name: 'Malý' }).click();
  const putuPred = stav.puty.length;
  await detail.getByRole('button', { name: 'Přidat widget' }).click();
  tvrdi('7: po přidání se okno zavře', await dokud(async () => (await p.getByRole('dialog').count()) === 0, 1500));
  const poPridani = await poradi(p);
  const novy = li(p, poPridani.at(-1));
  tvrdi('7: nový widget je poslední, malý', await novy.getAttribute('data-widget') === 'rozvrh.dnesni_smeny' && await novy.getAttribute('data-velikost') === 'S',
    `${await novy.getAttribute('data-widget')} ${await novy.getAttribute('data-velikost')}`);
  await dokud(() => stav.puty.length > putuPred, 2000);
  const pridany = stav.puty.at(-1)?.polozky?.at(-1);
  tvrdi('7: PUT obsahuje {widget: rozvrh.dnesni_smeny, velikost: S}', pridany?.widget === 'rozvrh.dnesni_smeny' && pridany?.velikost === 'S', JSON.stringify(pridany));
  tvrdi('7: hlášení „přidán na pozici 9 z 9"', (await hlaseni(p)).includes('přidán na pozici 9 z 9'), await hlaseni(p));
  tvrdi('7: galerie našla i „Tým" (hledání bez diakritiky)', tymJe === 1, String(tymJe));

  // 8) Nastavení widgetu z úprav: klik → okno, změna velikosti → Uložit → PUT; Zrušit → žádný PUT.
  await p.waitForTimeout(300);
  await li(p, 'sklad-dochazi').click();
  const nast = p.getByRole('dialog', { name: 'Docházející zásoby' });
  tvrdi('8: klik na widget v úpravách otevře jeho nastavení', await dokud(() => nast.isVisible(), 3000));
  await nast.getByRole('tab', { name: 'Velký' }).click();
  const putuNast = stav.puty.length;
  await nast.getByRole('button', { name: 'Uložit' }).click();
  await dokud(() => stav.puty.length > putuNast, 2000);
  const zmeneny = stav.puty.at(-1)?.polozky?.find(x => x.id === 'sklad-dochazi');
  tvrdi('8: Uložit pošle PUT s novou velikostí', zmeneny?.velikost === 'L', JSON.stringify(zmeneny));
  tvrdi('8: widget má na ploše novou velikost', await li(p, 'sklad-dochazi').getAttribute('data-velikost') === 'L');
  await li(p, 'sklad-dochazi').click();
  await dokud(() => nast.isVisible(), 3000);
  await nast.getByRole('tab', { name: 'Malý' }).click();
  await nast.getByRole('button', { name: 'Zrušit' }).click();
  await p.waitForTimeout(900);
  tvrdi('8: Zrušit nic nepošle a nic nezmění', stav.puty.length === putuNast + 1 && await li(p, 'sklad-dochazi').getAttribute('data-velikost') === 'L');
  await p.screenshot({ path: OUT + 'k68-plocha-upravy.png' });
  await hotovo(p).click();
  await p.waitForTimeout(300);

  // 11) Každý widget má ikonu a vykreslený obsah (žádný Chybi ani ErrorState).
  const obsah = await p.$$eval('[data-plocha] li[data-widget]:not([hidden])', els => els.map(e => ({
    id: e.getAttribute('data-widget'), ikona: e.getAttribute('data-ikona'), h2: !!e.querySelector('h2'),
    chyba: /nenačetl|Widget chybí/.test(e.textContent ?? ''), text: (e.textContent ?? '').trim().length,
  })));
  tvrdi('11: každý widget má data-ikona', obsah.length > 0 && obsah.every(o => o.ikona), JSON.stringify(obsah.filter(o => !o.ikona)));
  tvrdi('11: každý widget má titulek a obsah, žádný chybějící ani chybový', obsah.every(o => o.h2 && o.text > 3 && !o.chyba), JSON.stringify(obsah.filter(o => !o.h2 || o.chyba)));

  // 12) Starý editor je pryč.
  const html = await p.content();
  tvrdi('12: žádné ▲▼, DashboardEditor ani „Skládání přehledu"', !/[▲▼]/.test(html) && !html.includes('DashboardEditor') && !html.includes('Skládání přehledu'));
  tvrdi('bez chyb v konzoli', chyby.length === 0, chyby.join(' | ').slice(0, 400));
  await ctx.close();
}

// 409: jiné okno bylo rychlejší — plocha převezme novější stav serveru a další zápis jde s jeho verzí.
{
  const novejsi = { ...FIX_VEDENI, polozky: [...FIX_VEDENI.polozky].reverse(), verze: 9 };
  let prvni = true;
  const puty = [];
  const { ctx, p, chyby } = await kontext({
    dalsi: (req, json) => {
      if (new URL(req.url()).pathname !== '/api/rozlozeni' || req.method() !== 'PUT') return undefined;
      const t = JSON.parse(req.postData() || '{}');
      puty.push(t);
      if (prvni) { prvni = false; return json({ error: 'Rozložení se mezitím změnilo jinde.', aktualni: novejsi }, 409); }
      return json({ ok: true, polozky: t.polozky, verze: t.verze + 1 });
    },
  });
  await otevri(p, PREHLED);
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await p.waitForTimeout(300);
  await tahniMysi(p, await stred(li(p, PUVODNI[0])), await stred(li(p, PUVODNI[2])));
  await dokud(() => puty.length > 0, 2000);
  await p.waitForTimeout(500);
  tvrdi('409: plocha převezme aktuální rozložení ze serveru', JSON.stringify(await poradi(p)) === JSON.stringify(novejsi.polozky.map(x => x.id)), JSON.stringify(await poradi(p)));
  tvrdi('409: toast „Rozložení se mezitím změnilo v jiném okně — ukazuji novější."', await dokud(() => p.getByText('Rozložení se mezitím změnilo v jiném okně — ukazuji novější.').isVisible(), 1500));
  tvrdi('409: „Vrátit" se po konfliktu vyprázdní (Ctrl+Z nic nepošle)', await (async () => {
    await p.locator('[data-plocha] li[data-widget]').first().focus();
    await p.keyboard.press('Control+z'); await p.waitForTimeout(800); return puty.length === 1;
  })(), `${puty.length} PUT`);
  await p.locator('[data-plocha] li[data-widget]').first().focus();
  await p.keyboard.press('ArrowDown');
  await dokud(() => puty.length > 1, 2000);
  tvrdi('409: další zápis jde s verzí z `aktualni` (9)', puty[1]?.verze === 9, String(puty[1]?.verze));
  tvrdi('409: bez chyb v konzoli', chyby.length === 0, chyby.join(' | ').slice(0, 300));
  await ctx.close();
}

// 9) Omezený pohyb: nic se nevlní ani nezmenšuje, obrys přerušovaný, přesun bez animace.
{
  const { ctx, p } = await kontext({ reduced: true });
  await otevri(p, PREHLED);
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await p.waitForTimeout(400);
  const styl = await p.evaluate(() => [...document.querySelectorAll('[data-plocha] li[data-widget]')].slice(0, 4).map(li => {
    const kyv = li.querySelector('.w-kyv'); const mer = li.querySelector('.w-mer'); const karta = kyv?.firstElementChild?.matches('.card, [class*="card"]') ? kyv.querySelector(':scope > section, :scope > .card') : kyv?.querySelector('section');
    return {
      kyvA: getComputedStyle(kyv).animationName, kyvT: getComputedStyle(kyv).transform,
      merA: getComputedStyle(mer).animationName, merT: getComputedStyle(mer).transform,
      obrys: karta ? getComputedStyle(karta).outlineStyle : null,
    };
  }));
  tvrdi('9: .w-kyv a .w-mer bez animace a bez transformace', styl.every(s => s.kyvA === 'none' && s.kyvT === 'none' && s.merA === 'none' && s.merT === 'none'), JSON.stringify(styl[0]));
  tvrdi('9: režim úprav pozná podle přerušovaného obrysu karty', styl.every(s => s.obrys === 'dashed'), JSON.stringify(styl.map(s => s.obrys)));
  await p.locator('[data-plocha] li[data-widget]').first().focus();
  await p.keyboard.press('ArrowRight');
  const hned = await p.evaluate(() => {
    const li = document.querySelector('[data-plocha] li[data-instance="sklad-dochazi"]');
    return new Promise(r => requestAnimationFrame(() => r({ index: [...li.parentElement.children].indexOf(li), t: li.style.transform })));
  });
  tvrdi('9: přesun šipkou je hned na místě, bez transformace v dalším snímku', hned.index === 1 && (hned.t === '' || hned.t === 'none'), JSON.stringify(hned));
  await ctx.close();
}

// 10) Poctivé stavy: 500 na /api/inventory shodí jen Docházející zásoby; „Zkusit znovu" načte.
{
  // Docházející zásoby ve střední velikosti: malá karta s nataženým odkazem má
  // dnes „Zkusit znovu" pod odkazem (Widget.tsx kreslí `otevrit` i při chybě) —
  // nahlášeno vlastníkovi rámce; tady se ověřuje mechanika poctivých stavů.
  const fix = { ...FIX_VEDENI, polozky: FIX_VEDENI.polozky.map(x => (x.id === 'sklad-dochazi' ? { ...x, velikost: 'M' } : x)) };
  const { ctx, p, stav } = await kontext({ fix });
  stav.chyby['/api/inventory'] = 500;
  await otevri(p, PREHLED);
  await p.waitForTimeout(600);
  const sklad = li(p, 'sklad-dochazi');
  tvrdi('10: widget s padlým endpointem ukáže „Zkusit znovu"', await sklad.getByRole('button', { name: 'Zkusit znovu' }).isVisible());
  const ostatni = await p.$$eval('[data-plocha] li[data-widget]:not([data-instance="sklad-dochazi"]):not([hidden])', els => els.filter(e => /Zkusit znovu/.test(e.textContent ?? '')).length);
  tvrdi('10: ostatní widgety žijí', ostatni === 0, `${ostatni} dalších s chybou`);
  delete stav.chyby['/api/inventory'];
  await sklad.getByRole('button', { name: 'Zkusit znovu' }).click();
  tvrdi('10: „Zkusit znovu" načte data', await dokud(async () => (await sklad.getByRole('button', { name: 'Zkusit znovu' }).count()) === 0 && (await sklad.locator('li, [class*="stat"], p').count()) > 0, 3000));
  await ctx.close();
}

await konec();
