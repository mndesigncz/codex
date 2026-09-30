// Kolo 75: nová prodejní stránka. Produkt napřed: živá ukázka v hero, nahrávky
// ve smyčkách, žádné vymyšlené sliby.
//
// Sonda hlídá, co by se na téhle stránce rozbilo nejtišeji:
//  L1 Hero ukázka: rám je v HTML hned (poster), po klidu se načte /demo, aplikace
//     řekne `demo-pripraveno`, rozměr rámu se při tom neposune (CLS).
//  L2 Přepínání scén: Rozvrh, Uzávěrka, Tablet u baru ukážou opravdu tu obrazovku
//     aplikace; role a zařízení se přepínají bez chyby; „Začít znovu" vrátí zámek.
//  L3 Coach marks: kurzor a bublina ukazují na prvek, který v ukázce doopravdy
//     existuje, a po kliknutí přeskočí na další krok; reakce na `demo-akce`
//     („Uzávěrka se odemkla") se řekne větou ve `role=status`.
//  L4 Izolace: žádný požadavek na cizí původ a žádné `/api` z ukázky (mock v prohlížeči);
//     hlavní stránka nevolá nic na cizí server. Bez chyb v konzoli.
//  L5 Telefon 390: žádné vodorovné přetečení, rám telefonu, ukázka funguje.
//  L6 Nahrávky jsou líné: před příchodem k sekci „Jeden den" se nestáhne žádná,
//     potom jen ta aktivní; s vypnutým pohybem se nestáhne žádná sama.
//  L7 Vypnutý pohyb: ukázka se sama nenačte, čeká na tlačítko, a po něm funguje.
//  L8 Bez JavaScriptu zůstane nadpis, poster a CTA (žádná prázdná stránka).
//  L9 Nejvýš jedna plná limetka v kterémkoli výřezu při scrollu po celé stránce.
//  L10 Jednotlivé prvky stránky: jeden h1, iframe má název, skip-linky, JSON-LD
//      bez hodnocení, nadpisy bez přeskočené úrovně.
import { browser, tvrdi, konec, BASE } from './k68-spolecne.mjs';

const b = await browser();
const ZIVA = 'iframe[title^="Živá ukázka"]';

/** Kontext s měřením CLS a záznamem požadavků. */
async function novy({ viewport = { width: 1280, height: 900 }, reducedMotion = 'no-preference', js = true, mobil = false } = {}) {
  const ctx = await b.newContext({ viewport, locale: 'cs-CZ', reducedMotion, javaScriptEnabled: js, isMobile: mobil, hasTouch: mobil });
  await ctx.addInitScript(() => {
    window.__cls = 0;
    try {
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
        .observe({ type: 'layout-shift', buffered: true });
    } catch { /* starší prohlížeč: CLS se neměří */ }
  });
  const pozadavky = [];
  ctx.on('request', r => pozadavky.push({ url: r.url(), frame: (() => { try { return r.frame()?.url() ?? ''; } catch { return ''; } })() }));
  const chyby = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => chyby.push(`pageerror: ${String(e).slice(0, 200)}`));
  p.on('console', m => { if (m.type() === 'error') chyby.push(m.text().slice(0, 220)); });
  return { ctx, p, pozadavky, chyby };
}

const demoFrame = (p) => p.frames().find(f => f.url().includes('/demo'));
const pripraveno = (p, timeout = 25000) => p.waitForFunction(
  () => document.querySelector('iframe[title^="Živá ukázka"]')?.getAttribute('data-hotovo') === 'true', null, { timeout });
const text = async (p) => (await demoFrame(p)?.locator('body').innerText().catch(() => '')) ?? '';
const status = (p) => p.locator('section[aria-label^="Ukázka aplikace"] [role="status"]').innerText();
const bublina = (p) => p.evaluate(() => {
  const el = document.querySelector('.ld-coach-bublina');
  return el && el.getAttribute('data-skryt') === 'false' ? el.textContent : null;
});
const cekejNaBublinu = (p, re) => p.waitForFunction(
  (src) => { const el = document.querySelector('.ld-coach-bublina'); return !!el && el.getAttribute('data-skryt') === 'false' && new RegExp(src).test(el.textContent || ''); },
  re.source, { timeout: 12000 }).then(() => true).catch(() => false);

