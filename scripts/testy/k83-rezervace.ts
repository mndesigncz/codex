// Kolo 7, balík R7-3 (Managero client › Rezervace a Objednávky) — čisté výpočty.
//
// Hlídá se to, co se dřív pokazilo: host mohl dnes v 15:00 rezervovat stůl na 8:00
// (slotsFor nefiltroval podle času a server kontroloval jen den).

import type { Testy } from './_testy.ts';
import { slotsFor, nejdriveDnes, PREDSTIH_REZERVACE_MIN } from '../../lib/clientSlots.ts';

export default function ({ eq, ok }: Testy) {
  // ---- sloty v minulosti (rezervace-slot-v-minulosti) ----
  // 2026-10-12 je pondělí → klíč "0".
  const hodiny = { '0': { open: '08:00', close: '18:00' }, '6': { closed: true } };
  const den = '2026-10-12';
  const vse = slotsFor(hodiny, den, 30);
  eq('sloty: bez „nejdřív" celý den od otevření po zavření minus hodina', [vse[0], vse.at(-1), vse.length], ['08:00', '17:00', 19]);
  eq('sloty: předstih je 30 minut', PREDSTIH_REZERVACE_MIN, 30);
  const odpoledne = slotsFor(hodiny, den, 30, nejdriveDnes('15:00'));
  ok('sloty: dnes v 15:00 se nenabídne 8:00 ani 15:00', !odpoledne.includes('08:00') && !odpoledne.includes('15:00'));
  eq('sloty: dnes v 15:00 až od 15:30', odpoledne[0], '15:30');
  eq('sloty: hranice — čas přesně na předstihu se nabídne (14:30 → 15:00)', slotsFor(hodiny, den, 30, nejdriveDnes('14:30'))[0], '15:00');
  eq('sloty: o minutu později už ne (14:31 → 15:30)', slotsFor(hodiny, den, 30, nejdriveDnes('14:31'))[0], '15:30');
  eq('sloty: po poslední možné době nic nezbývá (16:45)', slotsFor(hodiny, den, 30, nejdriveDnes('16:45')), []);
  eq('sloty: večer přes půlnoc „24:00" — dnes už nic', [nejdriveDnes('23:45'), slotsFor(hodiny, den, 30, nejdriveDnes('23:45'))], ['24:00', []]);
  eq('sloty: jiný den beze změny (volající „nejdřív" nedá)', slotsFor(hodiny, '2026-10-13', 30), slotsFor(hodiny, '2026-10-13', 30, undefined));
  eq('sloty: ráno před otevřením celý den', slotsFor(hodiny, den, 30, nejdriveDnes('06:10')), vse);
  eq('sloty: zavřený den nic', slotsFor(hodiny, '2026-10-18', 30, nejdriveDnes('06:00')), []);
  eq('sloty: nečitelné „teď" nic neschová', nejdriveDnes('x'), '00:00');
}
