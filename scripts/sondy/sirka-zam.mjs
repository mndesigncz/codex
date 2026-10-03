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
const stranky = ['/employee', '/employee/inventory', '/employee/shifts', '/employee/tasks', '/employee/requests', '/employee/chat'];
for (const dlouhe of [false, true]) for (const w of [360, 390]) for (const cesta of stranky) {
  const { ctx, p } = await kontext({ viewport: { width: w, height: 844 }, role: 'employee', mobil: true,
    dalsi: dlouhe ? (req, json) => { const u = new URL(req.url()); if (req.method() === 'GET' && u.pathname === '/api/inventory') return json(zdlouhat(fixtura('inventory'))); } : null });
  await p.goto(BASE + cesta, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(1200);
  const bezi = await p.locator('h1').first().isVisible().catch(() => false);
  const m = await mereni(p);
  tvrdi(`${dlouhe ? 'dlouhé' : 'běžné'} ${w} ${cesta}: načteno a nic nepřetéká`, bezi && m.sw <= m.W + 1 && m.posun === 0 && !m.ven.length && !m.posuvne.length, JSON.stringify({ bezi, ...m }));
  if (!dlouhe && w === 390) await p.screenshot({ path: OUT + `zam-${cesta.replaceAll('/', '_')}.png`, fullPage: true });
  await ctx.close();
}
await konec();
