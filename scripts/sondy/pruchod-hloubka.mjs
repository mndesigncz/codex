// Průzkum do hloubky: záložky, okna, listy a formuláře uvnitř obrazovek (vodorovný scroll a drobnosti vzhledu).
//
// Není to sonda ze seznamu ZELENE (běží desítky minut a hlásí seznam k posouzení, ne ano/ne). Doplňuje
// pruchod.mjs, který měří jen stav po načtení. Tady se u každé obrazovky navíc:
//   • projdou vnitřní záložky (role=tab, Segmented),
//   • otevřou primární akce („Nový…", „Přidat", „Upravit", „Pozvat"…) a kebab menu / list „Více",
//   • v otevřeném okně se do textových polí vepíše dlouhý nezalomitelný řetězec,
//   • změří se každý takový stav na každé šířce.
// V každém stavu se hlásí:
//   dok     — scrollWidth dokumentu > šířka okna
//   pravy   — viditelný prvek vyčnívá za okno (a není v ohraničeném scrolleru)
//   orez    — text oříznutý přes overflow:hidden bez ellipsis
//   maly    — dotykový prvek pod 44×44 px
//   kryti   — prvek, na který nejde klepnout, protože ho něco zakrývá
//   prekryv — dva texty přes sebe
//
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/pruchod-hloubka.mjs [vystup.json]
//   PH_JAZYKY=cs,de,pl  PH_SIRKY=320,360,390,768  PH_MOTIVY=svetly,tmavy  PH_OBRAZOVKY=settings,/login  (zúžení)
//   PH_MAX_STAVU=16     (strop stavů na obrazovku a šířku)
//   node scripts/sondy/pruchod-hloubka.mjs --spoj a.json b.json …   (sloučí výstupy souběžných běhů do tabulky)
import { writeFileSync, readFileSync } from 'node:fs';
import { kontext, BASE, browser } from './k68-spolecne.mjs';

const filtr = (env, vse) => (process.env[env] ? process.env[env].split(',') : vse);

// ───────────────────────── sloučení výstupů ─────────────────────────
if (process.argv[2] === '--spoj') {
  const skupiny = new Map();
  let stavu = 0;
  const nacteni = new Set();
  for (const f of process.argv.slice(3)) {
    const d = JSON.parse(readFileSync(f, 'utf8'));
    stavu += d.stavu;
    for (const n of d.nalezy) {
      if (n.druh === 'maly36' && !process.env.PH_MALY) continue; // vědomé rozhodnutí (.tap-target-sm), jen s PH_MALY=1
      // u malých prvků rozhoduje třída, ne popisek (stejné tlačítko se opakuje v každém řádku)
      if (n.druh === 'maly' || n.druh === 'maly36') n.podpis = n.podpis.replace(/ „.*$/, '');
      const k = `${n.druh}\t${n.podpis}`;
      const s = skupiny.get(k) ?? { druh: n.druh, podpis: n.podpis, kde: new Map() };
      const kd = `${n.obrazovka} · ${n.stav}`;
      const v = s.kde.get(kd) ?? new Set();
      v.add(`${n.sirka}/${n.jazyk}/${n.motiv}${n.detail ? ' ' + n.detail : ''}`);
      s.kde.set(kd, v);
      skupiny.set(k, s);
    }
  }
  const seznam = [...skupiny.values()].sort((a, b) => a.druh.localeCompare(b.druh) || b.kde.size - a.kde.size);
  const hustota = seznam.filter(s => s.druh === 'maly');
  for (const s of seznam.filter(x => x.druh !== 'maly')) {
    console.log(`\n[${s.druh}] ${s.podpis}  (${s.kde.size}× obrazovka·stav)`);
    for (const [kd, v] of [...s.kde].slice(0, 4)) console.log(`   ${kd}: ${[...v].slice(0, 5).join(', ')}`);
  }
  console.log(`\n[maly] dotykové prvky pod 36 px (nejčastější; ${hustota.length} různých)`);
  for (const s of hustota.slice(0, 25)) { const [kd, v] = [...s.kde][0]; console.log(`   ${s.podpis}  ${s.kde.size}× · ${kd} ${[...v][0]}`); }
  console.log(`\nProjitých stavů celkem: ${stavu}; různých nálezů: ${seznam.length}`);
  process.exit(0);
}

