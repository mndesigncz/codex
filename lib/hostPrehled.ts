// Hostovská strana věrnosti: čisté funkce bez databáze (jdou testovat přímo).
//  · platnostKuponu — „vyprší za N dní“, „platí do“,
//  · typZaznamu — co z řádku deníku a kuponů host uvidí v historii (BEZ interních poznámek podniku),
//  · pravidlaZisku — „jak získat body a odměny“ z pravidel podniku,
//  · stranaHistorie — stránkování historie.
// Texty se skládají až v komponentách přes t(); tady jsou jen druhy a čísla.


/** Kolik dní předem se kupon nebo karta označí jako „brzy vyprší“. */
export const BRZY_DNI = 14;

const DEN_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Rozdíl ve dnech `den − dnes` (záporný = už minulo); null, když datum chybí nebo je špatné. */
export function dniDo(den: unknown, dnes: string): number | null {
  const d = String(den ?? '').slice(0, 10);
  if (!DEN_RE.test(d) || !DEN_RE.test(dnes)) return null;
  const a = Date.parse(`${d}T12:00:00Z`);
  const b = Date.parse(`${dnes}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

export type StavPlatnosti = 'bez' | 'ok' | 'brzy' | 'dnes' | 'vyprsel';
export interface Platnost { stav: StavPlatnosti; do: string | null; dni: number | null }

/** Platnost kuponu k pražskému dni: bez omezení, v pořádku, brzy končí (≤ BRZY_DNI), končí dnes, vypršel. */
export function platnostKuponu(validUntil: unknown, dnes: string): Platnost {
  const d = String(validUntil ?? '').slice(0, 10);
  const dni = dniDo(d, dnes);
  if (dni == null) return { stav: 'bez', do: null, dni: null };
  if (dni < 0) return { stav: 'vyprsel', do: d, dni };
  if (dni === 0) return { stav: 'dnes', do: d, dni };
  return { stav: dni <= BRZY_DNI ? 'brzy' : 'ok', do: d, dni };
}

// ---- Historie ------------------------------------------------------------------------------

export type TypZaznamu =
  | 'stamp' | 'points_earned' | 'points_spent_coupon' | 'points_returned' | 'points_expired' | 'welcome' | 'birthday'
  | 'referral' | 'reactivation' | 'manual_plus' | 'manual_minus' | 'cashback' | 'credit_spent' | 'reward_coupon' | 'coupon_used' | 'other';

export interface SurovyZaznam { src: string; kind: string; delta: number; credit_delta: number; ref?: string | null }

/**
 * Druh záznamu pro hosta. `src`: 'l' řádek deníku, 's' odměna za razítka (kupon z dokončené karty), 'u' uplatněný kupon.
 * Volný text podniku (`note`) se sem nikdy nedostane: host vidí jen druh, částku a název kuponu.
 */
export function typZaznamu(r: SurovyZaznam): TypZaznamu {
  if (r.src === 's') return 'reward_coupon';
  if (r.src === 'u') return 'coupon_used';
  const d = Math.trunc(Number(r.delta)) || 0;
  const c = Math.trunc(Number(r.credit_delta)) || 0;
  switch (r.kind) {
    case 'visit':
      return d === 0 && c === 0 ? 'stamp' : d > 0 ? 'points_earned' : 'manual_minus';
    case 'order': return d >= 0 ? 'points_earned' : 'manual_minus';
    case 'coupon': return d < 0 ? 'points_spent_coupon' : 'points_returned';
    case 'expire': return 'points_expired';
    case 'welcome': return 'welcome';
    case 'birthday': return 'birthday';
    case 'referral': return 'referral';
    case 'reactivation': return 'reactivation';
    case 'cashback': return 'cashback';
    case 'credit': return c < 0 ? 'credit_spent' : 'cashback';
    case 'manual': return d < 0 || c < 0 ? 'manual_minus' : 'manual_plus';
    default: return d > 0 ? 'manual_plus' : d < 0 ? 'manual_minus' : 'other';
  }
}

export const NA_STRANU_HISTORIE = 20;
export const MAX_NA_STRANU_HISTORIE = 50;

/** Stránkování historie: strana ≥ 1, velikost 1..50. */
export function stranaHistorie(stranaRaw: unknown, naStranuRaw: unknown): { strana: number; naStranu: number; offset: number } {
  const strana = Math.max(1, Math.min(1000, Math.trunc(Number(stranaRaw)) || 1));
  const n = Math.trunc(Number(naStranuRaw));
  const naStranu = Number.isFinite(n) && n > 0 ? Math.min(MAX_NA_STRANU_HISTORIE, n) : NA_STRANU_HISTORIE;
  return { strana, naStranu, offset: (strana - 1) * naStranu };
}

// ---- Jak získat body -------------------------------------------------------------------------

export interface PravidlaPodniku {
  pointsPer100: number;
  cashbackPct: number;
  pointsExpireDays: number;
  birthdayPoints: number;
  referralPoints: number;
  /** Aktivní razítkové karty (název, kolik razítek, odměna). */
  campaigns: { name: string; required: number; reward: string }[];
  /** Rozšířené věrnostní úrovně: odměna za návštěvy nebo útratu (jen když podnik nějakou slevu dává). */
  maUrovneSeSlevou: boolean;
  /** Body za objednávky od stolu (výchozí ano) a za rezervaci, která proběhla (0 = žádné). */
  pointsOrders?: boolean;
  pointsPerReservation?: number;
  /** Bodů za každých 100 hodnoty koupeného dárkového poukazu (0 = žádné). */
  voucherPointsPer100?: number;
}

export type PravidloZisku =
  | { druh: 'body_za_utratu'; body: number }
  | { druh: 'razitka'; nazev: string; pocet: number; odmena: string }
  | { druh: 'kredit'; procent: number }
  | { druh: 'narozeniny'; body: number }
  | { druh: 'pozvanka'; body: number }
  | { druh: 'urovne' }
  | { druh: 'propadani'; dny: number }
  | { druh: 'bez_objednavek' }
  | { druh: 'rezervace'; body: number }
  | { druh: 'poukaz'; body: number };

/** Co host dělá, aby dostal body a odměny: jen to, co podnik opravdu zapnul (nulové hodnoty se nezmiňují). */
export function pravidlaZisku(p: PravidlaPodniku): PravidloZisku[] {
  const out: PravidloZisku[] = [];
  const cele = (v: unknown) => Math.max(0, Math.trunc(Number(v)) || 0);
  if (cele(p.pointsPer100) > 0) out.push({ druh: 'body_za_utratu', body: cele(p.pointsPer100) });
  // Host, který objednává od stolu, má vědět, že za to body nejsou (jinak by je čekal).
  if (cele(p.pointsPer100) > 0 && p.pointsOrders === false) out.push({ druh: 'bez_objednavek' });
  if (cele(p.pointsPerReservation) > 0) out.push({ druh: 'rezervace', body: cele(p.pointsPerReservation) });
  if (cele(p.voucherPointsPer100) > 0) out.push({ druh: 'poukaz', body: cele(p.voucherPointsPer100) });
  for (const c of p.campaigns ?? []) {
    if (cele(c.required) > 0) out.push({ druh: 'razitka', nazev: String(c.name ?? ''), pocet: cele(c.required), odmena: String(c.reward ?? '') });
  }
  if (cele(p.cashbackPct) > 0) out.push({ druh: 'kredit', procent: cele(p.cashbackPct) });
  if (cele(p.birthdayPoints) > 0) out.push({ druh: 'narozeniny', body: cele(p.birthdayPoints) });
  if (cele(p.referralPoints) > 0) out.push({ druh: 'pozvanka', body: cele(p.referralPoints) });
  if (p.maUrovneSeSlevou) out.push({ druh: 'urovne' });
  if (cele(p.pointsExpireDays) > 0) out.push({ druh: 'propadani', dny: cele(p.pointsExpireDays) });
  return out;
}

/** Úrovně se slevou: aspoň jedna úroveň nese slevu větší než nula. */
export function urovneSeSlevou(tiers: { memberDiscount?: number; silverDiscount?: number; goldDiscount?: number; platinumDiscount?: number } | null | undefined): boolean {
  if (!tiers) return false;
  return [tiers.memberDiscount, tiers.silverDiscount, tiers.goldDiscount, tiers.platinumDiscount].some(x => (Number(x) || 0) > 0);
}
