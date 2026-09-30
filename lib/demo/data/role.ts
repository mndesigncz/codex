// Přednastavené role (oprávnění) zkopírované z fixtur sond (roles.json).
// Ukázka podle nich skládá navigaci a oprávnění stejně jako skutečný server:
// vedení vidí všechno, barista svoje, tablet jen to, co smí sdílené zařízení.
import data from './role.json';

export interface RoleKatalog {
  klic: string; nazev: string; popis: string; typ: 'vedeni' | 'zamestnanec' | 'kiosk'; opravneni: string[];
}

export const KATALOG_ROLI = data as unknown as { system: RoleKatalog[] };
