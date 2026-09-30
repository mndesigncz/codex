#!/usr/bin/env node
// Nahrávky ovládání aplikace pro prodejní stránku.
//
// Proč nahrávky z živé ukázky, a ne animace kreslené ručně: video ukazuje
// skutečnou aplikaci (/demo, lib/demo) s jejími skutečnými pravidly, takže
// nemůže slíbit víc, než aplikace umí, a po změně vzhledu se přegeneruje jedním
// příkazem. Stránka je vkládá jako smyčky do sekcí funkcí (components/landing).
//
// Jak to funguje:
//  1. Playwright otevře /demo v okně dané velikosti a nahrává obrazovku
//     (`recordVideo`, vždy VP8 webm, jiný kodek Playwright neumí).
//  2. Do stránky se vloží viditelný kurzor a „ripple" kliku (v záznamu jinak
//     žádný kurzor není, takže by se věci děly samy). Myš se nepřenáší skokem:
//     jede po mírně zakřivené dráze se zrychlením a zpomalením.
//  3. ffmpeg: ořízne načítání před první scénou, převede na 720p bez zvuku,
//     vyrobí mp4 (h264) a webm (vp9) do limitu 1,5 MB na soubor a poster (webp).
//  4. Rozměry a délky zapíše do components/landing/nahravky.generated.ts, aby
//     stránka znala poměr stran dřív, než se video stáhne (bez skoku rozložení).
//
// Použití:
//   NAHRAVKY_BASE=http://localhost:3000 FFMPEG=/cesta/ffmpeg node scripts/nahravky/nahraj.mjs [id ...]
// Běžící `next start` (ne dev: dev je při nahrávání pomalý a s překryvem chyb)
// musí obsluhovat /demo. Nic nejde na skutečný server, /demo odpovídá z paměti.

import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.env.NAHRAVKY_BASE || 'http://localhost:3000').replace(/\/+$/, '');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const KOREN = new URL('../../', import.meta.url).pathname;
const VYSTUP = KOREN + 'public/brand/landing/rec/';
const GENEROVANO = KOREN + 'components/landing/nahravky.generated.ts';
const LIMIT_B = 1.5 * 1024 * 1024;
const FPS = 25;

const ZARIZENI = {
  // Okno, ve kterém aplikace běží, a rozměr videa (výška 720 = „720p").
  laptop: { okno: { width: 1280, height: 720 }, video: { width: 1280, height: 720 } },
  tablet: { okno: { width: 1024, height: 768 }, video: { width: 960, height: 720 } },
  telefon: { okno: { width: 390, height: 780 }, video: { width: 360, height: 720 } },
};

const cekej = (ms) => new Promise(r => setTimeout(r, ms));

