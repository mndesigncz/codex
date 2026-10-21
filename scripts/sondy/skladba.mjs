// Sonda SKLADBY (redesign v4, DESIGN.md „Mřížka a hrany", „Výšky ovládání", „Řady ovládání",
// „Čísla v řádku"; spec-skladba §8). Měří z DOM ukázky (/demo — bez přihlášení a bez fixtur)
// na klíčových obrazovkách na 390 a 1280 px:
//   1) hrany: ovládání širší než 50 % obsahu karty končí na R (± 1,5); užší má v témže řádku
//      souseda, nebo je to ikonové tlačítko, čip či odkaz, nebo akce u R vedle textu (P1, P2, P4);
//      řada dvou a víc ovládání, která začíná na L, končí na R (P2);
//   2) výšky: ovládání v jednom řádku karty mají stejnou výšku (± 1) a jen povolené stupně
//      28 / 36 / 40 / 44 / 52 (P6, P7);
//   3) šířky: v jedné kartě nejvýš 3 různé šířky ovládání (P3);
//   4) titul hlavičky střední a velké karty je na 390 px na jeden řádek (V1);
//   5) hodnota v `.list-row` končí na R řádku (nebo R − 28 se šipkou) a má tabular-nums (P15);
//   6) „···" (Další akce / Další možnosti) je na obrazovce nejvýš jednou (P18);
//   7) dvojice malých karet vedle sebe mají první číslo na stejné y (P14, V9);
//   8) nic nepřetéká obrazovku.
// Obrazovky: 24 klíčových (vedení, zaměstnanec, TO GO, Managero client, host), 390 + 1280, světle i tmavě
// (SKLADBA_SIRKY, SKLADBA_TEMATA zúží běh). V řadě = svislé středy do 6 px; přepínač (role=switch) je
// ovládání řádku nastavení, ne díl řady. Je v ZELENE — kdo ji rozbije, opraví skladbu, ne sondu.
import { chromium } from 'playwright-core';

const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
const CHROMIUM = process.env.SONDY_CHROMIUM || undefined;
const SIRKY = (process.env.SKLADBA_SIRKY || '390,1280').split(',').map(Number);
const PODROBNE = process.env.SKLADBA_PODROBNE === '1';

const OBRAZOVKY = [
  { role: 'vedeni', pohled: 'overview' }, { role: 'vedeni', pohled: 'rewards', arg: 'navic' }, { role: 'vedeni', pohled: 'rewards', arg: 'tresty' },
  { role: 'vedeni', pohled: 'tasks' }, { role: 'vedeni', pohled: 'inventory' }, { role: 'vedeni', pohled: 'recipes' }, { role: 'vedeni', pohled: 'reports' },
  { role: 'vedeni', pohled: 'shifts' }, { role: 'vedeni', pohled: 'attendance' }, { role: 'vedeni', pohled: 'finance' }, { role: 'vedeni', pohled: 'team-settings' },
  { role: 'vedeni', pohled: 'procedures' }, { role: 'vedeni', pohled: 'guides' }, { role: 'vedeni', pohled: 'suggestions' }, { role: 'vedeni', pohled: 'planning' },
  { role: 'zamestnanec', pohled: 'home' }, { role: 'zamestnanec', pohled: 'tasks' }, { role: 'zamestnanec', pohled: 'rewards' },
  { role: 'zamestnanec', pohled: 'availability' }, { role: 'zamestnanec', pohled: 'closing' },
  { role: 'togo', adresa: '/demo?role=vedeni&scena=prehled', jenTelefon: true },
  { role: 'klient', adresa: '/demo?role=vedeni&scena=prehled&mode=client&tab=overview' },
  { role: 'klient', adresa: '/demo?role=vedeni&scena=prehled&mode=client&tab=customers' },
  { role: 'host', adresa: '/client' },
];
const TEMATA = (process.env.SKLADBA_TEMATA || 'light,dark').split(',');

