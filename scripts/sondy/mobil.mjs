// Hledá na 390 px tři tvary vady ze screenshotů:
//   A) text zkolabovaný na nulu (pevné sloupce vytlačily flex-1 název)
//   B) akce sama na řádku držící se pravého kraje (nelícuje s ničím)
//   C) pole nebo tlačítko končící v třetině řádku, kde vpravo nic není
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const files = (process.env.SCREENS ?? 'screens.json,screens-client.json').split(',');
const SCREENS = files.flatMap(f => JSON.parse(readFileSync(new URL('./' + f, import.meta.url).pathname, 'utf8')));
let nA = 0, nB = 0, nC = 0;
for (const [name, role, path] of SCREENS) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  if (role) await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  try {
    await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 });
    await p.waitForTimeout(900);
    const nalezy = await p.evaluate(() => {
      const out = { A: [], B: [], C: [] };
      const vid = el => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.05; };
      const popis = el => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44);
      const znacka = el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '');
      // A) text zkolabovaný na nulu
      for (const el of document.querySelectorAll('p,span,div,h1,h2,h3')) {
        if (!vid(el) || el.children.length) continue;
        const t = (el.textContent || '').trim(); if (t.length < 3) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 6 && r.height > 0) out.A.push({ t: t.slice(0, 40), z: znacka(el.parentElement || el) });
      }
      // B + C) prvek sám na svém řádku uvnitř rodiče
      const zajem = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"]')];
      for (const el of zajem) {
        if (!vid(el)) continue;
        const rod = el.parentElement; if (!rod) continue;
        const rr = rod.getBoundingClientRect(); if (rr.width < 160) continue;
        const cs = getComputedStyle(rod);
        const vnitrniL = rr.left + parseFloat(cs.paddingLeft || 0);
        const vnitrniR = rr.right - parseFloat(cs.paddingRight || 0);
        const sirka = vnitrniR - vnitrniL; if (sirka < 160) continue;
        const r = el.getBoundingClientRect(); if (r.width < 24 || r.height < 12) continue;
        // sourozenci na stejném vodorovném pásu
        const sam = [...rod.children].every(s => {
          if (s === el || !vid(s)) return true;
          const q = s.getBoundingClientRect(); if (q.width < 2 || q.height < 2) return true;
          return q.bottom <= r.top + 3 || q.top >= r.bottom - 3;
        });
        if (!sam) continue;
        const mezeraVpravo = vnitrniR - r.right;
        const mezeraVlevo = r.left - vnitrniL;
        const podil = r.width / sirka;
        if (podil > 0.85) continue; // sedí na obou krajích, v pořádku
        if (mezeraVpravo <= 6 && mezeraVlevo > sirka * 0.22) out.B.push({ t: popis(el), z: znacka(el), w: Math.round(r.width), s: Math.round(sirka) });
        else if (mezeraVpravo > sirka * 0.3 && mezeraVlevo <= 6) out.C.push({ t: popis(el), z: znacka(el), w: Math.round(r.width), s: Math.round(sirka) });
      }
      return out;
    });
    const zprav = (k, arr) => arr.slice(0, 4).map(x => `      ${k} „${x.t}" ${x.z}${x.w ? ` ${x.w}/${x.s}px` : ''}`).join('\n');
    if (nalezy.A.length || nalezy.B.length || nalezy.C.length) {
      console.log(`${name} ${path}\n   A=${nalezy.A.length} B=${nalezy.B.length} C=${nalezy.C.length}`);
      if (nalezy.A.length) console.log(zprav('A', nalezy.A));
      if (nalezy.B.length) console.log(zprav('B', nalezy.B));
      if (nalezy.C.length) console.log(zprav('C', nalezy.C));
    }
    nA += nalezy.A.length; nB += nalezy.B.length; nC += nalezy.C.length;
  } catch (e) { console.log(`${name} — CHYBA ${String(e).slice(0, 80)}`); }
  await ctx.close();
}
console.log(`\nCELKEM  A(zkolabovaný text)=${nA}  B(sama vpravo)=${nB}  C(končí v třetině)=${nC}`);
await b.close();