// ───────────────────────── měření v prohlížeči ─────────────────────────
// Funkce se serializuje do stránky, proto je soběstačná.
function mereni({ dialogOtevren, faze }) {
  const vw = window.innerWidth;
  const out = { dok: document.documentElement.scrollWidth - vw, pravy: [], orez: [], maly: [], kryti: [], prekryv: [] };
  const popis = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    const c = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
    return `${el.tagName.toLowerCase()}${c ? '.' + c : ''}${t ? ` „${t}"` : ''}`;
  };
  const viditelny = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      if (a.hasAttribute('inert') || a.getAttribute('aria-hidden') === 'true' || a.hasAttribute('hidden')) return false;
      if (a !== el && getComputedStyle(a).opacity === '0') return false;
      // obsah zavřeného <details> (mimo <summary>) se nekreslí, i když mu prohlížeč ponechá rozměry
      if (a.tagName === 'DETAILS' && !a.open) { const sm = a.querySelector(':scope > summary'); if (!sm || !sm.contains(el)) return false; }
    }
    return true;
  };
  const dialog = document.querySelector('[role=dialog],[aria-modal=true]');
  if (faze === 'dno') {
    // dolní okraj obsahu: poslední prvky musí být vidět nad plovoucí lištou, ne pod ní
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (/auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 20 && el.clientHeight > innerHeight * 0.4) el.scrollTop = el.scrollHeight;
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  }
  const koren = dialogOtevren && dialog ? dialog : document.body;
  const dno = faze === 'dno';
  const vse = [...koren.querySelectorAll('*')].filter(el => !['SCRIPT', 'STYLE', 'PATH', 'SVG', 'g', 'circle', 'rect', 'line', 'polyline', 'use'].includes(el.tagName));
  const viditelne = vse.filter(viditelny);

  // pravy: vyčnívá za okno a žádný předek ho neořízne uvnitř okna
  const pravy = new Set();
  for (const el of dno ? [] : viditelne) {
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 && r.left >= -1) continue;
    let orezano = false;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (a === document.body) break;
      const s = getComputedStyle(a);
      if (s.overflowX !== 'visible') {
        const ra = a.getBoundingClientRect();
        if (ra.right <= vw + 1 && ra.left >= -1) { orezano = true; break; }
      }
    }
    // prvek v pozadí (blob, stín) bývá position:absolute bez textu a úmyslně vyčnívá
    if (!orezano) pravy.add(el);
  }
  for (const el of pravy) {
    let p = el.parentElement, dite = false;
    while (p) { if (pravy.has(p)) { dite = true; break; } p = p.parentElement; }
    if (dite) continue;
    const r = el.getBoundingClientRect();
    out.pravy.push(`${popis(el)} [${Math.round(r.left)}…${Math.round(r.right)}]`);
  }

  // orez: overflow hidden, uvnitř text, který z prvku vyčnívá, a není ellipsis ani line-clamp
  for (const el of dno ? [] : viditelne) {
    const s = getComputedStyle(el);
    if (!/hidden|clip/.test(s.overflowX) || el.scrollWidth <= el.clientWidth + 1) continue;
    if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') continue;
    if (el.classList.contains('sr-only')) continue;
    // běžící pás (marquee) přesahuje úmyslně
    if ([el, ...el.querySelectorAll('*')].slice(0, 60).some(x => { const an = getComputedStyle(x).animationName; return an && an !== 'none'; })) continue;
    const r = el.getBoundingClientRect();
    let ven = null;
    for (const d of el.querySelectorAll('*')) {
      const dr = d.getBoundingClientRect();
      if (dr.width < 2 || (dr.right <= r.right + 1 && dr.left >= r.left - 1)) continue;
      const vlastni = [...d.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (vlastni && viditelny(d)) { ven = d; break; }
    }
    if (!ven && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) ven = el;
    if (ven) out.orez.push(`${popis(el)} ⊃ „${(ven.textContent || '').trim().slice(0, 24)}"`);
  }

  // maly: dotykové prvky pod 44 px (inline odkaz v textu je výjimka WCAG)
  const SEL = 'a[href],button,[role=button],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=radio],select,textarea,summary,input:not([type=hidden])';
  const cile = [...koren.querySelectorAll(SEL)].filter(viditelny);
  for (const el of dno ? [] : cile) {
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) continue;
    // dotyková plocha může být větší než prvek: .tap-target(-sm) ji roztahuje pseudo-prvkem ::before
    const pb = getComputedStyle(el, '::before');
    const bw = pb.position === 'absolute' ? parseFloat(pb.width) || 0 : 0, bh = pb.position === 'absolute' ? parseFloat(pb.height) || 0 : 0;
    // roztažený odkaz (`after:absolute after:inset-0`): klepnout jde na celou kartu, ne jen na text
    const pa = getComputedStyle(el, '::after');
    const aw = pa.position === 'absolute' && pa.content !== 'none' ? parseFloat(pa.width) || 0 : 0, ah = pa.position === 'absolute' && pa.content !== 'none' ? parseFloat(pa.height) || 0 : 0;
    const ew = Math.max(r.width, bw, aw), eh = Math.max(r.height, bh, ah);
    if (ew >= 43.5 && eh >= 43.5) continue;
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
    const lab = el.closest('label');
    if (lab) { const lr = lab.getBoundingClientRect(); if (lr.width >= 43.5 && lr.height >= 43.5) continue; }
    if (el.closest('.sr-only')) continue;
    out.maly.push(`${popis(el)} ${Math.round(ew)}×${Math.round(eh)}`);
  }

  // kryti: střed prvku zakrývá jiný prvek, který s ním nesouvisí (v okně jen to, co je v dialogu)
  for (const el of dno ? cile : []) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > vw || y > innerHeight) continue;
    const nahore = document.elementFromPoint(x, y);
    if (!nahore || nahore === el || el.contains(nahore) || nahore.contains(el)) continue;
    // střed musí ležet i v rámečku každého ořezávajícího předka (jinak je prvek v posuvném bloku mimo záběr)
    let vZaberu = true;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflowY === 'visible' && getComputedStyle(a).overflowX === 'visible') continue;
      const ra = a.getBoundingClientRect();
      if (x < ra.left || x > ra.right || y < ra.top || y > ra.bottom) { vZaberu = false; break; }
    }
    if (!vZaberu) continue;
    // překrytí pod horní hlavičkou je obsah odrolovaný nahoru; vada je až překrytí při dolním okraji
    const rn = nahore.getBoundingClientRect();
    if (rn.top < innerHeight * 0.45) continue;
    if (dialogOtevren && dialog && !dialog.contains(el)) continue;
    // štítek patřící k poli, ikona uvnitř odkazu a podobně
    if (el.closest('label') === nahore.closest('label') && el.closest('label')) continue;
    out.kryti.push(`${popis(el)} ← ${popis(nahore)}`);
  }

  // prekryv: dva textové řádky z různých prvků, které leží přes sebe. Počítá se po řádcích (ne rámeček celého
  // odstavce), řádek se ořízne rámem prvku (text s ellipsis přesahuje neviditelně) a oba musí být nahoře.
  const radky = [];
  for (const el of dno ? [] : viditelne) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
    const rg = document.createRange(); rg.selectNodeContents(el);
    const er = el.getBoundingClientRect();
    for (const q of rg.getClientRects()) {
      const l = Math.max(q.left, er.left), r = Math.min(q.right, er.right), t = Math.max(q.top, er.top), bt = Math.min(q.bottom, er.bottom);
      if (r - l < 4 || bt - t < 4) continue;
      const x = (l + r) / 2, y = (t + bt) / 2;
      if (x < 0 || y < 0 || x > vw || y > innerHeight) continue;
      const nahore = document.elementFromPoint(x, y);
      if (!nahore || !(el.contains(nahore) || nahore.contains(el))) continue;
      radky.push({ el, l, r, t, b: bt });
    }
    if (radky.length > 1500) break;
  }
  const videnoDvojice = new Set();
  for (let i = 0; i < radky.length; i++) {
    for (let j = i + 1; j < radky.length; j++) {
      const a = radky[i], c = radky[j];
      if (a.el === c.el || a.el.contains(c.el) || c.el.contains(a.el)) continue;
      // otevřená nabídka / okno leží přes obsah úmyslně
      if (a.el.closest('[role=menu],[role=listbox],[role=dialog],[aria-modal=true]') !== c.el.closest('[role=menu],[role=listbox],[role=dialog],[aria-modal=true]')) continue;
      const w = Math.min(a.r, c.r) - Math.max(a.l, c.l);
      const h = Math.min(a.b, c.b) - Math.max(a.t, c.t);
      if (w <= 2 || h <= 2) continue;
      const mensi = Math.min((a.r - a.l) * (a.b - a.t), (c.r - c.l) * (c.b - c.t));
      if (w * h < mensi * 0.3) continue;
      const k = popis(a.el) + ' × ' + popis(c.el);
      if (!videnoDvojice.has(k)) { videnoDvojice.add(k); out.prekryv.push(k); }
    }
  }
  return out;
}


