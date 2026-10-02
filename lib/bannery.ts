// Promo bannery podniku (Managero client): čisté funkce bez databáze.
//  · validujBanner  — co smí podnik uložit (délky, odkaz, obrázek, platnost),
//  · vyberAktivni   — které bannery se dnes ukážou hostovi (aktivní, v platnosti, max 5),
//  · presunBanner   — pořadí po posunu o jedno místo nahoru/dolů.
// Server i editor se ptají stejných funkcí, ať se pravidla nerozjedou.
// Odkaz jde jen na https (nikdy javascript:, data:, http:) nebo na vnitřní
// cíl (nabídka, kupon, akce podniku).

import { validujPlan, validujPreklady, planZRadku, planSedi, popisPlanu, maPlan, type Kdy, type PrekladyBanneru } from './banneryPlan.ts';

export const LINK_KINDS = ['none', 'menu', 'coupon', 'campaign', 'event', 'url'] as const;
export type LinkKind = typeof LINK_KINDS[number];
export const MAX_AKTIVNICH = 5;
export const MAX_BANNERU = 20;

export const LINK_LABELS: Record<LinkKind, string> = {
  none: 'Bez odkazu', menu: 'Nabídka', coupon: 'Kupon (záložka Věrnost)', campaign: 'Razítková karta (záložka Věrnost)', event: 'Akce', url: 'Webová adresa (https)',
};

/** Komu se banner ukáže: všem, jen členům, jen nečlenům, členům určité úrovně, nebo členům skupiny. */
export const CILE = ['all', 'members', 'nonmembers', 'level', 'group'] as const;
export type CilKind = typeof CILE[number];
export const CIL_LABELS: Record<CilKind, string> = {
  all: 'Všem hostům', members: 'Jen členům', nonmembers: 'Jen těm, kdo ještě nejsou členy', level: 'Členům určité úrovně', group: 'Členům skupiny',
};
export const UROVNE_CILE = ['bronze', 'silver', 'gold', 'platinum'] as const;

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
  target_kind: CilKind; target_ref: string | null; archived: boolean;
  /** Plán: dny v týdnu (prázdné = každý den) a hodiny od–do (pražský čas). */
  days_of_week: number[]; hour_from: string | null; hour_till: string | null;
  /** Překlady nadpisu a textu do jazyků hosta. */
  i18n: PrekladyBanneru;
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
  } else if (kind === 'campaign') {
    const n = String(b?.link_ref ?? '').trim();
    if (!/^\d{1,9}$/.test(n) || Number(n) < 1) return { ok: false, chyba: 'Vyber razítkovou kartu, na kterou banner vede.' };
    link_ref = String(Number(n));
  } else if (kind === 'coupon') {
    // Kupon je nepovinný cíl: bez něj banner jen otevře záložku Věrnost, s ním ukáže na konkrétní kupon.
    const n = String(b?.link_ref ?? '').trim();
    if (n) {
      if (!/^\d{1,9}$/.test(n) || Number(n) < 1) return { ok: false, chyba: 'Kupon, na který banner vede, není platný.' };
      link_ref = String(Number(n));
    }
  }
  // Nabídka nepotřebuje cíl: banner jen přepne záložku na stránce podniku.
  const cil = validujCil(b?.target_kind, b?.target_ref);
  if (!cil.ok) return { ok: false, chyba: cil.chyba };
  const valid_since = platneDatum(b?.valid_since);
  const valid_until = platneDatum(b?.valid_until);
  if (valid_since === undefined || valid_until === undefined) return { ok: false, chyba: 'Datum musí být ve tvaru RRRR-MM-DD.' };
  if (valid_since && valid_until && valid_until < valid_since) return { ok: false, chyba: 'Konec platnosti je před začátkem.' };
  const plan = validujPlan(b ?? {});
  if (!plan.ok) return { ok: false, chyba: plan.chyba };
  const preklady = validujPreklady(b?.i18n);
  if (!preklady.ok) return { ok: false, chyba: preklady.chyba };
  // Archivovaný banner se hostům neukazuje nikdy; archiv a „aktivní“ si nemohou odporovat.
  const archived = b?.archived === true;
  return { ok: true, hodnoty: {
    title, text, image_url, link_kind: kind, link_ref, active: archived ? false : b?.active !== false, valid_since, valid_until,
    target_kind: cil.kind, target_ref: cil.ref, archived,
    days_of_week: plan.plan.days_of_week, hour_from: plan.plan.hour_from, hour_till: plan.plan.hour_till, i18n: preklady.preklady,
  } };
}

