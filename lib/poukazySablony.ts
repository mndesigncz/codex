// Šablony vzhledu dárkového poukazu (tisk a e-mail). Čisté funkce bez databáze.
//
// Šablona mění nadpis, barvu orámování a akcentu a podklad karty. Obsah (hodnota, kód, QR, platnost) je
// pokaždé stejný, takže vzhled nikdy nezakryje kód. Neznámé id (smazaná šablona, starý řádek) = klasik.
// Barvy jsou pevné řetězce z téhle tabulky, nikdy vstup z formuláře: do stylu se nedostane nic jiného.

export const SABLONY = ['klasik', 'narozeniny', 'vanoce', 'podekovani', 'svatba', 'jednoduchy'] as const;
export type SablonaId = typeof SABLONY[number];
export const VYCHOZI_SABLONA: SablonaId = 'klasik';

export interface Sablona {
  id: SablonaId;
  /** Název v nabídce výběru. */
  nazev: string;
  /** Krátká nápověda pod výběrem. */
  popis: string;
  /** Nadpis na kartě a v e-mailu. */
  nadpis: string;
  /** Barva rámečku a kódu. */
  barva: string;
  /** Barva podkladu karty. */
  podklad: string;
  /** Barva zvýrazněného pruhu nad nadpisem. */
  akcent: string;
}

export const SABLONY_DATA: Record<SablonaId, Sablona> = {
  klasik: { id: 'klasik', nazev: 'Klasický', popis: 'Černý rámeček, bílý podklad. Hodí se na všechno.', nadpis: 'Dárkový poukaz', barva: '#16181A', podklad: '#FFFFFF', akcent: '#C8F542' },
  narozeniny: { id: 'narozeniny', nazev: 'K narozeninám', popis: 'Teplá oranžová, nadpis „Poukaz k narozeninám“.', nadpis: 'Poukaz k narozeninám', barva: '#B45309', podklad: '#FFF7ED', akcent: '#FDBA74' },
  vanoce: { id: 'vanoce', nazev: 'Vánoční', popis: 'Zelená a červená, nadpis „Vánoční poukaz“.', nadpis: 'Vánoční poukaz', barva: '#166534', podklad: '#F0FDF4', akcent: '#DC2626' },
  podekovani: { id: 'podekovani', nazev: 'Poděkování', popis: 'Klidná modrá, nadpis „Poukaz jako poděkování“.', nadpis: 'Poukaz jako poděkování', barva: '#1D4ED8', podklad: '#EFF6FF', akcent: '#93C5FD' },
  svatba: { id: 'svatba', nazev: 'Svatební', popis: 'Jemná růžová, nadpis „Svatební poukaz“.', nadpis: 'Svatební poukaz', barva: '#9D174D', podklad: '#FDF2F8', akcent: '#F9A8D4' },
  jednoduchy: { id: 'jednoduchy', nazev: 'Jednoduchý', popis: 'Bez barev, šetří toner. Nadpis „Poukaz“.', nadpis: 'Poukaz', barva: '#16181A', podklad: '#FFFFFF', akcent: '#E5E7EB' },
};

export function jeSablona(v: unknown): v is SablonaId {
  return typeof v === 'string' && (SABLONY as readonly string[]).includes(v);
}

/** Šablona podle id; neznámé a prázdné = klasik. */
export function sablona(id: unknown): Sablona {
  return SABLONY_DATA[jeSablona(id) ? id : VYCHOZI_SABLONA];
}

/** Šablona z formuláře: prázdné = klasik, neznámé = chyba (překlep se nesmí tiše změnit na jiný vzhled). */
export function overSablonu(v: unknown): { ok: true; id: SablonaId } | { ok: false; chyba: string } {
  if (v == null || v === '') return { ok: true, id: VYCHOZI_SABLONA };
  return jeSablona(v) ? { ok: true, id: v } : { ok: false, chyba: 'Neznámý vzhled poukazu.' };
}

/** Seznam pro výběr ve formuláři. */
export const SABLONY_SEZNAM: Sablona[] = SABLONY.map(id => SABLONY_DATA[id]);
