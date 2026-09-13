// Vzhled QR kódu na stůl.
//
// Vytištěná kartička je jediná věc z celé appky, kterou host fyzicky drží v
// ruce — a doteď vypadala u všech podniků stejně. Tady se dá nastavit barva,
// text, logo uprostřed a formát archu, na který se tiskne.
//
// Uloženo v client_profiles.qr_design jako JSON. Nic z toho se nedostane do
// stránky nezkontrolované: barvy projdou přes tvar #RRGGBB, texty se zkrátí
// a proženou escapem, formát a styl jsou jen z povolených hodnot.

export type QrSheet = 'card' | 'a4-2' | 'a4-4' | 'a4-8';
export type QrStyle = 'clean' | 'framed' | 'dark';

export interface QrDesign {
  /** Barva samotného kódu. Světlá barva se nenaskenuje, proto kontrolujeme jas. */
  dark: string;
  /** Podklad kartičky. */
  light: string;
  /** Nadpis; prázdný znamená název podniku. */
  headline: string;
  /** Věta pod nadpisem. */
  sub: string;
  /** Ukázat řádek „Stůl X". */
  showTable: boolean;
  /** Logo podniku doprostřed kódu. Jen když ho profil má. */
  logo: boolean;
  /** Hrana QR v milimetrech. */
  size: number;
  sheet: QrSheet;
  style: QrStyle;
}

export const QR_DEFAULT: QrDesign = {
  dark: '#16181A', light: '#FFFFFF',
  headline: '', sub: 'Naskenuj a objednej od stolu',
  showTable: true, logo: false, size: 60, sheet: 'card', style: 'clean',
};

export const QR_SHEETS: { id: QrSheet; label: string; hint: string; perPage: number; cols: number }[] = [
  { id: 'card', label: 'Jedna kartička', hint: 'Na stůl, 88 mm na šířku.', perPage: 1, cols: 1 },
  { id: 'a4-2', label: 'A4 · 2 na stránku', hint: 'Velké, na stojánek.', perPage: 2, cols: 1 },
  { id: 'a4-4', label: 'A4 · 4 na stránku', hint: 'Běžný stolní formát.', perPage: 4, cols: 2 },
  { id: 'a4-8', label: 'A4 · 8 na stránku', hint: 'Malé štítky na hranu stolu.', perPage: 8, cols: 2 },
];

export const QR_STYLES: { id: QrStyle; label: string; hint: string }[] = [
  { id: 'clean', label: 'Čistý', hint: 'Bez rámečku, jen kód a text.' },
  { id: 'framed', label: 'S rámečkem', hint: 'Tenká linka kolem — pomůže při stříhání.' },
  { id: 'dark', label: 'Tmavý', hint: 'Inverzní kartička v barvě značky.' },
];

const hex = (v: any, d: string) => {
  const c = String(v ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : d;
};

/** Relativní jas 0–1. Pod 0,45 je barva dost tmavá, aby ji čtečka vzala. */
export function luminance(color: string): number {
  const c = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000';
  const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Kontrast dvou barev podle WCAG. QR potřebuje aspoň 3:1, jinak se nenačte. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function normalizeQrDesign(raw: any): QrDesign {
  const d = raw && typeof raw === 'object' ? raw : {};
  const size = Math.max(25, Math.min(120, Math.round(Number(d.size) || QR_DEFAULT.size)));
  const sheet = (QR_SHEETS.find(s => s.id === d.sheet)?.id ?? QR_DEFAULT.sheet) as QrSheet;
  const style = (QR_STYLES.find(s => s.id === d.style)?.id ?? QR_DEFAULT.style) as QrStyle;
  let dark = hex(d.dark, QR_DEFAULT.dark);
  const light = hex(d.light, QR_DEFAULT.light);
  // Nečitelný kód je horší než nehezký: když je kontrast pod 3:1, vrátíme se
  // k černé. Vedení to v náhledu uvidí dřív, než pošle arch do tiskárny.
  if (contrast(dark, light) < 3) dark = QR_DEFAULT.dark;
  return {
    dark, light,
    headline: String(d.headline ?? '').slice(0, 40),
    sub: String(d.sub ?? QR_DEFAULT.sub).slice(0, 80),
    showTable: d.showTable !== false,
    logo: !!d.logo,
    size, sheet, style,
  };
}

export const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
