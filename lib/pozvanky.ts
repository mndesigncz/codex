// Pozvánka s rolí a „Poslat znovu" (kolo 6, balík B3) — čistá logika bez databáze.
//
// Dřív šlo pozvat jen „jako zaměstnanec" (výchozí role podniku) nebo „jako vedoucí"
// (Vedení); kdo chtěl Kuchaře, Provozní nebo vlastní roli, musel člověka po přijetí
// ještě upravit. Teď pozvánka nese roli jako úprava člena:
//   - vlastní role → invitations.role_id (role zůstává 'employee', ať starší kód
//     při návratu verze pustí člověka jen do výchozí role, ne výš),
//   - přednastavená role → klíč v invitations.role ('vedeni', 'kuchar'…),
//   - výchozí role podniku → 'employee' (rozhodne se až při přijetí).
// Starý tvar 'employer' znamená Vedení.
//
// Při přijetí se role ověřuje ZNOVU podle dnešního stavu zvoucího (mohl mezitím přijít
// o právo přidělovat role): projde, jen když by ji dnes mohl dát i změnou role člena
// (lib/opravneni.ts → smiPriraditRoli). Jinak pozvánka nepropadne — člověk přijde
// s výchozí rolí podniku. Testy: scripts/testy/k81-nastaveni.ts.

import { smiPriraditRoli, systemovaRole, type TypRole } from './opravneni.ts';

/** Co pozvánka slibuje. */
export type CilPozvanky =
  | { druh: 'vychozi' }
  | { druh: 'system'; klic: string }
  | { druh: 'vlastni'; id: number };

/** Role, jak ji zná přijetí (stejný tvar jako RoleNoveho v app/api/teams/_role.ts). */
export interface RolePozvanky {
  klic: string | null;
  roleId: number | null;
  typ: TypRole;
  nazev: string;
  opravneni: string[];
}

/** Zvoucí, jak ho vidí dnešní stav (roleClena). Null = už v podniku není. */
export interface ZvouciPozvanky {
  jeVlastnik: boolean;
  opravneni: Iterable<string>;
}

/** Řádek invitations → co pozvánka slibuje. Neznámý klíč = výchozí role (radši méně než víc). */
export function cilPozvanky(r: { role?: string | null; role_id?: number | string | null }): CilPozvanky {
  const id = r.role_id == null || r.role_id === '' ? NaN : Number(r.role_id);
  if (Number.isInteger(id) && id > 0) return { druh: 'vlastni', id };
  if (r.role === 'employer') return { druh: 'system', klic: 'vedeni' };
  const s = r.role && r.role !== 'employee' ? systemovaRole(r.role) : null;
  if (s && s.typ !== 'kiosk') return { druh: 'system', klic: s.klic };
  return { druh: 'vychozi' };
}

/** Co zapsat do invitations (role TEXT, role_id) — opak cilPozvanky. */
export function sloupcePozvanky(cil: CilPozvanky): { role: string; role_id: number | null } {
  if (cil.druh === 'vlastni') return { role: 'employee', role_id: cil.id };
  if (cil.druh === 'system') return { role: cil.klic, role_id: null };
  return { role: 'employee', role_id: null };
}

/** Výběr z formuláře / těla POST → co pozvánka slibuje (roleId má přednost, pak roleKlic, pak starý tvar role). */
export function cilZVyberu(b: { roleId?: unknown; roleKlic?: unknown; role?: unknown }): CilPozvanky {
  const id = b.roleId == null || b.roleId === '' ? NaN : Number(b.roleId);
  if (Number.isInteger(id) && id > 0) return { druh: 'vlastni', id };
  if (typeof b.roleKlic === 'string' && b.roleKlic) return { druh: 'system', klic: b.roleKlic };
  if (b.role === 'employer') return { druh: 'system', klic: 'vedeni' };
  return { druh: 'vychozi' };
}

/**
 * Smí zvoucí dát roli? Tablet nikdy (patří jen účtu tabletu); jinak potřebuje `klice`
 * (pozvat, přidělovat role) a stejná pravidla jako změna role člena: nikdo nepřidělí víc,
 * než sám má, a Vedení dává jen vlastník.
 */
export function smiZvouciDatRoli(zvouci: ZvouciPozvanky | null, role: RolePozvanky, klice: string[] = ['tym.pozvat', 'tym.role_prirazovat']): boolean {
  if (!zvouci || role.typ === 'kiosk') return false;
  const ma = new Set(zvouci.opravneni);
  if (!klice.every(k => ma.has(k))) return false;
  return smiPriraditRoli(
    { jeVlastnik: zvouci.jeVlastnik, opravneni: ma },
    { jeVlastnik: false, jeTo: false, soucasna: [], soucasnaKlic: null },
    { opravneni: role.opravneni, klic: role.klic },
  ).ok;
}

/**
 * Role, se kterou člověk z pozvánky přijde: slíbená, když ji zvoucí dnes smí dát
 * (a pořád existuje), jinak výchozí role podniku.
 */
export function roleZPozvanky(slibena: RolePozvanky | null, zvouci: ZvouciPozvanky | null, vychozi: RolePozvanky): RolePozvanky {
  if (slibena && smiZvouciDatRoli(zvouci, slibena)) return slibena;
  return vychozi;
}

/** „Poslat znovu" nejvýš jednou za tolik minut (aby pozvánka nešla použít na zasypání schránky). */
export const ZNOVU_PO_MIN = 10;

/** Kolik celých minut zbývá do dalšího „Poslat znovu" (0 = už jde). Bez času odeslání jde hned. */
export function minutDoZnovu(odeslano: Date | null | undefined, ted: number = Date.now()): number {
  if (!odeslano || Number.isNaN(odeslano.getTime())) return 0;
  const zbyva = odeslano.getTime() + ZNOVU_PO_MIN * 60_000 - ted;
  return zbyva <= 0 ? 0 : Math.ceil(zbyva / 60_000);
}
