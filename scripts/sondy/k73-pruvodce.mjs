// Kolo 73 — průvodce prvotním nastavením (/employer/start).
//
// Sonda prochází průvodce v prohlížeči (API podvržené stavovou fixturou, která
// se chová jako skutečná routa: PUT sloučí odpovědi, GET je vrátí) a tvrdí:
//  P1  jeden h1, „Krok X z Y" v aria-live, žádné přetečení, právě jedna plná
//      limetka (tlačítko), tlačítka mají type — na 1280 i 390 px, na každém kroku
//  P2  celý průchod Vítej → … → Otevřít Přehled, PUT s krokem a odpověďmi
//  P3  autosave: obnovení stránky otevře poslední krok; výpadek sítě (500 i
//      odpojení) → hláška a krok se nepustí dál; GET spadne → „Zkusit znovu"
//  P4  pozvánky: bez odeslaného e-mailu odkaz, plný tým (403) je info, ne pád
//  P5  finále přehrává skutečné výsledky serveru (ok / přeskočeno / chyba),
//      „Otevřít Přehled" je do konce animace zamčené
//  P6  klávesnice: šipky mezi dlaždicemi typu, Enter v poli jde dál, Escape
//      při rozepsaném se zeptá a nic neztratí
//  P7  přerušení a pokračování (Dokončit později → návrat na poslední krok)
//  P8  prefers-reduced-motion: žádné animace, finále je hotové hned
//  P9  tmavý režim: kontrast textu ≥ 4,5 : 1
//  P10 živá ukázka: skutečná aplikace v rámu, scéna se mění podle cíle
//  P11 typografie drží řadu a nikde nejsou syrové barvy mimo tokeny
// Snímky jdou do shots/k73-*.png.
//
// Adresa serveru: SONDY_ZAKLAD (výchozí http://localhost:3000). Nezávisí na denní
// době: průvodce nemá žádné připomínky a ukázka drží paměťové úložiště.
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SONDY_ZAKLAD ?? 'http://localhost:3000';
const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const tok = execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? 'design-round-secret-0123456789ab'} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} employer`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let fails = 0;
const tvrdi = (popis, ok, co = '') => { console.log(`${ok ? '✓' : '✗'} ${popis}${ok ? '' : '  ← ' + co}`); if (!ok) fails++; };

/** Stav podvržené routy /api/onboarding — chová se jako skutečná (spec §5.5). */
function novyStav(pocatek = {}) {
  return {
    stav: 'nove', krok: null, odpovedi: {}, puty: [], posty: [], pozvanky: [], dotazy: [],
    failPut: null, failGet: null, pouzitOdpoved: null, pozvankaOdpoved: null, pouzitZpozdeni: 0, ...pocatek,
  };
}
const VYSLEDKY = {
  polozky: [
    { klic: 'podnik', nazev: 'Nastavení podniku', stav: 'ok' },
    { klic: 'doba', nazev: 'Otevírací doba', stav: 'ok' },
    { klic: 'smeny', nazev: 'Typy směn', stav: 'ok', pocet: 2, poznamka: '2 typy směn' },
    { klic: 'sklad', nazev: 'Kategorie skladu', stav: 'preskoceno', poznamka: 'Stejné kategorie už máte.' },
    { klic: 'postupy', nazev: 'Postupy', stav: 'chyba', poznamka: 'Založení selhalo. Nastavíš to ručně: Postupy.' },
    { klic: 'prehled', nazev: 'Přehled', stav: 'ok', pocet: 8, poznamka: '8 widgetů' },
  ],
  prehled: { widgetu: 8, polozky: [
    { w: 'prehled.ceka_na_tebe', s: 'L' }, { w: 'prehled.prvni_kroky', s: 'L' }, { w: 'rozvrh.dnesni_smeny', s: 'M' }, { w: 'dochazka.prave_na_smene', s: 'M' },
    { w: 'sklad.dochazi', s: 'M' }, { w: 'sklad.nakupni_seznam', s: 'M' }, { w: 'oznameni.nastenka', s: 'M' }, { w: 'chat.neprectene', s: 'S' },
  ] },
};

async function kontext({ viewport = { width: 1280, height: 900 }, mobil = false, reduced = false, tmavy = false, stav = novyStav() } = {}) {
  const ctx = await b.newContext({ viewport, locale: 'cs-CZ', isMobile: mobil, hasTouch: mobil, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(([t]) => { try { if (t) localStorage.setItem('managero-theme', 'dark'); else localStorage.removeItem('managero-theme'); } catch { /* soukromé okno */ } }, [tmavy]);
  await ctx.route('**/api/**', async route => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method(); const path = u.pathname;
    stav.dotazy.push(`${m} ${path}`);
    if (path.startsWith('/api/auth/')) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/onboarding') {
      if (m === 'GET') {
        if (stav.failGet === 'abort') return route.abort('failed');
        if (stav.failGet) return json({ error: 'Server spadl' }, stav.failGet);
        return json({
          stav: stav.stav, krok: stav.krok, odpovedi: stav.odpovedi, pouzito: {},
          podnik: { name: 'Kavárna Test', currency: 'CZK', locale: 'cs-CZ', week_start: 1, business_type: null, opening_hours: null, address: null, country: null },
          plan: { effective: 'free' }, kod: 'K7X2QM', pocty: { clenu: 1, pozvanek: 0 },
        });
      }
      if (m === 'PUT') {
        if (stav.failPut === 'abort') return route.abort('failed');
        if (stav.failPut) return json({ error: 'Server spadl' }, stav.failPut);
        const t = JSON.parse(req.postData() || '{}');
        stav.puty.push(t);
        stav.odpovedi = { ...stav.odpovedi, ...(t.odpovedi ?? {}) };
        if (t.krok) stav.krok = t.krok;
        if (t.stav) stav.stav = t.stav;
        return json({ ok: true, upraveno: new Date().toISOString(), stav: stav.stav });
      }
    }
    if (path === '/api/onboarding/pouzit' && m === 'POST') {
      stav.posty.push(JSON.parse(req.postData() || '{}'));
      if (stav.pouzitZpozdeni) await new Promise(r => setTimeout(r, stav.pouzitZpozdeni));
      const o = stav.pouzitOdpoved ?? { status: 200, body: VYSLEDKY };
      stav.stav = 'hotovo';
      return json(o.body, o.status);
    }
    if (path === '/api/invitations' && m === 'POST') {
      const t = JSON.parse(req.postData() || '{}');
      stav.pozvanky.push(t);
      const o = stav.pozvankaOdpoved?.(t) ?? { status: 200, body: { ok: true, token: 'tok123', path: '/join?token=tok123', emailSent: true } };
      return json(o.body, o.status);
    }
    if (m !== 'GET') return json({ ok: true });
    return json([]);
  });
  const p = await ctx.newPage();
  stav.demoDotazy = [];
  p.on('request', r => { if (/\/api\//.test(r.url()) && /\/demo/.test(r.frame()?.url() ?? '')) stav.demoDotazy.push(r.url()); });
  const chyby = [];
  p.on('pageerror', e => chyby.push(String(e)));
  p.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource|net::ERR/.test(msg.text())) chyby.push(msg.text()); });
  return { ctx, p, stav, chyby };
}

const h1Text = p => p.locator('h1').first().innerText();
const KROK = /Krok (\d+) z (\d+)/;
const cekejNaH1 = async (p, re) => { await p.locator('h1').filter({ hasText: re }).first().waitFor({ timeout: 15000 }); await p.waitForTimeout(250); };
const pokracovat = p => p.getByRole('button', { name: /^(Pokračovat|Začít|Sestavit podnik)/ });
const dal = async (p, re) => { await pokracovat(p).click(); await cekejNaH1(p, re); };
const overflow = p => p.evaluate(() => ({ dok: document.documentElement.scrollWidth - innerWidth, telo: document.body.scrollWidth - innerWidth }));

/** Plné limetkové plochy velikosti tlačítka (přepínač je stav, ne akce: stopa Switch se nepočítá). */
const limetky = p => p.evaluate(() => [...document.querySelectorAll('body *')].filter(el => {
  if (el.closest('iframe')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 40 || r.height < 26 || r.bottom < 0 || r.top > innerHeight) return false;
  if (el.getAttribute('role') === 'switch') return false;
  const cs = getComputedStyle(el);
  return cs.backgroundColor === 'rgb(200, 245, 66)' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.5;
}).map(el => (el.textContent ?? '').trim().slice(0, 24) || el.tagName));

/** Tlačítka bez type (v <form> by odeslala formulář). */
const tlacitkaBezTypu = p => p.evaluate(() => [...document.querySelectorAll('button:not([type])')].map(b => b.textContent?.trim().slice(0, 20)));

/** Dotykové cíle pod 36 px (mimo skryté a mimo sr-only). */
const malaTlacitka = p => p.evaluate(() => [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=radio], [role=switch]')].filter(el => {
  if (el.closest('.sr-only, iframe, [inert]')) return false;
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden') return false;
  // Nevzhledná cílová plocha: pseudo-prvek .tap-target rozšíří zásah na 44/36 px.
  const ma = el.matches('.tap-target, .tap-target-sm');
  return !ma && (r.height < 36 || r.width < 36) && !(el.tagName === 'A' && r.height >= 20);
}).map(el => `${el.tagName} ${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 18)} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`));

const pismo = p => p.evaluate(() => {
  const mimo = new Map();
  for (const el of document.querySelectorAll('[data-pruvodce] *')) {
    if ([...el.childNodes].every(n => n.nodeType !== 3 || !n.textContent.trim())) continue;
    if (el.closest('.sr-only, [aria-hidden="true"], iframe, svg')) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden') continue;
    const px = Math.round(parseFloat(cs.fontSize) * 10) / 10;
    if (![11, 12, 13, 14, 15, 16, 18, 28].includes(px)) mimo.set(px, (mimo.get(px) ?? []).concat(el.textContent.trim().slice(0, 22)));
  }
  return Object.fromEntries([...mimo].map(([k, v]) => [k, v.slice(0, 3)]));
});

const kontrast = p => p.evaluate(() => {
  const parse = c => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const x = m[1].split(',').map(parseFloat); return { r: x[0], g: x[1], b: x[2], a: x.length > 3 ? x[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const pomer = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
  const pod = el => { let acc = null; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (!c || c.a === 0) continue; acc = acc ? over(acc, c) : c; if (acc.a >= 0.999) return acc; } return acc ?? parse(getComputedStyle(document.body).backgroundColor); };
  const spatne = [];
  for (const el of document.querySelectorAll('[data-pruvodce] *')) {
    if (el.children.length) continue;
    const t = (el.textContent ?? '').trim();
    if (t.length < 2 || /^\p{Extended_Pictographic}+$/u.test(t)) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || r.top > innerHeight || r.bottom < 0 || cs.visibility === 'hidden' || el.closest('.sr-only, [aria-hidden="true"], iframe, [disabled]')) continue;
    let fg = parse(cs.color); if (!fg) continue;
    let op = 1; for (let n = el; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
    const bg = pod(el); fg = { ...fg, a: fg.a * op }; const eff = fg.a < 1 ? over(fg, bg) : fg;
    const px = parseFloat(cs.fontSize); const velky = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    const k = pomer(eff, bg);
    if (k < (velky ? 3 : 4.5)) spatne.push(`${t.slice(0, 24)} ${k.toFixed(2)}`);
  }
  return spatne;
});

/** Společné tvrzení o jednom kroku (P1). */
async function overKrok(p, popis, { cislo } = {}) {
  const h1 = await p.locator('h1').count();
  tvrdi(`P1 ${popis}: právě jeden h1`, h1 === 1, String(h1));
  const t = await p.locator('[data-krok-x-z-y]').textContent();
  const m = KROK.exec(t);
  tvrdi(`P1 ${popis}: „Krok X z Y" v aria-live`, !!m && (cislo == null || Number(m[1]) === cislo) && Number(m[2]) >= Number(m[1]), t);
  tvrdi(`P1 ${popis}: aria-live na čítači kroků`, (await p.locator('[data-krok-x-z-y]').getAttribute('aria-live')) === 'polite');
  const o = await overflow(p);
  tvrdi(`P1 ${popis}: žádné přetečení`, o.dok <= 0 && o.telo <= 0, JSON.stringify(o));
  // Na zatíženém stroji doběhne vstupní animace a uložení později než za čtvrt vteřiny: počkat na klid.
  await p.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 10000 });
  let lim = await limetky(p);
  for (let i = 0; i < 20 && lim.length !== 1; i++) { await p.waitForTimeout(150); lim = await limetky(p); }
  tvrdi(`P1 ${popis}: právě jedna plná limetka`, lim.length === 1, JSON.stringify(lim));
  const bt = await tlacitkaBezTypu(p);
  tvrdi(`P1 ${popis}: tlačítka mají type`, bt.length === 0, JSON.stringify(bt));
  const mimoKartu = await p.evaluate(() => { const f = document.querySelector('.pv-paticka'); if (!f) return ['bez patičky']; const r = f.getBoundingClientRect(); return [...f.querySelectorAll('button')].filter(b => { const x = b.getBoundingClientRect(); return x.right > r.right - 8 || x.left < r.left + 8; }).map(b => b.textContent?.trim()); });
  tvrdi(`P1 ${popis}: tlačítka patičky jsou uvnitř karty`, mimoKartu.length === 0, JSON.stringify(mimoKartu));
  const mala = await malaTlacitka(p);
  tvrdi(`P1 ${popis}: dotykové cíle ≥ 36 px`, mala.length === 0, JSON.stringify(mala.slice(0, 5)));
}

