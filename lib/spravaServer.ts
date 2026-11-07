// Kdo je přihlášený ve správě platformy — pro layout správy i bránu API.
//
// Tři podmínky, všechny pokaždé: požadavek přišel na host správy
// (lib/spravaHost), nese platnou cookie relace správy (lib/spravaRelace)
// a účet je podle DATABÁZE správce (id v SUPERADMIN_USER_IDS + role vedení,
// lib/superadminDb). Vyškrtnutí z prostředí nebo ztráta role tak platí hned,
// ne až po vypršení cookie.

import { jeAdminHost } from '@/lib/spravaHost';
import { COOKIE_RELACE, cookieZHlavicky, over, tajemstviSpravy } from '@/lib/spravaRelace';
import { jeSpravcePodleDb } from '@/lib/superadminDb';
import { emailUctu } from '@/lib/spravaDb';

export interface Spravce { userId: number; email: string }

export async function spravceZPozadavku(v: { cookie: string | null | undefined; host: string | null | undefined }): Promise<Spravce | null> {
  if (!jeAdminHost(v.host)) return null;
  const userId = over('relace', cookieZHlavicky(v.cookie, COOKIE_RELACE), tajemstviSpravy());
  if (!userId) return null;
  if (!(await jeSpravcePodleDb(userId))) return null;
  return { userId, email: await emailUctu(userId) };
}

export { hostPozadavku } from '@/lib/spravaHost';
