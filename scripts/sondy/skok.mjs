// „Rozsype se layout" nemusí znamenat přetečení. Tohle měří skok: o kolik se
// posune obsah, když se v ukázce v hero přepne scéna nebo zařízení. Rámy jsou
// různě vysoké (počítač, tablet, telefon), takže bez pevného jeviště by se stránka
// při každém přepnutí zkrátila nebo prodloužila pod rukou toho, kdo zrovna čte.
// (Dřív sonda měřila autoplay záložky funkcí, které stránka po přestavbě nemá.)
import { browser, tvrdi, konec, BASE } from './k68-spolecne.mjs';

const b = await browser();
for (const w of [390, 768, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, locale: 'cs-CZ' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('ukazka-okno').scrollIntoView());
  await p.waitForTimeout(600);
  const vyska = () => p.evaluate(() => ({ stranka: Math.round(document.body.scrollHeight), pod: Math.round(document.querySelector('#ukazka-okno [role="status"]').getBoundingClientRect().top + scrollY) }));
  const zaklad = await vyska();
  const zmery = [];
  for (const scena of ['Rozvrh', 'Uzávěrka', 'Sklad', 'Tablet u baru', 'Přehled']) {
    await p.getByRole('tab', { name: scena }).click();
    await p.waitForTimeout(900);
    zmery.push({ scena, ...(await vyska()) });
  }
  if (w >= 768) {
    for (const z of ['Telefon', 'Tablet', 'Počítač']) {
      await p.getByRole('tab', { name: z, exact: true }).click();
      await p.waitForTimeout(500);
      zmery.push({ scena: `zařízení ${z}`, ...(await vyska()) });
    }
  }
  const maxSkok = Math.max(...zmery.map(m => Math.abs(m.pod - zaklad.pod)));
  const maxStranka = Math.max(...zmery.map(m => Math.abs(m.stranka - zaklad.stranka)));
  tvrdi(`${w} px: řádek pod ukázkou se při přepínání scén a zařízení neposune (max ${maxSkok} px)`, maxSkok <= 2, JSON.stringify(zmery.map(m => [m.scena, m.pod - zaklad.pod])));
  tvrdi(`${w} px: výška stránky se při přepínání nemění (max ${maxStranka} px)`, maxStranka <= 2, JSON.stringify(zmery.map(m => [m.scena, m.stranka - zaklad.stranka])));
  await ctx.close();
}
await konec();
