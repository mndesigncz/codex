// Sonda kola 68 — fyzika tahu, rychlá klepnutí a zápis při odchodu.
//
// Hlídá nálezy z review kola 68, které ostatní sondy k68-* neviděly,
// protože gesta dělaly pomalu a jen po jednom:
//  1) malá karta držená nad velkou (která po přesunu zůstane na místě)
//     nesmí přeskládávat pořadí dokola (mrizka.cilovyIndex, blokace),
//  2) změna modelu během tahu (409 s novějším stavem) tah zruší a staré
//     pořadí se nezapíše; Ctrl+Z a šipky během tahu nic neudělají,
//  3) rychlé druhé klepnutí po „−" a dvojklik na „Upravit" úpravy neukončí,
//  4) dvojklep na „Hotovo" nepropadne na widget pod odjíždějící lištou,
//  5) odchod ze stránky během běžícího PUTu neztratí poslední změnu
//     (odmontování v aplikaci i zavření stránky — pagehide).
import {
  kontext, konec, otevri, poradi, li, upravit, vUpravach, hotovo, stred, dokud, tvrdi, FIX_VEDENI,
} from './k68-spolecne.mjs';

const zaUpravy = async (p, mobil = false) => {
  if (mobil) {
    await p.locator('[data-plocha] button[aria-haspopup="menu"]').first().click();
    await p.getByRole('menuitem', { name: 'Upravit stránku' }).click();
  } else await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await p.waitForTimeout(600);
};

// Záznam změn náhledového pořadí (CSS order) po snímcích.
const sledujPoradi = (p) => p.evaluate(() => {
  window.__por = [];
  const ul = document.querySelector('[data-plocha] ul');
  const tik = () => {
    const s = [...ul.querySelectorAll(':scope > li[data-instance]')].map(e => e.style.order).join(',');
    if (window.__por.at(-1) !== s) window.__por.push(s);
    requestAnimationFrame(tik);
  };
  tik();
});

// 1) S „sklad-dochazi" držená 1,5 s nad středem L „oznameni-nastenka".
{
  const { ctx, p } = await kontext({ viewport: { width: 1280, height: 1500 } });
  await otevri(p, '/employer/overview');
  await zaUpravy(p);
  const z = await stred(li(p, 'sklad-dochazi'));
  const na = await stred(li(p, 'oznameni-nastenka'));
  await sledujPoradi(p);
  await p.mouse.move(z.x, z.y); await p.mouse.down();
  for (let i = 1; i <= 15; i++) { await p.mouse.move(z.x + (na.x - z.x) * i / 15, z.y + (na.y - z.y) * i / 15); await p.waitForTimeout(25); }
  // Cestou přes jiné karty se přeskládat smí; počítá se až držení na místě.
  const naMiste = await p.evaluate(() => window.__por.length);
  await p.waitForTimeout(1500);
  const zmeny = await p.evaluate((od) => window.__por.slice(od), naMiste);
  tvrdi('1: S držená nad L 1,5 s přeskládá nejvýš jednou', zmeny.length <= 1, JSON.stringify(zmeny));
  await p.mouse.up(); await p.waitForTimeout(600);
  await ctx.close();
}

