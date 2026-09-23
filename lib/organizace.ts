// Nastavení organizace — co si majitel řetězce zvolí sám.
//
// Martin: „ať to umí vždy obojí, člověk si to nastaví v nastavení". Tohle je
// ten tvar. Čistá logika bez databáze, ať se dá testovat; chování, které
// z nastavení plyne (sdílení lidí, konsolidovaný přehled, jedna faktura),
// přibývá po kolech a každé se ptá sem.

export type Fakturace = 'per_team' | 'per_org';

/**
 * Číselníky, které organizace umí sdílet (kolo 60). Každý má v nastavení
 * ZDROJOVÝ podnik: ten číselník spravuje, ostatní podniky organizace jeho
 * řádky čtou vedle svých. Není to vypínač po řádcích a není to kopie —
 * řádek dál patří svému podniku, sdílení je jen ve čtení.
 *
 * Proč zrovna těchhle pět a ne návody, postupy nebo receptury: ty ukazují
 * id-čkem na sklad nebo kasu JEDNOHO podniku, takže by sdílený řádek
 * v druhém podniku odkazoval do prázdna. Ty potřebují kopii, ne sdílení.
 */
export type Ciselnik = 'kategorieSkladu' | 'dodavatele' | 'typySmen' | 'kategorieNavodu' | 'odmeny';
export const CISELNIKY: { klic: Ciselnik; nazev: string; hint: string }[] = [
  { klic: 'kategorieSkladu', nazev: 'Kategorie skladu', hint: 'strom kategorií včetně balení a předvyplnění' },
  { klic: 'dodavatele', nazev: 'Dodavatelé', hint: 'včetně e-mailu a telefonu' },
  { klic: 'typySmen', nazev: 'Typy směn', hint: 'časy se překládají podle otevírací doby každého podniku' },
  { klic: 'kategorieNavodu', nazev: 'Kategorie návodů', hint: 'jen kategorie, návody samotné zůstávají v podniku' },
  { klic: 'odmeny', nazev: 'Katalog odměn', hint: 'body se sbírají v podniku, kde člověk pracuje' },
];
export type ZdrojeCiselniku = Record<Ciselnik, number | null>;

export interface NastaveniOrganizace {
  /** Zaměstnanec může být členem víc podniků a přepínat mezi nimi. */
  sdileniLidi: boolean;
  /** Vedení vidí tržby a mzdy všech podniků na jedné obrazovce. */
  konsolidovanyPrehled: boolean;
  /** Hlavní vypínač sdílených číselníků; bez něj se zdroje ignorují. */
  sdileneCiselniky: boolean;
  /** Který podnik číselník spravuje; null = každý podnik zvlášť. */
  zdrojeCiselniku: ZdrojeCiselniku;
  /** Jedna faktura za organizaci, nebo každý podnik zvlášť. */
  fakturace: Fakturace;
}

export const VYCHOZI_NASTAVENI: NastaveniOrganizace = {
  sdileniLidi: true,
  konsolidovanyPrehled: true,
  sdileneCiselniky: false,
  zdrojeCiselniku: { kategorieSkladu: null, dodavatele: null, typySmen: null, kategorieNavodu: null, odmeny: null },
  fakturace: 'per_team',
};

/** Id podniku, nebo null. Řetězce, desetinná čísla a nuly neprojdou. */
const idNeboNull = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);

/** Mapa zdrojů z čehokoli → vždy všech pět klíčů, neznámé zahozené. */
export function normalizujZdroje(raw: unknown): ZdrojeCiselniku {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...VYCHOZI_NASTAVENI.zdrojeCiselniku };
  for (const c of CISELNIKY) out[c.klic] = idNeboNull(r[c.klic]);
  return out;
}

/** Cokoli z databáze nebo z klienta → vždy úplný, platný tvar. */
export function normalizujNastaveni(raw: unknown): NastaveniOrganizace {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    sdileniLidi: bool(r.sdileniLidi, VYCHOZI_NASTAVENI.sdileniLidi),
    konsolidovanyPrehled: bool(r.konsolidovanyPrehled, VYCHOZI_NASTAVENI.konsolidovanyPrehled),
    sdileneCiselniky: bool(r.sdileneCiselniky, VYCHOZI_NASTAVENI.sdileneCiselniky),
    zdrojeCiselniku: normalizujZdroje(r.zdrojeCiselniku),
    fakturace: r.fakturace === 'per_org' ? 'per_org' : 'per_team',
  };
}

