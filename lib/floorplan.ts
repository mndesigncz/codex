// Půdorys podniku: co se kreslí pod stoly. Souřadnice jsou v procentech
// plátna (0–100 v obou osách), takže plánek sedí na telefonu i na monitoru
// bez přepočtů. Poměr stran drží `ratio`; při nahrání podkladu se vezme
// z jeho viewBoxu.

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
  if (typeof raw?.bg?.svg === 'string' && raw.bg.svg.length < 500_000) bg = { svg: raw.bg.svg };
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

/**
 * Barva značky podniku: jas rozhodne, jestli na ní bude text tmavý, nebo
 * bílý. Bez toho by si podnik mohl vybrat žlutou a popisky by zmizely.
 */
export function onAccent(hex?: string | null): string {
  const c = String(hex ?? '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(c)) return '#16181A';
  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
  // Vnímaný jas (ITU-R BT.601) — na světlé barvě tmavý inkoust, na tmavé bílá.
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#16181A' : '#FFFFFF';
}
