// Společné typy kroků průvodce.

import type { Odpovedi, Tarif, VysledekOperace } from '@/lib/pruvodce/typy';

/** Co GET /api/onboarding říká o podniku (předvyplnění a štítky tarifu). */
export interface InfoPodniku {
  name: string;
  currency: string;
  locale: string;
  week_start: number;
  plan: Tarif;
  kod: string | null;
  pozvanek: number;
}

export interface KrokProps {
  odp: Odpovedi;
  /** Částečná změna odpovědí (autosave je až při „Pokračovat"). */
  zmen: (patch: Partial<Odpovedi>) => void;
  info: InfoPodniku;
  /** Chyba ověření pole: kde vznikla (klíč pole), a věta. */
  chybaPole: { pole: string; text: string } | null;
}

export interface VysledekSestaveni {
  polozky: VysledekOperace[];
  prehled: { widgetu: number; polozky: { w: string; s: string }[] };
}