// ───────────────────────── obrazovky ─────────────────────────
const POHLEDY_VEDENI = ['overview', 'shifts', 'inventory', 'recipes', 'procedures', 'tasks', 'chat', 'guides', 'planning', 'reports', 'finance',
  'suggestions', 'attendance', 'my-shifts', 'rewards', 'settings', 'team-settings', 'org', 'events', 'menu', 'announcements', 'settings&tab=billing'];
const POHLEDY_ZAM = ['home', 'my-shifts', 'procedures', 'availability', 'inventory', 'closing', 'tasks', 'rewards', 'chat', 'guides', 'suggestions', 'settings'];
const OBRAZOVKY = [
  ...POHLEDY_VEDENI.map(v => ({ id: `employer/${v}`, role: 'employer', url: `/employer/overview?view=${v}` })),
  { id: 'employer/team', role: 'employer', url: '/employer/team' },
  { id: 'employer/start', role: 'employer', url: '/employer/start' },
  ...POHLEDY_ZAM.map(v => ({ id: `employee/${v}`, role: 'employee', url: `/employee/shifts?view=${v}` })),
  { id: 'client/home', role: 'customer', url: '/client' },
  { id: 'client/podnik', role: 'customer', url: '/client/kavarna-u-lipy' },
  { id: 'client/me', role: 'customer', url: '/client/me' },
  ...['/client/login', '/client/register', '/client/zapomenute-heslo', '/login', '/register', '/zapomenute-heslo', '/join', '/', '/demo',
    '/podpora', '/soukromi', '/podminky', '/pozastaveno', '/smazat-ucet'].map(u => ({ id: `verejne${u}`, role: null, url: u })),
  { id: 'kiosk', role: 'kiosk', url: '/kiosk', tablet: true },
];

