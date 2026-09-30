// Cena zadaná v poli a cena načtená z databáze — jedno místo pro obojí.
//
// Sloupce s cenami (nákupní cena položky skladu, cena příjmu objednávky, cena
// položky menu) byly INTEGER a všude se zaokrouhlovalo na celé jednotky měny.
// V korunách to nevadí, v eurech ano: 4,99 € se uložilo jako 4 € (−20 %),
// „4,50" v menu se po odstranění nečíslic slilo do 450. Sloupce se proto
// rozšiřují na NUMERIC(…, 2) (viz app/api/init) a všechno, co cenu čte nebo
// zapisuje, jde přes tyhle dvě funkce.
//
// Čistý modul bez závislostí — používá ho server i formuláře a `npm test`
// ho načítá přímo Nodem, proto žádné aliasy `@/`.

/** Strop ceny; ať překlep („1e9") neprojde do databáze ani do součtů. */
export const MAX_CENA = 1_000_000;

/** Na haléře (dvě desetinná místa); `EPSILON` kvůli 1,005 → 1,01. */
export const naHalere = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export type Cena =
  /** `hodnota: null` = pole je prázdné (nevyplněno), ne nula. */
  | { ok: true; hodnota: number | null }
  /** Něco je napsané, ale není to cena — formulář má ukázat chybu, ne tiše uložit nulu. */
  | { ok: false };

/**
 * Cena z textu pole nebo z těla požadavku. Bere českou čárku i tečku a
 * mezery jako oddělovač tisíců („1 234,50"). Prázdné = `null`; záporné,
 * písmena a víc oddělovačů = `ok: false`. Víc než dvě desetinná místa se
 * zaokrouhlí na haléře.
 */
export function cenaZFormulare(raw: unknown): Cena {
  if (raw === null || raw === undefined) return { ok: true, hodnota: null };
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0
      ? { ok: true, hodnota: Math.min(naHalere(raw), MAX_CENA) }
      : { ok: false };
  }
  // Pevná mezera a úzká mezera (Intl v cs-CZ) jako oddělovač tisíců.
  const text = String(raw).replace(/[\s  ]/g, '').replace(',', '.');
  if (text === '') return { ok: true, hodnota: null };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return { ok: false };
  const n = Number(text);
  return Number.isFinite(n) ? { ok: true, hodnota: Math.min(naHalere(n), MAX_CENA) } : { ok: false };
}

/**
 * Cena z databáze. NUMERIC přichází z Neonu jako řetězec („4.99"), INTEGER
 * (sloupec, který ještě nebyl migrován) jako číslo — obojí skončí číslem.
 * `null` zůstává `null`: „cena nevyplněna" není nula.
 */
export function cenaZDb(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? naHalere(n) : null;
}

/**
 * Cena pro sloupec, který ještě mohl zůstat INTEGER (migrace běží při
 * prvním otevření aplikace po nasazení): desetinná cena by u něj skončila
 * chybou a ta se v kódu, který cenu ukládá zvlášť, tiše polyká. Tohle je
 * náhradní hodnota pro druhý pokus — po migraci se nepoužije.
 */
export const naCele = (n: number | null): number | null => (n == null ? null : Math.round(n));

/**
 * Cena tak, jak ji unese sloupec: s haléři, když je sloupec NUMERIC, na celé,
 * dokud je INTEGER. Bez tohohle by desetinná cena u nemigrovaného sloupce
 * skončila chybou databáze („invalid input syntax for type integer").
 */
export function cenaProSloupec(hodnota: number | null, desetinny: boolean): number | null {
  if (hodnota == null) return null;
  return desetinny ? naHalere(hodnota) : Math.round(hodnota);
}

/**
 * Cena do textového pole: 4,5 → „4,50", 49 → „49" (české čárky, haléře jen
 * tam, kde jsou), prázdné pro „nevyplněno". Opak `cenaZFormulare`.
 */
export function cenaDoPole(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '';
  const v = naHalere(Number(n));
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
}

/**
 * Cena položky menu z čehokoli, co přišlo v těle požadavku: haléře zůstanou
 * (4,50 €), nesmysl a záporné je 0 (položka bez ceny), strop proti překlepu.
 * Dřív `Math.round(Number(raw))` — z „4,50" po vyhození nečíslic v editoru
 * vzniklo 450 a přes API se 4,5 zaokrouhlilo na 5.
 */
export function cenaMenu(raw: unknown, max: number): number {
  const c = cenaZFormulare(raw);
  return c.ok && c.hodnota != null ? Math.min(c.hodnota, max) : 0;
}
