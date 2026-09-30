// Scény a role ukázky: co znamená ?scena= a ?role= a kam se v skutečné
// aplikaci přeloží (?view= pohled, který layout už zná z hlubokých odkazů
// z oznámení). Žádná nová navigace: ukázka jen posílá aplikaci stejný
// odkaz, jaký by jí poslalo oznámení.
//
// Nová scéna = jeden řádek v SCENY (a případně handlery v lib/demo/routy,
// když potřebuje data, která ukázka ještě nezná). Viz lib/demo/README.md.

export type RoleDema = 'vedeni' | 'zamestnanec' | 'kiosk';

export const ROLE_DEMA: readonly RoleDema[] = ['vedeni', 'zamestnanec', 'kiosk'];

export interface Scena {
  /** Role, ve které scéna začíná, když ?role= není zadané. */
  vychoziRole: RoleDema;
  /** Pohled (?view=) podle role. Chybí-li role, otevře se přehled (domů). */
  pohled: Partial<Record<RoleDema, string>>;
  /** Krátký popis pro prodejní stránku a sondu. */
  popis: string;
}

export const SCENY = {
  prehled: {
    vychoziRole: 'vedeni',
    pohled: {},
    popis: 'Přehled: co se dnes děje v podniku',
  },
  rozvrh: {
    vychoziRole: 'vedeni',
    pohled: { vedeni: 'shifts', zamestnanec: 'my-shifts' },
    popis: 'Rozvrh: generátor navrhne směny a vedení je zveřejní',
  },
  uzaverka: {
    vychoziRole: 'zamestnanec',
    pohled: { vedeni: 'reports', zamestnanec: 'closing' },
    popis: 'Uzávěrka: zamčená, dokud se nesplní povinné věci',
  },
  sklad: {
    vychoziRole: 'vedeni',
    pohled: { vedeni: 'inventory', zamestnanec: 'inventory' },
    popis: 'Sklad: co dochází a co dokoupit',
  },
  ukoly: {
    vychoziRole: 'vedeni',
    pohled: { vedeni: 'tasks', zamestnanec: 'tasks' },
    popis: 'Úkoly: zadané, splněné, po termínu',
  },
  tym: {
    vychoziRole: 'vedeni',
    pohled: { vedeni: 'team-settings' },
    popis: 'Tým: lidé, role a oprávnění',
  },
  kiosk: {
    vychoziRole: 'kiosk',
    pohled: {},
    popis: 'Tablet u baru: kdo je na směně a co je potřeba udělat',
  },
} as const satisfies Record<string, Scena>;

export type IdScenyDema = keyof typeof SCENY;

export const ID_SCEN = Object.keys(SCENY) as IdScenyDema[];

export function jeScena(v: unknown): v is IdScenyDema {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SCENY, v);
}

export function jeRole(v: unknown): v is RoleDema {
  return typeof v === 'string' && (ROLE_DEMA as readonly string[]).includes(v);
}

export interface NastaveniDema {
  scena: IdScenyDema;
  role: RoleDema;
  /** ?rezim=okno: bez zbytečného chromu (postranní panel), jen obsah. */
  okno: boolean;
}

/** Přečte ?scena=, ?role= a ?rezim= z adresy; neznámé hodnoty spadnou na přehled a jeho roli. */
export function nastaveniZAdresy(search: string): NastaveniDema {
  const q = new URLSearchParams(search);
  const s = q.get('scena');
  const scena: IdScenyDema = jeScena(s) ? s : 'prehled';
  const r = q.get('role');
  const role: RoleDema = jeRole(r) ? r : SCENY[scena].vychoziRole;
  return { scena, role, okno: q.get('rezim') === 'okno' };
}

/** Pohled aplikace (`?view=`) pro scénu v dané roli, nebo null = přehled. */
export function pohledScenyProRoli(scena: IdScenyDema, role: RoleDema): string | null {
  const p: Partial<Record<RoleDema, string>> = SCENY[scena].pohled;
  return p[role] ?? null;
}
