// Tiskový arch fyzických kartiček: A4, karty ve vizitkovém formátu 85 × 55 mm,
// deset na stranu (2 × 5), ořezové značky v okrajích.
//
// Čisté (bez databáze a bez generátoru QR), ať jde otestovat: QR jako SVG dodá volající
// (routa app/api/client/cards/davky/[id]/tisk přes balíček `qrcode`).
//
// Proč takhle:
//  • Karty leží těsně vedle sebe, bez mezer. Řez je pak jeden na hranu (řezačka nebo
//    nůžky jedou po přímce přes celý arch) a značky v okrajích ukazují, kde.
//  • Černobíle. Tiskárna v kavárně je černobílá a QR potřebuje kontrast, ne barvu.
//  • Ve skutečné velikosti: arch má `@page { margin: 0 }` a rozměry v milimetrech;
//    tisk „Přizpůsobit stránce“ by kartu zmenšil. Lišta nad archem (jen na obrazovce)
//    to říká a nabízí Vytisknout; v dialogu tisku jde i „Uložit jako PDF“.
//  • Papír nemá stav: pod značkami je drobně podnik, dávka, počet a strana.

import { esc } from './printDoc.ts';
import { czCount, type CzNoun } from './czech.ts';

export const A4 = { w: 210, h: 297 } as const;
export const KARTA = { w: 85, h: 55 } as const;
export const SLOUPCE = 2;
export const RADKY = 5;
export const NA_STRANU = SLOUPCE * RADKY;
/** Levý a horní okraj mřížky karet (mřížka je na archu vystředěná). */
export const OKRAJ_X = (A4.w - SLOUPCE * KARTA.w) / 2;
export const OKRAJ_Y = (A4.h - RADKY * KARTA.h) / 2;
/** Ořezová značka: délka a mezera od karty (mm). */
export const ZNACKA = { delka: 5, mezera: 1.5 } as const;

export interface KartaKTisku { kod: string; svg: string }

export interface ArchKaret {
  karty: KartaKTisku[];
  podnik: string;
  /** Řádek pod archem: „Dávka 3 · 50 karet · 15. 10. 2026“. */
  popis: string;
  /** Titulek okna. */
  titulek: string;
}

/** Karty po stranách. */
export function naStrany<T>(karty: T[], naStranu = NA_STRANU): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < karty.length; i += naStranu) out.push(karty.slice(i, i + naStranu));
  return out;
}

/** Pozice karty na straně (mm od levého horního rohu archu). */
export function poziceKarty(i: number): { x: number; y: number } {
  const sl = i % SLOUPCE; const ra = Math.floor(i / SLOUPCE);
  return { x: OKRAJ_X + sl * KARTA.w, y: OKRAJ_Y + ra * KARTA.h };
}

/** Ořezové značky pro stranu s `pocet` kartami: svislé nad a pod mřížkou, vodorovné vlevo a vpravo. */
export function znackyStrany(pocet: number): { x1: number; y1: number; x2: number; y2: number }[] {
  if (pocet <= 0) return [];
  const radku = Math.ceil(pocet / SLOUPCE);
  const sloupcu = Math.min(SLOUPCE, pocet);
  const horni = OKRAJ_Y; const dolni = OKRAJ_Y + radku * KARTA.h;
  const leva = OKRAJ_X; const prava = OKRAJ_X + SLOUPCE * KARTA.w;
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const { delka, mezera } = ZNACKA;
  // Svislé řezy (hrany sloupců). Je-li na straně jen jedna karta, pravý řez sloupce dvě nepotřebuje.
  for (let s = 0; s <= sloupcu; s++) {
    const x = leva + s * KARTA.w;
    out.push({ x1: x, y1: horni - mezera - delka, x2: x, y2: horni - mezera });
    out.push({ x1: x, y1: dolni + mezera, x2: x, y2: dolni + mezera + delka });
  }
  // Vodorovné řezy (hrany řádků).
  for (let r = 0; r <= radku; r++) {
    const y = horni + r * KARTA.h;
    out.push({ x1: leva - mezera - delka, y1: y, x2: leva - mezera, y2: y });
    out.push({ x1: prava + mezera, y1: y, x2: prava + mezera + delka, y2: y });
  }
  return out;
}

/** „1 karta“, „3 karty“, „12 karet“. */
export const KARTA_SLOVO: CzNoun = { one: 'karta', few: 'karty', many: 'karet' };
export function pocetKaret(n: number): string {
  return czCount(n, KARTA_SLOVO);
}

