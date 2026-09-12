// Nahraný půdorys je cizí soubor. SVG umí skript, odkaz i načtení cizího
// obsahu — do stránky se proto nepustí nic, co není čistá kresba. Bílá
// listina je schválně krátká: co v ní není, vypadne. Radši ořezaný plánek
// než skript na doméně aplikace.

const TAGS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse',
  'line', 'polyline', 'polygon', 'text', 'tspan', 'clippath', 'lineargradient',
  'radialgradient', 'stop', 'pattern', 'mask', 'symbol',
]);

const ATTRS = new Set([
  'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'width', 'height', 'viewbox', 'points', 'transform', 'fill', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'stroke-dashoffset', 'stroke-opacity', 'stroke-miterlimit', 'fill-opacity',
  'fill-rule', 'clip-rule', 'opacity', 'offset', 'stop-color', 'stop-opacity',
  'gradientunits', 'gradienttransform', 'patternunits', 'maskunits',
  'clippathunits', 'font-size', 'font-family', 'font-weight', 'text-anchor',
  'dominant-baseline', 'letter-spacing', 'id', 'class', 'preserveaspectratio',
]);

/** Odkaz na vlastní <defs> je v pořádku; cokoli s protokolem nebo lomítkem ne. */
function safeValue(name: string, value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.includes('javascript:') || v.includes('data:text') || v.includes('expression(')) return false;
  if ((name === 'fill' || name === 'stroke' || name === 'mask' || name === 'clip-path') && v.startsWith('url(')) {
    return /^url\(['"]?#[\w.:-]+['"]?\)$/.test(v);
  }
  return true;
}

// HTML parser si názvy převede sám, ale spoléhat se na to nebudu: co je
// v SVG psané velbloudem, takové se i uloží.
const CASE: Record<string, string> = {
  viewbox: 'viewBox', gradientunits: 'gradientUnits', gradienttransform: 'gradientTransform',
  patternunits: 'patternUnits', maskunits: 'maskUnits', clippathunits: 'clipPathUnits',
  preserveaspectratio: 'preserveAspectRatio',
};
const TAG_CASE: Record<string, string> = {
  clippath: 'clipPath', lineargradient: 'linearGradient', radialgradient: 'radialGradient',
};

export interface SanitizedSvg { svg: string; ratio: number }

/**
 * Vrátí očištěné SVG a poměr stran z viewBoxu (nebo z width/height).
 * Chybu vyhodí, když soubor SVG vůbec není nebo po očištění nic nezbude.
 */
export function sanitizeSvg(raw: string, maxBytes = 400_000): SanitizedSvg {
  const src = String(raw ?? '');
  if (src.length > maxBytes) throw new Error(`Soubor je moc velký (max ${Math.round(maxBytes / 1024)} kB).`);
  if (!/<svg[\s>]/i.test(src)) throw new Error('Tohle není SVG.');

  // Celé bloky, které se nekreslí, padají i s obsahem.
  let s = src
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|foreignObject|animate|animateTransform|animateMotion|set|use|image|a|iframe|object|embed|video|audio)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|foreignObject|animate|animateTransform|animateMotion|set|use|image|a|iframe|object|embed)\b[^>]*\/>/gi, '');

  let ratio = 3 / 2;
  const vb = s.match(/viewBox\s*=\s*["']([-\d.eE\s,]+)["']/i);
  if (vb) {
    const n = vb[1].trim().split(/[\s,]+/).map(Number);
    if (n.length === 4 && n[2] > 0 && n[3] > 0) ratio = n[2] / n[3];
  } else {
    const w = Number((s.match(/\bwidth\s*=\s*["']([\d.]+)/i) ?? [])[1]);
    const h = Number((s.match(/\bheight\s*=\s*["']([\d.]+)/i) ?? [])[1]);
    if (w > 0 && h > 0) ratio = w / h;
  }
  if (!Number.isFinite(ratio) || ratio <= 0) ratio = 3 / 2;
  ratio = Math.max(0.4, Math.min(4, ratio));

  // Značka po značce: neznámá jde pryč, u známé se přeberou jen bílé atributy.
  const out = s.replace(/<\/?([a-zA-Z][\w:-]*)([^>]*)>/g, (_m, tag: string, attrs: string) => {
    const name = String(tag).toLowerCase().replace(/^svg:/, '');
    if (!TAGS.has(name)) return '';
    const outName = TAG_CASE[name] ?? name;
    if (_m.startsWith('</')) return `</${outName}>`;
    const kept: string[] = [];
    const re = /([a-zA-Z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    while ((a = re.exec(attrs))) {
      const key = a[1].toLowerCase().replace(/^svg:/, '');
      const val = a[3] ?? a[4] ?? '';
      if (key.startsWith('on') || key.includes('href') || key.startsWith('xlink')) continue;
      if (!ATTRS.has(key)) continue;
      if (!safeValue(key, val)) continue;
      kept.push(`${CASE[key] ?? key}="${val.replace(/"/g, '&quot;')}"`);
    }
    const selfClose = /\/\s*>$/.test(_m) ? ' /' : '';
    return `<${outName}${kept.length ? ' ' + kept.join(' ') : ''}${selfClose}>`;
  }).trim();

  if (!/<svg[\s>]/i.test(out)) throw new Error('Ze souboru nezbyla žádná kresba.');
  return { svg: out, ratio };
}
