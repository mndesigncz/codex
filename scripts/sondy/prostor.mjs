// Dvě měřitelné vady z náhledu:
//  A) MRTVÝ PROSTOR — karta s textem vedle fotky, kde text zabírá jen část
//     výšky. Měří se podíl výšky obsahu textového sloupce vůči výšce karty.
//  B) OSIŘELÁ BUŇKA — mřížka, kde počet dětí není násobkem počtu sloupců,
//     takže poslední řádek zeje.
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:3000/';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
for (const w of [390, 768, 1024, 1280, 1440]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const out = { A: [], B: [] };
    const txt = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36);
    // A) každá mřížka se 2 sloupci, kde jedno dítě obsahuje <img>
    for (const g of document.querySelectorAll('section [class*="grid-cols"]')) {
      const cs = getComputedStyle(g);
      const cols = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
      const deti = [...g.children].filter(c => getComputedStyle(c).display !== 'none');
      if (cols === 2 && deti.length === 2) {
        const foto = deti.find(c => c.querySelector('img')), text = deti.find(c => !c.querySelector('img'));
        if (!foto || !text) continue;
        const gh = g.getBoundingClientRect().height;
        // výška skutečného obsahu textu = od prvního do posledního potomka
        const kids = [...text.querySelectorAll('*')].filter(k => k.getBoundingClientRect().height > 0);
        if (!kids.length) continue;
        const top = Math.min(...kids.map(k => k.getBoundingClientRect().top));
        const bot = Math.max(...kids.map(k => k.getBoundingClientRect().bottom));
        const podil = (bot - top) / gh;
        if (podil < 0.7) out.A.push({ karta: txt(text), obsah: Math.round(bot - top), karta_px: Math.round(gh), podil: +podil.toFixed(2) });
      }
      // B) osiřelé buňky
      if (cols >= 2 && deti.length > cols && deti.length % cols !== 0) {
        out.B.push({ mrizka: txt(g), sloupce: cols, polozek: deti.length, osirelych: deti.length % cols });
      }
    }
    return out;
  });
  console.log(`\n=== ${w} px === mrtvý prostor:${r.A.length}  osiřelé buňky:${r.B.length}`);
  r.A.forEach(x => console.log('  A', JSON.stringify(x)));
  r.B.forEach(x => console.log('  B', JSON.stringify(x)));
  await ctx.close();
}
await b.close();
