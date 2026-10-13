// Automatické body (kolo 8, balík R8-3): dochvilnost, výročí nástupu, narozeniny.
//
// Dochvilnost aplikace měřila (profil člena „14/15 včas"), ale do bodů se nepromítala;
// narozeniny a výročí zaměstnanců neznala vůbec (měli je jen hosté). Kudos a Bonusly
// oslavují oboje automaticky s body z katalogu. Tady: pravidla v points_config.auto
// (vedle sazebníku, vedení je přepíná v Odměny › Nastavení), čistá rozhodnutí tady,
// zápis jednou denně z cronu /api/init (lib/automatickeBodyDb.ts) jako point_awards
// kind 'auto' s klíčem auto_key — unikátní index zaručí, že se nic nepřipíše dvakrát.
//
// „Odevzdaná dostupnost do termínu" tu není: podnik žádný termín dostupnosti nemá
// (jen připomínku), takže není co měřit.

import { PRAH_POZDE_MIN } from './dochazkaPrehled.ts';

export interface PravidloAuto { zap: boolean; body: number }
export interface NastaveniAuto {
  /** Týden bez pozdního příchodu (aspoň `MIN_SMEN_TYDNE` plánovaných směn, žádná nad práh). */
  dochvilnost: PravidloAuto;
  /** Výročí nástupu (team_members.created_at), od prvního roku. */
  vyroci: PravidloAuto;
  /** Narozeniny (users.birthday). */
  narozeniny: PravidloAuto;
}
export type DruhAuto = keyof NastaveniAuto;
export const DRUHY_AUTO: DruhAuto[] = ['dochvilnost', 'vyroci', 'narozeniny'];

export const VYCHOZI_AUTO: NastaveniAuto = {
  dochvilnost: { zap: true, body: 10 },
  vyroci: { zap: true, body: 50 },
  narozeniny: { zap: true, body: 20 },
};
export const MAX_BODU_AUTO = 500;
/** Kolik plánovaných směn za týden musí člověk mít, aby „týden bez pozdního příchodu" něco znamenal. */
export const MIN_SMEN_TYDNE = 3;

const pravidlo = (raw: unknown, vychozi: PravidloAuto): PravidloAuto => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const b = Number(r.body);
  return {
    zap: r.zap === undefined ? vychozi.zap : r.zap === true,
    body: Number.isFinite(b) && b >= 0 ? Math.min(MAX_BODU_AUTO, Math.round(b)) : vychozi.body,
  };
};

/** Vyčištěná pravidla z points_config (klíč `auto`); chybí = výchozí. */
export function nastaveniAuto(pointsConfig: unknown): NastaveniAuto {
  const a = ((pointsConfig && typeof pointsConfig === 'object' ? (pointsConfig as Record<string, unknown>).auto : null) ?? {}) as Record<string, unknown>;
  return {
    dochvilnost: pravidlo(a.dochvilnost, VYCHOZI_AUTO.dochvilnost),
    vyroci: pravidlo(a.vyroci, VYCHOZI_AUTO.vyroci),
    narozeniny: pravidlo(a.narozeniny, VYCHOZI_AUTO.narozeniny),
  };
}

// ---- Oslavy --------------------------------------------------------------------

export interface ClenOslavy {
  id: number;
  name: string;
  avatar?: string | null;
  /** „RRRR-MM-DD" nebo „MM-DD"; null = neznámé. */
  birthday?: string | null;
  /** Den nástupu „RRRR-MM-DD" (team_members.created_at); null = neznámý. */
  nastup?: string | null;
}

export interface Oslava {
  id: number;
  name: string;
  avatar: string | null;
  druh: 'narozeniny' | 'vyroci';
  /** Den oslavy v letošním (nebo příštím) roce „RRRR-MM-DD". */
  den: string;
  /** Za kolik dní (0 = dnes). */
  zaDni: number;
  /** U výročí kolikáté; u narozenin null (věk se neříká). */
  roky: number | null;
}

const mmdd = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const mes = Number(m[2]), den = Number(m[3]);
  return mes >= 1 && mes <= 12 && den >= 1 && den <= 31 ? `${m[2]}-${m[3]}` : null;
};
const rokZ = (v: unknown): number | null => { const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(v ?? '')); return m ? Number(m[1]) : null; };
const dniMezi = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
/** Nejbližší výskyt MM-DD od `dnes` včetně (29. 2. v nepřestupném roce = 1. 3.). */
function nejblizsi(md: string, dnes: string): string {
  const rok = Number(dnes.slice(0, 4));
  for (const r of [rok, rok + 1]) {
    const d = new Date(Date.UTC(r, Number(md.slice(0, 2)) - 1, Number(md.slice(3, 5))));
    const iso = d.toISOString().slice(0, 10);
    if (iso >= dnes) return iso;
  }
  return `${rok + 1}-${md}`;
}

