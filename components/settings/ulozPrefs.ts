// Uložení osobních předvoleb na účet (users.notif_prefs, viz lib/nastaveniUcet.ts).
// Vyhodí chybu, když server odmítl, ať ji volající ukáže a vrátí přepínač zpět:
// dřív se uložení nekontrolovalo a přepínač lhal, že platí, co se nezapsalo.
import { okJson } from '@/lib/api';

export async function ulozPrefsUctu(notifPrefs: Record<string, unknown>): Promise<void> {
  const r = await fetch('/api/account', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notifPrefs }),
  });
  await okJson(r);
}
