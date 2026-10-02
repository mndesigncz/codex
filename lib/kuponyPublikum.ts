// Komu se kupon posílá: čtení a kontrola publika z těla požadavku. Čistá logika bez databáze.

export type Publikum =
  | { druh: 'vsichni' }
  | { druh: 'skupina'; skupinaId: number }
  | { druh: 'hoste'; hostIds: number[] };

export const MAX_HOSTU_RUCNE = 200;

/** Přečte publikum z těla požadavku; špatný tvar vrátí jako chybu. */
export function cistiPublikum(raw: any): { chyba: string } | { publikum: Publikum } {
  const druh = String(raw?.druh ?? '');
  if (druh === 'vsichni') return { publikum: { druh } };
  if (druh === 'skupina') {
    const id = parseInt(String(raw?.skupinaId), 10);
    return id > 0 ? { publikum: { druh, skupinaId: id } } : { chyba: 'Vyber skupinu hostů.' };
  }
  if (druh === 'hoste') {
    const ids = Array.isArray(raw?.hostIds) ? Array.from(new Set(raw.hostIds.map((x: any) => Math.round(Number(x))).filter((n: number) => n > 0))) as number[] : [];
    if (!ids.length) return { chyba: 'Vyber aspoň jednoho hosta.' };
    if (ids.length > MAX_HOSTU_RUCNE) return { chyba: `Ručně jde vybrat nejvýš ${MAX_HOSTU_RUCNE} hostů. Pro víc použij skupinu nebo všechny členy.` };
    return { publikum: { druh, hostIds: ids } };
  }
  return { chyba: 'Vyber, komu kupon poslat.' };
}