const JAZYKY = filtr('PH_JAZYKY', ['cs', 'de', 'pl']);
const SIRKY = filtr('PH_SIRKY', ['320', '360', '390', '768']).map(Number);
const MOTIVY = filtr('PH_MOTIVY', ['svetly', 'tmavy']);
const VYBRANE = process.env.PH_OBRAZOVKY ? process.env.PH_OBRAZOVKY.split(',') : null;
const MAX_STAVU = Number(process.env.PH_MAX_STAVU ?? 16);
const VYSTUP = process.argv[2] ?? 'pruchod-hloubka.json';

const OTEVIRAC = /^(\+|nov|přidat|upravit|pozvat|vytvořit|zadat|založit|new|add|edit|invite|create|neu|hinzu|bearbeit|einlad|erstell|dodaj|edytuj|zaproś|utwórz|pridať|upraviť|pozvať|vytvoriť)/i;
const MENU = /(více|další|akce|možnosti|more|actions|options|mehr|weitere|aktionen|optionen|więcej|akcje|opcje|viac)/i;
const NICENI = /(smazat|odstranit|zrušit účet|odhlásit|delete|remove|sign out|log out|löschen|entfernen|abmelden|usuń|wyloguj|odhlásiť)/i;
const ZAVRIT = /(zavřít|close|schließen|zamknij|zavrieť)/i;
const ZAHODIT = /(zahodit|discard|verwerfen|odrzuć|zahodiť)/i;
const DLOUHY = 'Nezalomitelny_retezec_'.repeat(5);

