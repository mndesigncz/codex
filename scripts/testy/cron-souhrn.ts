// Souhrn běhu cronu do logu (lib/cronSouhrn.ts): jen čísla a ano/ne, selhání se pozná a jde jako chyba.
import type { Testy } from './_testy.ts';
import { cistySouhrn, behSelhal, radekCronu, zapisBehCronu } from '../../lib/cronSouhrn.ts';

export default function ({ eq, ok }: Testy) {
  // Záloha vrací i `problems` se jmény podniků a texty chyb — do logu nesmí.
  eq('cron: do souhrnu jen čísla a ano/ne', cistySouhrn({ ok: true, teams: 3, emailedTo: 5, failed: 0, problems: ['Bistro: chyba'], email: 'a@b.cz', den: '2026-10-31' }), { ok: true, teams: 3, emailedTo: 5, failed: 0 });
  eq('cron: NaN a nekonečno vypadnou', cistySouhrn({ a: Number.NaN, b: Infinity, c: 2 }), { c: 2 });
  eq('cron: prázdný vstup nespadne', cistySouhrn(undefined as unknown as Record<string, unknown>), {});

  eq('cron: úspěšný běh není selhání', behSelhal({ ok: true, sent: 4, chyby: 0, nestihnuto: 0 }), false);
  eq('cron: ok:false je selhání', behSelhal({ ok: false }), true);
  eq('cron: nestihnuté podniky jsou selhání', behSelhal({ ok: true, nestihnuto: 2 }), true);
  eq('cron: selhaný krok migrace je selhání', behSelhal({ ok: true, migFails: 1 }), true);
  eq('cron: selhaná pokladna podniku je selhání', behSelhal({ ok: true, teams: 3, selhalo: 1 }), true);
  eq('cron: dorovnání předplatných bez chyb není selhání', behSelhal({ checked: 12, reset: 1 }), false);

  eq('cron: tvar řádku', radekCronu('billing/cron', { checked: 2, reset: 0 }), 'cron billing/cron: {"checked":2,"reset":0}');

  // Úspěch jde do console.log, selhání do console.error (ať ho ukáže přehled chyb Vercelu).
  const puvodniLog = console.log, puvodniError = console.error;
  const zapsano: string[] = [];
  console.log = (...a: unknown[]) => { zapsano.push(`log ${a.join(' ')}`); };
  console.error = (...a: unknown[]) => { zapsano.push(`error ${a.join(' ')}`); };
  try {
    zapisBehCronu('pos/cron', { ok: true, teams: 2, selhalo: 0, nestihnuto: 0 });
    zapisBehCronu('pos/cron', { ok: true, teams: 2, selhalo: 1, nestihnuto: 0 });
  } finally {
    console.log = puvodniLog; console.error = puvodniError;
  }
  eq('cron: úspěch jako log, selhání jako error', zapsano.map(z => z.split(' ')[0]), ['log', 'error']);
  ok('cron: řádek nese název cronu', zapsano.every(z => z.includes('cron pos/cron: ')));
}
