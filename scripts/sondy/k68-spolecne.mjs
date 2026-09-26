// Společné pro sondy kola 68 (plocha s widgety, spec §7.2).
//
// Není to sonda (spust.mjs ho má v MIMO): kontext prohlížeče s podvrženým
// API, stavový podvrh /api/rozlozeni a pomocná gesta. Každá sonda k68-*
// si z něj bere totéž, aby se podvrh rozložení nechoval v každé jinak —
// sondy tvrdí, co pošle UI, a to jde tvrdit jen proti jednomu serveru.
//
// Podvrh rozložení: GET vrátí naposledy uložené (nebo fixturu), PUT si tělo
// zapíše do `stav.puty`, uloží ho a odpoví novou verzí — jako skutečná routa
// (spec §1.6). Sonda může podvrh přepsat vlastní obsluhou (`dalsi`), třeba
// kvůli 409 nebo zámku.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

export const BASE = 'http://localhost:3000';
export const DIR = new URL('./fixtury/', import.meta.url).pathname;
export const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
export const fixtura = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));

const tokeny = {};
export const tokenPro = (role) => (tokeny[role] ??= execSync(
  `NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? 'design-round-secret-0123456789ab'} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${role}`,
  { encoding: 'utf8' }).trim());

export const ROLE = fixtura('roles');
export const sysRole = k => ROLE.system.find(r => r.klic === k);
/** Odpověď /api/teams/mine s danými oprávněními a rolí. */
export const mine = (opravneni, role) => ({ ...fixtura('teams_mine'), role, opravneni });
export const VLASTNIK = mine(ROLE.ja.opravneni, { klic: 'vedeni', roleId: null, nazev: 'Vlastník', typ: 'vedeni', jeVlastnik: true });
export const roleMine = (klic, bez = []) => {
  const r = sysRole(klic);
  return mine(r.opravneni.filter(k => !bez.includes(k)), { klic, roleId: null, nazev: r.nazev, typ: r.typ, jeVlastnik: false });
};

export const FIX_VEDENI = fixtura('k68-rozlozeni-vedeni');
export const FIX_DOMU = fixtura('k68-rozlozeni-domu');

let prohlizec = null;
export async function browser() {
  prohlizec ??= await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
  return prohlizec;
}

let fails = 0;
export const tvrdi = (popis, ok, co = '') => { console.log(`${ok ? '✓' : '✗'} ${popis}${ok ? '' : '  ← ' + co}`); if (!ok) fails++; };
/** Zavře prohlížeč a ukončí proces s kódem podle výsledku. */
export async function konec() {
  await prohlizec?.close();
  console.log(fails ? `\n${fails} neprošlo` : '\nvše prošlo');
  process.exit(fails ? 1 : 0);
}

/**
 * Kontext s podvrženým API.
 * - `fix`: odpověď GET /api/rozlozeni (stavová — PUT ji přepíše)
 * - `mineData`, `mineZpozdeni`: /api/teams/mine
 * - `dalsi(req, json, stav)`: vlastní obsluha; vrátí-li něco jiného než undefined, požadavek je vyřízený
 * - `mobil`, `reduced`, `tmavy`: telefon s dotykem, omezený pohyb, tmavý režim
 */
