// Bezpečný název souboru ke stažení nebo sdílení. Čisté, bez importů (testuje se přímo v Node).

/** Bez lomítek, dvojteček ze systémových cest a řídicích znaků; nikdy prázdný. */
export function bezpecnyNazev(nazev: string, vychozi = 'soubor'): string {
  const n = String(nazev ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
  return n && n !== '.' && n !== '..' ? n : vychozi;
}