/** Cílení z formuláře: druh a (pro úroveň a skupinu) povinný cíl. Neznámé = chyba, ne tiché „všem“. */
export function validujCil(kindRaw: unknown, refRaw: unknown): { ok: true; kind: CilKind; ref: string | null } | { ok: false; chyba: string } {
  const kind = String(kindRaw ?? 'all') as CilKind;
  if (!(CILE as readonly string[]).includes(kind)) return { ok: false, chyba: 'Neznámé cílení banneru.' };
  const ref = String(refRaw ?? '').trim();
  if (kind === 'level') {
    if (!(UROVNE_CILE as readonly string[]).includes(ref)) return { ok: false, chyba: 'Vyber úroveň, které se banner ukáže.' };
    return { ok: true, kind, ref };
  }
  if (kind === 'group') {
    if (!/^\d{1,9}$/.test(ref) || Number(ref) < 1) return { ok: false, chyba: 'Vyber skupinu, které se banner ukáže.' };
    return { ok: true, kind, ref: String(Number(ref)) };
  }
  return { ok: true, kind, ref: null };
}

/** Kdo se na stránku dívá: člen podniku (s úrovní a skupinami), nebo ne. */
export interface HostKontext { member: boolean; level: string | null; groupIds: number[] }
export const NEZNAMY_HOST: HostKontext = { member: false, level: null, groupIds: [] };

/** Patří banner tomuhle hostovi podle cílení? Úroveň a skupina se týkají jen členů. */
export function cilSedi(r: { target_kind?: string | null; target_ref?: string | null }, host: HostKontext): boolean {
  switch (r.target_kind) {
    case 'members': return host.member;
    case 'nonmembers': return !host.member;
    case 'level': return host.member && !!r.target_ref && host.level === r.target_ref;
    case 'group': return host.member && host.groupIds.includes(Number(r.target_ref));
    default: return true; // 'all', prázdné i neznámé (starý řádek před migrací)
  }
}

/** Krátký popis cílení pro seznam v editoru. */
export function popisCile(r: { target_kind?: string | null; target_ref?: string | null }, nazvy: { skupiny?: Record<number, string>; urovne?: Record<string, string> } = {}): string {
  const k = String(r.target_kind ?? 'all') as CilKind;
  if (k === 'level') return `Úroveň: ${nazvy.urovne?.[String(r.target_ref)] ?? r.target_ref ?? '?'}`;
  if (k === 'group') return `Skupina: ${nazvy.skupiny?.[Number(r.target_ref)] ?? 'smazaná skupina'}`;
  return CIL_LABELS[k] ?? CIL_LABELS.all;
}

export interface BannerRadek {
  id: number; active?: boolean | null; position?: number | null;
  valid_since?: string | null; valid_until?: string | null;
  archived?: boolean | null; target_kind?: string | null; target_ref?: string | null;
  days_of_week?: unknown; hour_from?: string | null; hour_till?: string | null;
}

/**
 * Bannery, které se k datu (YYYY-MM-DD) ukážou hostovi: aktivní, nearchivované, v platnosti, podle pozice, nejvýš `max`.
 * Cílení se uplatní PŘED limitem pěti: banner, který tenhle host nevidí, mu nesmí zabrat místo.
 * Plán (dny a hodiny) se uplatní, když je známé `kdy`; dřív než limit pěti, ze stejného důvodu jako cílení.
 * Bez `host` se cílení neuplatňuje (editor: „co je v provozu“).
 */