const mm = (n: number) => `${Math.round(n * 100) / 100}mm`;

/** Jedna karta: QR vlevo, vpravo podnik, štítek, kód a krátký návod. */
function karta(k: KartaKTisku, podnik: string, i: number): string {
  const p = poziceKarty(i);
  return `<div class="k" style="left:${mm(p.x)};top:${mm(p.y)}">`
    + `<div class="q" aria-hidden="true">${k.svg}</div>`
    + `<div class="t"><p class="n">${esc(podnik)}</p><p class="l">Věrnostní karta</p>`
    + `<p class="c">${esc(k.kod)}</p>`
    + `<p class="h">Ukaž ji u kasy. V aplikaci Managero si ji připojíš v Moje → Mám plastovou kartu.</p></div>`
    + `</div>`;
}

/** Celý arch jako HTML. Rozměry v mm, @page bez okrajů. */
export function htmlArchuKaret(a: ArchKaret): string {
  const strany = naStrany(a.karty);
  const pocetStran = strany.length;
  const telo = strany.map((s, si) => {
    const znacky = znackyStrany(s.length).map(z => {
      const svisla = z.x1 === z.x2;
      return `<i class="z" style="left:${mm(Math.min(z.x1, z.x2))};top:${mm(Math.min(z.y1, z.y2))};${svisla ? `height:${mm(Math.abs(z.y2 - z.y1))};width:0;border-left:0.2mm solid #000` : `width:${mm(Math.abs(z.x2 - z.x1))};height:0;border-top:0.2mm solid #000`}"></i>`;
    }).join('');
    return `<section class="s">${s.map((k, i) => karta(k, a.podnik, i)).join('')}${znacky}`
      + `<p class="f">${esc(a.podnik)} · ${esc(a.popis)} · strana ${si + 1}/${pocetStran}</p></section>`;
  }).join('');
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(a.titulek)}</title>
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #e9e9e6; color: #000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.lista { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center;
  justify-content: center; padding: 10px 16px; background: #16181A; color: #fff; font-size: 14px; line-height: 1.4; }
.lista button { font: inherit; font-weight: 600; min-height: 44px; padding: 0 18px; border: 0; border-radius: 999px;
  background: #C8F542; color: #16181A; cursor: pointer; }
.s { position: relative; width: ${mm(A4.w)}; height: ${mm(A4.h)}; margin: 12px auto; background: #fff; overflow: hidden;
  box-shadow: 0 1px 6px rgba(0,0,0,.15); break-after: page; page-break-after: always; }
.s:last-child { break-after: auto; page-break-after: auto; }
.k { position: absolute; width: ${mm(KARTA.w)}; height: ${mm(KARTA.h)}; padding: 4.5mm; display: flex; gap: 4mm; align-items: center; }
.q { flex: 0 0 34mm; width: 34mm; height: 34mm; }
.q svg { display: block; width: 100%; height: 100%; }
.t { flex: 1 1 auto; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: center; }
.t p { margin: 0; overflow-wrap: anywhere; }
.n { font-size: 10.5pt; font-weight: 700; line-height: 1.15; max-height: 2.3em; overflow: hidden; }
.l { margin-top: 1mm !important; font-size: 6.5pt; letter-spacing: .08em; text-transform: uppercase; color: #444; }
.c { margin-top: 3mm !important; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12.5pt;
  font-weight: 700; letter-spacing: .06em; white-space: nowrap; }
.h { margin-top: 2.5mm !important; font-size: 6pt; line-height: 1.3; color: #333; }
.z { position: absolute; display: block; }
.f { position: absolute; left: ${mm(OKRAJ_X)}; right: ${mm(OKRAJ_X)}; bottom: 1.6mm; margin: 0; font-size: 6pt; color: #555; text-align: center; }
@media print {
  html, body { background: #fff; }
  .lista { display: none !important; }
  .s { margin: 0; box-shadow: none; }
}
@media screen and (max-width: 840px) {
  .s { zoom: 0.45; }
}
</style></head><body>
<div class="lista"><span>${esc(pocetKaret(a.karty.length))} · tiskni ve skutečné velikosti (100 %), bez přizpůsobení stránce. Do PDF přes „Uložit jako PDF“.</span>
<button type="button" onclick="window.print()">Vytisknout</button></div>
${telo}
<script>window.addEventListener('load',function(){setTimeout(function(){try{window.print()}catch(e){}},400)})</script>
</body></html>`;
}
