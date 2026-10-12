// Kolo 7, balík R7-3 (Managero client › Rezervace a Objednávky) — čisté výpočty.
//
// Hlídá se to, co se dřív pokazilo: host mohl dnes v 15:00 rezervovat stůl na 8:00
// (slotsFor nefiltroval podle času a server kontroloval jen den).

import type { Testy } from './_testy.ts';
import { souhrnObjednavek, obdobiHistorie, vyberHistoriiObjednavek, dobaObjednavky, polozkyKratce, MAX_DNI_HISTORIE } from '../../lib/klientPrehled.ts';
import { parseDbTime } from '../../lib/pragueTime.ts';
import { slotsFor, nejdriveDnes, PREDSTIH_REZERVACE_MIN, autoPotvrdit, zpravaHostoviORezervaci, validujRucniRezervaci, vOteviraciDobe } from '../../lib/clientSlots.ts';

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

  // ---- automatické potvrzení (rezervace-automaticke-potvrzeni) ----
  eq('auto: vypnuto (i bez sloupců před migrací) → čeká na vedení', [autoPotvrdit({ auto_confirm: false, auto_confirm_max_party: 0 }, 2), autoPotvrdit({}, 2), autoPotvrdit(null, 2)], [false, false, false]);
  eq('auto: zapnuto bez hranice → všechny velikosti', [autoPotvrdit({ auto_confirm: true, auto_confirm_max_party: 0 }, 1), autoPotvrdit({ auto_confirm: true }, 40)], [true, true]);
  eq('auto: hranice 6 → do 6 osob samo, 7 čeká', [autoPotvrdit({ auto_confirm: true, auto_confirm_max_party: 6 }, 6), autoPotvrdit({ auto_confirm: true, auto_confirm_max_party: '6' }, 7)], [true, false]);
  ok('auto: jen opravdové true (řetězec „false" z formuláře nezapne)', !autoPotvrdit({ auto_confirm: 'false' }, 2));
  const potvrzeni = zpravaHostoviORezervaci('confirmed', '2026-10-12', '18:30:00');
  eq('auto: host dostane stejné „Rezervace potvrzena" jako po ručním potvrzení', [potvrzeni.title, potvrzeni.body, potvrzeni.type], ['Rezervace potvrzena', 'Těšíme se 12. 10. 2026 18:30.', 'success']);
  eq('auto: odmítnutí stejnou funkcí', zpravaHostoviORezervaci('declined', '2026-10-12', '18:30').title, 'Rezervaci se nepodařilo přijmout');

  // ---- ruční zápis (rezervace-rucni-zapis) ----
  const k = { dnes: den, nejpozdeji: '2026-11-09', maxOsob: 8, hodiny };
  const zaklad = { name: '  Pan   Novák ', phone: '+420 777 123 456', date: den, time: '18:30', party: 4 };
  const dobre = validujRucniRezervaci({ ...zaklad, time: '17:45', tableId: '3', note: ' U okna ', customerId: '' }, k);
  eq('ruční: platný zápis — jméno srovnané, stůl číslem, poznámka ořezaná, bez člena', dobre.ok ? dobre.data : dobre,
    { jmeno: 'Pan Novák', telefon: '+420 777 123 456', datum: den, cas: '17:45', osob: 4, stulId: 3, poznamka: 'U okna', hostId: null });
  const chyba = (v: Record<string, unknown>) => { const r = validujRucniRezervaci({ ...zaklad, time: '12:00', ...v }, k); return r.ok ? 'ok' : r.pole; };
  eq('ruční: jméno povinné a nejvýš 80 znaků', [chyba({ name: '   ' }), chyba({ name: 'x'.repeat(81) }), chyba({ name: 'x'.repeat(80) })], ['name', 'name', 'ok']);
  eq('ruční: telefon jen číslice, mezery a + na začátku (nepovinný)', [chyba({ phone: '' }), chyba({ phone: '777 12a 456' }), chyba({ phone: '777+123' }), chyba({ phone: '12' }), chyba({ phone: '1'.repeat(31) })], ['ok', 'phone', 'phone', 'phone', 'phone']);
  eq('ruční: den od dneška do posledního dne rezervací', [chyba({ date: '2026-10-11' }), chyba({ date: '2026-11-09', time: '10:00' }), chyba({ date: '2026-11-10' }), chyba({ date: '12. 10.' })], ['date', 'ok', 'date', 'date']);
  eq('ruční: čas v otevírací době (mimo sloty smí), zavřeno nebo mimo dobu ne', [chyba({ time: '08:00' }), chyba({ time: '17:59' }), chyba({ time: '18:00' }), chyba({ time: '07:59' }), chyba({ date: '2026-10-18' }), chyba({ time: '25:00' })], ['ok', 'ok', 'time', 'time', 'time', 'time']);
  eq('ruční: osoby od 1 do „Nejvíc osob"', [chyba({ party: 0 }), chyba({ party: 1 }), chyba({ party: 8 }), chyba({ party: 9 }), chyba({ party: 2.5 }), chyba({ party: 'x' })], ['party', 'ok', 'ok', 'party', 'party', 'party']);
  eq('ruční: stůl a člen kladné číslo, poznámka nejvýš 300 znaků', [chyba({ tableId: -1 }), chyba({ customerId: 'x' }), chyba({ note: 'x'.repeat(301) }), chyba({ customerId: 42 })], ['tableId', 'customerId', 'note', 'ok']);
  // ---- historie objednávek od stolu (objednavky-historie-trzba) ----
  const obj = [
    { castka: 412.5, stav: 'done' }, { castka: 190, stav: 'done' }, { castka: 95, stav: 'declined' }, { castka: 230, stav: 'confirmed' }, { castka: 145, stav: 'new' },
  ];
  eq('objednávky: počet všech, součet a průměr jen z hotových, nepřijaté zvlášť', souhrnObjednavek(obj), { pocet: 5, soucet: 602.5, prumer: 301.25, neprijato: 1, hotovych: 2 });
  eq('objednávky: prázdné období — nuly a průměr bez čísla (ne 0)', souhrnObjednavek([]), { pocet: 0, soucet: 0, prumer: null, neprijato: 0, hotovych: 0 });
  eq('objednávky: jen nepřijaté — součet 0, průměr null', souhrnObjednavek([{ castka: 95, stav: 'declined' }]), { pocet: 1, soucet: 0, prumer: null, neprijato: 1, hotovych: 0 });
  eq('objednávky: haléře se sčítají bez plovoucího šumu', souhrnObjednavek([{ castka: 0.1, stav: 'done' }, { castka: 0.2, stav: 'done' }]).soucet, 0.3);
  eq('období: bez parametrů dnešek, obrácené pořadí se prohodí, jen „od" = jeden den', [obdobiHistorie(null, null, den), obdobiHistorie('2026-10-12', '2026-10-01', den), obdobiHistorie('2026-10-05', '', den)],
    [{ od: den, do: den }, { od: '2026-10-01', do: '2026-10-12' }, { od: '2026-10-05', do: '2026-10-05' }]);
  ok(`období: nejvýš ${MAX_DNI_HISTORIE} dní, nesmysl je chyba`, 'chyba' in obdobiHistorie('2026-01-01', '2026-10-12', den) && 'chyba' in obdobiHistorie('12. 10.', null, den)
    && !('chyba' in obdobiHistorie('2026-07-13', '2026-10-12', den)));
  const h = vyberHistoriiObjednavek({ orders: [
    { id: 86, createdAt: '2026-09-26 13:05:00', updatedAt: '2026-09-26 13:31:00', total: 412.5, status: 'done', tableName: 'Velký stůl', customerName: 'Jana', polozky: [{ nazev: 'Snídaně', pocet: 3 }, { nazev: '', pocet: 1 }] },
    { id: 87, createdAt: '2026-09-26 15:10:00', updatedAt: '2026-09-26 15:13:00', total: 230, status: 'confirmed', tableName: null, customerName: null, polozky: [] },
    { id: 88, createdAt: '2026-09-26 16:42:00', updatedAt: '2026-09-26 16:42:00', total: 145, status: 'nesmysl' },
  ] });
  eq('historie: bez souhrnu z API se spočítá ze seznamu; host bez jména „Host", prázdné položky pryč, neznámý stav = nová',
    [h.souhrn.soucet, h.objednavky[1].host, h.objednavky[0].polozky.length, h.objednavky[2].stav, h.celkem], [412.5, 'Host', 1, 'new', 3]);
  eq('historie: doba — přijato za 3 min, hotovo za 26 min, nová bez doby', h.objednavky.map(o => dobaObjednavky(o, parseDbTime)), [{ co: 'hotovo', minut: 26 }, { co: 'prijato', minut: 3 }, null]);
  eq('historie: položky zkráceně', polozkyKratce([{ nazev: 'Matcha latte', pocet: 2 }, { nazev: 'Sencha', pocet: 1 }]), '2× Matcha latte, 1× Sencha');
  let spadlo = false;
  try { vyberHistoriiObjednavek({ error: 'x' }); } catch { spadlo = true; }
  ok('historie: nečekaný tvar je chyba (ErrorState), ne „žádné objednávky"', spadlo);

  ok('ruční: otevírací doba přes půlnoc (18:00–02:00)', vOteviraciDobe({ '0': { open: '18:00', close: '02:00' } }, den, '01:30') && !vOteviraciDobe({ '0': { open: '18:00', close: '02:00' } }, den, '03:00'));
}
