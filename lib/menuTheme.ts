// Vzhled zákaznického menu.
//
// Stránka /menu-akce.html má vzhled Čajbaru Pangea zapečený v sobě (barvy,
// písma Nayuki a Poppins, logo, listy na pozadí). To je fajn pro ně, ale
// pro jiný podnik je to cizí design — tenhle soubor z toho dělá nastavení.
//
// Výchozí hodnoty jsou schválně přesně ty zapečené. Menu, které vzhled
// nastavený nemá, tak vypadá úplně stejně jako předtím; teprve když si ho
// podnik nastaví, stránka se přebarví. Nové menu si při zakládání vezme
// barvy z Vzhledu sdílených stránek (teams.share_theme), aby nový podnik
// nezačínal v cizích barvách.

export interface MenuPaleta {
  /** Pozadí desky. */
  bg: string;
  /** Názvy položek a hlavní text. */
  fg: string;
  /** Popisky, patička — tlumený text. */
  fgSoft: string;
  /** Nadpisy, ceny, logo. */
  accent: string;
}

export type LogoRezim = 'maska' | 'obrazek';
export type PozadiDruh = 'listy' | 'zadne' | 'vlastni';

export interface MenuTheme {
  den: MenuPaleta;
  noc: MenuPaleta;
  logo: {
    /** Prázdné = použije se logo zapečené ve stránce. */
    url: string;
    /**
     * maska  — jednobarevné logo se obarví akcentem (drží se odstínu textů)
     * obrazek — logo se vloží tak, jak je (pro vícebarevná loga)
     */
    rezim: LogoRezim;
  };
  pismo: {
    /** 'nayuki' | 'poppins' | 'system' | název rodiny z Google Fonts */
    nadpisy: string;
    text: string;
  };
  pozadi: {
    druh: PozadiDruh;
    /** Jen pro druh 'vlastni' — jednobarevný obrázek, použije se jako maska. */
    url: string;
    /** Síla v procentech; 0 = neviditelné. */
    sila: number;
  };
}

/** Přesně to, co je dneska zapečené ve stránce. */
export const VYCHOZI_THEME: MenuTheme = {
  den: { bg: '#E3DED5', fg: '#1C1C1C', fgSoft: '#6E6A62', accent: '#9C7724' },
  noc: { bg: '#1C1C1C', fg: '#E3DED5', fgSoft: '#8E8E8E', accent: '#BE973C' },
  logo: { url: '', rezim: 'maska' },
  pismo: { nadpisy: 'nayuki', text: 'poppins' },
  pozadi: { druh: 'listy', url: '', sila: 5.5 },
};

/**
 * Průhlednost linek a odlesků. Jsou to konstanty, ne nastavení — jde
 * o vlásečnice, kde by posuvník nikomu nic nedal, a takhle sedí na
 * hodnoty, které stránka používala doteď.
 */
const LINKA = { den: 0.22, noc: 0.2 };
const ODLESK = { den: 0.06, noc: 0.05 };

const HEX = /^#[0-9a-fA-F]{3,8}$/;

function barva(raw: any, zaloha: string): string {
  const v = String(raw ?? '').trim();
  return HEX.test(v) ? v : zaloha;
}

/** Jen http(s) a data: obrázky — cokoliv jiného by mohlo propašovat skript. */
function obrazek(raw: any): string {
  const v = String(raw ?? '').trim();
  return /^(https?:\/\/|data:image\/)/i.test(v) ? v.slice(0, 2000) : '';
}

/** Název písma: vestavěné klíče, nebo rodina z Google Fonts. */
function pismoNazev(raw: any, zaloha: string): string {
  const v = String(raw ?? '').trim().slice(0, 40);
  if (!v) return zaloha;
  if (v === 'nayuki' || v === 'poppins' || v === 'system') return v;
  // U Google Fonts necháme jen to, co může být v názvu rodiny.
  const ocisteno = v.replace(/[^A-Za-z0-9 ]/g, '').trim();
  return ocisteno || zaloha;
}

