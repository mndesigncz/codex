'use client';

// Tažení widgetů a FLIP pružinou (kolo 68, spec §4.5, §4.13).
//
// Dvě věci v jednom souboru, protože sdílí jeden snímkový cyklus:
//
// 1) `Pohyb` — pružiny pro přeskládání (FLIP). Když se položka v mřížce
//    posune (přesun, odebrání souseda, vstup do úprav, změna velikosti),
//    dojede na nové místo pružinou z polohy, kde ji člověk právě viděl.
//    Pružina jde kdykoli přesměrovat a nese rychlost: druhé přeskládání
//    uprostřed prvního neskočí ani nezastaví (apple-design §3). Kritické
//    tlumení v uzavřeném tvaru (lib/widgety/pruzina.ts) nezávisí na
//    snímkové frekvenci — na 120Hz iPadu i na starém Androidu jede stejně.
//
// 2) `useTazeni` — tah přes pointer events. Karta se drží prstu 1 : 1 se
//    stálým offsetem úchopu (nikdy se nevycentruje pod prst), náhled pořadí
//    se kreslí přes CSS `order` (přesun uzlu v DOM by uvolnil pointer
//    capture a tah by se utrhl) a po puštění karta dosedne s rychlostí
//    prstu. Myš táhne po 4 px, dotyk po 180 ms klidu — jinak by se plocha
//    na telefonu nedala rolovat (spec O6).
//
// Proč bez knihovny: žádná neumí náhled přes `order`, pokračování tahem
// z kontextového menu ani předání rychlosti puštění do pružiny (spec §4.14).
// Pohybuje se jen `transform` přímo na prvku, v rAF, bez Reactu.

import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { krok, USAZENO, rychlostRolovani, rychlostZVzorku, type VzorekUkazatele } from '@/lib/widgety/pruzina';
import { cilovyIndex, veVnitrniZone, type Obdelnik } from '@/lib/widgety/mrizka';
import { presun } from '@/lib/widgety/rozlozeni';
import { AKTIVACE_TAHU, HYSTEREZE_PX, PRODLEVA_CILE_MS, PRUZINA, RYCHLOST_PUSTENI, ZVEDNUTI } from '@/lib/widgety/konstanty';
import { vibruj } from '../usePodrzeni';

// ---------------------------------------------------------------------------
// Křivka --ease-out (cubic-bezier(.23, 1, .32, 1)) pro měřítko zvednutí
// ---------------------------------------------------------------------------

function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const x = (t: number) => ((ax * t + bx) * t + cx) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const y = (t: number) => ((ay * t + by) * t + cy) * t;
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 6; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (x(t) - p) / d;
      t = Math.min(1, Math.max(0, t));
    }
    return y(t);
  };
}
const easeOut = bezier(0.23, 1, 0.32, 1);

/** Dosednutí: měřítko 1,03 → 1 a stín zpět za 220 ms (--dur-2). */
const DOSEDNUTI_MS = 220;

/** Klíč položky mřížky pro FLIP: id instance, buňka „+" má vlastní. */
export function klicPrvku(el: HTMLElement): string {
  return el.dataset.instance ?? (el.hasAttribute('data-bunka-plus') ? '+' : '');
}

// ---------------------------------------------------------------------------
// Pohyb — pružiny pro FLIP a dosednutí
// ---------------------------------------------------------------------------

interface Osa { p: number; v: number }
interface Pruzina {
  x: Osa;
  y: Osa;
  meritko?: { od: number; do: number; start: number; trvani: number };
  poUsazeni?: () => void;
}

export class Pohyb {
  private pruziny = new Map<HTMLElement, Pruzina>();
  private raf = 0;
  private cas = 0;
  private snimek: ((dt: number, ted: number) => void) | null = null;

  /** `omezeny` se čte živě: přepnutí „omezit pohyb" za běhu vypne pružiny hned. */
  constructor(private omezeny: () => boolean) {}

  /** Vizuální obdélníky (i s rozběhnutou pružinou) podle klíče položky — „First" z FLIP. */
  zmer(prvky: readonly HTMLElement[]): Map<string, DOMRect> {
    const out = new Map<string, DOMRect>();
    for (const el of prvky) {
      const k = klicPrvku(el);
      if (k && el.offsetParent !== null) out.set(k, el.getBoundingClientRect());
    }
    return out;
  }

