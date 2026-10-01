// Kolo 73a — rychlá deterministická sonda na čtyři nálezy z hloubkového průzkumu (pruchod-hloubka.mjs):
//   1) landing: hlavička se na 768–1280 px nevejde (menu sekcí od md, dlouhé tlačítko) — logo se smrštilo
//      a „Vyzkoušet 30 dní zdarma" ořízl overflow-x-clip rodiče, takže dokument nepřetékal a nikdo si ničeho nevšiml,
//   2) uzávěrka: mezisoučet u bankovek se na 320 a 360 px uřízl (pevné šířky v řádku, rodič overflow-hidden),
//   3) toast „Nový kód platí, starý už ne." seděl přes spodní dok na telefonu,
//   4) „Vložit bod" / „Odebrat bod" v úkolu se vedle pole smrštily z 36 na 25 px.
// Žádná závislost na denní době; běží do 30 s.
import { kontext, konec, tvrdi, BASE, dokud } from './k68-spolecne.mjs';

// 1) Landing bez přihlášení
for (const w of [768, 834, 1024, 1280]) {
  const { ctx, p } = await kontext({ viewport: { width: w, height: 900 }, role: 'employer' });
  await ctx.clearCookies();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  const m = await p.evaluate(() => {
    const h = document.querySelector('header.sticky');
    const cta = h?.querySelector('a[href="/register"]')?.getBoundingClientRect();
    const logo = h?.querySelector('a[aria-label^="Managero"]')?.getBoundingClientRect();
    const nav = h?.querySelector('nav');
    const navZobrazeno = !!nav && getComputedStyle(nav).display !== 'none';
    return { sirka: innerWidth, ctaPravy: cta ? Math.round(cta.right) : null, logo: logo ? Math.round(logo.width) : null, navZobrazeno };
  });
  tvrdi(`1: landing ${w} px — tlačítko „Vyzkoušet" je celé v okně`, m.ctaPravy !== null && m.ctaPravy <= w, JSON.stringify(m));
  tvrdi(`1: landing ${w} px — logo se nesmrštilo (≥ 100 px)`, (m.logo ?? 0) >= 100, JSON.stringify(m));
  await ctx.close();
}

// 2) Uzávěrka: bankovky na úzkém telefonu
for (const w of [320, 360]) {
  const { ctx, p } = await kontext({ viewport: { width: w, height: 800 }, role: 'employee', mobil: true });
  await p.goto(BASE + '/employee/shifts?view=closing', { waitUntil: 'networkidle' });
  await p.getByRole('tab', { name: 'Spočítat bankovky' }).click();
  await p.waitForTimeout(500);
  const m = await p.evaluate(() => {
    const well = document.querySelector('.well.overflow-hidden');
    return well ? { scroll: well.scrollWidth, klient: well.clientWidth } : null;
  });
  tvrdi(`2: bankovky ${w} px — obsah řádků se vejde (nic neuřízne overflow-hidden)`, !!m && m.scroll <= m.klient + 1, JSON.stringify(m));
  await ctx.close();
}

// 3) Toast nad dokem (telefon 390 px)
{
  const { ctx, p } = await kontext({ viewport: { width: 390, height: 844 }, role: 'employer', mobil: true });
  await p.goto(BASE + '/employer/team', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Nový kód' }).first().click();
  const toast = p.getByText('Nový kód platí, starý už ne.');
  tvrdi('3: toast „Nový kód platí" se ukáže', await dokud(() => toast.isVisible(), 3000));
  const m = await p.evaluate(() => {
    const t = [...document.querySelectorAll('[role=status]')].find(e => /Nový kód platí/.test(e.textContent || ''))?.getBoundingClientRect();
    const d = document.querySelector('nav[aria-label="Spodní navigace"]')?.getBoundingClientRect();
    return t && d ? { toastDole: Math.round(t.bottom), dokNahore: Math.round(d.top) } : null;
  });
  tvrdi('3: toast leží nad dokem, ne přes něj', !!m && m.toastDole <= m.dokNahore, JSON.stringify(m));
  await ctx.close();
}

// 4) Tlačítka bez textu vedle pole zůstanou čtvercová (úkol → kontrolní seznam)
{
  const { ctx, p } = await kontext({ viewport: { width: 320, height: 800 }, role: 'employer', mobil: true });
  await p.goto(BASE + '/employer/overview?view=tasks', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /^Upravit úkol/ }).first().click();
  const vlozit = p.getByRole('button', { name: /^Vložit bod za bod 1/ });
  const videt = await dokud(() => vlozit.first().isVisible().catch(() => false), 3000);
  if (!videt) tvrdi('4: úkol má kontrolní seznam s tlačítkem „Vložit bod" (fixtura)', false, 'tlačítko není vidět — fixtura úkolu bez kontrolního seznamu?');
  else {
    const b = await vlozit.first().boundingBox();
    tvrdi('4: „Vložit bod" je čtverec 36 × 36 i na 320 px', !!b && Math.round(b.width) === 36 && Math.round(b.height) === 36, JSON.stringify(b));
  }
  await ctx.close();
}

await konec();
