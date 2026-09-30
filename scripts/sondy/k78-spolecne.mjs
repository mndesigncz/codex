// Kolo 78 — vícejazyčnost společných částí: průvodce prvotním nastavením, chybové stavy
// sdílených komponent (components/ui) a zapomenuté heslo.
//
// Tvrdí (němčina a angličtina; telefon 390 × 844, počítač 1280; světlý i tmavý režim):
//  • průvodce (/employer/start) v němčině: <html lang="de">, každý krok (Vítej → … → finále)
//    bez české diakritiky v textu, bez vodorovného přetečení a s tlačítky patičky, jejichž
//    text se nezkracuje (německé věty jsou delší) — na 390 px;
//  • průvodce v angličtině: nadpisy a tlačítka anglicky;
//  • tmavý režim: text prvního kroku a patička mají kontrast ≥ 4,5 : 1 a nic nezmizí;
//  • sdílený ErrorState (spadlé načtení průvodce) mluví jazykem aplikace a má tlačítko „Erneut versuchen“;
//  • /zapomenute-heslo v němčině (formální „Sie“): nadpis, popisek, tlačítko, bez přetečení;
//  • čeština zůstává beze změny (nadpis prvního kroku a tlačítko „Začít“).
//
// Stavová fixtura průvodce je stejná jako v k73-pruvodce (PUT sloučí odpovědi, GET je vrátí).
// Adresa serveru: SONDY_ZAKLAD (výchozí http://localhost:3000).
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

const TEL = { width: 390, height: 844 };
const PC = { width: 1280, height: 900 };
const CESKE_ZNAKY = /[ěščřžůďťňáíý]/;

function novyStav(pocatek = {}) {
  return { stav: 'nove', krok: null, odpovedi: {}, failGet: null, ...pocatek };
}
const VYSLEDKY = {
  polozky: [
    { klic: 'podnik', nazev: 'Nastavení podniku', stav: 'ok' },
    { klic: 'doba', nazev: 'Otevírací doba', stav: 'ok' },
    { klic: 'smeny', nazev: 'Typy směn', stav: 'ok', pocet: 2, poznamka: '2 typy směn' },
    { klic: 'sklad', nazev: 'Kategorie skladu', stav: 'preskoceno', poznamka: 'Už je nastavené.' },
    { klic: 'prehled', nazev: 'Přehled', stav: 'ok', pocet: 8, poznamka: '8 widgetů' },
  ],
  prehled: { widgetu: 2, polozky: [{ w: 'prehled.ceka_na_tebe', s: 'L' }, { w: 'rozvrh.dnesni_smeny', s: 'M' }] },
};

async function kontext({ viewport = PC, mobil = false, jazyk = 'de', tmavy = false, stav = novyStav() } = {}) {
  const ctx = await b.newContext({ viewport, locale: jazyk === 'cs' ? 'cs-CZ' : jazyk === 'de' ? 'de-DE' : 'en-GB', isMobile: mobil, hasTouch: mobil });
  const host = new URL(BASE).hostname;
  await ctx.addCookies([
    { name: 'next-auth.session-token', value: tok, domain: host, path: '/', httpOnly: true, sameSite: 'Lax' },
    { name: 'managero-lang', value: jazyk, domain: host, path: '/', sameSite: 'Lax' },
  ]);
  await ctx.addInitScript(([t]) => { try { if (t) localStorage.setItem('managero-theme', 'dark'); else localStorage.removeItem('managero-theme'); } catch { /* soukromé okno */ } }, [tmavy]);
  await ctx.route('**/api/**', async route => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method(); const path = u.pathname;
    if (path.startsWith('/api/auth/')) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/onboarding') {
      if (m === 'GET') {
        if (stav.failGet) return json({ error: 'Server spadl' }, stav.failGet);
        return json({
          stav: stav.stav, krok: stav.krok, odpovedi: stav.odpovedi, pouzito: {},
          podnik: { name: 'Kavárna Test', currency: 'CZK', locale: 'cs-CZ', week_start: 1, business_type: null, opening_hours: null, address: null, country: null },
          plan: { effective: 'free' }, kod: 'K7X2QM', pocty: { clenu: 1, pozvanek: 0 },
        });
      }
      if (m === 'PUT') {
        const t = JSON.parse(req.postData() || '{}');
        stav.odpovedi = { ...stav.odpovedi, ...(t.odpovedi ?? {}) };
        if (t.krok) stav.krok = t.krok;
        if (t.stav) stav.stav = t.stav;
        return json({ ok: true, upraveno: new Date().toISOString(), stav: stav.stav });
      }
    }
    if (path === '/api/onboarding/pouzit' && m === 'POST') { stav.stav = 'hotovo'; return json(VYSLEDKY); }
    if (m !== 'GET') return json({ ok: true });
    return json([]);
  });
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', e => chyby.push(String(e)));
  return { ctx, p, stav, chyby };
}

