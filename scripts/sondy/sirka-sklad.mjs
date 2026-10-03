// Kolo 73 — vodorovný posun ve Skladu na telefonu (stránka, zobrazení Karty, každé okno z nabídky „···").
// Měří (a) dokument: scrollWidth a skutečný posun window.scrollTo, (b) cokoli, co leží za okrajem obrazovky,
// (c) kontejnery, které se dají posouvat do strany — kromě těch, které to mají dělat (přepínače, řady čipů).
import { kontext, konec, tvrdi, BASE, OUT, fixtura } from './k68-spolecne.mjs';

const DLOUHE = 'Ovesné mléko barista edition bez laktózy 1 l (karton, šest kusů v balení)';
const zdlouhat = (pole) => Array.isArray(pole) ? pole.map((x, i) => ({ ...x, name: i % 2 ? x.name : `${DLOUHE} ${x.name ?? ''}`, supplier: x.supplier ? `${x.supplier} velkoobchod s.r.o.` : x.supplier })) : pole;

const mereni = (p) => p.evaluate(() => {
  const de = document.documentElement, W = innerWidth;
  window.scrollTo(300, 0); const posun = window.scrollX; window.scrollTo(0, 0);
  const popis = (e) => `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`;
  const ven = [], posuvne = [];
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(e);
    if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1 && !e.closest('[role=tablist]') && cs.display !== 'none')
      posuvne.push(`${popis(e)} scroll=${e.scrollWidth} klient=${e.clientWidth} «${(e.textContent || '').trim().slice(0, 24)}»`);
    if (r.right <= W + 1 && r.left >= -1) continue;
    if (cs.position === 'fixed' && r.left >= -1) continue;
    let rodic = e.parentElement, uvnitr = false;
    while (rodic && rodic !== document.body) {
      const c = getComputedStyle(rodic);
      if (/(auto|scroll|hidden|clip)/.test(c.overflowX) && rodic.getBoundingClientRect().right <= W + 1) { uvnitr = true; break; }
      rodic = rodic.parentElement;
    }
    if (!uvnitr) ven.push(`${popis(e)} [${Math.round(r.left)}..${Math.round(r.right)}] «${(e.textContent || '').trim().slice(0, 24)}»`);
  }
  return { sw: de.scrollWidth, W, posun, ven: ven.slice(0, 5), pocetVen: ven.length, posuvne: posuvne.slice(0, 5) };
});

const over = (jm, m) => tvrdi(`${jm}: nic nepřetéká do strany`, m.sw <= m.W + 1 && m.posun === 0 && m.pocetVen === 0 && m.posuvne.length === 0, JSON.stringify(m));

for (const dlouhe of [false, true]) {
  for (const w of [360, 390]) {
    const jm = `${dlouhe ? 'dlouhé' : 'běžné'} ${w}`;
    const { ctx, p } = await kontext({ viewport: { width: w, height: 844 }, role: 'employer', mobil: true,
      dalsi: dlouhe ? (req, json) => {
        const u = new URL(req.url());
        if (req.method() === 'GET' && u.pathname === '/api/inventory') return json(zdlouhat(fixtura('inventory')));
      } : null });
    await p.goto(BASE + '/employer/overview?view=inventory', { waitUntil: 'networkidle' });
    await p.getByRole('heading', { name: 'Sklad', level: 1 }).waitFor({ timeout: 15000 });
    await p.waitForTimeout(1200);
    over(`${jm} seznam`, await mereni(p));
    if (!dlouhe && w === 390) await p.screenshot({ path: OUT + 'sirka-seznam.png' });

    await p.getByRole('tab', { name: 'Karty' }).click().catch(() => {});
    await p.waitForTimeout(500);
    over(`${jm} karty`, await mereni(p));
    await p.getByRole('tab', { name: 'Seznam' }).click().catch(() => {});

    // Okna z nabídky „···" a formulář nové položky; každé na čerstvě načtené stránce, ať zavřené okno nic nerozbije.
    const nazvy = ['Nakoupit', 'Vybrat víc položek', 'Kategorie a balení', 'Dodavatelé', 'Inventura', 'Receptury a prodeje z kasy'];
    for (const n of [...nazvy, 'Přidat položku']) {
      await p.goto(BASE + '/employer/overview?view=inventory', { waitUntil: 'networkidle' });
      await p.getByRole('heading', { name: 'Sklad', level: 1 }).waitFor({ timeout: 15000 });
      await p.waitForTimeout(600);
      if (n === 'Přidat položku') await p.getByRole('button', { name: 'Přidat položku' }).first().click();
      else {
        await p.getByRole('button', { name: /^(Další akce|Více)/ }).first().click();
        await p.getByRole('menuitem', { name: new RegExp('^' + n) }).first().click();
      }
      await p.waitForTimeout(800);
      over(`${jm} okno „${n}"`, await mereni(p));
      if (!dlouhe && w === 390) await p.screenshot({ path: OUT + `sirka-okno-${n.split(' ')[0]}.png` });
    }
    await ctx.close();
  }
}
await konec();
