// Segmenty a automatické štítky hostů pro CRM správy Managero client (kolo 92).
// Čistá logika bez databáze (testy: scripts/testy/k92-sprava.ts). Počítá se jen z toho, co
// o členovi opravdu víme: návštěvy, útrata z pokladny / účtenek, poslední návštěva, datum
// přidání, narozeniny, otevřené kupony. Nic se neodhaduje.
//
// Segment = čip nad seznamem hostů s počtem; klepnutí filtruje seznam (parametr `segment`
// v /api/client/admin/customers, stejná funkce rozhoduje seznam, počty, export i hromadné akce).

import { dnuOd } from '../segmenty.ts';

/** Štamgast: aspoň tolik návštěv… */
export const STAMGAST_NAVSTEV = 10;
/** …a byl tu v posledních tolika dnech (bývalý štamgast, který přestal chodit, je „chybí"). */
export const STAMGAST_POSLEDNI_DNI = 30;
/** Nový host: přidal se před méně než tolika dny. */
export const NOVY_DNI = 30;
/** Chybí: byl tu aspoň dvakrát a nepřišel tolik dní (koncept B „Chybí 45 dní"). */
export const CHYBI_DNI = 45;

export type SegmentHostu = 'stamgasti' | 'novi' | 'chybi' | 'narozeniny' | 'kupon';
export const SEGMENTY_HOSTU: { id: SegmentHostu; label: string; popis: string }[] = [
  { id: 'stamgasti', label: 'Štamgasti', popis: `${STAMGAST_NAVSTEV} a víc návštěv, naposledy do ${STAMGAST_POSLEDNI_DNI} dní` },
  { id: 'novi', label: 'Noví', popis: `přidali se za posledních ${NOVY_DNI} dní` },
  { id: 'chybi', label: `Chybí ${CHYBI_DNI}+ dní`, popis: `byli aspoň dvakrát, ${CHYBI_DNI} dní a víc nepřišli` },
  { id: 'narozeniny', label: 'Narozeniny tento měsíc', popis: 'zadali datum narození a slaví tento měsíc' },
  { id: 'kupon', label: 'S kuponem', popis: 'mají kupon k uplatnění' },
];

export function jeSegmentHostu(v: unknown): v is SegmentHostu {
  return SEGMENTY_HOSTU.some(s => s.id === v);
}

export interface HostSegmentu {
  visits: number;
  last_visit_at: Date | string | null;
  joined_at: Date | string | null;
  open_coupons?: number;
  /** Má narozeniny tento měsíc (server to ví z data narození, klient z `has_birthday_month`). */
  narozeninyTentoMesic?: boolean;
}

export function patriDoSegmentu(h: HostSegmentu, s: SegmentHostu, now: Date): boolean {
  const navstev = Number(h.visits) || 0;
  const odNavstevy = dnuOd(h.last_visit_at, now);
  switch (s) {
    case 'stamgasti': return navstev >= STAMGAST_NAVSTEV && odNavstevy != null && odNavstevy <= STAMGAST_POSLEDNI_DNI;
    case 'novi': { const od = dnuOd(h.joined_at, now); return od != null && od < NOVY_DNI; }
    case 'chybi': return navstev >= 2 && odNavstevy != null && odNavstevy >= CHYBI_DNI;
    case 'narozeniny': return !!h.narozeninyTentoMesic;
    case 'kupon': return (Number(h.open_coupons) || 0) > 0;
  }
}

/** Počty všech segmentů najednou (čipy nad seznamem). */
export function poctySegmentu(hoste: readonly HostSegmentu[], now: Date): Record<SegmentHostu, number> {
  const out = { stamgasti: 0, novi: 0, chybi: 0, narozeniny: 0, kupon: 0 } as Record<SegmentHostu, number>;
  for (const h of hoste) for (const s of SEGMENTY_HOSTU) if (patriDoSegmentu(h, s.id, now)) out[s.id]++;
  return out;
}

export type TonStitku = 'ok' | 'wait' | 'info' | 'muted' | 'ink';
export interface StitekHosta { text: string; ton: TonStitku }

/**
 * Automatické štítky v řádku a v profilu (SevenRooms auto-tags): Štamgast, Nový, Chybí N dní.
 * Narozeniny a kupon mají v řádku vlastní značku, úroveň a skupiny přidává volající.
 */
export function stitkyHosta(h: HostSegmentu, now: Date): StitekHosta[] {
  const out: StitekHosta[] = [];
  if (patriDoSegmentu(h, 'stamgasti', now)) out.push({ text: 'Štamgast', ton: 'ok' });
  if (patriDoSegmentu(h, 'novi', now)) out.push({ text: 'Nový', ton: 'info' });
  if (patriDoSegmentu(h, 'chybi', now)) out.push({ text: `Chybí ${dnuOd(h.last_visit_at, now)} dní`, ton: 'wait' });
  return out;
}

/** Průměrný účet: jen když známe útratu i návštěvy; jinak null (žádné vymyšlené číslo). */
export function prumernyUcet(spend: unknown, visits: unknown): number | null {
  const s = Number(spend) || 0;
  const v = Number(visits) || 0;
  return s > 0 && v > 0 ? Math.round(s / v) : null;
}

/** „dnes", „včera", „před 6 dny", „před 3 týdny", „před 2 měsíci" — kdy byl host naposledy. */
export function predKolika(v: Date | string | null | undefined, now: Date): string {
  const d = dnuOd(v ?? null, now);
  if (d == null) return 'zatím nebyl';
  if (d === 0) return 'dnes';
  if (d === 1) return 'včera';
  if (d < 14) return `před ${d} dny`;
  if (d < 60) return `před ${Math.round(d / 7)} týdny`;
  if (d < 730) return `před ${Math.round(d / 30)} měsíci`;
  return `před ${Math.round(d / 365)} lety`;
}
