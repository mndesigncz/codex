// Kolo 8, balík R8-5 (Uzávěrky, receptury a poznámky) — jednotkové testy čisté logiky.
//
// Výplata z kasy s výběrem člověka (lib/closing): pohyb „payout" nese userId, ostatní druhy ne;
// rozpis uzávěrky po lidech (vyplatyZKasyUzaverky) je to, z čeho Výplaty (GET /api/payroll)
// odečítají „už vyplaceno z kasy" — uzávěrka bez rozpisu patří autorovi jako v R8-1.

import type { Testy } from './_testy.ts';
import { normalizeMovements, vyplatyZKasyUzaverky, vyplatyICizim, sumMovements } from '../../lib/closing.ts';

export default function ({ eq, ok }: Testy) {
  // ---- pohyby: komu se vyplácelo ----
  const pohyby = normalizeMovements([
    { kind: 'payout', amount: 1200, userId: 7, userName: ' Petr Novák ' },
    { kind: 'payout', amount: '800', note: 'záloha' },
    { kind: 'expense', amount: 150, userId: 7, userName: 'Petr', note: 'mléko' },
    { kind: 'payout', amount: 0, userId: 9 },
    { kind: 'payout', amount: 500, userId: 'x', userName: '' },
  ]);
  eq('normalizeMovements: userId a jméno jen u výplaty, nula se zahodí, nečíselné id pryč',
    pohyby,
    [
      { kind: 'payout', amount: 1200, note: undefined, userId: 7, userName: 'Petr Novák' },
      { kind: 'payout', amount: 800, note: 'záloha' },
      { kind: 'expense', amount: 150, note: 'mléko' },
      { kind: 'payout', amount: 500, note: undefined },
    ]);
  eq('normalizeMovements: jméno nejvýš 80 znaků', normalizeMovements([{ kind: 'payout', amount: 1, userId: 1, userName: 'a'.repeat(100) }])[0].userName?.length, 80);
  eq('sumMovements: výplaty se sčítají bez ohledu na příjemce', sumMovements(pohyby, 'payout'), 2500);

  // ---- rozpis po lidech ----
  eq('vyplaty: bez pohybů patří self_payout autorovi', vyplatyZKasyUzaverky({ created_by: 16, self_payout: 900, movements: [] }), [{ userId: 16, castka: 900 }]);
  eq('vyplaty: nula bez pohybů = nic', vyplatyZKasyUzaverky({ created_by: 16, self_payout: 0 }), []);
  eq('vyplaty: pohyby rozepíšou po lidech, bez userId autor, stejný člověk se sečte',
    vyplatyZKasyUzaverky({ created_by: 16, self_payout: 2500, movements: pohyby }),
    [{ userId: 7, castka: 1200, jmeno: 'Petr Novák' }, { userId: 16, castka: 1300, jmeno: undefined }]);
  eq('vyplaty: s pohyby se self_payout nebere (součet je v pohybech)',
    vyplatyZKasyUzaverky({ created_by: 16, self_payout: 99999, movements: [{ kind: 'payout', amount: 300, userId: 7 }] }), [{ userId: 7, castka: 300, jmeno: undefined }]);
  ok('vyplatyICizim: jen autor → ne', !vyplatyICizim({ created_by: 16, self_payout: 500, movements: [{ kind: 'payout', amount: 500, userId: 16 }] }));
  ok('vyplatyICizim: kolega → ano', vyplatyICizim({ created_by: 16, self_payout: 500, movements: [{ kind: 'payout', amount: 500, userId: 7 }] }));
  // Výplatní listina (R8-1) sčítá po `user_id`, ne po autorovi: 1 200 Petrovi, 1 300 Evě.
  const listina = new Map<number, number>();
  for (const v of vyplatyZKasyUzaverky({ created_by: 16, self_payout: 2500, movements: pohyby })) listina.set(v.userId, (listina.get(v.userId) ?? 0) + v.castka);
  eq('listina: Petr 1 200, Eva 1 300, dohromady self_payout', [listina.get(7), listina.get(16), [...listina.values()].reduce((a, b) => a + b, 0)], [1200, 1300, 2500]);
}
