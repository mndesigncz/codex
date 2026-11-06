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
  // Návštěvník, který si na rozcestníku už vybral podnik (components/landing/Rozcestnik.tsx):
  // sonda měří hlavičku prodejní stránky, ne rozcestník.
  await ctx.addCookies([{ name: 'mg_volba', value: 'podnik', url: BASE }]);
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  tvrdi(`${nazev}: nahoře je lišta bez skla`, await p.locator('header[data-posunuto="true"]').count() === 0);
  await p.evaluate(() => window.scrollTo(0, 700));
  await p.waitForTimeout(500);
  tvrdi(`${nazev}: po posunu dostane lišta sklo`, await p.locator('header[data-posunuto="true"]').count() === 1);
  if (nazev === 'desk') {
    for (const [id, label] of [['funkce', 'Funkce'], ['den', 'Jeden den'], ['zacatek', 'Jak začít'], ['cenik', 'Ceník'], ['otazky', 'Otázky']]) {
      await p.evaluate(i => document.getElementById(i).scrollIntoView({ block: 'start' }), id);
      await p.waitForTimeout(700);
      const aktivni = await p.locator('header [data-on="true"]').first().textContent().catch(() => null);
      // #funkce leží uvnitř sekce #ukazka (Jeviště), takže na ni se navigace může ujmout i „Ukázka".
      const ok = aktivni?.trim() === label || (id === 'funkce' && aktivni?.trim() === 'Ukázka');
      tvrdi(`desk: u sekce #${id} svítí v navigaci „${label}"`, ok, String(aktivni));
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

// Rozcestník (#378): nový návštěvník bez cookie volby vidí nejdřív podnik / zákazník.
// „Ukázat, co Managero umí“ ho otevře, zapamatuje volbu a pod ním je prodejní stránka.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'cs-CZ', deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  tvrdi('rozcestník: nový návštěvník ho vidí jako první obrazovku', await p.locator('section.ld-rozc').isVisible());
  tvrdi('rozcestník: zákazník má cestu na své karty', await p.locator('section.ld-rozc a[href="/client/login"]').count() === 1);
  await p.getByRole('button', { name: /Ukázat, co Managero umí/ }).click();
  await p.locator('section.ld-rozc').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  tvrdi('rozcestník: volba podniku ho zavře a ukáže prodejní stránku', await p.locator('section.ld-rozc').count() === 0 && await p.locator('#nadpis-hero').isVisible());
  tvrdi('rozcestník: volba podniku se zapamatuje (cookie)', (await ctx.cookies()).some(c => c.name === 'mg_volba' && c.value === 'podnik'));
  await p.goto(BASE + '/#cenik', { waitUntil: 'networkidle' });
  tvrdi('rozcestník: po volbě se znovu neukáže', await p.locator('section.ld-rozc').count() === 0);
  await ctx.close();
}
await konec();