// 2a) 409 s novějším stavem dorazí během tahu: tah se zruší a staré pořadí se nezapíše.
{
  let pustit;
  const brana = new Promise(r => { pustit = r; });
  let prvni = true;
  const aktualni = { ...FIX_VEDENI, verze: 5, polozky: [...FIX_VEDENI.polozky].reverse().filter(x => x.id !== 'ukoly-dnes') };
  const puty = [];
  const { ctx, p } = await kontext({ viewport: { width: 1280, height: 1500 }, dalsi: (req, json) => {
    const u = new URL(req.url());
    if (u.pathname !== '/api/rozlozeni' || req.method() !== 'PUT') return undefined;
    puty.push(JSON.parse(req.postData() || '{}'));
    if (prvni) { prvni = false; return brana.then(() => json({ error: 'konflikt', aktualni }, 409)); }
    return json({ ok: true, polozky: puty.at(-1).polozky, verze: 6 });
  } });
  await otevri(p, '/employer/overview');
  await zaUpravy(p);
  await li(p, 'chat-neprectene').locator('[data-odznak]').click({ force: true });
  await p.waitForTimeout(700);
  // Tažený widget v novějším stavu chybí — nejhorší případ: jeho <li> zmizí pod prstem.
  const z = await stred(li(p, 'ukoly-dnes'));
  const na = await stred(li(p, 'pokladna-dnes'));
  await p.mouse.move(z.x, z.y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(z.x + (na.x - z.x) * i / 8, z.y + (na.y - z.y) * i / 8); await p.waitForTimeout(25); }
  await p.waitForTimeout(300);
  pustit();
  await p.waitForTimeout(500);
  // data-tazeni na kořeni plochy platí jen během tahu (data-zvednuty drží, než karta dosedne).
  const tazeni = await p.evaluate(() => document.querySelector('[data-plocha]')?.hasAttribute('data-tazeni'));
  tvrdi('2: po 409 uprostřed tahu je tah zrušený', !tazeni);
  const putuPred = puty.length;
  await p.mouse.move(na.x + 40, na.y + 40, { steps: 4 });
  await p.mouse.up(); await p.waitForTimeout(900);
  tvrdi('2: po puštění se zastaralé pořadí nezapsalo', puty.length === putuPred, JSON.stringify(puty.slice(putuPred).map(x => x.polozky?.map(q => q.id))));
  tvrdi('2: plocha ukazuje novější stav ze serveru', JSON.stringify(await poradi(p)) === JSON.stringify(aktualni.polozky.map(x => x.id)), JSON.stringify(await poradi(p)));
  const zbytky = await p.evaluate(() => [...document.querySelectorAll('[data-plocha] li[data-instance]')].filter(e => e.style.order).length);
  tvrdi('2: po zrušení nezůstalo CSS order', zbytky === 0, String(zbytky));
  await ctx.close();
}

// 2b) Ctrl+Z a šipka během tahu myší nic neudělají, karta drží pod ukazatelem.
{
  const { ctx, p } = await kontext({ viewport: { width: 1280, height: 1500 } });
  await otevri(p, '/employer/overview');
  await zaUpravy(p);
  await li(p, 'akce-nejblizsi').locator('[data-odznak]').click({ force: true });
  await p.waitForTimeout(800);
  const pocet = (await poradi(p)).length;
  const z = await stred(li(p, 'sklad-dochazi'));
  await p.mouse.move(z.x, z.y); await p.mouse.down();
  for (let i = 1; i <= 6; i++) { await p.mouse.move(z.x + i * 5, z.y + i * 3); await p.waitForTimeout(25); }
  const fx = z.x + 30, fy = z.y + 18;
  const pred = await li(p, 'sklad-dochazi').boundingBox();
  await p.keyboard.press('Control+z');
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(200);
  const po = await li(p, 'sklad-dochazi').boundingBox();
  const zved = await p.evaluate(() => !!document.querySelector('li[data-instance="sklad-dochazi"][data-zvednuty]'));
  tvrdi('2: Ctrl+Z a šipka během tahu nic nevrátí ani nepřesunou', (await poradi(p)).length === pocet && zved, JSON.stringify({ zved, n: (await poradi(p)).length }));
  tvrdi('2: karta po Ctrl+Z drží stejný odstup od ukazatele', Math.abs((po.y - pred.y)) < 3 && Math.abs(po.x - pred.x) < 3, JSON.stringify({ pred, po, fx, fy }));
  await p.mouse.move(fx + 200, fy + 200, { steps: 5 }); await p.waitForTimeout(100);
  const r2 = await li(p, 'sklad-dochazi').boundingBox();
  tvrdi('2: karta dál sleduje ukazatel', Math.abs(r2.x - pred.x - 200) < 12 && Math.abs(r2.y - pred.y - 200) < 12, JSON.stringify(r2));
  await p.mouse.up(); await p.waitForTimeout(900);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(600);
  tvrdi('2: po dosednutí Ctrl+Z funguje', (await poradi(p)).length >= pocet, JSON.stringify(await poradi(p)));
  await ctx.close();
}

// 3a) Druhé rychlé klepnutí po „−" (120 ms) úpravy neukončí.
{
  const { ctx, p } = await kontext({ viewport: { width: 1280, height: 1200 } });
  await otevri(p, '/employer/overview');
  await zaUpravy(p);
  const b = await li(p, 'sklad-dochazi').locator('[data-odznak]').boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await p.mouse.click(x, y);
  await p.waitForTimeout(120);
  await p.mouse.click(x, y);
  await p.waitForTimeout(500);
  tvrdi('3: druhé klepnutí 120 ms po „−" úpravy neukončí', await vUpravach(p));
  await ctx.close();
}

// 3b) Dvojklik na „Upravit" nechá plochu v úpravách.
{
  const { ctx, p } = await kontext({ viewport: { width: 1280, height: 900 } });
  await otevri(p, '/employer/overview');
  const b = await upravit(p).boundingBox();
  await p.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await p.waitForTimeout(700);
  tvrdi('3: dvojklik na „Upravit" nechá plochu v úpravách', await vUpravach(p));
  await ctx.close();
}