// ——— Kurzor a ripple: vkládá se do každé stránky před jejím skriptem ————————
const KURZOR = () => {
  const pripoj = () => {
    if (document.getElementById('__kurzor')) return;
    const st = document.createElement('style');
    st.textContent = `
      #__kurzor{position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;
        transform:translate(-100px,-100px);will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
      #__kurzor svg{display:block;transition:transform 120ms cubic-bezier(.23,1,.32,1)}
      #__kurzor.dole svg{transform:scale(.86)}
      .__ripple{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;
        border-radius:50%;background:rgba(200,245,66,.55);border:2px solid rgba(22,24,26,.55);
        animation:__rip 620ms cubic-bezier(.23,1,.32,1) forwards}
      @keyframes __rip{from{transform:scale(.4);opacity:1}to{transform:scale(3.6);opacity:0}}
      html{scroll-behavior:auto!important}`;
    document.documentElement.appendChild(st);
    const k = document.createElement('div');
    k.id = '__kurzor';
    k.setAttribute('aria-hidden', 'true');
    k.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M5 3l16 9.2-7 1.9-3.6 6.6z" fill="#16181A" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(k);
    const dej = (x, y) => { k.style.transform = `translate(${x}px,${y}px)`; };
    addEventListener('mousemove', e => dej(e.clientX, e.clientY), { capture: true, passive: true });
    addEventListener('mousedown', e => {
      k.classList.add('dole');
      const r = document.createElement('div');
      r.className = '__ripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, { capture: true, passive: true });
    addEventListener('mouseup', () => k.classList.remove('dole'), { capture: true, passive: true });
  };
  if (document.documentElement) pripoj();
  else document.addEventListener('DOMContentLoaded', pripoj, { once: true });
  // React může při hydrataci přepsat obsah <body>; kurzor visí na <html>, ale pojistka je levná.
  new MutationObserver(pripoj).observe(document, { childList: true });
};

const hladce = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Ovládání: myš po zakřivené dráze, kolečko po krocích, kliknutí s prodlevou kvůli ripple. */
function ovladac(p, okno) {
  // Kurzor stojí uvnitř okna od první vteřiny: kolečko se posílá tam, kde je myš,
  // a mimo okno by stránka neposkočila. Skok na výchozí místo proběhne před záznamem scény.
  const nyni = { x: okno.width * 0.7, y: okno.height * 0.72 };
  p.mouse.move(nyni.x, nyni.y).catch(() => {});
  // Čas se měří hodinami, ne počtem kroků: jedno p.mouse.move trvá desítky ms a součet
  // by ze slíbených 900 ms udělal vteřinu a půl. Scénář pak netrvá, co má, a video přeroste.
  const jed = async (cx, cy, ms = 850) => {
    const dx = cx - nyni.x, dy = cy - nyni.y;
    const d = Math.hypot(dx, dy) || 1;
    // Kolmý posun ovládacího bodu: dráha je mírný oblouk jako u ruky, ne přímka po pravítku.
    const ox = (-dy / d) * Math.min(60, d * 0.09), oy = (dx / d) * Math.min(60, d * 0.09);
    const c = { x: nyni.x + dx / 2 + ox, y: nyni.y + dy / 2 + oy };
    const z = { ...nyni };
    const start = Date.now();
    for (;;) {
      const u = Math.min(1, (Date.now() - start) / ms);
      const t = hladce(u);
      await p.mouse.move((1 - t) * (1 - t) * z.x + 2 * (1 - t) * t * c.x + t * t * cx,
        (1 - t) * (1 - t) * z.y + 2 * (1 - t) * t * c.y + t * t * cy);
      if (u >= 1) break;
    }
    nyni.x = cx; nyni.y = cy;
  };
  const stred = async (loc) => {
    const b = await loc.boundingBox({ timeout: 8000 }).catch(e => { throw new Error(`prvek ${loc} se neobjevil`); });
    if (!b) throw new Error('prvek nemá rozměr');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
  };
  const kolecko = async (dy, ms = 900) => {
    // Zrychlení a zpomalení: kolečko posílá rozdíl hladké křivky mezi dvěma okamžiky.
    const start = Date.now();
    let hotovo = 0;
    for (;;) {
      const u = Math.min(1, (Date.now() - start) / ms);
      const cil = hladce(u) * dy;
      if (Math.abs(cil - hotovo) >= 1) { await p.mouse.wheel(0, cil - hotovo); hotovo = cil; }
      if (u >= 1) break;
      await cekej(16);
    }
  };
  /** Dostane prvek do pohledu pomalým posunem a vrátí jeho střed. */
  const doPohledu = async (loc, kamNaObrazovce = 0.5) => {
    let s = await stred(loc);
    const cil = okno.height * kamNaObrazovce;
    if (s.y > okno.height - 70 || s.y < 70) {
      await kolecko(s.y - cil, 1000);
      await cekej(250);
      s = await stred(loc);
    }
    return s;
  };
  return {
    jed, kolecko, doPohledu,
    pauza: cekej,
    async klik(loc, { ms = 850, po = 350, kam = 0.5 } = {}) {
      const s = await doPohledu(loc, kam);
      await jed(s.x, s.y, ms);
      await cekej(180);
      await p.mouse.down();
      await cekej(110);
      await p.mouse.up();
      await cekej(po);
    },
    async najed(loc, ms = 800) { const s = await doPohledu(loc); await jed(s.x, s.y, ms); },
  };
}

// ——— Scénáře ——————————————————————————————————————————————————————
// `plakat`: vteřina ve výsledném videu, ze které se vezme poster (nejvíc říkající
// okamžik, ne prázdný začátek). `kroky(p, o)` dostane stránku a ovladač.
const SCENARE = [
  {
    id: 'ukol-uzaverka',
    zarizeni: 'telefon',
    url: '/demo?scena=uzaverka&role=zamestnanec&rezim=okno',
    popis: 'Zaměstnanec odškrtne povinný úkol a uzávěrka se odemkne',
    plakat: 0.62,
    async kroky(p, o) {
      await o.pauza(1500);
      await o.kolecko(520, 1400);
      await o.pauza(700);
      await o.kolecko(-520, 1000);
      await o.pauza(300);
      await o.klik(p.getByRole('button', { name: /^Hotovo: Vynést koš/ }), { ms: 900, po: 1900 });
      await o.kolecko(300, 1100);
      await o.pauza(1500);
    },
  },
  {
    id: 'rozvrh',
    zarizeni: 'laptop',
    url: '/demo?scena=rozvrh&role=vedeni&rezim=okno',
    popis: 'Vedení vygeneruje rozvrh, projde návrh a publikuje ho',
    plakat: 0.55,
    async kroky(p, o) {
      await o.pauza(1100);
      await o.klik(p.getByRole('button', { name: 'Vygenerovat rozvrh' }), { ms: 1000, po: 1400 });
      await o.kolecko(330, 1200);
      await o.pauza(1100);
      await o.kolecko(-330, 900);
      await o.klik(p.getByRole('button', { name: 'Potvrdit a uložit' }), { ms: 900, po: 1300 });
      await o.klik(p.getByRole('button', { name: 'Publikovat' }).first(), { ms: 900, po: 1800 });
      await o.pauza(700);
    },
  },
  {
    id: 'sklad',
    zarizeni: 'laptop',
    url: '/demo?scena=sklad&role=vedeni&rezim=okno',
    popis: 'Sklad upozorní, co dochází, a z nákupního seznamu vznikne objednávka',
    plakat: 0.5,
    async kroky(p, o) {
      await o.pauza(1300);
      await o.klik(p.getByRole('button', { name: /^Nakoupit/ }), { ms: 1000, po: 1500 });
      await o.jed(640, 320, 600);
      await o.kolecko(240, 900);
      await o.pauza(700);
      await o.klik(p.getByRole('button', { name: 'Vytvořit objednávku' }), { ms: 950, po: 1300 });
      await o.kolecko(520, 1300);
      await o.pauza(1600);
    },
  },
  {
    id: 'kiosk',
    zarizeni: 'tablet',
    url: '/demo?scena=kiosk&role=kiosk&rezim=okno',
    popis: 'Tablet u baru: klepnutí na jméno, odškrtnutý úkol, spuštěný postup',
    plakat: 0.6,
    async kroky(p, o) {
      await o.pauza(1300);
      await o.klik(p.getByRole('button', { name: /^Zapisovat jako Tomáš/ }), { ms: 950, po: 1200 });
      await o.klik(p.getByRole('button', { name: /^Úkoly/ }).first(), { ms: 800, po: 1100 });
      await o.klik(p.getByRole('checkbox', { name: /^Vynést koš a přebalit odpad/ }), { ms: 900, po: 1500 });
      await o.klik(p.getByRole('button', { name: /^Postupy/ }).first(), { ms: 800, po: 1500 });
      await o.pauza(900);
    },
  },
  {
    id: 'togo',
    zarizeni: 'telefon',
    url: '/demo?scena=prehled&role=vedeni&rezim=okno',
    popis: 'Majitel v kapse: přehled dne, docházející zásoby a rozvrh na telefonu',
    plakat: 0.45,
    async kroky(p, o) {
      await o.pauza(1500);
      await o.kolecko(560, 1500);
      await o.pauza(600);
      await o.kolecko(520, 1300);
      await o.pauza(500);
      await o.klik(p.getByRole('button', { name: /^Otevřít Docházející zásoby/ }), { ms: 950, po: 1800 });
      await o.klik(p.getByRole('button', { name: /^Rozvrh/ }).last(), { ms: 850, po: 1800 });
      await o.pauza(800);
    },
  },
];

// ——— ffmpeg ———————————————————————————————————————————————————————
function ff(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg selhal: ${r.stderr || r.error}`);
}
function delkaVideaS(soubor) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', soubor], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(r.stderr || '');
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
}

/** Zakóduje s rostoucím crf, dokud soubor nevleze do limitu. */
function zakoduj(vstup, vystup, { od, sec, w, h, kodek }) {
  const spolecne = ['-ss', od.toFixed(2), '-t', sec.toFixed(2), '-i', vstup, '-an',
    '-vf', `fps=${FPS},scale=${w}:${h}:flags=lanczos,format=yuv420p`];
  let crf = kodek === 'h264' ? 26 : 34;
  for (let pokus = 0; pokus < 6; pokus++) {
    if (kodek === 'h264') {
      ff([...spolecne, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', '-profile:v', 'main', vystup]);
    } else {
      ff([...spolecne, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', vystup]);
    }
    const b = statSync(vystup).size;
    if (b <= LIMIT_B) return { bytes: b, crf };
    crf += 3;
  }
  throw new Error(`${vystup} se nevešel do ${LIMIT_B} B`);
}

async function nahraj(browser, s, tmp) {
  const z = ZARIZENI[s.zarizeni];
  const ctx = await browser.newContext({
    viewport: z.okno, deviceScaleFactor: 1, locale: 'cs-CZ',
    recordVideo: { dir: tmp, size: z.video },
  });
  await ctx.addInitScript(KURZOR);
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', e => chyby.push(String(e).slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') chyby.push(m.text().slice(0, 160)); });
  const t0 = Date.now();
  await p.goto(BASE + s.url, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => (window.__demoUdalosti ?? []).some(u => u.typ === 'demo-pripraveno'), null, { timeout: 25000 });
  await cekej(700);
  // Záznam začíná vytvořením stránky; načítání (bílá plocha) se ořízne.
  const od = (Date.now() - t0) / 1000;
  const o = ovladac(p, z.okno);
  const tStart = Date.now();
  await s.kroky(p, o);
  const sec = (Date.now() - tStart) / 1000;
  const video = p.video();
  await ctx.close();
  const syrove = await video.path();
  return { syrove, od, sec, chyby, z };
}

async function main() {
  const jen = process.argv.slice(2);
  const vybrane = SCENARE.filter(s => !jen.length || jen.includes(s.id));
  if (!vybrane.length) { console.error('Žádný scénář nevyhovuje: ' + jen.join(', ')); process.exit(2); }
  mkdirSync(VYSTUP, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'managero-nahravky-'));
  const browser = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
  const vysledky = [];
  let spadlo = 0;
  for (const s of vybrane) {
    try {
      const r = await nahraj(browser, s, tmp);
      const { w, h } = { w: r.z.video.width, h: r.z.video.height };
      const cil = VYSTUP + s.id;
      const mp4 = zakoduj(r.syrove, cil + '.mp4', { od: r.od, sec: r.sec, w, h, kodek: 'h264' });
      const webm = zakoduj(r.syrove, cil + '.webm', { od: r.od, sec: r.sec, w, h, kodek: 'vp9' });
      const tplak = Math.min(r.sec - 0.3, Math.max(0.2, r.sec * s.plakat));
      const png = join(tmp, s.id + '.png');
      ff(['-ss', (r.od + tplak).toFixed(2), '-i', r.syrove, '-frames:v', '1', '-vf', `scale=${w}:${h}:flags=lanczos`, png]);
      await sharp(png).webp({ quality: 82, effort: 5 }).toFile(cil + '.webp');
      const dobaOk = r.sec >= 8 && r.sec <= 14.5;
      console.log(`${dobaOk ? '✓' : '✗'} ${s.id}: ${r.sec.toFixed(1)} s, ${w}x${h}, mp4 ${(mp4.bytes / 1024).toFixed(0)} kB (crf ${mp4.crf}), webm ${(webm.bytes / 1024).toFixed(0)} kB (crf ${webm.crf}), poster ${(statSync(cil + '.webp').size / 1024).toFixed(0)} kB${r.chyby.length ? `, chyby v konzoli: ${r.chyby.length}` : ''}`);
      if (!dobaOk) spadlo++;
      if (r.chyby.length) { console.log('  ' + r.chyby.slice(0, 3).join('\n  ')); spadlo++; }
      vysledky.push({ id: s.id, w, h, sec: Math.round(r.sec * 10) / 10, mp4: mp4.bytes, webm: webm.bytes });
    } catch (e) {
      spadlo++;
      console.log(`✗ ${s.id}: ${String(e).split('\n')[0]}`);
    }
  }
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });

  // Generovaný soubor drží i dřív nahrané scénáře (spuštění jen s jedním id ho nesmí zkrátit).
  const stary = existsSync(GENEROVANO) ? readFileSync(GENEROVANO, 'utf8') : '';
  const zachovat = {};
  for (const m of stary.matchAll(/^\s*'([\w-]+)': (\{[^}]*\}),?$/gm)) { try { zachovat[m[1]] = JSON.parse(m[2].replace(/(\w+):/g, '"$1":')); } catch { /* poškozený řádek se přegeneruje */ } }
  for (const v of vysledky) zachovat[v.id] = { w: v.w, h: v.h, sec: v.sec, mp4: v.mp4, webm: v.webm };
  const radky = Object.entries(zachovat).sort(([a], [b]) => a.localeCompare(b))
    .map(([id, v]) => `  '${id}': { w: ${v.w}, h: ${v.h}, sec: ${v.sec}, mp4: ${v.mp4}, webm: ${v.webm} },`);
  writeFileSync(GENEROVANO, `// Vygeneroval scripts/nahravky/nahraj.mjs, neupravovat ručně.
// Rozměr a délka každé nahrávky: stránka z nich drží poměr stran dřív, než se
// video stáhne, takže se po načtení nic neposune.
export const NAHRAVKY_ROZMERY: Record<string, { w: number; h: number; sec: number; mp4: number; webm: number }> = {
${radky.join('\n')}
};
`);
  console.log(spadlo ? `\n${spadlo} problémů` : '\nvše v pořádku');
  process.exit(spadlo ? 1 : 0);
}

await main();