export async function kontext({ viewport = { width: 1280, height: 950 }, role = 'employer', mineData = VLASTNIK, mineZpozdeni = 0,
  fix = FIX_VEDENI, mobil = false, reduced = false, tmavy = false, dalsi = null } = {}) {
  const b = await browser();
  const ctx = await b.newContext({ viewport, locale: 'cs-CZ', isMobile: mobil, hasTouch: mobil, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(([t]) => {
    try {
      localStorage.setItem('managero-app-mode', 'full');
      // Rada „Plochu si můžeš poskládat" je jednorázová; v sondách by jen posouvala mřížku.
      localStorage.setItem('managero-hint-plocha-upravy', '1');
      if (t) localStorage.setItem('managero-theme', 'dark');
    } catch { /* soukromé okno */ }
  }, [tmavy]);
  const stav = {
    ulozeno: null, verze: fix?.verze ?? 0, puty: [], deletes: 0, vychoziPuty: [], vychoziDelete: 0,
    dotazy: [], mineDoruceno: null, chyby: {},
  };
  await ctx.route('**/api/**', async route => {
    const req = route.request(); const u = req.url(); const m = req.method(); const path = new URL(u).pathname;
    stav.dotazy.push({ m, u, path, t: Date.now() });
    if (u.includes('/api/auth/')) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (dalsi) { const r = dalsi(req, json, stav); if (r !== undefined) { await r; return; } }
    if (path === '/api/teams/mine') {
      if (mineZpozdeni) await new Promise(r => setTimeout(r, mineZpozdeni));
      stav.mineDoruceno = Date.now();
      return json(mineData);
    }
    if (path === '/api/rozlozeni/vychozi') {
      const q = new URL(u).searchParams;
      if (m === 'PUT') {
        const t = JSON.parse(req.postData() || '{}');
        stav.vychoziPuty.push({ rozsah: q.get('rozsah'), stranka: q.get('stranka'), ...t });
        return json({ ok: true, polozky: t.polozky, zamceno: t.zamceno === true, verze: (t.verze || 0) + 1 });
      }
      if (m === 'DELETE') { stav.vychoziDelete++; return json({ ok: true, ...fixtura(q.get('stranka') === 'zamestnanec.domu' ? 'k68-vychozi-domu' : 'k68-vychozi-vedeni'), rozsah: q.get('rozsah') }); }
      const f = fixtura(q.get('stranka') === 'zamestnanec.domu' ? 'k68-vychozi-domu' : 'k68-vychozi-vedeni');
      return json({ ...f, rozsah: q.get('rozsah') ?? f.rozsah });
    }
    if (path === '/api/rozlozeni') {
      if (m === 'PUT') {
        const t = JSON.parse(req.postData() || '{}');
        stav.puty.push(t);
        stav.ulozeno = { ...(stav.ulozeno ?? fix), polozky: t.polozky, verze: ++stav.verze, zdroj: 'osobni' };
        return json({ ok: true, polozky: t.polozky, verze: stav.verze });
      }
      if (m === 'DELETE') { stav.deletes++; stav.ulozeno = { ...fix, zdroj: 'podnik', verze: 0 }; return json({ ok: true, ...stav.ulozeno }); }
      return json(stav.ulozeno ?? fix);
    }
    if (path === '/api/pos/summary') return json(fixtura('k68-pos-summary'));
    // Rozvrh ve tvaru skutečné routy ({ shifts, gaps… }); obecná fixtura schedule.json je holé pole
    // ze starší verze API a widget Dnešní směny by na ní správně ukázal chybu tvaru.
    if (path === '/api/schedule' && m === 'GET') {
      const dnes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
      return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + 'k68-schedule.json', 'utf8').replaceAll('"DNES"', `"${dnes}"`) });
    }
    if (stav.chyby[path]) return json({ error: 'Server spadl' }, stav.chyby[path]);
    if (m !== 'GET') return json({ ok: true });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return json([]);
  });
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', e => chyby.push(String(e)));
  p.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) chyby.push(msg.text()); });
  return { ctx, p, stav, chyby };
}

