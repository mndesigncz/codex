// Kolo 68 — vizuální kontrakt plochy (spec §7.2 k68-design, DP §7 T3, T5, T6, T11, T13; AK-17–19).
//
// Na výchozím rozložení Přehledu vedení a Domů zaměstnance (z definic stránek
// v lib/widgety/stranky, jak ho spočítá server pro podnik bez vlastního):
// mřížka v klidu nemá osiřelou buňku na žádné šířce, h1 je jeden a nad
// widgety, klikací karta je bílá, nic nepulzuje, písmo drží typografickou
// řadu, limetka je nejvýš jedna (v úpravách „Hotovo") a tmavý režim je
// čitelný v klidu i v úpravách. Snímky jdou do shots/k68-*.png.
import { STRANKA as PREHLED } from '../../lib/widgety/stranky/vedeni.prehled.ts';
import { STRANKA as DOMU } from '../../lib/widgety/stranky/zamestnanec.domu.ts';
import { kontext, konec, tvrdi, otevri, upravit, vUpravach, hotovo, dokud, roleMine, FIX_VEDENI, FIX_DOMU, OUT } from './k68-spolecne.mjs';

/** Výchozí rozložení stránky z kódu: jen hotové widgety (plánované server vynechá). */
function vychozi(stranka, fix, rozsah) {
  const hotove = new Set(fix.dostupne);
  const polozky = stranka.vychozi[rozsah].filter(v => hotove.has(v.w)).map((v, i) => ({ id: `${v.w.replace(/[._]/g, '-')}-${i}`, widget: v.w, velikost: v.s ?? 'M' }));
  return { ...fix, polozky, zdroj: 'aplikace', verze: 0 };
}
const FIX_P = vychozi(PREHLED, FIX_VEDENI, 'typ:vedeni');
const FIX_D = vychozi(DOMU, FIX_DOMU, 'typ:zamestnanec');

/** Řady mřížky: součet rozpětí každé řady musí být počet sloupců (žádná díra). */
const radyMrizky = (p) => p.evaluate(() => {
  const ul = document.querySelector('[data-plocha] ul.plocha-mrizka');
  const sloupcu = getComputedStyle(ul).gridTemplateColumns.split(' ').filter(Boolean).length;
  const rady = new Map();
  for (const li of ul.querySelectorAll(':scope > li:not([hidden])')) {
    const r = li.getBoundingClientRect();
    if (r.height < 1) continue;
    const top = Math.round(li.offsetTop);
    const sirka = Math.round(r.width + 16);
    rady.set(top, [...(rady.get(top) ?? []), { li, r }]);
    void sirka;
  }
  const w = ul.getBoundingClientRect().width;
  const gap = parseFloat(getComputedStyle(ul).columnGap) || 0;
  const bunka = (w - gap * (sloupcu - 1)) / sloupcu;
  const out = [];
  for (const [top, polozky] of rady) {
    const soucet = polozky.reduce((s, { r }) => s + Math.round((r.width + gap) / (bunka + gap)), 0);
    out.push({ top, soucet });
  }
  return { sloupcu, rady: out };
});

/** Velikosti písma viditelného textu plochy (bez emoji avatarů); inkoustová plocha zvlášť. */
const pismo = (p) => p.evaluate(() => {
  const mimo = new Map(); const vse = new Set();
  for (const el of document.querySelectorAll('[data-plocha] *')) {
    if ([...el.childNodes].every(n => n.nodeType !== 3 || !n.textContent.trim())) continue;
    const t = el.textContent.trim();
    if (!t || /^\p{Extended_Pictographic}+$/u.test(t)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || el.closest('.sr-only, [aria-hidden="true"]')) continue;
    const px = Math.round(parseFloat(cs.fontSize) * 10) / 10;
    vse.add(px);
    const inkoust = !!el.closest('section[class*="bg-[#16181A]"]');
    const povolene = [11, 12, 13, 14, 15, 16, 18, 28];
    if (!povolene.includes(px) && !(inkoust && px >= 28 && px <= 40)) mimo.set(px, (mimo.get(px) ?? []).concat(t.slice(0, 24)));
  }
  return { vse: [...vse].sort((a, b) => a - b), mimo: Object.fromEntries([...mimo].map(([k, v]) => [k, v.slice(0, 3)])) };
});