/**
 * Narozeniny a výročí nástupu členů v nejbližších `dni` dnech (0 = jen dnes), nejbližší první.
 * Výročí jen od prvního celého roku (nástup letos není výročí).
 */
export function oslavy(clenove: readonly ClenOslavy[], dnes: string, dni = 0): Oslava[] {
  const out: Oslava[] = [];
  for (const c of clenove) {
    const bd = mmdd(c.birthday);
    if (bd) {
      const den = nejblizsi(bd, dnes);
      const zaDni = dniMezi(dnes, den);
      if (zaDni <= dni) out.push({ id: c.id, name: c.name, avatar: c.avatar ?? null, druh: 'narozeniny', den, zaDni, roky: null });
    }
    const na = mmdd(c.nastup);
    const rokNastupu = rokZ(c.nastup);
    if (na && rokNastupu != null) {
      const den = nejblizsi(na, dnes);
      const zaDni = dniMezi(dnes, den);
      const roky = Number(den.slice(0, 4)) - rokNastupu;
      if (zaDni <= dni && roky >= 1) out.push({ id: c.id, name: c.name, avatar: c.avatar ?? null, druh: 'vyroci', den, zaDni, roky });
    }
  }
  return out.sort((a, b) => a.zaDni - b.zaDni || a.name.localeCompare(b.name, 'cs'));
}

/** Klíč automatického připsání (jednou za člověka a událost): narozeniny:2026, vyroci:2026, dochvilnost:2026-10-05. */
export const klicAuto = (druh: DruhAuto, obdobi: string): string => `${druh}:${obdobi}`;

// ---- Dochvilnost ---------------------------------------------------------------

/** Minulý celý týden (pondělí–neděle) před `dnes`: od, do a klíč (pondělí). */
export function minulyTyden(dnes: string): { od: string; do: string; klic: string } {
  const d = new Date(`${dnes}T12:00:00Z`);
  const poradi = (d.getUTCDay() + 6) % 7; // 0 = pondělí
  d.setUTCDate(d.getUTCDate() - poradi - 7);
  const od = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { od, do: d.toISOString().slice(0, 10), klic: od };
}

export interface PrichodKPlanu {
  employeeId: number;
  /** Minuty zpoždění proti plánu (null = bez plánu nebo nečitelné). */
  pozdeMin: number | null;
}

/**
 * Kdo v týdnu nepřišel ani jednou pozdě (nad PRAH_POZDE_MIN) a měl aspoň MIN_SMEN_TYDNE
 * příchodů k plánované směně. Kdo plán neměl, se nehodnotí — nelze být dochvilný bez plánu.
 */
export function dochvilniZaTyden(prichody: readonly PrichodKPlanu[], prah = PRAH_POZDE_MIN, minSmen = MIN_SMEN_TYDNE): number[] {
  const stav = new Map<number, { smen: number; pozde: number }>();
  for (const p of prichody) {
    if (p.pozdeMin == null) continue;
    const s = stav.get(p.employeeId) ?? { smen: 0, pozde: 0 };
    s.smen++;
    if (p.pozdeMin > prah) s.pozde++;
    stav.set(p.employeeId, s);
  }
  return [...stav].filter(([, s]) => s.smen >= minSmen && s.pozde === 0).map(([id]) => id).sort((a, b) => a - b);
}

/** Minuty zpoždění příchodu proti začátku plánované směny téhož dne („HH:MM" obojí, pražský čas); záporné = dřív. */
export function zpozdeniMin(prichodHM: string, planHM: string): number | null {
  const toMin = (v: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(v); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const a = toMin(prichodHM), b = toMin(planHM);
  return a == null || b == null ? null : a - b;
}

/** Text důvodu do pochvaly (zaměstnanec ho vidí ve zpětné vazbě a na Zdi). */
export function duvodAuto(druh: DruhAuto, roky: number | null = null): string {
  if (druh === 'narozeniny') return 'Všechno nejlepší k narozeninám 🎂';
  if (druh === 'vyroci') return roky === 1 ? 'Rok u nás 🎉' : roky != null && roky < 5 ? `${roky} roky u nás 🎉` : `${roky ?? ''} let u nás 🎉`;
  return 'Týden bez pozdního příchodu ⏱️';
}
