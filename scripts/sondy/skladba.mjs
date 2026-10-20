// Sonda SKLADBY (redesign v4, DESIGN.md „Mřížka a hrany", „Výšky ovládání", „Řady ovládání",
// „Čísla v řádku"; spec-skladba §8). Měří z DOM ukázky (/demo — bez přihlášení a bez fixtur)
// na klíčových obrazovkách na 390 a 1280 px:
//   1) hrany: ovládání širší než 50 % obsahu karty končí na R (± 1,5); užší má v témže řádku
//      souseda, nebo je to ikonové tlačítko, čip či odkaz (P1, P2, P4);
//   2) výšky: ovládání v jednom řádku karty mají stejnou výšku (± 1) a jen povolené stupně
//      28 / 36 / 40 / 44 / 52 (P6, P7);
//   3) šířky: v jedné kartě nejvýš 3 různé šířky ovládání (P3);
//   4) titul hlavičky střední a velké karty je na 390 px na jeden řádek (V1);
//   5) hodnota v `.list-row` končí na R řádku (nebo R − 28 se šipkou) a má tabular-nums (P15);
//   6) „···" (Další akce / Další možnosti) je na obrazovce nejvýš jednou (P18).
// Výsledek: počet nálezů po pravidlech a obrazovkách + prvních pár viníků. Nálezy z obsahu
// oblastí opravují agenti oblastí (fáze 2) — dokud jich není nula, sonda není v ZELENE.
import { chromium } from 'playwright-core';

const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
const CHROMIUM = process.env.SONDY_CHROMIUM || undefined;
const SIRKY = (process.env.SKLADBA_SIRKY || '390,1280').split(',').map(Number);
const PODROBNE = process.env.SKLADBA_PODROBNE === '1';

const OBRAZOVKY = [
  { role: 'vedeni', pohled: 'overview' }, { role: 'vedeni', pohled: 'rewards', arg: 'navic' },
  { role: 'vedeni', pohled: 'tasks' }, { role: 'vedeni', pohled: 'inventory' }, { role: 'vedeni', pohled: 'reports' },
  { role: 'vedeni', pohled: 'shifts' }, { role: 'vedeni', pohled: 'team-settings' },
  { role: 'zamestnanec', pohled: 'home' }, { role: 'zamestnanec', pohled: 'tasks' },
  { role: 'host', adresa: '/client' },
];

