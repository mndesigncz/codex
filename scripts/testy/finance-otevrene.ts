// Otevřené účty (rozpracovaná tržba): výběr z /api/pos/daily (`open`) a doba otevřenosti.
import type { Testy } from './_testy.ts';
import { jeOtevrenyUcet, vyberOtevrene, vyberDenniPokladnu, minutOtevrenosti, DLOUHO_OTEVRENY_MIN } from '../../lib/financeWidgety.ts';

export default function ({ eq, ok }: Testy) {
  eq('otevřené: starší odpověď bez `open` = žádné účty', vyberOtevrene(undefined), { pocet: 0, soucet: 0, nejstarsi: null, poDnech: {}, ucty: [] });
  eq('otevřené: nesmysl = žádné účty', vyberOtevrene('x').pocet, 0);
  const o = vyberOtevrene({
    count: 2, total: 1350, oldestSince: '2026-10-06T10:00:00.000Z', byDay: { '2026-10-06': { count: 2, total: 1350 } },
    items: [{ id: 'a', desk: '7', since: '2026-10-06T10:00:00.000Z', total: 900, persons: 3, who: 'Eva', day: '2026-10-06' },
            { id: 'b', desk: null, since: '2026-10-06T11:30:00.000Z', total: 450, persons: null, who: '', day: '2026-10-06' }],
  });
  eq('otevřené: počet a součet', [o.pocet, o.soucet], [2, 1350]);
  eq('otevřené: účet bez stolu a bez hostů', [o.ucty[1].stul, o.ucty[1].hoste, o.ucty[1].kdo], [null, null, null]);
  eq('otevřené: po dnech', o.poDnech['2026-10-06'], { pocet: 2, soucet: 1350 });
  eq('otevřené: stůl a host', [o.ucty[0].stul, o.ucty[0].hoste, o.ucty[0].kdo], ['7', 3, 'Eva']);

  const d = vyberDenniPokladnu({ connected: true, totals: { total: 100 }, days: [], open: { count: 1, total: 50, items: [] } });
  eq('otevřené: součástí odpovědi pokladny', d.otevrene.pocet, 1);
  eq('otevřené: odpověď bez `open` má prázdné otevřené', vyberDenniPokladnu({ connected: true, totals: {} }).otevrene.pocet, 0);

  const t0 = Date.parse('2026-10-06T12:00:00.000Z');
  eq('doba: 45 minut', minutOtevrenosti('2026-10-06T11:15:00.000Z', t0), 45);
  eq('doba: budoucí čas = 0', minutOtevrenosti('2026-10-06T13:00:00.000Z', t0), 0);
  eq('doba: neplatný čas = 0', minutOtevrenosti('nesmysl', t0), 0);
  ok('doba: práh „dlouho otevřený" jsou dvě hodiny', DLOUHO_OTEVRENY_MIN === 120);

  // Co je otevřený účet: nezaplacený, nevyúčtovaný, s částkou; vrácený, smazaný a uzavřený ne.
  eq('otevřený účet: bez paid_at, bez fiskalizace, s částkou = ano', jeOtevrenyUcet({ paidAt: null, fiscalized: false, finalPrice: 250 }), true);
  eq('otevřený účet: zaplacený (má paid_at) = ne', jeOtevrenyUcet({ paidAt: '2026-10-06T10:00:00Z', fiscalized: true, finalPrice: 250 }), false);
  eq('otevřený účet: bez paid_at, ale fiskalizovaný = uzavřený, ne', jeOtevrenyUcet({ paidAt: null, fiscalized: true, finalPrice: 250 }), false);
  eq('otevřený účet: nulová částka = ne', jeOtevrenyUcet({ paidAt: null, fiscalized: false, finalPrice: 0 }), false);
  eq('otevřený účet: vrácený a smazaný = ne', [jeOtevrenyUcet({ paidAt: null, refunded: true, finalPrice: 90 }), jeOtevrenyUcet({ paidAt: null, deleted: true, finalPrice: 90 })], [false, false]);
}
