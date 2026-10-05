// „S kým mám směnu" (lib/rozvrhPrehled.ts kolegoveKeSmene): kdo se s tebou ten den potká,
// noční směna přes půlnoc, dotyk není překryv, vlastní směna a jiné dny se nepočítají.
import type { Testy } from './_testy.ts';
import { kolegoveKeSmene } from '../../lib/rozvrhPrehled.ts';

export default function ({ eq, ok }: Testy) {
  const D = '2026-10-06';
  const s = (id: number, jmeno: string, od: string, doC: string, x: object = {}) =>
    ({ id, employeeId: id * 10, employeeName: jmeno, employeeAvatar: '🙂', date: D, startTime: od, endTime: doC, ...x });
  const moje = { date: D, startTime: '10:00', endTime: '18:00' };

  const tym = [
    s(1, 'Tomáš', '12:00', '20:00'), s(2, 'Anna', '08:00', '16:00'), s(3, 'Zuzana', '10:00', '18:00'),
    s(4, 'Karel', '18:00', '22:00'),                       // dotyk: končíš, začíná
    s(5, 'Eva', '06:00', '10:00'),                         // dotyk z druhé strany
    s(6, 'Jana', '10:00', '18:00', { date: '2026-10-07' }), // jiný den
    s(7, 'Já', '10:00', '18:00', { isMine: true }),        // vlastní směna
  ];
  const k = kolegoveKeSmene(moje, tym);
  eq('kolegové: jen ti, kdo se překrývají, podle začátku', k.map(x => x.jmeno), ['Anna', 'Zuzana', 'Tomáš']);
  eq('kolegové: dotyk není překryv', k.some(x => x.jmeno === 'Karel' || x.jmeno === 'Eva'), false);
  eq('kolegové: jiný den ani vlastní směna se nepočítají', k.some(x => x.jmeno === 'Jana' || x.jmeno === 'Já'), false);
  eq('kolegové: kolik minut spolu', k.map(x => x.spolu), [360, 480, 360]);
  eq('kolegové: stejný čas na minutu = stejne', k.map(x => x.stejne), [false, true, false]);

  const noc = kolegoveKeSmene({ date: D, startTime: '22:00', endTime: '06:00' }, [s(1, 'Večer', '18:00', '23:00'), s(2, 'Ráno', '05:00', '13:00', { date: D })]);
  eq('kolegové: noční směna se potká s večerní (a s ranní téhož dne ne)', noc.map(x => x.jmeno), ['Večer']);
  eq('kolegové: neplatný čas = nikdo', kolegoveKeSmene({ date: D, startTime: '', endTime: '' }, tym), []);
  eq('kolegové: bez týmu = nikdo', kolegoveKeSmene(moje, []), []);
  eq('kolegové: API s přepisem start_time/end_time', kolegoveKeSmene({ date: D, start_time: '10:00:00', end_time: '18:00:00' }, [s(1, 'Tomáš', '12:00', '20:00')]).length, 1);
  ok('kolegové: bez jména zůstane null (zobrazení doplní „Kolega")', kolegoveKeSmene(moje, [s(1, 'X', '10:00', '12:00', { employeeName: null })])[0]?.jmeno === null);
}
