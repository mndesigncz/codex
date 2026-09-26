// Pomocník pro testy po souborech (scripts/testy/*.ts) — jen typ, žádný test.
//
// scripts/test-units.ts načte každý soubor v téhle složce, zavolá jeho
// `export default` funkci a předá jí eq/ok; soubory s podtržítkem na začátku
// (jako tenhle) přeskočí. Balíky kola 69 tak přidávají testy vlastními
// soubory (k69-<balik>.ts) a do společného test-units.ts nesahají.

export interface Testy {
  /** Porovná přes JSON.stringify; při neshodě vypíše obě hodnoty a test spadne. */
  eq: (nazev: string, dostal: unknown, cekano: unknown) => void;
  /** Podmínka musí platit. */
  ok: (nazev: string, podminka: boolean) => void;
}
