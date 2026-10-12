// Jádro sond přetečení (není sonda, spust.mjs ho má v MIMO).
//
// Majitel: „Skrze celou aplikaci se nesmí stávat, že se něco nevleze do svého
// widgetu, přesahuje to přes stránku, je někde aktivní horizontal scroll atd."
//
// Měří se v prohlížeči na jedno zavolání (`zmer`), aby sonda nedělala stovky
// kol přes CDP. Co se tvrdí:
//  1) stránka nemá vodorovný posuv: html/body.scrollWidth ≤ innerWidth + 1
//     (html má overflow-x hidden a body clip, takže by uživatel posuv neviděl —
//     ale obsah by byl uříznutý; proto se měří scrollWidth, ne scrollX);
//  2) žádný posuvný ani ořezávající obal (overflow-x auto/scroll/hidden/clip —
//     typicky <main>, karta s overflow-hidden) neskrývá širší obsah, než má
//     sám: el.scrollWidth ≤ el.clientWidth + 1. Výjimka: záměrný vodorovný pás
//     (třída overflow-x-auto / scroll-fade-x, pás Segmented, scrollbar-thin bez
//     svislého posuvu) — ten se jen nesmí vylézt z rodiče. Ořez „…" (truncate,
//     line-clamp) přetečením není, to je jeho práce;
//  3) každý widget plochy ([data-plocha] li[data-widget]), karta (.card) a
//     okno (.modal-sheet) má scrollWidth ≤ clientWidth + 1 — nic z něj
//     nevyčuhuje přes okraj (ani do mezery mezi widgety);
//  4) nic nekončí za pravým okrajem okna ani nezačíná před levým, kromě
//     fixních/absolutních dekorací bez textu (zrno, pozadí, maska).
// U každého nálezu se vypíše viník: nejhlubší prvek, který hranici překračuje,
// jeho selektor, text a šířka — ať se dá opravit bez hádání.
//
// Záměrné tolerance (ne díry): pás s `-mx-1 px-1` smí vylézt o svůj padding
// (obrys fokusu první pilulky se jinak ořízne; pilulky samy v klidu sedí
// uvnitř), absolutní dekorace bez textu (záře v rohu tmavé karty, zrno) se
// nepočítá a ořez tečkami (`truncate`, `line-clamp`) je práce prvku.
import { kontext, konec, tvrdi, BASE, OUT, dokud, FIX_DOMU } from './k68-spolecne.mjs';
export { kontext, konec, tvrdi, BASE, OUT, dokud, FIX_DOMU };

export const SIRKY = [320, 390, 768, 1024];
export const POHLEDY = {
  employer: ['overview', 'shifts', 'inventory', 'recipes', 'procedures', 'tasks', 'guides', 'planning', 'reports', 'finance',
    'suggestions', 'attendance', 'my-shifts', 'rewards', 'settings', 'team-settings', 'menu', 'announcements', 'events'],
  employee: ['home', 'my-shifts', 'procedures', 'availability', 'inventory', 'closing', 'tasks', 'rewards', 'guides', 'suggestions', 'settings'],
};
export const KIOSK_ZALOZKY = ['Směna', 'Úkoly', 'Postupy', 'Sklad', 'Objednávky', 'Uzávěrka', 'Návody'];
export const VEREJNE = ['/login', '/register', '/client/login'];
export const url = (role, pohled) => role === 'employer' ? `${BASE}/employer/overview?view=${pohled}` : `${BASE}/employee/shifts?view=${pohled}`;
export const viewport = (w) => ({ width: w, height: w < 600 ? 844 : 900 });

/** Jazyk aplikace: cookie `managero-lang` (lib/i18n/config.ts), stejně jako přepínač v Nastavení. */
export async function nastavJazyk(ctx, jazyk) {
  if (!jazyk || jazyk === 'cs') return;
  await ctx.addCookies([{ name: 'managero-lang', value: jazyk, domain: 'localhost', path: '/', sameSite: 'Lax' }]);
}

