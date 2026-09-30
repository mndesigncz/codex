// Kolo 57 (přepsáno v kole 75): hlavička a navigace prodejní stránky.
//
// Dřív sonda měřila 3D stěnu obrazovek a autoplay záložky funkcí; obojí stránka
// po přestavbě na živou ukázku nemá. Zůstává to, co hlavička pořád slibuje:
//  - nahoře je lišta bez pozadí, po posunu dostane sklo (`.posunuto`),
//  - tmavá pilulka v navigaci ví, která sekce je v obraze (jen od 768 px),
//  - odkazy hlavičky vedou na sekce, které na stránce doopravdy jsou.
import { browser, tvrdi, konec, BASE, OUT } from './k68-spolecne.mjs';

const b = await browser();
for (const [nazev, vp] of [['desk', { width: 1440, height: 900 }], ['mob', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, locale: 'cs-CZ', deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  tvrdi(`${nazev}: nahoře je lišta bez skla`, await p.locator('.lg-bar.posunuto').count() === 0);
  await p.evaluate(() => window.scrollTo(0, 700));
  await p.waitForTimeout(500);
  tvrdi(`${nazev}: po posunu dostane lišta sklo`, await p.locator('.lg-bar.posunuto').count() === 1);
  if (nazev === 'desk') {
    for (const [id, label] of [['funkce', 'Funkce'], ['den', 'Jeden den'], ['zacatek', 'Jak začít'], ['cenik', 'Ceník'], ['otazky', 'Otázky']]) {
      await p.evaluate(i => document.getElementById(i).scrollIntoView({ block: 'start' }), id);
      await p.waitForTimeout(700);
      const aktivni = await p.locator('header [data-on="true"]').first().textContent().catch(() => null);
      tvrdi(`desk: u sekce #${id} svítí v navigaci „${label}"`, aktivni?.trim() === label, String(aktivni));
    }
  }
  for (const id of ['ukazka-okno', 'funkce', 'den', 'zacatek', 'cenik', 'otazky']) {
    tvrdi(`${nazev}: sekce #${id}, na kterou míří hlavička, na stránce je`, await p.locator('#' + id).count() === 1);
  }
  await p.evaluate(() => document.getElementById('den').scrollIntoView({ block: 'start' }));
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + `k57-${nazev}-den.png` });
  await ctx.close();
}
await konec();