// =====================================================================
// P1 + P2: celý průchod na 1280 i 390 px
// =====================================================================
for (const [nazev, vp, mobil] of [['1280', { width: 1280, height: 900 }, false], ['390', { width: 390, height: 844 }, true]]) {
  const { ctx, p, stav, chyby } = await kontext({ viewport: vp, mobil });
  await p.goto(BASE + '/employer/start', { waitUntil: 'domcontentloaded' });
  await cekejNaH1(p, /^Vítej, Martin/);
  await overKrok(p, `${nazev} Vítej`, { cislo: 1 });
  await p.screenshot({ path: `${OUT}k73-vitej-${nazev}.png` });

  await dal(p, /Jaký podnik vedeš/);
  await overKrok(p, `${nazev} Typ`, { cislo: 2 });
  tvrdi(`P2 ${nazev}: PUT po Začít nese krok typ`, stav.puty.at(-1)?.krok === 'typ' && stav.puty.at(-1)?.stav === 'rozpracovano', JSON.stringify(stav.puty.at(-1)));
  // bez vybraného typu nejde dál a říká proč
  await pokracovat(p).click();
  tvrdi(`P2 ${nazev}: bez typu hláška a krok zůstává`, await p.getByText('Vyber typ podniku, nebo krok přeskoč.').isVisible() && /Jaký podnik/.test(await h1Text(p)));
  await p.locator('[data-typ="bar"]').click();
  tvrdi(`P2 ${nazev}: dlaždice bar je vybraná`, (await p.locator('[data-typ="bar"]').getAttribute('aria-checked')) === 'true');
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}k73-typ-${nazev}.png` });
  await dal(p, /Jak se jmenuje a kde stojí/);
  await overKrok(p, `${nazev} Podnik`, { cislo: 3 });
  tvrdi(`P2 ${nazev}: název z registrace je předvyplněný`, (await p.getByLabel('Název podniku').inputValue()) === 'Kavárna Test');
  tvrdi(`P2 ${nazev}: náhled částky ve formátu podniku`, /1\s?500\s?Kč/.test((await p.locator('[data-ukazka-castky]').innerText()).replace(/ /g, ' ')), await p.locator('[data-ukazka-castky]').innerText());
  await p.getByLabel('Země').selectOption('SK');
  tvrdi(`P2 ${nazev}: Slovensko přepne měnu na euro a částku na 1 500 €`, (await p.getByLabel('Měna').inputValue()) === 'EUR' && /€/.test(await p.locator('[data-ukazka-castky]').innerText()));
  await p.getByLabel('Země').selectOption('CZ');
  await p.getByLabel('Název podniku').fill('');
  await pokracovat(p).click();
  tvrdi(`P2 ${nazev}: prázdný název nejde dál`, await p.getByText('Napiš název podniku.').isVisible());
  await p.getByLabel('Název podniku').fill('Bar U Lípy');
  await p.getByLabel('Ulice a město').fill('Vinohradská 12, Praha');
  await p.screenshot({ path: `${OUT}k73-podnik-${nazev}.png` });
  await dal(p, /Kdy máte otevřeno/);
  await overKrok(p, `${nazev} Doba`, { cislo: 4 });
  const putPodnik = stav.puty.at(-1);
  tvrdi(`P2 ${nazev}: PUT po kroku Podnik nese odpovědi a další krok`, putPodnik?.krok === 'doba' && putPodnik.odpovedi.nazev === 'Bar U Lípy' && putPodnik.odpovedi.typ === 'bar' && putPodnik.odpovedi.mena === 'CZK', JSON.stringify(putPodnik));
  await p.getByRole('tab', { name: 'Po až Pá' }).click();
  await p.waitForTimeout(400);
  tvrdi(`P2 ${nazev}: předvolba Po až Pá zavře víkend`, (await p.locator('ul[aria-label="Otevírací doba po dnech"] li').nth(5).locator('button[aria-pressed]').getAttribute('aria-pressed')) === 'true');
  await p.getByLabel('Pondělí otevíráme v').fill('07:30');
  await p.screenshot({ path: `${OUT}k73-doba-${nazev}.png` });
  await dal(p, /Kdo s tebou pracuje/);
  await overKrok(p, `${nazev} Tým`, { cislo: 5 });
  const putDoba = stav.puty.at(-1);
  tvrdi(`P2 ${nazev}: doba se ukládá ve tvaru PUT /api/opening-hours`, putDoba?.odpovedi?.doba?.['0']?.open === '07:30' && putDoba.odpovedi.doba['5'].closed === true && Object.keys(putDoba.odpovedi.doba).length === 7, JSON.stringify(putDoba?.odpovedi?.doba?.['0']));

  // P4: pozvánky
  stav.pozvankaOdpoved = t => (t.email === 'plny@firma.cz'
    ? { status: 403, body: { error: 'Tým je na plánu Zdarma plný (3 členové).' } }
    : t.email === 'bez@firma.cz' ? { status: 200, body: { ok: true, token: 'abc', path: '/join?token=abc', emailSent: false } }
    : { status: 200, body: { ok: true, token: 'ok', path: '/join?token=ok', emailSent: true } });
  await p.getByLabel('Pozvat e-mailem').fill('kolega@firma.cz');
  await p.getByLabel('Pozvat e-mailem').press('Enter');
  await p.locator('[data-odeslano]').waitFor({ timeout: 5000 });
  tvrdi(`P4 ${nazev}: Enter v poli pošle pozvánku (a nepřepne krok)`, stav.pozvanky.length === 1 && /Kdo s tebou/.test(await h1Text(p)) && /1 pozvánka odešla/.test(await p.locator('[data-odeslano]').innerText()), await p.locator('[data-odeslano]').innerText());
  tvrdi(`P4 ${nazev}: pozvánka nese pozici podle typu`, stav.pozvanky[0].jobTitle === 'Barman', JSON.stringify(stav.pozvanky[0]));
  await p.getByLabel('Pozvat e-mailem').fill('bez@firma.cz');
  await p.getByLabel('Pozvat e-mailem').press('Enter');
  await p.locator('[data-kopirovat-odkaz]').waitFor({ timeout: 5000 });
  tvrdi(`P4 ${nazev}: e-mail neodešel → nabídne odkaz ke zkopírování`, await p.locator('[data-kopirovat-odkaz]').isVisible());
  await p.getByLabel('Pozvat e-mailem').fill('plny@firma.cz');
  await p.getByLabel('Pozvat e-mailem').press('Enter');
  await p.locator('[data-plny-tym]').waitFor({ timeout: 5000 });
  tvrdi(`P4 ${nazev}: plný tým na Zdarma je info, ne pád`, /nejvýš tři lidé/.test(await p.locator('[data-plny-tym]').innerText()) && chyby.length === 0, chyby.join('|'));
  await p.getByLabel('Pozvat e-mailem').fill('neni email');
  await p.getByLabel('Pozvat e-mailem').press('Enter');
  tvrdi(`P4 ${nazev}: špatný e-mail se nepošle`, await p.getByText('E-mail nevypadá správně.').isVisible() && stav.pozvanky.length === 3);
  tvrdi(`P4 ${nazev}: kód pro připojení je vidět`, (await p.locator('[data-kod]').innerText()) === 'K7X2QM');
  await p.screenshot({ path: `${OUT}k73-tym-${nazev}.png` });
  await dal(p, /Co chceš mít pod kontrolou/);
  await overKrok(p, `${nazev} Cíle`, { cislo: 6 });
  const putTym = stav.puty.at(-1);
  tvrdi(`P4 ${nazev}: ukládá se jen počet pozvaných, ne e-maily`, putTym?.odpovedi?.tym?.pozvanych === 2 && !JSON.stringify(putTym).includes('@'), JSON.stringify(putTym?.odpovedi?.tym));

  // Cíle: zapnout Uzávěrky → přibude krok Kasa; ukázka se mění podle zaostření
  tvrdi(`P2 ${nazev}: cíle jsou předvybrané podle typu (bar)`, (await p.locator('[data-cil="rozvrh"]').getAttribute('aria-pressed')) === 'true' && (await p.locator('[data-cil="sklad"]').getAttribute('aria-pressed')) === 'true');
  await p.locator('[data-cil="hoste"]').hover();
  tvrdi(`P2 ${nazev}: zaostření na Hosty ukáže jejich větu a štítek Max`, /Rezervace, objednávky od stolu/.test(await p.locator('[data-ukazka-cile]').innerText()) && await p.locator('[data-cil="hoste"]').getByText('Max').isVisible());
  tvrdi(`P2 ${nazev}: bar má předvybrané i Uzávěrky (→ přibude krok Kasa)`, (await p.locator('[data-cil="uzaverky"]').getAttribute('aria-pressed')) === 'true');
  await p.locator('[data-cil="provoz"]').click();
  tvrdi(`P2 ${nazev}: klepnutí zapne cíl (aria-pressed)`, (await p.locator('[data-cil="provoz"]').getAttribute('aria-pressed')) === 'true');
  await p.screenshot({ path: `${OUT}k73-cile-${nazev}.png` });
  await dal(p, /Jak zavíráte kasu/);
  await overKrok(p, `${nazev} Kasa`, { cislo: 7 });
  tvrdi(`P2 ${nazev}: s cílem Uzávěrky je celkem 9 kroků`, /z 9/.test(await p.locator('[data-krok-x-z-y]').textContent()));
  await p.getByLabel('Hotovost v kase na začátku').fill('2000');
  await p.screenshot({ path: `${OUT}k73-kasa-${nazev}.png` });
  await dal(p, /Tohle ti nastavíme/);
  await overKrok(p, `${nazev} Shrnutí`, { cislo: 8 });
  tvrdi(`P2 ${nazev}: Shrnutí ukáže směny a kategorie podle typu`, await p.getByText('Zavírací', { exact: false }).first().isVisible() && await p.getByText('Destiláty', { exact: false }).first().isVisible());
  tvrdi(`P2 ${nazev}: Shrnutí slibuje „jen přidává"`, await p.getByText('Nic neruší tvoje dosavadní nastavení, jen přidává.').isVisible());
  // vypnout Kategorie skladu
  await p.getByRole('switch', { name: 'Kategorie skladu' }).click();
  await p.screenshot({ path: `${OUT}k73-shrnuti-${nazev}.png` });

  // P5: finále přehrává odpověď serveru
  stav.pouzitZpozdeni = 400;
  await pokracovat(p).click();
  await cekejNaH1(p, /Podnik je připravený/);
  tvrdi(`P5 ${nazev}: POST /pouzit nese vypnuté položky`, stav.posty.at(-1)?.vypnout?.includes('sklad') === true, JSON.stringify(stav.posty.at(-1)));
  const otevrit = p.getByRole('button', { name: 'Otevřít Přehled' });
  tvrdi(`P5 ${nazev}: „Otevřít Přehled" je do konce animace zamčené`, await otevrit.isDisabled());
  await p.waitForFunction(() => document.querySelectorAll('[data-vysledek]').length === 6, null, { timeout: 8000 });
  await p.getByText('Co dál').waitFor({ timeout: 8000 });
  await p.waitForFunction(() => { const t = [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === 'Otevřít Přehled'); return !!t && !t.disabled; }, null, { timeout: 8000 }).catch(() => {});
  tvrdi(`P5 ${nazev}: „Otevřít Přehled" se odemkne až po animaci`, await otevrit.isEnabled());
  const stavy = await p.$$eval('[data-vysledek]', els => els.map(e => `${e.getAttribute('data-vysledek')}:${e.getAttribute('data-stav')}`));
  eq(`P5 ${nazev}: finále ukáže přesně výsledky serveru`, stavy, ['podnik:ok', 'doba:ok', 'smeny:ok', 'sklad:preskoceno', 'postupy:chyba', 'prehled:ok']);
  tvrdi(`P5 ${nazev}: nepovedená operace říká, kde ji nastavit`, /Nastavíš to ručně: Postupy/.test(await p.locator('[data-vysledek="postupy"]').innerText()));
  tvrdi(`P5 ${nazev}: miniatura Přehledu má dílky podle výsledného rozložení`, (await p.locator('[data-mini-prehled] .pv-dil').count()) === 8 && (await p.locator('[data-mini-prehled] .pv-dil[data-v="L"]').count()) === 2);
  await p.screenshot({ path: `${OUT}k73-hotovo-${nazev}.png`, fullPage: true });
  await overKrok(p, `${nazev} Hotovo`, { cislo: 9 });
  await otevrit.click();
  await p.waitForURL(/\/employer\/overview/, { timeout: 15000 });
  tvrdi(`P2 ${nazev}: Otevřít Přehled vede na /employer/overview`, /\/employer\/overview/.test(p.url()));
  tvrdi(`P2 ${nazev}: bez chyb v konzoli`, chyby.length === 0, chyby.join(' | ').slice(0, 300));
  await ctx.close();
}