const overflow = p => p.evaluate(() => ({ dok: document.documentElement.scrollWidth - innerWidth, telo: document.body.scrollWidth - innerWidth }));
// Text průvodce po uzlech oddělený mezerou (bez výběrů a rámů): obsah podniku a české značky ze serveru se povolí níž.
const textPruvodce = p => p.evaluate(() => {
  const c = document.querySelector('[data-pruvodce]')?.cloneNode(true);
  if (!c) return '';
  c.querySelectorAll('select, iframe, script, style, .pv-mini').forEach(e => e.remove()); // .pv-mini: názvy widgetů z katalogu (jiný celek)
  const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
  const out = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = (n.textContent ?? '').trim(); if (t) out.push(t); }
  return out.join(' \n ');
});
// Česká slova v textu, která nejsou obsah podniku (název z registrace, předvolby směn a kategorií skladu) ani měna.
const POVOLENA = /^(Kč|Kavárna|Otevírací|Zavírací|Káva|Mléko|alternativy|Sirupy|přísady|Pečivo|dezerty|Nádobí|Úklid|drogerie)$/;
const ceskaSlova = t => (t.match(/[\p{L}]+/gu) ?? []).filter(s => CESKE_ZNAKY.test(s) && !POVOLENA.test(s));
const orezana = p => p.evaluate(() => [...document.querySelectorAll('.pv-paticka button, [data-pruvodce] h1, [role=radio] .t-card, [role=tab]')].filter(el => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible';
}).map(el => (el.textContent ?? '').trim().slice(0, 30)));
const cekejNaH1 = async (p, re) => { await p.locator('h1').filter({ hasText: re }).first().waitFor({ timeout: 15000 }); await p.waitForTimeout(250); };
const kontrast = p => p.evaluate(() => {
  const parse = c => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const x = m[1].split(',').map(parseFloat); return { r: x[0], g: x[1], b: x[2], a: x.length > 3 ? x[3] : 1 }; };
  const over = (f, bg) => ({ r: f.r * f.a + bg.r * (1 - f.a), g: f.g * f.a + bg.g * (1 - f.a), b: f.b * f.a + bg.b * (1 - f.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const pomer = (a, bb) => { const [h, l] = [lum(a), lum(bb)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
  const pod = el => { let acc = null; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (!c || c.a === 0) continue; acc = acc ? over(acc, c) : c; if (acc.a >= 0.999) return acc; } return acc ?? parse(getComputedStyle(document.body).backgroundColor); };
  const spatne = [];
  for (const el of document.querySelectorAll('[data-pruvodce] *')) {
    if (el.children.length) continue;
    const t = (el.textContent ?? '').trim();
    if (t.length < 2) continue;
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

// ============================================================ průvodce německy na telefonu, celý průchod
{
  const { ctx, p, chyby } = await kontext({ viewport: TEL, mobil: true, jazyk: 'de' });
  await p.goto(BASE + '/employer/start', { waitUntil: 'networkidle' });
  await cekejNaH1(p, /^Willkommen/);
  tvrdi('DE průvodce: <html lang="de">', await p.evaluate(() => document.documentElement.lang) === 'de');

  const kroky = [
    { popis: 'Vítej', h1: /^Willkommen/, dal: /^Loslegen/ },
    { popis: 'Typ', h1: /Was für einen Betrieb/, pred: async () => { await p.locator('[data-typ="kavarna"]').click(); }, dal: /^Weiter/ },
    { popis: 'Podnik', h1: /Wie heißt er und wo steht er/, dal: /^Weiter/ },
    { popis: 'Doba', h1: /Wann habt ihr geöffnet/, dal: /^Weiter/ },
    { popis: 'Tým', h1: /Wer arbeitet mit dir/, dal: /^Weiter/ },
    { popis: 'Cíle', h1: /Was willst du im Griff haben/, dal: /^Weiter/ },
    { popis: 'Kasa', h1: /Wie macht ihr den Kassenabschluss/, dal: /^Weiter/ },
    { popis: 'Shrnutí', h1: /Das richten wir für dich ein/, dal: /^Betrieb einrichten/ },
  ];
  for (const k of kroky) {
    await cekejNaH1(p, k.h1);
    const t = await textPruvodce(p);
    const cesky = ceskaSlova(t);
    tvrdi(`DE průvodce ${k.popis}: v textu nejsou česká slova`, cesky.length === 0, JSON.stringify(cesky.slice(0, 6)));
    const o = await overflow(p);
    tvrdi(`DE průvodce ${k.popis}: na 390 px nic nepřetéká`, o.dok <= 0 && o.telo <= 0, JSON.stringify(o));
    const oz = await orezana(p);
    tvrdi(`DE průvodce ${k.popis}: texty tlačítek a nadpisu nejsou oříznuté`, oz.length === 0, JSON.stringify(oz));
    if (k.pred) await k.pred();
    await p.getByRole('button', { name: k.dal }).click();
  }
  await p.locator('h1').filter({ hasText: /Dein Betrieb ist bereit/ }).first().waitFor({ timeout: 20000 });
  await p.getByRole('button', { name: /Übersicht öffnen/ }).waitFor({ timeout: 20000 });
  const fin = await textPruvodce(p);
  const finCesky = ceskaSlova(fin);
  tvrdi('DE průvodce finále: výsledky sestavení jsou přeložené (Schichttypen, Kategorien)', /Schichttypen/.test(fin) && /Öffnungszeiten/.test(fin), fin.slice(0, 200));
  tvrdi('DE průvodce finále: bez českých slov (názvy widgetů z katalogu se v průvodci nepřekládají)', finCesky.length === 0, JSON.stringify(finCesky.slice(0, 6)));
  const o = await overflow(p);
  tvrdi('DE průvodce finále: nic nepřetéká', o.dok <= 0 && o.telo <= 0, JSON.stringify(o));
  await p.screenshot({ path: OUT + 'k78-de-finale.png' });
  tvrdi('DE průvodce: bez chyb stránky', chyby.length === 0, chyby.join(' | '));
  await ctx.close();
}

// ============================================================ průvodce anglicky na počítači
{
  const { ctx, p, chyby } = await kontext({ viewport: PC, jazyk: 'en' });
  await p.goto(BASE + '/employer/start', { waitUntil: 'networkidle' });
  await cekejNaH1(p, /^Welcome/);
  tvrdi('EN průvodce: tlačítko „Start“ a odkaz „Finish later“', await p.getByRole('button', { name: /^Start/ }).count() === 1 && await p.getByRole('button', { name: /Finish later/ }).count() === 1);
  tvrdi('EN průvodce: čítač kroků „Step 1 of“', /^Step 1 of \d+$/.test((await p.locator('[data-krok-x-z-y]').textContent()).trim()));
  const t = await textPruvodce(p);
  tvrdi('EN průvodce: první krok bez českých slov', ceskaSlova(t).length === 0, JSON.stringify(ceskaSlova(t).slice(0, 6)));
  await p.getByRole('button', { name: /^Start/ }).click();
  await cekejNaH1(p, /What kind of business/);
  tvrdi('EN průvodce: dlaždice typů anglicky (Café, Bakery)', await p.getByRole('radio', { name: /Café/ }).count() === 1 && await p.getByRole('radio', { name: /Bakery/ }).count() === 1);
  tvrdi('EN průvodce: bez chyb stránky', chyby.length === 0, chyby.join(' | '));
  await ctx.close();
}

// ============================================================ čeština beze změny
{
  const { ctx, p } = await kontext({ viewport: PC, jazyk: 'cs' });
  await p.goto(BASE + '/employer/start', { waitUntil: 'networkidle' });
  await cekejNaH1(p, /^Vítej/);
  tvrdi('CS průvodce: nadpis „Vítej“ a tlačítko „Začít“ beze změny', await p.getByRole('button', { name: /^Začít/ }).count() === 1 && (await p.locator('[data-krok-x-z-y]').textContent()).trim().startsWith('Krok 1 z'));
  await ctx.close();
}

// ============================================================ tmavý režim, němčina
{
  const { ctx, p } = await kontext({ viewport: TEL, mobil: true, jazyk: 'de', tmavy: true });
  await p.goto(BASE + '/employer/start', { waitUntil: 'networkidle' });
  await cekejNaH1(p, /^Willkommen/);
  await p.waitForTimeout(600);
  const k = await kontrast(p);
  tvrdi('DE tmavý režim: text prvního kroku a patička mají kontrast ≥ 4,5 : 1', k.length === 0, JSON.stringify(k.slice(0, 4)));
  tvrdi('DE tmavý režim: tlačítko „Loslegen“ je vidět', await p.getByRole('button', { name: /^Loslegen/ }).isVisible());
  await p.screenshot({ path: OUT + 'k78-de-tmavy.png' });
  await ctx.close();
}

// ============================================================ sdílený ErrorState, němčina
{
  const { ctx, p } = await kontext({ viewport: TEL, mobil: true, jazyk: 'de', stav: novyStav({ failGet: 500 }) });
  await p.goto(BASE + '/employer/start', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Erneut versuchen/ }).waitFor({ timeout: 15000 });
  const t = await textPruvodce(p);
  tvrdi('DE chybový stav načtení: hláška a tlačítka německy', /Einrichtungsassistent|Server spadl/.test(t) && await p.getByRole('button', { name: /Zur App/ }).count() === 1, t.slice(0, 160));
  const o = await overflow(p);
  tvrdi('DE chybový stav: nic nepřetéká', o.dok <= 0 && o.telo <= 0, JSON.stringify(o));
  await ctx.close();
}

// ============================================================ zapomenuté heslo (vykání), němčina
{
  const ctx = await b.newContext({ viewport: TEL, locale: 'de-DE', isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: 'managero-lang', value: 'de', domain: new URL(BASE).hostname, path: '/', sameSite: 'Lax' }]);
  const p = await ctx.newPage();
  await p.goto(BASE + '/zapomenute-heslo', { waitUntil: 'networkidle' });
  await p.locator('h1').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(500);
  tvrdi('DE zapomenuté heslo: nadpis „Passwort vergessen“', (await p.locator('h1').first().innerText()).trim() === 'Passwort vergessen', await p.locator('h1').first().innerText());
  const t = await p.locator('main').innerText();
  tvrdi('DE zapomenuté heslo: formální Sie, tlačítko, odkaz zpět', /Geben Sie/.test(t) && /Link senden/.test(t) && /Zurück zur Anmeldung/.test(t), t.slice(0, 200));
  tvrdi('DE zapomenuté heslo: bez české diakritiky', !CESKE_ZNAKY.test(t), t);
  const o = await overflow(p);
  tvrdi('DE zapomenuté heslo: nic nepřetéká na 390 px', o.dok <= 0 && o.telo <= 0, JSON.stringify(o));
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} tvrzení selhalo` : '\nVše prošlo');
process.exit(fails ? 1 : 0);
