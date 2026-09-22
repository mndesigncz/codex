// Půdorys podniku: co se kreslí pod stoly. Souřadnice jsou v procentech
// plátna (0–100 v obou osách), takže plánek sedí na telefonu i na monitoru
// bez přepočtů. Poměr stran drží `ratio`; při nahrání podkladu se vezme
// z jeho viewBoxu.

import { sanitizeSvg } from './svgSanitize.ts';
export type Shape =
  | { id: string; type: 'wall'; x1: number; y1: number; x2: number; y2: number; t: number }
  | { id: string; type: 'room'; x: number; y: number; w: number; h: number; label?: string }
  | { id: string; type: 'label'; x: number; y: number; text: string };

export interface FloorPlan {
  v: 1;
  ratio: number;                              // šířka / výška plátna
  bg: { svg: string } | { src: string } | null;
  bgOpacity: number;
  shapes: Shape[];
}

export const EMPTY_PLAN: FloorPlan = { v: 1, ratio: 3 / 2, bg: null, bgOpacity: 0.55, shapes: [] };

const pct = (v: any, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(-20, Math.min(120, Math.round(n * 100) / 100)) : d; };
const size = (v: any, d = 8) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0.5, Math.min(120, Math.round(n * 100) / 100)) : d; };
const txt = (v: any, max = 40) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);

/** Cokoli přijde z prohlížeče projde tímhle sítem — server tvarům nevěří. */
export function normalizePlan(raw: any): FloorPlan {
  const r = Number(raw?.ratio);
  const shapes: Shape[] = [];
  for (const s of Array.isArray(raw?.shapes) ? raw.shapes.slice(0, 300) : []) {
    const id = txt(s?.id, 24) || Math.random().toString(36).slice(2, 10);
    if (s?.type === 'wall') shapes.push({ id, type: 'wall', x1: pct(s.x1), y1: pct(s.y1), x2: pct(s.x2), y2: pct(s.y2), t: Math.max(0.3, Math.min(6, Number(s.t) || 1.2)) });
    else if (s?.type === 'room') shapes.push({ id, type: 'room', x: pct(s.x), y: pct(s.y), w: size(s.w, 20), h: size(s.h, 15), label: txt(s.label) || undefined });
    else if (s?.type === 'label') { const text = txt(s.text); if (text) shapes.push({ id, type: 'label', x: pct(s.x), y: pct(s.y), text }); }
  }
  let bg: FloorPlan['bg'] = null;
  // SVG se kreslí přes dangerouslySetInnerHTML — na veřejné stránce podniku
  // i v editoru. Čistička dřív běžela jen při nahrání souboru; PUT plánku
  // bral `bg.svg` tak, jak ho poslal prohlížeč, takže kdokoli s účtem
  // vedení mohl uložit `<img onerror=…>` a skript se spustil každému hostovi
  // i personálu cizích podniků na doméně aplikace. Teď projde čističkou
  // při KAŽDÉM průchodu — při uložení i při čtení, takže se zneškodní i to,
  // co už v databázi leží.
  if (typeof raw?.bg?.svg === 'string' && raw.bg.svg.length < 500_000) {
    try { bg = { svg: sanitizeSvg(raw.bg.svg, 500_000).svg }; } catch { bg = null; }
  }
  else if (typeof raw?.bg?.src === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(raw.bg.src) && raw.bg.src.length < 700_000) bg = { src: raw.bg.src };
  return {
    v: 1,
    ratio: Number.isFinite(r) ? Math.max(0.4, Math.min(4, r)) : EMPTY_PLAN.ratio,
    bg,
    bgOpacity: Math.max(0.05, Math.min(1, Number(raw?.bgOpacity) || EMPTY_PLAN.bgOpacity)),
    shapes,
  };
}

/** Prázdný plánek = nic k vykreslení; hostovi se pak neukáže vůbec. */
export function planIsEmpty(p: FloorPlan | null | undefined): boolean {
  return !p || (!p.bg && p.shapes.length === 0);
}

