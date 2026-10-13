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

// ---------------------------------------------------------------------------
// Datum v dotazu (kolo 8): „3.10.", „3. 10. 2026", „2026-10-03", „včera",
// „předevčírem", „pátek" → den RRRR-MM-DD. Hledání uzávěrek: člověk si
// pamatuje den, ne číslo řádku. Čistá funkce; dnešek dodá volající
// (lib/pragueTime), ať jde proměřit testem.

const SLOVA_DNE: Record<string, number> = {
  // cs / sk
  dnes: 0, vcera: -1, predevcirem: -2, predvcerom: -2,
  // en
  today: 0, yesterday: -1,
  // de
  heute: 0, gestern: -1, vorgestern: -2,
  // pl
  dzis: 0, dzisiaj: 0, wczoraj: -1, przedwczoraj: -2,
};

/** Den v týdnu (0 = neděle … 6 = sobota) podle názvu bez diakritiky; zkratky jen celé („pá", ne „pa…"). */
const DNY_V_TYDNU: Record<string, number> = {
  nedele: 0, ne: 0, pondeli: 1, po: 1, utery: 2, ut: 2, streda: 3, st: 3, ctvrtek: 4, ct: 4, patek: 5, pa: 5, sobota: 6, so: 6,
  nedela: 0, pondelok: 1, utorok: 2, stvrtok: 4, piatok: 5,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
  niedziela: 0, poniedzialek: 1, wtorek: 2, sroda: 3, czwartek: 4, piatek: 5,
};

const denVTydnu = (den: string): number => {
  const [r, m, d] = den.split('-').map(Number);
  return new Date(Date.UTC(r, m - 1, d)).getUTCDay();
};

const posunDne = (den: string, o: number): string => {
  const [r, m, d] = den.split('-').map(Number);
  return new Date(Date.UTC(r, m - 1, d + o)).toISOString().slice(0, 10);
};

const platnyDen = (r: number, m: number, d: number): string | null => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(r, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};

/**
 * Den z dotazu hledání, nebo null, když dotaz žádný den neříká.
 * „3.10." bez roku je nejbližší takový den v minulosti (uzávěrky se hledají zpětně):
 * letos, a když by byl v budoucnu, loni. Název dne v týdnu je poslední takový den (dnešek včetně).
 */
export function datumZDotazu(dotaz: unknown, dnes: string): string | null {
  const q = proHledani(dotaz).replace(/\s+/g, ' ');
  if (!q) return null;
  if (q in SLOVA_DNE) return posunDne(dnes, SLOVA_DNE[q]);
  if (q in DNY_V_TYDNU) {
    const cil = DNY_V_TYDNU[q];
    const rozdil = (denVTydnu(dnes) - cil + 7) % 7;
    return posunDne(dnes, -rozdil);
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(q);
  if (iso) return platnyDen(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const cs = /^(\d{1,2})\. ?(\d{1,2})\.(?: ?(\d{4}))?$/.exec(q);
  if (!cs) return null;
  const d = Number(cs[1]);
  const m = Number(cs[2]);
  if (cs[3]) return platnyDen(Number(cs[3]), m, d);
  const letos = Number(dnes.slice(0, 4));
  const kandidat = platnyDen(letos, m, d);
  if (!kandidat) return platnyDen(letos - 1, m, d);
  return kandidat <= dnes ? kandidat : platnyDen(letos - 1, m, d);
}