function eq(popis, dostal, cekano) { tvrdi(popis, JSON.stringify(dostal) === JSON.stringify(cekano), JSON.stringify(dostal)); }

// =====================================================================
// P3: autosave, obnovení, výpadky
// =====================================================================
{
  const { ctx, p, stav } = await kontext();
  await p.goto(BASE + '/employer/start', { waitUntil: 'domcontentloaded' });
  await cekejNaH1(p, /^Vítej/);
  await dal(p, /Jaký podnik vedeš/);
  await p.locator('[data-typ="pekarna"]').click();
  // výpadek: server odpoví 500 → hláška, krok zůstává
  stav.failPut = 500;
  await pokracovat(p).click();
  await p.locator('[data-chyba-ulozeni]').waitFor({ timeout: 5000 });
  tvrdi('P3: 500 na PUT → hláška (note-danger) a krok se nepustí dál', /Server spadl/.test(await p.locator('[data-chyba-ulozeni]').innerText()) && /Jaký podnik vedeš/.test(await h1Text(p)) && (await p.locator('[data-chyba-ulozeni]').getAttribute('class')).includes('note-danger'));
  // odpojení: žádná odpověď
  stav.failPut = 'abort';
  await pokracovat(p).click();
  await p.waitForTimeout(600);
  tvrdi('P3: odpojená síť → česká hláška, žádná anglická', /zkontroluj připojení/i.test(await p.locator('[data-chyba-ulozeni]').innerText()) && !/fetch/i.test(await p.locator('[data-chyba-ulozeni]').innerText()));
  tvrdi('P3: hláška má role alert', (await p.locator('[data-chyba-ulozeni]').getAttribute('role')) === 'alert');
  stav.failPut = null;
  await dal(p, /Jak se jmenuje/);
  tvrdi('P3: po obnovení spojení průvodce pokračuje', /Jak se jmenuje/.test(await h1Text(p)));
  // obnovení stránky otevře poslední krok
  await p.reload({ waitUntil: 'domcontentloaded' });
  await cekejNaH1(p, /Jak se jmenuje a kde stojí/);
  tvrdi('P3: obnovení stránky otevře poslední uložený krok', /Jak se jmenuje/.test(await h1Text(p)));
  await p.getByRole('button', { name: 'Zpět' }).click();
  await cekejNaH1(p, /Jaký podnik/);
  tvrdi('P3: odpověď zůstala vybraná po návratu (pekárna)', (await p.locator('[data-typ="pekarna"]').getAttribute('aria-checked')) === 'true');
  // GET spadne
  await ctx.close();
}
{
  const { ctx, p, stav } = await kontext({ stav: novyStav({ failGet: 500 }) });
  await p.goto(BASE + '/employer/start', { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: 'Zkusit znovu' }).waitFor({ timeout: 15000 });
  tvrdi('P3: GET spadne → hláška a „Zkusit znovu", ne bílá obrazovka', await p.locator('p[role=alert]').isVisible() && await p.getByRole('button', { name: 'Přejít do aplikace' }).isVisible());
  stav.failGet = null;
  await p.getByRole('button', { name: 'Zkusit znovu' }).click();
  await cekejNaH1(p, /^Vítej/);
  tvrdi('P3: po „Zkusit znovu" se průvodce načte', /^Vítej/.test(await h1Text(p)));
  await ctx.close();
}
{
  // Podnik bez průvodce (z doby před ním) nebo hotový: klient nenechá člověka v průvodci.
  const { ctx, p } = await kontext({ stav: novyStav({ stav: 'hotovo' }) });
  await p.goto(BASE + '/employer/start', { waitUntil: 'domcontentloaded' });
  await p.waitForURL(/\/employer\/overview/, { timeout: 15000 });
  tvrdi('P3: hotový průvodce (bez ?znovu) vede rovnou do aplikace', /\/employer\/overview/.test(p.url()));
  await ctx.close();
}