export interface MapTable {
  id: number; name: string; seats: number;
  map_x?: number | null; map_y?: number | null;
  map_w?: number | null; map_h?: number | null;
  map_shape?: string | null; map_rot?: number | null;
}

export function placedTables(tables: MapTable[] | null | undefined): MapTable[] {
  return (tables ?? []).filter(t => t.map_x != null && t.map_y != null);
}

/** Výchozí rozměr stolu podle počtu míst, když si ho vedení nepřekreslilo. */
export function tableBox(t: MapTable): { w: number; h: number; shape: string; rot: number } {
  const seats = Number(t.seats) || 2;
  const base = seats >= 8 ? 14 : seats >= 5 ? 11 : seats >= 3 ? 9 : 7;
  return {
    w: Number(t.map_w) > 0 ? Number(t.map_w) : base,
    h: Number(t.map_h) > 0 ? Number(t.map_h) : (seats >= 5 ? base * 0.62 : base),
    shape: t.map_shape === 'rect' || t.map_shape === 'circle' ? t.map_shape : (seats >= 5 ? 'rect' : 'circle'),
    rot: Number(t.map_rot) || 0,
  };
}

/** Relativní jas podle WCAG 2.1. */
function jas(r: number, g: number, b: number): number {
  const k = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b);
}

/** Kontrastní poměr dvou barev podle WCAG 2.1. */
export function kontrast(a: [number, number, number], b: [number, number, number]): number {
  const la = jas(...a), lb = jas(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function slozky(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const INKOUST: [number, number, number] = [22, 24, 26];
const BILA: [number, number, number] = [255, 255, 255];

/**
 * Text na barvě značky podniku — tmavý, nebo bílý.
 *
 * Dřív o tom rozhodoval vnímaný jas (ITU-R BT.601) s prahem 150. To je
 * heuristika z devadesátek, ne kontrast, a na barvě, kterou si podnik
 * vybere sám, selhávala na **28 % barevného prostoru**. Naměřeno na
 * skutečných značkových barvách:
 *
 *   #F97316 (oranžová) → bílý text, 2,80:1
 *   #14B8A6 (tyrkysová) → bílý text, 2,49:1
 *   #00FF00 (zelená)    → bílý text, 1,37:1
 *
 * Kavárna, která si zvolí oranžovou, tak měla na své vlastní stránce
 * tlačítko „Stát se členem", které si její hosté nepřečtou.
 *
 * Teď se počítá skutečný kontrast obou možností a bere se lepší. Selhání
 * pod 4,5:1 tím klesne na 6,5 % a nejhorší dosažitelná hodnota je 4,22:1
 * místo 1,37:1 — pod 3:1 se nedostane žádná barva.
 *
 * Zbylých 6,5 % nejde spravit výběrem inkoustu, jen změnou samotné barvy.
 * To je rozhodnutí podniku, ne naše, takže se mu to řekne v Nastavení →
 * Vzhled (viz `staciKontrast`).
 */
export function onAccent(hex?: string | null): string {
  const c = String(hex ?? '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(c)) return '#16181A';
  const bg = slozky(c);
  return kontrast(INKOUST, bg) >= kontrast(BILA, bg) ? '#16181A' : '#FFFFFF';
}

/**
 * Dá se na téhle barvě značky vůbec dosáhnout čitelného textu?
 *
 * Když ne, není to chyba, kterou bychom měli opravit za podnik — barva je
 * jeho. Ale mlčet o tom znamená nechat ho vydat stránku, kterou si hosté
 * nepřečtou.
 */
export function staciKontrast(hex?: string | null, prah = 4.5): boolean {
  const c = String(hex ?? '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(c)) return true;
  const bg = slozky(c);
  return Math.max(kontrast(INKOUST, bg), kontrast(BILA, bg)) >= prah;
}