/**
 * Limetkové plochy velikosti tlačítka (vyplněné #C8F542, aspoň 40 × 26 px) — jako
 * ds/limetky.py z DP T3: drobné stavy bez záře (fajfka v Checklistu, tečka) se
 * nepočítají. Práh šířky je nižší než v ds/limetky.py (70 px), aby se započítalo
 * i malé „Hotovo". Kulaté plovoucí tlačítko chatu (56 × 56, dok layoutu) se
 * vynechá jen v klidu (`bezKulatych`) — v úpravách se počítá všechno, co na
 * obrazovce svítí: jediná limetka tam je „Hotovo" (review kola 68: chat vedle
 * „Hotovo" svítil a výjimka to test nechala projít).
 */
const limetky = (p, bezKulatych = false) => p.evaluate((bezKulatych) => [...document.querySelectorAll('body *')].filter(el => {
  const r = el.getBoundingClientRect();
  if (r.width < 40 || r.height < 26 || r.bottom < 0 || r.top > innerHeight) return false;
  if (bezKulatych && Math.abs(r.width - r.height) < 2 && getComputedStyle(el).borderRadius.startsWith('9999')) return false;
  const cs = getComputedStyle(el);
  return cs.backgroundColor === 'rgb(200, 245, 66)' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.5;
}).map(el => (el.textContent ?? '').trim().slice(0, 20) || `${el.tagName} ${el.getAttribute('aria-label') ?? ''}`.trim()), bezKulatych);