function paleta(raw: any, zaloha: MenuPaleta): MenuPaleta {
  const p = raw && typeof raw === 'object' ? raw : {};
  return {
    bg: barva(p.bg, zaloha.bg),
    fg: barva(p.fg, zaloha.fg),
    fgSoft: barva(p.fgSoft, zaloha.fgSoft),
    accent: barva(p.accent, zaloha.accent),
  };
}

export function normalizeMenuTheme(raw: any): MenuTheme {
  const t = raw && typeof raw === 'object' ? raw : {};
  const druh = t?.pozadi?.druh;
  const sila = Number(t?.pozadi?.sila);
  return {
    den: paleta(t.den, VYCHOZI_THEME.den),
    noc: paleta(t.noc, VYCHOZI_THEME.noc),
    logo: {
      url: obrazek(t?.logo?.url),
      rezim: t?.logo?.rezim === 'obrazek' ? 'obrazek' : 'maska',
    },
    pismo: {
      nadpisy: pismoNazev(t?.pismo?.nadpisy, VYCHOZI_THEME.pismo.nadpisy),
      text: pismoNazev(t?.pismo?.text, VYCHOZI_THEME.pismo.text),
    },
    pozadi: {
      druh: (druh === 'zadne' || druh === 'vlastni') ? druh : 'listy',
      url: obrazek(t?.pozadi?.url),
      sila: Number.isFinite(sila) ? Math.min(40, Math.max(0, sila)) : VYCHOZI_THEME.pozadi.sila,
    },
  };
}