// =====================================================================
// P6 + P7: klávesnice, Escape, přerušení a pokračování
// =====================================================================
{
  const { ctx, p, stav } = await kontext();
  await p.goto(BASE + '/employer/start', { waitUntil: 'domcontentloaded' });
  await cekejNaH1(p, /^Vítej/);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  tvrdi('P6: Escape na začátku (nic rozepsaného, jen předvyplněný název) se neptá', await p.getByRole('dialog').count() === 0);
  await dal(p, /Jaký podnik vedeš/);
  // Tab vstoupí do skupiny jednou, šipky přesouvají výběr
  await p.locator('[data-typ="kavarna"]').focus();
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowRight');
  tvrdi('P6: šipka vpravo přesune výběr a fokus mezi dlaždicemi', (await p.locator('[data-typ="bar"]').getAttribute('aria-checked')) === 'true' && await p.locator('[data-typ="bar"]').evaluate(el => el === document.activeElement));
  await p.keyboard.press('ArrowLeft');
  tvrdi('P6: šipka vlevo vrací výběr', (await p.locator('[data-typ="restaurace"]').getAttribute('aria-checked')) === 'true');
  tvrdi('P6: jen vybraná dlaždice je v pořadí tabulátoru (roving tabindex)', await p.$$eval('[data-typ]', els => els.filter(e => e.tabIndex === 0).map(e => e.dataset.typ).join()) === 'restaurace');
  await p.keyboard.press('Space');
  await p.keyboard.press('Tab');
  // Enter v poli jde dál
  await p.getByRole('button', { name: /^Pokračovat/ }).focus();
  await p.keyboard.press('Enter');
  await cekejNaH1(p, /Jak se jmenuje/);
  await p.getByLabel('Název podniku').fill('Restaurace Test');
  await p.getByLabel('Název podniku').press('Enter');
  await cekejNaH1(p, /Kdy máte otevřeno/);
  tvrdi('P6: Enter v poli názvu pokračuje na další krok', /Kdy máte otevřeno/.test(await h1Text(p)));
  tvrdi('P6: po přechodu je fokus na nadpisu kroku', await p.locator('h1').evaluate(el => el === document.activeElement));
  // Escape při rozepsaném se zeptá
  await p.getByLabel('Pondělí otevíráme v').fill('06:45');
  await p.keyboard.press('Escape');
  await p.getByRole('dialog').waitFor({ timeout: 3000 });
  tvrdi('P6: Escape při rozepsaném se zeptá „Dokončit později?"', await p.getByRole('dialog').getByText('Dokončit později?').first().isVisible());
  await p.getByRole('dialog').getByRole('button', { name: 'Zůstat' }).click();
  await p.waitForTimeout(300);
  tvrdi('P6: „Zůstat" nic neztratí (rozepsaná hodnota zůstala)', (await p.getByLabel('Pondělí otevíráme v').inputValue()) === '06:45' && await p.getByRole('dialog').count() === 0);
  // P7: Dokončit později uloží a odejde; návrat otevře poslední krok
  await p.getByRole('button', { name: 'Dokončit později' }).first().click();
  await p.waitForURL(/\/employer\/overview/, { timeout: 15000 });
  const posledni = stav.puty.at(-1);
  tvrdi('P7: Dokončit později uloží stav preskoceno, krok a odpovědi', posledni?.stav === 'preskoceno' && posledni.krok === 'doba' && posledni.odpovedi.typ === 'restaurace' && posledni.odpovedi.doba?.['0']?.open === '06:45', JSON.stringify({ s: posledni?.stav, k: posledni?.krok }));
  await p.goto(BASE + '/employer/start?znovu=1', { waitUntil: 'domcontentloaded' });
  await cekejNaH1(p, /Kdy máte otevřeno/);
  tvrdi('P7: návrat otevře poslední krok s uloženými odpověďmi', (await p.getByLabel('Pondělí otevíráme v').inputValue()) === '06:45');
  await ctx.close();
}
{
  // Dokončit později, když uložení selže: druhé klepnutí odejde i bez uložení (žádná past).
  const { ctx, p, stav } = await kontext();
  await p.goto(BASE + '/employer/start', { waitUntil: 'domcontentloaded' });
  await cekejNaH1(p, /^Vítej/);
  stav.failPut = 500;
  const tlacitko = p.getByRole('button', { name: 'Dokončit později' }).first();
  await tlacitko.click();
  await p.locator('[data-chyba-ulozeni]').waitFor({ timeout: 5000 });
  tvrdi('P7: při selhání uložení průvodce odejít nezakáže', /ještě jednou, odejdeš i bez uložení/.test(await p.locator('[data-chyba-ulozeni]').innerText()));
  await p.getByRole('button', { name: 'Dokončit později' }).first().click();
  await p.waitForURL(/\/employer\/overview/, { timeout: 15000 });
  tvrdi('P7: druhé klepnutí odejde', /\/employer\/overview/.test(p.url()));
  await ctx.close();
}