/**
 * Podniky, jejichž řádky daného číselníku aktivní podnik čte. Vždy sebe;
 * zdroj navíc jen když organizace sdílí, zdroj je jiný podnik a je v TÉŽE
 * organizaci. Poslední podmínka není formalita: podnik, který z organizace
 * odešel, by jinak přes starou hodnotu v nastavení dál četl cizí data.
 * Pořadí [já, zdroj] je záměrné — vlastní řádky se řadí první.
 */
export function tymyProCiselnik(
  teamId: number,
  org: { nastaveni: NastaveniOrganizace; teamIds: number[] } | null,
  ciselnik: Ciselnik,
): number[] {
  if (!org || !org.nastaveni.sdileneCiselniky) return [teamId];
  const zdroj = org.nastaveni.zdrojeCiselniku[ciselnik];
  if (zdroj == null || zdroj === teamId || !org.teamIds.includes(zdroj)) return [teamId];
  return [teamId, zdroj];
}

/** Zdroje z klienta: jen podniky organizace, cokoli jiného → null. PATCH je nikdy nepřijme naslepo. */
export function ocistiZdroje(raw: unknown, teamIds: number[]): ZdrojeCiselniku {
  const z = normalizujZdroje(raw);
  for (const c of CISELNIKY) if (z[c.klic] != null && !teamIds.includes(z[c.klic]!)) z[c.klic] = null;
  return z;
}

/** Který podnik daný číselník právě sdílí do ostatních (null = nikdo). */
function aktivniZdroj(n: NastaveniOrganizace, c: Ciselnik): number | null {
  return n.sdileneCiselniky ? n.zdrojeCiselniku[c] : null;
}

/**
 * Co změna nastavení VYPÍNÁ: číselníky, jejichž dosavadní zdroj přestává
 * platit (hlavní vypínač OFF, zdroj → null, nebo zdroj A → C). Pro každý se
 * podnikům zkopíruje, co z něj používaly — řádky nesmí zmizet zpod dat.
 */
export function coSeVypina(stare: NastaveniOrganizace, nove: NastaveniOrganizace): { ciselnik: Ciselnik; zdroj: number }[] {
  const out: { ciselnik: Ciselnik; zdroj: number }[] = [];
  for (const c of CISELNIKY) {
    const byl = aktivniZdroj(stare, c.klic);
    const bude = aktivniZdroj(nove, c.klic);
    if (byl != null && byl !== bude) out.push({ ciselnik: c.klic, zdroj: byl });
  }
  return out;
}

/** Co změna ZAPÍNÁ: číselníky, které dostávají (nový) zdroj — kopie z dřívějšího sdílení se k němu zpátky sloučí. */
export function coSeSlucuje(stare: NastaveniOrganizace, nove: NastaveniOrganizace): { ciselnik: Ciselnik; zdroj: number }[] {
  const out: { ciselnik: Ciselnik; zdroj: number }[] = [];
  for (const c of CISELNIKY) {
    const byl = aktivniZdroj(stare, c.klic);
    const bude = aktivniZdroj(nove, c.klic);
    if (bude != null && bude !== byl) out.push({ ciselnik: c.klic, zdroj: bude });
  }
  return out;
}

export type RoleClenstvi = 'employer' | 'employee';

/** Role v členství — jen dvě; tablet ani host členy nejsou. */
export function normalizujRoli(v: unknown): RoleClenstvi {
  return v === 'employer' ? 'employer' : 'employee';
}

export interface Clenstvi { teamId: number; role: RoleClenstvi; teamName: string; organizationId: number | null }

/**
 * Smí uživatel přepnout na tenhle podnik? Jen tam, kde je členem. Vedení
 * organizace nemá automatický vstup do podniku, kde členem není — to by byl
 * tichý superadmin; když tam chce, přidá se jako člen a je to vidět.
 */
export function smiPrepnout(clenstvi: Clenstvi[], teamId: number): Clenstvi | null {
  return clenstvi.find(c => c.teamId === teamId) ?? null;
}

/** Přidat zaměstnance do dalšího podniku smí jen organizace, která to má zapnuté. */
export function smiSdiletZamestnance(nastaveni: NastaveniOrganizace, role: RoleClenstvi): boolean {
  return role === 'employer' || nastaveni.sdileniLidi;
}
