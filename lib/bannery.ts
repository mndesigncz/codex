// Promo bannery podniku (Managero client): čisté funkce bez databáze.
//  · validujBanner  — co smí podnik uložit (délky, odkaz, obrázek, platnost),
//  · vyberAktivni   — které bannery se dnes ukážou hostovi (aktivní, v platnosti, max 5),
//  · presunBanner   — pořadí po posunu o jedno místo nahoru/dolů.
// Server i editor se ptají stejných funkcí, ať se pravidla nerozjedou.
// Odkaz jde jen na https (nikdy javascript:, data:, http:) nebo na vnitřní
// cíl (nabídka, kupon, akce podniku).

export const LINK_KINDS = ['none', 'menu', 'coupon', 'event', 'url'] as const;
export type LinkKind = typeof LINK_KINDS[number];
export const MAX_AKTIVNICH = 5;
export const MAX_BANNERU = 20;

export const LINK_LABELS: Record<LinkKind, string> = {
  none: 'Bez odkazu', menu: 'Nabídka', coupon: 'Kupony (záložka Věrnost)', event: 'Akce', url: 'Webová adresa (https)',
};

/** Webový odkaz smí jen https s hostitelem a bez přihlašovacích údajů. Vrací očištěnou adresu, nebo null. */
export function httpsOdkaz(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 500 || /[\u0000-\u001f\s]/.test(s)) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return null;
  return u.toString();
}

/** Obrázek banneru: nahraný přes galerii podniku (/api/client/img/<id>), nebo https adresa. */
export function obrazekBanneru(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\/api\/client\/img\/\d{1,9}$/.test(s)) return s;
  return httpsOdkaz(s);
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
function platneDatum(v: unknown): string | null | undefined {
  if (v == null || v === '') return null;
  const s = String(v);
  if (!DATUM.test(s)) return undefined;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? undefined : s;
}

export interface BannerHodnoty {
  title: string; text: string; image_url: string | null;
  link_kind: LinkKind; link_ref: string | null;
  active: boolean; valid_since: string | null; valid_until: string | null;
}

export type VysledekValidace = { ok: true; hodnoty: BannerHodnoty } | { ok: false; chyba: string };

/** Zkontroluje a očistí vstup z formuláře. Při chybě vrací srozumitelnou českou větu. */
export function validujBanner(b: any): VysledekValidace {
  const title = String(b?.title ?? '').trim().slice(0, 80);
  if (!title) return { ok: false, chyba: 'Banner potřebuje nadpis.' };
  const text = String(b?.text ?? '').trim().slice(0, 300);
  let image_url: string | null = null;
  if (b?.image_url != null && String(b.image_url).trim() !== '') {
    image_url = obrazekBanneru(b.image_url);
    if (!image_url) return { ok: false, chyba: 'Obrázek musí být nahraný soubor nebo adresa na https.' };
  }
  const kind = String(b?.link_kind ?? 'none') as LinkKind;
  if (!(LINK_KINDS as readonly string[]).includes(kind)) return { ok: false, chyba: 'Neznámý druh odkazu.' };
  let link_ref: string | null = null;
  if (kind === 'url') {
    link_ref = httpsOdkaz(b?.link_ref);
    if (!link_ref) return { ok: false, chyba: 'Odkaz musí začínat https:// a vést na existující web.' };
  } else if (kind === 'event') {
    const n = String(b?.link_ref ?? '').trim();
    if (!/^\d{1,9}$/.test(n) || Number(n) < 1) return { ok: false, chyba: 'Vyber akci, na kterou banner vede.' };
    link_ref = String(Number(n));
  }
  // Nabídka a kupony nepotřebují cíl: banner jen přepne záložku na stránce podniku.
  const valid_since = platneDatum(b?.valid_since);
  const valid_until = platneDatum(b?.valid_until);
  if (valid_since === undefined || valid_until === undefined) return { ok: false, chyba: 'Datum musí být ve tvaru RRRR-MM-DD.' };
  if (valid_since && valid_until && valid_until < valid_since) return { ok: false, chyba: 'Konec platnosti je před začátkem.' };
  return { ok: true, hodnoty: { title, text, image_url, link_kind: kind, link_ref, active: b?.active !== false, valid_since, valid_until } };
}

export interface BannerRadek {
  id: number; active?: boolean | null; position?: number | null;
  valid_since?: string | null; valid_until?: string | null;
}

/** Bannery, které se k datu (YYYY-MM-DD) ukážou hostovi: aktivní, v platnosti, podle pozice, nejvýš `max`. */
export function vyberAktivni<T extends BannerRadek>(radky: T[], dnes: string, max = MAX_AKTIVNICH): T[] {
  return radky
    .filter(r => r.active !== false
      && (!r.valid_since || String(r.valid_since).slice(0, 10) <= dnes)
      && (!r.valid_until || String(r.valid_until).slice(0, 10) >= dnes))
    .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0) || a.id - b.id)
    .slice(0, max);
}

/** Pořadí id po posunu banneru o jedno místo (−1 nahoru, +1 dolů); na kraji zůstane beze změny. */
export function presunBanner(ids: number[], id: number, smer: -1 | 1): number[] {
  const i = ids.indexOf(id);
  const j = i + smer;
  if (i < 0 || j < 0 || j >= ids.length) return ids.slice();
  const out = ids.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Stav banneru pro editor: proč se právě teď hostům neukazuje (null = ukazuje se). */
export function procNeukazuje(r: BannerRadek, dnes: string): string | null {
  if (r.active === false) return 'vypnutý';
  if (r.valid_since && String(r.valid_since).slice(0, 10) > dnes) return `začne ${String(r.valid_since).slice(0, 10)}`;
  if (r.valid_until && String(r.valid_until).slice(0, 10) < dnes) return 'platnost skončila';
  return null;
}
