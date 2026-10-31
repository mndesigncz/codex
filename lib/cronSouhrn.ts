// Jeden řádek do logu Vercelu po každém běhu cronu (audit provozu před spuštěním).
//
// Z logů za týden šlo poznat jen to, že crony s push oznámením vůbec běžely
// (tiskly varování DEP0169 z knihovny web-push). Záloha, migrace, pokladna,
// dorovnání předplatných ani připomínky rezervací po úspěšném běhu nezapsaly
// nic — „proběhlo, nic se nestalo" a „vůbec neproběhlo" vypadaly v logu stejně.
// Teď každý cron zapíše `cron <název>: {…}` s počty.
//
// Do logu jdou jen čísla a ano/ne: žádné e-maily, jména podniků, texty chyb
// Postgresu ani tokeny (odpovědi cronů je občas obsahují). Čisté, bez databáze.

export type SouhrnCronu = Record<string, unknown>;

/** Klíče, jejichž kladná hodnota znamená, že část běhu selhala. */
const KLICE_SELHANI = ['failed', 'chyb', 'chyby', 'selhalo', 'nestihnuto', 'migFails'] as const;

/** Z odpovědi cronu vybere jen konečná čísla a ano/ne, v původním pořadí. */
export function cistySouhrn(s: SouhrnCronu): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  for (const [k, v] of Object.entries(s ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** Selhal běh aspoň zčásti? (`ok: false` nebo kladný počet chyb.) */
export function behSelhal(s: SouhrnCronu): boolean {
  if (s?.ok === false) return true;
  return KLICE_SELHANI.some(k => typeof s?.[k] === 'number' && (s[k] as number) > 0);
}

/** Text řádku: `cron <název>: {"ok":true,…}`. */
export function radekCronu(nazev: string, s: SouhrnCronu): string {
  return `cron ${nazev}: ${JSON.stringify(cistySouhrn(s))}`;
}

/** Zapíše souhrn běhu: úspěch jako info, částečné selhání jako error (ať ho najde get_runtime_errors). */
export function zapisBehCronu(nazev: string, s: SouhrnCronu): void {
  const radek = radekCronu(nazev, s);
  if (behSelhal(s)) console.error(radek);
  else console.log(radek);
}