// =====================================================================
// P5b: server selže při sestavování
// =====================================================================
{
  const { ctx, p, stav } = await kontext({ stav: novyStav({ stav: 'rozpracovano', krok: 'shrnuti', odpovedi: { typ: 'kavarna', nazev: 'X', cile: ['sklad'] } }) });
  stav.pouzitOdpoved = { status: 500, body: { error: 'Podnik se nepodařilo sestavit. Zkus to znovu.' } };
  await p.goto(BASE + '/employer/start', { waitUntil: 'domcontentloaded' });
  await cekejNaH1(p, /Tohle ti nastavíme/);
  await pokracovat(p).click();
  await p.locator('[data-sestaveni-chyba]').waitFor({ timeout: 8000 });
  tvrdi('P5: selhání sestavení je vidět a říká, že se nic nezahodilo', /Nic se nezahodilo/.test(await p.locator('[data-sestaveni-chyba]').innerText()));
  tvrdi('P5: nabízí „Zkusit znovu" a „Zpět na shrnutí"', await p.getByRole('button', { name: 'Zkusit znovu' }).isVisible() && await p.getByRole('button', { name: 'Zpět na shrnutí' }).isVisible());
  stav.pouzitOdpoved = null;
  await p.getByRole('button', { name: 'Zkusit znovu' }).click();
  await p.getByText('Co dál').waitFor({ timeout: 10000 });
  await p.waitForFunction(() => { const t = [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === 'Otevřít Přehled'); return !!t && !t.disabled; }, null, { timeout: 8000 }).catch(() => {});
  tvrdi('P5: po „Zkusit znovu" se finále přehraje', await p.getByRole('button', { name: 'Otevřít Přehled' }).isEnabled());
  await ctx.close();
}

