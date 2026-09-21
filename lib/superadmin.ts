// Kdo je správce platformy.
//
// Není to pátá role v `users.role`. Čtyři role, které aplikace má, jsou
// všechny UVNITŘ jednoho podniku; správce platformy stojí nad podniky a se
// žádným z nich nemá nic společného. Proto se pozná podle prostředí
// (`SUPERADMIN_USER_IDS`), ne podle sloupce v databázi: sloupec se dá
// přepsat chybou v API, injekcí nebo zálohou ze špatného dne, a nikdo to
// nepozná. Prostředí se mění jen nasazením.
//
// Proč id účtu a ne e-mail: e-mail si při registraci volí kdokoli a nikdo
// ho neověřuje. Kdo zná správcův e-mail a správce se s ním ještě
// nezaregistroval (nebo se registroval jinou velikostí písmen — `users.email`
// je unikátní jen s jejím rozlišením), zaregistruje se jím sám a je
// správce. Vedení podniku navíc umí nastavit kioskovému účtu libovolný
// e-mail. Id účtu si nikdo nevybere a nikdy se nemění.
//
// Tenhle soubor nesmí importovat nic z Node (crypto, next-auth) — čte ho
// i middleware, které běží na edge. Porovnání tokenu je v `adminToken.ts`,
// databáze v `superadminDb.ts`.

/** Id účtů správců z prostředí: oddělené čárkou, mezerou nebo středníkem. */
export function superadminIds(raw: string | undefined = process.env.SUPERADMIN_USER_IDS): number[] {
  return String(raw ?? '')
    .split(/[,\s;]+/)
    .map(x => Number(x.trim()))
    .filter(n => Number.isInteger(n) && n > 0);
}

/** Je tohle id účtu správce platformy? */
export function isSuperadminId(id: unknown, raw?: string): boolean {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return false;
  return superadminIds(raw).includes(n);
}

/**
 * Je tenhle uživatel správce platformy? Čistá část; řádek dodá databáze.
 * Role musí být `employer`: správce je člověk s vlastním účtem, ne tablet
 * ani host — a kdyby se id v prostředí překleplo na cizí kiosk, nesmí z něj
 * být správce.
 */
export function rozhodniSpravce(v: { id: unknown; role: unknown; seznam?: string }): boolean {
  if (v.role !== 'employer') return false;
  return isSuperadminId(v.id, v.seznam);
}
