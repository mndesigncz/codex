// Nastavení organizace — co si majitel řetězce zvolí sám.
//
// Martin: „ať to umí vždy obojí, člověk si to nastaví v nastavení". Tohle je
// ten tvar. Čistá logika bez databáze, ať se dá testovat; chování, které
// z nastavení plyne (sdílení lidí, konsolidovaný přehled, jedna faktura),
// přibývá po kolech a každé se ptá sem.

export type Fakturace = 'per_team' | 'per_org';

export interface NastaveniOrganizace {
  /** Zaměstnanec může být členem víc podniků a přepínat mezi nimi. */
  sdileniLidi: boolean;
  /** Vedení vidí tržby a mzdy všech podniků na jedné obrazovce. */
  konsolidovanyPrehled: boolean;
  /** Sdílené číselníky: kategorie skladu, receptury, návody. */
  sdileneCiselniky: boolean;
  /** Jedna faktura za organizaci, nebo každý podnik zvlášť. */
  fakturace: Fakturace;
}

export const VYCHOZI_NASTAVENI: NastaveniOrganizace = {
  sdileniLidi: true,
  konsolidovanyPrehled: true,
  sdileneCiselniky: false,
  fakturace: 'per_team',
};

/** Cokoli z databáze nebo z klienta → vždy úplný, platný tvar. */
export function normalizujNastaveni(raw: unknown): NastaveniOrganizace {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    sdileniLidi: bool(r.sdileniLidi, VYCHOZI_NASTAVENI.sdileniLidi),
    konsolidovanyPrehled: bool(r.konsolidovanyPrehled, VYCHOZI_NASTAVENI.konsolidovanyPrehled),
    sdileneCiselniky: bool(r.sdileneCiselniky, VYCHOZI_NASTAVENI.sdileneCiselniky),
    fakturace: r.fakturace === 'per_org' ? 'per_org' : 'per_team',
  };
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