// =====================================================================
// P8: omezený pohyb
// =====================================================================
{
  const { ctx, p } = await kontext({ reduced: true, stav: novyStav({ stav: 'rozpracovano', krok: 'shrnuti', odpovedi: { typ: 'kavarna', nazev: 'X', cile: ['sklad', 'rozvrh'] } }) });
  await p.goto(BASE + '/employer/start', { waitUntil: 'domcontentloaded' });
  await cekejNaH1(p, /Tohle ti nastavíme/);
  const animace = await p.evaluate(() => [...document.querySelectorAll('h1, h1 ~ *, .pv-vpred, .pv-vzad, .ken-burns, .stagger > *, .rise-in, .pv-postup > span')].map(el => getComputedStyle(el).animationName).filter(n => n !== 'none'));
  tvrdi('P8: žádný prvek kroku nemá animaci', animace.length === 0, JSON.stringify(animace.slice(0, 5)));
  await pokracovat(p).click();
  await cekejNaH1(p, /Podnik je připravený/);
  await p.getByText('Co dál').waitFor({ timeout: 3000 });
  tvrdi('P8: finále je hotové hned (všechny řádky, dílky a odemčené tlačítko)', (await p.locator('[data-vysledek]').count()) === 6 && await p.getByRole('button', { name: 'Otevřít Přehled' }).isEnabled());
  const dily = await p.evaluate(() => [...document.querySelectorAll('.pv-dil')].map(el => getComputedStyle(el).animationName).filter(n => n !== 'none'));
  tvrdi('P8: dílky miniatury bez animace', dily.length === 0, JSON.stringify(dily));
  const prechody = await p.evaluate(() => [...document.querySelectorAll('[data-pruvodce] [class*="pv-"]')].filter(el => /transform|width|height|all/.test(getComputedStyle(el).transitionProperty) && parseFloat(getComputedStyle(el).transitionDuration) > 0.13 && !el.closest('iframe')).map(el => `${el.className?.toString().slice(0, 30)}:${getComputedStyle(el).transitionProperty}`).slice(0, 5));
  tvrdi('P8: při omezeném pohybu nejsou delší přechody než 120 ms', prechody.length === 0, JSON.stringify(prechody));
  await ctx.close();
}

