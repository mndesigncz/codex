// Kolo 73 — účet zaměstnance na telefonu: každá stránka, běžná i s dlouhými názvy, bez vodorovného posunu.
import { kontext, konec, tvrdi, BASE, OUT, fixtura, roleMine } from './k68-spolecne.mjs';
const DLOUHE = 'Ovesné mléko barista edition bez laktózy 1 l (karton, šest kusů v balení)';
const zdlouhat = (pole) => Array.isArray(pole) ? pole.map((x, i) => ({ ...x, name: i % 2 ? x.name : `${DLOUHE} ${x.name ?? ''}` })) : pole;
const mereni = (p) => p.evaluate(() => {
  const W = innerWidth; window.scrollTo(300, 0); const posun = window.scrollX; window.scrollTo(0, 0);
  const popis = (e) => `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`;
  const ven = [], posuvne = [];
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(e);
    if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1 && !e.closest('[role=tablist]')) posuvne.push(`${popis(e)} ${e.scrollWidth}/${e.clientWidth} «${(e.textContent || '').trim().slice(0, 24)}»`);
    if (r.right <= W + 1 && r.left >= -1) continue; if (cs.position === 'fixed' && r.left >= -1) continue;
    let q = e.parentElement, uvnitr = false;
    while (q && q !== document.body) { const c = getComputedStyle(q); if (/(auto|scroll|hidden|clip)/.test(c.overflowX) && q.getBoundingClientRect().right <= W + 1) { uvnitr = true; break; } q = q.parentElement; }
    if (!uvnitr) ven.push(`${popis(e)} [${Math.round(r.left)}..${Math.round(r.right)}] «${(e.textContent || '').trim().slice(0, 24)}»`);
  }
  return { sw: document.documentElement.scrollWidth, W, posun, ven: ven.slice(0, 5), posuvne: posuvne.slice(0, 5) };
});
// Kolo 7 (R7-5): Návody a Nápady — pásy filtrů (role=group) na telefonu odjížděly doprava; teď jsou
// za tlačítkem „Filtry". Měří se i viditelné pásy role=group: v klidu žádný nesmí jet do strany.
const stranky = ['/employee', '/employee/inventory', '/employee/shifts', '/employee/tasks', '/employee/requests', '/employee/chat',
  '/employee/shifts?view=guides', '/employee/shifts?view=suggestions'];
const pasy = (p) => p.evaluate(() => [...document.querySelectorAll('[role=group]')]
  .filter(e => e.getBoundingClientRect().width > 0 && /(auto|scroll)/.test(getComputedStyle(e).overflowX))
  .map(e => ({ jmeno: e.getAttribute('aria-label'), jede: e.scrollWidth > e.clientWidth + 1 })));
for (const dlouhe of [false, true]) for (const w of [360, 390]) for (const cesta of stranky) {
  const { ctx, p } = await kontext({ viewport: { width: w, height: 844 }, role: 'employee', mobil: true,
    dalsi: (req, json) => {
      const u = new URL(req.url());
      if (req.method() !== 'GET') return undefined;
      if (dlouhe && u.pathname === '/api/inventory') return json(zdlouhat(fixtura('inventory')));
      if (u.pathname === '/api/guides') return json(fixtura('k69-b6b-guides'));
      if (u.pathname === '/api/suggestions') return json(fixtura('k69-b6a-suggestions'));
      return undefined;
    } });
  await p.goto(BASE + cesta, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(1200);
  const bezi = await p.locator('h1').first().isVisible().catch(() => false);
  const m = await mereni(p);
  tvrdi(`${dlouhe ? 'dlouhé' : 'běžné'} ${w} ${cesta}: načteno a nic nepřetéká`, bezi && m.sw <= m.W + 1 && m.posun === 0 && !m.ven.length && !m.posuvne.length, JSON.stringify({ bezi, ...m }));
  if (/view=(guides|suggestions)/.test(cesta)) {
    const pp = await pasy(p);
    const filtry = p.getByRole('button', { name: /^Filtry/ });
    tvrdi(`${dlouhe ? 'dlouhé' : 'běžné'} ${w} ${cesta}: pásy role=group v klidu skryté za „Filtry", žádný nejede do strany`,
      await filtry.isVisible() && pp.every(x => !x.jede) && pp.length === 0, JSON.stringify(pp));
  }
  if (!dlouhe && w === 390) await p.screenshot({ path: OUT + `zam-${cesta.replaceAll('/', '_').replace(/[?=]/g, '-')}.png`, fullPage: true });
  await ctx.close();
}
await konec();