/** Kontrast textu plochy proti skutečnému pozadí (WCAG), vrátí prvky pod prahem. */
const kontrast = (p) => p.evaluate(() => {
  const parse = c => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const x = m[1].split(',').map(parseFloat); return { r: x[0], g: x[1], b: x[2], a: x.length > 3 ? x[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const pomer = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
  const pod = el => { let acc = null; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (!c || c.a === 0) continue; acc = acc ? over(acc, c) : c; if (acc.a >= 0.999) return acc; } return acc ?? parse(getComputedStyle(document.body).backgroundColor); };
  const spatne = [];
  for (const el of document.querySelectorAll('[data-plocha] *')) {
    if (el.children.length) continue;
    const t = (el.textContent ?? '').trim();
    if (t.length < 2 || /^\p{Extended_Pictographic}+$/u.test(t)) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || r.top > innerHeight || r.bottom < 0 || cs.visibility === 'hidden' || el.closest('.sr-only, [aria-hidden="true"], [inert] [aria-hidden]')) continue;
    let fg = parse(cs.color); if (!fg) continue;
    // Průhlednost předků (disabled tlačítka, zástupné texty) text ztlumí stejně jako barva.
    let op = 1; for (let n = el; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
    const bg = pod(el); fg = { ...fg, a: fg.a * op }; const eff = fg.a < 1 ? over(fg, bg) : fg;
    const px = parseFloat(cs.fontSize); const velky = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    const k = pomer(eff, bg);
    if (k < (velky ? 3 : 4.5)) spatne.push(`${t.slice(0, 24)} ${k.toFixed(2)}`);
  }
  return spatne;
});

// 1) Mřížka v klidu bez osiřelé buňky na pěti šířkách (Přehled i Domů).
for (const [nazev, cesta, stranka, fix, role, mineData] of [
  ['Přehled', '/employer/overview', 'vedeni.prehled', FIX_P, 'employer', undefined],
  ['Domů', '/employee/shifts', 'zamestnanec.domu', FIX_D, 'employee', roleMine('barista')],
]) {
  for (const sirka of [390, 768, 1024, 1280, 1440]) {
    const { ctx, p } = await kontext({ viewport: { width: sirka, height: 900 }, mobil: sirka < 768, role, mineData, fix });
    await otevri(p, cesta, stranka);
    await p.waitForTimeout(600);
    const m = await radyMrizky(p);
    const diry = m.rady.filter(r => r.soucet !== m.sloupcu);
    tvrdi(`1: ${nazev} ${sirka} px — každá řada je plná (${m.sloupcu} sl., ${m.rady.length} řad)`, m.rady.length > 0 && diry.length === 0, JSON.stringify(m.rady));
    await ctx.close();
  }
}

// 2–4, 6) Přehled na monitoru: h1, bílé klikací karty, nic nepulzuje, písmo, limetky, unikátní ikony, snímky.
for (const [nazev, cesta, stranka, fix, role, mineData, jmeno] of [
  ['Přehled', '/employer/overview', 'vedeni.prehled', FIX_P, 'employer', undefined, 'prehled'],
  ['Domů', '/employee/shifts', 'zamestnanec.domu', FIX_D, 'employee', roleMine('barista'), 'domu'],
]) {
  for (const [vp, druh] of [[{ width: 1280, height: 950 }, 'desk'], [{ width: 390, height: 844 }, 'tel']]) {
    const { ctx, p, chyby } = await kontext({ viewport: vp, mobil: druh === 'tel', role, mineData, fix });
    await otevri(p, cesta, stranka);
    await p.waitForTimeout(800);
    const h1 = await p.evaluate(() => {
      const hs = [...document.querySelectorAll('h1')].filter(h => h.getBoundingClientRect().height > 0);
      const li = document.querySelector('[data-plocha] li[data-widget]:not([hidden])');
      return { n: hs.length, nad: hs[0] && li ? hs[0].getBoundingClientRect().bottom <= li.getBoundingClientRect().top : false };
    });
    tvrdi(`2: ${nazev} ${druh} — právě jeden h1 a leží nad widgety`, h1.n === 1 && h1.nad, JSON.stringify(h1));
    const karty = await p.$$eval('[data-plocha] li[data-widget] section:has(> button[aria-label^="Otevřít"])', els => els.map(e => getComputedStyle(e).backgroundColor));
    tvrdi(`2: ${nazev} ${druh} — klikací karty jsou bílé (T5)`, karty.every(c => c === 'rgb(255, 255, 255)'), JSON.stringify(karty));
    tvrdi(`2: ${nazev} ${druh} — nic nepulzuje (animate-pulse/ping)`, await p.locator('[data-plocha] .animate-pulse, [data-plocha] .animate-ping').count() === 0);
    const f = await pismo(p);
    tvrdi(`3: ${nazev} ${druh} — písmo drží řadu 11/12/13/14/15/16/18/28 (T13)`, Object.keys(f.mimo).length === 0, JSON.stringify(f));
    const lim = await limetky(p, true);
    tvrdi(`4: ${nazev} ${druh} — v klidu žádná limetková plocha (T3)`, lim.length === 0, JSON.stringify(lim));
    // Názvy widgetů se nesmí usekávat (malá karta na telefonu má dva řádky).
    const useknute = await p.$$eval('[data-plocha] li[data-widget]:not([hidden]) h2 > span', els => els
      .filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map(e => e.textContent));
    tvrdi(`7: ${nazev} ${druh} — názvy widgetů nejsou useknuté`, useknute.length === 0, JSON.stringify(useknute));
    // Hlavička: na monitoru žádné „···", které jen opakuje „Upravit"; na telefonu
    // „···" v řádku s nadpisem, ne osiřelé na vlastním řádku (T9).
    const hlavicka = await p.evaluate(() => {
      const h1 = document.querySelector('[data-plocha] h1');
      const tri = [...document.querySelectorAll('[data-plocha] button[aria-haspopup="menu"]')].filter(b => b.offsetParent !== null && !b.closest('li'));
      const r1 = h1?.getBoundingClientRect();
      return { tri: tri.length, vRadku: tri.every(b => r1 && b.getBoundingClientRect().top < r1.bottom) };
    });
    let jenUpravit = false;
    if (druh === 'desk' && hlavicka.tri > 0) {
      await p.locator('[data-plocha] button[aria-haspopup="menu"]:visible').first().click();
      await p.waitForTimeout(250);
      const pol = (await p.getByRole('menuitem').allInnerTexts()).map(t => t.trim());
      jenUpravit = pol.length === 1 && pol[0] === 'Upravit stránku';
      await p.keyboard.press('Escape');
    }
    tvrdi(`7: ${nazev} ${druh} — „···" v hlavičce není osiřelé ani zdvojené Upravit`, hlavicka.vRadku && !jenUpravit, JSON.stringify({ ...hlavicka, jenUpravit }));
    if (druh === 'desk') {
      const ikony = await p.$$eval('[data-plocha] li[data-widget]', els => els.map(e => e.getAttribute('data-ikona')));
      tvrdi(`6: ${nazev} — ve výchozím rozložení se ikony neopakují (AK-19)`, new Set(ikony).size === ikony.length, JSON.stringify(ikony));
    }
    await p.screenshot({ path: `${OUT}k68-${jmeno}-${druh}-klid.png` });
    // Úpravy: jediná limetka je „Hotovo".
    if (druh === 'desk') await upravit(p).click();
    else await p.locator('[data-plocha] button[aria-haspopup="menu"]').first().click().then(() => p.getByRole('menuitem', { name: 'Upravit stránku' }).click());
    await dokud(() => vUpravach(p), 1500);
    await dokud(() => hotovo(p).isVisible(), 3000);
    await p.waitForTimeout(500);
    const limU = await limetky(p);
    tvrdi(`4: ${nazev} ${druh} — v úpravách je jediná limetka „Hotovo" (i chat v doku ustoupí)`, limU.length === 1 && limU[0] === 'Hotovo', JSON.stringify(limU));
    await p.screenshot({ path: `${OUT}k68-${jmeno}-${druh}-upravy.png` });
    tvrdi(`${nazev} ${druh} — bez chyb v konzoli`, chyby.length === 0, chyby.join(' | ').slice(0, 300));
    await ctx.close();
  }
}

// 5) Tmavý režim v klidu i v úpravách: text ≥ 4,5 : 1, odznak a obrys čitelné (T11).
for (const reduced of [false, true]) {
  const { ctx, p } = await kontext({ tmavy: true, reduced, fix: FIX_P });
  await otevri(p, '/employer/overview');
  await p.waitForTimeout(800);
  if (!reduced) {
    const k = await kontrast(p);
    tvrdi('5: tmavý režim v klidu — text plochy ≥ 4,5 : 1', k.length === 0, k.slice(0, 8).join(' | '));
    await p.screenshot({ path: `${OUT}k68-prehled-desk-tmavy-klid.png` });
  }
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await p.waitForTimeout(600);
  if (!reduced) {
    const k = await kontrast(p);
    tvrdi('5: tmavý režim v úpravách — text plochy ≥ 4,5 : 1', k.length === 0, k.slice(0, 8).join(' | '));
    const limT = await limetky(p);
    tvrdi('5: tmavý režim v úpravách — jediná limetka „Hotovo"', limT.length === 1 && limT[0] === 'Hotovo', JSON.stringify(limT));
    const odznak = await p.locator('[data-plocha] [data-odznak]').first().evaluate(el => {
      const cs = getComputedStyle(el); const svg = el.querySelector('svg');
      return { bg: cs.backgroundColor, fg: getComputedStyle(svg).color, stranka: getComputedStyle(document.body).backgroundColor };
    });
    const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const pomer = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
    tvrdi('5: tmavě — „−" má kontrast ikony ≥ 4,5 : 1 a není světlý prstenec na tmavé', pomer(odznak.bg, odznak.fg) >= 4.5 && lum(odznak.bg) < 0.5, JSON.stringify(odznak));
    await p.screenshot({ path: `${OUT}k68-prehled-desk-tmavy-upravy.png` });
  } else {
    const obrys = await p.locator('[data-plocha] li[data-widget] .w-kyv > section').first().evaluate(el => {
      const cs = getComputedStyle(el); return { styl: cs.outlineStyle, barva: cs.outlineColor };
    });
    tvrdi('5: tmavě + omezený pohyb — obrys je přerušovaný a světlý (čitelný na tmavé)', obrys.styl === 'dashed' && /237, 242, 228/.test(obrys.barva), JSON.stringify(obrys));
  }
  await ctx.close();
}

await konec();