/** Měření v prohlížeči — vrací nálezy { pravidlo, kde, co }. */
const zmer = (p, sirka) => p.evaluate((sirka) => {
  const nalezy = [];
  const R = e => e.getBoundingClientRect();
  const cs = e => getComputedStyle(e);
  const vid = e => { const r = R(e); if (r.width < 2 || r.height < 2) return false; const s = cs(e); return s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[aria-hidden="true"], [inert], .sr-only'); };
  const text = e => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const natreny = e => { const s = cs(e); return (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') || parseFloat(s.borderTopWidth) > 0 && s.borderTopColor !== 'rgba(0, 0, 0, 0)'; };
  // MonthNav (div role=group se šedou dráhou) je jedno ovládání — jeho šipky jsou díly dráhy jako položky segmentu.
  const SEL = 'button, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]), [role=tablist], div[role=group].glass, a.btn';
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
    // Přepínač (role=switch) je ovládání ŘÁDKU nastavení, ne díl řady ovládání (DESIGN „Přepínač").
    const ovl = [...k.querySelectorAll(SEL)].filter(e => vid(e) && e.getAttribute('role') !== 'switch' && e.closest('.card, .glass-card, .modal-sheet') === k
      && !e.closest('.list-row, li.list-row, .w-hlavicka, [role=menu], details, summary')
      && !(e.parentElement && e.parentElement.closest('[role=tablist], div[role=group].glass')))
      .filter(e => !e.closest('label') || e.tagName !== 'INPUT' || cs(e).opacity !== '0');
    // Dlaždice mřížky o 5+ sloupcích (dny kalendáře, 42 × 42) nejsou ovládání v řadě — mají svou mřížku.
    const dlazdice = e => { const r = e.parentElement; if (!r) return false; const g = cs(r); return g.display === 'grid' && g.gridTemplateColumns.split(' ').length >= 5; };
    const prvky = ovl.filter(e => !dlazdice(e)).map(e => ({ e, r: R(e), cip: e.classList.contains('chip') || e.classList.contains('filter-pill'), ikona: R(e).width <= 46 && R(e).height <= 46, natreny: natreny(e) || /^(SELECT|INPUT)$/.test(e.tagName) || /^(tablist|group)$/.test(e.getAttribute('role') || '') }));
    // V témže řádku = svislé středy do 6 px (šipky MonthNav 36 v dráze 44 mají top o 4 px níž než „Filtry" 44,
    // ale stojí v jedné řadě — dřív falešně „osamělé").
    const vRadku = (a, b) => Math.abs((a.r.top + a.r.bottom) / 2 - (b.r.top + b.r.bottom) / 2) <= 6;
    // Vnořená jamka (well, info box s odsazením) je vlastní kontejner: R jejího obsahu, ne karty.
    const hranaR = e => {
      for (let a = e.parentElement; a && a !== k; a = a.parentElement) {
        const sa = cs(a);
        if (natreny(a) && parseFloat(sa.paddingRight) >= 8 && R(a).width < rk.width - 8 && !/^(BUTTON|SELECT|INPUT)$/.test(a.tagName) && a.getAttribute('role') !== 'tablist')
          return R(a).right - parseFloat(sa.borderRightWidth) - parseFloat(sa.paddingRight);
      }
      return Rr;
    };
    // Buňka formulářové mřížky (2+ sloupce přes půl karty): ovládání přes šířku svého sloupce je díl řady (P2).
    const bunka = x => {
      for (let a = x.e.parentElement; a && a !== k; a = a.parentElement) {
        const g = cs(a);
        if (g.display !== 'grid') continue;
        const sl = g.gridTemplateColumns.split(' ').length;
        if (sl >= 2 && R(a).width >= sirkaObsahu * 0.5 && x.r.width >= (R(a).width / sl) * 0.8 - 8) return true;
      }
      return false;
    };
    // 1) hrany
    for (const x of prvky) {
      if (!x.natreny || bunka(x)) continue;
      const Rr = hranaR(x.e);
      const sousede = prvky.filter(y => y !== x && vRadku(x, y));
      if (x.r.width > sirkaObsahu * 0.5) {
        const prava = Math.max(x.r.right, ...sousede.map(y => y.r.right));
        if (Math.abs(prava - Rr) > 1.5 && x.r.right < Rr - 1.5 && !(prava > Rr)) nalezy.push({ pravidlo: '1 hrana', kde, co: `${text(x.e)} končí ${Math.round(x.r.right - rk.left)} ≠ R ${Math.round(Rr - rk.left)}` });
      } else if (!x.ikona && !sousede.length && !x.cip && x.e.tagName !== 'A') {
        const vlevo = x.r.left - L, vpravo = Rr - x.r.right;
        const naStred = vlevo > 24 && Math.abs(vlevo - vpravo) < 10;
        // Výjimka P2 a): akce na R v řádku s titulem / popiskem / větou vlevo (titul karty, štítek pole, info box).
        const sTitulem = Math.abs(vpravo) <= 1.5 && [...k.querySelectorAll('h2, h3, p, .t-card, .t-section, .field-label')].some(h => { const rh = R(h); const c = (rh.top + rh.bottom) / 2; return vid(h) && !h.contains(x.e) && c >= x.r.top - 2 && c <= x.r.bottom + 2 && rh.right <= x.r.left + 1; });
        if (sTitulem) x.vedleTextu = true;
        if (!naStred && !sTitulem) nalezy.push({ pravidlo: '1 osamělé', kde, co: `${text(x.e)} ${Math.round(x.r.width)} px sám na řádku` });
      }
    }
    // 1b) řada (2+ natřených ovládání v jednom řádku, ne čipy) začíná na L, ale nekončí na R — „Sestavit rozvrh"
    //     + „Připomenout" vlevo a půl karty prázdné (P2: řada jako celek vyplní L→R).
    const videne = new Set();
    for (const x of prvky) {
      if (!x.natreny || x.cip || videne.has(x)) continue;
      const rada = prvky.filter(y => y.natreny && !y.cip && vRadku(x, y));
      if (rada.length < 2) continue;
      rada.forEach(y => videne.add(y));
      if (rada.some(y => bunka(y))) continue;
      const Rr = hranaR(x.e);
      const levy = Math.min(...rada.map(y => y.r.left)), pravy = Math.max(...rada.map(y => y.r.right));
      // za řadou v témže řádku nic dalšího (text, nenatřený odkaz)?
      const dal = [...k.querySelectorAll('p, span, a, button, h2, h3')].some(h => { if (rada.some(y => y.e === h || y.e.contains(h) || h.contains(y.e))) return false; const rh = R(h); const c = (rh.top + rh.bottom) / 2; return vid(h) && rh.left >= pravy - 1 && c >= x.r.top && c <= x.r.bottom; });
      if (Math.abs(levy - L) <= 1.5 && pravy < Rr - 1.5 && !dal) nalezy.push({ pravidlo: '1 řada', kde, co: `${rada.map(y => text(y.e)).join(' + ')} končí ${Math.round(pravy - rk.left)} ≠ R ${Math.round(Rr - rk.left)}` });
    }
    // 2) výšky
    const POVOLENE = [28, 36, 40, 44, 52];
    for (const x of prvky) {
      // Výška se hlídá u ovládání (tlačítko, pole, pilulka) — ne u dlaždic a klikacích řádků (den v kalendáři 84, řádek 56–72).
      if (!x.natreny || x.r.height > 53 || x.e.classList.contains('list-row')) continue;
      const h = x.r.height;
      if (!POVOLENE.some(v => Math.abs(v - h) <= 1)) nalezy.push({ pravidlo: '2 stupeň', kde, co: `${text(x.e)} výška ${Math.round(h)}` });
      const sousede = prvky.filter(y => y !== x && y.natreny && vRadku(x, y) && Math.abs(y.r.height - h) > 1);
      if (sousede.length && prvky.indexOf(x) < prvky.indexOf(sousede[0])) nalezy.push({ pravidlo: '2 řada', kde, co: `${text(x.e)} ${Math.round(h)} vedle ${text(sousede[0].e)} ${Math.round(sousede[0].r.height)}` });
    }
    // 3) šířky
    // Čipy (filtr, stav) jsou jedna „obsahová" šířka (P3), ať jich je v pásu kolik chce. Dlouhý formulář
    // v jedné kartě (průvodce uzávěrky) má oddíly (<section> oddělený linkou) — šířky se počítají po oddílech.
    const oddily = new Map();
    for (const x of prvky) {
      if (!x.natreny || x.ikona) continue;
      const o = x.e.closest('section'); const klic = o && k.contains(o) && o !== k ? o : k;
      if (!oddily.has(klic)) oddily.set(klic, { sirky: [], cipy: false });
      const g = oddily.get(klic);
      // P3 počítá TŘÍDY šířek: plná, díl řady (prvek se sousedem v řádku nebo v buňce formulářové mřížky),
      // obsahová (čip; akce u R vedle textu) — a každou další vlastní šířku zvlášť.
      if (x.cip || x.vedleTextu) { g.cipy = true; continue; }
      if (prvky.some(y => y !== x && vRadku(x, y)) || bunka(x)) { g.dil = true; continue; }
      if (x.r.width >= sirkaObsahu * 0.9) { g.plna = true; continue; }
      if (!g.sirky.some(w => Math.abs(w - x.r.width) <= 2)) g.sirky.push(x.r.width);
    }
    for (const g of oddily.values()) {
      const sirky = [...(g.plna ? ['plná'] : []), ...(g.dil ? ['díl'] : []), ...(g.cipy ? ['obsahová'] : []), ...g.sirky.map(Math.round)];
      if (sirky.length > 3) nalezy.push({ pravidlo: '3 šířky', kde, co: `${sirky.length} šířek: ${sirky.join(' / ')}` });
    }
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
  // 7) dvojice malých karet vedle sebe (P14, V9): první číslo (.stat-hodnota) na stejné y (± 2)
  const male = [...document.querySelectorAll('[data-plocha] li[data-widget]')].map(li => li.querySelector('section.w-karta-s')).filter(sec => sec && vid(sec));
  for (const a of male) for (const b of male) {
    if (a === b || R(a).left >= R(b).left || Math.abs(R(a).top - R(b).top) > 2) continue;
    const ca = a.querySelector('.stat-hodnota'), cb = b.querySelector('.stat-hodnota');
    if (!ca || !cb || !vid(ca) || !vid(cb)) continue;
    const d = Math.abs(R(ca).top - R(cb).top);
    if (d > 2) nalezy.push({ pravidlo: '7 dvojice', kde: `${titulekKarty(a)} × ${titulekKarty(b)}`, co: `čísla o ${Math.round(d)} px vedle sebe` });
  }
  // 8) nic nepřetéká obrazovku
  const pres = document.documentElement.scrollWidth - innerWidth;
  if (pres > 0) nalezy.push({ pravidlo: '8 přetečení', kde: 'obrazovka', co: `${pres} px` });
  // 6) „···" jednou
  const tecky = [...document.querySelectorAll('button[aria-label="Další akce"], button[aria-label="Další možnosti"]')].filter(vid);
  if (tecky.length > 1) nalezy.push({ pravidlo: '6 ···', kde: 'obrazovka', co: `${tecky.length}× „···"` });
  return nalezy;
}, sirka);

const browser = await chromium.launch({ executablePath: CHROMIUM });
const souhrn = {};
let celkem = 0;
// Čtyři běhy (motiv × šířka) souběžně, každý ve svém kontextu; výpis se drží po bězích.
async function beh(tema, sirka) {
  const radky = [];
  const mobil = sirka < 600;
  const ctx = await browser.newContext({ viewport: { width: sirka, height: mobil ? 844 : 900 }, isMobile: mobil, hasTouch: mobil, locale: 'cs-CZ', reducedMotion: 'reduce' });
  // Ukázka sama vynucuje světlý režim — tmavý se drží atributem (jako detektor a sonda dark).
  if (tema === 'dark') await ctx.addInitScript(() => {
    const v = () => { if (document.documentElement && document.documentElement.getAttribute('data-theme') !== 'dark') document.documentElement.setAttribute('data-theme', 'dark'); };
    setInterval(v, 50); document.addEventListener('DOMContentLoaded', v);
  });
  const p = await ctx.newPage();
  let role0 = null;
  for (const o of OBRAZOVKY) {
    if (o.jenTelefon && !mobil) continue;
    const jmeno = `${o.role}/${o.adresa ?? o.pohled}${o.arg ? '|' + o.arg : ''} · ${sirka} · ${tema}`;
    try {
      if (o.adresa) { await p.goto(BASE + o.adresa, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(o.role === 'host' ? 4000 : 6000); role0 = null; }
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
      radky.push(`${n.length ? '✗' : '✓'} ${jmeno}: ${n.length ? Object.entries(po).map(([k, v]) => `${k} ${v}`).join(', ') : 'čisto'}`);
      for (const x of n.slice(0, PODROBNE ? 99 : 4)) radky.push(`    ${x.pravidlo} · ${x.kde} · ${x.co}`);
    } catch (e) { radky.push(`✗ ${jmeno}: nedoměřeno (${String(e).slice(0, 100)})`); celkem++; }
  }
  await ctx.close();
  console.log(radky.join('\n'));
}
await Promise.all(TEMATA.flatMap(tema => SIRKY.map(sirka => beh(tema, sirka))));
await browser.close();
console.log(`\nSkladba: ${celkem} nálezů — ${Object.entries(souhrn).map(([k, v]) => `${k} ${v}`).join(', ') || 'žádné'}`);
process.exit(celkem ? 1 : 0);
