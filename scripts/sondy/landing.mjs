// Měří, kde se prodejní stránka rozpadá. Tři nálezy, každý s jiným významem:
//  A) přetéká vodorovně — prvek je širší než okno nebo z něj kouká ven
//  B) končí v půlce — karta/tlačítko, které má být přes celou šířku, ale
//     jeho pravá hrana leží mezi 55 % a 92 % obsahové šířky
//  C) překrytý text — absolutně posazený prvek leží přes text pod sebou
import { chromium } from 'playwright-core';

const SIRKY = [360, 390, 414, 768, 834, 1024, 1280, 1440];
const URL = process.env.URL || 'http://localhost:3000/';

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let celkem = { A: 0, B: 0, C: 0 };

for (const w of SIRKY) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  // scroll celou stránkou, ať se spustí Reveal a lazy věci
  await p.evaluate(async () => {
    const krok = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += krok) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(400);

  const nalezy = await p.evaluate((vw) => {
    const out = { A: [], B: [], C: [] };
    const popis = (el) => {
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 42);
      return `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).slice(0, 3).join('.')}${t ? ` „${t}"` : ''}`;
    };
    const viditelny = (el) => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };

    // A) přetečení
    for (const el of document.querySelectorAll('body *')) {
      if (!viditelny(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        // aria-hidden dekorace (blob) přetékat smí — je to záměr
        if (el.closest('[aria-hidden="true"]')) continue;
        const s = getComputedStyle(el);
        // vodorovně rolovatelný pás smí mít široké dítě
        let rodic = el.parentElement, uvnitrPasu = false;
        while (rodic && rodic !== document.body) {
          const ps = getComputedStyle(rodic);
          if (ps.overflowX === 'auto' || ps.overflowX === 'scroll') { uvnitrPasu = true; break; }
          rodic = rodic.parentElement;
        }
        if (uvnitrPasu) continue;
        if (s.position === 'fixed') continue;
        out.A.push({ el: popis(el), left: Math.round(r.left), right: Math.round(r.right) });
      }
    }

    // B) končí v půlce — jen u prvků, které jsou samy na řádku (blok/grid item
    //    bez sourozence vedle sebe). Tlačítko vedle tlačítka končit v půlce smí.
    const obsah = document.querySelector('section') ;
    const gutter = vw < 640 ? 20 : 32;
    const plna = vw - gutter * 2;
    for (const el of document.querySelectorAll('section a[class*="btn"], section .lgx, section .lgx-strong, section details, section img')) {
      if (!viditelny(el)) continue;
      const r = el.getBoundingClientRect();
      const rodic = el.parentElement;
      if (!rodic) continue;
      const rr = rodic.getBoundingClientRect();
      const sourozenciVedle = [...rodic.children].filter(s => s !== el && viditelny(s))
        .some(s => { const sr = s.getBoundingClientRect(); return sr.top < r.bottom - 4 && sr.bottom > r.top + 4; });
      if (sourozenciVedle) continue;
      const podil = r.width / Math.max(1, rr.width);
      if (podil > 0.55 && podil < 0.93) out.B.push({ el: popis(el), sirka: Math.round(r.width), rodic: Math.round(rr.width), podil: +podil.toFixed(2) });
    }

    // C) absolutní prvek přes text
    for (const el of document.querySelectorAll('section [class*="absolute"]')) {
      if (!viditelny(el)) continue;
      if (el.getAttribute('aria-hidden') === 'true') continue;
      const r = el.getBoundingClientRect();
      for (const t of document.querySelectorAll('section p, section h1, section h2, section h3, section li')) {
        if (t.contains(el) || el.contains(t)) continue;
        if (!viditelny(t)) continue;
        const tr = t.getBoundingClientRect();
        const prekryv = Math.max(0, Math.min(r.right, tr.right) - Math.max(r.left, tr.left)) *
                        Math.max(0, Math.min(r.bottom, tr.bottom) - Math.max(r.top, tr.top));
        if (prekryv > tr.width * tr.height * 0.25) {
          out.C.push({ el: popis(el), pres: popis(t) });
          break;
        }
      }
    }
    return out;
  }, w);

  const n = nalezy.A.length + nalezy.B.length + nalezy.C.length;
  console.log(`\n=== ${w} px === A:${nalezy.A.length} B:${nalezy.B.length} C:${nalezy.C.length}`);
  for (const k of ['A', 'B', 'C']) {
    celkem[k] += nalezy[k].length;
    for (const x of nalezy[k].slice(0, 6)) console.log(`  ${k} ${JSON.stringify(x)}`);
    if (nalezy[k].length > 6) console.log(`  ${k} … a dalších ${nalezy[k].length - 6}`);
  }
  await ctx.close();
}
console.log(`\nCELKEM  přetečení:${celkem.A}  v půlce:${celkem.B}  překryto:${celkem.C}`);
await b.close();