// =====================================================================
// P9 + P11: tmavý režim, typografie (1280 i 390)
// =====================================================================
for (const [nazev, vp, mobil] of [['1280', { width: 1280, height: 900 }, false], ['390', { width: 390, height: 844 }, true]]) {
  const { ctx, p } = await kontext({ tmavy: true, viewport: vp, mobil, stav: novyStav({ stav: 'rozpracovano', krok: 'typ', odpovedi: { typ: 'caj', nazev: 'X', cile: ['sklad', 'hoste'] } }) });
  await p.goto(BASE + '/employer/start', { waitUntil: 'domcontentloaded' });
  await cekejNaH1(p, /Jaký podnik vedeš/);
  await p.waitForTimeout(600);
  const tm = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
  tvrdi(`P9 ${nazev}: tmavý režim je zapnutý`, tm === 'dark', String(tm));
  for (const [re, nazevKroku] of [[/Jaký podnik vedeš/, 'Typ'], [/Jak se jmenuje/, 'Podnik'], [/Kdy máte otevřeno/, 'Doba'], [/Kdo s tebou pracuje/, 'Tým'], [/Co chceš mít pod kontrolou/, 'Cíle']]) {
    await cekejNaH1(p, re);
    // Kontrast se měří až po dojetí vstupních animací (rozjetý průhledný text by vyšel 1 : 1);
    // nekonečný ken-burns fotky se nečeká. Na zatíženém stroji animace dojíždějí později než za 400 ms.
    await p.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 10000 });
    const k = await kontrast(p);
    tvrdi(`P9 ${nazev} ${nazevKroku}: text v tmavém režimu ≥ 4,5 : 1`, k.length === 0, k.slice(0, 6).join(' | '));
    const f = await pismo(p);
    tvrdi(`P11 ${nazev} ${nazevKroku}: písmo drží řadu 11/12/13/14/15/16/18/28`, Object.keys(f).length === 0, JSON.stringify(f));
    const foto = await p.evaluate(() => { const f = document.querySelector('.foto-ramec'); if (!f) return 0; const r = f.getBoundingClientRect(); return (r.width * r.height) / (innerWidth * innerHeight); });
    tvrdi(`P9 ${nazev} ${nazevKroku}: fotka nezaplňuje celou obrazovku`, foto < 0.6, foto.toFixed(2));
    await p.screenshot({ path: `${OUT}k73-tmavy-${nazevKroku}-${nazev}.png` });
    if (nazevKroku !== 'Cíle') { await pokracovat(p).click(); await p.waitForTimeout(400); }
  }
  await ctx.close();
}

