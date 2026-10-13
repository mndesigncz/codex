// Nárok a zůstatek dovolené (kolo 8, balík R8-3) — čistá logika pro žádost o volno,
// widget Moje volno, Tým a frontu žádostí.
//
// Homebase a Deputy ukazují „earned, used, remaining" přímo ve formuláři žádosti;
// tady je to prostší: nárok ve dnech na kalendářní rok (team_members.vacation_per_year,
// i DPP/DPČ mají od 2024 dovolenou), čerpání = schválené žádosti typu „Dovolená" v tom
// roce (dny mimo rok se nepočítají), zůstatek = nárok − čerpáno. Nemoc a jiné volno se
// neodečítají. Bez nároku (NULL) se nic nekreslí — nula by lhala.

export interface ZadostDovolene {
  fromDate: string;
  toDate: string;
  type?: string | null;
  status?: string | null;
}

export interface NarokDovolene {
  rok: number;
  /** Nárok ve dnech za rok; null = nenastaveno (nic se nekreslí). */
  dni: number | null;
  /** Schválená dovolená v roce (dny). */
  cerpano: number;
  /** Čekající žádosti o dovolenou v roce (dny) — ještě neodečtené, ale „zamluvené". */
  ceka: number;
  /** Zůstatek nárok − čerpáno; null bez nároku. Může být záporný (přečerpáno). */
  zbyva: number | null;
}

const den10 = (v: unknown) => String(v ?? '').slice(0, 10);
const jeDen = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Počet dnů <od, do> ořezaný na kalendářní rok; 0 mimo rok nebo při nesmyslu. */
export function dnuVRoce(od: string, doDne: string, rok: number): number {
  const a0 = den10(od), b0 = den10(doDne) || den10(od);
  if (!jeDen(a0) || !jeDen(b0) || b0 < a0) return 0;
  const zacatek = `${rok}-01-01`, konec = `${rok}-12-31`;
  const a = a0 < zacatek ? zacatek : a0;
  const b = b0 > konec ? konec : b0;
  if (b < a) return 0;
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1;
}

/** Vyčištěný nárok z databáze nebo těla požadavku: null, '' = nenastaveno; 0–366 dní (i půldny). */
export function vycistiNarok(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v) * 2) / 2;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(366, n);
}

/** Nárok, čerpání a zůstatek za rok z žádostí jednoho člověka. */
export function narokDovolene(zadosti: readonly ZadostDovolene[], narok: number | null, rok: number): NarokDovolene {
  let cerpano = 0, ceka = 0;
  for (const z of zadosti) {
    if ((z.type ?? 'vacation') !== 'vacation') continue;
    const d = dnuVRoce(z.fromDate, z.toDate, rok);
    if (z.status === 'approved') cerpano += d;
    else if (z.status === 'pending') ceka += d;
  }
  return { rok, dni: narok, cerpano, ceka, zbyva: narok == null ? null : narok - cerpano };
}

/**
 * Co zbude po schválení žádosti <od, do> typu dovolená: zůstatek − dny v roce nároku.
 * Null bez nároku, u jiného typu volna nebo bez vybraných dnů.
 */
export function zbudePoSchvaleni(n: NarokDovolene | null | undefined, od: string, doDne: string, typ: string = 'vacation'): number | null {
  if (!n || n.zbyva == null || typ !== 'vacation') return null;
  const d = dnuVRoce(od, doDne, n.rok);
  return d > 0 ? n.zbyva - d : null;
}

/** Rok, ke kterému se nárok počítá: rok začátku žádosti, jinak dnešní. */
export function rokNaroku(dnes: string, od?: string | null): number {
  const z = od && jeDen(den10(od)) ? den10(od) : dnes;
  return Number(z.slice(0, 4));
}