/** Rozloží #RRGGBB (i zkrácené #abc) na složky. */
function slozky(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  const plny = v.length === 3 ? v.split('').map(c => c + c).join('') : v.slice(0, 6);
  const n = parseInt(plny, 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Míchá dvě barvy — pro odvození tlumeného textu z hlavního a pozadí. */
export function smichej(a: string, b: string, podil: number): string {
  const [r1, g1, b1] = slozky(a);
  const [r2, g2, b2] = slozky(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * podil);
  return '#' + [m(r1, r2), m(g1, g2), m(b1, b2)]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}

/** #RRGGBB → rgba(r,g,b,alpha). Zkrácený zápis (#abc) taky zvládne. */
export function sPruhlednosti(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const plny = v.length === 3 ? v.split('').map(c => c + c).join('') : v.slice(0, 6);
  const n = parseInt(plny, 16);
  if (!Number.isFinite(n)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Vzhled → hodnoty CSS proměnných, které stránka menu používá.
 * Vrací zvlášť sadu pro den a pro noc; stránka je nasadí na :root.
 */
export function cssProDen(t: MenuTheme): Record<string, string> {
  return {
    '--bg': t.den.bg,
    '--fg': t.den.fg,
    '--fg-soft': t.den.fgSoft,
    '--accent': t.den.accent,
    '--rule': sPruhlednosti(t.den.fg, LINKA.den),
    '--shade': sPruhlednosti(t.den.fg, ODLESK.den),
    '--leaf': sPruhlednosti(t.den.fg, t.pozadi.sila / 100),
  };
}

export function cssProNoc(t: MenuTheme): Record<string, string> {
  return {
    '--bg': t.noc.bg,
    '--fg': t.noc.fg,
    '--fg-soft': t.noc.fgSoft,
    '--accent': t.noc.accent,
    '--rule': sPruhlednosti(t.noc.fg, LINKA.noc),
    '--shade': sPruhlednosti(t.noc.fg, ODLESK.noc),
    '--leaf': sPruhlednosti(t.noc.fg, t.pozadi.sila / 100),
  };
}

/** Hotové sady barev, ať podnik nemusí vybírat hexy. */
export const PREDLOHY: { id: string; label: string; theme: Pick<MenuTheme, 'den' | 'noc'> }[] = [
  {
    id: 'pangea', label: 'Zlatá a krémová',
    theme: { den: VYCHOZI_THEME.den, noc: VYCHOZI_THEME.noc },
  },
  {
    id: 'cista', label: 'Čistá bílá',
    theme: {
      den: { bg: '#FFFFFF', fg: '#16181A', fgSoft: '#6B7280', accent: '#16181A' },
      noc: { bg: '#16181A', fg: '#F2F3EF', fgSoft: '#9CA3AF', accent: '#F2F3EF' },
    },
  },
  {
    id: 'les', label: 'Lesní zelená',
    theme: {
      den: { bg: '#F3F5EE', fg: '#1B2415', fgSoft: '#6A7360', accent: '#4A6B2A' },
      noc: { bg: '#141A11', fg: '#EAF0E2', fgSoft: '#8B957F', accent: '#9DC66B' },
    },
  },
  {
    id: 'vino', label: 'Vinná červená',
    theme: {
      den: { bg: '#F7F1EF', fg: '#241618', fgSoft: '#7A6265', accent: '#8E2C3B' },
      noc: { bg: '#1A1113', fg: '#F2E7E5', fgSoft: '#9A8385', accent: '#C9576A' },
    },
  },
  {
    id: 'more', label: 'Mořská modrá',
    theme: {
      den: { bg: '#F1F4F8', fg: '#14202A', fgSoft: '#63707C', accent: '#2B5D8A' },
      noc: { bg: '#101820', fg: '#E7EEF5', fgSoft: '#8494A2', accent: '#6FA8D6' },
    },
  },
];

/** Písma nabízená v administraci. Vestavěná fungují i bez internetu. */
export const PISMA: { id: string; label: string; vestavene: boolean }[] = [
  { id: 'nayuki', label: 'Nayuki (vestavěné)', vestavene: true },
  { id: 'poppins', label: 'Poppins (vestavěné)', vestavene: true },
  { id: 'system', label: 'Systémové písmo', vestavene: true },
  { id: 'Playfair Display', label: 'Playfair Display', vestavene: false },
  { id: 'Cormorant Garamond', label: 'Cormorant Garamond', vestavene: false },
  { id: 'Lora', label: 'Lora', vestavene: false },
  { id: 'Inter', label: 'Inter', vestavene: false },
  { id: 'Work Sans', label: 'Work Sans', vestavene: false },
  { id: 'Space Grotesk', label: 'Space Grotesk', vestavene: false },
];

/**
 * Vzhled pro nově zakládané menu odvozený z Vzhledu sdílených stránek,
 * aby podnik nezačínal v cizích barvách. Noční varianta se odvodí
 * prohozením pozadí a textu — je to jen výchozí bod, dá se přepsat.
 */
export function zeSdilenehoVzhledu(share: any): MenuTheme {
  if (!share || typeof share !== 'object') return VYCHOZI_THEME;
  const bg = barva(share.background, VYCHOZI_THEME.den.bg);
  const fg = barva(share.text, VYCHOZI_THEME.den.fg);
  const accent = barva(share.accent, VYCHOZI_THEME.den.accent);
  const logoUrl = obrazek(share.logoUrl);

  return normalizeMenuTheme({
    // Tlumený text = hlavní text posunutý k pozadí, ať drží čitelnost v obou režimech.
    den: { bg, fg, fgSoft: smichej(fg, bg, 0.45), accent },
    noc: { bg: fg, fg: bg, fgSoft: smichej(bg, fg, 0.45), accent },
    // Logo z nastavení odkazů bývá barevné, takže se vkládá tak, jak je.
    logo: { url: logoUrl, rezim: logoUrl ? 'obrazek' : 'maska' },
    pismo: { nadpisy: 'system', text: 'system' },
    // Listy jsou kresba Pangey — jinému podniku se nevnucují.
    pozadi: { druh: 'zadne', url: '', sila: 5.5 },
  });
}
