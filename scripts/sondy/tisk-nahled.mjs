// Tiskový náhled: společný vzhled výtisku (lib/printDoc) s dlouhým slovem a širokou tabulkou.
//
// Výtisk se v nativním obalu otevírá jako soubor v prohlížeči telefonu (360–390 px) a tiskne se na A4. Bez
// <meta viewport> ho telefon ukázal 980 px široký a dlouhé slovo bez mezer (název položky, adresa) roztáhlo tabulku
// za okraj papíru — pravé sloupce se uřízly. Server netřeba: dokument se skládá z printHtml() a vkládá do prázdné stránky.
import { browser, tvrdi, konec } from './k68-spolecne.mjs';

const { printHtml } = await import('../../lib/printDoc.ts');
const dlouhe = 'Nezalomitelny_retezec_'.repeat(6);
const radek = (i) => `<tr><td>${dlouhe}${i}</td>${[1, 2, 3, 4, 5, 6].map(j => `<td class="num">${(i + 1) * j * 1234} Kč</td>`).join('')}</tr>`;
const body = `<h2>Týden</h2><table><thead><tr><th>Položka</th>${[1, 2, 3, 4, 5, 6].map(j => `<th class="num">Sloupec ${j}</th>`).join('')}</tr></thead><tbody>${[0, 1, 2].map(radek).join('')}</tbody></table><p class="note">${dlouhe}</p>`;
const html = printHtml({ title: 'Rozvrh ' + dlouhe, subtitle: 'Týden ' + dlouhe, body, business: 'Kavárna ' + dlouhe });

const b = await browser();
for (const [w, media] of [[390, 'screen'], [360, 'screen'], [794, 'print']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: media === 'screen', hasTouch: media === 'screen' });
  const p = await ctx.newPage();
  await p.emulateMedia({ media });
  await p.setContent(html);
  const m = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    // `window.innerWidth` na mobilu s layoutovým viewportem 980 lže; rozhoduje šířka, kterou telefon skutečně ukáže
    const vScrolleru = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (/auto|scroll/.test(getComputedStyle(a).overflowX)) return true; return false; };
    const ven = [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > vw + 1 && !vScrolleru(e)).map(e => e.tagName.toLowerCase()).slice(0, 5);
    return { vw, dok: document.documentElement.scrollWidth - vw, ven };
  });
  tvrdi(`tisk ${media} ${w} px: viewport ${m.vw} (ne 980)`, media === 'print' || m.vw <= w, JSON.stringify(m));
  tvrdi(`tisk ${media} ${w} px: dokument nepřetéká`, m.dok <= 1, JSON.stringify(m));
  tvrdi(`tisk ${media} ${w} px: nic nevyčnívá za okraj (mimo posuvnou tabulku)`, m.ven.length === 0, JSON.stringify(m));
  await ctx.close();
}
await konec();