// L1, L2, L3, L4) Desktop: celý příběh ukázky.
{
  const { ctx, p, pozadavky, chyby } = await novy();
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  // Poster je v HTML hned, ještě než cokoli doběhne.
  tvrdi('L1 poster hero je v HTML (ne prázdný rám)', await p.locator('.ld-obrazovka picture img').first().isVisible());
  const box0 = await p.locator('.ld-ram').first().boundingBox();
  await p.waitForLoadState('networkidle');
  tvrdi('L1 rám ukázky stojí v HTML s pevným poměrem stran', !!box0 && box0.width > 600 && box0.height > 300, JSON.stringify(box0));
  await pripraveno(p).then(() => tvrdi('L1 ukázka se po klidu sama načte a řekne demo-pripraveno', true))
    .catch(() => tvrdi('L1 ukázka se po klidu sama načte a řekne demo-pripraveno', false, 'data-hotovo nenastalo do 25 s'));
  const t = await text(p);
  tvrdi('L1 v ukázce je skutečná aplikace s vymyšlenými daty', /Kavárna U Lípy \(ukázka\)/.test(t), t.slice(0, 120));
  const box1 = await p.locator('.ld-ram').first().boundingBox();
  tvrdi('L1 rám se po načtení ukázky nezměnil (nula skoku rozvržení)', !!box0 && !!box1 && Math.abs(box0.height - box1.height) < 1 && Math.abs(box0.width - box1.width) < 1,
    `${JSON.stringify(box0)} → ${JSON.stringify(box1)}`);
  tvrdi('L1 ukázka je v rámu počítače a rozměr okna je logický (1100 px)', await p.locator(`${ZIVA}`).evaluate(el => el.clientWidth === 1100));

  // Coach mark hned v první scéně ukazuje na kartu, která v aplikaci existuje.
  tvrdi('L3 první krok Přehledu: bublina „klikni sem" ukazuje na docházející zásoby', await cekejNaBublinu(p, /dochází/));
  const pozice = await p.evaluate(() => {
    const k = document.querySelector('.ld-coach-kurzor'); const o = document.querySelector('.ld-obrazovka');
    const kr = k.getBoundingClientRect(), or = o.getBoundingClientRect();
    return { uvnitr: kr.left >= or.left - 2 && kr.right <= or.right + 2 && kr.top >= or.top - 2 && kr.bottom <= or.bottom + 2 };
  });
  tvrdi('L3 kurzor coach marks leží uvnitř rámu ukázky', pozice.uvnitr);

  // L2) Rozvrh: skutečná obrazovka, coach vede třemi kroky a stránka komentuje výsledek.
  await p.getByRole('tab', { name: 'Rozvrh' }).click();
  await p.getByRole('tab', { name: 'Rozvrh' }).first().waitFor();
  const vr = demoFrame(p);
  await vr.getByRole('button', { name: 'Vygenerovat rozvrh' }).waitFor({ timeout: 20000 });
  tvrdi('L2 scéna Rozvrh ukazuje rozvrh aplikace (tlačítko Vygenerovat rozvrh)', true);
  tvrdi('L3 krok 1 Rozvrhu: bublina vede na Vygenerovat rozvrh', await cekejNaBublinu(p, /rozvrh navrhne/));
  await vr.getByRole('button', { name: 'Vygenerovat rozvrh' }).click();
  tvrdi('L3 po kliknutí přejde coach na další krok (Potvrdit a uložit)', await cekejNaBublinu(p, /potvrdíš/));
  tvrdi('L3 reakce na demo-akce: „Návrh rozvrhu je hotový" ve role=status', /Návrh rozvrhu je hotový/.test(await status(p)), await status(p));
  await vr.getByRole('button', { name: 'Potvrdit a uložit' }).click();
  // Ukazatel musí krok nejdřív zaměřit; člověk klikne až poté, sonda je rychlejší než 250ms tik (na CI to byl závod).
  await cekejNaBublinu(p, /tým ho uvidí/);
  await vr.getByRole('button', { name: /^Publikovat$/ }).first().click();
  await p.waitForFunction(() => /zveřejněný/.test(document.querySelector('section[aria-label^="Ukázka aplikace"] [role="status"]')?.textContent ?? ''), null, { timeout: 8000 })
    .then(() => tvrdi('L3 po publikaci stránka řekne „Rozvrh je zveřejněný, tým ho má v telefonu"', true))
    .catch(async () => tvrdi('L3 po publikaci stránka řekne „Rozvrh je zveřejněný, tým ho má v telefonu"', false, await status(p)));
  // Reakce na akci drží pár vteřin; potom zůstane věta o tom, že tohle je celá aplikace.
  await p.waitForFunction(() => /celá aplikace/.test(document.querySelector('section[aria-label^="Ukázka aplikace"] [role="status"]')?.textContent ?? ''), null, { timeout: 12000 }).catch(() => {});
  tvrdi('L3 po posledním kroku kurzor zmizí a stránka řekne, že tohle je celá aplikace', (await bublina(p)) === null && /celá aplikace/.test(await status(p).catch(() => '')), await status(p).catch(() => ''));

  // Uzávěrka: zaměstnanec, telefon, zámek → odemčení.
  await p.getByRole('tab', { name: 'Uzávěrka' }).click();
  await demoFrame(p).getByText('Uzávěrka je zamčená').first().waitFor({ timeout: 25000 });
  tvrdi('L2 scéna Uzávěrka: zaměstnanec vidí zamčenou uzávěrku', true);
  tvrdi('L2 scéna Uzávěrka je v rámu telefonu', await p.locator('#ukazka-okno .ld-ram[data-zar="telefon"]').count() === 1);
  tvrdi('L3 krok Uzávěrky: bublina vede na poslední povinný úkol', await cekejNaBublinu(p, /poslední povinný/));
  await demoFrame(p).getByRole('button', { name: /^Hotovo: / }).first().click();
  await p.waitForFunction(() => /Uzávěrka se odemkla/.test(document.querySelector('section[aria-label^="Ukázka aplikace"] [role="status"]')?.textContent ?? ''), null, { timeout: 8000 })
    .then(() => tvrdi('L3 odškrtnutí povinného úkolu: „Uzávěrka se odemkla" (reakce na demo-akce)', true))
    .catch(async () => tvrdi('L3 odškrtnutí povinného úkolu: „Uzávěrka se odemkla" (reakce na demo-akce)', false, await status(p)));
  await demoFrame(p).getByText(/je odemčená/).first().waitFor({ timeout: 8000 }).catch(() => {});
  tvrdi('L2 v ukázce je uzávěrka opravdu odemčená (skutečná jeZamceno, ne obrázek)', /odemčená/.test(await text(p)), (await text(p)).slice(0, 160));

  // Začít znovu: zámek je zpět.
  await p.getByRole('button', { name: 'Začít znovu' }).click();
  await demoFrame(p).getByText('Uzávěrka je zamčená').first().waitFor({ timeout: 25000 })
    .then(() => tvrdi('L2 „Začít znovu" vrátí stav ukázky (uzávěrka je zase zamčená)', true))
    .catch(() => tvrdi('L2 „Začít znovu" vrátí stav ukázky (uzávěrka je zase zamčená)', false, 'zámek se nevrátil'));
  await cekejNaBublinu(p, /poslední povinný/);
  tvrdi('L3 po „Začít znovu" coach začíná od prvního kroku', (await bublina(p))?.includes('poslední povinný') ?? false);

  // Role: vedení v téže scéně vidí jiný pohled.
  await p.getByRole('tab', { name: 'Vedení' }).click();
  await p.waitForFunction(() => { try { const f = document.querySelector('iframe[title^="Živá ukázka"]').contentWindow; return (f.__demoUdalosti ?? []).some(u => u.typ === 'demo-pripraveno' && u.role === 'vedeni'); } catch { return false; } }, null, { timeout: 25000 })
    .then(() => tvrdi('L2 přepnutí role na Vedení načte pohled vedení', true))
    .catch(() => tvrdi('L2 přepnutí role na Vedení načte pohled vedení', false, 'demo-pripraveno s rolí vedeni nepřišlo'));

  // Tablet u baru: role zmizí (tablet je vlastní role), rám je tablet.
  await p.getByRole('tab', { name: 'Tablet u baru' }).click();
  await demoFrame(p).getByText('Tablet u baru').first().waitFor({ timeout: 25000 });
  tvrdi('L2 scéna Tablet u baru: rám tabletu a bez přepínače rolí', await p.locator('#ukazka-okno .ld-ram[data-zar="tablet"]').count() === 1 && await p.getByRole('tab', { name: 'Zaměstnanec' }).count() === 0);
  tvrdi('L3 krok tabletu: bublina „klepni na jméno"', await cekejNaBublinu(p, /Klepni na jméno/));
  // Zařízení: přepnutí na telefon mění rám i logický rozměr.
  await p.getByRole('tab', { name: 'Telefon' }).click();
  await p.waitForTimeout(400);
  tvrdi('L2 přepínač zařízení mění rám (telefon) a logický rozměr okna ukázky (390 px)', await p.locator('#ukazka-okno .ld-ram[data-zar="telefon"]').count() === 1 && await p.locator(ZIVA).evaluate(el => el.clientWidth === 390));

  // L4) Izolace.
  const cizi = pozadavky.filter(r => { try { return new URL(r.url).origin !== new URL(BASE).origin && !r.url.startsWith('data:') && !r.url.startsWith('blob:'); } catch { return false; } });
  tvrdi('L4 žádný požadavek na cizí původ (stránka ani ukázka)', cizi.length === 0, cizi.slice(0, 4).map(r => r.url).join(', '));
  const apiZUkazky = pozadavky.filter(r => r.frame.includes('/demo') && new URL(r.url).pathname.startsWith('/api/'));
  tvrdi('L4 ukázka nevolá na síť žádné /api (mock běží v prohlížeči)', apiZUkazky.length === 0, apiZUkazky.slice(0, 4).map(r => r.url).join(', '));
  tvrdi('L4 bez chyb v konzoli (hlavní stránka i ukázka)', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  const cls = await p.evaluate(() => window.__cls);
  tvrdi(`L1 CLS stránky s ukázkou ≤ 0,02 (naměřeno ${cls.toFixed(4)})`, cls <= 0.02, String(cls));
  await ctx.close();
}

// L6) Nahrávky jsou líné.
{
  const { ctx, p, pozadavky } = await novy();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const rec = () => pozadavky.filter(r => /\/brand\/landing\/rec\/[\w-]+\.(mp4|webm)/.test(r.url));
  tvrdi('L6 při načtení stránky se nestáhne žádná nahrávka', rec().length === 0, rec().map(r => r.url).join(', '));
  tvrdi('L6 ve stránce před příchodem k sekci není žádný <video> se zdrojem', await p.locator('video').count() === 0);
  await p.locator('#den').scrollIntoViewIfNeeded();
  await p.evaluate(() => document.getElementById('den').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(3500);
  const ids = new Set(rec().map(r => r.url.match(/rec\/([\w-]+)\./)[1]));
  tvrdi(`L6 u sekce „Jeden den" se stahuje jen aktivní nahrávka (${[...ids].join(', ') || 'žádná'})`, ids.size >= 1 && ids.size <= 2, [...ids].join(', '));
  const hraje = await p.evaluate(() => [...document.querySelectorAll('video')].filter(v => !v.paused && v.readyState >= 2).length);
  tvrdi('L6 aktivní nahrávka opravdu hraje (muted, loop, inline)', hraje >= 1, String(hraje));
  const atributy = await p.evaluate(() => [...document.querySelectorAll('video')].every(v => v.muted && v.loop && v.playsInline && v.getAttribute('aria-hidden') === 'true'));
  tvrdi('L6 <video> má muted, loop, playsinline a je skrytý odečítači (popis nese rám)', atributy);
  // Mimo obraz se zastaví.
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(800);
  const stale = await p.evaluate(() => [...document.querySelectorAll('video')].filter(v => !v.paused).length);
  tvrdi('L6 mimo obraz se nahrávky zastaví (šetří baterii)', stale === 0, String(stale));
  // Pozastavit/Přehrát: dá se zastavit (pravidlo 2.2.2).
  await p.evaluate(() => document.getElementById('den').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(1500);
  // Ovládá se aktivní scéna sticky rámu (neaktivní jsou inert a schované).
  const aktivniTl = () => p.locator('#den [data-scena]:not([inert])').getByRole('button', { name: /Pozastavit|Přehrát/ });
  const pred = await aktivniTl().innerText();
  await aktivniTl().click();
  await p.waitForTimeout(300);
  const po = await aktivniTl().innerText();
  tvrdi(`L6 nahrávku jde pozastavit tlačítkem (${pred} → ${po})`, pred !== po, `${pred} → ${po}`);
  await ctx.close();
}

// L7) Vypnutý pohyb: ukázka a nahrávky se samy nespouštějí.
{
  const { ctx, p, pozadavky, chyby } = await novy({ reducedMotion: 'reduce' });
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
  tvrdi('L7 s vypnutým pohybem se ukázka sama nenačte (žádný iframe)', await p.locator(ZIVA).count() === 0);
  tvrdi('L7 s vypnutým pohybem je vidět poster a tlačítko „Spustit živou ukázku"', await p.getByRole('button', { name: 'Spustit živou ukázku' }).isVisible() && await p.locator('.ld-obrazovka picture img').first().isVisible());
  tvrdi('L7 bez žádosti se nestáhl ani /demo', !pozadavky.some(r => new URL(r.url).pathname === '/demo'));
  await p.getByRole('button', { name: 'Spustit živou ukázku' }).click();
  await pripraveno(p).then(() => tvrdi('L7 po kliknutí se ukázka načte a funguje', true)).catch(() => tvrdi('L7 po kliknutí se ukázka načte a funguje', false, 'nenačetla se'));
  // Nahrávky: nestahují se samy, ani u sekce.
  await p.evaluate(() => document.getElementById('den').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(2500);
  const rec = pozadavky.filter(r => /\/brand\/landing\/rec\/[\w-]+\.(mp4|webm)/.test(r.url));
  tvrdi('L7 s vypnutým pohybem se nahrávky nestahují (zůstává poster)', rec.length === 0 && await p.locator('video').count() === 0, rec.map(r => r.url).join(', '));
  tvrdi('L7 bez pohybu je u nahrávky nabídka „Přehrát"', await p.locator('#den [data-scena]:not([inert])').getByRole('button', { name: 'Přehrát' }).isVisible());
  tvrdi('L7 bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// L5) Telefon 390.
{
  const { ctx, p, pozadavky, chyby } = await novy({ viewport: { width: 390, height: 844 }, mobil: true });
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await pripraveno(p).then(() => tvrdi('L5 na telefonu se ukázka načte', true)).catch(() => tvrdi('L5 na telefonu se ukázka načte', false, 'nenačetla se'));
  const w = async () => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  let m = await w();
  tvrdi('L5 telefon 390: stránka nepřetéká vodorovně', m.sw <= m.iw + 1, JSON.stringify(m));
  tvrdi('L5 na telefonu je rám telefon a přepínač zařízení je skrytý', await p.locator('.ld-ram').first().evaluate(el => el.getBoundingClientRect().width <= 390 - 40 + 1) && !(await p.getByRole('tab', { name: 'Počítač' }).isVisible()));
  tvrdi('L5 iframe má na telefonu logický rozměr telefonu (390 px)', await p.locator(ZIVA).evaluate(el => el.clientWidth === 390));
  for (const scena of ['Rozvrh', 'Uzávěrka', 'Sklad', 'Tablet u baru', 'Přehled']) {
    await p.getByRole('tab', { name: scena }).click();
    await p.waitForTimeout(2200);
    m = await w();
    tvrdi(`L5 telefon 390, scéna ${scena}: bez vodorovného přetečení stránky`, m.sw <= m.iw + 1, JSON.stringify(m));
  }
  // Ovládání (tři přepínače) se vejde: nic nepřečnívá přes okraj okna.
  const ovladani = await p.evaluate(() => [...document.querySelectorAll('#ukazka-okno button, #ukazka-okno [role="tab"]')]
    .filter(e => e.getBoundingClientRect().width > 0 && e.closest('[role="tablist"]') === null)
    .every(e => e.getBoundingClientRect().right <= innerWidth + 1));
  tvrdi('L5 tlačítka ukázky (Začít znovu) se vejdou na 390 px', ovladani);
  // Cíle dotyku ≥ 36 px u ovládání ukázky.
  const male = await p.evaluate(() => [...document.querySelectorAll('#ukazka-okno [role="tab"], #ukazka-okno > div button')]
    .filter(e => e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim(), h: Math.round(r.height) }; })
    .filter(x => x.h < 28));
  tvrdi('L5 ovládací prvky ukázky nejsou nižší než 28 px (tap-target rozšiřuje klikací plochu na 36)', male.length === 0, JSON.stringify(male));
  tvrdi('L5 bez chyb v konzoli a bez /api z ukázky', chyby.length === 0 && !pozadavky.some(r => r.frame.includes('/demo') && new URL(r.url).pathname.startsWith('/api/')), chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// L8) Bez JavaScriptu.
{
  const { ctx, p } = await novy({ js: false });
  await p.goto(BASE + '/', { waitUntil: 'load' });
  tvrdi('L8 bez JS: nadpis H1, poster ukázky a hlavní CTA jsou na místě',
    await p.locator('h1').count() === 1 && await p.locator('.ld-obrazovka picture img').first().isVisible() && await p.getByRole('link', { name: /Vyzkoušet 30 dní zdarma/ }).first().isVisible());
  tvrdi('L8 bez JS: žádný iframe (ukázka potřebuje skript) a ceník je v HTML', await p.locator(ZIVA).count() === 0 && await p.locator('#cenik').count() === 1);
  await ctx.close();
}

// L9, L10) Celá stránka: limetka, struktura, SEO.
{
  const { ctx, p } = await novy();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await pripraveno(p).catch(() => {});
  const vyska = await p.evaluate(() => document.body.scrollHeight);
  let nej = 0; let kde = 0;
  for (let y = 0; y < vyska; y += 250) {
    await p.evaluate(v => window.scrollTo(0, v), y);
    await p.waitForTimeout(60);
    const n = await p.evaluate(() => [...document.querySelectorAll('.btn-accent, .on-accent')].filter(e => {
      const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
      return r.width > 0 && r.bottom > 0 && r.top < innerHeight && s.visibility !== 'hidden' && +s.opacity > 0;
    }).length);
    if (n > nej) { nej = n; kde = y; }
  }
  tvrdi(`L9 nejvýš jedna plná limetka v kterémkoli výřezu (nejvíc ${nej} na y=${kde})`, nej <= 1, `${nej} na ${kde}`);

  await p.evaluate(() => window.scrollTo(0, 0));
  tvrdi('L10 právě jeden h1', await p.locator('h1').count() === 1);
  const nadpisy = await p.evaluate(() => [...document.querySelectorAll('main h1, main h2, main h3, footer h2')].map(h => +h.tagName[1]));
  const preskok = nadpisy.some((n, i) => i > 0 && n - nadpisy[i - 1] > 1);
  tvrdi('L10 nadpisy nepřeskakují úroveň', !preskok, nadpisy.join(''));
  tvrdi('L10 iframe ukázky má název pro odečítač', (await p.locator(ZIVA).getAttribute('title'))?.includes('vymyšlenými daty') ?? false);
  tvrdi('L10 landmarky: header, main, nav, footer', await p.locator('header').count() >= 1 && await p.locator('main').count() === 1 && await p.locator('nav').count() >= 1 && await p.locator('footer').count() === 1);
  tvrdi('L10 skip-linky na ukázku a ceník', await p.getByRole('link', { name: 'Přeskočit na ukázku' }).count() === 1 && await p.getByRole('link', { name: 'Přeskočit na ceník' }).count() === 1);
  const ld = await p.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent));
  let ldOk = false; let ldInfo = '';
  try {
    const j = JSON.parse(ld[0]);
    const app = j['@graph'].find(x => x['@type'] === 'SoftwareApplication');
    ldOk = !!app && app.offers.length === 3 && !JSON.stringify(j).match(/aggregateRating|"review"/) && app.offers.map(o => o.price).join() === '0,499,999';
    ldInfo = app ? app.offers.map(o => o.price).join() : 'bez aplikace';
  } catch (e) { ldInfo = String(e); }
  tvrdi(`L10 JSON-LD SoftwareApplication: tři nabídky z lib/plan (${ldInfo}) a žádné hodnocení`, ldOk, ldInfo);
  const pat = await p.locator('footer').innerText();
  tvrdi('L10 patička říká, že fotky jsou ilustrační a data v obrazovkách vymyšlená', /ilustrační/.test(pat) && /vymyšlená/.test(pat));
  const cenik = await p.locator('#cenik').innerText();
  tvrdi('L10 ceník neukazuje vymyšlenou přeškrtnutou cenu', (await p.locator('#cenik s, #cenik del').count()) === 0 && !/2 měsíce zdarma/.test(cenik));
  await ctx.close();
}

await konec();
