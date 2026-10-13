// Píchání z telefonu jen u podniku (kolo 8, R8-2) — čistá logika bez Reactu a bez databáze.
//
// Podnik si zapne „Píchat z telefonu jen u podniku" s poloměrem 100 / 200 / 500 m a svou polohou
// (teams.clock_geo). Příchod z telefonu (POST /api/attendance, zdroj 'self') pošle polohu z prohlížeče;
// server ji tady porovná a výsledek uloží k záznamu (time_entries.geo_status, geo_distance_m):
//   'ok'      uvnitř okruhu (s rezervou na přesnost GPS, nejvýš 50 m),
//   'far'     mimo okruh — záznam vznikne, vedení dostane upozornění a v Záznamech docházky je chip „mimo podnik",
//   'missing' pravidlo je zapnuté, ale poloha nepřišla (telefon ji nedal nebo starší Píchačky),
//   null      neověřovalo se: pravidlo vypnuté, tablet, ruční záznam.
// Nic se neblokuje — kdo stojí před zamčeným podnikem s vybitou GPS, musí mít jak začít směnu.
//
// Výpočet vzdálenosti je stejný haversin jako u objednávek od stolu (lib/clientOrders.distanceM);
// tahle verze je tu, aby docházka nesahala do modulu hostů s HMAC a objednávkami.

export const POLOMERY_M = [100, 200, 500] as const;
export type PolomerM = (typeof POLOMERY_M)[number];

export interface PravidlaPichani {
  zapnuto: boolean;
  lat: number | null;
  lng: number | null;
  polomerM: PolomerM;
}

export const VYCHOZI_PRAVIDLA_PICHANI: PravidlaPichani = { zapnuto: false, lat: null, lng: null, polomerM: 200 };

export interface Poloha { lat: number; lng: number; /** Přesnost v metrech (z GPS); bez ní 9999. */ accuracy: number }

export type StavPolohy = 'ok' | 'far' | 'missing';

/** Nejvyšší rezerva na nepřesnou GPS (m): telefon v kapse hlásí ±30 m, víc už by okruh zrušilo. */
export const REZERVA_PRESNOSTI_M = 50;

/** Vzdálenost dvou bodů v metrech (haversin, Země 6371 km), zaokrouhlená. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

const jeSouradnice = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;

/** Pravidla z databáze nebo z těla požadavku; cokoli nečitelného padne na výchozí. */
export function normalizujPravidlaPichani(raw: unknown): PravidlaPichani {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lat = Number(r.lat), lng = Number(r.lng);
  const maBod = jeSouradnice(lat, 90) && jeSouradnice(lng, 180) && r.lat !== null && r.lng !== null && r.lat !== '' && r.lng !== '';
  const polomer = Number(r.polomerM);
  return {
    zapnuto: r.zapnuto === true,
    lat: maBod ? Math.round(lat * 1e6) / 1e6 : null,
    lng: maBod ? Math.round(lng * 1e6) / 1e6 : null,
    polomerM: (POLOMERY_M as readonly number[]).includes(polomer) ? (polomer as PolomerM) : VYCHOZI_PRAVIDLA_PICHANI.polomerM,
  };
}

/** Pravidlo je účinné, jen když je zapnuté A podnik má polohu — bez bodu není s čím porovnávat. */
export function pravidloUcinne(p: PravidlaPichani): boolean {
  return p.zapnuto && p.lat != null && p.lng != null;
}

/** Poloha z těla požadavku ({ lat, lng, accuracy }); nečitelná = null. */
export function parsePoloha(raw: unknown): Poloha | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lat = Number(r.lat), lng = Number(r.lng), accuracy = Number(r.accuracy);
  if (!jeSouradnice(lat, 90) || !jeSouradnice(lng, 180)) return null;
  return { lat, lng, accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : 9999 };
}

/**
 * Jak příchod z telefonu sedí na okruh podniku. Při neúčinném pravidle null (nic se neukládá);
 * bez polohy 'missing'; jinak 'ok' do poloměru + rezervy na přesnost, 'far' dál.
 */
export function overPolohu(pravidla: PravidlaPichani, poloha: Poloha | null): { status: StavPolohy; vzdalenostM: number | null } | null {
  if (!pravidloUcinne(pravidla)) return null;
  if (!poloha) return { status: 'missing', vzdalenostM: null };
  const d = distanceM(pravidla.lat!, pravidla.lng!, poloha.lat, poloha.lng);
  const rezerva = Math.min(REZERVA_PRESNOSTI_M, Math.max(0, poloha.accuracy));
  return { status: d <= pravidla.polomerM + rezerva ? 'ok' : 'far', vzdalenostM: d };
}

/** „40 m" / „1,2 km" podle jazyka (desetinná čárka v češtině). */
export function vzdalenostText(m: number, locale: string): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: m < 10_000 ? 1 : 0 }).format(m / 1000)} km`;
}