/** Otevře stránku a počká, až plocha dostane rozložení (li s daty) a oblasti widgetů. */
export async function otevri(p, cesta, stranka = 'vedeni.prehled') {
  await p.goto(BASE + cesta, { waitUntil: 'networkidle' });
  await p.locator(`[data-plocha="${stranka}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(900);
}

export const plocha = (p) => p.locator('[data-plocha]').first();
export const vUpravach = (p) => p.evaluate(() => document.querySelector('[data-plocha]')?.hasAttribute('data-upravy') ?? false);
export const poradi = (p) => p.$$eval('[data-plocha] li[data-widget]', els => els.map(e => e.getAttribute('data-instance')));
export const li = (p, id) => p.locator(`[data-plocha] li[data-instance="${id}"]`);
export const hlaseni = (p) => p.locator('[data-plocha-hlaseni]').innerText();
export const lista = (p) => p.getByRole('region', { name: 'Úpravy stránky' });
export const hotovo = (p) => lista(p).getByRole('button', { name: 'Hotovo' });
export const upravit = (p) => p.locator('[data-plocha]').getByRole('button', { name: 'Upravit', exact: true });
export const poradiPutu = (put) => (put?.polozky ?? []).map(x => x.id);

/** Střed prvku (souřadnice okna). */
export async function stred(loc) { const r = await loc.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, r }; }

/** Počká, až se `podminka()` splní (nebo vyprší čas); vrátí poslední hodnotu. */
export async function dokud(podminka, ms = 3000, krok = 50) {
  const konecCasu = Date.now() + ms;
  let v = await podminka();
  while (!v && Date.now() < konecCasu) { await new Promise(r => setTimeout(r, krok)); v = await podminka(); }
  return v;
}

export async function podrzMysi(p, x, y, ms = 650) { await p.mouse.move(x, y); await p.mouse.down(); await p.waitForTimeout(ms); await p.mouse.up(); }
export async function tahniMysi(p, z, na) {
  await p.mouse.move(z.x, z.y); await p.mouse.down();
  for (let i = 1; i <= 12; i++) { await p.mouse.move(z.x + (na.x - z.x) * i / 12, z.y + (na.y - z.y) * i / 12); await p.waitForTimeout(30); }
  await p.waitForTimeout(150); await p.mouse.up();
}

/** CDP relace pro skutečné dotykové události (Input.dispatchTouchEvent). */
export const dotyk = (p) => p.context().newCDPSession(p);
export async function podrzPrstem(cdp, p, x, y, ms = 650) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await p.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // Plocha spolkne click, který přijde do 60 ms po puštění (ochrana tlačítka pod
  // prstem). Člověk tak rychle na položku menu neklepne; sonda počká taky.
  if (ms >= 500) await p.waitForTimeout(200);
}
export async function klepniPrstem(cdp, p, x, y) { await podrzPrstem(cdp, p, x, y, 60); }
export async function tahniPrstem(cdp, p, z, na, drz = 250, kroky = 12, pauza = 30) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: z.x, y: z.y }] });
  await p.waitForTimeout(drz);
  for (let i = 1; i <= kroky; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: z.x + (na.x - z.x) * i / kroky, y: z.y + (na.y - z.y) * i / kroky }] });
    await p.waitForTimeout(pauza);
  }
  await p.waitForTimeout(drz ? 150 : 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * Prázdné místo plochy pro prst: pruh `pb-24` pod mřížkou. Mezera mezi widgety
 * (12 px) na dotyku prázdná není — Chromium i telefony „přitáhnou" dotyk
 * k nejbližšímu tlačítku (touch adjustment), takže by trefil widget vedle.
 * Posune posouvající předka (na telefonu <main>), ať je pruh vidět.
 */
export async function mistoPodPlochou(p) {
  return p.evaluate(() => {
    const ul = document.querySelector('[data-plocha] ul.plocha-mrizka');
    let n = ul?.parentElement;
    while (n && !(n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY))) n = n.parentElement;
    const r0 = ul.getBoundingClientRect();
    if (n) n.scrollTop += r0.bottom - innerHeight / 2; else window.scrollBy(0, r0.bottom - innerHeight / 2);
    const r = ul.getBoundingClientRect();
    return { x: r.left + 40, y: r.bottom + 36 };
  });
}

/** Požadavky, jejichž cesta začíná některou z předpon. */
export const dotazyNa = (stav, predpony, od = 0) => stav.dotazy.filter(d => d.t >= od && predpony.some(x => d.path.startsWith(x)));
