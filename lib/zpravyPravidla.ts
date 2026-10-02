// Zprávy členům: pravidla bez databáze (testy: scripts/testy/k81-zpravy.ts).
// Kontrola vstupu z formuláře, denní limit, okna pro srovnání návštěv, text s přílohou
// (kupon nebo promo kód) a čas plánování v pražském čase. SQL je v lib/broadcasts.ts
// a v app/api/client/admin/broadcast/route.ts.

import { jeSegment } from './segmenty.ts';
import { ctiKombinaci } from './skupinyPravidla.ts';
import { jeKanal, type KanalyZpravy } from './zpravyKanaly.ts';
import { dayPlus, pragueDayOf, pragueMomentOf } from './pragueTime.ts';

/** Kolik zpráv smí podnik poslat za pražský den. Počítá se při ODESLÁNÍ, ne při plánování. */
export const ZPRAV_DENNE = 5;
/** Nejdál dopředu, kam jde zprávu naplánovat. */
export const PLANOVANI_DNI = 90;
/** Nejméně do budoucna: dřív je to „hned". */
export const PLANOVANI_MIN_MS = 60_000;
/** Stejná zpráva stejnému publiku za tuhle dobu je dvojklik, ne nová zpráva. */
export const DUPLICITA_MS = 120_000;
export const TITLE_MAX = 80;
export const BODY_MAX = 300;

export const AUDIENCES = ['all', 'quiet', 'tier:silver', 'tier:gold', 'tier:platinum'] as const;
export const LINKS = ['page', 'loyalty', 'order', 'me'] as const;
export type LinkKind = typeof LINKS[number];

/** Publikum: úroveň, segment, skupina, nebo kombinace segmentů a skupin (`mix:and|quiet:60|!tier:gold`). */
export function jePlatnePublikum(a: string): boolean {
  return (AUDIENCES as readonly string[]).includes(a) || jeSegment(a) || /^group:\d+$/.test(a) || a === 'gold' || !!ctiKombinaci(a, { skupiny: true });
}

export interface VstupZpravy {
  title: string;
  body: string;
  audience: string;
  linkKind: LinkKind;
  /** Kudy zpráva jde: oznámení v aplikaci, e-mail, nebo obojí. */
  channels: KanalyZpravy;
  /** Naplánovaný čas, nebo null = hned. */
  scheduledAt: Date | null;
  couponId: number | null;
  promoId: number | null;
}

/**
 * Čas z formuláře. `datetime-local` posílá „2026-10-05T14:00" bez pásma — server běží v UTC,
 * takže `new Date(...)` by zprávu poslal o hodinu až dvě dřív. Takový tvar se bere jako
 * pražský čas; ISO s pásmem (Z, +02:00) beze změny. Prázdné nebo nečitelné = null.
 */
export function casPlanovani(v: unknown): Date | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(s);
  const d = m ? pragueMomentOf(m[1], m[2]) : new Date(s);
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

const idZTela = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Zkontroluje tělo požadavku. Vrací buď data, nebo českou chybu. */
export function zkontrolujZpravu(b: Record<string, unknown>, ted: number = Date.now()): { data: VstupZpravy } | { chyba: string } {
  const title = String(b.title ?? '').trim();
  if (!title) return { chyba: 'Zpráva potřebuje nadpis.' };
  if (title.length > TITLE_MAX) return { chyba: `Nadpis může mít nejvýš ${TITLE_MAX} znaků.` };
  const body = String(b.body ?? '').trim();
  if (body.length > BODY_MAX) return { chyba: `Text může mít nejvýš ${BODY_MAX} znaků.` };
  const aud = String(b.audience ?? 'all');
  if (b.audience !== undefined && !jePlatnePublikum(aud)) return { chyba: 'Tohle publikum neznám. Vyber komu zprávu poslat.' };
  const kouzlo = String(b.linkKind ?? 'page');
  const linkKind = ((LINKS as readonly string[]).includes(kouzlo) ? kouzlo : 'page') as LinkKind;
  let at: Date | null = null;
  if (b.scheduledAt !== undefined && b.scheduledAt !== null && String(b.scheduledAt).trim() !== '') {
    at = casPlanovani(b.scheduledAt);
    if (!at) return { chyba: 'Čas odeslání se nepodařilo přečíst.' };
    if (at.getTime() > ted + PLANOVANI_DNI * 86400000) return { chyba: `Plánovat jde nejvýš ${PLANOVANI_DNI} dní dopředu.` };
    // Čas, který už nastal (nebo nastane za chvíli), je odeslání hned.
    if (at.getTime() <= ted + PLANOVANI_MIN_MS) at = null;
  }
  if (b.channels !== undefined && !jeKanal(b.channels)) return { chyba: 'Tenhle kanál neznám. Vyber oznámení, e-mail, nebo obojí.' };
  const channels: KanalyZpravy = jeKanal(b.channels) ? b.channels : 'push';
  const couponId = idZTela(b.couponId);
  const promoId = idZTela(b.promoId);
  if (couponId && promoId) return { chyba: 'Ke zprávě jde připojit kupon, nebo promo kód, ne obojí.' };
  return { data: { title, body, audience: b.audience === undefined ? 'all' : aud, linkKind: (couponId || promoId) && linkKind === 'page' ? 'loyalty' : linkKind, channels, scheduledAt: at, couponId, promoId } };
}

