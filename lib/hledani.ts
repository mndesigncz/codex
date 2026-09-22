// Hledání, které najde „mražená" i když člověk napíše „mrazena".
//
// Aplikace je česká a lidi hledají bez diakritiky — na mobilu proto, že
// přepínat háčky je práce navíc, a u baru proto, že se spěchá. Prosté
// `name.toLowerCase().includes(dotaz)` ale „Mražená malina" na „mraz"
// nenajde: `ž` a `z` jsou dva různé znaky. Obsluha pak vidí obrazovku,
// která vypadá úplně stejně jako před hledáním, a usoudí, že položka ve
// skladu není.
//
// Normalizace rozloží znak na písmeno a diakritické znaménko (NFD) a
// znaménko zahodí: `ž` → `z`, `Č` → `c`, `ř` → `r`. Pro češtinu to stačí;
// `ch` se chová jako dvě písmena, což je při hledání podřetězce správně.
//
// Totéž už dělaly čtyři samostatné kopie (menuPos, client, menu,
// ReceiptsPanel) — tohle je jejich společné jméno, ne pátá kopie.

/** Text připravený na porovnání: malá písmena, bez diakritiky, bez okrajových mezer. */
export function proHledani(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Obsahuje `text` hledaný `dotaz`? Bez ohledu na diakritiku a velikost písmen.
 *
 * Normalizují se obě strany, i kdyby dotaz už normalizovaný byl — opakovaná
 * normalizace nic nezmění a nikdo si tím nemůže ublížit. Prázdný dotaz
 * odpovídá všemu, aby volající nemuseli psát `!q || obsahuje(...)`.
 */
export function obsahuje(text: unknown, dotaz: unknown): boolean {
  const d = proHledani(dotaz);
  return d === '' || proHledani(text).includes(d);
}

/** Odpovídá text aspoň jednomu z polí? Pro řádky hledané přes víc sloupců. */
export function obsahujeNekde(dotaz: unknown, ...texty: unknown[]): boolean {
  const d = proHledani(dotaz);
  return d === '' || texty.some(t => proHledani(t).includes(d));
}