export function vyberAktivni<T extends BannerRadek>(radky: T[], dnes: string, max = MAX_AKTIVNICH, host?: HostKontext, kdy?: Kdy): T[] {
  return radky
    .filter(r => r.active !== false && r.archived !== true
      && (!r.valid_since || String(r.valid_since).slice(0, 10) <= dnes)
      && (!r.valid_until || String(r.valid_until).slice(0, 10) >= dnes)
      && (!host || cilSedi(r, host))
      && (!kdy || planSedi(planZRadku(r), kdy)))
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
export function procNeukazuje(r: BannerRadek, dnes: string, kdy?: Kdy): string | null {
  if (r.archived === true) return 'archivovaný';
  if (r.active === false) return 'vypnutý';
  if (r.valid_since && String(r.valid_since).slice(0, 10) > dnes) return `začne ${String(r.valid_since).slice(0, 10)}`;
  if (r.valid_until && String(r.valid_until).slice(0, 10) < dnes) return 'platnost skončila';
  // Plán dnů a hodin: banner „čeká“, mimo okno se hostům neukazuje (a jinak by štítek tvrdil, že se vidí).
  const plan = planZRadku(r);
  if (kdy && maPlan(plan) && !planSedi(plan, kdy)) return `mimo plán (${popisPlanu(plan)})`;
  return null;
}

/**
 * Nové pořadí z editoru: musí obsahovat PŘESNĚ všechna id bannerů podniku, každé jednou.
 * Částečný nebo zdvojený seznam by dřív tiše zamíchal pozice (u neuvedených zůstaly staré),
 * takže se dva bannery mohly ocitnout na téže pozici. Vrací očištěné pořadí, nebo důvod.
 */
export function overPoradi(order: unknown, idPodniku: number[]): { ok: true; ids: number[] } | { ok: false; chyba: string } {
  if (!Array.isArray(order)) return { ok: false, chyba: 'Pořadí chybí.' };
  const ids = order.map(x => Number(x));
  if (ids.some(n => !Number.isInteger(n) || n < 1)) return { ok: false, chyba: 'Pořadí obsahuje neplatné číslo banneru.' };
  if (new Set(ids).size !== ids.length) return { ok: false, chyba: 'Pořadí obsahuje banner dvakrát.' };
  const moje = new Set(idPodniku);
  if (ids.some(n => !moje.has(n))) return { ok: false, chyba: 'Pořadí obsahuje banner, který podniku nepatří.' };
  if (ids.length !== moje.size) return { ok: false, chyba: 'Pořadí neobsahuje všechny bannery. Načti seznam znovu.' };
  return { ok: true, ids };
}

/** Nadpis kopie: „(kopie)“ na konci, v mezích 80 znaků, bez řetězení „(kopie) (kopie)“. */
export function nadpisKopie(title: string): string {
  const pripona = ' (kopie)';
  const zaklad = String(title).replace(/( \(kopie\))+$/, '');
  return zaklad.slice(0, 80 - pripona.length).trimEnd() + pripona;
}

/** Proklikovost v procentech na jedno desetinné místo; bez zobrazení nula (nikdy NaN). */
export function proklikovost(zobrazeni: number, kliky: number): number {
  const z = Math.max(0, Math.trunc(Number(zobrazeni)) || 0);
  const k = Math.max(0, Math.trunc(Number(kliky)) || 0);
  if (z <= 0) return 0;
  return Math.round((Math.min(k, z) / z) * 1000) / 10;
}

export interface RadekStatistiky { banner_id: number; day: string; views: number; clicks: number }
export interface SouhrnBanneru { zobrazeni: number; kliky: number; proklikovost: number }

/** Součty po bannerech z denních řádků (volitelně jen dny od `odDne`, včetně). */
export function souhrnStatistik(radky: RadekStatistiky[], odDne?: string): Map<number, SouhrnBanneru> {
  const out = new Map<number, SouhrnBanneru>();
  for (const r of radky) {
    if (odDne && String(r.day).slice(0, 10) < odDne) continue;
    const cur = out.get(Number(r.banner_id)) ?? { zobrazeni: 0, kliky: 0, proklikovost: 0 };
    cur.zobrazeni += Math.max(0, Number(r.views) || 0);
    cur.kliky += Math.max(0, Number(r.clicks) || 0);
    out.set(Number(r.banner_id), cur);
  }
  for (const v of out.values()) v.proklikovost = proklikovost(v.zobrazeni, v.kliky);
  return out;
}

/** Druh události z hostovy stránky; cokoli jiného server zahodí. */
export function druhUdalosti(raw: unknown): 'view' | 'click' | null {
  return raw === 'view' || raw === 'click' ? raw : null;
}