/** Kolik zpráv ještě smí dnes odejít. */
export function zbyvaZprav(odeslanoDnes: number, limit: number = ZPRAV_DENNE): number {
  return Math.max(0, limit - Math.max(0, Math.floor(odeslanoDnes) || 0));
}

export interface PrilohaZpravy {
  kupon?: { title: string } | null;
  promo?: { code: string; title?: string } | null;
}

/** Řádek pod textem zprávy: co host dostane navíc a kde to uplatní. */
export function radekPrilohy(p: PrilohaZpravy | null | undefined): string {
  if (p?.kupon?.title) return `Kupon: ${p.kupon.title}`;
  if (p?.promo?.code) return `Promo kód: ${p.promo.code}`;
  return '';
}

/** Konečný text oznámení: text zprávy a pod ním příloha. */
export function textOznameni(title: string, body: string | null | undefined, p?: PrilohaZpravy | null): { title: string; body: string | undefined } {
  const radek = radekPrilohy(p);
  const t = String(body ?? '').trim();
  const out = [t, radek].filter(Boolean).join('\n');
  return { title: String(title), body: out || undefined };
}

export interface OknoUcinku {
  predOd: string; predDo: string; poOd: string; poDo: string;
  /** Okno po odeslání ještě neskončilo, čísla se mění. */
  probiha: boolean;
}

/**
 * Srovnání návštěv kolem odeslání po kalendářních dnech v pražském čase: sedm dní před
 * dnem odeslání a sedm dní po něm. Samotný den odeslání se nepočítá nikam, protože část
 * dne proběhla před zprávou a část po ní. Dřív to byly klouzavé 168 hodin od vteřiny
 * odeslání, takže zpráva v pátek ve 20:00 srovnávala jiné dny v týdnu než zpráva v pondělí.
 */
export function oknoUcinku(sentAt: Date | string, now: Date = new Date()): OknoUcinku | null {
  const d = sentAt instanceof Date ? sentAt : new Date(String(sentAt).includes('T') || /[zZ]|[+-]\d\d:?\d\d$/.test(String(sentAt)) ? String(sentAt) : String(sentAt).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return null;
  const den = pragueDayOf(d);
  return {
    predOd: dayPlus(den, -7), predDo: dayPlus(den, -1),
    poOd: dayPlus(den, 1), poDo: dayPlus(den, 7),
    probiha: pragueDayOf(now) <= dayPlus(den, 7),
  };
}

/** Druhy řádků deníku, které jsou skutečná návštěva u kasy. Bonus, narozeniny, propadnutí ani „Chybíš nám" mezi ně nepatří. */
export const DRUHY_NAVSTEVY = ['visit', 'order'] as const;

/** Věta o účinku zprávy; null, když není co říct. */
export function vetaUcinku(po: number, pred: number, probiha: boolean, clenu: (n: number) => string): string | null {
  if (po <= 0 && pred <= 0) return null;
  const rozdil = po - pred;
  return `${probiha ? 'zatím ' : ''}${clenu(po)} u kasy do 7 dní${pred > 0 ? `, předtím ${pred}` : ''}${rozdil !== 0 ? ` (${rozdil > 0 ? '+' : ''}${rozdil})` : ''}`;
}

/** Klíč denního počítadla zpráv podniku. Nese pražský den, takže se o půlnoci počítá znovu. */
export const klicLimituZprav = (teamId: number, den: string) => `client-broadcast-day:${teamId}:${den}`;

/** Krátký stabilní otisk textu pro klíč počítadla (stejná zpráva stejnému publiku = stejný klíč). */
export function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