const nalezy = [];
let stavu = 0;

for (const jazyk of JAZYKY) for (const motiv of MOTIVY) {
  const tmavy = motiv === 'tmavy';
  const cil = OBRAZOVKY.filter(o => !VYBRANE || VYBRANE.includes(o.id) || VYBRANE.includes(o.url));
  const poRole = new Map();
  for (const o of cil) { const k = o.role ?? '-'; poRole.set(k, [...(poRole.get(k) ?? []), o]); }
  for (const [role, obrazovky] of poRole) {
    const tablet = obrazovky.some(o => o.tablet);
    const sirky = tablet ? [[1180, 820], [820, 1180]] : [...SIRKY, ...(role === '-' && !process.env.PH_SIRKY ? [834, 1024] : [])].map(w => [w, w <= 390 ? 800 : 1000]);
    const { ctx, p, chyby } = await kontext({ viewport: { width: sirky[0][0], height: sirky[0][1] }, role: role === '-' ? 'employer' : role, mobil: true, tmavy });
    if (role === '-') await ctx.clearCookies();
    await ctx.addCookies([{ name: 'managero-lang', value: jazyk, domain: new URL(BASE).hostname, path: '/', sameSite: 'Lax' }]);
    // PH_DATA=mezery|retezec: odpovědi API se v prohlížeči protáhnou (jména, názvy, popisky, poznámky dostanou dlouhý
    // dodatek). Tak se ukáže, co dělá s rozvržením to, co do aplikace napíše člověk: „Kavárna U Zlatého orla a Tří
    // králů Praha-Vinohrady" nebo celý řádek bez mezer. Fixtury se tím nemění, jen to, co dostane stránka.
    if (process.env.PH_DATA) await ctx.addInitScript((rezim) => {
      const KLIC = /(name|title|label|text|note|description|desc|email|jobtitle|supplier|category|address|subtitle|message|popis|nazev)/i;
      const dodatek = rezim === 'retezec' ? '_Nezalomitelny_retezec_bez_mezer_a_pomlcek_dlouhy' : ' a jeste hodne dlouhy dodatek, ktery se musi zalomit nebo zkratit';
      const protahni = (v, k) => {
        if (Array.isArray(v)) return v.map(x => protahni(x, k));
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, protahni(x, kk)]));
        if (typeof v === 'string' && k && KLIC.test(k) && v.length >= 3 && v.length <= 80 && /\p{L}{3}/u.test(v) && !/^(https?:|\/|#)/.test(v)) return v + dodatek;
        return v;
      };
      const puvodni = window.fetch.bind(window);
      window.fetch = async (...a) => {
        const r = await puvodni(...a);
        try {
          const url = String(typeof a[0] === 'string' ? a[0] : a[0].url);
          if (!url.includes('/api/') || url.includes('/api/auth/') || !(r.headers.get('content-type') || '').includes('json')) return r;
          const j = await r.clone().json();
          return new Response(JSON.stringify(protahni(j, '')), { status: r.status, statusText: r.statusText, headers: r.headers });
        } catch { return r; }
      };
    }, process.env.PH_DATA);
    for (const o of obrazovky) {
      for (const [w, h] of sirky) {
        let pocet = 0;
        const zaznam = async (stav, dialogOtevren = false, bezDna = false) => {
          pocet++; stavu++;
          let m;
          try {
            m = await p.evaluate(mereni, { dialogOtevren, faze: 'vrch' });
            if (!dialogOtevren && !bezDna) {
              const dno = await p.evaluate(mereni, { dialogOtevren, faze: 'dno' });
              m.kryti = dno.kryti;
              await p.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollTop) e.scrollTop = 0; window.scrollTo(0, 0); });
            }
          } catch (e) { nalezy.push({ druh: 'vyjimka', podpis: String(e).slice(0, 80), obrazovka: o.id, stav, sirka: w, jazyk, motiv }); return; }
          const pridej = (druh, podpis, detail = '') => nalezy.push({ druh, podpis, detail, obrazovka: o.id, stav, sirka: w + (tablet ? `×${h}` : ''), jazyk, motiv });
          if (m.dok > 1) pridej('dok', 'dokument přetéká', `${m.dok}px`);
          for (const x of m.pravy) pridej('pravy', x);
          for (const x of m.orez) pridej('orez', x);
          for (const x of m.maly) {
            const [ww, hh] = x.match(/(\d+)×(\d+)$/).slice(1).map(Number);
            // 36 px je vědomé rozhodnutí hustých seznamů (.tap-target-sm); pod to je vada
            pridej(Math.min(ww, hh) < 36 ? 'maly' : 'maly36', x.replace(/ \d+×\d+$/, ''), `${ww}×${hh}`);
          }
          for (const x of m.kryti) pridej('kryti', x);
          for (const x of m.prekryv) pridej('prekryv', x);
        };
        const dialogJe = () => p.locator('[role=dialog]:visible,[aria-modal=true]:visible').count().then(n => n > 0);
        const zavriDialog = async () => {
          for (let i = 0; i < 3 && await dialogJe(); i++) {
            await p.keyboard.press('Escape'); await p.waitForTimeout(250);
            if (!await dialogJe()) break;
            const zahodit = p.getByRole('button', { name: ZAHODIT }).first();
            if (await zahodit.isVisible().catch(() => false)) { await zahodit.click({ timeout: 1000 }).catch(() => {}); await p.waitForTimeout(250); continue; }
            const kriz = p.locator('[role=dialog]:visible [aria-label],[aria-modal=true]:visible [aria-label]').filter({ hasText: '' });
            const n = await kriz.count();
            for (let k = 0; k < n; k++) {
              const lab = await kriz.nth(k).getAttribute('aria-label');
              if (ZAVRIT.test(lab || '')) { await kriz.nth(k).click({ timeout: 1000 }).catch(() => {}); await p.waitForTimeout(250); break; }
            }
          }
          return !await dialogJe();
        };
        const znovu = async () => {
          await p.goto(BASE + o.url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
          await p.waitForTimeout(900);
        };
        try {
          chyby.length = 0;
          await p.setViewportSize({ width: w, height: h });
          await znovu();
          await zaznam('po načtení');
          if (process.env.PH_LADENI) console.log(`   ${o.id} ${w}px: ${await p.evaluate(() => (document.body.innerText.match(/Nezalomitelny|jeste hodne dlouhy/g) || []).length)}× dlouhý text v dokumentu`);

          // 1) záložky
          const popisky = await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].filter(e => e.getBoundingClientRect().width > 0).map(e => (e.textContent || '').trim().slice(0, 24)));
          const videne = new Set();
          let tabu = 0;
          for (let i = 0; i < popisky.length && tabu < 10 && pocet < MAX_STAVU; i++) {
            if (videne.has(popisky[i])) continue; videne.add(popisky[i]);
            const tab = p.locator('[role=tab]:visible').nth(i);
            const url0 = p.url();
            await tab.click({ timeout: 1500 }).catch(() => {});
            await p.waitForTimeout(350);
            if (p.url().split('#')[0] !== url0.split('#')[0] && !p.url().startsWith(url0.split('?')[0] + '?')) { await znovu(); continue; }
            tabu++;
            await zaznam(`záložka „${popisky[i]}"`);
          }

          // 1b) kiosk: navigace je řada tlačítek v <nav>, ne role=tab; každé se klepne a změří
          if (o.tablet) {
            const nazvy = await p.evaluate(() => [...document.querySelectorAll('main nav button, nav button')].filter(e => e.getBoundingClientRect().width > 0).map(e => (e.textContent || '').trim().slice(0, 24)));
            for (const n of [...new Set(nazvy)].slice(0, 8)) {
              if (!n) continue;
              await p.locator('nav button:visible').filter({ hasText: n }).first().click({ timeout: 1500 }).catch(() => {});
              await p.waitForTimeout(400);
              await zaznam(`navigace „${n}"`);
            }
            await znovu();
          }

          // 2) primární akce, které otevírají okno, list nebo formulář
          if (pocet < MAX_STAVU) {
            await znovu();
            const kandidati = await p.evaluate(({ otev, menu, nic }) => {
              const O = new RegExp(otev, 'i'), M = new RegExp(menu, 'i'), N = new RegExp(nic, 'i');
              const res = []; const videno = new Set();
              let i = 0;
              for (const el of document.querySelectorAll('button:not([disabled]),[role=button]:not([disabled])')) {
                const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
                if (el.closest('[role=tab],[role=tablist]')) continue;
                const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
                const lab = el.getAttribute('aria-label') || '';
                const nazev = t || lab;
                if (!nazev || N.test(nazev) || videno.has(nazev)) continue;
                const druh = O.test(nazev) ? 'akce' : (M.test(lab || nazev) || el.getAttribute('aria-haspopup') === 'menu') ? 'menu' : null;
                if (!druh) continue;
                videno.add(nazev);
                el.setAttribute('data-ph', String(i)); res.push({ i, nazev: nazev.slice(0, 28), druh }); i++;
              }
              return res;
            }, { otev: OTEVIRAC.source, menu: MENU.source, nic: NICENI.source });
            const akce = kandidati.filter(k => k.druh === 'akce').slice(0, 6);
            const menu = kandidati.filter(k => k.druh === 'menu').slice(0, 3);
            for (const k of [...akce, ...menu]) {
              if (pocet >= MAX_STAVU) break;
              const url0 = p.url();
              await p.locator(`[data-ph="${k.i}"]`).first().click({ timeout: 1500 }).catch(() => {});
              await p.waitForTimeout(500);
              if (p.url() !== url0) { await znovu(); // akce je odkaz jinam; kandidáty je nutné označit znovu, proto se přeskočí zbytek
                break; }
              const dlg = await dialogJe();
              await zaznam(`${k.druh === 'menu' ? 'menu' : 'akce'} „${k.nazev}"${dlg ? ' (okno)' : ''}`, dlg, k.druh === 'menu');
              if (dlg) {
                // dlouhé texty do polí a znovu změřit
                const vyplneno = await p.evaluate((txt) => {
                  let n = 0;
                  for (const el of document.querySelectorAll('[role=dialog] input[type=text],[role=dialog] input:not([type]),[role=dialog] textarea,[aria-modal=true] input[type=text],[aria-modal=true] textarea')) {
                    const r = el.getBoundingClientRect(); if (r.width < 2 || el.readOnly || el.disabled) continue;
                    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, txt);
                    el.dispatchEvent(new Event('input', { bubbles: true })); n++;
                  }
                  return n;
                }, DLOUHY);
                if (vyplneno && pocet < MAX_STAVU + 4) { await p.waitForTimeout(250); await zaznam(`akce „${k.nazev}" s dlouhými texty`, true); }
                // záložky uvnitř okna
                const vOknu = p.locator('[role=dialog] [role=tab]:visible,[aria-modal=true] [role=tab]:visible');
                const nt = Math.min(await vOknu.count(), 5);
                for (let t = 1; t < nt; t++) { await vOknu.nth(t).click({ timeout: 1000 }).catch(() => {}); await p.waitForTimeout(300); await zaznam(`akce „${k.nazev}" záložka ${t + 1}`, true); }
              }
              if (!await zavriDialog()) { await znovu(); break; }
              await p.keyboard.press('Escape').catch(() => {}); // zavře otevřené menu
              await p.waitForTimeout(150);
            }
          }
        } catch (e) {
          nalezy.push({ druh: 'vyjimka', podpis: String(e).slice(0, 100), obrazovka: o.id, stav: 'běh', sirka: w, jazyk, motiv });
        }
        for (const c of [...new Set(chyby)].slice(0, 2)) nalezy.push({ druh: 'chyba', podpis: c.slice(0, 120), obrazovka: o.id, stav: 'běh', sirka: w, jazyk, motiv });
      }
    }
    await ctx.close();
    console.log(`… ${jazyk} ${motiv} ${role}: hotovo (stavů ${stavu}, nálezů ${nalezy.length})`);
    writeFileSync(VYSTUP, JSON.stringify({ stavu, nalezy }, null, 1));
  }
}
writeFileSync(VYSTUP, JSON.stringify({ stavu, nalezy }, null, 1));
console.log(`\nStavů: ${stavu}, nálezů (s opakováním): ${nalezy.length}`);
await (await browser()).close();
process.exit(0);
