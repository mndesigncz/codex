// Přechod z Kartičky, krok „Převzít pravidla věrnosti“ (lib/importKartickaPravidla.ts).
//
// Hlídá, že formulář se předvyplní ze současného profilu, že se na server pošlou jen změněná pole
// a že špatné číslo nebo chybějící odměna zablokuje uložení dřív, než ho server tiše ořízne.

import type { Testy } from './_testy.ts';
import {
  chybaPravidla, formularZProfilu, maChybuPravidel, POLE_PRAVIDEL, RUCNI_PRENOS, telaZmen,
} from '../../lib/importKartickaPravidla.ts';

export default function ({ eq, ok }: Testy) {
  const profil = { stamp_target: 10, stamp_reward: 'Káva zdarma', points_per_100: 5, cashback_pct: 2, birthday_points: 50, referral_points: 0, slug: 'x' };

  // ---- předvyplnění ----
  const f = formularZProfilu(profil);
  eq('předvyplnění: čísla jako text', [f.stamp_target, f.points_per_100, f.cashback_pct, f.birthday_points, f.referral_points], ['10', '5', '2', '50', '0']);
  eq('předvyplnění: odměna', f.stamp_reward, 'Káva zdarma');
  eq('předvyplnění: chybějící hodnota je prázdná', formularZProfilu({}).points_per_100, '');
  eq('předvyplnění: bez profilu nespadne', formularZProfilu(null).stamp_target, '');
  eq('předvyplnění: mají ho všechna pole', Object.keys(f).sort(), POLE_PRAVIDEL.map(p => p.klic).sort());

  // ---- jen změněná pole ----
  eq('beze změny se neposílá nic', telaZmen(f, profil), {});
  eq('změna jednoho pole pošle jen to pole jako číslo', telaZmen({ ...f, cashback_pct: '6' }, profil), { cashback_pct: 6 });
  eq('mezery kolem čísla se ořežou', telaZmen({ ...f, points_per_100: ' 8 ' }, profil), { points_per_100: 8 });
  eq('nula je platná změna (vypnout narozeniny)', telaZmen({ ...f, birthday_points: '0' }, profil), { birthday_points: 0 });
  eq('odměna se posílá jako text', telaZmen({ ...f, stamp_reward: ' Dort ' }, profil), { stamp_reward: 'Dort' });
  eq('vymazané číselné pole se neposílá (server by ho vzal jako 0)', telaZmen({ ...f, referral_points: '' }, { ...profil, referral_points: 20 }), {});
  eq('pole prázdné v profilu a vyplněné se pošle', telaZmen({ ...formularZProfilu({}), referral_points: '25' }, {}), { referral_points: 25 });
  eq('více změn najednou', telaZmen({ ...f, stamp_target: '8', stamp_reward: 'Čaj', birthday_points: '100' }, profil), { stamp_target: 8, stamp_reward: 'Čaj', birthday_points: 100 });

  // ---- kontrola čísel ----
  const def = (k: string) => POLE_PRAVIDEL.find(p => p.klic === k)!;
  eq('předvyplněný formulář je bez chyby', maChybuPravidel(f), false);
  ok('desetinné číslo se odmítne', !!chybaPravidla({ ...f, cashback_pct: '2,5' }, def('cashback_pct')));
  ok('záporné číslo se odmítne', !!chybaPravidla({ ...f, points_per_100: '-1' }, def('points_per_100')));
  ok('cashback nad 50 % se odmítne', !!chybaPravidla({ ...f, cashback_pct: '51' }, def('cashback_pct')));
  eq('cashback 50 % projde', chybaPravidla({ ...f, cashback_pct: '50' }, def('cashback_pct')), null);
  ok('body za pozvání nad 1000 se odmítnou', !!chybaPravidla({ ...f, referral_points: '1001' }, def('referral_points')));
  ok('razítek nad 50 se odmítne', !!chybaPravidla({ ...f, stamp_target: '51' }, def('stamp_target')));
  eq('prázdné číselné pole je v pořádku (nic se neodešle)', chybaPravidla({ ...f, birthday_points: '' }, def('birthday_points')), null);
  ok('karta s razítky bez odměny se odmítne', !!chybaPravidla({ ...f, stamp_reward: '  ' }, def('stamp_reward')));
  eq('bez razítek odměna nevadí prázdná', chybaPravidla({ ...f, stamp_target: '0', stamp_reward: '' }, def('stamp_reward')), null);
  ok('odměna přes 80 znaků se odmítne', !!chybaPravidla({ ...f, stamp_reward: 'x'.repeat(81) }, def('stamp_reward')));
  eq('maChybu najde chybu v kterémkoli poli', maChybuPravidel({ ...f, referral_points: 'abc' }), true);

  // ---- ruční přenos ----
  eq('ruční přenos: bannery, kupony, poukazy, razítka, úrovně', RUCNI_PRENOS.map(r => r.id), ['bannery', 'kupony', 'poukazy', 'razitka', 'urovne']);
  ok('ruční přenos: každý odkaz má pohled a oprávnění', RUCNI_PRENOS.every(r => r.pohled.startsWith('klient:') && r.klice.length > 0));
  ok('ruční přenos: části Věrnosti jsou platné záložky', RUCNI_PRENOS.filter(r => r.cast).every(r => ['coupons', 'vouchers', 'stamps', 'points'].includes(r.cast!)));
}