// 4) Dvojklep na „Hotovo" nepropadne na obsah pod lištou (monitor i telefon).
for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844, mobil: true }]) {
  const { ctx, p } = await kontext({ viewport: { width: vp.width, height: vp.height }, mobil: !!vp.mobil });
  await otevri(p, '/employer/overview');
  await zaUpravy(p, !!vp.mobil);
  const b = await hotovo(p).boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  const h1 = await p.locator('h1').first().innerText();
  await p.evaluate(() => { window.__klik = []; window.addEventListener('click', e => window.__klik.push(e.target.closest('li[data-instance]')?.dataset.instance ?? ''), true); });
  if (vp.mobil) { await p.touchscreen.tap(x, y); await p.waitForTimeout(90); await p.touchscreen.tap(x, y); }
  else await p.mouse.dblclick(x, y);
  await p.waitForTimeout(800);
  const kliky = await p.evaluate(() => window.__klik);
  const fokus = await p.evaluate(() => document.activeElement?.tagName);
  tvrdi(`4: ${vp.width} px — dvojklep na „Hotovo" nic pod lištou nespustí`, kliky.every(k => !k) && fokus !== 'TEXTAREA' && (await p.locator('h1').first().innerText()) === h1,
    JSON.stringify({ kliky, fokus }));
  await ctx.close();
}

// 5) Odchod během běžícího PUTu: podvržený server kontroluje verzi a odpovídá za 700 ms.
//    Zavření stránky se simuluje událostí pagehide a „smrtí" stránky: co
//    stránka pošle víc než 150 ms po pagehide, na server nedojde (skutečná
//    stránka už v tu chvíli neexistuje). Skutečná navigace pryč (goto
//    about:blank) v Playwrightu občas keepalive požadavek odcházející stránky
//    do podvrhu vůbec nepustí a sonda by měřila harness, ne aplikaci.
for (const zpusob of ['navigace', 'pagehide']) {
  const server = { verze: FIX_VEDENI.verze ?? 0, polozky: FIX_VEDENI.polozky, log: [], mrtvaOd: Infinity };
  const { ctx, p } = await kontext({ viewport: { width: 1280, height: 1100 }, dalsi: (req, json) => {
    const u = new URL(req.url());
    if (u.pathname !== '/api/rozlozeni' || req.method() !== 'PUT') return undefined;
    const t = JSON.parse(req.postData() || '{}');
    if (Date.now() > server.mrtvaOd + 150) { server.log.push(`po zavření stránky (verze ${t.verze})`); return json({ error: 'stránka už neexistuje' }, 503); }
    return new Promise(r => setTimeout(r, 700)).then(() => {
      if (t.verze !== server.verze) { server.log.push(`409 (poslal ${t.verze}, server ${server.verze})`); return json({ error: 'konflikt', aktualni: { ...FIX_VEDENI, polozky: server.polozky, verze: server.verze } }, 409); }
      server.verze++; server.polozky = t.polozky; server.log.push(`200 v${server.verze}`);
      return json({ ok: true, polozky: t.polozky, verze: server.verze });
    });
  } });
  await otevri(p, '/employer/overview');
  await zaUpravy(p);
  await li(p, 'sklad-dochazi').focus();
  await p.keyboard.press('ArrowRight');            // změna 1
  await p.waitForTimeout(550);                     // PUT A odešel a visí 700 ms
  await p.keyboard.press('ArrowRight');            // změna 2 čeká ve frontě
  await p.waitForTimeout(100);
  const ocekavane = await poradi(p);
  if (zpusob === 'navigace') {
    const kam = await p.evaluate(() => { const b = [...document.querySelectorAll('nav button, nav a, aside button, aside a')].find(e => /Docházka|Sklad|Tým/.test(e.textContent || '')); b?.click(); return b?.textContent ?? null; });
    tvrdi('5: navigace — v bočním pásu je kam odejít', !!kam);
  } else {
    server.mrtvaOd = Date.now();
    await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  }
  await p.waitForTimeout(2500);
  tvrdi(`5: ${zpusob} během běžícího zápisu — na serveru je poslední stav`,
    JSON.stringify(server.polozky.map(x => x.id)) === JSON.stringify(ocekavane), JSON.stringify({ server: server.polozky.map(x => x.id).slice(0, 4), ocekavane: ocekavane.slice(0, 4), log: server.log }));
  await ctx.close();
}

await konec();