/** Otevře stránku a počká na klid sítě a doběhnutí animací (rise-in widgetů). */
export async function otevriStranku(p, cesta, cekani = 700) {
  // Klid sítě se čeká jen omezeně: některé obrazovky se dotazují periodicky
  // (chat, kasa) a `networkidle` by s podvrženým API nikdy nenastal.
  await p.goto(cesta, { waitUntil: 'load', timeout: 45000 });
  await p.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await dokud(() => p.locator('h1, h2, [data-plocha]').first().isVisible().catch(() => false), 4000);
  await p.waitForTimeout(cekani);
}

/** Měření v prohlížeči — vrátí seznam nálezů (prázdný = čisto). */
export const zmer = (p) => p.evaluate(() => {
  const W = innerWidth;
  const KLIP = /^(auto|scroll|hidden|clip)$/;
  const tr = (e) => typeof e.className === 'string' ? e.className : (e.getAttribute?.('class') || '');
  const popis = (e) => {
    const c = tr(e).trim().split(/\s+/).filter(Boolean).slice(0, 4).join('.');
    return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${c ? '.' + c : ''}`;
  };
  const text = (e) => (e.getAttribute?.('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);
  const rect = (e) => e.getBoundingClientRect();
  const viditelny = (e) => { const r = rect(e); return r.width > 0 && r.height > 0; };
  // Záměrný vodorovný pás: smí být širší, než je vidět; jen nesmí vylézt z rodiče.
  const zamerny = (e) => {
    const c = tr(e);
    if (/\boverflow-x-auto\b|\bscroll-fade-x\b|\boverflow-x-scroll\b/.test(c)) return true;
    if (/\bscrollbar-thin\b/.test(c) && !/\boverflow-y-auto\b|\boverflow-auto\b|\boverflow-y-scroll\b/.test(c)) return true;
    if (e.matches('[role=tablist], [role=tablist] *')) return true;
    return false;
  };
  // Ořez tečkami je práce prvku, ne přetečení; stejně tak posuvník textového pole.
  const orez = (e) => {
    const cs = getComputedStyle(e);
    if (cs.textOverflow === 'ellipsis' || /\btruncate\b|\bline-clamp|\bsr-only\b/.test(tr(e))) return true;
    if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') return true;
    // sr-only: clip rect(0 0 0 0) a šířka 1 px — text je schovaný schválně.
    // Řádkové prvky (span, a) mají clientWidth 0 vždycky, ty se posuzují podle rámečku.
    if (cs.clip !== 'auto' || (cs.display !== 'inline' && e.clientWidth <= 1)) return true;
    return /^(TEXTAREA|INPUT|SELECT|SVG|CANVAS|VIDEO|IFRAME)$/.test(e.tagName) || e.closest('svg');
  };
  const dekorace = (e) => {
    const cs = getComputedStyle(e);
    return (cs.position === 'fixed' || cs.position === 'absolute') && (e.getAttribute('aria-hidden') === 'true' || !text(e) || cs.pointerEvents === 'none');
  };
  // Ořezává/posouvá prvek svůj obsah vodorovně?
  const klipuje = (e) => KLIP.test(getComputedStyle(e).overflowX);
  // Okraje prvku pro měření: záměrný pás s `-mx-1 px-1` (ať se neořízne
  // obrys fokusu první položky) smí vylézt o svůj vlastní padding — počítá
  // se jeho obsahový box, ne rámeček.
  const okraje = (e) => {
    const r = rect(e);
    if (!zamerny(e)) return { l: r.left, r: r.right };
    const cs = getComputedStyle(e);
    return { l: r.left + parseFloat(cs.paddingLeft), r: r.right - parseFloat(cs.paddingRight) };
  };
  // Je mezi d a C (oba vyjma) nějaký ořezávající obal? Pak přesah d schová on, ne C.
  const mezi = (d, C) => { let q = d.parentElement; while (q && q !== C) { if (klipuje(q)) return true; q = q.parentElement; } return false; };
  // Viníci: nejhlubší viditelné potomky C, které končí za pravým okrajem `hranice`
  // (nebo začínají před `levy`), anebo blok, z něhož vyčuhuje vlastní text
  // (dlouhé slovo bez zalomení: blok sám je v mezích, přetéká jen jeho obsah).
  // Dekorace (absolutní záře bez textu) viníkem není — karta s overflow-hidden
  // ji ořízne schválně.
  const vinici = (C, hranice, levy = -Infinity) => {
    const vsechny = [];
    for (const d of C.querySelectorAll('*')) {
      if (!viditelny(d) || d.closest('svg') !== null && d.tagName !== 'svg') continue;
      const cs = getComputedStyle(d);
      if (cs.position === 'fixed' || dekorace(d) || orez(d)) continue;
      if (mezi(d, C)) continue;
      const { l, r } = okraje(d);
      if (r > hranice + 1 || l < levy - 1) { vsechny.push(d); continue; }
      // vlastní text bloku končí za hranicí C (blok sám je v mezích). Přesah,
      // který vysvětluje některé dítě (jeho rámeček sahá až na konec posuvné
      // plochy), tu neplatí: dítě se posuzuje samo — buď je viníkem ono, nebo
      // je to záměrný pás s tolerovaným paddingem.
      if (cs.display !== 'inline' && !klipuje(d) && d.scrollWidth > d.clientWidth + 1) {
        const konec = l + d.clientLeft + d.scrollWidth;
        const ditetem = [...d.querySelectorAll('*')].some(ch => rect(ch).right >= konec - 1);
        if (konec > hranice + 1 && !ditetem) vsechny.push(d);
      }
    }
    const listy = vsechny.filter(d => !vsechny.some(j => j !== d && d.contains(j)));
    return listy.slice(0, 4).map(d => { const r = rect(d); return `${popis(d)} [${Math.round(r.left)}..${Math.round(r.right)}]${d.scrollWidth > d.clientWidth + 1 ? ` text ${d.scrollWidth}/${d.clientWidth}` : ''} «${text(d)}»`; });
  };
  const nalezy = [];
  // Viník dostane značku, ať ho snímek najde (prover ji po vyfocení smaže).
  const pridej = (druh, e, detail, vin) => { e.setAttribute('data-preteceni', druh); nalezy.push({ druh, prvek: popis(e), text: text(e), detail, vinici: vin }); };

  // 1) stránka
  const html = document.documentElement, body = document.body;
  if (html.scrollWidth > W + 1 || body.scrollWidth > W + 1) pridej('stránka', body, `scrollWidth ${Math.max(html.scrollWidth, body.scrollWidth)} > okno ${W}`, vinici(body, W, 0));

  // 2) ořezávající a posuvné obaly, 3) widgety / karty / okna
  const kontejnery = new Set(document.querySelectorAll('[data-plocha] li[data-widget], .card, .modal-sheet'));
  for (const e of document.querySelectorAll('body *')) {
    if (!viditelny(e)) continue;
    if (e.closest('svg') || orez(e)) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'inline' || cs.position === 'fixed') continue;
    const jeKontejner = kontejnery.has(e);
    if (e.closest('[role=tablist]') && e.getAttribute('role') !== 'tablist') continue; // položky pásu Segmented hlídá pás
    if (zamerny(e)) {
      // záměrný pás: nesmí vylézt z rodiče (ani z karty); jeho vlastní obsah smí být širší
      const { l, r } = okraje(e), rodic = e.parentElement; if (!rodic) continue;
      const rr = rect(rodic);
      if (r > rr.right + 1 || l < rr.left - 1) pridej('pás vylézá z rodiče', e, `obsah [${Math.round(l)}..${Math.round(r)}] rodič ${popis(rodic)} [${Math.round(rr.left)}..${Math.round(rr.right)}]`, []);
      continue;
    }
    if (!jeKontejner && !klipuje(e)) continue;
    if (e.scrollWidth > e.clientWidth + 1) {
      const r = rect(e);
      const hranice = r.left + e.clientLeft + e.clientWidth;
      const vin = vinici(e, hranice, r.left + e.clientLeft);
      // bez viníka = jen dekorace za okrajem (záře v rohu tmavé karty) → v pořádku
      if (!vin.length) continue;
      pridej(jeKontejner ? (e.matches('li[data-widget]') ? 'widget' : e.matches('.modal-sheet') ? 'okno' : 'karta') : 'nechtěný vodorovný posuv', e,
        `scrollWidth ${e.scrollWidth} > clientWidth ${e.clientWidth}`, vin);
    }
  }

  // 4) za okrajem okna (fixní prvky s textem, a cokoli, co žádný obal neořízne)
  for (const e of document.querySelectorAll('body *')) {
    if (!viditelny(e) || e.closest('svg') && e.tagName !== 'svg') continue;
    const r = rect(e);
    if (r.right <= W + 1 && r.left >= -1) continue;
    if (dekorace(e)) continue;
    const cs = getComputedStyle(e);
    if (cs.position !== 'fixed') {
      // kdo má mezi sebou a <body> ořezávající obal uvnitř okna, toho hlídá bod 2
      let q = e.parentElement, schovany = false;
      while (q && q !== body) { if (klipuje(q) && rect(q).right <= W + 1 && rect(q).left >= -1) { schovany = true; break; } q = q.parentElement; }
      if (schovany) continue;
    }
    if (nalezy.some(n => n.vinici.some(v => v.startsWith(popis(e) + ' ')))) continue;
    pridej(cs.position === 'fixed' ? 'fixní prvek za okrajem okna' : 'za okrajem okna', e, `[${Math.round(r.left)}..${Math.round(r.right)}] okno ${W}`, []);
    if (nalezy.length > 12) break;
  }
  return nalezy;
});

/**
 * Projde obrazovky (dvojice [adresa, popis]) v jednom kontextu. Když
 * Chromium stránku shodí („Page crashed" — nedostatek paměti ve sdíleném
 * běhu, ne chyba aplikace), otevře novou a obrazovku zkusí ještě jednou;
 * teprve druhý pád je nález. Sonda tak nespadne celá kvůli jednomu
 * rendereru a ostatní obrazovky se změří.
 */
export async function projdi(ctx, p, obrazovky, jmeno) {
  for (const [cesta, popis] of obrazovky) {
    for (let pokus = 0; ; pokus++) {
      try {
        await otevriStranku(p, cesta);
        await prover(p, `${jmeno} ${popis}`);
        break;
      } catch (e) {
        const pad = /crashed|has been closed/i.test(String(e));
        if (pad && pokus === 0) { p = await ctx.newPage(); continue; }
        tvrdi(`${jmeno} ${popis}: obrazovka se otevřela`, false, String(e).split('\n')[0].slice(0, 140));
        break;
      }
    }
  }
}

export const popisNalezu = (n) => `${n.druh}: ${n.prvek} «${n.text}» ${n.detail}${n.vinici.length ? '\n      ↳ ' + n.vinici.join('\n      ↳ ') : ''}`;

/**
 * Změří obrazovku a tvrdí „nic nepřetéká". Při nálezu uloží snímek
 * shots/preteceni-<jmeno>.png (celá stránka, ať je viník vidět).
 */
export async function prover(p, jmeno) {
  const nalezy = await zmer(p);
  const ok = nalezy.length === 0;
  tvrdi(`${jmeno}: nic nepřetéká`, ok, ok ? '' : `${nalezy.length} nálezů\n    ${nalezy.map(popisNalezu).join('\n    ')}`);
  if (!ok) {
    // <main> je vlastní posuvník, takže fullPage nestačí: první viník se posune do okna.
    await p.evaluate(() => document.querySelector('[data-preteceni]')?.scrollIntoView({ block: 'center' })).catch(() => {});
    await p.screenshot({ path: OUT + `preteceni-${jmeno.replace(/[^\p{L}\p{N}]+/gu, '-')}.png`, fullPage: true }).catch(() => {});
  }
  await p.evaluate(() => document.querySelectorAll('[data-preteceni]').forEach(e => e.removeAttribute('data-preteceni'))).catch(() => {});
  return nalezy;
}
