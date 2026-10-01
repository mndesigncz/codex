// Osobní nastavení účtu, které se ukládá do users.notif_prefs (JSONB, bez migrace):
// kategorie oznámení, tiché hodiny, denní souhrn a osobní formáty (čas, datum, týden, čísla).
// Čistý modul (běží v `npm test`): server z těla požadavku propustí jen známé klíče
// s platným tvarem, ať se do databáze nedostane cokoli.
import { cistyFormaty } from './i18n/osobniFormaty.ts';
import { minutyZHM } from './pushPravidla.ts';

/** Přepínače kategorií oznámení (klíč preference). Chybějící = zapnuto. */
export const KATEGORIE_OZNAMENI = ['messages', 'lowStock', 'shifts', 'ukoly', 'uzaverky', 'rezervace', 'volno'] as const;
export type KategorieOznameni = (typeof KATEGORIE_OZNAMENI)[number];

export interface TichoHodiny { zap: boolean; od: string; do: string }

export const VYCHOZI_TICHO: TichoHodiny = { zap: false, od: '22:00', do: '07:00' };

const cas = (v: unknown, vychozi: string): string => {
  const m = minutyZHM(v);
  if (m === null) return vychozi;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export function cisteTicho(v: unknown): TichoHodiny {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return { zap: o.zap === true, od: cas(o.od, VYCHOZI_TICHO.od), do: cas(o['do'], VYCHOZI_TICHO.do) };
}

/**
 * Z těla PATCH /api/account vybere platné části preferencí. Neznámé klíče se zahodí,
 * pravdivostní hodnoty musí být opravdu boolean. Částečná aktualizace je v pořádku:
 * vrací jen to, co přišlo.
 */
export function cistePrefsUctu(vstup: unknown): Record<string, unknown> {
  const o = (vstup && typeof vstup === 'object' && !Array.isArray(vstup) ? vstup : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of [...KATEGORIE_OZNAMENI, 'digest'] as const) {
    if (typeof o[k] === 'boolean') out[k] = o[k];
  }
  if (o.ticho !== undefined) out.ticho = cisteTicho(o.ticho);
  if (o.formaty !== undefined) out.formaty = cistyFormaty(o.formaty);
  return out;
}