// =====================================================================
// P10: živá ukázka — skutečná aplikace v rámu
// =====================================================================
{
  const { ctx, p, stav, chyby } = await kontext({ stav: novyStav({ stav: 'rozpracovano', krok: 'vitej' }) });
  await p.goto(BASE + '/employer/start', { waitUntil: 'domcontentloaded' });
  await cekejNaH1(p, /^Vítej/);
  const ramec = p.locator('iframe[title^="Ukázka aplikace"]');
  await ramec.waitFor({ timeout: 15000 });
  tvrdi('P10: na počítači je vlevo živá ukázka (iframe /demo)', /\/demo\?scena=prehled/.test(await ramec.getAttribute('src')));
  await p.locator('.pv-zarizeni-zaves').waitFor({ state: 'detached', timeout: 20000 });
  const fr = p.frames().find(f => /\/demo/.test(f.url()));
  await fr.waitForSelector('[data-plocha] li[data-widget]', { timeout: 20000 }).catch(() => {});
  const widgetu = fr ? await fr.locator('li[data-widget]').count() : 0;
  tvrdi('P10: v rámu běží skutečná aplikace s widgety (ne obrázek)', widgetu > 0, String(widgetu));
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}k73-ukazka-prehled-1280.png` });
  tvrdi('P10: ukázka neposílá na server nic (žádné /api/* z rámu)', stav.demoDotazy.length === 0, JSON.stringify(stav.demoDotazy.slice(0, 4)));
  // krok Cíle: zaostření mění scénu
  await dal(p, /Jaký podnik vedeš/);
  await p.locator('[data-typ="kavarna"]').click();
  await dal(p, /Jak se jmenuje/);
  await dal(p, /Kdy máte otevřeno/);
  await dal(p, /Kdo s tebou pracuje/);
  await dal(p, /Co chceš mít pod kontrolou/);
  await p.locator('[data-cil="sklad"]').hover();
  await p.waitForFunction(() => document.querySelector('[data-demo-okno]')?.getAttribute('data-scena') === 'sklad', null, { timeout: 5000 });
  await p.waitForTimeout(1500);
  const vRamci = fr ? await fr.evaluate(() => location.search).catch(() => '') : '';
  tvrdi('P10: zaostření na Sklad přepne scénu ukázky (zprávou, bez nového načtení)', /scena=sklad/.test(vRamci), vRamci);
  await p.screenshot({ path: `${OUT}k73-ukazka-sklad-1280.png` });
  await p.locator('[data-cil="uzaverky"]').hover();
  await p.waitForFunction(() => document.querySelector('[data-demo-okno]')?.getAttribute('data-scena') === 'uzaverka', null, { timeout: 5000 });
  tvrdi('P10: zaostření na Uzávěrky přepne scénu na uzaverka', true);
  tvrdi('P10: bez chyb v konzoli', chyby.length === 0, chyby.join(' | ').slice(0, 300));
  await ctx.close();
}
{
  // Telefon: ukázka se nenačítá sama, jen na požádání.
  const { ctx, p } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, stav: novyStav({ stav: 'rozpracovano', krok: 'tym', odpovedi: { typ: 'bar' } }) });
  await p.goto(BASE + '/employer/start', { waitUntil: 'domcontentloaded' });
  await cekejNaH1(p, /Kdo s tebou pracuje/);
  tvrdi('P10: na telefonu se ukázka sama nenačítá', await p.locator('iframe').count() === 0);
  await p.getByRole('button', { name: /Ukázat na živo/ }).click();
  await p.locator('iframe[title^="Ukázka aplikace"]').waitFor({ timeout: 10000 });
  await p.locator('.pv-zarizeni-zaves').waitFor({ state: 'detached', timeout: 20000 });
  await p.waitForTimeout(800);
  const o = await overflow(p);
  tvrdi('P10: ukázka na telefonu nepřeteče', o.dok <= 0 && o.telo <= 0, JSON.stringify(o));
  await p.screenshot({ path: `${OUT}k73-ukazka-tym-390.png` });
  await ctx.close();
}

// =====================================================================
// P12: návrat do průvodce z Přehledu (widget První kroky)
// =====================================================================
{
  const k68 = await import('./k68-spolecne.mjs');
  const fix = { ...k68.FIX_VEDENI, polozky: [{ id: 'prehled-prvni-kroky', widget: 'prehled.prvni_kroky', velikost: 'L' }, ...k68.FIX_VEDENI.polozky.slice(0, 3)] };
  for (const [stavOnb, ocekavano] of [['preskoceno', true], ['rozpracovano', true], ['hotovo', false], ['nedostupny', false], [null, false]]) {
    const { ctx, p, chyby } = await k68.kontext({
      fix,
      dalsi: (req, json) => (new URL(req.url()).pathname === '/api/onboarding' && req.method() === 'GET' ? json(stavOnb === null ? [] : { stav: stavOnb }) : undefined),
    });
    await k68.otevri(p, '/employer/overview');
    const li = k68.li(p, 'prehled-prvni-kroky');
    const ma = await li.getByText('Dokončit nastavení podniku').count();
    tvrdi(`P12: stav ${stavOnb} → řádek „Dokončit nastavení podniku" ${ocekavano ? 'je' : 'není'} v Prvních krocích`, (ma > 0) === ocekavano, String(ma));
    if (ocekavano) {
      await p.screenshot({ path: `${OUT}k73-prvni-kroky.png` });
      await li.getByText('Dokončit nastavení podniku').click();
      await p.waitForURL(/\/employer\/start/, { timeout: 15000 }).catch(() => {});
      tvrdi('P12: řádek vede na /employer/start', /\/employer\/start/.test(p.url()), p.url());
    }
    tvrdi(`P12: stav ${stavOnb} bez chyb v konzoli`, chyby.length === 0, chyby.join(' | ').slice(0, 200));
    await ctx.close();
  }
}

await b.close();
console.log(fails ? `\n${fails} neprošlo` : '\nvše prošlo');
process.exit(fails ? 1 : 0);
