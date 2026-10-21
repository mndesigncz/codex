// Slovník správy platformy — jedna sada jmen a tónů pro seznam, detail
// i historii, ať „pozastavený" vypadá všude stejně.
import type { ChipTone } from '@/components/ui';
import type { StavPodniku, PodnikRadek } from '@/lib/admin';
import { okJson } from '@/lib/api';

export type { StavPodniku, PodnikRadek };

export const STAV_NAZEV: Record<StavPodniku, string> = {
  aktivni: 'Aktivní', placeny: 'Placený', zkusebni: 'Zkušební', zdarma: 'Zdarma',
  pozastaveny: 'Pozastavený', po_splatnosti: 'Po splatnosti',
};
export const STAV_TON: Record<StavPodniku, ChipTone> = {
  aktivni: 'ok', placeny: 'ok', zkusebni: 'info', zdarma: 'muted', pozastaveny: 'bad', po_splatnosti: 'wait',
};
export const ROLE_NAZEV: Record<string, string> = { employer: 'vedení', employee: 'zaměstnanec', kiosk: 'kiosk', customer: 'host' };
export const ZASAH_NAZEV: Record<string, string> = {
  'team.block': 'Pozastaven', 'team.unblock': 'Obnoven', 'team.plan': 'Tarif nastaven ručně',
  'team.trial': 'Zkušební doba prodloužena', 'team.note': 'Poznámka správce',
  'report.removed': 'Nahlášený obsah odstraněn', 'report.resolved': 'Nahlášení vyřízeno', 'report.dismissed': 'Nahlášení zamítnuto',
  'retence.nahled': 'Náhled retence spočítán',
};

export interface Zasah { id: number; actor: string; action: string; teamId: number | null; teamName: string | null; detail: string | null; createdAt: string | null }
export interface Clen { id: number; name: string; email: string; role: string; avatar: string | null; createdAt: string | null }
export interface Detail { team: PodnikRadek; members: Clen[]; zasahy: Zasah[] }

/** Ověří tvar detailu podniku. Neúplná odpověď (200 bez `team.plan`) dřív shodila
 *  celou stránku na „Tady se něco pokazilo" (audit 2026-10 B8); teď je to chyba
 *  načtení s „Zkusit znovu" a seznamy bez pole jsou prázdné, ne pád. */
export function overDetail(raw: any): Detail {
  const team = raw?.team;
  if (!team || typeof team !== 'object' || !team.plan || typeof team.plan !== 'object') {
    throw new Error('Odpověď serveru je neúplná (chybí údaje o podniku).');
  }
  return {
    team: team as PodnikRadek,
    members: Array.isArray(raw.members) ? raw.members : [],
    zasahy: Array.isArray(raw.zasahy) ? raw.zasahy : [],
  };
}

/** POST na admin API; vrací nový detail, chyba letí ven s textem ze serveru. */
export async function zasah(url: string, body: unknown): Promise<Detail> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return overDetail(await okJson(r));
}

export function iniciala(jmeno: string): string {
  return jmeno.trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase() ?? '').join('') || '?';
}
