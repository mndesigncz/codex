// Hromadné akce ve frontách ke schválení: výběr, „Vybrat vše", jeden zásah.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const OUT = new URL('./shots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

const problems = [];
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { console.log('  ✗', m); problems.push(m); };

async function open(url, w = 1280, dark = false) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, locale: 'cs-CZ', isMobile: w <= 500, hasTouch: w <= 500 });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok('employer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  if (dark) await ctx.addInitScript(() => { try { localStorage.setItem('managero-theme', 'dark'); } catch {} });
  const sent = [];
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') {
      sent.push(`${route.request().method()} ${u.replace('http://localhost:3000', '')}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    // Kolo 69 (B3): Sklad je plocha s widgety — rozložení (widgety skladu a položky jako nástroj) z fixtury balíku.
    if (new URL(u).pathname === '/api/rozlozeni' && new URL(u).searchParams.get('stranka') === 'vedeni.sklad') return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + 'k69-b3-rozlozeni-sklad.json', 'utf8') });
    // Kolo 69 (B1): Rozvrh je plocha s widgety — Žádosti o volno a Výměny směn jsou widgety (střední, s akcemi).
    if (new URL(u).pathname === '/api/rozlozeni' && new URL(u).searchParams.get('stranka') === 'vedeni.rozvrh') return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + 'k69-b1-rozlozeni-rozvrh.json', 'utf8') });
    // Kolo 69 (B7): Odměny jsou plocha s widgety — Žádosti o odměny jsou widget (střední, s „Vybrat víc").
    if (new URL(u).pathname === '/api/rozlozeni' && new URL(u).searchParams.get('stranka') === 'vedeni.odmeny') return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + 'k69-b7-rozlozeni-odmeny.json', 'utf8') });
    // …a widget Nové věci od týmu chce sklad.schvalovat: oprávnění vlastníka (fixtura teams_mine je nemá).
    if (new URL(u).pathname === '/api/teams/mine') {
      const d = JSON.parse(readFileSync(DIR + 'teams_mine.json', 'utf8'));
      d.opravneni = JSON.parse(readFileSync(DIR + 'roles.json', 'utf8')).ja.opravneni;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
    }
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto('http://localhost:3000' + url, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1600);
  return { ctx, p, errs, sent };
}

// Pilulka lišty: stín a neprůhledná plocha. Obojí se už jednou potichu
// ztratilo — utilita stínu s holou proměnnou nevygenerovala žádný box-shadow
// a `bg-[#16181A]` je v tmavém režimu 14% bílá, takže přes lištu prosvítaly
// řádky seznamu. Měří se spočítaný styl, ne třídy.
const pilulka = (p) => p.evaluate(() => {
  const reg = [...document.querySelectorAll('[role="region"]')].find(r => /^Vybráno/.test(r.getAttribute('aria-label') || ''));
  const el = reg?.querySelector('.rounded-full');
  if (!el) return null;
  const cs = getComputedStyle(el);
  const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
  const kanaly = m ? m[1].split(/[\s,/]+/).filter(Boolean).map(Number) : [];
  return { stin: cs.boxShadow, alfa: kanaly.length > 3 ? kanaly[3] : kanaly.length === 3 ? 1 : 0, plocha: cs.backgroundColor };
});

// Na Rozvrhu jsou fronty dvě (Výměny směn nad Žádostmi o volno), proto se
// „Vybrat víc" hledá podle nadpisu fronty, ne jako první na stránce — dřív
// „Žádosti o volno" potichu klikaly na výměny a hlásily 3 místo 5.
async function queue(name, url, expectPending, { shot = null, w = 1280, dark = false, sekce = null } = {}) {
  console.log(`${name}:`);
  const { ctx, p, errs, sent } = await open(url, w, dark);
  if (sekce) {
    // Kolo 69 (B1): fronty Rozvrhu jsou widgety a „Vybrat víc" je v nabídce „···" widgetu.
    const menu = p.getByRole('button', { name: `Další akce: ${sekce}` });
    if (await menu.count() === 0) { bad(`${name}: nabídka widgetu s „Vybrat víc" není (fronta prázdná?)`); await ctx.close(); return; }
    await menu.first().click();
    await p.getByRole('menuitem', { name: /Vybrat víc/ }).click();
  } else {
    const more = p.locator('button', { hasText: /^Vybrat víc$/ });
    if (await more.count() === 0) { bad(`${name}: tlačítko „Vybrat víc" není (fronta prázdná?)`); await ctx.close(); return; }
    await more.first().click();
  }
  await p.waitForTimeout(400);
  const boxes = await p.locator('[role="checkbox"]').count();
  boxes === expectPending ? ok(`zaškrtávátek: ${boxes}`) : bad(`${name}: čekáno ${expectPending} zaškrtávátek, je ${boxes}`);

  await p.locator('[role="checkbox"]').first().click();
  await p.waitForTimeout(300);
  (await p.locator('text=/^1 vybráno$/').count()) ? ok('lišta hlásí „1 vybráno"') : bad(`${name}: lišta nehlásí výběr`);
  const pil = await pilulka(p);
  if (!pil) bad(`${name}: pilulka lišty nenalezena`);
  else {
    pil.stin && pil.stin !== 'none' ? ok('lišta má stín') : bad(`${name}: lišta je bez stínu (box-shadow: ${pil.stin})`);
    pil.alfa === 1 ? ok(`lišta je neprůhledná (${pil.plocha})`) : bad(`${name}: přes lištu prosvítá obsah (${pil.plocha})`);
  }

  const all = p.locator('button', { hasText: /^Vybrat vše \(/ });
  await all.first().click();
  await p.waitForTimeout(300);
  (await p.locator(`text=/^${expectPending} vybráno$/`).count()) ? ok(`„Vybrat vše" označilo ${expectPending}`) : bad(`${name}: „Vybrat vše" neoznačilo vše`);

  if (shot) await p.screenshot({ path: `${OUT}${shot}-${w}.png` });

  const before = sent.length;
  await p.locator('.btn-accent, [class*="btn-accent"]').last().click();
  await p.waitForTimeout(1200);
  const fired = sent.length - before;
  fired === expectPending ? ok(`jeden zásah poslal ${fired} požadavků naráz`) : bad(`${name}: čekáno ${expectPending} požadavků, odešlo ${fired}`);

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 2) bad(`${name}: přetečení ${over}px`);
  if (errs.length) bad(`${name}: chyba v konzoli — ${errs[0]}`);
  await ctx.close();
}

await queue('Žádosti o volno', '/employer/overview?view=shifts', 5, { shot: 'bulk-timeoff', sekce: 'Žádosti o volno' });
await queue('Výměny směn', '/employer/overview?view=shifts', 3, { sekce: 'Výměny směn' });
await queue('Návrhy skladu', '/employer/overview?view=inventory', 3, { shot: 'bulk-inventory' });
await queue('Žádosti o odměny', '/employer/overview?view=rewards', 4, { shot: 'bulk-rewards' });
await queue('Volno na telefonu', '/employer/overview?view=shifts', 5, { shot: 'bulk-timeoff', w: 390, sekce: 'Žádosti o volno' });
await queue('Volno na telefonu, tmavý režim', '/employer/overview?view=shifts', 5, { shot: 'bulk-timeoff-tmavy', w: 390, dark: true, sekce: 'Žádosti o volno' });

console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
// Bez nenulového kódu by spouštěč sondu hlásil jako zelenou, i když tu něco selhalo.
process.exit(problems.length ? 1 : 0);
