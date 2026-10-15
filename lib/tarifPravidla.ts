// Která funkce je v jakém tarifu — čistá pravidla bez databáze (spuštění, balík S).
// Brána je v lib/tarifServer.ts (pozadujTarif), test v k90-bezpecnost-tarif.ts.

import type { PlanId } from './plan.ts';

export type PotrebnyTarif = 'pro' | 'max';

const PORADI: Record<PlanId, number> = { free: 0, pro: 1, max: 2 };

/** Stačí tarif podniku? Pro stačí Pro i Max, Max jen Max. */
export function staciTarifu(ucinny: PlanId, potreba: PotrebnyTarif): boolean {
  return PORADI[ucinny] >= PORADI[potreba];
}

export function hlaskaTarifu(potreba: PotrebnyTarif): string {
  return potreba === 'max'
    ? 'Tahle funkce je v tarifu Max. Odemkneš ji v Nastavení → Předplatné.'
    : 'Tahle funkce je v tarifu Pro. Odemkneš ji v Nastavení → Předplatné.';
}

/**
 * Routy placených funkcí a metody, které tarif vyžadují. Test projde, že
 * každá uvedená metoda v souboru volá pozadujTarif se správným tarifem.
 * Čtení (GET), mazání a obsluha hostů záměrně chybí (viz lib/tarifServer.ts).
 */
export const ROUTY_TARIFU: { soubor: string; metody: string[]; tarif: PotrebnyTarif; funkce: string }[] = [
  // Pro
  { soubor: 'app/api/kiosk/route.ts', metody: ['POST'], tarif: 'pro', funkce: 'Kiosk: přihlášení tabletu' },
  { soubor: 'app/api/attendance/route.ts', metody: ['POST'], tarif: 'pro', funkce: 'Kiosk: píchání na tabletu (jen účet tabletu)' },
  { soubor: 'app/api/rewards/catalog/route.ts', metody: ['POST', 'PATCH'], tarif: 'pro', funkce: 'Odměny: katalog a výdej' },
  { soubor: 'app/api/rewards/challenges/route.ts', metody: ['POST'], tarif: 'pro', funkce: 'Odměny: týmové výzvy' },
  { soubor: 'app/api/share/route.ts', metody: ['PATCH'], tarif: 'pro', funkce: 'Vlastní vzhled sdílených stránek' },
  { soubor: 'app/api/pos/insights/route.ts', metody: ['GET'], tarif: 'pro', funkce: 'Přehledy z pokladny' },
  // Max
  { soubor: 'app/api/pos/route.ts', metody: ['POST'], tarif: 'max', funkce: 'Napojení pokladny Storyous' },
  { soubor: 'app/api/pos/sync/route.ts', metody: ['POST'], tarif: 'max', funkce: 'Ruční synchronizace pokladny' },
  { soubor: 'app/api/inventory/[id]/production/route.ts', metody: ['PUT'], tarif: 'max', funkce: 'Výroba z receptur' },
  { soubor: 'app/api/client/admin/profile/route.ts', metody: ['PUT'], tarif: 'max', funkce: 'Managero client: profil podniku' },
  { soubor: 'app/api/client/admin/body-zdroje/route.ts', metody: ['PUT'], tarif: 'max', funkce: 'Managero client: zdroje bodů' },
  { soubor: 'app/api/client/admin/loyalty/pravidla/route.ts', metody: ['PUT'], tarif: 'max', funkce: 'Managero client: pravidla věrnosti' },
  { soubor: 'app/api/client/admin/loyalty/route.ts', metody: ['POST'], tarif: 'max', funkce: 'Managero client: ruční úprava bodů' },
  { soubor: 'app/api/client/admin/automatizace/route.ts', metody: ['PUT', 'POST'], tarif: 'max', funkce: 'Managero client: automatizace' },
  { soubor: 'app/api/client/admin/banners/route.ts', metody: ['POST', 'PATCH'], tarif: 'max', funkce: 'Managero client: bannery' },
  { soubor: 'app/api/client/admin/bonus-rules/route.ts', metody: ['POST', 'PATCH'], tarif: 'max', funkce: 'Managero client: bonusová pravidla' },
  { soubor: 'app/api/client/admin/broadcast/route.ts', metody: ['POST', 'PATCH'], tarif: 'max', funkce: 'Managero client: zprávy hostům' },
  { soubor: 'app/api/client/admin/coupons/route.ts', metody: ['POST', 'PATCH'], tarif: 'max', funkce: 'Managero client: kupony' },
  { soubor: 'app/api/client/admin/coupons/send/route.ts', metody: ['POST'], tarif: 'max', funkce: 'Managero client: rozeslání kuponů' },
  { soubor: 'app/api/client/admin/customers/bulk/route.ts', metody: ['POST'], tarif: 'max', funkce: 'Managero client: hromadné akce nad členy' },
  { soubor: 'app/api/client/admin/floorplan/route.ts', metody: ['PUT', 'POST'], tarif: 'max', funkce: 'Managero client: plánek stolů' },
  { soubor: 'app/api/client/admin/groups/route.ts', metody: ['POST', 'PATCH'], tarif: 'max', funkce: 'Managero client: skupiny členů' },
  { soubor: 'app/api/client/admin/groups/import/route.ts', metody: ['POST'], tarif: 'max', funkce: 'Managero client: import skupin' },
  { soubor: 'app/api/client/admin/import/route.ts', metody: ['POST'], tarif: 'max', funkce: 'Managero client: import členů' },
  { soubor: 'app/api/client/admin/promos/route.ts', metody: ['POST', 'PATCH'], tarif: 'max', funkce: 'Managero client: akce a nabídky' },
  { soubor: 'app/api/client/admin/stamps/route.ts', metody: ['POST', 'PATCH'], tarif: 'max', funkce: 'Managero client: razítkové kampaně' },
  { soubor: 'app/api/client/admin/tables/route.ts', metody: ['POST', 'PATCH'], tarif: 'max', funkce: 'Managero client: stoly a QR' },
  { soubor: 'app/api/client/admin/vouchers/route.ts', metody: ['POST'], tarif: 'max', funkce: 'Managero client: nové dárkové poukazy' },
];
