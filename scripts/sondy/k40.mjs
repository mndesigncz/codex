// Sonda na třídu vad z kola 40: „na telefonu prvek končí v půlce".
//
// Pět nálezů, každý z jednoho skutečného snímku, který poslal uživatel:
//  A VISÍ VPRAVO  — akce sama na řádku, přisátá k pravému okraji („Oznámit
//                   týmu" v detailu akce). Na telefonu má hlavní akce jít
//                   přes celou šířku, tichá k levému okraji.
//  B KONČÍ V PŮLCE — prvek sám na řádku široký 55–92 % obsahové šířky rodiče
//                   („Zapnout menu pro hosty", pole „Sleva %").
//  C MRTVÝ PROSTOR — karta, jejíž obsah zabírá méně než 70 % její výšky.
//  D OSIŘELÁ BUŇKA — mřížka, kde počet dětí není násobkem počtu sloupců
//                   („Nové menu" samotné na řádku pod dvěma kartami).
//  E DVOJÍ NADPIS  — dva nadpisy se stejným textem na jedné obrazovce
//                   (vnořený MenuEditor vykresloval druhé „Menu").
//
// Proti rodičovské OBSAHOVÉ šířce, ne proti jeho obdélníku: padding rodiče
// není mezera a počítat ho jako mezeru dalo minule dvacet falešných nálezů.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();

const SCREENS = JSON.parse(readFileSync(new URL('./' + (process.env.SCREENS ?? 'screens.json'), import.meta.url).pathname, 'utf8'));
const WIDTHS = (process.env.WIDTHS ?? '390').split(',').map(Number);
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const soucet = { A: 0, B: 0, C: 0, D: 0, E: 0 };
const detail = [];

for (const w of WIDTHS) {
  for (const [name, role, path] of SCREENS) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, locale: 'cs-CZ', isMobile: w <= 500, hasTouch: w <= 500, deviceScaleFactor: 1 });
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
      await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); });
      await p.waitForTimeout(500);
      const n = await p.evaluate(() => {
        const out = { A: [], B: [], C: [], D: [], E: [] };
        const vid = el => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
        const txt = el => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        const obsah = rodic => { const s = getComputedStyle(rodic); const x = rodic.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); return x > 0 ? x : rodic.getBoundingClientRect().width; };
        const samNaRadku = (el, rodic) => ![...rodic.children].filter(s => s !== el && vid(s))
          .some(s => { const a = el.getBoundingClientRect(), c = s.getBoundingClientRect(); return c.top < a.bottom - 4 && c.bottom > a.top + 4; });
        const koren = document.querySelector('main') || document.body;

        // A + B
        for (const el of koren.querySelectorAll('button, a[href], input, select, textarea, .card, .well, [class*="rounded-3xl"]')) {
          if (!vid(el) || el.closest('[aria-hidden="true"]')) continue;
          const rodic = el.parentElement; if (!rodic || !vid(rodic)) continue;
          if (el.closest('[class*="overflow-x-auto"], [class*="overflow-x-scroll"]')) continue;
          if (!samNaRadku(el, rodic)) continue;
          const r = el.getBoundingClientRect(), rr = rodic.getBoundingClientRect(), sirka = obsah(rodic);
          const levyOdstup = r.left - (rr.left + parseFloat(getComputedStyle(rodic).paddingLeft));
          const podil = r.width / sirka;
          if (podil < 0.92 && levyOdstup > sirka * 0.35) out.A.push({ el: txt(el) || el.tagName, sirka: Math.round(r.width), odstupVlevo: Math.round(levyOdstup) });
          else if (podil > 0.55 && podil < 0.92) out.B.push({ el: txt(el) || el.tagName, podil: +podil.toFixed(2), sirka: Math.round(r.width), rodic: Math.round(sirka) });
        }
        // C
        for (const el of koren.querySelectorAll('.card, .well, [class*="rounded-3xl"], [class*="rounded-[2rem]"]')) {
          if (!vid(el)) continue;
          const r = el.getBoundingClientRect(); if (r.height < 140) continue;
          const deti = [...el.querySelectorAll('*')].filter(vid); if (!deti.length) continue;
          const top = Math.min(...deti.map(k => k.getBoundingClientRect().top));
          const bot = Math.max(...deti.map(k => k.getBoundingClientRect().bottom));
          const podil = (bot - top) / r.height;
          if (podil < 0.7) out.C.push({ el: txt(el), obsah: Math.round(bot - top), karta: Math.round(r.height), podil: +podil.toFixed(2) });
        }
        // D
        for (const g of koren.querySelectorAll('[class*="grid-cols"]')) {
          if (!vid(g)) continue;
          const cols = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length;
          const deti = [...g.children].filter(vid);
          if (cols >= 2 && deti.length > cols && deti.length % cols !== 0) out.D.push({ mrizka: txt(g), sloupce: cols, polozek: deti.length });
        }
        // E
        const nadpisy = [...koren.querySelectorAll('h1, h2')].filter(vid).map(h => h.textContent.trim()).filter(Boolean);
        const pocty = {};
        for (const t of nadpisy) pocty[t] = (pocty[t] ?? 0) + 1;
        for (const [t, c] of Object.entries(pocty)) if (c > 1) out.E.push({ nadpis: t, kolikrat: c });
        return out;
      });
      const celkem = n.A.length + n.B.length + n.C.length + n.D.length + n.E.length;
      for (const k of ['A','B','C','D','E']) soucet[k] += n[k].length;
      if (celkem) detail.push({ name, w, n });
      console.log(`${celkem ? '⚠' : '✓'} ${name} ${w}  A:${n.A.length} B:${n.B.length} C:${n.C.length} D:${n.D.length} E:${n.E.length}`);
    } catch (e) { console.log('✗', name, w, String(e).slice(0, 80)); }
    await ctx.close();
  }
}
console.log(`\nSOUČET  vpravo:${soucet.A}  v půlce:${soucet.B}  mrtvý prostor:${soucet.C}  osiřelé:${soucet.D}  dvojí nadpis:${soucet.E}`);
for (const d of detail) {
  console.log(`\n### ${d.name} @${d.w}`);
  for (const k of ['A','B','C','D','E']) for (const x of d.n[k].slice(0, 4)) console.log(`  ${k} ${JSON.stringify(x)}`);
}
await b.close();