  /**
   * FLIP: položky, které se v rozvržení posunuly, dojedou pružinou z místa,
   * kde je člověk právě viděl. Nové rozvržení = vizuální obdélník − dosavadní
   * posun pružiny; nový posun = staré vizuální − nové rozvržení. Rychlost
   * pružiny zůstává — přeskládání uprostřed přeskládání neskočí. Zapisuje se
   * ve stejném snímku (volá se z useLayoutEffect nebo hned po změně `order`),
   * takže nic neblikne. Velikost se mění skokem, obsah se nikdy neškáluje.
   */
  flip(prvky: readonly HTMLElement[], pred: Map<string, DOMRect>, vynechat?: HTMLElement | null): void {
    if (this.omezeny()) {
      for (const el of prvky) if (el !== vynechat && this.pruziny.has(el)) this.zastav(el);
      return;
    }
    // Nejdřív všechno přečíst, pak zapsat — jinak by každý zápis vynutil nové rozvržení.
    const mereni = prvky.map(el => ({ el, r: el.getBoundingClientRect(), p: pred.get(klicPrvku(el)) }));
    const ted = performance.now();
    for (const { el, r, p } of mereni) {
      if (el === vynechat || !p || (r.width === 0 && r.height === 0)) continue;
      const s = this.pruziny.get(el);
      const dx = p.left - (r.left - (s?.x.p ?? 0));
      const dy = p.top - (r.top - (s?.y.p ?? 0));
      if (!s && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      const nova = s ?? { x: { p: 0, v: 0 }, y: { p: 0, v: 0 } };
      nova.x.p = dx;
      nova.y.p = dy;
      this.pruziny.set(el, nova);
      this.zapis(el, nova, ted);
    }
    this.spust();
  }

  /**
   * Pružina z posunu (x, y) s počáteční rychlostí (px/s) k nule — dosednutí
   * po puštění. Kritické tlumení s rychlostí proti cíli může jednou lehce
   * přejet; to je fyzikálně správně, prst hodil (apple-design §4–5).
   */
  pust(el: HTMLElement, x: number, y: number, vx: number, vy: number, meritkoOd: number, poUsazeni?: () => void): void {
    if (this.omezeny()) {
      this.pruziny.delete(el);
      el.style.transform = '';
      el.style.transformOrigin = '';
      poUsazeni?.();
      return;
    }
    const s: Pruzina = {
      x: { p: x, v: vx }, y: { p: y, v: vy },
      meritko: meritkoOd !== 1 ? { od: meritkoOd, do: 1, start: performance.now(), trvani: DOSEDNUTI_MS } : undefined,
      poUsazeni,
    };
    this.pruziny.set(el, s);
    this.zapis(el, s, performance.now());
    this.spust();
  }

  /** Aktuální posun pružiny (0, 0, když žádná neběží). */
  posun(el: HTMLElement): { x: number; y: number } {
    const s = this.pruziny.get(el);
    return s ? { x: s.x.p, y: s.y.p } : { x: 0, y: 0 };
  }

  /** Převezme prvek (tah): pružina se zastaví a transform se smaže. */
  zastav(el: HTMLElement): void {
    const s = this.pruziny.get(el);
    this.pruziny.delete(el);
    el.style.transform = '';
    el.style.transformOrigin = '';
    s?.poUsazeni?.();
  }

  /** Úloha na každý snímek (tah: poloha karty, rolování, cíl) — ve stejném cyklu jako pružiny. */
  naSnimek(f: ((dt: number, ted: number) => void) | null): void {
    this.snimek = f;
    if (f) this.spust();
  }

  /** Všechno zastavit a uklidit (odmontování plochy). */
  zrusVse(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.snimek = null;
    for (const el of [...this.pruziny.keys()]) this.zastav(el);
  }

  private spust() {
    if (this.raf || typeof window === 'undefined') return;
    this.cas = performance.now();
    this.raf = requestAnimationFrame(this.tik);
  }

  private tik = (ted: number) => {
    // Uzavřený tvar pružiny je přesný pro libovolné dt, takže se nic neořezává
    // (po skryté kartě prostě dojede). Ořízne si ho jen rolování u okraje.
    const dt = Math.max(0, (ted - this.cas) / 1000);
    this.cas = ted;
    this.snimek?.(dt, ted);
    for (const [el, s] of this.pruziny) {
      const nx = krok(s.x.p, s.x.v, dt, PRUZINA.odezva);
      const ny = krok(s.y.p, s.y.v, dt, PRUZINA.odezva);
      s.x = { p: nx.x, v: nx.v };
      s.y = { p: ny.x, v: ny.v };
      const meritkoDoslo = !s.meritko || ted - s.meritko.start >= s.meritko.trvani;
      if (USAZENO(s.x.p, s.x.v) && USAZENO(s.y.p, s.y.v) && meritkoDoslo) {
        this.pruziny.delete(el);
        el.style.transform = '';
        el.style.transformOrigin = '';
        s.poUsazeni?.();
        continue;
      }
      this.zapis(el, s, ted);
    }
    this.raf = this.pruziny.size || this.snimek ? requestAnimationFrame(this.tik) : 0;
  };

  private zapis(el: HTMLElement, s: Pruzina, ted: number) {
    let m = 1;
    if (s.meritko) {
      const t = Math.min(1, Math.max(0, (ted - s.meritko.start) / s.meritko.trvani));
      m = s.meritko.od + (s.meritko.do - s.meritko.od) * easeOut(t);
    }
    el.style.transform = `translate3d(${s.x.p}px, ${s.y.p}px, 0)${m !== 1 ? ` scale(${m})` : ''}`;
  }
}

// ---------------------------------------------------------------------------
// Tah
// ---------------------------------------------------------------------------

export interface VolbyTazeni {
  /** Režim úprav; mimo něj se netáhne a nepasivní touchmove neexistuje. */
  aktivni: boolean;
  mrizka: React.RefObject<HTMLUListElement | null>;
  koren: React.RefObject<HTMLElement | null>;
  pohyb: Pohyb;
  omezeny: () => boolean;
  /** Karta se zvedla (hlášení „zvednut, pozice i z n"). Index je v modelu (0…). */
  onZvednuti: (instance: string, index: number, pocet: number) => void;
  /**
   * Puštění: `na === z` = beze změny. `poradi` = id instancí v novém pořadí
   * (i skryté položky) — plocha podle něj přerovná model a zapíše ho.
   */
  onPusteni: (instance: string, z: number, na: number, pocet: number, poradi: string[]) => void;
  onZruseni: (instance: string) => void;
  /** Klik myší bez pohybu nebo klepnutí prstem bez podržení — otevře nastavení. */
  onKlepnuti: (instance: string) => void;
}

/** Zvednutí zvenku — pokračování tahem z kontextového menu (spec §4.3). */
export interface ZvednutiZvenku {
  li: HTMLElement;
  pointerId: number;
  pointerType: string;
  /** Kde je ukazatel teď. */
  x: number;
  y: number;
  /** Offset úchopu změřený v klidu (bod stisku − levý horní roh karty). */
  offX: number;
  offY: number;
}

interface Tah {
  faze: 'ceka' | 'tahne';
  li: HTMLElement;
  instance: string;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offX: number;
  offY: number;
  vzorky: VzorekUkazatele[];
  casovac: ReturnType<typeof setTimeout> | null;
  /** Náhledové pořadí (položky s instancí) a pořadí na začátku tahu. */
  poradi: HTMLElement[];
  puvodni: HTMLElement[];
  /** Rozvržení bez transformací — pro zásah a polohu tažené karty. */
  rozvrzeni: Map<HTMLElement, Obdelnik | null>;
  spinave: boolean;
  kandidat: { index: number; od: number } | null;
  /**
   * Položka, která vyvolala poslední přeskládání. Znovu cílem být nemůže,
   * dokud ukazatel neopustí její vnitřní zónu — jinak by karta, která po
   * přesunu zůstala na místě, přeskládávala pořadí dokola (mrizka.cilovyIndex).
   */
  blok: HTMLElement | null;
  zvednutoV: number;
  rolovac: HTMLElement | null;
  zbytekRolovani: number;
  ukonci: () => void;
}

/** Nejbližší předek, který se opravdu posouvá (u administrace <main>), jinak dokument (null). */
function najdiRolovac(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

/** Viditelná horní a spodní hrana pro rolování u okraje; spodní končí u lišty úprav nebo doku. */
function hraniceRolovani(rolovac: HTMLElement | null): { horni: number; dolni: number } {
  const vh = window.innerHeight;
  const r = rolovac ? rolovac.getBoundingClientRect() : { top: 0, bottom: vh };
  // Lišta úprav sedí nad dokem a zapisuje svou výšku do --lista-vyska (PlovouciLista).
  const lista = parseFloat(document.documentElement.style.getPropertyValue('--lista-vyska')) || 0;
  return { horni: Math.max(0, r.top), dolni: Math.min(r.bottom, vh, lista > 0 ? vh - lista : vh) };
}

function posunRolovac(rolovac: HTMLElement | null, o: number): boolean {
  const el = rolovac ?? (document.scrollingElement as HTMLElement | null);
  if (!el) return false;
  const pred = el.scrollTop;
  el.scrollTop = pred + o;
  return el.scrollTop !== pred;
}

export function useTazeni(o: VolbyTazeni) {
  const oRef = useRef(o);
  oRef.current = o;
  const tah = useRef<Tah | null>(null);
  /** Pořadí puštěné karty čeká na zápis do modelu; `order` se smaže ve stejném snímku jako přerovnání DOM. */
  const cekaPoradi = useRef(false);

  const polozky = useCallback((): HTMLElement[] => {
    const ul = oRef.current.mrizka.current;
    return ul ? Array.from(ul.querySelectorAll<HTMLElement>(':scope > li[data-instance]')) : [];
  }, []);
  const vse = useCallback((): HTMLElement[] => {
    const ul = oRef.current.mrizka.current;
    return ul ? Array.from(ul.querySelectorAll<HTMLElement>(':scope > li[data-instance], :scope > li[data-bunka-plus]')) : [];
  }, []);

  const nastavPoradi = (poradi: readonly HTMLElement[]) => { poradi.forEach((el, i) => { el.style.order = String(i); }); };
  const smazPoradi = useCallback(() => { for (const el of polozky()) el.style.order = ''; }, [polozky]);

  /** Rozvržení (bez transformací) všech položek v náhledovém pořadí. */
  const zmerRozvrzeni = (t: Tah) => {
    const { pohyb } = oRef.current;
    const m = new Map<HTMLElement, Obdelnik | null>();
    for (const el of t.poradi) {
      if (el.hidden || el.offsetParent === null) { m.set(el, null); continue; }
      if (el === t.li) {
        const tr = el.style.transform;
        el.style.transform = 'none';
        const r = el.getBoundingClientRect();
        el.style.transform = tr;
        m.set(el, { left: r.left, top: r.top, width: r.width, height: r.height });
      } else {
        const r = el.getBoundingClientRect();
        const s = pohyb.posun(el);
        m.set(el, { left: r.left - s.x, top: r.top - s.y, width: r.width, height: r.height });
      }
    }
    t.rozvrzeni = m;
    t.spinave = false;
  };

  const meritko = (t: Tah, ted: number) =>
    oRef.current.omezeny() ? 1 : 1 + (ZVEDNUTI.meritko - 1) * easeOut(Math.min(1, (ted - t.zvednutoV) / ZVEDNUTI.trvaniMs));

  /** Poloha tažené karty: ukazatel − offset úchopu − rozvržení (1 : 1, bez Reactu). */
  const polohuj = (t: Tah, ted: number) => {
    const L = t.rozvrzeni.get(t.li);
    if (!L) return;
    t.li.style.transform = `translate3d(${t.x - t.offX - L.left}px, ${t.y - t.offY - L.top}px, 0) scale(${meritko(t, ted)})`;
  };

  /** Nový náhled pořadí: `order` všem, ostatní dojedou pružinou (FLIP), tažená zůstane pod prstem. */
  const preskladej = (t: Tah, nove: HTMLElement[]) => {
    const { pohyb } = oRef.current;
    const ostatni = vse().filter(el => el !== t.li);
    const pred = pohyb.zmer(ostatni);
    t.poradi = nove;
    nastavPoradi(nove);
    pohyb.flip(ostatni, pred, t.li);
    zmerRozvrzeni(t);
    polohuj(t, performance.now());
  };

  const snimek = (dt: number, ted: number) => {
    const t = tah.current;
    if (!t || t.faze !== 'tahne') return;
    // 1) Rolování u okraje: čím blíž hraně, tím rychleji (1100 px/s na hraně).
    const { horni, dolni } = hraniceRolovani(t.rolovac);
    const dTop = t.y - horni;
    const dBot = dolni - t.y;
    const v = dTop < dBot ? -rychlostRolovani(dTop) : rychlostRolovani(dBot);
    if (v) {
      t.zbytekRolovani += v * Math.min(dt, 0.05);
      const cele = Math.trunc(t.zbytekRolovani);
      if (cele) {
        t.zbytekRolovani -= cele;
        if (posunRolovac(t.rolovac, cele)) t.spinave = true;
      }
    }
    if (t.spinave) zmerRozvrzeni(t);
    // 2) Karta pod prstem.
    polohuj(t, ted);
    // 3) Cíl: vnitřní zóna jiné položky; nový cíl platí, až v něm ukazatel
    //    vydrží 80 ms — rychlý přejezd nepřeskládá všechno, co minul.
    const bod = { x: t.x, y: t.y };
    if (t.blok) {
      const rb = t.rozvrzeni.get(t.blok);
      if (!rb || !veVnitrniZone(bod, rb)) t.blok = null;
    }
    const tazeny = t.poradi.indexOf(t.li);
    const obdelniky = t.poradi.map(el => t.rozvrzeni.get(el) ?? null);
    const c = cilovyIndex(bod, obdelniky, tazeny, tazeny, t.blok ? t.poradi.indexOf(t.blok) : -1);
    if (c === tazeny) { t.kandidat = null; return; }
    if (!t.kandidat || t.kandidat.index !== c) { t.kandidat = { index: c, od: ted }; return; }
    if (ted - t.kandidat.od < PRODLEVA_CILE_MS) return;
    t.kandidat = null;
    t.blok = t.poradi[c];
    preskladej(t, presun(t.poradi, tazeny, c));
  };

  const konec = (t: Tah) => {
    if (t.casovac) clearTimeout(t.casovac);
    t.ukonci();
    if (tah.current === t) tah.current = null;
  };

  const zvedni = (t: Tah) => {
    const o = oRef.current;
    const li = t.li;
    try { li.setPointerCapture(t.pointerId); } catch { konec(t); return; }
    // Offset úchopu se měří z polohy, kde člověk kartu vidí (i uprostřed
    // pružiny), a pak zůstává stálý — karta se nikdy nevycentruje pod prst.
    const r = li.getBoundingClientRect();
    if (!t.offX && !t.offY) { t.offX = t.x - r.left; t.offY = t.y - r.top; }
    t.offX = Math.min(Math.max(0, t.offX), r.width);
    t.offY = Math.min(Math.max(0, t.offY), r.height);
    o.pohyb.zastav(li);
    t.poradi = polozky();
    t.puvodni = [...t.poradi];
    nastavPoradi(t.poradi);
    zmerRozvrzeni(t);
    li.style.transformOrigin = `${t.offX}px ${t.offY}px`;
    li.setAttribute('data-zvednuty', '');
    o.koren.current?.setAttribute('data-tazeni', '');
    t.faze = 'tahne';
    t.zvednutoV = performance.now();
    t.rolovac = najdiRolovac(li);
    polohuj(t, t.zvednutoV);
    o.pohyb.naSnimek(snimek);
    vibruj(t.pointerType);
    o.onZvednuti(t.instance, t.puvodni.indexOf(li), t.puvodni.length);
  };

  /** Dosednutí po puštění (nebo návrat po zrušení) s rychlostí prstu. */
  const dosedni = (t: Tah, vx: number, vy: number, potvrdit: boolean) => {
    const o = oRef.current;
    o.pohyb.naSnimek(null);
    // Pořadí se smí zapsat jen nad tímtéž modelem, nad kterým tah začal. Když
    // se mezitím změnil (409 s novějším stavem z jiného okna, Vrátit z toastu
    // druhým prstem), snímek `t.poradi` je zastaralý a zápis by novější stav
    // tiše přepsal — tah se proto jen zruší (review kola 68, rev-fyz3 t7).
    if (potvrdit) {
      const vDom = polozky();
      if (vDom.length !== t.poradi.length || t.poradi.some(el => !el.isConnected)) potvrdit = false;
    }
    const li = t.li;
    const m = meritko(t, performance.now());
    if (!potvrdit && t.poradi.some((el, i) => el !== t.puvodni[i])) {
      // Zrušení: náhled zpátky na původní pořadí, ostatní se vrátí pružinou.
      preskladej(t, [...t.puvodni]);
    }
    const L = t.rozvrzeni.get(li);
    const x = L ? t.x - t.offX - L.left : 0;
    const y = L ? t.y - t.offY - L.top : 0;
    o.koren.current?.removeAttribute('data-tazeni');
    // Vlnění se vrátí, až karta dosedne — se svou fází, jako by se nic nestalo.
    o.pohyb.pust(li, x, y, vx, vy, m, () => li.removeAttribute('data-zvednuty'));
    const z = t.puvodni.indexOf(li);
    const na = t.poradi.indexOf(li);
    const pocet = t.puvodni.length;
    const poradi = t.poradi.map(el => el.dataset.instance ?? '');
    konec(t);
    if (potvrdit && na !== z) {
      // `order` zůstává, dokud React nepřerovná DOM (dokonciPoradi v useLayoutEffect
      // plochy) — obojí ve stejném snímku, takže nic neskočí. Pojistka: kdyby
      // se model nezměnil, smaže se o snímek později.
      cekaPoradi.current = true;
      requestAnimationFrame(() => requestAnimationFrame(() => { if (cekaPoradi.current) { cekaPoradi.current = false; smazPoradi(); } }));
      vibruj(t.pointerType);
      o.onPusteni(t.instance, z, na, pocet, poradi);
    } else {
      smazPoradi();
      if (potvrdit) o.onPusteni(t.instance, z, z, pocet, poradi);
      else o.onZruseni(t.instance);
    }
  };

  const zrus = useCallback(() => {
    const t = tah.current;
    if (!t) return;
    if (t.faze === 'tahne') dosedni(t, 0, 0, false);
    else konec(t);
  // dosedni a konec čtou jen refy.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Připojí posluchače na window pro jeden tah (jeden ukazatel). */
  const sleduj = (t: Tah) => {
    const pohyb = (e: PointerEvent) => {
      if (e.pointerId !== t.pointerId) return;
      t.x = e.clientX;
      t.y = e.clientY;
      if (t.faze === 'tahne') {
        t.vzorky.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
        const hranice = e.timeStamp - RYCHLOST_PUSTENI.oknoMs * 2;
        while (t.vzorky.length > 12 || (t.vzorky.length && t.vzorky[0].t < hranice)) t.vzorky.shift();
        return;
      }
      const d = Math.hypot(e.clientX - t.startX, e.clientY - t.startY);
      if (t.pointerType === 'mouse') { if (d > AKTIVACE_TAHU.mysPx) zvedni(t); }
      // Dotyk, který se pohnul dřív než za 180 ms, roluje stránku — tah nebude.
      else if (d > HYSTEREZE_PX) konec(t);
    };
    const pusteni = (e: PointerEvent) => {
      if (e.pointerId !== t.pointerId) return;
      if (t.faze === 'tahne') {
        t.x = e.clientX;
        t.y = e.clientY;
        // Vzorek z pointerup se počítá jako poslední: prst, který zastavil
        // a chvíli držel, nemá kartu po puštění „odhodit" (pruzina.ts).
        const v = rychlostZVzorku(t.vzorky, { t: e.timeStamp, x: e.clientX, y: e.clientY });
        dosedni(t, v.vx, v.vy, true);
        return;
      }
      const d = Math.hypot(e.clientX - t.startX, e.clientY - t.startY);
      const limit = t.pointerType === 'mouse' ? AKTIVACE_TAHU.mysPx : HYSTEREZE_PX;
      konec(t);
      if (d > limit) return;
      if (t.pointerType !== 'mouse') {
        // Klepnutí otevře nastavení hned na pointerup. Prohlížeč po touchend
        // dosílá kompatibilní mousedown a click — ty by trefily překryv právě
        // otevřeného okna a zase ho zavřely. Zrušený touchend je nepošle.
        const tlum = (ev: TouchEvent) => { if (ev.cancelable) ev.preventDefault(); pryc(); };
        const pryc = () => window.removeEventListener('touchend', tlum, true);
        window.addEventListener('touchend', tlum, { capture: true, passive: false });
        setTimeout(pryc, 300);
      }
      oRef.current.onKlepnuti(t.instance);
    };
    const zruseni = (e: PointerEvent) => {
      if (e.pointerId !== t.pointerId) return;
      if (t.faze === 'tahne') dosedni(t, 0, 0, false);
      else konec(t);
    };
    const ztrataCapture = (e: PointerEvent) => {
      // Capture se ztratí i s pointerup (to vyřídí `pusteni`); jinak je to přerušení.
      if (e.pointerId === t.pointerId && tah.current === t && t.faze === 'tahne') {
        setTimeout(() => { if (tah.current === t && t.faze === 'tahne') dosedni(t, 0, 0, false); }, 0);
      }
    };
    const klavesa = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || t.faze !== 'tahne') return;
      e.preventDefault();
      e.stopPropagation();
      dosedni(t, 0, 0, false);
    };
    const posun = () => { if (t.faze === 'tahne') t.spinave = true; };
    window.addEventListener('pointermove', pohyb, { passive: true });
    window.addEventListener('pointerup', pusteni);
    window.addEventListener('pointercancel', zruseni);
    t.li.addEventListener('lostpointercapture', ztrataCapture);
    // Escape zachytit dřív než plocha (ta by ukončila celé úpravy).
    window.addEventListener('keydown', klavesa, true);
    window.addEventListener('scroll', posun, { capture: true, passive: true });
    t.ukonci = () => {
      window.removeEventListener('pointermove', pohyb);
      window.removeEventListener('pointerup', pusteni);
      window.removeEventListener('pointercancel', zruseni);
      t.li.removeEventListener('lostpointercapture', ztrataCapture);
      window.removeEventListener('keydown', klavesa, true);
      window.removeEventListener('scroll', posun, { capture: true });
    };
  };

  const novyTah = (li: HTMLElement, instance: string, pointerId: number, pointerType: string, x: number, y: number): Tah => ({
    faze: 'ceka', li, instance, pointerId, pointerType, startX: x, startY: y, x, y, offX: 0, offY: 0,
    vzorky: [], casovac: null, poradi: [], puvodni: [], rozvrzeni: new Map(), spinave: false, kandidat: null, blok: null,
    zvednutoV: 0, rolovac: null, zbytekRolovani: 0, ukonci: () => {},
  });

  /** Na <li> v režimu úprav. */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const o = oRef.current;
    // Další prsty se během tahu ignorují — přehmat by kartu přenesl pod jiný prst (emil).
    if (!o.aktivni || tah.current) return;
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if ((e.target as Element).closest('[data-odznak], [data-plocha-chrom]')) return;
    const li = e.currentTarget;
    const instance = li.dataset.instance;
    if (!instance) return;
    const t = novyTah(li, instance, e.pointerId, e.pointerType, e.clientX, e.clientY);
    tah.current = t;
    sleduj(t);
    if (e.pointerType !== 'mouse') {
      t.casovac = setTimeout(() => { if (tah.current === t && t.faze === 'ceka') zvedni(t); }, AKTIVACE_TAHU.dotykMs);
    }
  // sleduj a zvedni čtou jen refy.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Pokračování tahem z kontextového menu: karta se zvedne pod ukazatelem, který je pořád dole. */
  const zvedniZvenku = useCallback((z: ZvednutiZvenku) => {
    if (tah.current || !oRef.current.aktivni) return;
    const instance = z.li.dataset.instance;
    if (!instance) return;
    const t = novyTah(z.li, instance, z.pointerId, z.pointerType, z.x, z.y);
    t.offX = z.offX;
    t.offY = z.offY;
    tah.current = t;
    sleduj(t);
    zvedni(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Po zápisu pořadí do modelu: React přerovnal DOM, `order` pryč ve stejném snímku. */
  const dokonciPoradi = useCallback(() => {
    if (!cekaPoradi.current) return;
    cekaPoradi.current = false;
    smazPoradi();
  }, [smazPoradi]);

  const tahne = useCallback(() => tah.current?.faze === 'tahne', []);

  // Nepasivní touchmove jen v režimu úprav a preventDefault jen během tahu:
  // mimo úpravy by brzdil rolování celého přehledu, a `touch-action: pan-y`
  // na widgetech nechává svislé rolování prohlížeči, dokud tah nezačne.
  useEffect(() => {
    if (!o.aktivni) return;
    const h = (e: TouchEvent) => { if (tah.current?.faze === 'tahne' && e.cancelable) e.preventDefault(); };
    window.addEventListener('touchmove', h, { passive: false });
    return () => window.removeEventListener('touchmove', h);
  }, [o.aktivni]);

  // Odchod z úprav nebo odmontování uprostřed tahu: karta se vrátí na místo.
  useEffect(() => { if (!o.aktivni) zrus(); }, [o.aktivni, zrus]);
  useEffect(() => zrus, [zrus]);

  return { onPointerDown, zvedniZvenku, dokonciPoradi, tahne, zrus };
}

export default useTazeni;
