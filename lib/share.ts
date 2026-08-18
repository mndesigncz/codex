// Public share links: a read-only page a shop can send to customers showing
// what it currently offers. No prices, no stock numbers, no procedure content —
// only the names of things and how they're grouped.

export type ShareKind = 'inventory' | 'guides';

export interface ShareLink {
  id: number;
  token: string;
  kind: ShareKind;
  /** null = everything of that kind. */
  categoryId: number | null;
  /** Categories left out of the page, by id. */
  excluded: number[];
  title: string | null;
  note: string | null;
  enabled: boolean;
  /** Shown as a card on every dashboard incl. the kiosk. One per team. */
  pinned?: boolean;
  createdAt?: string;
}

/** Colours and logo for the public page. */
export interface ShareTheme {
  businessName: string;
  logoUrl: string;
  /** Page background. */
  background: string;
  /** Headings and accents. */
  accent: string;
  /** Body text. */
  text: string;
  footer: string;
}

export const DEFAULT_THEME: ShareTheme = {
  businessName: '',
  logoUrl: '',
  background: '#F6F7F2',
  accent: '#5B7A08',
  text: '#16181A',
  footer: '',
};

const HEX = /^#[0-9a-fA-F]{3,8}$/;

function colour(raw: any, fallback: string): string {
  const v = String(raw ?? '').trim();
  return HEX.test(v) ? v : fallback;
}

export function normalizeTheme(raw: any): ShareTheme {
  const t = raw && typeof raw === 'object' ? raw : {};
  return {
    businessName: String(t.businessName ?? '').trim().slice(0, 80),
    // Only http(s) and data URLs — anything else could smuggle a script.
    logoUrl: /^(https?:\/\/|data:image\/)/i.test(String(t.logoUrl ?? '').trim())
      ? String(t.logoUrl).trim().slice(0, 2000)
      : '',
    background: colour(t.background, DEFAULT_THEME.background),
    accent: colour(t.accent, DEFAULT_THEME.accent),
    text: colour(t.text, DEFAULT_THEME.text),
    footer: String(t.footer ?? '').trim().slice(0, 300),
  };
}

/** Ready-made colour sets, so a shop doesn't have to pick hexes. */
export const THEME_PRESETS: { id: string; label: string; theme: Pick<ShareTheme, 'background' | 'accent' | 'text'> }[] = [
  { id: 'light', label: 'Světlá', theme: { background: '#F6F7F2', accent: '#5B7A08', text: '#16181A' } },
  { id: 'dark', label: 'Tmavá', theme: { background: '#16181A', accent: '#C8F542', text: '#F2F3EF' } },
  { id: 'warm', label: 'Teplá', theme: { background: '#F7F1E8', accent: '#8A5A2B', text: '#2A211A' } },
  { id: 'cool', label: 'Chladná', theme: { background: '#F1F4F8', accent: '#2B5D8A', text: '#16202A' } },
];

export function normalizeExcluded(raw: any): number[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(
    raw.map((v: any) => Number(v)).filter(n => Number.isFinite(n) && n > 0),
  )).slice(0, 200);
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/**
 * A link token. Unguessable is the whole security model here — the page has no
 * login — so it comes from crypto randomness, never from Math.random.
 */
export function makeToken(len = 12): string {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}

/** Readable contrast against the theme background, for borders and muted text. */
export function isDark(hex: string): boolean {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map(c => c + c).join('') : v.slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return false;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // Rec. 601 luma — good enough to decide light vs dark chrome.
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}