/** Měření v prohlížeči — vrací nálezy { pravidlo, kde, co }. */
const zmer = (p, sirka) => p.evaluate((sirka) => {
  const nalezy = [];
  const R = e => e.getBoundingClientRect();
  const cs = e => getComputedStyle(e);
  const vid = e => { const r = R(e); if (r.width < 2 || r.height < 2) return false; const s = cs(e); return s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[aria-hidden="true"], [inert], .sr-only'); };
  const text = e => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const natreny = e => { const s = cs(e); return (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') || parseFloat(s.borderTopWidth) > 0 && s.borderTopColor !== 'rgba(0, 0, 0, 0)'; };
  const SEL = 'button, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]), [role=tablist], a.btn';
  const karty = [...document.querySelectorAll('main .card, main .glass-card, [role=dialog] .modal-sheet, .modal-sheet')].filter(vid)
    .filter(k => !k.closest('[data-upravy]'));
  const titulekKarty = k => { const h = k.querySelector('h2, h3, [data-w-titulek]'); return h ? text(h) : text(k).slice(0, 30); };
  for (const k of karty) {
    const rk = R(k), sk = cs(k);
    // Karta bez vlastního odsazení (`<Card pad="none">` nástroje s px-5 uvnitř) má mřížku podle tokenu --pad-karta.
    const tok = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pad-karta')) || 16;
    const padL = parseFloat(sk.paddingLeft) < 4 ? tok : parseFloat(sk.paddingLeft);
    const padR = parseFloat(sk.paddingRight) < 4 ? tok : parseFloat(sk.paddingRight);
    const L = rk.left + parseFloat(sk.borderLeftWidth) + padL;
    const Rr = rk.right - parseFloat(sk.borderRightWidth) - padR;
    const sirkaObsahu = Rr - L;
    if (sirkaObsahu < 120) continue;
    const kde = `${titulekKarty(k)}`;
    // Ovládání, jehož nejbližší karta je tahle, mimo řádky seznamu (akce řádku má vlastní pravidlo V4)
    // a mimo hlavičku widgetu (ta má vlastní skladbu V1).
    const ovl = [...k.querySelectorAll(SEL)].filter(e => vid(e) && e.closest('.card, .glass-card, .modal-sheet') === k
      && !e.closest('.list-row, li.list-row, .w-hlavicka, [role=menu], details, summary')
      && !(e.parentElement && e.parentElement.closest('[role=tablist]')))
      .filter(e => !e.closest('label') || e.tagName !== 'INPUT' || cs(e).opacity !== '0');
    const prvky = ovl.map(e => ({ e, r: R(e), ikona: R(e).width <= 46 && R(e).height <= 46, natreny: natreny(e) || /^(SELECT|INPUT)$/.test(e.tagName) || e.getAttribute('role') === 'tablist' }));
    // 1) hrany
    for (const x of prvky) {
      if (!x.natreny) continue;
      const sousede = prvky.filter(y => y !== x && Math.abs(y.r.top - x.r.top) <= 2);
      if (x.r.width > sirkaObsahu * 0.5) {
        const prava = Math.max(x.r.right, ...sousede.map(y => y.r.right));
        if (Math.abs(prava - Rr) > 1.5 && x.r.right < Rr - 1.5 && !(prava > Rr)) nalezy.push({ pravidlo: '1 hrana', kde, co: `${text(x.e)} končí ${Math.round(x.r.right - rk.left)} ≠ R ${Math.round(Rr - rk.left)}` });
      } else if (!x.ikona && !sousede.length && !x.e.classList.contains('chip') && x.e.tagName !== 'A') {
        const vlevo = x.r.left - L, vpravo = Rr - x.r.right;
        const naStred = vlevo > 24 && Math.abs(vlevo - vpravo) < 10;
        if (!naStred) nalezy.push({ pravidlo: '1 osamělé', kde, co: `${text(x.e)} ${Math.round(x.r.width)} px sám na řádku` });
      }
    }
    // 2) výšky
    const POVOLENE = [28, 36, 40, 44, 52];
    for (const x of prvky) {
      // Výška se hlídá u ovládání (tlačítko, pole, pilulka) — ne u dlaždic a klikacích řádků (den v kalendáři 84, řádek 56–72).
      if (!x.natreny || x.r.height > 53 || x.e.classList.contains('list-row')) continue;
      const h = x.r.height;
      if (!POVOLENE.some(v => Math.abs(v - h) <= 1)) nalezy.push({ pravidlo: '2 stupeň', kde, co: `${text(x.e)} výška ${Math.round(h)}` });
      const sousede = prvky.filter(y => y !== x && y.natreny && Math.abs(y.r.top - x.r.top) <= 2 && Math.abs(y.r.height - h) > 1);
      if (sousede.length && prvky.indexOf(x) < prvky.indexOf(sousede[0])) nalezy.push({ pravidlo: '2 řada', kde, co: `${text(x.e)} ${Math.round(h)} vedle ${text(sousede[0].e)} ${Math.round(sousede[0].r.height)}` });
    }
    // 3) šířky
    const sirky = [];
    for (const x of prvky) { if (!x.natreny || x.ikona) continue; if (!sirky.some(w => Math.abs(w - x.r.width) <= 2)) sirky.push(x.r.width); }
    if (sirky.length > 3) nalezy.push({ pravidlo: '3 šířky', kde, co: `${sirky.length} šířek: ${sirky.map(Math.round).join(' / ')}` });
  }
  // 4) titul widgetu na jeden řádek (390, M a L)
  if (sirka < 600) {
    for (const li of document.querySelectorAll('[data-plocha] li[data-widget]')) {
      const sec = li.querySelector('section.card');
      if (!sec || !vid(sec) || sec.querySelector('.w-hlavicka-s')) continue;
      const t = sec.querySelector('.w-titul > span:nth-child(2)');
      if (t && R(t).height > 26) nalezy.push({ pravidlo: '4 titul', kde: li.getAttribute('data-widget'), co: `${text(t)} ${Math.round(R(t).height)} px` });
    }
  }
  // 5) hodnoty v řádku seznamu
  for (const v of document.querySelectorAll('.list-row .list-value')) {
    if (!vid(v)) continue;
    const row = v.closest('.list-row');
    const rr = R(row), sr = cs(row);
    const Rrow = rr.right - parseFloat(sr.paddingRight);
    const rv = R(v);
    // Co stojí v témže pásu vpravo od hodnoty (ocas je na monitoru display: contents — bere se po prvcích).
    const viditelnyBox = c => { const r = R(c); return r.width >= 2 && r.height >= 2 && cs(c).visibility !== 'hidden' && !c.closest('.sr-only'); };
    const za = [...row.querySelectorAll('*')].filter(c => !v.contains(c) && !c.contains(v) && viditelnyBox(c) && cs(c).display !== 'contents'
      && R(c).left >= rv.right - 1 && R(c).top < rv.bottom && R(c).bottom > rv.top);
    const sipka = za.find(c => c.classList.contains('list-sipka'));
    const jine = za.filter(c => !(sipka && (c === sipka || sipka.contains(c))));
    if (jine.length) continue; // za hodnotou je doplněk/chip/akce (sloupec monitoru) — skladbu řeší oblast podle V4
    const cil = sipka ? Rrow - 28 : Rrow;
    if (Math.abs(R(v).right - cil) > 2) nalezy.push({ pravidlo: '5 hodnota', kde: text(row).slice(0, 30), co: `končí ${Math.round(R(v).right - rr.left)} ≠ ${Math.round(cil - rr.left)}` });
    if (cs(v).fontVariantNumeric.indexOf('tabular-nums') < 0) nalezy.push({ pravidlo: '5 tabular', kde: text(row).slice(0, 30), co: 'bez tabular-nums' });
  }
  // 6) „···" jednou
  const tecky = [...document.querySelectorAll('button[aria-label="Další akce"], button[aria-label="Další možnosti"]')].filter(vid);
  if (tecky.length > 1) nalezy.push({ pravidlo: '6 ···', kde: 'obrazovka', co: `${tecky.length}× „···"` });
  return nalezy;
}, sirka);

const browser = await chromium.launch({ executablePath: CHROMIUM });
const souhrn = {};
let celkem = 0;
for (const sirka of SIRKY) {
  const mobil = sirka < 600;
  const ctx = await browser.newContext({ viewport: { width: sirka, height: mobil ? 844 : 900 }, isMobile: mobil, hasTouch: mobil, locale: 'cs-CZ', reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  let role0 = null;
  for (const o of OBRAZOVKY) {
    const jmeno = `${o.role}/${o.adresa ?? o.pohled}${o.arg ? '|' + o.arg : ''} · ${sirka}`;
    try {
      if (o.adresa) { await p.goto(BASE + o.adresa, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(4000); role0 = null; }
      else {
        if (role0 !== o.role) { await p.goto(`${BASE}/demo?role=${o.role}&scena=rozvrh`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(6000); role0 = o.role; }
        await p.evaluate(({ view, arg }) => { const u = new URL(location.href); u.searchParams.set('view', view); if (arg) u.searchParams.set('arg', arg); else u.searchParams.delete('arg'); history.pushState(null, '', u); dispatchEvent(new PopStateEvent('popstate', { state: null })); }, { view: o.pohled, arg: o.arg });
        await p.waitForTimeout(3500);
      }
      const n = await zmer(p, sirka);
      celkem += n.length;
      const po = {};
      for (const x of n) po[x.pravidlo] = (po[x.pravidlo] ?? 0) + 1;
      for (const [k, v] of Object.entries(po)) souhrn[k] = (souhrn[k] ?? 0) + v;
      console.log(`${n.length ? '✗' : '✓'} ${jmeno}: ${n.length ? Object.entries(po).map(([k, v]) => `${k} ${v}`).join(', ') : 'čisto'}`);
      for (const x of n.slice(0, PODROBNE ? 99 : 4)) console.log(`    ${x.pravidlo} · ${x.kde} · ${x.co}`);
    } catch (e) { console.log(`✗ ${jmeno}: nedoměřeno (${String(e).slice(0, 100)})`); celkem++; }
  }
  await ctx.close();
}
await browser.close();
console.log(`\nSkladba: ${celkem} nálezů — ${Object.entries(souhrn).map(([k, v]) => `${k} ${v}`).join(', ') || 'žádné'}`);
process.exit(celkem ? 1 : 0);
